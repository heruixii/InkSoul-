/**
 * Admin Panel JavaScript
 * 管理面板前端逻辑
 */

const SERVER_MANAGER_PORT = 3002;
const SERVER_MANAGER_URL = `http://localhost:${SERVER_MANAGER_PORT}`;
const MAIN_SERVER_URL = `http://localhost:3000`;

let serverStatus = 'stopped';
let logInterval = null;
let extractionStatus = 'idle';
let extractionEventSource = null;
let currentNovelId = null;
let novels = {};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadNovels();
  checkExtractionStatus();
  checkServerStatus();
  setInterval(checkServerStatus, 5000);
  setInterval(checkExtractionStatus, 10000);
});

/**
 * 切换标签页
 */
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab content
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Add active class to selected tab button
  event.target.classList.add('active');
}

/**
 * 检查小说提取状态
 */
async function checkExtractionStatus() {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/admin/extract-status`);
    const status = await response.json();
    
    updateExtractionUI(status);
  } catch (error) {
    console.error('提取状态检查失败:', error);
  }
}

/**
 * 更新提取 UI
 */
function updateExtractionUI(status) {
  const badge = document.getElementById('extractionStatusBadge');
  const charCount = document.getElementById('charCount');
  const eventCount = document.getElementById('eventCount');
  const worldbookCount = document.getElementById('worldbookCount');
  const startBtn = document.getElementById('startExtractionBtn');
  const stopBtn = document.getElementById('stopExtractionBtn');
  
  if (status.extracted) {
    badge.className = 'status-badge running';
    badge.textContent = '已提取';
    charCount.textContent = status.stats.characters || '-';
    eventCount.textContent = status.stats.events || '-';
    worldbookCount.textContent = status.stats.worldbook || '-';
    startBtn.disabled = true;
    stopBtn.disabled = true;
  } else {
    badge.className = 'status-badge stopped';
    badge.textContent = '未提取';
    charCount.textContent = '-';
    eventCount.textContent = '-';
    worldbookCount.textContent = '-';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

/**
 * 开始提取小说
 */
async function startExtraction() {
  const startBtn = document.getElementById('startExtractionBtn');
  const badge = document.getElementById('extractionStatusBadge');
  
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="btn-icon">⏳</span> 提取中...';
  badge.className = 'status-badge starting';
  badge.textContent = '提取中';
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/admin/extract-novel`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      addExtractionLog('提取任务已启动', 'info');
      startExtractionLogStream();
      document.getElementById('stopExtractionBtn').disabled = false;
    } else {
      addExtractionLog(`提取启动失败: ${result.message}`, 'error');
      startBtn.disabled = false;
      startBtn.innerHTML = '<span class="btn-icon">▶</span> 开始提取小说';
      badge.className = 'status-badge stopped';
      badge.textContent = '启动失败';
    }
  } catch (error) {
    addExtractionLog(`提取请求失败: ${error.message}`, 'error');
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> 开始提取小说';
    badge.className = 'status-badge stopped';
    badge.textContent = '请求失败';
  }
}

/**
 * 重试失败章节
 */
async function retryFailedChapters() {
  const retryBtn = document.getElementById('retryFailedBtn');
  const badge = document.getElementById('extractionStatusBadge');
  
  retryBtn.disabled = true;
  retryBtn.innerHTML = '<span class="btn-icon">⏳</span> 重试中...';
  badge.className = 'status-badge starting';
  badge.textContent = '重试中';
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/admin/retry-failed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      addExtractionLog('重试失败章节任务已启动', 'info');
      startExtractionLogStream();
      document.getElementById('stopExtractionBtn').disabled = false;
    } else {
      addExtractionLog(`重试启动失败: ${result.message}`, 'error');
      retryBtn.disabled = false;
      retryBtn.innerHTML = '<span class="btn-icon">🔄</span> 重试失败章节';
      badge.className = 'status-badge stopped';
      badge.textContent = '启动失败';
    }
  } catch (error) {
    addExtractionLog(`重试请求失败: ${error.message} (服务器可能未启动，端口: ${SERVER_MANAGER_PORT})`, 'error');
    retryBtn.disabled = false;
    retryBtn.innerHTML = '<span class="btn-icon">🔄</span> 重试失败章节';
    badge.className = 'status-badge stopped';
    badge.textContent = '请求失败';
  }
}

