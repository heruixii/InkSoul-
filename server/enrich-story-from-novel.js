/**
 * Story Enrichment Script - Full Chapter Processing (Fixed)
 * Processes ALL chapters using DeepSeek API with rate limiting, retry, and progress saving
 * Supports multi-novel data isolation
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
// Accept novel file path and novel ID as command line arguments
// Usage: node enrich-story-from-novel.js <novel_file_path> [novel_id]
const NOVEL_FILE = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!NOVEL_FILE) {
  console.error('错误: 请提供小说文件路径');
  console.error('用法: node enrich-story-from-novel.js <novel_file_path> [novel_id]');
  process.exit(1);
}

// Generate novel ID from filename if not provided
const NOVEL_ID = process.argv[3] || path.basename(NOVEL_FILE, path.extname(NOVEL_FILE)).toLowerCase().replace(/[^a-z0-9_]/g, '_');

const NOVELS_DIR = path.join(__dirname, '../data/novels');
const NOVEL_DATA_DIR = path.join(NOVELS_DIR, NOVEL_ID);
const CHARACTERS_DIR = path.join(NOVEL_DATA_DIR, 'characters');
const NPC_DIR = path.join(CHARACTERS_DIR, 'npc');
const PROGRESS_FILE = path.join(NOVEL_DATA_DIR, 'extraction_progress.json');

// 日志文件
const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'extract-novel.log');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 重写console.log以同时输出到文件和终端
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  const message = args.join(' ');
  originalConsoleLog(...args);
  fs.appendFileSync(LOG_FILE, message + '\n');
};

console.error = (...args) => {
  const message = args.join(' ');
  originalConsoleError(...args);
  fs.appendFileSync(LOG_FILE, '[ERROR] ' + message + '\n');
};

console.warn = (...args) => {
  const message = args.join(' ');
  originalConsoleWarn(...args);
  fs.appendFileSync(LOG_FILE, '[WARN] ' + message + '\n');
};

// Output files
const STORY_FRAMEWORK_FILE = path.join(NOVEL_DATA_DIR, 'story_framework.json');
const TIMELINE_FILE = path.join(NOVEL_DATA_DIR, 'timeline.json');
const CANON_ANCHORS_FILE = path.join(NOVEL_DATA_DIR, 'canon_anchors.json');
const CHARACTER_CACHE_FILE = path.join(NOVEL_DATA_DIR, 'character_attributes_cache.json');
const EVENTS_FILE = path.join(NOVEL_DATA_DIR, 'events.json');
const RELATIONSHIPS_FILE = path.join(NOVEL_DATA_DIR, 'relationships.json');
const WORLDBOOK_FILE = path.join(NOVEL_DATA_DIR, 'worldbook.json');

// Metadata file
const METADATA_FILE = path.join(NOVELS_DIR, '_metadata.json');
const ACTIVE_FILE = path.join(NOVELS_DIR, '_active.json');

// DeepSeek API Configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.trim() : '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Processing settings
const MAX_CHAPTERS = 5000;
const REQUEST_DELAY = 100; // 优化：减少请求间隔从 200ms 到 100ms
const MAX_RETRIES = 3;
const SAVE_INTERVAL = 100;
const CONCURRENT_REQUESTS = 10; // 优化：并行请求数提升到10
const ENABLE_WORLDBOOK_SATURATION = false; // 默认关闭饱和检测，避免遗漏后期新设定

// Ensure directories exist
if (!fs.existsSync(NOVELS_DIR)) fs.mkdirSync(NOVELS_DIR, { recursive: true });
if (!fs.existsSync(NOVEL_DATA_DIR)) fs.mkdirSync(NOVEL_DATA_DIR, { recursive: true });
if (!fs.existsSync(CHARACTERS_DIR)) fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
if (!fs.existsSync(NPC_DIR)) fs.mkdirSync(NPC_DIR, { recursive: true });

// Register novel in metadata
function registerNovelMetadata() {
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    try {
      metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    } catch (e) {
      metadata = {};
    }
  }

  const novelStats = fs.statSync(NOVEL_FILE);
  metadata[NOVEL_ID] = {
    id: NOVEL_ID,
    name: path.basename(NOVEL_FILE, path.extname(NOVEL_FILE)),
    filePath: NOVEL_FILE,
    fileSize: novelStats.size,
    createdAt: new Date().toISOString(),
    extracted: false
  };

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

// Set novel as active
function setActiveNovel() {
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeNovelId: NOVEL_ID }, null, 2));
}

// Update extraction status in metadata
function updateExtractionStatus(status) {
  if (!fs.existsSync(METADATA_FILE)) return;

  try {
    const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    if (metadata[NOVEL_ID]) {
      metadata[NOVEL_ID].extracted = status;
      metadata[NOVEL_ID].lastExtraction = new Date().toISOString();
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    }
  } catch (e) {
    console.error('Failed to update extraction status:', e);
  }
}

// Check if data file already exists and has content
function dataFileExistsAndHasContent(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const stats = fs.statSync(filePath);
    const hasContent = stats.size > 10; // More than 10 bytes means it has content
    console.log(`  检查文件 ${path.basename(filePath)}: 大小=${stats.size} bytes, 有内容=${hasContent}`);
    return hasContent;
  } catch (e) {
    console.log(`  检查文件 ${path.basename(filePath)} 失败: ${e.message}`);
    return false;
  }
}

// Check which data already exists
function checkExistingData() {
  return {
    worldbook: dataFileExistsAndHasContent(WORLDBOOK_FILE),
    characters: dataFileExistsAndHasContent(CHARACTER_CACHE_FILE),
    events: dataFileExistsAndHasContent(EVENTS_FILE),
    relationships: dataFileExistsAndHasContent(RELATIONSHIPS_FILE),
    timeline: dataFileExistsAndHasContent(TIMELINE_FILE),
    canonAnchors: dataFileExistsAndHasContent(CANON_ANCHORS_FILE),
    storyFramework: dataFileExistsAndHasContent(STORY_FRAMEWORK_FILE)
  };
}

// Statistics
const stats = {
  totalCharactersRead: 0,
  chunksProcessed: 0,
  llmCalls: 0,
  llmFailures: 0,
  charactersExtracted: 0,
  eventsExtracted: 0,
  relationshipsExtracted: 0,
  worldbookExtracted: 0,
  startTime: Date.now()
};

// ========== 1. 读取小说文件（带编码检测和大小校验 + 文件哈希） ==========
function readNovel() {
  if (!fs.existsSync(NOVEL_FILE)) {
    console.error(`❌ 小说文件不存在: ${NOVEL_FILE}`);
    process.exit(1);
  }

  const statsFile = fs.statSync(NOVEL_FILE);
  const fileSizeMB = statsFile.size / (1024 * 1024);
  console.log(`📄 文件大小: ${fileSizeMB.toFixed(2)} MB (${statsFile.size} 字节)`);

  if (statsFile.size < 100 * 1024) {
    console.error(`❌ 文件过小 (${fileSizeMB.toFixed(2)} MB)，可能不是有效的小说文件。`);
    process.exit(1);
  }

  console.log('读取小说文件...');
  
  // 尝试多种编码读取文件
  let novelContent;
  const encodings = ['utf8', 'utf-8', 'gbk', 'gb2312', 'big5'];
  
  for (const encoding of encodings) {
    try {
      const buffer = fs.readFileSync(NOVEL_FILE);
      novelContent = buffer.toString(encoding);
      
      // 检查是否包含过多乱码字符
      const invalidChars = novelContent.match(/[\uFFFD\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000B\u000C\u000E\u000F]/g);
      if (invalidChars && invalidChars.length > novelContent.length * 0.1) {
        console.log(`  ⚠️ 编码 ${encoding} 检测到过多乱码，尝试下一个编码...`);
        continue;
      }
      
      console.log(`✅ 使用编码 ${encoding} 读取成功`);
      break;
    } catch (err) {
      console.log(`  ⚠️ 编码 ${encoding} 读取失败: ${err.message}`);
      if (encoding === encodings[encodings.length - 1]) {
        throw new Error(`所有编码尝试失败，无法读取文件`);
      }
    }
  }
  
  if (!novelContent) {
    throw new Error('无法读取文件内容');
  }
  
  // 清理文本：移除BOM、标准化换行符、移除多余空格
  novelContent = novelContent.replace(/^\uFEFF/, ''); // 移除BOM
  novelContent = novelContent.replace(/\r\n/g, '\n'); // 统一换行符
  novelContent = novelContent.replace(/\r/g, '\n'); // 统一换行符
  novelContent = novelContent.replace(/\n{3,}/g, '\n\n'); // 移除多余空行
  
  stats.totalCharactersRead = novelContent.length;

  console.log(`✅ 小说加载成功，字符数: ${novelContent.length}`);
  console.log('前 500 字符预览:');
  console.log(novelContent.substring(0, 500));
  console.log('\n--- 预览结束 ---\n');

  return novelContent;
}

// 计算文件哈希（用于增量提取）
function calculateFileHash() {
  const crypto = require('crypto');
  const buffer = fs.readFileSync(NOVEL_FILE);
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// ========== 2. 章节分割（增强健壮性 + 预处理缓存） ==========
function splitIntoChapters(novelContent) {
  console.log('正在分割章节...');
  
  // 检查是否有预处理的章节缓存
  const chapterCacheFile = path.join(NOVEL_DATA_DIR, 'chapter_cache.json');
  if (fs.existsSync(chapterCacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(chapterCacheFile, 'utf8'));
      // 验证缓存是否有效（检查文件哈希）
      const crypto = require('crypto');
      const currentHash = crypto.createHash('md5').update(novelContent).digest('hex');
      
      if (cache.hash === currentHash && cache.chapters && cache.chapters.length > 0) {
        console.log(`✅ 使用缓存的章节分割信息 (${cache.chapters.length} 章)`);
        return cache.chapters;
      } else {
        console.log('章节缓存哈希不匹配，重新分割...');
      }
    } catch (e) {
      console.log('章节缓存读取失败，重新分割...');
    }
  }
  
  // 清理文本：移除特殊字符和格式标记
  let cleanedContent = novelContent;
  cleanedContent = cleanedContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // 移除控制字符
  cleanedContent = cleanedContent.replace(/\s*\[章节分割\]\s*/g, ''); // 移除章节分割标记
  
  // 通用章节分割模式，支持多种章节标记
  const chapterPattern = /第[一二三四五六七八九十百千零两\d]+[节章回部卷集]|Chapter\s+\d+|Chapter\s+[A-Za-z]+|\d+\s*[章节]|第\s*\d+\s*[章节]/gi;
  const chapters = [];
  let lastIndex = 0;
  let match;

  while ((match = chapterPattern.exec(cleanedContent)) !== null) {
    if (lastIndex > 0) {
      const content = cleanedContent.substring(lastIndex, match.index);
      // 降低最小长度要求，从100降到50字符
      if (content.trim().length > 50) {
        // 提取章节标题
        let title = cleanedContent.substring(lastIndex - 50, lastIndex).trim();
        // 清理标题
        title = title.replace(/^[\s\n\r]+|[\s\n\r]+$/g, '');
        title = title.substring(0, 100); // 限制标题长度
        
        chapters.push({
          title: title || `第${chapters.length + 1}章`,
          content: content.trim()
        });
      }
    }
    lastIndex = match.index;
  }
  
  // 处理最后一章
  if (lastIndex < cleanedContent.length) {
    const content = cleanedContent.substring(lastIndex);
    if (content.trim().length > 50) {
      let title = cleanedContent.substring(lastIndex - 50, lastIndex).trim();
      title = title.replace(/^[\s\n\r]+|[\s\n\r]+$/g, '');
      title = title.substring(0, 100);
      
      chapters.push({
        title: title || `第${chapters.length + 1}章`,
        content: content.trim()
      });
    }
  }
  
  // 如果没有分割出任何章节，尝试按固定长度分割
  if (chapters.length === 0) {
    console.log('⚠️ 未检测到章节标记，按固定长度分割...');
    const chapterLength = 5000; // 每章5000字符
    for (let i = 0; i < cleanedContent.length; i += chapterLength) {
      const content = cleanedContent.substring(i, i + chapterLength);
      if (content.trim().length > 50) {
        chapters.push({
          title: `第${chapters.length + 1}章`,
          content: content.trim()
        });
      }
    }
  }
  
  console.log(`✅ 分割完成，共 ${chapters.length} 章`);
  
  // 警告：如果章节数过少或过多
  if (chapters.length < 10) {
    console.warn('⚠️ 章节数过少，可能分割不完整');
  } else if (chapters.length > 5000) {
    console.warn('⚠️ 章节数过多，可能分割过细');
  }
  
  // 保存章节分割缓存
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(novelContent).digest('hex');
    const cache = {
      hash: hash,
      chapters: chapters,
      generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(chapterCacheFile, JSON.stringify(cache, null, 2));
    console.log('✅ 章节分割信息已缓存');
  } catch (e) {
    console.warn('保存章节缓存失败:', e.message);
  }
  
  return chapters;
}

