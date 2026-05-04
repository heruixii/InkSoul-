/**
 * 小说角色属性提取脚本
 * 从小说中提取所有角色的规范属性并生成缓存
 * 基于 LLM 的真实上下文提取，禁止伪造属性
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 配置
const NOVEL_FILE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const CACHE_FILE = path.join(__dirname, '../data/character_attributes_cache.json');
const LOG_FILE = path.join(__dirname, '../logs/extract-novel-characters.log');

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 确保日志目录存在
const LOG_DIR = path.dirname(LOG_FILE);
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 确保缓存目录存在
const DATA_DIR = path.dirname(CACHE_FILE);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 写入日志
 */
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
}

/**
 * 验证小说文件读取
 */
function verifyNovelReading(novelContent) {
  const preview = novelContent.substring(0, 500);
  writeLog('=== 小说读取验证 ===');
  writeLog('前 500 字符预览:');
  writeLog(preview);
  writeLog('==================');
  
  if (novelContent.length < 1000) {
    writeLog('警告: 小说文件内容过少，可能读取失败');
    return false;
  }
  
  return true;
}

/**
 * 获取所有角色卡文件名并提取角色名
 */
function getAllCharacterNames() {
  if (!fs.existsSync(CHARACTERS_DIR)) {
    writeLog('错误: 角色卡目录不存在');
    return [];
  }
  
  const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
  const characterNames = files.map(f => {
    // 移除 "角色卡_" 前缀和 ".json" 后缀
    return f.replace(/^角色卡_/, '').replace(/\.json$/, '');
  });
  
  writeLog(`找到 ${characterNames.length} 个角色卡文件`);
  return characterNames;
}

/**
 * 检查角色是否为原创角色（小说中未出现）
 */
function isOriginalCharacter(novelContent, characterName) {
  const index = novelContent.indexOf(characterName);
  return index === -1;
}

/**
 * 从小说中提取角色的真实上下文（基于句子）
 */
function extractRealCharacterContext(novelContent, characterName, maxContexts = 5) {
  const contexts = [];
  const contextWindow = 300; // 前后 300 字符
  
  // 查找角色名在小说中的所有出现位置
  const positions = [];
  let index = 0;
  
  while ((index = novelContent.indexOf(characterName, index)) !== -1) {
    positions.push(index);
    index += characterName.length;
  }
  
  if (positions.length === 0) {
    return contexts;
  }
  
  // 提取上下文（最多 maxContexts 个）
  for (let i = 0; i < Math.min(positions.length, maxContexts); i++) {
    const pos = positions[i];
    const start = Math.max(0, pos - contextWindow);
    const end = Math.min(novelContent.length, pos + characterName.length + contextWindow);
    const context = novelContent.substring(start, end);
    
    contexts.push({
      position: pos,
      context: context
    });
  }
  
  return contexts;
}

/**
 * 调用 DeepSeek API
 */