/**
 * 停止提取
 */
async function stopExtraction() {
  const stopBtn = document.getElementById('stopExtractionBtn');
  
  stopBtn.disabled = true;
  stopBtn.innerHTML = '<span class="btn-icon">⏳</span> 停止中...';
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/admin/extract-stop`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      addExtractionLog('提取已停止', 'info');
      stopExtractionLogStream();
    } else {
      addExtractionLog(`停止失败: ${result.message}`, 'error');
    }
  } catch (error) {
    addExtractionLog(`停止请求失败: ${error.message}`, 'error');
  }
  
  stopBtn.disabled = false;
  stopBtn.innerHTML = '<span class="btn-icon">⏹</span> 停止提取';
  
  // Reset start button
  const startBtn = document.getElementById('startExtractionBtn');
  startBtn.disabled = false;
  startBtn.innerHTML = '<span class="btn-icon">▶</span> 开始提取小说';
  
  const badge = document.getElementById('extractionStatusBadge');
  badge.className = 'status-badge stopped';
  badge.textContent = '已停止';
}

/**
 * 启动提取日志流
 */
function startExtractionLogStream() {
  if (extractionEventSource) {
    extractionEventSource.close();
  }
  
  extractionEventSource = new EventSource(`${SERVER_MANAGER_URL}/api/admin/extract-logs`);
  
  extractionEventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    addExtractionLog(data.log, 'info');
  };
  
  extractionEventSource.onerror = (error) => {
    console.error('日志流错误:', error);
    extractionEventSource.close();
  };
}

/**
 * 停止提取日志流
 */
function stopExtractionLogStream() {
  if (extractionEventSource) {
    extractionEventSource.close();
    extractionEventSource = null;
  }
}

/**
 * 添加提取日志
 */
function addExtractionLog(message, type = 'info') {
  const logContent = document.getElementById('extractionLogContent');
  const timestamp = new Date().toLocaleTimeString();
  const className = type === 'error' ? 'log-error' : 
                    type === 'warn' ? 'log-warn' : 'log-info';
  
  const logEntry = document.createElement('div');
  logEntry.className = className;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logContent.appendChild(logEntry);
  logContent.scrollTop = logContent.scrollHeight;
}

/**
 * 清空提取日志
 */
function clearExtractionLogs() {
  document.getElementById('extractionLogContent').innerHTML = '';
}

/**
 * 加载小说列表
 */
async function loadNovels() {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/novels`);
    const data = await response.json();
    
    novels = data.novels || {};
    currentNovelId = data.activeNovelId;
    
    updateNovelSelector();
  } catch (error) {
    console.error('Failed to load novels:', error);
  }
}

/**
 * 更新小说选择器
 */
function updateNovelSelector() {
  const select = document.getElementById('novelSelect');
  select.innerHTML = '';
  
  // 过滤掉以_开头的模板项
  const novelIds = Object.keys(novels).filter(id => !id.startsWith('_'));
  
  if (novelIds.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无小说，请添加';
    select.appendChild(option);
    document.getElementById('deleteNovelBtn').disabled = true;
    return;
  }
  
  novelIds.forEach(id => {
    const novel = novels[id];
    const option = document.createElement('option');
    option.value = id;
    option.textContent = novel.name;
    option.selected = id === currentNovelId;
    select.appendChild(option);
  });
  
  document.getElementById('deleteNovelBtn').disabled = !currentNovelId;
}

/**
 * 选择小说
 */