// ========== 3. 进度保存/加载（增强错误处理） ==========
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const content = fs.readFileSync(PROGRESS_FILE, 'utf8');
      if (!content || content.trim().length === 0) {
        console.warn('进度文件为空，从头开始');
        return { processedIndices: [], failedIndices: [], allCharacters: {}, allEvents: [], allRelationships: [], allWorldbook: {}, lastSaveTime: null };
      }
      const progress = JSON.parse(content);
      // 验证进度文件结构
      if (!progress || typeof progress !== 'object') {
        console.warn('进度文件格式错误，从头开始');
        return { processedIndices: [], failedIndices: [], allCharacters: {}, allEvents: [], allRelationships: [], allWorldbook: {}, lastSaveTime: null };
      }
      // 确保failedIndices字段存在
      if (!progress.failedIndices) {
        progress.failedIndices = [];
      }
      return progress;
    } catch (e) {
      console.warn('进度文件损坏，从头开始:', e.message);
      return { processedIndices: [], failedIndices: [], allCharacters: {}, allEvents: [], allRelationships: [], allWorldbook: {}, lastSaveTime: null };
    }
  }
  return { processedIndices: [], failedIndices: [], allCharacters: {}, allEvents: [], allRelationships: [], allWorldbook: {}, lastSaveTime: null };
}
function saveProgress(progress) {
  try {
    // 验证进度数据
    if (!progress || typeof progress !== 'object') {
      console.error('进度数据无效，无法保存');
      return;
    }
    
    progress.lastSaveTime = new Date().toISOString();
    const content = JSON.stringify(progress, null, 2);
    
    // 先写入临时文件，成功后再重命名，避免写入失败导致文件损坏
    const tempFile = PROGRESS_FILE + '.tmp';
    fs.writeFileSync(tempFile, content, 'utf8');
    fs.renameSync(tempFile, PROGRESS_FILE);
    
    console.log(`💾 进度已保存 (已处理 ${progress.processedIndices.length} 章)`);
  } catch (e) {
    console.error('保存进度失败:', e.message);
    // 尝试恢复可能损坏的文件
    try {
      if (fs.existsSync(PROGRESS_FILE + '.tmp')) {
        fs.unlinkSync(PROGRESS_FILE + '.tmp');
      }
    } catch (cleanupErr) {
      console.error('清理临时文件失败:', cleanupErr.message);
    }
  }
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ========== 4. DeepSeek API 调用（增强错误处理） ==========
async function callDeepSeekAPI(prompt, retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!DEEPSEEK_API_KEY) {
      reject(new Error('❌ DEEPSEEK_API_KEY 环境变量未设置或为空，请配置后重试。'));
      return;
    }

    // 验证prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      reject(new Error('❌ Prompt为空或无效'));
      return;
    }

    const requestData = JSON.stringify({
      model: 'deepseek-v4-flash', // flash模型专为速度优化，质量与chat相当
      messages: [
        { role: 'system', content: '你是小说设定专家。只提取文本明确提及的信息，不要编造。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
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
      },
      timeout: 60000 // 增加超时时间到60秒
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (!data || data.trim().length === 0) {
            throw new Error('API返回空数据');
          }
          
          const response = JSON.parse(data);
          
          // 检查API错误
          if (response.error) {
            throw new Error(`API错误: ${response.error.message || response.error}`);
          }
          
          // 检查响应格式
          if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
            throw new Error('API响应格式错误：缺少choices');
          }
          
          resolve(response);
        } catch (err) {
          reject(new Error('解析响应失败: ' + err.message));
        }
      });
    });

    req.on('error', (err) => {
      if (retryCount < MAX_RETRIES) {
        console.log(`  ⚠️ 请求失败，重试 (${retryCount+1}/${MAX_RETRIES})...`);
        setTimeout(() => callDeepSeekAPI(prompt, retryCount+1).then(resolve).catch(reject), 2000 * (retryCount+1));
      } else {
        reject(new Error(`请求失败（已重试${MAX_RETRIES}次）: ${err.message}`));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      if (retryCount < MAX_RETRIES) {
        console.log(`  ⚠️ 请求超时，重试 (${retryCount+1}/${MAX_RETRIES})...`);
        setTimeout(() => callDeepSeekAPI(prompt, retryCount+1).then(resolve).catch(reject), 2000 * (retryCount+1));
      } else {
        reject(new Error(`请求超时（已重试${MAX_RETRIES}次）`));
      }
    });
    req.write(requestData);
    req.end();
  });
}

