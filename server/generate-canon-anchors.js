/**
 * Generate Canon Anchors from Events
 * 从现有事件数据生成原著锚点（优化版本）
 * - 并发处理
 * - 智能采样
 * - 缓存机制
 * - 评分<3跳过
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../data/novels');

// 从环境变量或命令行参数获取小说ID
const NOVEL_ID = process.env.NOVEL_ID || process.argv[2];

if (!NOVEL_ID) {
  console.error('错误: 请提供小说ID');
  console.error('用法: node generate-canon-anchors.js <novel_id>');
  console.error('示例: node generate-canon-anchors.js gu_zhen_ren');
  process.exit(1);
}

const EVENTS_FILE = path.join(DATA_DIR, NOVEL_ID, 'events.json');
const ANCHORS_FILE = path.join(DATA_DIR, NOVEL_ID, 'canon_anchors.json');
const CACHE_FILE = path.join(DATA_DIR, NOVEL_ID, 'anchor_cache.json');

// DeepSeek API 配置
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-flash';

// 优化配置
const BATCH_SIZE = 10; // 并发批次大小
const SAMPLE_PER_CHAPTER = 5; // 每章采样数量

// 缓存
let cache = {
  scores: {},
  anchors: {}
};

// 加载缓存
if (fs.existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`✓ 已加载缓存: ${Object.keys(cache.scores).length} 个评分, ${Object.keys(cache.anchors).length} 个锚点`);
  } catch (e) {
    console.warn('缓存加载失败，将重新生成');
  }
}

// 保存缓存
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * 调用 DeepSeek API 生成锚点信息
 */
async function generateAnchorInfo(event) {
  const cacheKey = `${event.chapterIndex}_${event.name}`;
  
  // 检查缓存
  if (cache.anchors[cacheKey]) {
    return cache.anchors[cacheKey];
  }
  
  if (!API_KEY) {
    console.warn('未配置 DEEPSEEK_API_KEY，使用基础信息生成锚点');
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.participants || [],
      player_hook: null
    };
  }

  try {
    const requestData = JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: '你是小说分析专家。从给定事件中提取关键信息，生成原著锚点数据。只提取文本明确提及的信息，不要编造。'
        },
        {
          role: 'user',
          content: `请分析以下事件，提取锚点信息：
事件名称：${event.name || '未命名'}
事件描述：${event.description || ''}
参与者：${(event.participants || []).join('、')}
地点：${event.location || '未知'}

以JSON格式返回：
{
  "title": "事件标题（10-20字）",
  "summary": "事件概要（50-100字）",
  "location": "发生地点",
  "key_characters": ["关键角色列表"],
  "player_hook": "玩家可介入的方式（50字以内）"
}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
          'Authorization': `Bearer ${API_KEY}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', reject);
      req.write(requestData);
      req.end();
    });

    const data = await response;
    const content = data.choices[0].message.content;
    
    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      // 保存到缓存
      cache.anchors[cacheKey] = result;
      return result;
    }
    
    // 如果解析失败，返回基础信息
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.participants || [],
      player_hook: null
    };
  } catch (error) {
    console.warn(`API调用失败，使用基础信息: ${error.message}`);
    return {
      title: event.name || '未命名事件',
      summary: event.description || '',
      location: event.location || null,
      key_characters: event.participants || [],
      player_hook: null
    };
  }
}

/**
 * 评估事件重要性
 */