async function selectNovel() {
  const select = document.getElementById('novelSelect');
  const novelId = select.value;
  
  if (!novelId) return;
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/novels/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId })
    });
    const result = await response.json();
    
    if (result.success) {
      currentNovelId = novelId;
      document.getElementById('deleteNovelBtn').disabled = false;
      // 移除自动检查提取状态，避免延迟
      // checkExtractionStatus() 已通过定时器定期调用
    } else {
      alert(`切换失败: ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to select novel:', error);
    alert('切换失败');
  }
}

/**
 * 刷新小说列表
 */
async function refreshNovels() {
  await loadNovels();
  checkExtractionStatus();
}

/**
 * 显示添加小说对话框
 */
function showAddNovelDialog() {
  const novelFilePath = prompt('请输入小说文件路径（相对或绝对路径）:');
  if (!novelFilePath) return;
  
  const novelId = prompt('请输入小说ID（可选，留空自动生成）:') || null;
  
  addNovel(novelFilePath, novelId);
}

/**
 * 添加小说
 */
async function addNovel(novelFilePath, novelId) {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/novels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelFilePath, novelId })
    });
    const result = await response.json();
    
    if (result.success) {
      alert('小说添加成功');
      await loadNovels();
      
      // Auto-select the new novel
      if (result.novelId) {
        const select = document.getElementById('novelSelect');
        select.value = result.novelId;
        selectNovel();
      }
    } else {
      alert(`添加失败: ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to add novel:', error);
    alert('添加失败');
  }
}

/**
 * 删除小说
 */
async function deleteNovel() {
  if (!currentNovelId) return;
  
  const novel = novels[currentNovelId];
  if (!confirm(`确定要删除小说"${novel.name}"吗？\n这将删除该小说的所有数据，无法恢复。`)) {
    return;
  }
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/novels/${currentNovelId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      alert('小说删除成功');
      currentNovelId = null;
      await loadNovels();
      checkExtractionStatus();
    } else {
      alert(`删除失败: ${result.message}`);
    }
  } catch (error) {
    console.error('Failed to delete novel:', error);
    alert('删除失败');
  }
}

/**
 * 启动服务器
 */
async function startServer() {
  const startBtn = document.getElementById('startBtn');
  const statusBadge = document.getElementById('statusBadge');
  
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="btn-icon">⏳</span> 启动中...';
  statusBadge.className = 'status-badge starting';
  statusBadge.textContent = '启动中';
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/server/start`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      addLog('服务器启动成功', 'info');
      checkServerStatus();
    } else {
      addLog(`服务器启动失败: ${result.message}`, 'error');
    }
  } catch (error) {
    addLog(`启动请求失败: ${error.message}`, 'error');
  }
  
  startBtn.disabled = false;
  startBtn.innerHTML = '<span class="btn-icon">▶</span> 启动服务器';
}

/**
 * 停止服务器
 */
async function stopServer() {
  const stopBtn = document.getElementById('stopBtn');
  
  stopBtn.disabled = true;
  stopBtn.innerHTML = '<span class="btn-icon">⏳</span> 停止中...';
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/server/stop`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (result.success) {
      addLog('服务器已停止', 'info');
      checkServerStatus();
    } else {
      addLog(`停止失败: ${result.message}`, 'error');
    }
  } catch (error) {
    addLog(`停止请求失败: ${error.message}`, 'error');
  }
  
  stopBtn.disabled = false;
  stopBtn.innerHTML = '<span class="btn-icon">⏹</span> 停止服务器';
}

/**
 * 检查服务器状态
 */
async function checkServerStatus() {
  try {
    // 直接检查主服务器状态（端口3000）
    const response = await fetch('http://localhost:3000/api/settings');
    const isRunning = response.ok;
    console.log('Main server status:', isRunning ? 'running' : 'stopped');
    updateStatusUI(isRunning);
  } catch (error) {
    console.error('状态检查失败:', error);
    updateStatusUI(false);
  }
}

/**
 * 更新状态 UI
 */