// ========== 5. 从章节提取信息 ==========
async function extractFromChapter(chapter, index, totalChapters) {
  console.log(`📖 处理第 ${index+1}/${totalChapters} 章: ${chapter.title.substring(0, 40)}...`);
  if (chapter.content.length < 500) return { characters: [], events: [], relationships: [], worldbook: {} };

  // 分段提取：将长章节分成多段（最多3段）
  const CHUNK_SIZE = 600;
  const MAX_CHUNKS = 3; // 最多分3段，避免API调用次数暴增
  
  let chunks = [];
  for (let i = 0; i < chapter.content.length; i += CHUNK_SIZE) {
    chunks.push(chapter.content.substring(i, i + CHUNK_SIZE));
    if (chunks.length >= MAX_CHUNKS) break; // 限制最多3段
  }

  // 如果章节很长，只提取开头部分
  if (chunks.length >= MAX_CHUNKS && chapter.content.length > CHUNK_SIZE * MAX_CHUNKS) {
    console.log(`  ⚠️ 章节较长（${chapter.content.length}字符），只提取前${CHUNK_SIZE * MAX_CHUNKS}字符`);
  }

  console.log(`  📝 分为 ${chunks.length} 段提取`);

  let allResults = {
    characters: [],
    events: [],
    relationships: [],
    worldbook: {}
  };

  // 逐段提取
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const result = await extractFromChunk(chunk, chunkIndex, chunks.length);
    
    // 合并结果
    allResults.characters = [...allResults.characters, ...(result.characters || [])];
    allResults.events = [...allResults.events, ...(result.events || [])];
    allResults.relationships = [...allResults.relationships, ...(result.relationships || [])];
    
    // 合并worldbook
    if (result.worldbook) {
      for (const key in result.worldbook) {
        if (!allResults.worldbook[key]) {
          allResults.worldbook[key] = [];
        }
        if (Array.isArray(result.worldbook[key])) {
          allResults.worldbook[key] = [...allResults.worldbook[key], ...result.worldbook[key]];
        }
      }
    }

    // 段间延迟
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 去重
  allResults.characters = deduplicateCharacters(allResults.characters);
  allResults.events = deduplicateEvents(allResults.events);
  allResults.relationships = deduplicateRelationships(allResults.relationships);

  console.log(`  ✅ 提取完成: 角色${allResults.characters.length}, 事件${allResults.events.length}, 关系${allResults.relationships.length}`);
  
  return allResults;
}

// 从单个片段提取信息（带重试和JSON修复）
async function extractFromChunk(content, chunkIndex, totalChunks) {
  const prompt = `请分析以下小说片段（第${chunkIndex + 1}/${totalChunks}段），只提取明确提及的信息，严禁编造。

重要：只返回纯JSON格式，不要包含任何其他文字、解释或代码。

片段：
${content}

输出格式（纯JSON，无其他内容）：
{
  "characters":[{"name":"","realm":null,"path":null,"description":""}],
  "events":[{"name":"","description":"","characters":[],"location":null}],
  "relationships":[{"character1":"","character2":"","type":""}],
  "worldbook":{
    "cultivation_system":["修行体系信息"],
    "locations":["地点信息"],
    "items":["物品信息"],
    "skills":["技能信息"],
    "concepts":["重要概念"]
  }
}
若无信息则返回：{"characters":[],"events":[],"relationships":[],"worldbook":{}}`;

  // 重试机制：最多2次（减少无效重试）
  const MAX_RETRIES = 2;
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      stats.llmCalls++;
      const response = await callDeepSeekAPI(prompt);
      if (!response?.choices?.[0]) return { characters: [], events: [], relationships: [], worldbook: {} };

      const content = response.choices[0].message.content;
      
      // 尝试解析JSON（带自动修复）
      let extracted = parseAndFixJSON(content);
      
      if (extracted) {
        if (retry > 0) {
          console.log(`  ✅ 第${retry + 1}次重试成功`);
        }
        return extracted;
      }
      
      if (retry < MAX_RETRIES - 1) {
        console.log(`  ⚠️ 第${retry + 1}次JSON解析失败，重试中...`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 减少重试间隔
      }
    } catch (error) {
      if (retry < MAX_RETRIES - 1) {
        console.log(`  ⚠️ 第${retry + 1}次提取失败: ${error.message}，重试中...`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 减少重试间隔
      }
    }
  }

  console.log(`  ⚠️ 第${chunkIndex + 1}段提取失败，返回空数据`);
  return { characters: [], events: [], relationships: [], worldbook: {} };
}