async function evaluateEventImportance(event) {
  const cacheKey = `score_${event.chapterIndex}_${event.name}`;
  
  // 检查缓存
  if (cache.scores[cacheKey] !== undefined) {
    return cache.scores[cacheKey];
  }
  
  if (!API_KEY) {
    // 无 API 密钥时，默认所有事件评分为 5
    return 5;
  }

  try {
    const requestData = JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: '你是小说分析专家。评估事件在小说剧情中的重要性。'
        },
        {
          role: 'user',
          content: `请评估以下事件在小说剧情中的重要性（0-10分）：
事件名称：${event.name || '未命名'}
事件描述：${event.description || ''}
参与者：${(event.participants || []).join('、')}
章节：第${event.chapterIndex || 0}章

评分标准：
- 0-3分：日常琐事、无关紧要的事件
- 4-6分：中等重要性事件，对剧情有一定影响
- 7-8分：重要事件，影响剧情走向
- 9-10分：关键剧情，不可改变的原著锚点

请只返回一个数字（0-10），不要其他内容。`
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    });

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
          'Authorization': `Bearer ${API_KEY}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });

      req.on('error', reject);
      req.write(requestData);
      req.end();
    });

    const data = await response;
    const content = data.choices[0].message.content;
    
    // 提取数字
    const scoreMatch = content.match(/\d+/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[0], 10);
      const finalScore = Math.min(Math.max(score, 0), 10); // 确保在0-10范围内
      // 保存到缓存
      cache.scores[cacheKey] = finalScore;
      return finalScore;
    }
    
    return 5; // 默认中等重要性
  } catch (error) {
    console.warn(`AI评分失败，使用默认评分: ${error.message}`);
    return 5;
  }
}

/**
 * 筛选关键事件（排除日常琐事）
 */
function isKeyEvent(event) {
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
}

/**
 * 智能采样：按章节采样关键事件
 */
function smartSampleEvents(events) {
  const chapterMap = new Map();
  
  // 按章节分组
  events.forEach(event => {
    const chapter = event.chapterIndex || 0;
    if (!chapterMap.has(chapter)) {
      chapterMap.set(chapter, []);
    }
    chapterMap.get(chapter).push(event);
  });
  
  const sampledEvents = [];
  
  // 每章采样前N个事件
  chapterMap.forEach((chapterEvents, chapter) => {
    const count = Math.min(chapterEvents.length, SAMPLE_PER_CHAPTER);
    sampledEvents.push(...chapterEvents.slice(0, count));
  });
  
  console.log(`智能采样: 从 ${events.length} 个事件中采样 ${sampledEvents.length} 个事件（每章最多${SAMPLE_PER_CHAPTER}个）`);
  
  return sampledEvents;
}

/**
 * 并发处理批次
 */
async function processBatch(events, startIndex) {
  const batch = events.map(async (event, index) => {
    // 评估事件重要性
    const score = await evaluateEventImportance(event);
    
    // 跳过低分事件（评分<5）
    if (score < 5) {
      console.log(`  ✗ 跳过低分事件: ${event.name} (评分: ${score})`);
      return null;
    }
    
    const anchorInfo = await generateAnchorInfo(event);
    return {
      title: anchorInfo.title,
      summary: anchorInfo.summary,
      location: anchorInfo.location,
      key_characters: anchorInfo.key_characters,
      player_hook: anchorInfo.player_hook,
      chapter: event.chapterIndex || 0,
      importance_score: score
    };
  });
  
  const results = await Promise.all(batch);
  return results.filter(r => r !== null); // 过滤掉null（跳过的事件）
}

/**
 * 从事件生成锚点（优化版本）
 */
async function generateAnchors(events) {
  const anchors = [];
  let skipped = 0;
  
  // 过滤关键事件
  const keyEvents = events.filter(isKeyEvent);
  console.log(`从 ${events.length} 个事件中筛选出 ${keyEvents.length} 个关键事件`);
  
  // 智能采样
  const sampledEvents = smartSampleEvents(keyEvents);
  console.log(`最终处理: ${sampledEvents.length} 个事件`);
  
  // 并发处理
  console.log(`开始并发处理（批次大小: ${BATCH_SIZE}）...`);
  
  for (let i = 0; i < sampledEvents.length; i += BATCH_SIZE) {
    const batch = sampledEvents.slice(i, i + BATCH_SIZE);
    const batchAnchors = await processBatch(batch, i);
    const validAnchors = batchAnchors.filter(a => a !== null);
    anchors.push(...validAnchors);
    
    const skippedInBatch = batch.length - validAnchors.length;
    skipped += skippedInBatch;
    
    console.log(`处理进度: ${Math.min(i + BATCH_SIZE, sampledEvents.length)}/${sampledEvents.length}`);
    
    // 每批保存一次缓存
    saveCache();
  }
  
  console.log(`\n跳过了 ${skipped} 个低分事件（评分<5）`);
  return anchors;
}

/**
 * 主函数
 */
async function main() {
  console.log(`=== 原著锚点生成脚本（优化版本）===`);
  console.log(`小说ID: ${NOVEL_ID}`);
  console.log(`优化: 并发处理、智能采样、缓存机制、评分<5跳过\n`);
  
  console.log('正在读取事件数据...');
  
  if (!fs.existsSync(EVENTS_FILE)) {
    console.error('错误: events.json 不存在');
    console.error(`路径: ${EVENTS_FILE}`);
    process.exit(1);
  }
  
  const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  const events = eventsData.events || [];
  
  console.log(`共读取 ${events.length} 个事件\n`);
  
  console.log('正在生成原著锚点...');
  const anchors = await generateAnchors(events);
  
  console.log(`\n生成了 ${anchors.length} 个原著锚点`);
  
  const output = {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    anchors: anchors
  };
  
  fs.writeFileSync(ANCHORS_FILE, JSON.stringify(output, null, 2));
  
  console.log(`✓ 原著锚点已保存到 canon_anchors.json`);
  console.log(`路径: ${ANCHORS_FILE}\n`);
  
  // 显示前10个锚点
  console.log('前10个锚点:');
  anchors.slice(0, 10).forEach((anchor, index) => {
    console.log(`${index + 1}. ${anchor.title} (第${anchor.chapter}章, 评分: ${anchor.importance_score})`);
    console.log(`   ${anchor.summary}`);
    console.log(`   角色: ${(anchor.key_characters || []).join('、')}`);
    console.log('');
  });
  
  console.log('✓ 缓存已保存');
}

main().catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