function updateStatusUI(running) {
  const statusBadge = document.getElementById('statusBadge');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const openStoryBtn = document.getElementById('openStoryBtn');
  
  if (running) {
    statusBadge.className = 'status-badge running';
    statusBadge.textContent = '运行中';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    openStoryBtn.disabled = false;
  } else {
    statusBadge.className = 'status-badge stopped';
    statusBadge.textContent = '已停止';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    openStoryBtn.disabled = true;
  }
  
  serverStatus = running ? 'running' : 'stopped';
}

/**
 * 打开故事
 */
function openStory() {
  window.open('http://localhost:3000', '_blank');
}

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/config`);
    const config = await response.json();
    
    document.getElementById('apiKey').value = config.apiKey || '';
    document.getElementById('apiUrl').value = config.apiUrl || 'https://api.deepseek.com/v1/chat/completions';
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

/**
 * 保存配置
 */
async function saveConfig() {
  const apiKey = document.getElementById('apiKey').value;
  const apiUrl = document.getElementById('apiUrl').value;
  
  if (!apiKey) {
    alert('请输入 DeepSeek API Key');
    return;
  }
  
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, apiUrl })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('配置已保存');
      addLog('配置已更新', 'info');
    } else {
      alert(`保存失败: ${result.message}`);
    }
  } catch (error) {
    alert(`保存失败: ${error.message}`);
  }
}

/**
 * 切换 API Key 可见性
 */
function toggleApiKeyVisibility() {
  const apiKeyInput = document.getElementById('apiKey');
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
}

/**
 * 获取日志
 */
async function fetchLogs() {
  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/logs`);
    const logs = await response.json();
    
    const logContent = document.getElementById('logContent');
    logContent.innerHTML = logs.map(log => {
      const className = log.includes('ERROR') ? 'log-error' : 
                        log.includes('WARN') ? 'log-warn' : 'log-info';
      return `<div class="${className}">${escapeHtml(log)}</div>`;
    }).join('');
    
    // 滚动到底部
    logContent.scrollTop = logContent.scrollHeight;
  } catch (error) {
    console.error('获取日志失败:', error);
  }
}

/**
 * 清空日志
 */
function clearLogs() {
  document.getElementById('logContent').innerHTML = '';
}

/**
 * 添加日志
 */