function callDeepSeekAPI(prompt) {
  return new Promise((resolve, reject) => {
    if (!DEEPSEEK_API_KEY) {
      reject(new Error('DEEPSEEK_API_KEY 环境变量未设置'));
      return;
    }
    
    const requestData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一位小说设定分析专家，擅长从文本中提取角色属性。只提取文本中明确提及的属性，不要编造任何信息。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });
    
    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`解析响应失败: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestData);
    req.end();
  });
}

/**
 * 使用 LLM 提取角色属性（只提取明确提及的）
 */
async function extractAttributesWithLLM(characterName, contexts) {
  if (contexts.length === 0) {
    return null;
  }
  
  // 选择最相关的上下文（最多 5 个片段）
  const selectedContexts = contexts.slice(0, 5);
  const contextText = selectedContexts.map((c, i) => `片段 ${i + 1}:\n${c.context}`).join('\n\n');
  
  const prompt = `你是小说设定分析专家。请根据以下文本片段，提取角色"${characterName}"的规范属性。

文本片段：
${contextText}

**重要规则：**
1. 只提取文本中**明确提及**的属性
2. 如果文本中没有明确提及某个属性，必须返回 null，绝对不要编造
3. 不要根据上下文猜测或推断，只提取直接表述的信息

请提取以下属性：
1. realm: 境界/实力等级（如小说中出现的修炼境界、等级等）
2. path: 修炼路线/职业/专长（如小说中出现的道途、职业、技能方向等）
3. title: 称号/身份（如小说中出现的尊称、职位、头衔等）
4. location: 所在地点/所属势力（如小说中出现的地名、组织名等）
5. tags: 标签数组（如["修仙者", "剑修", "青云门"]等，最多5个，使用小说中的术语）

请以 JSON 格式返回，不要包含任何其他文字：
{
  "realm": "境界或null",
  "path": "道途或null",
  "title": "称号或null",
  "location": "地点/势力或null",
  "tags": ["标签1", "标签2", ...]
}`;

  try {
    const response = await callDeepSeekAPI(prompt);
    
    if (!response || !response.choices || !response.choices[0]) {
      writeLog(`  AI 响应格式错误`);
      return null;
    }
    
    const content = response.choices[0].message.content;
    
    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const attributes = JSON.parse(jsonMatch[0]);
      
      // 过滤掉 null 值，确保没有伪造的属性
      const filteredAttributes = {
        realm: attributes.realm || null,
        path: attributes.path || null,
        title: attributes.title || null,
        location: attributes.location || null,
        tags: attributes.tags || []
      };
      
      return filteredAttributes;
    }
    
    return null;
  } catch (error) {
    writeLog(`  AI 抽取失败: ${error.message}`);
    return null;
  }
}

/**
 * 批量提取所有角色属性
 */
async function extractAllCharacterAttributes() {
  writeLog('=== 开始提取角色属性 ===');
  
  // 读取小说文件
  if (!fs.existsSync(NOVEL_FILE)) {
    writeLog('错误: 小说文件不存在');
    return;
  }
  
  const novelContent = fs.readFileSync(NOVEL_FILE, 'utf-8');
  writeLog(`已读取小说文件: ${NOVEL_FILE} (${novelContent.length} 字符)`);
  
  // 验证小说读取
  if (!verifyNovelReading(novelContent)) {
    writeLog('错误: 小说读取验证失败');
    return;
  }
  
  // 获取所有角色名
  const characterNames = getAllCharacterNames();
  
  const attributesCache = {};
  let successCount = 0;
  let originalCount = 0;
  let failCount = 0;
  
  // 批量提取
  for (let i = 0; i < characterNames.length; i++) {
    const characterName = characterNames[i];
    writeLog(`[${i + 1}/${characterNames.length}] 提取角色: ${characterName}`);
    
    try {
      // 检查是否为原创角色
      if (isOriginalCharacter(novelContent, characterName)) {
        writeLog(`  原创角色: 小说中未找到该角色，跳过`);
        attributesCache[characterName] = {
          name: characterName,
          isOriginal: true,
          extracted_at: new Date().toISOString()
        };
        originalCount++;
        continue;
      }
      
      // 提取真实上下文
      const contexts = extractRealCharacterContext(novelContent, characterName);
      
      if (contexts.length === 0) {
        writeLog(`  跳过: 小说中未找到该角色`);
        attributesCache[characterName] = null;
        failCount++;
        continue;
      }
      
      writeLog(`  找到 ${contexts.length} 个上下文片段`);
      
      // 使用 LLM 提取属性
      const attributes = await extractAttributesWithLLM(characterName, contexts);
      
      if (attributes && (attributes.realm || attributes.path || attributes.title || attributes.location || attributes.tags.length > 0)) {
        attributesCache[characterName] = {
          name: characterName,
          isOriginal: false,
          ...attributes,
          extracted_at: new Date().toISOString(),
          context_count: contexts.length
        };
        writeLog(`  成功: realm=${attributes.realm}, path=${attributes.path}, title=${attributes.title}`);
        successCount++;
      } else {
        attributesCache[characterName] = null;
        writeLog(`  失败: 文本中未明确提及属性`);
        failCount++;
      }
      
      // 添加延迟避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      writeLog(`  错误: ${error.message}`);
      attributesCache[characterName] = null;
      failCount++;
    }
  }
  
  // 保存缓存
  writeLog('保存缓存文件...');
  fs.writeFileSync(CACHE_FILE, JSON.stringify(attributesCache, null, 2), 'utf-8');
  writeLog(`缓存已保存: ${CACHE_FILE}`);
  
  // 统计
  const total = characterNames.length;
  const extractionRate = ((successCount / (total - originalCount)) * 100).toFixed(2);
  
  writeLog('=== 角色属性提取完成 ===');
  writeLog(`总角色数: ${total}`);
  writeLog(`原创角色: ${originalCount} (跳过)`);
  writeLog(`成功提取: ${successCount}`);
  writeLog(`未提及属性: ${failCount}`);
  writeLog(`提取率: ${extractionRate}% (排除原创角色)`);
  
  // 输出分类列表
  writeLog('\n=== 分类列表 ===');
  writeLog('【原创角色列表】:');
  for (const [name, attrs] of Object.entries(attributesCache)) {
    if (attrs && attrs.isOriginal) {
      writeLog(`  - ${name}`);
    }
  }
  
  writeLog('\n【成功提取的角色列表】:');
  for (const [name, attrs] of Object.entries(attributesCache)) {
    if (attrs && !attrs.isOriginal && (attrs.realm || attrs.path || attrs.title || attrs.location)) {
      writeLog(`  - ${name}: realm=${attrs.realm}, path=${attrs.path}, title=${attrs.title}, location=${attrs.location}`);
    }
  }
  
  writeLog('\n【未提及属性的角色列表】:');
  for (const [name, attrs] of Object.entries(attributesCache)) {
    if (attrs === null) {
      writeLog(`  - ${name}`);
    }
  }
  
  return {
    total,
    successCount,
    originalCount,
    failCount,
    extractionRate,
    cacheFile: CACHE_FILE
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
小说角色属性提取脚本
用法: node extract-novel-characters.js [选项]

选项:
  -h, --help  显示帮助信息

功能:
  读取小说文件，提取所有角色的规范属性并生成缓存
  缓存文件: data/character_attributes_cache.json
  
环境变量:
  DEEPSEEK_API_KEY  DeepSeek API 密钥（必需）
    `);
    process.exit(0);
  }
  
  if (!DEEPSEEK_API_KEY) {
    console.error('错误: DEEPSEEK_API_KEY 环境变量未设置');
    console.error('请设置环境变量: set DEEPSEEK_API_KEY=your_api_key');
    process.exit(1);
  }
  
  await extractAllCharacterAttributes();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  extractAllCharacterAttributes,
  getAllCharacterNames,
  isOriginalCharacter,
  extractRealCharacterContext
};
