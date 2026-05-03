/**
 * Panel Server
 * 管理面板服务器 - 提供管理面板的 Web 服务和 API
 */

const express = require('express');
const path = require('path');
const ServerManager = require('./server-manager');

const app = express();
const PANEL_PORT = 3002;

// 初始化服务器管理器
const serverManager = new ServerManager();

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'admin-panel')));

// API 路由

/**
 * 获取服务器状态
 */
app.get('/api/server/status', (req, res) => {
  const status = serverManager.getStatus();
  res.json(status);
});

/**
 * 启动服务器
 */
app.post('/api/server/start', async (req, res) => {
  try {
    const result = await serverManager.start();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 停止服务器
 */
app.post('/api/server/stop', async (req, res) => {
  try {
    const result = await serverManager.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 获取配置
 */
app.get('/api/config', (req, res) => {
  const config = serverManager.getConfig();
  res.json(config);
});

/**
 * 保存配置
 */
app.post('/api/config', (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body;
    const result = serverManager.setConfig({ DEEPSEEK_API_KEY: apiKey, DEEPSEEK_API_URL: apiUrl });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 获取日志
 */
app.get('/api/logs', (req, res) => {
  const logs = serverManager.getLogs(100);
  res.json(logs);
});

/**
 * 获取小说提取状态
 */
app.get('/api/admin/extract-status', (req, res) => {
  const status = serverManager.getExtractionStatus();
  res.json(status);
});

/**
 * 启动小说提取
 */
app.post('/api/admin/extract-novel', async (req, res) => {
  try {
    const result = await serverManager.runNovelExtraction();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 停止小说提取
 */
app.post('/api/admin/extract-stop', async (req, res) => {
  try {
    const result = await serverManager.stopExtraction();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 重试失败章节
 */
app.post('/api/admin/retry-failed', async (req, res) => {
  try {
    const result = await serverManager.runNovelExtraction(true);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 获取提取日志（流式）
 */
app.get('/api/admin/extract-logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const logCallback = (log) => {
    res.write(`data: ${JSON.stringify({ log })}\n\n`);
  };

  serverManager.onExtractionLog(logCallback);

  req.on('close', () => {
    // Remove callback on disconnect
    const index = serverManager.extractionLogCallbacks.indexOf(logCallback);
    if (index > -1) {
      serverManager.extractionLogCallbacks.splice(index, 1);
    }
  });
});

/**
 * 获取所有小说
 */
app.get('/api/novels', (req, res) => {
  const novels = serverManager.getNovels();
  const active = serverManager.getActiveNovel();
  res.json({
    novels,
    activeNovelId: active ? active.id : null
  });
});

/**
 * 获取激活的小说
 */
app.get('/api/novels/active', (req, res) => {
  const active = serverManager.getActiveNovel();
  res.json(active);
});

/**
 * 设置激活的小说
 */
app.post('/api/novels/active', (req, res) => {
  const { novelId } = req.body;
  const result = serverManager.setActiveNovel(novelId);
  res.json(result);
});

/**
 * 添加小说
 */
app.post('/api/novels', (req, res) => {
  const { novelFilePath, novelId } = req.body;
  const result = serverManager.addNovel(novelFilePath, novelId);
  res.json(result);
});

/**
 * 删除小说
 */
app.delete('/api/novels/:novelId', (req, res) => {
  const { novelId } = req.params;
  const result = serverManager.deleteNovel(novelId);
  res.json(result);
});

/**
 * 获取角色重要性排名
 */
app.get('/api/novels/:novelId/character-ranking', (req, res) => {
  const { novelId } = req.params;
  const fs = require('fs');
  const path = require('path');
  
  const rankingPath = path.join(__dirname, 'data/novels', novelId, 'character_importance_ranking.json');
  
  if (!fs.existsSync(rankingPath)) {
    return res.status(404).json({ 
      error: '角色排名不存在',
      message: '请先运行角色排名脚本'
    });
  }
  
  try {
    const ranking = JSON.parse(fs.readFileSync(rankingPath, 'utf8'));
    res.json(ranking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 生成角色重要性排名
 */
app.post('/api/novels/:novelId/generate-character-ranking', async (req, res) => {
  const { novelId } = req.params;
  const fs = require('fs');
  const path = require('path');
  
  try {
    // 检查必要文件是否存在
    const characterCachePath = path.join(__dirname, 'data/novels', novelId, 'character_attributes_cache.json');
    const eventsPath = path.join(__dirname, 'data/novels', novelId, 'events.json');
    const relationshipsPath = path.join(__dirname, 'data/novels', novelId, 'relationships.json');
    
    if (!fs.existsSync(characterCachePath)) {
      return res.status(400).json({ 
        error: '角色缓存不存在',
        message: '请先提取小说数据'
      });
    }
    
    // 读取数据
    const characterCache = JSON.parse(fs.readFileSync(characterCachePath, 'utf8'));
    const characters = Object.values(characterCache);
    
    let events = [];
    if (fs.existsSync(eventsPath)) {
      const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
      events = eventsData.events || [];
    }
    
    let relationships = {};
    if (fs.existsSync(relationshipsPath)) {
      const relationshipsData = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
      relationships = relationshipsData.relationships || {};
    }
    
    // 计算角色重要性分数
    const characterScores = characters.map(char => {
      let score = 0;
      
      // 根据境界加分
      if (char.realm && typeof char.realm === 'string') {
        if (char.realm.includes('仙')) score += 100;
        else if (char.realm.includes('九转')) score += 90;
        else if (char.realm.includes('八转')) score += 80;
        else if (char.realm.includes('七转')) score += 70;
        else if (char.realm.includes('六转')) score += 60;
        else if (char.realm.includes('五转')) score += 50;
        else if (char.realm.includes('四转')) score += 40;
        else if (char.realm.includes('三转')) score += 30;
        else if (char.realm.includes('二转')) score += 20;
        else if (char.realm.includes('一转')) score += 10;
      }
      
      // 根据描述长度加分
      if (char.description) {
        score += Math.min(char.description.length / 10, 50);
      }
      
      // 根据事件出现次数加分
      const eventCount = events.filter(e => 
        e.participants && e.participants.includes(char.name)
      ).length;
      score += eventCount * 2;
      
      // 根据关系数量加分
      if (relationships[char.name]) {
        score += relationships[char.name].length * 3;
      }
      
      // 特殊角色加分（可根据需要配置）
      const specialCharacters = []; // 默认为空，可手动添加特殊角色名
      if (specialCharacters.includes(char.name)) {
        score += 200;
      }
      
      return {
        name: char.name,
        realm: char.realm,
        description: char.description,
        score: Math.round(score)
      };
    });
    
    // 按分数排序
    characterScores.sort((a, b) => b.score - a.score);
    
    // 保存排名结果
    const rankingPath = path.join(__dirname, 'data/novels', novelId, 'character_importance_ranking.json');
    const output = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      totalCharacters: characters.length,
      rankings: characterScores
    };
    fs.writeFileSync(rankingPath, JSON.stringify(output, null, 2));
    
    res.json({
      success: true,
      message: '角色排名生成成功',
      totalCharacters: characters.length
    });
  } catch (error) {
    console.error('GENERATE_CHARACTER_RANKING', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 重新生成故事框架（代理到主服务器）
 */
app.post('/api/story-framework/regenerate', async (req, res) => {
  try {
    // 检查主服务器是否运行
    const status = serverManager.getStatus();
    if (!status.running) {
      return res.status(400).json({ 
        error: '主服务器未运行',
        message: '请先启动主服务器'
      });
    }

    console.log('[Panel Server] Proxying framework regeneration to main server');
    console.log('[Panel Server] Request body:', JSON.stringify(req.body));

    // 代理请求到主服务器
    const response = await fetch(`${status.url}/api/story-framework/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    console.log('[Panel Server] Main server response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Panel Server] Main server error:', errorText);
      try {
        const errorJson = JSON.parse(errorText);
        return res.status(response.status).json(errorJson);
      } catch (e) {
        return res.status(response.status).json({ error: errorText });
      }
    }

    const data = await response.json();
    console.log('[Panel Server] Framework regeneration success');
    res.json(data);
  } catch (error) {
    console.error('[Panel Server] FRAMEWORK_REGENERATE_PROXY error:', error);
    res.status(500).json({ error: error.message || '未知错误' });
  }
});

/**
 * 获取故事框架（代理到主服务器）
 */
app.get('/api/novels/:novelId/framework', async (req, res) => {
  try {
    const { novelId } = req.params;
    
    // 检查主服务器是否运行
    const status = serverManager.getStatus();
    if (!status.running) {
      return res.status(400).json({ 
        error: '主服务器未运行',
        message: '请先启动主服务器'
      });
    }

    // 代理请求到主服务器
    const response = await fetch(`${status.url}/api/novels/${novelId}/framework`);
    
    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('FRAMEWORK_GET_PROXY', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'panel-server' });
});

// 启动面板服务器
app.listen(PANEL_PORT, () => {
  console.log(`[Panel Server] Control panel running at http://localhost:${PANEL_PORT}`);
  console.log('[Panel Server] Opening browser...');
  
  // 自动打开浏览器
  const { exec } = require('child_process');
  const url = `http://localhost:${PANEL_PORT}`;
  
  switch (process.platform) {
    case 'darwin':
      exec(`open ${url}`);
      break;
    case 'win32':
      exec(`start ${url}`);
      break;
    default:
      exec(`xdg-open ${url}`);
  }
  
  // Log current server status for debugging
  const status = serverManager.getStatus();
  console.log('[Panel Server] Current server status:', status);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('[Panel Server] Shutting down...');
  
  // 停止 InkSoul / 墨魂 服务器
  if (serverManager.isRunning) {
    await serverManager.stop();
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Panel Server] Shutting down...');
  
  if (serverManager.isRunning) {
    await serverManager.stop();
  }
  
  process.exit(0);
});