function addLog(message, type = 'info') {
  const logContent = document.getElementById('logContent');
  const timestamp = new Date().toLocaleTimeString();
  const className = type === 'error' ? 'log-error' : 
                    type === 'warn' ? 'log-warn' : 'log-info';
  
  const logEntry = document.createElement('div');
  logEntry.className = className;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logContent.appendChild(logEntry);
  logContent.scrollTop = logContent.scrollHeight;
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 切换主角档案编辑器显示
 */
function toggleProtagonistEditor() {
  const editor = document.getElementById('protagonistEditor');
  editor.style.display = editor.style.display === 'none' ? 'block' : 'none';
}

/**
 * 打开用户手册
 */
function openUserManual() {
  window.open('../docs/小白使用教程.md', '_blank');
}

/**
 * 生成故事框架
 */
async function generateFramework() {
  if (!currentNovelId) {
    alert('请先选择小说');
    return;
  }

  // Get form values
  const protagonist = document.getElementById('frameworkProtagonist').value.trim();
  const startChapter = parseInt(document.getElementById('frameworkStartChapter').value);
  const maxChapters = parseInt(document.getElementById('frameworkMaxChapters').value);
  const focusCharacters = document.getElementById('frameworkFocusCharacters').value.trim();
  const playerInfluence = document.getElementById('frameworkPlayerInfluence').value;
  const interactionMode = document.getElementById('frameworkInteractionMode').value;
  const branches = document.getElementById('frameworkBranches').checked;

  // Get custom protagonist fields
  const protagonistProfile = {
    birth: document.getElementById('protagonistBirth').value.trim(),
    age: document.getElementById('protagonistAge').value.trim(),
    gender: document.getElementById('protagonistGender').value.trim(),
    startingRealm: document.getElementById('protagonistStartingRealm').value.trim(),
    startingLocation: document.getElementById('protagonistStartingLocation').value.trim(),
    cultivationPath: document.getElementById('protagonistCultivationPath').value.trim(),
    background: document.getElementById('protagonistBackground').value.trim(),
    family: document.getElementById('protagonistFamily').value.trim(),
    personality: document.getElementById('protagonistPersonality').value.trim(),
    goals: document.getElementById('protagonistGoals').value.trim(),
    specialAbilities: document.getElementById('protagonistSpecialAbilities').value.trim()
  };

  // Validation
  if (!protagonist) {
    alert('请输入主角名称');
    return;
  }
  if (isNaN(startChapter) || startChapter < 1) {
    alert('起点章节必须大于0');
    return;
  }
  if (isNaN(maxChapters) || maxChapters < 1 || maxChapters > 1000) {
    alert('生成章节数必须在1-1000之间');
    return;
  }

  const generateBtn = document.getElementById('generateFrameworkBtn');
  const progressSection = document.getElementById('frameworkProgress');
  const progressBar = document.getElementById('frameworkProgressBar');
  const statusText = document.getElementById('frameworkStatus');
  const resultSection = document.getElementById('frameworkResult');

  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="btn-icon">⏳</span> 生成中...';
  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  progressBar.style.width = '0%';
  statusText.textContent = '正在生成故事框架...';

  // Prepare parameters
  const params = {
    protagonist,
    startChapter,
    maxChapters,
    focusCharacters,
    playerInfluence,
    interactionMode,
    branches,
    protagonistProfile
  };

  if (focusCharacters) {
    params.focusCharacters = focusCharacters.split(',').map(c => c.trim()).filter(c => c);
  }

  try {
    const response = await fetch(`${SERVER_MANAGER_URL}/api/story-framework/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const result = await response.json();

    if (result.success) {
      progressBar.style.width = '100%';
      statusText.textContent = '生成完成！';
      
      // Show result
      resultSection.style.display = 'block';
      const content = document.getElementById('frameworkContent');
      content.innerHTML = `
        <p><strong>版本:</strong> ${result.framework.version}</p>
        <p><strong>生成时间:</strong> ${result.framework.generatedAt}</p>
        <p><strong>主角:</strong> ${result.framework.protagonist.name}</p>
        <p><strong>章节数:</strong> ${result.framework.statistics.totalChapters}</p>
        <p><strong>事件数:</strong> ${result.framework.statistics.totalEvents}</p>
        <p><strong>锚点数:</strong> ${result.framework.statistics.totalAnchors}</p>
        <p><strong>分支点:</strong> ${result.framework.statistics.branchPoints}</p>
        ${result.storyId ? `<p style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-radius: 4px;">
          <strong>✓ 故事已创建</strong><br>
          <a href="http://localhost:5173/story/play/${result.storyId}" target="_blank" style="color: #1976d2; text-decoration: underline;">打开故事</a>
        </p>` : ''}
      `;
      
      addExtractionLog('故事框架生成成功', 'info');
    } else {
      statusText.textContent = `生成失败: ${result.message}`;
      statusText.className = 'progress-status error';
      addExtractionLog(`框架生成失败: ${result.message}`, 'error');
    }
  } catch (error) {
    statusText.textContent = `请求失败: ${error.message}`;
    statusText.className = 'progress-status error';
    addExtractionLog(`框架生成请求失败: ${error.message}`, 'error');
  }

  generateBtn.disabled = false;
  generateBtn.innerHTML = '<span class="btn-icon">🎨</span> 生成故事框架';
}

/**
 * 查看已有框架列表
 */
async function listFrameworks() {
  if (!currentNovelId) {
    alert('请先选择小说');
    return;
  }

  try {
    const response = await fetch(`${MAIN_SERVER_URL}/api/story-framework/list`);
    
    if (!response.ok) {
      throw new Error(`获取框架列表失败 (HTTP ${response.status})`);
    }

    const frameworks = await response.json();
    
    const resultSection = document.getElementById('frameworkResult');
    const content = document.getElementById('frameworkContent');
    
    if (frameworks.length === 0) {
      resultSection.style.display = 'block';
      content.innerHTML = '<p>暂无框架</p>';
      return;
    }
    
    let html = '<h3>可用框架列表</h3><ul>';
    frameworks.forEach(fw => {
      html += `
        <li style="margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 5px;">
          <strong>${fw.protagonist_name}</strong>
          <br><small>生成时间: ${fw.generated_at || '未知'}</small>
          <br>
          <button onclick="viewFrameworkByName('${fw.protagonist_name}')" style="margin-top: 5px; padding: 5px 10px; cursor: pointer;">查看</button>
          <button onclick="createStoryFromFramework('${fw.protagonist_name}')" style="margin-top: 5px; padding: 5px 10px; cursor: pointer;">创建故事</button>
          <button onclick="deleteFramework('${fw.protagonist_name}')" style="margin-top: 5px; padding: 5px 10px; cursor: pointer; background: #ff4444; color: white; border: none; border-radius: 3px;">删除</button>
        </li>
      `;
    });
    html += '</ul>';
    
    resultSection.style.display = 'block';
    content.innerHTML = html;
  } catch (error) {
    console.error('List frameworks error:', error);
    alert(`获取框架列表失败: ${error.message}`);
  }
}

/**
 * 根据主角名称查看框架
 */
async function viewFrameworkByName(protagonistName) {
  if (!currentNovelId) {
    alert('请先选择小说');
    return;
  }

  const resultSection = document.getElementById('frameworkResult');
  const content = document.getElementById('frameworkContent');

  try {
    const response = await fetch(`${MAIN_SERVER_URL}/api/story-framework/list`);
    
    if (!response.ok) {
      throw new Error(`获取框架列表失败 (HTTP ${response.status})`);
    }

    const frameworks = await response.json();
    const framework = frameworks.find(fw => fw.protagonist_name === protagonistName);
    
    if (!framework) {
      throw new Error(`找不到主角 ${protagonistName} 的框架`);
    }
    
    // 读取框架文件内容（使用框架列表中的路径）
    const frameworkResponse = await fetch(`${MAIN_SERVER_URL}/api/story-framework/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protagonist_name: protagonistName })
    });
    
    if (!frameworkResponse.ok) {
      throw new Error(`读取框架失败 (HTTP ${frameworkResponse.status})`);
    }

    const frameworkData = await frameworkResponse.json();

    resultSection.style.display = 'block';
    content.innerHTML = `
      <p><strong>版本:</strong> ${frameworkData.version}</p>
      <p><strong>生成时间:</strong> ${frameworkData.generatedAt}</p>
      <p><strong>主角:</strong> ${frameworkData.protagonist.name}</p>
      <p><strong>类型:</strong> ${frameworkData.protagonist.type}</p>
      <p><strong>起点章节:</strong> ${frameworkData.settings.startChapter}</p>
      <p><strong>结束章节:</strong> ${frameworkData.settings.endChapter}</p>
      <p><strong>章节数:</strong> ${frameworkData.statistics.totalChapters}</p>
      <p><strong>事件数:</strong> ${frameworkData.statistics.totalEvents}</p>
      <p><strong>锚点数:</strong> ${frameworkData.statistics.totalAnchors}</p>
      <p><strong>分支点:</strong> ${frameworkData.statistics.branchPoints}</p>
      <div style="margin-top: 15px;">
        <button onclick="createStoryFromFramework('${protagonistName}')" style="padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">从此框架创建故事</button>
      </div>
    `;
  } catch (error) {
    console.error('View framework error:', error);
    content.innerHTML = `<p style="color: red;">查看框架失败: ${error.message}</p>`;
  }
}