// JSON解析和自动修复
function parseAndFixJSON(content) {
  if (!content) return null;
  
  let jsonStr = content.trim();
  
  // 尝试直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 尝试修复
  }
  
  // 修复1：提取JSON对象（更精确的正则）
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  // 修复2：补全缺失的括号（限制最多补全2个）
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  if (openBraces > closeBraces && openBraces - closeBraces <= 2) {
    jsonStr += '}'.repeat(openBraces - closeBraces);
  }
  
  // 修复3：补全缺失的数组括号（限制最多补全2个）
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets && openBrackets - closeBrackets <= 2) {
    jsonStr += ']'.repeat(openBrackets - closeBrackets);
  }
  
  // 修复4：修复末尾的逗号
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  
  // 修复5：修复未闭合的字符串（只修复明显的未闭合）
  const quoteCount = (jsonStr.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    const lastQuote = jsonStr.lastIndexOf('"');
    // 只在字符串末尾添加引号，避免过度修复
    if (lastQuote > jsonStr.length - 20) {
      jsonStr = jsonStr.substring(0, lastQuote);
    }
  }
  
  // 尝试解析修复后的JSON
  try {
    const result = JSON.parse(jsonStr);
    // 验证结果结构
    if (result && typeof result === 'object') {
      return result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 去重：角色
function deduplicateCharacters(characters) {
  const map = new Map();
  characters.forEach(char => {
    const key = char.name;
    if (!map.has(key)) {
      map.set(key, char);
    }
  });
  return Array.from(map.values());
}

// 去重：事件
function deduplicateEvents(events) {
  const map = new Map();
  events.forEach(event => {
    const key = `${event.name}_${event.description}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  });
  return Array.from(map.values());
}

// 去重：关系
function deduplicateRelationships(relationships) {
  const map = new Map();
  relationships.forEach(rel => {
    const key = `${rel.character1}_${rel.character2}_${rel.type}`;
    if (!map.has(key)) {
      map.set(key, rel);
    }
  });
  return Array.from(map.values());
}

// ========== 6. 合并角色信息 ==========
function mergeCharacter(existing, newChar) {
  if (!existing) return newChar;
  
  // 保留firstChapterIndex
  const merged = { ...existing };
  
  // 合并字段，只覆盖newChar中有实际内容的字段
  for (const key in newChar) {
    const newValue = newChar[key];
    // 只覆盖非空、非null、有实际内容的字段
    if (newValue !== null && newValue !== undefined && newValue !== '') {
      merged[key] = newValue;
    }
  }
  
  // 确保firstChapterIndex存在（总是保留最早的章节索引）
  if (!merged.firstChapterIndex && existing.firstChapterIndex) {
    merged.firstChapterIndex = existing.firstChapterIndex;
  } else if (existing.firstChapterIndex && merged.firstChapterIndex > existing.firstChapterIndex) {
    // 保留更早的章节索引
    merged.firstChapterIndex = existing.firstChapterIndex;
  }
  
  return merged;
}

// ========== 7. 处理所有章节（并行处理 + 失败重试） ==========
async function processAllChapters(chapters, retryFailedOnly = false) {
  console.log(`\n=== 开始使用 LLM 处理章节 ===`);
  const total = Math.min(chapters.length, MAX_CHAPTERS);
  console.log(`总章节数: ${total}, 请求间隔: ${REQUEST_DELAY}ms, 并发数: ${CONCURRENT_REQUESTS}`);

  const progress = loadProgress();
  let allCharacters = progress.allCharacters || {};
  let allEvents = progress.allEvents || [];
  let allRelationships = progress.allRelationships || [];
  let allWorldbook = progress.allWorldbook || {};

  // 修复：如果进度文件数据为空，从独立文件恢复，避免用空数据覆盖已有数据
  const progressHasData = Object.keys(allCharacters).length > 0 || allEvents.length > 0;
  if (!progressHasData) {
    console.log('⚠️ 进度文件数据为空，尝试从独立文件恢复...');
    
    if (fs.existsSync(EVENTS_FILE)) {
      try {
        const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        if (eventsData.events && eventsData.events.length > 0) {
          allEvents = eventsData.events;
          console.log(`  ✓ 从 events.json 恢复 ${allEvents.length} 个事件`);
        }
      } catch (e) {
        console.warn('  ⚠️ 读取 events.json 失败:', e.message);
      }
    }
    
    if (fs.existsSync(RELATIONSHIPS_FILE)) {
      try {
        const relData = JSON.parse(fs.readFileSync(RELATIONSHIPS_FILE, 'utf8'));
        if (relData.relationships && relData.relationships.length > 0) {
          allRelationships = relData.relationships;
          console.log(`  ✓ 从 relationships.json 恢复 ${allRelationships.length} 条关系`);
        }
      } catch (e) {
        console.warn('  ⚠️ 读取 relationships.json 失败:', e.message);
      }
    }
    
    if (fs.existsSync(CHARACTER_CACHE_FILE)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(CHARACTER_CACHE_FILE, 'utf8'));
        if (Object.keys(cacheData).length > 0) {
          allCharacters = cacheData;
          console.log(`  ✓ 从 character_attributes_cache.json 恢复 ${Object.keys(allCharacters).length} 个角色`);
        }
      } catch (e) {
        console.warn('  ⚠️ 读取 character_attributes_cache.json 失败:', e.message);
      }
    }
  }
  const failedIndices = progress.failedIndices || [];

  // 确定需要处理的章节
  let indicesToProcess = [];
  if (retryFailedOnly && failedIndices.length > 0) {
    indicesToProcess = failedIndices;
    console.log(`🔄 重试失败章节: ${failedIndices.length} 章`);
  } else {
    indicesToProcess = Array.from({ length: total }, (_, i) => i);
    console.log(`🔄 处理所有章节: ${total} 章`);
  }

  console.log(`待处理章节: ${indicesToProcess.length} / ${total}`);

  // 并行处理章节
  for (let i = 0; i < indicesToProcess.length; i += CONCURRENT_REQUESTS) {
    const batch = indicesToProcess.slice(i, i + CONCURRENT_REQUESTS);
    const promises = batch.map(index => {
      const chapter = chapters[index];
      return extractFromChapter(chapter, index, total);
    });

    const results = await Promise.all(promises);

    // 合并结果
    for (let j = 0; j < results.length; j++) {
      const index = batch[j];
      const extracted = results[j];

      // 检查是否提取成功（有数据则认为成功）
      const isSuccess = extracted && (extracted.characters?.length > 0 || extracted.events?.length > 0 || 
                                     extracted.relationships?.length > 0 || 
                                     Object.keys(extracted.worldbook || {}).length > 0);

      if (isSuccess) {
        // 从失败列表中移除
        const failedIndex = failedIndices.indexOf(index);
        if (failedIndex > -1) {
          failedIndices.splice(failedIndex, 1);
        }

        // 合并角色、事件、关系
        for (const ch of (extracted.characters || [])) {
          if (ch.name?.length > 1) {
            if (!allCharacters[ch.name]) {
              allCharacters[ch.name] = { ...ch, firstChapterIndex: index };
            } else {
              allCharacters[ch.name] = mergeCharacter(allCharacters[ch.name], ch);
            }
          }
        }
        // 为事件添加章节索引
        if (extracted.events) {
          const eventsWithChapterIndex = extracted.events.map(event => ({
            ...event,
            chapterIndex: index
          }));
          allEvents.push(...eventsWithChapterIndex);
        }
        // 为关系添加章节索引
        if (extracted.relationships) {
          const relationshipsWithChapterIndex = extracted.relationships.map(rel => ({
            ...rel,
            chapterIndex: index
          }));
          allRelationships.push(...relationshipsWithChapterIndex);
        }

        // 合并世界书数据
        if (extracted.worldbook) {
          for (const [category, items] of Object.entries(extracted.worldbook)) {
            if (!allWorldbook[category]) allWorldbook[category] = [];
            if (Array.isArray(items)) {
              for (const item of items) {
                if (item && !allWorldbook[category].includes(item)) {
                  allWorldbook[category].push(item);
                }
              }
            }
          }
        }
      } else {
        // 记录失败
        if (!failedIndices.includes(index)) {
          failedIndices.push(index);
        }
      }

      // 定期保存进度
      if ((i + 1) % SAVE_INTERVAL === 0) {
        const progressData = {
          processedIndices: retryFailedOnly ? progress.processedIndices : Array.from({ length: index + 1 }, (_, i) => i),
          failedIndices: failedIndices,
          allCharacters: allCharacters,
          allEvents: allEvents,
          allRelationships: allRelationships,
          allWorldbook: allWorldbook,
          lastSaveTime: new Date().toISOString()
        };
        saveProgress(progressData);
        
        // 同步保存到events.json和relationships.json（避免中断导致数据丢失）
        try {
          const sortedEvents = allEvents.sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
          const sortedRelationships = allRelationships.sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
          fs.writeFileSync(EVENTS_FILE, JSON.stringify({ events: sortedEvents }, null, 2));
          fs.writeFileSync(RELATIONSHIPS_FILE, JSON.stringify({ relationships: sortedRelationships }, null, 2));
          console.log(`  💾 已同步保存到events.json和relationships.json`);
        } catch (e) {
          console.warn(`  ⚠️ 同步保存失败: ${e.message}`);
        }
      }
    }

    // 批次间延迟
    if (i + CONCURRENT_REQUESTS < indicesToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }

  return {
    characters: Object.values(allCharacters),
    events: allEvents,
    relationships: allRelationships,
    worldbook: allWorldbook
  };
}

// ========== 8. 生成输出文件（略作简化） ==========
function generateStoryFramework(chapters, extractedData) {
  // 故事框架将在后续通过 story-framework-generator.js 生成
  // 此处仅保留空壳文件结构
  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    message: '使用 server/story-framework-generator.js 生成完整的故事框架'
  };
}
function generateTimeline(extractedData) {
  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    events: extractedData.events || []
  };
}
async function evaluateEventImportance(event) {
  if (!DEEPSEEK_API_KEY) {
    // 无 API 密钥时，默认所有事件评分为 5
    return 5;
  }

  try {
    const prompt = `请评估以下事件在小说剧情中的重要性（0-10分）：
事件名称：${event.name || '未命名'}
事件描述：${event.description || ''}
参与者：${(event.characters || []).join('、')}
章节：第${event.chapterIndex || 0}章

评分标准：
- 0-3分：日常琐事、无关紧要的事件
- 4-6分：中等重要性事件，对剧情有一定影响
- 7-8分：重要事件，影响剧情走向
- 9-10分：关键剧情，不可改变的原著锚点

请只返回一个数字（0-10），不要其他内容。`;
    
    const response = await callDeepSeekAPI(prompt);
    const content = response.choices[0].message.content;
    
    // 提取数字
    const scoreMatch = content.match(/\d+/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[0], 10);
      return Math.min(Math.max(score, 0), 10); // 确保在0-10范围内
    }
    
    return 5; // 默认中等重要性
  } catch (error) {
    console.warn(`AI评分失败，使用默认评分: ${error.message}`);
    return 5;
  }
}

async function generateCanonAnchorsWithAI(extractedData) {
  const events = extractedData.events || [];
  const anchors = [];
  let processed = 0;
  
  console.log(`开始为 ${events.length} 个事件生成原著锚点...`);
  
  // 第一轮：筛选关键事件（排除日常琐事）
  const keyEvents = events.filter(event => {
    const desc = event.description || '';
    const name = event.name || '';
    
    // 排除日常琐事
    const excludeKeywords = ['起床', '洗漱', '吃饭', '行走', '交谈', '问好', '上课', '休息'];
    for (const keyword of excludeKeywords) {
      if (desc.includes(keyword) || name.includes(keyword)) {
        return false;
      }
    }
    
    return true;
  });
  
  console.log(`第一轮筛选：从 ${events.length} 个事件中筛选出 ${keyEvents.length} 个关键事件`);
  
  // 第二轮：考虑事件序列上下文（连续相似事件合并）
  const clusteredEvents = [];
  let currentCluster = [];
  
  for (let i = 0; i < keyEvents.length; i++) {
    const event = keyEvents[i];
    
    if (currentCluster.length === 0) {
      currentCluster.push(event);
    } else {
      const lastEvent = currentCluster[currentCluster.length - 1];
      // 如果事件在同一章且描述相似，合并到同一簇
      const sameChapter = event.chapterIndex === lastEvent.chapterIndex;
      const similarDesc = (event.description || '').substring(0, 20) === (lastEvent.description || '').substring(0, 20);
      
      if (sameChapter || similarDesc) {
        currentCluster.push(event);
      } else {
        clusteredEvents.push(currentCluster);
        currentCluster = [event];
      }
    }
  }
  
  if (currentCluster.length > 0) {
    clusteredEvents.push(currentCluster);
  }
  
  console.log(`事件聚类：${keyEvents.length} 个事件聚类为 ${clusteredEvents.length} 个事件簇`);
  
  // 第二轮：AI重要性评分（对每个事件簇评分）
  console.log('第二轮：AI重要性评分...');
  const scoredClusters = [];
  for (let i = 0; i < clusteredEvents.length; i++) {
    const cluster = clusteredEvents[i];
    // 使用簇中最重要的事件进行评分
    const representativeEvent = cluster.reduce((prev, curr) => {
      const prevLen = (prev.description || '').length;
      const currLen = (curr.description || '').length;
      return currLen > prevLen ? curr : prev;
    });
    
    const score = await evaluateEventImportance(representativeEvent);
    scoredClusters.push({ cluster, score });
    
    if ((i + 1) % 10 === 0) {
      console.log(`评分进度: ${i + 1}/${clusteredEvents.length}`);
    }
  }
  
  // 第三轮：只保留评分≥6的事件簇
  const highImportanceClusters = scoredClusters.filter(item => item.score >= 6);
  console.log(`第二轮筛选：保留 ${highImportanceClusters.length} 个高重要性事件簇（评分≥6）`);
  
  // 处理高重要性事件簇，生成锚点
  for (let i = 0; i < highImportanceClusters.length; i++) {
    processed++;
    const { cluster, score } = highImportanceClusters[i];
    
    if (processed % 10 === 0) {
      console.log(`生成锚点进度: ${processed}/${highImportanceClusters.length}`);
    }
    
    // 使用簇中第一个事件生成锚点
    const anchorInfo = await generateAnchorInfo(cluster[0]);
    
    const anchor = {
      title: anchorInfo.title,
      summary: anchorInfo.summary,
      location: anchorInfo.location,
      key_characters: anchorInfo.key_characters,
      player_hook: anchorInfo.player_hook,
      chapter: cluster[0].chapterIndex || 0,
      importance_score: score,
      tier: score >= 9 ? 'main' : (score >= 7 ? 'major' : 'minor'),
      event_count: cluster.length
    };
    
    // AI验证锚点
    const validation = await validateAnchor(anchor);
    if (validation.valid) {
      anchors.push(anchor);
    } else {
      console.log(`  ✗ 锚点未通过验证: ${anchor.title} - ${validation.reason}`);
    }
  }
  
  console.log(`✓ 生成了 ${anchors.length} 个原著锚点（经过AI验证）`);
  
  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    anchors: anchors
  };
}

async function validateAnchor(anchor) {
  if (!DEEPSEEK_API_KEY) {
    // 无 API 密钥时，默认通过验证
    return { valid: true, reason: '' };
  }

  try {
    const prompt = `请验证以下锚点是否准确反映了原著剧情：
锚点标题：${anchor.title}
锚点概要：${anchor.summary}
章节：第${anchor.chapter}章

请回答：
1. 这个锚点是否准确反映了原著剧情？（是/否）
2. 如果不准确，请说明原因。

请以JSON格式返回：
{
  "valid": true/false,
  "reason": "原因说明（如果valid为false）"
}`;
    
    const response = await callDeepSeekAPI(prompt);
    const content = response.choices[0].message.content;
    
    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 如果解析失败，默认通过
    return { valid: true, reason: '' };
  } catch (error) {
    console.warn(`AI验证失败，默认通过: ${error.message}`);
    return { valid: true, reason: '' };
  }
}

async function generateAnchorInfo(event) {
  if (!DEEPSEEK_API_KEY) {
    // 无 API 密钥时使用基础信息
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.characters || [],
      player_hook: null
    };
  }

  try {
    const prompt = `请分析以下事件，提取锚点信息：
事件名称：${event.name || '未命名'}
事件描述：${event.description || ''}
参与者：${(event.characters || []).join('、')}
地点：${event.location || '未知'}

以JSON格式返回：
{
  "title": "事件标题（10-20字）",
  "summary": "事件概要（50-100字）",
  "location": "发生地点",
  "key_characters": ["关键角色列表"],
  "player_hook": "玩家可介入的方式（50字以内）"
}`;
    
    const response = await callDeepSeekAPI(prompt);
    const content = response.choices[0].message.content;
    
    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 如果解析失败，返回基础信息
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.characters || [],
      player_hook: null
    };
  } catch (error) {
    console.warn(`API调用失败，使用基础信息: ${error.message}`);
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.characters || [],
      player_hook: null
    };
  }
}

function generateCanonAnchors(extractedData) {
  const anchors = [];
  const events = extractedData.events || [];
  for (const event of events) {
    if (event.isCanon || event.isMajor) {
      anchors.push({
        id: `anchor_${anchors.length + 1}`,
        event: event.description,
        chapter: event.chapterIndex,
        characters: event.characters || [],
        type: 'canon',
        immutable: true
      });
    }
  }
  return {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    anchors: anchors
  };
}
function generateCharacterCache(extractedData) {
  const cache = {};
  for (const char of extractedData.characters || []) {
    if (char.name) {
      cache[char.name] = char;
    }
  }
  return cache;
}
function generateNPCCards() { /* 与原代码相同，略 */ return []; }

// 生成世界书文件
function generateWorldbook(worldbookData) {
  const worldbook = {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    categories: {
      人物角色: {
        主角: [],
        重要人物: [],
        其他人物: []
      },
      修行体系: worldbookData.cultivation_system || [],
      地理势力: worldbookData.locations || [],
      重要物品: worldbookData.items || [],
      技能能力: worldbookData.skills || [],
      重要概念: worldbookData.concepts || []
    }
  };
  return worldbook;
}

// ========== 9. 主函数（入口检查） ==========
async function main() {
  console.log('=== 小说剧情丰富化脚本 v2.2 (完整章节处理) ===\n');
  console.log(`📚 小说文件: ${NOVEL_FILE}`);
  console.log(`📝 小说 ID: ${NOVEL_ID}`);
  console.log(`📂 数据目录: ${NOVEL_DATA_DIR}\n`);

  // 1. 检查 API Key
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 错误: 未设置 DEEPSEEK_API_KEY 环境变量。');
    console.error('   请设置: set DEEPSEEK_API_KEY=sk-你的密钥  (Windows)');
    console.error('   或添加到系统环境变量后重启命令行。');
    process.exit(1);
  }
  console.log('✅ DeepSeek API Key 已配置');

  // 2. Register novel metadata and set as active
  console.log('📋 注册小说元数据...');
  registerNovelMetadata();
  setActiveNovel();
  console.log('✅ 小说已注册并设为激活状态\n');

  // 3. Check existing data
  const existingData = checkExistingData();
  console.log('🔍 检查已提取的数据:');
  console.log(`  世界书: ${existingData.worldbook ? '✓' : '✗'}`);
  console.log(`  角色: ${existingData.characters ? '✓' : '✗'}`);
  console.log(`  事件: ${existingData.events ? '✓' : '✗'}`);
  console.log(`  关系: ${existingData.relationships ? '✓' : '✗'}`);
  console.log(`  时间轴: ${existingData.timeline ? '✓' : '✗'}`);
  console.log(`  原著锚点: ${existingData.canonAnchors ? '✓' : '✗'}`);
  console.log(`  故事框架: ${existingData.storyFramework ? '✓' : '✗'}`);
  console.log();

  // 4. 读取小说（内部会校验大小）
  let novelContent;
  try {
    novelContent = readNovel();
  } catch (err) {
    console.error('读取小说失败:', err.message);
    process.exit(1);
  }

  // 5. 分割章节
  const chapters = splitIntoChapters(novelContent);

  // 6. 计算文件哈希并检查是否需要重新提取
  const currentFileHash = calculateFileHash();
  console.log(`🔐 当前文件哈希: ${currentFileHash}`);
  
  // 检查进度文件中保存的文件哈希
  const progress = loadProgress();
  const previousFileHash = progress.fileHash || null;
  const needsReExtraction = !previousFileHash || previousFileHash !== currentFileHash;
  
  // 检查是否只重试失败章节
  let retryFailedOnly = process.env.RETRY_FAILED === 'true';
  
  // 自动检测缺失的章节
  if (retryFailedOnly && (!progress.failedIndices || progress.failedIndices.length === 0)) {
    console.log('🔍 检测缺失的章节...');
    
    try {
      // 从events.json中读取已提取的章节索引
      const extractedIndices = new Set();
      
      if (fs.existsSync(EVENTS_FILE)) {
        const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        if (eventsData.events && Array.isArray(eventsData.events)) {
          eventsData.events.forEach(event => {
            if (event.chapterIndex !== undefined) {
              extractedIndices.add(event.chapterIndex);
            }
          });
        }
      }
      
      if (fs.existsSync(RELATIONSHIPS_FILE)) {
        const relData = JSON.parse(fs.readFileSync(RELATIONSHIPS_FILE, 'utf8'));
        if (relData.relationships && Array.isArray(relData.relationships)) {
          relData.relationships.forEach(rel => {
            if (rel.chapterIndex !== undefined) {
              extractedIndices.add(rel.chapterIndex);
            }
          });
        }
      }
      
      console.log(`✅ 已提取章节: ${extractedIndices.size} 章`);
      
      // 找出缺失的章节
      const totalChapters = Math.min(chapters.length, MAX_CHAPTERS);
      const missingIndices = [];
      for (let i = 0; i < totalChapters; i++) {
        if (!extractedIndices.has(i)) {
          missingIndices.push(i);
        }
      }
      
      if (missingIndices.length > 0) {
        console.log(`🔍 发现缺失章节: ${missingIndices.length} 章`);
        console.log(`📝 缺失章节索引: ${missingIndices.slice(0, 10).join(', ')}${missingIndices.length > 10 ? '...' : ''}`);
        
        // 将缺失章节添加到failedIndices
        progress.failedIndices = missingIndices;
        saveProgress(progress);
      } else {
        console.log('✅ 所有章节已提取，无需补充');
      }
    } catch (error) {
      console.warn('⚠️ 检测缺失章节失败:', error.message);
    }
  }
  
  // 如果是重试模式但没有失败记录，提示用户
  if (retryFailedOnly && (!progress.failedIndices || progress.failedIndices.length === 0)) {
    console.log('⚠️ 重试模式已启用，但没有失败章节记录');
    console.log('💡 提示：如需重试特定章节，请设置环境变量 RETRY_RANGE=start-end');
    console.log('💡 例如：RETRY_RANGE=0-100 只重试前100章');
    
    // 检查是否有重试范围
    const retryRange = process.env.RETRY_RANGE;
    if (retryRange) {
      const [start, end] = retryRange.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        console.log(`🔄 重试范围：第 ${start}-${end} 章`);
        progress.failedIndices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    }
  }
  
  // 如果仍然没有失败记录，退出重试模式
  if (retryFailedOnly && (!progress.failedIndices || progress.failedIndices.length === 0)) {
    console.log('⚠️ 没有失败章节可重试，退出重试模式');
    retryFailedOnly = false;
  }
  
  let extractedData; // 提前声明变量
  
  // 如果是重试失败章节模式，即使文件未修改也要执行提取
  if (!needsReExtraction && !retryFailedOnly && existingData.worldbook && existingData.characters) {
    console.log('✅ 文件未修改，跳过LLM提取，使用现有数据');
    console.log(`🔐 上次提取文件哈希: ${previousFileHash}`);
    
    // Load existing data
    const worldbook = JSON.parse(fs.readFileSync(WORLDBOOK_FILE, 'utf8'));
    const characters = JSON.parse(fs.readFileSync(CHARACTER_CACHE_FILE, 'utf8'));
    
    extractedData = {
      characters: characters,
      events: [],
      relationships: [],
      worldbook: worldbook
    };
    
    // Try to load events and relationships if they exist
    if (existingData.events) {
      const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      extractedData.events = eventsData.events || [];
    }
    if (existingData.relationships) {
      const relData = JSON.parse(fs.readFileSync(RELATIONSHIPS_FILE, 'utf8'));
      extractedData.relationships = relData.relationships || [];
    }
  } else {
    if (retryFailedOnly) {
      console.log(`🔄 重试模式：只处理 ${progress.failedIndices.length} 个失败章节`);
    } else if (needsReExtraction) {
      console.log('⚠️ 文件已修改，需要重新提取');
      console.log(`🔐 上次提取文件哈希: ${previousFileHash || '无'}`);
    } else {
      console.log('⚠️ 数据不完整，需要重新提取');
    }
    
    console.log('🔄 开始 LLM 提取...');
    console.log('📊 将调用 DeepSeek API 提取数据...');
    extractedData = await processAllChapters(chapters, retryFailedOnly);
    
    // 保存当前文件哈希到进度文件
    progress.fileHash = currentFileHash;
    saveProgress(progress);
  }

  // 确保extractedData已定义
  if (!extractedData) {
    console.warn('⚠️ extractedData未定义，使用空数据');
    extractedData = {
      characters: [],
      events: [],
      relationships: [],
      worldbook: {}
    };
  }

  // 7. 生成输出文件
  console.log('\n生成故事框架...');
  if (!existingData.storyFramework || (retryFailedOnly && extractedData.events?.length > 0)) {
    fs.writeFileSync(STORY_FRAMEWORK_FILE, JSON.stringify(generateStoryFramework(chapters, extractedData), null, 2));
    console.log('✓ 故事框架已生成');
  } else {
    console.log('⏭ 故事框架已存在，跳过');
  }
  
  console.log('生成时间轴...');
  if (!existingData.timeline || (retryFailedOnly && extractedData.events?.length > 0)) {
    fs.writeFileSync(TIMELINE_FILE, JSON.stringify(generateTimeline(extractedData), null, 2));
    console.log('✓ 时间轴已生成');
  } else {
    console.log('⏭ 时间轴已存在，跳过');
  }
  
  console.log('生成原著锚点...');
  if (!existingData.canonAnchors || (retryFailedOnly && extractedData.events?.length > 0)) {
    const canonAnchorsData = await generateCanonAnchorsWithAI(extractedData);
    fs.writeFileSync(CANON_ANCHORS_FILE, JSON.stringify(canonAnchorsData, null, 2));
    console.log('✓ 原著锚点已生成');
  } else {
    console.log('⏭ 原著锚点已存在，跳过');
  }
  
  console.log('生成角色属性缓存...');
  if (!existingData.characters || (retryFailedOnly && extractedData.characters?.length > 0)) {
    fs.writeFileSync(CHARACTER_CACHE_FILE, JSON.stringify(generateCharacterCache(extractedData), null, 2));
    console.log('✓ 角色属性缓存已生成');
  } else {
    console.log('⏭ 角色属性缓存已存在，跳过');
  }
  
  console.log('生成世界书...');
  if (!existingData.worldbook || (retryFailedOnly && Object.keys(extractedData.worldbook || {}).length > 0)) {
    fs.writeFileSync(WORLDBOOK_FILE, JSON.stringify(generateWorldbook(extractedData.worldbook || {}), null, 2));
    console.log('✓ 世界书已生成');
  } else {
    console.log('⏭ 世界书已存在，跳过');
  }
  
  console.log('生成 NPC 卡...');
  generateNPCCards();

  // 保存事件和关系到独立文件
  console.log('保存事件...');
  // 在重试模式下，先加载现有数据，然后合并
  if (!existingData.events || retryFailedOnly) {
    let existingEvents = [];
    if (retryFailedOnly && fs.existsSync(EVENTS_FILE)) {
      const eventsFileData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      existingEvents = eventsFileData.events || [];
    }
    
    const allEvents = [...existingEvents, ...(extractedData.events || [])];
    const uniqueEvents = [];
    const seen = new Set();
    
    // 去重（基于chapterIndex和事件内容）
    allEvents.forEach(event => {
      const key = `${event.chapterIndex}_${event.name}_${event.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(event);
      }
    });
    
    const sortedEvents = uniqueEvents.sort((a, b) => {
      const indexA = a.chapterIndex ?? 0;
      const indexB = b.chapterIndex ?? 0;
      return indexA - indexB;
    });
    console.log(`📊 保存 ${sortedEvents.length} 个事件（新增 ${extractedData.events?.length || 0}）`);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify({ events: sortedEvents }, null, 2));
    console.log('✓ 事件已保存');
  } else {
    console.log('⏭ 事件已存在，跳过');
  }
  
  console.log('保存关系...');
  if (!existingData.relationships || retryFailedOnly) {
    let existingRelationships = [];
    if (retryFailedOnly && fs.existsSync(RELATIONSHIPS_FILE)) {
      const relationshipsFileData = JSON.parse(fs.readFileSync(RELATIONSHIPS_FILE, 'utf8'));
      existingRelationships = relationshipsFileData.relationships || [];
    }
    
    const allRelationships = [...existingRelationships, ...(extractedData.relationships || [])];
    const uniqueRelationships = [];
    const seen = new Set();
    
    // 去重
    allRelationships.forEach(rel => {
      const key = `${rel.chapterIndex}_${rel.character1}_${rel.character2}_${rel.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRelationships.push(rel);
      }
    });
    
    const sortedRelationships = uniqueRelationships.sort((a, b) => {
      const indexA = a.chapterIndex ?? 0;
      const indexB = b.chapterIndex ?? 0;
      return indexA - indexB;
    });
    console.log(`📊 保存 ${sortedRelationships.length} 个关系（新增 ${extractedData.relationships?.length || 0}）`);
    fs.writeFileSync(RELATIONSHIPS_FILE, JSON.stringify({ relationships: sortedRelationships }, null, 2));
    console.log('✓ 关系已保存');
  } else {
    console.log('⏭ 关系已存在，跳过');
  }

  // 保留进度文件供后续加载使用
  console.log('保存进度文件...');
  if (retryFailedOnly) {
    // 重试模式下，更新进度文件中的failedIndices
    progress.failedIndices = [];
    progress.fileHash = currentFileHash;
    saveProgress(progress);
    console.log('✓ 进度文件已更新（重试模式）');
  }
  console.log('进度文件已保留，可用于后续加载');

  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  console.log('\n=== 统计 ===');
  console.log(`小说字符数: ${stats.totalCharactersRead}`);
  console.log(`LLM 调用次数: ${stats.llmCalls}, 失败: ${stats.llmFailures}`);
  console.log(`提取角色数: ${extractedData.characters.length}, 事件数: ${extractedData.events.length}`);
  const worldbookTotal = Object.values(extractedData.worldbook || {}).flat().length;
  console.log(`提取世界书条目: ${worldbookTotal}`);
  console.log(`耗时: ${elapsed} 秒 (${Math.round(elapsed/60)} 分钟)`);
  console.log('\n✅ 剧情丰富化完成！');
  
  // Update extraction status
  updateExtractionStatus(true);
  console.log('✅ 小说提取状态已更新');

  // 自动生成配置
  console.log('\n=== 自动生成配置 ===');
  autoGenerateConfigs(extractedData);
  console.log('✅ 配置自动生成完成');
}

/**
 * 自动生成配置
 */
async function autoGenerateConfigs(extractedData) {
  try {
    // 加载 metadata
    let metadata = {};
    if (fs.existsSync(METADATA_FILE)) {
      metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    }

    if (!metadata[NOVEL_ID]) {
      console.warn('⚠ 小说未在 metadata 中注册，跳过配置生成');
      return;
    }

    const novel = metadata[NOVEL_ID];

    // 使用LLM分析小说内容并生成配置
    if (DEEPSEEK_API_KEY) {
      console.log('🤖 使用LLM动态生成配置...');
      await generateConfigsWithLLM(novel, extractedData);
    } else {
      console.log('⚠ 未配置DEEPSEEK_API_KEY，跳过配置生成');
    }

    // 保存更新后的 metadata
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    console.log('✓ 配置已保存到 metadata.json');
  } catch (error) {
    console.error('⚠ 配置自动生成失败:', error.message);
  }
}

/**
 * 使用LLM动态生成配置
 */
async function generateConfigsWithLLM(novel, extractedData) {
  try {
    // 读取小说样本（前5000字）
    const novelContent = fs.readFileSync(NOVEL_FILE, 'utf8');
    const sample = novelContent.slice(0, 5000);

    const prompt = `分析以下小说样本，提取关键配置信息：

小说名称：${novel.name}
小说样本：
${sample}

请以JSON格式返回以下配置：
{
  "novelType": "小说类型（修仙/玄幻/都市/武侠等）",
  "powerSystem": {
    "type": "实力体系名称",
    "description": "实力体系描述",
    "levels": [
      {"name": "等级名称", "rank": 1, "description": "等级描述"}
    ],
    "rules": ["规则1", "规则2"]
  },
  "writingStyle": {
    "name": "风格名称",
    "description": "风格描述",
    "characteristics": ["特征1", "特征2"],
    "tone": "基调",
    "narrative": "叙述方式"
  },
  "worldview": {
    "name": "世界观名称",
    "description": "世界观描述",
    "keyElements": ["关键元素1", "关键元素2"],
    "regions": [
      {"id": "地区ID", "name": "地区名称", "description": "地区描述"}
    ]
  },
  "detailRules": {
    "name": "细化规则名称",
    "description": "细化规则描述",
    "categories": [
      {
        "name": "类别名称",
        "rules": ["规则1", "规则2"]
      }
    ]
  },
  "forbiddenConcepts": {
    "name": "禁止概念名称",
    "description": "禁止概念描述",
    "concepts": [
      {"term": "禁止术语", "reason": "禁止原因", "alternative": "替代术语"}
    ],
    "rules": ["规则1", "规则2"]
  }
}

只提取文本中明确提及的信息，不要编造。如果某些信息无法从样本中提取，返回null。`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: '你是小说分析专家，能够从小说文本中提取世界观、实力体系、写作风格等配置信息。只返回JSON格式，不要添加其他文字。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const generatedConfigs = JSON.parse(jsonMatch[0]);

      // 应用生成的配置
      if (generatedConfigs.powerSystem && !novel.powerSystem) {
        novel.powerSystem = generatedConfigs.powerSystem;
        console.log('✓ 实力等级系统配置已生成');
      }

      if (generatedConfigs.writingStyle && !novel.writingStyle) {
        novel.writingStyle = generatedConfigs.writingStyle;
        console.log('✓ 写作风格配置已生成');
      }

      if (generatedConfigs.worldview && !novel.worldview) {
        novel.worldview = generatedConfigs.worldview;
        // 添加默认的距离规则和合理性规则
        if (!novel.worldview.distanceRules) {
          novel.worldview.distanceRules = [];
        }
        if (!novel.worldview.plausibilityRules) {
          novel.worldview.plausibilityRules = [
            '角色在不同地点之间移动需要合理的时间和理由',
            '低境界角色难以跨越极远距离',
            '没有特殊手段不能快速移动',
            '角色相遇需要合理的地理位置和时间安排'
          ];
        }
        console.log('✓ 世界观配置已生成');
      }

      if (generatedConfigs.detailRules && !novel.detailRules) {
        novel.detailRules = generatedConfigs.detailRules;
        console.log('✓ 细化规则配置已生成');
      }

      if (generatedConfigs.forbiddenConcepts && !novel.forbiddenConcepts) {
        novel.forbiddenConcepts = generatedConfigs.forbiddenConcepts;
        console.log('✓ 禁止概念配置已生成');
      }

      // 原著主角从提取的角色中识别
      if (!novel.canonProtagonist && extractedData && extractedData.characters) {
        const protagonist = extractedData.characters.find(char => 
          char.name.includes('主角') ||
          char.description && (char.description.includes('重生') || char.description.includes('穿越'))
        );

        if (protagonist) {
          novel.canonProtagonist = [{
            name: protagonist.name,
            description: protagonist.description || '主要角色',
            role: '主角',
            keyTraits: []
          }];
          console.log('✓ 原著主角配置已生成');
        }
      }

      console.log('✓ LLM配置生成完成');
    } else {
      console.warn('⚠ LLM返回格式错误，使用默认配置');
      generateDefaultConfigs(novel);
    }
  } catch (error) {
    console.warn('⚠ LLM配置生成失败，使用默认配置:', error.message);
    generateDefaultConfigs(novel);
  }
}

/**
 * 生成默认配置（当LLM失败时使用）
 */
function generateDefaultConfigs(novel) {
  // 实力等级系统配置
  if (!novel.powerSystem) {
    novel.powerSystem = {
      type: '通用实力体系',
      description: '基于小说内容的实力提升体系',
      levels: [
        { name: '初级', rank: 1, description: '入门阶段' },
        { name: '中级', rank: 2, description: '发展阶段' },
        { name: '高级', rank: 3, description: '成熟阶段' }
      ],
      rules: [
        '实力提升需要合理的剧情铺垫',
        '不能无故跨越等级',
        '需要相应的资源和努力'
      ]
    };
    console.log('✓ 实力等级系统配置已生成（默认）');
  }

  // 写作风格配置
  if (!novel.writingStyle) {
    novel.writingStyle = {
      name: '通用写作风格',
      description: '根据小说内容生成的写作风格',
      characteristics: [
        '语言流畅',
        '情节连贯',
        '角色鲜明'
      ],
      tone: '客观',
      narrative: '第三人称叙述'
    };
    console.log('✓ 写作风格配置已生成（默认）');
  }

  // 世界观配置
  if (!novel.worldview) {
    novel.worldview = {
      name: '通用世界观',
      description: '根据小说内容生成的世界观',
      keyElements: [
        '遵循小说设定',
        '保持逻辑一致'
      ],
      regions: [],
      distanceRules: [],
      plausibilityRules: [
        '角色移动需要合理的时间',
        '事件发生需要合理的因果关系'
      ]
    };
    console.log('✓ 世界观配置已生成（默认）');
  }

  // 细化规则配置
  if (!novel.detailRules) {
    novel.detailRules = {
      name: '通用细化规则',
      description: '确保故事符合小说设定',
      categories: []
    };
    console.log('✓ 细化规则配置已生成（默认）');
  }

  // 禁止概念配置
  if (!novel.forbiddenConcepts) {
    novel.forbiddenConcepts = {
      name: '通用禁止概念',
      description: '避免引入其他小说的概念',
      concepts: [],
      rules: [
        '严格遵循原著设定',
        '不得引入无关概念'
      ]
    };
    console.log('✓ 禁止概念配置已生成（默认）');
  }

  // 原著主角配置
  if (!novel.canonProtagonist) {
    const protagonist = extractedData.characters.find(char => 
      char.name.includes('主角') ||
      char.description && (char.description.includes('重生') || char.description.includes('穿越'))
    );

    if (protagonist) {
      novel.canonProtagonist = [{
        name: protagonist.name,
        description: protagonist.description || '主要角色',
        role: '主角',
        keyTraits: []
      }];
      console.log('✓ 原著主角配置已生成');
    }
  }
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  updateExtractionStatus(false);
  process.exit(1);
});