/**
 * 从指定框架创建故事
 */
async function createStoryFromFramework(protagonistName) {
  try {
    const response = await fetch(`${MAIN_SERVER_URL}/api/story-framework/create-story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protagonist_name: protagonistName })
    });

    const result = await response.json();

    if (result.success) {
      alert(`故事创建成功！\n故事ID: ${result.storyId}`);
      const content = document.getElementById('frameworkContent');
      content.innerHTML += `<p style="color: green; margin-top: 10px;">故事创建成功！ID: ${result.storyId}</p>`;
    } else {
      alert(`故事创建失败: ${result.error || '未知错误'}`);
    }
  } catch (error) {
    console.error('Create story error:', error);
    alert(`故事创建失败: ${error.message}`);
  }
}

/**
 * 查看已有框架（旧版本，保留兼容）
 */
async function viewFramework() {
  if (!currentNovelId) {
    alert('请先选择小说');
    return;
  }

  // 使用新的框架列表功能
  await listFrameworks();
}

/**
 * 删除指定框架
 */
async function deleteFramework(protagonistName) {
  if (!confirm(`确定要删除主角 "${protagonistName}" 的框架吗？此操作不可恢复。`)) {
    return;
  }

  try {
    const response = await fetch(`${MAIN_SERVER_URL}/api/story-framework/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protagonist_name: protagonistName })
    });

    const result = await response.json();

    if (result.success) {
      alert(result.message);
      // 刷新框架列表
      listFrameworks();
    } else {
      alert(`删除失败: ${result.error || '未知错误'}`);
    }
  } catch (error) {
    console.error('Delete framework error:', error);
    alert(`删除框架失败: ${error.message}`);
  }
}

/**
 * 自动填充重点角色
 */
async function autoFillFocusCharacters() {
  if (!currentNovelId) {
    alert('请先选择小说');
    return;
  }

  const focusCharactersInput = document.getElementById('frameworkFocusCharacters');
  const autoFillCountInput = document.getElementById('autoFillCount');
  const count = parseInt(autoFillCountInput.value) || 15;

  try {
    // 首先尝试获取排名
    let response = await fetch(`${SERVER_MANAGER_URL}/api/novels/${currentNovelId}/character-ranking`);
    
    // 如果排名不存在，自动生成
    if (!response.ok) {
      addExtractionLog('角色排名不存在，正在自动生成...', 'info');
      
      const generateResponse = await fetch(`${SERVER_MANAGER_URL}/api/novels/${currentNovelId}/generate-character-ranking`, {
        method: 'POST'
      });
      
      if (!generateResponse.ok) {
        throw new Error('生成角色排名失败');
      }
      
      addExtractionLog('角色排名生成成功', 'info');
      
      // 重新获取排名
      response = await fetch(`${SERVER_MANAGER_URL}/api/novels/${currentNovelId}/character-ranking`);
      
      if (!response.ok) {
        throw new Error('获取角色排名失败');
      }
    }

    const ranking = await response.json();
    const topCharacters = ranking.rankings.slice(0, count).map(r => r.name).join(', ');
    
    focusCharactersInput.value = topCharacters;
    addExtractionLog(`已自动填充前${count}个重点角色`, 'info');
  } catch (error) {
    alert(`自动填充失败: ${error.message}`);
    addExtractionLog(`自动填充失败: ${error.message}`, 'error');
  }
}

/**
 * 自动填充主角档案
 */
async function autoFillProtagonistProfile() {
  const protagonistInput = document.getElementById('frameworkProtagonist');
  const protagonistName = protagonistInput.value.trim();
  
  if (!protagonistName) {
    return;
  }

  try {
    const response = await fetch(`${MAIN_SERVER_URL}/api/characters`);
    if (!response.ok) {
      return;
    }

    const characters = await response.json();
    const character = characters.find(c => c.name === protagonistName);
    
    if (!character) {
      return;
    }

    // 填充主角档案字段
    let backgroundText = '';
    if (character.scenario) {
      backgroundText = character.scenario;
    }
    if (character.description) {
      backgroundText += (backgroundText ? '\n' : '') + character.description;
    }
    if (backgroundText) {
      document.getElementById('protagonistBackground').value = backgroundText;
    }
    if (character.personality) {
      document.getElementById('protagonistPersonality').value = character.personality;
    }

    console.log(`已自动填充角色 ${protagonistName} 的档案信息`);
  } catch (error) {
    console.error('自动填充主角档案失败:', error);
  }
}
