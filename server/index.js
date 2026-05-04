const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

// 新故事框架模块
const storyStateManager = require('./story-state-manager');
const aiContentGenerator = require('./ai-content-generator');
const choiceHandler = require('./choice-handler');
const dataLoader = require('./data-loader');
const stateExtractor = require('./state-extractor');

// 日志和监控模块
const logger = require('./logger');
const consistencyChecker = require('./check-consistency');

// 初始化日志记录器
const log = logger.getLogger();

// 初始化故事状态管理器（传入 settings 以支持长期记忆的 LLM 摘要生成）
function getStoryStateManager() {
  const store = readStore();
  const settings = store.settings || {};
  return storyStateManager.getStoryStateManager(settings);
}

const app = express();
const PORT = 3000;
const SOFTWARE_WATERMARK = '本软件由我在家2up主制作';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files only if dist directory exists
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// 请求日志 + 慢请求标记
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const flag = ms > 500 ? ' [SLOW]' : '';
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms${flag}`);
    }
  });
  next();
});

app.use((req, res, next) => {
  try {
    res.setHeader('X-Software-Watermark', Buffer.from(SOFTWARE_WATERMARK, 'utf-8').toString('base64'));
  } catch (e) {
    // Ignore header errors
  }
  next();
});

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'tavern.json');
const avatarsDir = path.join(dataDir, 'avatars');
const projectRootDir = path.join(__dirname, '..');
const charactersDir = path.join(projectRootDir, 'characters');
const worldbookDir = path.join(projectRootDir, 'worldbook');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// 头像静态服务（必须在 avatarsDir 声明之后）
app.use('/api/avatars', express.static(avatarsDir, { maxAge: '1d', fallthrough: false }));

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({
    characters: [],
    chats: [],
    messages: [],
    lorebooks: [],
    presets: [],
    settings: {},
    stories: [],
    storyCharacters: [],
    storyLorebooks: [],
    storyEvents: [],
    storyNPCs: [],
    storyRelationships: [],
    storyHistory: []
  }, null, 2), 'utf8');
}

const EMPTY_STORE = () => ({
  characters: [], chats: [], messages: [], lorebooks: [], presets: [],
  settings: {}, stories: [], storyCharacters: [], storyLorebooks: [],
  storyEvents: [], storyNPCs: [], storyRelationships: [], storyHistory: [],
  storyRevealedFacts: []
});

const normalizeStore = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return EMPTY_STORE();
  return {
    characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    chats: Array.isArray(parsed.chats) ? parsed.chats : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    lorebooks: Array.isArray(parsed.lorebooks) ? parsed.lorebooks : [],
    presets: Array.isArray(parsed.presets) ? parsed.presets : [],
    settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
    stories: Array.isArray(parsed.stories) ? parsed.stories : [],
    storyCharacters: Array.isArray(parsed.storyCharacters) ? parsed.storyCharacters : [],
    storyLorebooks: Array.isArray(parsed.storyLorebooks) ? parsed.storyLorebooks : [],
    storyEvents: Array.isArray(parsed.storyEvents) ? parsed.storyEvents : [],
    storyNPCs: Array.isArray(parsed.storyNPCs) ? parsed.storyNPCs : [],
    storyRelationships: Array.isArray(parsed.storyRelationships) ? parsed.storyRelationships : [],
    storyHistory: Array.isArray(parsed.storyHistory) ? parsed.storyHistory : [],
    storyRevealedFacts: Array.isArray(parsed.storyRevealedFacts) ? parsed.storyRevealedFacts : []
  };
};

// 内存缓存：基于文件 mtime 失效，并增加短时间戳防抖避免并发请求重复读盘
let _storeCache = null;
let _storeMtimeMs = 0;
let _storeDirty = false; // 内存里被 writeStore 修改但还未刷盘
let _storeReadAt = 0;
const STORE_READ_THROTTLE_MS = 300; // 300ms 内重复请求直接返回内存缓存
const backupFile = dataFile + '.bak';

const tryReadAndParse = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

const readStore = () => {
  // 短时间防抖：并发请求在 300ms 内直接返回内存缓存，避免重复 stat/read/parse
  if (_storeCache && Date.now() - _storeReadAt < STORE_READ_THROTTLE_MS) {
    return _storeCache;
  }
  // 命中内存：要么有 dirty（写后未失效），要么 mtime 未变
  try {
    const stat = fs.statSync(dataFile);
    if (_storeCache && (_storeDirty || stat.mtimeMs === _storeMtimeMs)) {
      _storeReadAt = Date.now();
      return _storeCache;
    }
    const parsed = tryReadAndParse(dataFile);
    if (parsed) {
      _storeCache = normalizeStore(parsed);
      _storeMtimeMs = stat.mtimeMs;
      _storeDirty = false;
      _storeReadAt = Date.now();
      return _storeCache;
    }
    // 主文件损坏，尝试 .bak
    console.error('[store] 主数据文件解析失败，尝试从 .bak 恢复');
    const bak = tryReadAndParse(backupFile);
    if (bak) {
      _storeCache = normalizeStore(bak);
      _storeMtimeMs = 0;
      _storeDirty = true; // 触发回写
      _storeReadAt = Date.now();
      return _storeCache;
    }
  } catch (error) {
    console.error('[store] readStore 异常:', error.message);
  }
  if (!_storeCache) _storeCache = EMPTY_STORE();
  _storeReadAt = Date.now();
  return _storeCache;
};

// 串行化的原子写：tmp + rename，配合 .bak 备份
let _writeQueue = Promise.resolve();
const writeStore = (store) => {
  _storeCache = store;
  _storeDirty = true;
  const payload = JSON.stringify(store, null, 2);
  _writeQueue = _writeQueue.then(async () => {
    const tmpFile = dataFile + '.tmp';
    try {
      // 备份当前文件（如果存在）
      if (fs.existsSync(dataFile)) {
        try { fs.copyFileSync(dataFile, backupFile); } catch (e) { /* best effort */ }
      }
      await fs.promises.writeFile(tmpFile, payload, 'utf8');
      await fs.promises.rename(tmpFile, dataFile);
      try {
        const stat = fs.statSync(dataFile);
        _storeMtimeMs = stat.mtimeMs;
      } catch (e) { /* ignore */ }
      _storeDirty = false;
    } catch (error) {
      console.error('[store] 写入失败:', error.message);
      _storeDirty = true; // 下次仍以内存为准
    }
  }).catch(err => console.error('[store] 写队列异常:', err));
  return _writeQueue;
};

const now = () => new Date().toISOString();

// ===================== 输入校验 helper =====================
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const requireString = (v, name, { maxLen = 50000 } = {}) => {
  if (typeof v !== 'string') throw new HttpError(400, `参数 ${name} 必须为字符串`);
  const trimmed = v.trim();
  if (!trimmed) throw new HttpError(400, `参数 ${name} 不允许为空`);
  if (trimmed.length > maxLen) throw new HttpError(400, `参数 ${name} 超过最大长度 ${maxLen}`);
  return trimmed;
};

const optionalString = (v, name, { maxLen = 50000 } = {}) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(400, `参数 ${name} 必须为字符串`);
  if (v.length > maxLen) throw new HttpError(400, `参数 ${name} 超过最大长度 ${maxLen}`);
  return v;
};

const requireSafeKey = (v, name) => {
  const key = requireString(v, name, { maxLen: 200 });
  if (FORBIDDEN_KEYS.has(key)) throw new HttpError(400, `非法的参数名 ${name}`);
  return key;
};

const requireInt = (v, name, { min = -1e15, max = 1e15 } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `参数 ${name} 需为 [${min}, ${max}] 内的整数`);
  return n;
};

const requireArray = (v, name) => {
  if (!Array.isArray(v)) throw new HttpError(400, `参数 ${name} 需为数组`);
  return v;
};

const listJsonFiles = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.toLowerCase().endsWith('.json'))
      .map((item) => item.name);
  } catch (error) {
    return [];
  }
};

const readJsonFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const toIsoTime = (value, fallback) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
};

// 目录 mtime 缓存：只检查目录本身的 mtime，不逐个 stat 文件。
// 修改/新增文件通常会更新目录 mtime； Windows 下某些编辑器可能不更新，
// 因此保留 30 秒兜底缓存 + 目录 mtime 变化即失效的策略。
const _dirSigCache = new Map(); // dirPath -> { sig, mtimeMs, at }
const DIR_SIG_THROTTLE_MS = 30000;
const _dirSignature = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) return 'none';
    const dirStat = fs.statSync(dirPath);
    const cached = _dirSigCache.get(dirPath);
    if (cached && dirStat.mtimeMs === cached.mtimeMs && Date.now() - cached.at < DIR_SIG_THROTTLE_MS) {
      return cached.sig;
    }
    const files = listJsonFiles(dirPath);
    const sig = `${files.length}:${dirStat.mtimeMs}`;
    _dirSigCache.set(dirPath, { sig, mtimeMs: dirStat.mtimeMs, at: Date.now() });
    return sig;
  } catch (e) {
    return 'err';
  }
};

let _fileCharCache = null;
let _fileCharSig = '';
const loadFileCharacters = () => {
  const sig = _dirSignature(charactersDir);
  if (_fileCharCache && sig === _fileCharSig) return _fileCharCache;

  const files = listJsonFiles(charactersDir);
  const entries = [];

  files.forEach((fileName) => {
    try {
      const filePath = path.join(charactersDir, fileName);
      const parsed = readJsonFile(filePath);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }

      const stat = fs.statSync(filePath);
      const timestamp = toIsoTime(stat.mtimeMs, now());
      const dialogueExamples = Array.isArray(parsed.dialogue_examples) ? parsed.dialogue_examples : [];

      entries.push({
        id: `file-char:${fileName}`,
        name: String(parsed.name || path.basename(fileName, '.json')),
        description: String(parsed.description || parsed.background || ''),
        personality: String(parsed.personality || ''),
        scenario: String(parsed.background || ''),
        first_mes: String(parsed.first_mes || parsed.firstMessage || dialogueExamples[0] || ''),
        mes_example: String(parsed.mes_example || dialogueExamples.join('\n') || ''),
        avatar: String(parsed.avatar || ''),
        creator: String(parsed.creator || ''),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        system_prompt: String(parsed.system_prompt || ''),
        favorite: false,
        alternate_greetings: Array.isArray(parsed.alternate_greetings) ? parsed.alternate_greetings : [],
        created_at: timestamp,
        updated_at: timestamp,
        source: 'file',
        source_file: fileName,
        raw_data: parsed
      });
    } catch (error) {
      console.warn(`[chars] 解析失败 ${fileName}:`, error.message);
    }
  });

  _fileCharCache = entries;
  _fileCharSig = sig;
  return entries;
};

const splitKeywords = (value) => String(value || '')
  .split(/[,，;；、|]+/)
  .map((item) => item.trim())
  .filter(Boolean);

let _fileLoreCache = null;
let _fileLoreSig = '';
const loadFileLorebooks = () => {
  const sig = _dirSignature(worldbookDir);
  if (_fileLoreCache && sig === _fileLoreSig) return _fileLoreCache;

  const files = listJsonFiles(worldbookDir);
  const entries = [];

  files.forEach((fileName) => {
    try {
      const filePath = path.join(worldbookDir, fileName);
      const parsed = readJsonFile(filePath);
      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const stat = fs.statSync(filePath);
      const timestamp = toIsoTime(stat.mtimeMs, now());

      if (Array.isArray(parsed.entries)) {
        parsed.entries.forEach((item, index) => {
          if (!item || typeof item !== 'object') {
            return;
          }
          const key = String(item.key || '').trim();
          const content = String(item.content || '').trim();
          if (!key && !content) {
            return;
          }

          entries.push({
            id: `file-lore:${fileName}:${item.id ?? index}`,
            title: key || `${path.basename(fileName, '.json')}#${index + 1}`,
            content,
            keywords: splitKeywords(key),
            character_id: '',
            chat_id: '',
            enabled: item.enabled !== false,
            created_at: timestamp,
            updated_at: timestamp,
            source: 'file',
            source_file: fileName
          });
        });
        return;
      }

      const title = String(parsed.title || parsed.name || path.basename(fileName, '.json'));
      const content = String(parsed.content || parsed.description || '');
      if (!title && !content) {
        return;
      }

      entries.push({
        id: `file-lore:${fileName}:root`,
        title,
        content,
        keywords: normalizeKeywords(parsed.keywords || parsed.key || ''),
        character_id: '',
        chat_id: '',
        enabled: parsed.enabled !== false,
        created_at: timestamp,
        updated_at: timestamp,
        source: 'file',
        source_file: fileName
      });
    } catch (error) {
      console.warn(`[lore] 解析失败 ${fileName}:`, error.message);
    }
  });

  _fileLoreCache = entries;
  _fileLoreSig = sig;
  return entries;
};

const mergeById = (primary, secondary) => {
  const map = new Map();
  primary.forEach((item) => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });
  secondary.forEach((item) => {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return [...map.values()];
};

const getAllCharacters = (store) => mergeById(store.characters, loadFileCharacters());
const getAllLorebooks = (store) => mergeById(store.lorebooks, loadFileLorebooks());

const collectJsonParseWarnings = () => {
  const warnings = [];
  const scanTargets = [
    { dirPath: charactersDir, scope: 'characters' },
    { dirPath: worldbookDir, scope: 'worldbook' }
  ];

  scanTargets.forEach(({ dirPath, scope }) => {
    const files = listJsonFiles(dirPath);
    files.forEach((fileName) => {
      const filePath = path.join(dirPath, fileName);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          warnings.push({
            scope,
            file: fileName,
            reason: 'JSON 顶层结构必须是对象'
          });
        }
      } catch (error) {
        warnings.push({
          scope,
          file: fileName,
          reason: String(error.message || error)
        });
      }
    });
  });

  return warnings;
};

let jsonParseWarnings = [];
const refreshJsonParseWarnings = () => {
  jsonParseWarnings = collectJsonParseWarnings();
  return jsonParseWarnings;
};

refreshJsonParseWarnings();

const powerSystemService = require('./power-system-service');

const SETTINGS_DEFAULTS = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  maxTokens: 2000,
  temperature: 0.8,
  activePresetId: '',
  contextMode: 'balanced',
  // 用于摘要 / 记忆压缩的廉价模型；为空则复用 model
  summaryModel: '',
  // 是否启用长期记忆机制
  longTermMemory: true
};

const CONTEXT_MODES = {
  balanced: {
    outputTokenMax: 4000,
    contextBudgetFactor: 2.2,
    contextBudgetBase: 1600,
    contextBudgetMax: 5500,
    summaryLimit: 1200,
    lorebookCount: 16,
    lorebookItemLimit: 600,
    lorebookBlockLimit: 4200,
    sampleStep: 6
  },
  max_context: {
    outputTokenMax: 4000,
    contextBudgetFactor: 2.9,
    contextBudgetBase: 2200,
    contextBudgetMax: 8200,
    summaryLimit: 1800,
    lorebookCount: 22,
    lorebookItemLimit: 760,
    lorebookBlockLimit: 6200,
    sampleStep: 4
  },
  stability: {
    outputTokenMax: 3200,
    contextBudgetFactor: 1.8,
    contextBudgetBase: 1200,
    contextBudgetMax: 4200,
    summaryLimit: 900,
    lorebookCount: 12,
    lorebookItemLimit: 420,
    lorebookBlockLimit: 3000,
    sampleStep: 8
  }
};

const resolveChatCompletionsUrl = (apiUrl) => {
  const fallback = 'https://api.openai.com/v1/chat/completions';
  const raw = String(apiUrl || '').trim();
  if (!raw) {
    return fallback;
  }

  const normalized = raw.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(normalized) || /\/responses$/i.test(normalized)) {
    return normalized;
  }

  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }

  if (/^https?:\/\/[^/]+$/i.test(normalized)) {
    return `${normalized}/v1/chat/completions`;
  }

  return normalized;
};

const normalizeKeywords = (keywords) => {
  if (Array.isArray(keywords)) {
    return keywords.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof keywords === 'string') {
    return keywords.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

const safeLower = (value) => String(value || '').toLowerCase();

const buildTriggeredLorebooks = (store, chatId, characterId, text) => {
  const allLorebooks = getAllLorebooks(store);
  const source = safeLower(text);
  
  // 语义相关性检测
  const calculateSemanticScore = (entry, source) => {
    const entryContent = safeLower(String(entry.content || '') + ' ' + String(entry.title || ''));
    const sourceContent = source;
    
    // 简单的语义匹配：检查词汇重叠
    const entryWords = entryContent.split(/\s+/).filter(w => w.length > 1);
    const sourceWords = sourceContent.split(/\s+/).filter(w => w.length > 1);
    
    const intersection = entryWords.filter(word => sourceWords.includes(word));
    const semanticScore = intersection.length * 3;
    
    return semanticScore;
  };

  const prioritized = allLorebooks.map((entry) => {
    if (!entry.enabled) {
      return null;
    }

    if (entry.chat_id && entry.chat_id !== chatId) {
      return null;
    }

    if (entry.character_id && entry.character_id !== characterId) {
      return null;
    }

    const keywords = normalizeKeywords(entry.keywords);
    const matchedKeywords = keywords.filter((keyword) => source.includes(safeLower(keyword)));
    const semanticScore = calculateSemanticScore(entry, source);

    if (keywords.length === 0) {
      return {
        ...entry,
        _matchedKeywords: [],
        _semanticScore: semanticScore,
        _triggerScore: (entry.chat_id ? 100 : entry.character_id ? 60 : 30) + 1 + semanticScore
      };
    }

    if (matchedKeywords.length === 0 && semanticScore < 3) {
      return null;
    }

    return {
      ...entry,
      _matchedKeywords: matchedKeywords,
      _semanticScore: semanticScore,
      _triggerScore: (entry.chat_id ? 100 : entry.character_id ? 60 : 30) + matchedKeywords.length * 8 + semanticScore
    };
  }).filter(Boolean);

  return prioritized.sort((a, b) => {
    if (a._triggerScore !== b._triggerScore) {
      return b._triggerScore - a._triggerScore;
    }
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
};

const getChatMessages = (store, chatId) => {
  return store.messages
    .filter((item) => item.chat_id === chatId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
};

const buildSummaryText = (messages) => {
  if (!messages || messages.length === 0) {
    return '暂无对话记录';
  }

  // 计算消息重要性
  const calculateImportance = (msg, index, total) => {
    let score = 0;
    
    // 位置权重：开头和结尾的消息更重要
    if (index < 3) score += 3;
    if (index >= total - 3) score += 3;
    
    // 长度权重：较长的消息可能包含更多信息
    const length = String(msg.content || '').length;
    if (length > 200) score += 2;
    if (length > 500) score += 2;
    
    // 角色消息权重：角色的回应可能包含重要信息
    if (msg.role === 'assistant') score += 1;
    
    // 关键词检测
    const content = String(msg.content || '').toLowerCase();
    const importantKeywords = ['决定', '选择', '重要', '记住', '承诺', '约定', '秘密', '计划', '目标', '敌人', '朋友', '爱人', '家人', '死亡', '重生', '开始', '结束'];
    importantKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 2;
    });
    
    return score;
  };

  // 选择重要消息
  const messagesWithImportance = messages.map((msg, index) => ({
    ...msg,
    importance: calculateImportance(msg, index, messages.length)
  }));

  // 按重要性排序并选择前20条
  const importantMessages = messagesWithImportance
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20)
    .sort((a, b) => messages.indexOf(a) - messages.indexOf(b)); // 保持时间顺序

  // 生成摘要
  const summaryLines = importantMessages.map((item) => {
    const role = item.role === 'user' ? '用户' : '角色';
    const content = String(item.content || '').slice(0, 150);
    const importance = item.importance > 5 ? '★' : '';
    return `${role}${importance}：${content}`;
  });

  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  const lastAssistantMessage = [...messages].reverse().find((item) => item.role === 'assistant');

  // 提取关键信息
  const keyEvents = [];
  importantMessages.forEach(msg => {
    const content = String(msg.content || '');
    if (content.includes('决定') || content.includes('选择') || content.includes('承诺')) {
      keyEvents.push(content.slice(0, 100));
    }
  });

  return [
    '【重要对话摘要】',
    summaryLines.join('\n') || '暂无',
    '',
    keyEvents.length > 0 ? `【关键决策】\n${keyEvents.join('\n')}` : '',
    '',
    `【用户当前诉求】${lastUserMessage ? String(lastUserMessage.content || '').slice(0, 220) : '暂无'}`,
    `【角色最近回应】${lastAssistantMessage ? String(lastAssistantMessage.content || '').slice(0, 220) : '暂无'}`,
    '',
    '【记忆提示】请记住以上对话中的关键信息和决策，保持角色一致性。'
  ].filter(Boolean).join('\n');
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ===================== 长期记忆系统 =====================
// 重要关键词：分类管理，便于识别值得长期记忆的内容
const MEMORY_KEYWORDS = {
  // 关键决策类（高分）
  decision: ['决定', '选择', '承诺', '约定', '发誓', '答应', '拒绝', '同意'],
  // 实体类（中高分）
  entity: ['名字', '叫做', '称为', '姓', '住在', '来自', '家乡', '故乡'],
  // 关系类
  relation: ['朋友', '敌人', '爱人', '家人', '父亲', '母亲', '兄弟', '姐妹', '师父', '徒弟', '盟友'],
  // 事件类
  event: ['死亡', '重生', '结婚', '出生', '杀死', '救', '背叛', '相遇', '离别', '失踪'],
  // 物品/任务类
  item: ['宝物', '武器', '法宝', '蛊', '丹药', '任务', '使命', '目标', '秘密', '宝藏', '钥匙'],
  // 情感强度类
  emotion: ['爱', '恨', '怒', '怕', '哀', '喜', '惊', '震撼', '深刻']
};

const ALL_MEMORY_KEYWORDS = new Set(
  Object.values(MEMORY_KEYWORDS).flat()
);

// 中文分词（简化版）：抽取候选 token 用于 TF-IDF 检索
const tokenizeForRetrieval = (text) => {
  if (!text) return [];
  const str = String(text);
  const tokens = new Set();
  // 英文/数字 token
  const enMatches = str.match(/[a-zA-Z0-9]+/g) || [];
  enMatches.forEach(t => { if (t.length >= 2) tokens.add(t.toLowerCase()); });
  // 中文 2-gram + 3-gram
  const chineseChars = str.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < chineseChars.length - 1; i++) {
    tokens.add(chineseChars.substr(i, 2));
    if (i < chineseChars.length - 2) tokens.add(chineseChars.substr(i, 3));
  }
  return [...tokens];
};

// 评估一条消息是否值得记忆，返回重要性分数（0-100）
const scoreMemoryWorthiness = (msg, prevMessages = []) => {
  if (!msg || !msg.content) return 0;
  const content = String(msg.content);
  const lower = content.toLowerCase();
  let score = 0;

  // 长度门槛
  if (content.length < 15) return 0;
  if (content.length > 60) score += 5;
  if (content.length > 200) score += 5;

  // 关键词命中（不同类别加权）
  for (const [category, words] of Object.entries(MEMORY_KEYWORDS)) {
    let categoryHits = 0;
    for (const w of words) {
      if (content.includes(w)) categoryHits++;
    }
    if (categoryHits > 0) {
      const weights = { decision: 25, event: 20, relation: 15, entity: 15, item: 12, emotion: 8 };
      score += Math.min(categoryHits * (weights[category] || 5), weights[category] || 10);
    }
  }

  // 命名实体启发：「」『』""书名号 / 引号包裹的内容
  const quoted = content.match(/[「『""]([^」』""]{2,20})[」』""]/g);
  if (quoted) score += quoted.length * 6;

  // 重复提及加成：同一名词在历史中已出现 ≥2 次
  if (prevMessages.length > 0) {
    const tokens = tokenizeForRetrieval(content).filter(t => t.length >= 2);
    const recentText = prevMessages.slice(-30).map(m => m.content || '').join(' ');
    let repeatHits = 0;
    for (const t of tokens.slice(0, 20)) {
      if (recentText.includes(t)) repeatHits++;
    }
    if (repeatHits > 3) score += 8;
  }

  // 用户主动陈述事实（"我..."、"我的..."）权重略高
  if (msg.role === 'user' && /^(我|我的|我是|我叫)/.test(content.trim())) {
    score += 10;
  }

  return Math.min(score, 100);
};

// 从最新若干消息中抽取候选记忆，与已有记忆合并去重
const extractAndMergeMemories = (chat, allMessages) => {
  const existing = Array.isArray(chat.memories) ? chat.memories : [];
  const existingTexts = new Set(existing.map(m => String(m.content || '').slice(0, 80)));

  // 仅检查最近 6 条消息（每次生成后增量提取）
  const recent = allMessages.slice(-6);
  const candidates = [];

  recent.forEach((msg, idx) => {
    const score = scoreMemoryWorthiness(msg, allMessages.slice(0, allMessages.length - recent.length + idx));
    if (score < 18) return; // 阈值
    const key = String(msg.content || '').slice(0, 80);
    if (existingTexts.has(key)) return;

    candidates.push({
      id: uuidv4(),
      content: String(msg.content || '').slice(0, 600),
      role: msg.role,
      importance: score,
      mention_count: 1,
      created_at: msg.created_at || now(),
      keywords: tokenizeForRetrieval(msg.content).slice(0, 30)
    });
    existingTexts.add(key);
  });

  // 已有记忆：扫描提及次数（被新消息再次提到则 +1，提升重要性）
  const recentText = recent.map(m => m.content || '').join('\n');
  existing.forEach(mem => {
    const memTokens = (mem.keywords || []).filter(t => t.length >= 2).slice(0, 8);
    let hits = 0;
    for (const t of memTokens) if (recentText.includes(t)) hits++;
    if (hits >= 2) {
      mem.mention_count = (mem.mention_count || 1) + 1;
      mem.importance = Math.min(100, (mem.importance || 50) + 4);
    }
  });

  let merged = [...existing, ...candidates];

  // 容量上限：保留最重要 + 最新 80 条
  if (merged.length > 80) {
    merged = merged
      .sort((a, b) => (b.importance || 0) * 0.7 + (new Date(b.created_at).getTime() / 1e10) * 0.3
                    - (a.importance || 0) * 0.7 - (new Date(a.created_at).getTime() / 1e10) * 0.3)
      .slice(0, 80);
  }

  return merged;
};

// 基于关键词重叠（伪 TF-IDF）检索 Top-K 相关记忆
const retrieveRelevantMemories = (memories, queryText, k = 5) => {
  if (!Array.isArray(memories) || memories.length === 0) return [];
  const queryTokens = new Set(tokenizeForRetrieval(queryText));
  if (queryTokens.size === 0) {
    // 兜底：返回最重要的几条
    return [...memories].sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, k);
  }

  const scored = memories.map(mem => {
    const memTokens = mem.keywords || tokenizeForRetrieval(mem.content);
    let overlap = 0;
    for (const t of memTokens) if (queryTokens.has(t)) overlap++;
    // 综合：相关性 70% + 重要性 20% + 提及次数 10%
    const relScore = memTokens.length > 0 ? overlap / Math.sqrt(memTokens.length) : 0;
    const finalScore = relScore * 70 + (mem.importance || 0) * 0.2 + Math.log(1 + (mem.mention_count || 1)) * 10;
    return { mem, score: finalScore };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score > 0)
    .slice(0, k)
    .map(s => s.mem);
};

const formatMemoryBlock = (memories) => {
  if (!memories || memories.length === 0) return '';
  return memories
    .map((m, i) => {
      const role = m.role === 'user' ? '用户' : '角色';
      const star = (m.importance || 0) >= 50 ? '★' : '';
      return `${i + 1}. [${role}${star}] ${String(m.content || '').replace(/\n/g, ' ').slice(0, 220)}`;
    })
    .join('\n');
};

// ===================== 异步 LLM 记忆抽取 =====================
// 设计：
//  - 规则化抽取在主流程同步执行（已实现），保证最低限度记忆
//  - LLM 抽取在响应结束后异步排队，每个 chat 同一时刻最多 1 个任务，且节流
//  - 用便宜模型（settings.summaryModel）以降低成本
//  - LLM 输出 JSON 数组：[{content, importance, role, type}]，与规则化结果合并去重

const _llmMemoryRunning = new Map(); // chatId → boolean
const _llmMemoryLastRunAt = new Map(); // chatId → timestamp
const LLM_MEMORY_MIN_INTERVAL = 60 * 1000; // 同一 chat 最多每 60s 触发一次

const buildLlmMemoryPrompt = (character, recentMessages, existingMemories) => {
  const recent = recentMessages.slice(-12).map((m, i) => {
    const role = m.role === 'user' ? '用户' : (character?.name || '角色');
    return `[${i + 1}] ${role}：${String(m.content || '').slice(0, 400)}`;
  }).join('\n');

  const existing = existingMemories.slice(0, 30).map((m, i) => `${i + 1}. ${String(m.content).slice(0, 120)}`).join('\n');

  return `你是一个对话记忆抽取助手。请从下面最近的对话中提取应当被长期记住的关键事实（人物、地点、决策、承诺、关系、用户偏好、重要事件等）。

【对话角色】${character?.name || '未知'}
【已有记忆】（不要重复，仅在被推翻或刷新时输出）：
${existing || '（暂无）'}

【最近对话】
${recent}

【输出要求】
- 只输出 JSON 数组，不要任何解释、注释、Markdown 代码块标记
- 每条记忆 1-3 句话，不超过 100 字
- 字段：content（事实陈述）、importance（0-100，越关键越高）、role（"user" 表示用户陈述的事实，"assistant" 表示角色陈述的事实）、type（decision/entity/relation/event/item/preference/emotion 之一）
- 至多 8 条；若没有值得记忆的内容，输出空数组 []
- 严禁猜测、严禁推理用户尚未说出的信息
- 中性陈述，避免夹杂主观评价

示例：[{"content":"用户名叫赵子龙，来自北原","importance":85,"role":"user","type":"entity"},{"content":"角色与方源约定七日后再会","importance":70,"role":"assistant","type":"decision"}]

仅输出 JSON 数组：`;
};

const llmExtractMemoriesAsync = async (chatId) => {
  // 节流
  const lastRun = _llmMemoryLastRunAt.get(chatId) || 0;
  if (Date.now() - lastRun < LLM_MEMORY_MIN_INTERVAL) {
    return { skipped: true, reason: 'throttled' };
  }
  if (_llmMemoryRunning.get(chatId)) {
    return { skipped: true, reason: 'already_running' };
  }

  _llmMemoryRunning.set(chatId, true);
  _llmMemoryLastRunAt.set(chatId, Date.now());

  try {
    const store = readStore();
    const settings = store.settings || {};
    const apiKey = settings.apiKey;
    if (!apiKey) return { skipped: true, reason: 'no_api_key' };
    if (settings.longTermMemory === false) return { skipped: true, reason: 'memory_disabled' };

    const chat = store.chats.find(c => c.id === chatId);
    if (!chat) return { skipped: true, reason: 'chat_not_found' };

    const character = getAllCharacters(store).find(c => c.id === chat.character_id);
    const recentMessages = getChatMessages(store, chatId).slice(-12);
    if (recentMessages.length < 2) return { skipped: true, reason: 'too_few_messages' };

    const existingMemories = Array.isArray(chat.memories) ? chat.memories : [];
    const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);
    const extractModel = settings.summaryModel || settings.model || 'gpt-3.5-turbo';

    const userPrompt = buildLlmMemoryPrompt(character, recentMessages, existingMemories);

    console.log(`[memory-llm] chat=${chatId} 开始 LLM 抽取，模型=${extractModel}`);
    const t0 = Date.now();

    const response = await axios.post(targetUrl, {
      model: extractModel,
      messages: [
        { role: 'system', content: '你是一个精确的、不胡编的对话信息抽取助手。仅输出 JSON 数组。' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1200
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 45000
    });

    const raw = response.data?.choices?.[0]?.message?.content || '';
    let extracted;
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      extracted = JSON.parse(match ? match[0] : raw);
    } catch (e) {
      console.warn(`[memory-llm] chat=${chatId} JSON 解析失败:`, raw.slice(0, 200));
      return { skipped: true, reason: 'parse_failed' };
    }
    if (!Array.isArray(extracted)) {
      return { skipped: true, reason: 'not_array' };
    }

    // 重新读取 store（可能被并发修改），合并 LLM 结果
    const freshStore = readStore();
    const ci = freshStore.chats.findIndex(c => c.id === chatId);
    if (ci === -1) return { skipped: true, reason: 'chat_gone' };

    const currentMems = Array.isArray(freshStore.chats[ci].memories) ? freshStore.chats[ci].memories : [];
    const existingTexts = new Set(currentMems.map(m => String(m.content || '').slice(0, 80)));

    const newMems = extracted
      .filter(item => item && typeof item.content === 'string' && item.content.trim().length >= 8)
      .slice(0, 8)
      .map(item => {
        const content = String(item.content).trim().slice(0, 400);
        const key = content.slice(0, 80);
        if (existingTexts.has(key)) return null;
        existingTexts.add(key);
        return {
          id: uuidv4(),
          content,
          role: item.role === 'assistant' ? 'assistant' : 'user',
          importance: clamp(Number(item.importance) || 60, 0, 100),
          mention_count: 1,
          created_at: now(),
          keywords: tokenizeForRetrieval(content).slice(0, 30),
          type: typeof item.type === 'string' ? item.type.slice(0, 20) : '',
          source: 'llm'
        };
      })
      .filter(Boolean);

    if (newMems.length === 0) {
      const ms = Date.now() - t0;
      console.log(`[memory-llm] chat=${chatId} 完成 (${ms}ms)，无新增`);
      return { added: 0, total: currentMems.length };
    }

    let merged = [...currentMems, ...newMems];
    if (merged.length > 80) {
      merged = merged
        .sort((a, b) => (b.importance || 0) * 0.7 + (new Date(b.created_at).getTime() / 1e10) * 0.3
                      - (a.importance || 0) * 0.7 - (new Date(a.created_at).getTime() / 1e10) * 0.3)
        .slice(0, 80);
    }

    freshStore.chats[ci].memories = merged;
    writeStore(freshStore);
    const ms = Date.now() - t0;
    console.log(`[memory-llm] chat=${chatId} 完成 (${ms}ms)，新增 ${newMems.length} 条 (LLM)，总计 ${merged.length}`);
    return { added: newMems.length, total: merged.length, durationMs: ms };
  } catch (error) {
    console.error(`[memory-llm] chat=${chatId} 抽取失败:`, error.message);
    return { error: error.message };
  } finally {
    _llmMemoryRunning.set(chatId, false);
  }
};

// 节流触发：避免 await，立即返回让响应不被阻塞
const triggerLlmMemoryExtraction = (chatId, opts = {}) => {
  // 默认仅在最近一段时间内有新规则化记忆 / 满足最小消息间隔时触发
  setImmediate(() => {
    llmExtractMemoriesAsync(chatId).catch(err => {
      console.error('[memory-llm] 异步任务异常:', err.message);
    });
  });
};

// ===================== 短回复缓存 =====================
// 针对短小输入（如"你好"、"在吗"），缓存固定回复，避免反复调用 API
const SHORT_REPLY_CACHE = new Map(); // key: characterId+normalizedInput → {content, ts}
const SHORT_REPLY_TTL = 30 * 60 * 1000; // 30 分钟
const SHORT_REPLY_MAX_SIZE = 200;

const getCachedShortReply = (characterId, userInput) => {
  const normalized = String(userInput || '').trim().slice(0, 30);
  if (!normalized || normalized.length > 12) return null;
  const key = `${characterId}::${normalized}`;
  const hit = SHORT_REPLY_CACHE.get(key);
  if (hit && Date.now() - hit.ts < SHORT_REPLY_TTL) return hit.content;
  if (hit) SHORT_REPLY_CACHE.delete(key);
  return null;
};

const setCachedShortReply = (characterId, userInput, content) => {
  const normalized = String(userInput || '').trim().slice(0, 30);
  if (!normalized || normalized.length > 12) return;
  if (!content || content.length > 300) return; // 太长的不缓存
  if (SHORT_REPLY_CACHE.size >= SHORT_REPLY_MAX_SIZE) {
    const firstKey = SHORT_REPLY_CACHE.keys().next().value;
    SHORT_REPLY_CACHE.delete(firstKey);
  }
  SHORT_REPLY_CACHE.set(`${characterId}::${normalized}`, { content, ts: Date.now() });
};

const selectContextMessages = (messages, maxChars, options = {}) => {
  const source = Array.isArray(messages) ? messages : [];
  if (source.length <= 2) {
    return source;
  }

  const budget = Math.max(1200, Number(maxChars) || 0);
  const selectedIndices = new Set();
  let used = 0;

  // 计算消息重要性（与摘要生成相同的逻辑）
  const calculateImportance = (msg, index, total) => {
    let score = 0;
    
    if (index < 3) score += 3;
    if (index >= total - 3) score += 3;
    
    const length = String(msg.content || '').length;
    if (length > 200) score += 2;
    if (length > 500) score += 2;
    
    if (msg.role === 'assistant') score += 1;
    
    const content = String(msg.content || '').toLowerCase();
    const importantKeywords = ['决定', '选择', '重要', '记住', '承诺', '约定', '秘密', '计划', '目标', '敌人', '朋友', '爱人', '家人', '死亡', '重生', '开始', '结束'];
    importantKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 2;
    });
    
    return score;
  };

  const messagesWithImportance = source.map((msg, index) => ({
    ...msg,
    importance: calculateImportance(msg, index, source.length)
  }));

  const includeIndex = (index) => {
    if (index < 0 || index >= source.length || selectedIndices.has(index)) {
      return false;
    }

    const content = String(source[index]?.content || '');
    const estimatedChars = content.length + 28;
    if (used + estimatedChars > budget) {
      return false;
    }

    selectedIndices.add(index);
    used += estimatedChars;
    return true;
  };

  // 优先包含高重要性消息
  const sortedByImportance = messagesWithImportance
    .map((msg, index) => ({ index, importance: msg.importance }))
    .sort((a, b) => b.importance - a.importance);

  // 包含前15条最重要的消息
  sortedByImportance.slice(0, 15).forEach(({ index }) => includeIndex(index));

  // 确保包含开头和结尾的消息
  includeIndex(0);
  includeIndex(1);

  const tailWindow = Math.max(8, Number(options.tailWindow) || 12);
  for (let i = Math.max(0, source.length - tailWindow); i < source.length; i += 1) {
    includeIndex(i);
  }

  // 填充剩余预算，按重要性顺序
  for (let i = 0; i < sortedByImportance.length; i++) {
    if (used >= budget * 0.9) break;
    includeIndex(sortedByImportance[i].index);
  }

  return [...selectedIndices]
    .sort((a, b) => a - b)
    .map((index) => source[index]);
};

const buildCharacterCanonBlock = (character) => {
  const raw = character?.raw_data && typeof character.raw_data === 'object' ? character.raw_data : {};
  const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
  const tags = Array.isArray(character?.tags) ? character.tags : (Array.isArray(raw.tags) ? raw.tags : []);
  const relationships = raw.relationships && typeof raw.relationships === 'object' ? raw.relationships : {};
  const relationshipLines = Object.entries(relationships)
    .slice(0, 14)
    .map(([name, relation]) => `- ${name}: ${String(relation || '').slice(0, 80)}`);

  const lines = [
    `角色名：${String(character?.name || '')}`,
    aliases.length > 0 ? `别名：${aliases.join('、')}` : '',
    tags.length > 0 ? `标签：${tags.join('、')}` : '',
    relationshipLines.length > 0 ? `关键关系：\n${relationshipLines.join('\n')}` : ''
  ].filter(Boolean);

  return lines.join('\n');
};

const createCharacterRecord = (payload, timestamp, fallback = {}) => ({
  ...fallback,
  name: payload.name || fallback.name || '未命名角色',
  description: payload.description || payload.data?.description || fallback.description || '',
  personality: payload.personality || payload.data?.personality || fallback.personality || '',
  scenario: payload.scenario || payload.data?.scenario || fallback.scenario || '',
  first_mes: payload.first_mes || payload.firstMessage || payload.data?.first_mes || fallback.first_mes || '',
  mes_example: payload.mes_example || payload.data?.mes_example || fallback.mes_example || '',
  avatar: payload.avatar || payload.data?.avatar || fallback.avatar || '',
  creator: payload.creator || payload.data?.creator || fallback.creator || '',
  tags: Array.isArray(payload.tags) ? payload.tags : Array.isArray(fallback.tags) ? fallback.tags : [],
  system_prompt: payload.system_prompt || payload.data?.system_prompt || fallback.system_prompt || '',
  favorite: payload.favorite === true || fallback.favorite === true,
  alternate_greetings: Array.isArray(payload.alternate_greetings)
    ? payload.alternate_greetings
    : Array.isArray(fallback.alternate_greetings)
      ? fallback.alternate_greetings
      : [],
  created_at: fallback.created_at || timestamp,
  updated_at: timestamp
});

// 获取小说元数据配置
app.get('/api/novels/:novelId/metadata', (req, res) => {
  try {
    const { novelId } = req.params;
    const metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    if (!metadata[novelId]) {
      return res.status(404).json({ error: 'Novel not found' });
    }
    
    res.json(metadata[novelId]);
  } catch (error) {
    console.error('Failed to get novel metadata:', error);
    res.status(500).json({ error: 'Failed to get novel metadata' });
  }
});

// 更新小说元数据配置
app.put('/api/novels/:novelId/metadata', (req, res) => {
  try {
    const { novelId } = req.params;
    const updates = req.body;
    const metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    if (!metadata[novelId]) {
      return res.status(404).json({ error: 'Novel not found' });
    }
    
    // 更新元数据
    Object.assign(metadata[novelId], updates);
    
    // 保存更新后的元数据
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 重新加载服务
    powerSystemService.loadPowerSystems();
    powerSystemService.loadWritingStyles();
    powerSystemService.loadCanonProtagonists();
    powerSystemService.loadWorldviews();
    powerSystemService.loadForbiddenConcepts();
    powerSystemService.loadDetailRules();
    
    res.json({ success: true, metadata: metadata[novelId] });
  } catch (error) {
    console.error('Failed to update novel metadata:', error);
    res.status(500).json({ error: 'Failed to update novel metadata' });
  }
});

// 重新识别小说配置
app.post('/api/novels/:novelId/redetect', (req, res) => {
  try {
    const { novelId } = req.params;
    const { type } = req.body; // type: 'all', 'protagonists', 'worldview', 'forbiddenConcepts', 'detailRules'
    
    const metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    if (!metadata[novelId]) {
      return res.status(404).json({ error: 'Novel not found' });
    }
    
    const novel = metadata[novelId];
    
    // 根据类型重新识别
    if (!type || type === 'all' || type === 'protagonists') {
      const protagonists = powerSystemService.autoDetectProtagonists(novelId);
      if (protagonists.length > 0) {
        novel.canonProtagonist = protagonists;
      }
    }
    
    if (!type || type === 'all' || type === 'worldview') {
      const worldview = powerSystemService.autoDetectWorldview(novelId);
      if (worldview) {
        novel.worldview = worldview;
      }
    }
    
    if (!type || type === 'all' || type === 'forbiddenConcepts') {
      const forbiddenConcepts = powerSystemService.autoDetectForbiddenConcepts(novelId);
      if (forbiddenConcepts) {
        novel.forbiddenConcepts = forbiddenConcepts;
      }
    }
    
    if (!type || type === 'all' || type === 'detailRules') {
      const detailRules = powerSystemService.autoDetectDetailRules(novelId);
      if (detailRules) {
        novel.detailRules = detailRules;
      }
    }
    
    // 保存更新后的元数据
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    // 重新加载服务
    powerSystemService.loadPowerSystems();
    powerSystemService.loadWritingStyles();
    powerSystemService.loadCanonProtagonists();
    powerSystemService.loadWorldviews();
    powerSystemService.loadForbiddenConcepts();
    powerSystemService.loadDetailRules();
    
    res.json({ success: true, metadata: novel });
  } catch (error) {
    console.error('Failed to redetect novel configuration:', error);
    res.status(500).json({ error: 'Failed to redetect novel configuration' });
  }
});

// 获取术语库列表
app.get('/api/term-libraries', (req, res) => {
  try {
    const libraries = powerSystemService.getAvailableTermLibraries();
    res.json(libraries);
  } catch (error) {
    console.error('Failed to get term libraries:', error);
    res.status(500).json({ error: 'Failed to get term libraries' });
  }
});

// 获取特定术语库
app.get('/api/term-libraries/:libraryName', (req, res) => {
  try {
    const { libraryName } = req.params;
    const library = powerSystemService.getTermLibrary(libraryName);
    res.json(library);
  } catch (error) {
    console.error('Failed to get term library:', error);
    res.status(500).json({ error: 'Failed to get term library' });
  }
});

// 创建自定义术语库
app.post('/api/term-libraries', (req, res) => {
  try {
    const library = req.body;
    const result = powerSystemService.createCustomTermLibrary(library);
    res.json({ success: true, library: result });
  } catch (error) {
    console.error('Failed to create term library:', error);
    res.status(500).json({ error: 'Failed to create term library' });
  }
});

// 更新自定义术语库
app.put('/api/term-libraries/:libraryName', (req, res) => {
  try {
    const { libraryName } = req.params;
    const updates = req.body;
    const result = powerSystemService.updateCustomTermLibrary(libraryName, updates);
    res.json({ success: true, library: result });
  } catch (error) {
    console.error('Failed to update term library:', error);
    res.status(500).json({ error: 'Failed to update term library' });
  }
});

// 删除自定义术语库
app.delete('/api/term-libraries/:libraryName', (req, res) => {
  try {
    const { libraryName } = req.params;
    powerSystemService.deleteCustomTermLibrary(libraryName);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete term library:', error);
    res.status(500).json({ error: 'Failed to delete term library' });
  }
});

app.get('/api/health', (req, res) => {
  const warnings = refreshJsonParseWarnings();
  res.json({
    ok: true,
    timestamp: now(),
    watermark: SOFTWARE_WATERMARK,
    warningCount: warnings.length,
    warnings
  });
});

app.post('/api/test-api', async (req, res) => {
  const { apiUrl, apiKey, model } = req.body;

  if (!apiUrl || !model) {
    res.status(400).json({ error: '缺少 apiUrl 或 model' });
    return;
  }

  try {
    const targetUrl = resolveChatCompletionsUrl(apiUrl);
    console.log('Testing API connection to:', targetUrl, 'with model:', model);
    
    const response = await axios.post(
      targetUrl,
      {
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 8
      },
      {
        headers: {
          Authorization: apiKey ? `Bearer ${apiKey}` : '',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('API test successful, status:', response.status);
    res.json({ ok: true, status: response.status, targetUrl });
  } catch (error) {
    console.error('API test failed:', error.message);
    console.error('Error details:', {
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    res.status(status).json({ error: message, details: error.code });
  }
});

app.get('/api/lorebooks', (req, res) => {
  const store = readStore();
  const { characterId, chatId } = req.query;
  const allLorebooks = getAllLorebooks(store);

  const lorebooks = allLorebooks.filter((entry) => {
    if (characterId && entry.character_id !== characterId) {
      return false;
    }

    if (chatId && entry.chat_id !== chatId) {
      return false;
    }

    return true;
  });

  res.json(lorebooks.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
});

app.get('/api/presets', (req, res) => {
  const store = readStore();
  res.json([...store.presets].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')));
});

app.post('/api/presets', (req, res) => {
  const store = readStore();
  const timestamp = now();
  const preset = {
    id: uuidv4(),
    name: req.body.name || '未命名预设',
    apiUrl: req.body.apiUrl || '',
    model: req.body.model || '',
    maxTokens: Number(req.body.maxTokens) || 2000,
    temperature: Number(req.body.temperature) || 0.8,
    systemPromptPrefix: req.body.systemPromptPrefix || '',
    created_at: timestamp,
    updated_at: timestamp
  };
  store.presets.push(preset);
  writeStore(store);
  res.json(preset);
});

app.put('/api/presets/:id', (req, res) => {
  const store = readStore();
  const index = store.presets.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: '预设不存在' });
    return;
  }
  store.presets[index] = {
    ...store.presets[index],
    name: req.body.name || store.presets[index].name,
    apiUrl: req.body.apiUrl || '',
    model: req.body.model || '',
    maxTokens: Number(req.body.maxTokens) || 2000,
    temperature: Number(req.body.temperature) || 0.8,
    systemPromptPrefix: req.body.systemPromptPrefix || '',
    updated_at: now()
  };
  writeStore(store);
  res.json(store.presets[index]);
});

app.delete('/api/presets/:id', (req, res) => {
  const store = readStore();
  store.presets = store.presets.filter((item) => item.id !== req.params.id);
  writeStore(store);
  res.json({ success: true });
});

app.post('/api/lorebooks', (req, res) => {
  const store = readStore();
  const timestamp = now();
  const lorebook = {
    id: uuidv4(),
    title: req.body.title || '未命名设定',
    content: req.body.content || '',
    keywords: normalizeKeywords(req.body.keywords),
    character_id: req.body.character_id || '',
    chat_id: req.body.chat_id || '',
    enabled: req.body.enabled !== false,
    created_at: timestamp,
    updated_at: timestamp
  };

  store.lorebooks.push(lorebook);
  writeStore(store);
  res.json(lorebook);
});

app.put('/api/lorebooks/:id', (req, res) => {
  const store = readStore();
  const index = store.lorebooks.findIndex((entry) => entry.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: '世界书条目不存在' });
    return;
  }

  store.lorebooks[index] = {
    ...store.lorebooks[index],
    title: req.body.title || store.lorebooks[index].title,
    content: req.body.content || '',
    keywords: normalizeKeywords(req.body.keywords),
    character_id: req.body.character_id || '',
    chat_id: req.body.chat_id || '',
    enabled: req.body.enabled !== false,
    updated_at: now()
  };

  writeStore(store);
  res.json(store.lorebooks[index]);
});

app.delete('/api/lorebooks/:id', (req, res) => {
  const store = readStore();
  store.lorebooks = store.lorebooks.filter((entry) => entry.id !== req.params.id);
  writeStore(store);
  res.json({ success: true });
});

app.get('/api/characters', (req, res) => {
  const store = readStore();
  const characters = [...getAllCharacters(store)].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  res.json(characters);
});

app.get('/api/characters/:id', (req, res) => {
  const store = readStore();
  const character = getAllCharacters(store).find((item) => item.id === req.params.id);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }
  res.json(character);
});

app.post('/api/characters', (req, res) => {
  const store = readStore();
  const timestamp = now();
  const character = {
    id: uuidv4(),
    ...createCharacterRecord(req.body, timestamp)
  };

  // 验证角色背景（如果提供了小说ID）
  if (req.body.novel_id && req.body.type) {
    const characterValidator = require('./character-validator');
    const validation = characterValidator.validateCharacter(
      req.body.novel_id,
      character
    );
    
    if (!validation.valid) {
      console.warn('[Character Validation] Character background validation failed:', validation.errors);
      // 返回错误信息，让用户知道问题所在
      return res.status(400).json({ 
        error: '角色背景验证失败',
        details: validation.errors,
        suggestions: characterValidator.suggestBackgroundCorrection(
          req.body.novel_id,
          req.body.type,
          character.scenario || ''
        )
      });
    }
  }

  store.characters.push(character);
  writeStore(store);
  res.json(character);
});

app.put('/api/characters/:id', (req, res) => {
  const store = readStore();
  const index = store.characters.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }

  const updatedCharacter = createCharacterRecord(req.body, now(), store.characters[index]);

  // 验证角色背景（如果提供了小说ID）
  if (req.body.novel_id && req.body.type) {
    const characterValidator = require('./character-validator');
    const validation = characterValidator.validateCharacter(
      req.body.novel_id,
      updatedCharacter
    );
    
    if (!validation.valid) {
      console.warn('[Character Validation] Character background validation failed:', validation.errors);
      return res.status(400).json({ 
        error: '角色背景验证失败',
        details: validation.errors,
        suggestions: characterValidator.suggestBackgroundCorrection(
          req.body.novel_id,
          req.body.type,
          updatedCharacter.scenario || ''
        )
      });
    }
  }

  store.characters[index] = updatedCharacter;
  writeStore(store);
  res.json(store.characters[index]);
});

app.delete('/api/characters/:id', (req, res) => {
  const store = readStore();
  const allCharacters = getAllCharacters(store);
  const targetCharacter = allCharacters.find((item) => item.id === req.params.id);
  if (!targetCharacter) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }
  if (targetCharacter.source === 'file') {
    res.status(400).json({ error: '文件来源角色为只读，请修改 characters 目录中的 JSON 文件' });
    return;
  }
  store.characters = store.characters.filter((item) => item.id !== req.params.id);
  const deletedChatIds = store.chats.filter((item) => item.character_id === req.params.id).map((item) => item.id);
  store.chats = store.chats.filter((item) => item.character_id !== req.params.id);
  store.messages = store.messages.filter((item) => !deletedChatIds.includes(item.chat_id));
  writeStore(store);
  res.json({ success: true });
});

app.post('/api/characters/import', (req, res) => {
  const characterData = req.body;
  const store = readStore();
  const timestamp = now();
  const character = {
    id: uuidv4(),
    ...createCharacterRecord(characterData, timestamp)
  };
  store.characters.push(character);
  writeStore(store);
  res.json(character);
});

app.get('/api/characters/:id/chats', (req, res) => {
  const store = readStore();
  const chats = store.chats
    .filter((item) => item.character_id === req.params.id)
    .map((item) => ({
      ...item,
      favorite: item.favorite === true,
      branch_from_chat_id: item.branch_from_chat_id || '',
      branch_from_message_id: item.branch_from_message_id || '',
      summary: item.summary || ''
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  res.json(chats);
});

app.get('/api/characters/:id/chat-search', (req, res) => {
  const store = readStore();
  const query = String(req.query.q || '').trim().toLowerCase();
  if (!query) {
    res.json([]);
    return;
  }

  const chats = store.chats.filter((item) => item.character_id === req.params.id);
  const results = chats
    .map((chat) => {
      const messages = getChatMessages(store, chat.id);
      const matchedMessages = messages.filter((message) => String(message.content || '').toLowerCase().includes(query));
      const titleMatched = String(chat.title || '').toLowerCase().includes(query);
      if (!titleMatched && matchedMessages.length === 0) {
        return null;
      }
      return {
        chat_id: chat.id,
        chat_title: chat.title,
        favorite: chat.favorite === true,
        branch_from_chat_id: chat.branch_from_chat_id || '',
        match_count: matchedMessages.length,
        preview: String(matchedMessages[0]?.content || chat.summary || '').slice(0, 120)
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.favorite !== b.favorite) {
        return a.favorite ? -1 : 1;
      }
      return b.match_count - a.match_count;
    });

  res.json(results);
});

app.put('/api/characters/:id/favorite', (req, res) => {
  const store = readStore();
  const allCharacters = getAllCharacters(store);
  const targetCharacter = allCharacters.find((item) => item.id === req.params.id);
  if (targetCharacter?.source === 'file') {
    res.status(400).json({ error: '文件来源角色为只读，无法修改收藏状态' });
    return;
  }
  const index = store.characters.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }
  store.characters[index] = {
    ...store.characters[index],
    favorite: req.body.favorite === true,
    updated_at: now()
  };
  writeStore(store);
  res.json(store.characters[index]);
});

app.post('/api/chats', (req, res) => {
  const { character_id, title, branch_from_chat_id, branch_from_message_id } = req.body;
  const store = readStore();

  const character = getAllCharacters(store).find((item) => item.id === character_id);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }

  if (branch_from_chat_id && !store.chats.find((item) => item.id === branch_from_chat_id)) {
    res.status(404).json({ error: '分支来源对话不存在' });
    return;
  }

  const timestamp = now();
  const chat = {
    id: uuidv4(),
    character_id,
    title: title || '新对话',
    summary: '',
    favorite: false,
    branch_from_chat_id: branch_from_chat_id || '',
    branch_from_message_id: branch_from_message_id || '',
    created_at: timestamp,
    updated_at: timestamp
  };
  store.chats.push(chat);

  if (branch_from_chat_id) {
    const sourceMessages = getChatMessages(store, branch_from_chat_id);
    const cutoffIndex = branch_from_message_id
      ? sourceMessages.findIndex((item) => item.id === branch_from_message_id)
      : sourceMessages.length - 1;
    const branchMessages = sourceMessages.slice(0, cutoffIndex + 1).map((message) => ({
      ...message,
      id: uuidv4(),
      chat_id: chat.id,
      branched_from_message_id: message.id,
      created_at: now()
    }));
    store.messages.push(...branchMessages);
  }

  writeStore(store);
  res.json(chat);
});

app.get('/api/chats/:id/messages', (req, res) => {
  const store = readStore();
  const messages = getChatMessages(store, req.params.id);
  res.json(messages);
});

app.get('/api/chats/:id/export', (req, res) => {
  const store = readStore();
  const chat = store.chats.find((item) => item.id === req.params.id);
  if (!chat) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  const character = getAllCharacters(store).find((item) => item.id === chat.character_id) || null;
  const messages = getChatMessages(store, chat.id);
  res.json({
    exported_at: now(),
    watermark: SOFTWARE_WATERMARK,
    copyright_notice: SOFTWARE_WATERMARK,
    chat,
    character,
    messages
  });
});

app.put('/api/chats/:id/favorite', (req, res) => {
  const store = readStore();
  const index = store.chats.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  store.chats[index] = {
    ...store.chats[index],
    favorite: req.body.favorite === true,
    updated_at: now()
  };
  writeStore(store);
  res.json(store.chats[index]);
});

app.post('/api/chats/import', (req, res) => {
  const { character_id, chat, messages } = req.body;
  if (!character_id || !Array.isArray(messages)) {
    res.status(400).json({ error: '缺少 character_id 或 messages' });
    return;
  }

  const store = readStore();
  const character = getAllCharacters(store).find((item) => item.id === character_id);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }

  const timestamp = now();
  const newChat = {
    id: uuidv4(),
    character_id,
    title: chat?.title ? `${chat.title}（导入）` : '导入对话',
    summary: chat?.summary || '',
    favorite: false,
    branch_from_chat_id: '',
    branch_from_message_id: '',
    created_at: timestamp,
    updated_at: timestamp
  };

  store.chats.push(newChat);
  const importedMessages = messages
    .filter((item) => item && (item.content || item.role))
    .map((item) => ({
    id: uuidv4(),
    chat_id: newChat.id,
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item.content || ''),
    created_at: item.created_at || now()
  }));
  store.messages.push(...importedMessages);
  writeStore(store);
  res.json(newChat);
});

app.put('/api/messages/:id', (req, res) => {
  const store = readStore();
  const messageIndex = store.messages.findIndex((item) => item.id === req.params.id);

  if (messageIndex === -1) {
    res.status(404).json({ error: '消息不存在' });
    return;
  }

  const message = store.messages[messageIndex];
  store.messages[messageIndex] = {
    ...message,
    content: req.body.content || message.content,
    updated_at: now()
  };

  const chatIndex = store.chats.findIndex((item) => item.id === message.chat_id);
  if (chatIndex !== -1) {
    store.chats[chatIndex].updated_at = now();
  }

  writeStore(store);
  res.json(store.messages[messageIndex]);
});

app.post('/api/chats/:id/summarize', (req, res) => {
  const store = readStore();
  const chatIndex = store.chats.findIndex((item) => item.id === req.params.id);

  if (chatIndex === -1) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const messages = getChatMessages(store, req.params.id);
  const summary = req.body.summary || buildSummaryText(messages);
  store.chats[chatIndex].summary = summary;
  store.chats[chatIndex].updated_at = now();
  writeStore(store);
  res.json({ summary });
});

// ===================== 长期记忆 API =====================
// 查看某 chat 的全部记忆（按重要性排序）
app.get('/api/chats/:id/memories', (req, res, next) => {
  try {
    const store = readStore();
    const chat = store.chats.find(c => c.id === req.params.id);
    if (!chat) throw new HttpError(404, '对话不存在');
    const memories = Array.isArray(chat.memories) ? chat.memories : [];
    res.json([...memories].sort((a, b) => (b.importance || 0) - (a.importance || 0)));
  } catch (e) { next(e); }
});

// 手动添加一条记忆
app.post('/api/chats/:id/memories', (req, res, next) => {
  try {
    const content = requireString(req.body?.content, 'content', { maxLen: 600 });
    const store = readStore();
    const chatIndex = store.chats.findIndex(c => c.id === req.params.id);
    if (chatIndex === -1) throw new HttpError(404, '对话不存在');
    const memories = Array.isArray(store.chats[chatIndex].memories) ? store.chats[chatIndex].memories : [];
    const newMem = {
      id: uuidv4(),
      content,
      role: req.body.role === 'assistant' ? 'assistant' : 'user',
      importance: clamp(Number(req.body.importance) || 80, 0, 100),
      mention_count: 1,
      created_at: now(),
      keywords: tokenizeForRetrieval(content).slice(0, 30)
    };
    memories.push(newMem);
    store.chats[chatIndex].memories = memories;
    writeStore(store);
    res.json(newMem);
  } catch (e) { next(e); }
});

// 删除一条记忆
app.delete('/api/chats/:id/memories/:memoryId', (req, res, next) => {
  try {
    const store = readStore();
    const chatIndex = store.chats.findIndex(c => c.id === req.params.id);
    if (chatIndex === -1) throw new HttpError(404, '对话不存在');
    const memories = Array.isArray(store.chats[chatIndex].memories) ? store.chats[chatIndex].memories : [];
    const before = memories.length;
    store.chats[chatIndex].memories = memories.filter(m => m.id !== req.params.memoryId);
    if (store.chats[chatIndex].memories.length === before) throw new HttpError(404, '记忆不存在');
    writeStore(store);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// 手动触发 LLM 抽取（同步等待结果；用于调试或用户手动刷新）
app.post('/api/chats/:id/memories/extract', async (req, res, next) => {
  try {
    const chatId = req.params.id;
    const store = readStore();
    if (!store.chats.find(c => c.id === chatId)) throw new HttpError(404, '对话不存在');
    // 重置节流，强制立即执行
    _llmMemoryLastRunAt.delete(chatId);
    const result = await llmExtractMemoriesAsync(chatId);
    res.json(result);
  } catch (e) { next(e); }
});

// 查看 LLM 抽取队列状态
app.get('/api/chats/:id/memories/status', (req, res, next) => {
  try {
    const chatId = req.params.id;
    const running = _llmMemoryRunning.get(chatId) || false;
    const lastRunAt = _llmMemoryLastRunAt.get(chatId) || 0;
    res.json({
      running,
      lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
      cooldownMs: lastRunAt ? Math.max(0, LLM_MEMORY_MIN_INTERVAL - (Date.now() - lastRunAt)) : 0
    });
  } catch (e) { next(e); }
});

// 用便宜模型对记忆做 LLM 压缩/合并：合并语义相近条目，节省后续 prompt token
app.post('/api/chats/:id/memories/compress', async (req, res, next) => {
  try {
    const store = readStore();
    const chatIndex = store.chats.findIndex(c => c.id === req.params.id);
    if (chatIndex === -1) throw new HttpError(404, '对话不存在');
    const chat = store.chats[chatIndex];
    const memories = Array.isArray(chat.memories) ? chat.memories : [];
    if (memories.length < 5) {
      return res.json({ message: '记忆数量较少，无需压缩', memories });
    }

    const settings = store.settings || {};
    const apiKey = settings.apiKey;
    if (!apiKey) throw new HttpError(400, '请先在设置中填写 API 密钥');

    const compressModel = settings.summaryModel || settings.model || 'gpt-3.5-turbo';
    const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);

    const memoryListText = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
    const compressPrompt = `你是一个信息整理助手。请将下列记忆条目去重、合并语义相近内容，输出更精炼的记忆列表（10-25 条）。每条不超过 100 字，保留人物、地点、决策、承诺等关键事实。仅输出 JSON 数组：[{"content":"...","importance":0-100}]，不要其他解释。

记忆原文：
${memoryListText}`;

    const response = await axios.post(targetUrl, {
      model: compressModel,
      messages: [
        { role: 'system', content: '你是一个精确、不胡编的信息整理助手。只输出 JSON 数组，不输出其他文字。' },
        { role: 'user', content: compressPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2000
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const raw = response.data?.choices?.[0]?.message?.content || '';
    let compressed;
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      compressed = JSON.parse(match ? match[0] : raw);
    } catch {
      throw new HttpError(500, '压缩结果解析失败：' + raw.slice(0, 200));
    }
    if (!Array.isArray(compressed)) throw new HttpError(500, '压缩结果格式错误');

    const newMemories = compressed
      .filter(item => item && typeof item.content === 'string')
      .slice(0, 30)
      .map(item => ({
        id: uuidv4(),
        content: String(item.content).slice(0, 400),
        role: 'assistant',
        importance: clamp(Number(item.importance) || 60, 0, 100),
        mention_count: 1,
        created_at: now(),
        keywords: tokenizeForRetrieval(item.content).slice(0, 30)
      }));

    store.chats[chatIndex].memories = newMemories;
    writeStore(store);
    console.log(`[memory] chat=${req.params.id} \u538b\u7f29 ${memories.length} \u2192 ${newMemories.length}`);
    res.json({ before: memories.length, after: newMemories.length, memories: newMemories });
  } catch (e) { next(e); }
});

app.get('/api/chats/:id/lorebook-debug', (req, res) => {
  const chatId = req.params.id;
  const store = readStore();
  const allCharacters = getAllCharacters(store);
  const allLorebooks = getAllLorebooks(store);
  const chat = store.chats.find((item) => item.id === chatId);

  if (!chat) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const character = allCharacters.find((item) => item.id === chat.character_id);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return;
  }

  const messages = getChatMessages(store, chatId);
  const latestContextText = messages.slice(-10).map((item) => item.content).join('\n');
  const sourceText = `${character.description}\n${character.scenario}\n${latestContextText}`;
  const sourceLower = sourceText.toLowerCase();
  const scopedLorebooks = allLorebooks.filter((entry) => {
    if (!entry.enabled) {
      return false;
    }

    if (entry.chat_id && entry.chat_id !== chatId) {
      return false;
    }

    if (entry.character_id && entry.character_id !== character.id) {
      return false;
    }

    return true;
  });

  const triggeredLorebooks = buildTriggeredLorebooks(store, chatId, character.id, sourceText).map((entry) => {
    const keywords = normalizeKeywords(entry.keywords);
    const matchedKeywords = keywords.filter((keyword) => sourceLower.includes(keyword.toLowerCase()));
    return {
      id: entry.id,
      title: entry.title || '未命名条目',
      content_preview: String(entry.content || '').slice(0, 180),
      keywords,
      matched_keywords: matchedKeywords,
      scope: entry.chat_id ? 'chat' : (entry.character_id ? 'character' : 'global')
    };
  });

  res.json({
    triggered: triggeredLorebooks,
    triggeredCount: triggeredLorebooks.length,
    candidateCount: scopedLorebooks.length,
    contextPreview: latestContextText.slice(-1200)
  });
});

app.post('/api/chats/:id/messages', (req, res) => {
  const { content, role } = req.body;
  const chatId = req.params.id;
  const store = readStore();

  const chatIndex = store.chats.findIndex((item) => item.id === chatId);
  if (chatIndex === -1) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }

  const normalizedRole = role === 'assistant' ? 'assistant' : 'user';
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  const message = {
    id: uuidv4(),
    chat_id: chatId,
    role: normalizedRole,
    content: normalizedContent,
    created_at: now()
  };
  store.messages.push(message);

  const currentChatMessages = getChatMessages(store, chatId);
  if (normalizedRole === 'user' && currentChatMessages.filter((item) => item.role === 'user').length === 1) {
    const currentTitle = store.chats[chatIndex].title || '';
    if (!currentTitle || /^对话\s*\d+$/.test(currentTitle) || currentTitle === '新对话') {
      store.chats[chatIndex].title = normalizedContent.slice(0, 24) || '新对话';
    }
  }
  store.chats[chatIndex].updated_at = now();
  writeStore(store);
  res.json(message);
});

app.post('/api/chats/:id/generate', async (req, res) => {
  const chatId = req.params.id;
  const { apiUrl, apiKey, model, maxTokens, temperature, regenerate, presetId, contextMode } = req.body;

  try {
    if (!apiKey) {
      res.status(400).json({ error: '请先在设置中填写 API 密钥' });
      return;
    }

    const store = readStore();
    const chat = store.chats.find((item) => item.id === chatId);
    if (!chat) {
      res.status(404).json({ error: '对话不存在' });
      return;
    }

    const character = getAllCharacters(store).find((item) => item.id === chat.character_id);
    if (!character) {
      res.status(404).json({ error: '角色不存在' });
      return;
    }

    if (regenerate) {
      const chatMessages = getChatMessages(store, chatId);
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage?.role === 'assistant') {
        store.messages = store.messages.filter((item) => item.id !== lastMessage.id);
        writeStore(store);
      }
    }

    // ===== 短回复缓存命中：直接以流式格式返回，跳过 LLM 调用 =====
    if (!regenerate) {
      const lastUserMsgForCache = [...getChatMessages(store, chatId)].reverse().find(m => m.role === 'user');
      const cachedReply = lastUserMsgForCache ? getCachedShortReply(chat.character_id, lastUserMsgForCache.content) : null;
      if (cachedReply) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // 模拟流式输出
        const cs = cachedReply;
        for (let i = 0; i < cs.length; i += 8) {
          res.write(`data: ${JSON.stringify({ content: cs.slice(i, i + 8) })}\n\n`);
        }
        // 持久化到 messages
        const cachedStore = readStore();
        cachedStore.messages.push({
          id: uuidv4(),
          chat_id: chatId,
          role: 'assistant',
          content: cs,
          created_at: now()
        });
        const ci = cachedStore.chats.findIndex(c => c.id === chatId);
        if (ci !== -1) cachedStore.chats[ci].updated_at = now();
        writeStore(cachedStore);
        res.write('data: [DONE]\n\n');
        res.end();
        console.log(`[cache] \u547d\u4e2d\u77ed\u56de\u590d\u7f13\u5b58: "${lastUserMsgForCache.content.slice(0, 20)}"`);
        return;
      }
    }

    const freshStore = readStore();
    const defaultPresetId = freshStore.settings?.activePresetId || '';
    const effectivePresetId = presetId || defaultPresetId;
    const selectedPreset = effectivePresetId ? freshStore.presets.find((item) => item.id === effectivePresetId) : null;
    const messages = getChatMessages(freshStore, chatId);
    const resolvedContextMode = Object.prototype.hasOwnProperty.call(CONTEXT_MODES, contextMode)
      ? contextMode
      : (Object.prototype.hasOwnProperty.call(CONTEXT_MODES, freshStore.settings?.contextMode) ? freshStore.settings.contextMode : SETTINGS_DEFAULTS.contextMode);
    const contextTuning = CONTEXT_MODES[resolvedContextMode] || CONTEXT_MODES.balanced;

    const requestedOutputTokens = Number(maxTokens ?? selectedPreset?.maxTokens ?? 2000);
    const safeOutputTokens = clamp(Number.isFinite(requestedOutputTokens) ? requestedOutputTokens : 2000, 256, contextTuning.outputTokenMax);
    const contextTokenBudget = clamp(
      Math.floor(safeOutputTokens * contextTuning.contextBudgetFactor + contextTuning.contextBudgetBase),
      1800,
      contextTuning.contextBudgetMax
    );
    const contextCharBudget = contextTokenBudget * 4;

    const summarySeed = String(chat.summary || '').trim();
    const summaryText = String(summarySeed || buildSummaryText(messages)).slice(0, contextTuning.summaryLimit);
    const selectedMessages = selectContextMessages(messages, contextCharBudget, {
      sampleStep: contextTuning.sampleStep,
      tailWindow: resolvedContextMode === 'stability' ? 16 : 12
    });
    const latestContextText = selectedMessages.slice(-10).map((item) => item.content).join('\n');
    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');

    const triggeredLorebooks = buildTriggeredLorebooks(freshStore, chatId, character.id, `${character.description}\n${character.scenario}\n${latestContextText}`);
    const lorebookBlock = triggeredLorebooks.length > 0
      ? triggeredLorebooks
        .slice(0, contextTuning.lorebookCount)
        .map((entry) => `- ${entry.title}: ${String(entry.content || '').slice(0, contextTuning.lorebookItemLimit)}`)
        .join('\n')
        .slice(0, contextTuning.lorebookBlockLimit)
      : '';
    const summaryBlock = summaryText ? `\n对话摘要：${summaryText}` : '';
    const canonBlock = buildCharacterCanonBlock(character);
    const recentIntentBlock = lastUserMessage ? `\n用户最近意图：${String(lastUserMessage.content || '').slice(0, 320)}` : '';

    // ===== 长期记忆检索 =====
    const memoryEnabled = freshStore.settings?.longTermMemory !== false;
    let memoryBlock = '';
    if (memoryEnabled && Array.isArray(chat.memories) && chat.memories.length > 0) {
      // 用最近用户意图 + 摘要 + 最新 3 条消息作为查询
      const queryText = [
        lastUserMessage?.content || '',
        summaryText.slice(0, 400),
        selectedMessages.slice(-3).map(m => m.content).join('\n')
      ].join('\n');
      const top = retrieveRelevantMemories(chat.memories, queryText, 5);
      if (top.length > 0) {
        memoryBlock = `\n【长期记忆 - 必须遵守】\n${formatMemoryBlock(top)}`;
      }
    }

    const presetPrompt = selectedPreset?.systemPromptPrefix ? `${selectedPreset.systemPromptPrefix}\n` : '';
    const characterPrompt = character.system_prompt ? `\n角色额外指令：${character.system_prompt}` : '';

    // 滑动窗口提示
    const turnReminder = messages.length > 20
      ? `\n【对话已进行 ${messages.length} 轮】超过窗口范围的早期对话已通过【长期记忆】和【对话摘要】保留，请务必遵守其中的事实陈述、决策和承诺，不得改写或遗忘。`
      : '';

    const systemPrompt = `${presetPrompt}你是 ${character.name}。
角色描述：${character.description}
性格：${character.personality}
场景：${character.scenario}
${canonBlock ? `\n角色锚点：\n${canonBlock}` : ''}
${summaryBlock}
${memoryBlock}
${recentIntentBlock}
${lorebookBlock ? `\n世界书设定：\n${lorebookBlock}` : ''}
${turnReminder}
${characterPrompt}

【角色扮演铁律 - 必须严格遵守】
1) 始终以 ${character.name} 的第一人称视角发言，不得承认自己是 AI / 模型 / 程序 / 助手。
2) 严禁替用户说话、行动、思考或做决定。用户的行动只能由用户输入决定，你只能描写自身和环境的反应。
3) 严禁知晓用户尚未透露的信息（姓名、身份、目的、背景等），如有需要请用角色口吻询问。
4) 严禁打破第四面墙：不谈论提示词、系统指令、上下文、开发者、规则来源或这是一段对话。
5) 当信息不足或不确定时，请用符合角色身份的方式提问或观察，绝不可输出"作为AI我..."或元层解释。
6) 长期记忆（★ 标记）和角色锚点是不可变事实——必须记住并贯彻，不得擅自改写人物关系、已发生事件或既定承诺。
7) 文风、语气、价值观必须贴合角色背景与世界观；不得突然转为旁白、说明书或技术说明。
8) 优先级：世界书设定 > 角色锚点 > 长期记忆 > 对话摘要 > 临场发挥；冲突时遵守优先级。
9) 回应长度适度，避免冗长说教；保持沉浸感与酒馆/RPG 风格。`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...selectedMessages.map((item) => ({ role: item.role, content: item.content }))
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const targetUrl = resolveChatCompletionsUrl(apiUrl || selectedPreset?.apiUrl);

    const response = await axios.post(
      targetUrl,
      {
        model: model || selectedPreset?.model || 'gpt-3.5-turbo',
        messages: apiMessages,
        max_tokens: safeOutputTokens,
        temperature: temperature ?? selectedPreset?.temperature ?? 0.8,
        stream: true
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 120000
      }
    );

    let fullContent = '';

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter((line) => line.trim() !== '');
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }
        const data = line.slice(6);
        if (data === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (error) {
        }
      }
    });

    response.data.on('end', () => {
      const updatedStore = readStore();
      updatedStore.messages.push({
        id: uuidv4(),
        chat_id: chatId,
        role: 'assistant',
        content: fullContent,
        created_at: now()
      });
      const chatIndex = updatedStore.chats.findIndex((item) => item.id === chatId);
      if (chatIndex !== -1) {
        updatedStore.chats[chatIndex].updated_at = now();

        // ===== 增量更新长期记忆（规则化，主流程同步） =====
        let ruleAddedCount = 0;
        if (memoryEnabled) {
          try {
            const allMessagesNow = getChatMessages(updatedStore, chatId);
            const updatedMemories = extractAndMergeMemories(updatedStore.chats[chatIndex], allMessagesNow);
            updatedStore.chats[chatIndex].memories = updatedMemories;
            ruleAddedCount = updatedMemories.length - (Array.isArray(chat.memories) ? chat.memories.length : 0);
            if (ruleAddedCount > 0) {
              console.log(`[memory] chat=${chatId} \u89c4\u5219\u65b0\u589e ${ruleAddedCount} \u6761, \u603b\u8ba1 ${updatedMemories.length}`);
            }
          } catch (e) {
            console.error('[memory] \u62bd\u53d6\u5931\u8d25:', e.message);
          }
        }

        const totalMsgs = getChatMessages(updatedStore, chatId).length;

        // ===== 异步 LLM 抽取（不阻塞响应；节流 60s/chat） =====
        // 触发条件：消息总数 >= 4，且本轮规则化命中 ≥1 条 OR 距上次 LLM 抽取已 >2 分钟
        if (memoryEnabled) {
          try {
            const lastLlmRun = _llmMemoryLastRunAt.get(chatId) || 0;
            const elapsedSinceLast = Date.now() - lastLlmRun;
            const shouldTrigger = totalMsgs >= 4 && (ruleAddedCount > 0 || elapsedSinceLast > 2 * 60 * 1000);
            if (shouldTrigger) {
              triggerLlmMemoryExtraction(chatId);
            }
          } catch (e) { /* ignore */ }
        }

        // ===== 滚动摘要：每 10 轮重建一次 =====
        if (totalMsgs > 0 && totalMsgs % 10 === 0) {
          try {
            const newSummary = buildSummaryText(getChatMessages(updatedStore, chatId));
            updatedStore.chats[chatIndex].summary = newSummary;
            console.log(`[summary] chat=${chatId} \u6eda\u52a8\u6458\u8981\u5237\u65b0 (${totalMsgs} \u8f6e)`);
          } catch (e) {
            console.error('[summary] \u751f\u6210\u5931\u8d25:', e.message);
          }
        }
      }
      writeStore(updatedStore);

      // ===== 短回复缓存写入：仅短输入 + 短输出才缓存 =====
      try {
        const userMsg = lastUserMessage;
        if (userMsg && fullContent && fullContent.length <= 280 && fullContent.length >= 8) {
          setCachedShortReply(chat.character_id, userMsg.content, fullContent);
        }
      } catch (e) { /* ignore */ }

      res.write('data: [DONE]\n\n');
      res.end();
    });
  } catch (error) {
    console.error('生成失败:', error);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    res.status(status).json({ error: '生成失败: ' + message });
  }
});

app.post('/api/settings', (req, res, next) => {
  try {
    const key = requireSafeKey(req.body?.key, 'key');
    const { value } = req.body || {};
    // 值只允许 JSON 可序列化的原始类型或简单对象
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new HttpError(400, 'value 类型不合法');
    }
    const store = readStore();
    store.settings[key] = value;
    writeStore(store);
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.post('/api/settings/auto-update', (req, res) => {
  const store = readStore();
  const settings = store.settings && typeof store.settings === 'object' ? { ...store.settings } : {};
  const updatedKeys = [];

  // 只添加缺失的键，不覆盖已存在的有效值
  Object.entries(SETTINGS_DEFAULTS).forEach(([key, defaultValue]) => {
    if (!Object.prototype.hasOwnProperty.call(settings, key) || settings[key] === undefined || settings[key] === null) {
      settings[key] = defaultValue;
      updatedKeys.push(key);
    }
  });

  // 只在值无效时才重置
  const normalizedMaxTokens = Number(settings.maxTokens);
  if (!Number.isFinite(normalizedMaxTokens) || normalizedMaxTokens <= 0) {
    settings.maxTokens = SETTINGS_DEFAULTS.maxTokens;
    if (!updatedKeys.includes('maxTokens')) {
      updatedKeys.push('maxTokens');
    }
  }

  const normalizedTemperature = Number(settings.temperature);
  if (!Number.isFinite(normalizedTemperature) || normalizedTemperature < 0 || normalizedTemperature > 2) {
    settings.temperature = SETTINGS_DEFAULTS.temperature;
    if (!updatedKeys.includes('temperature')) {
      updatedKeys.push('temperature');
    }
  }

  if (typeof settings.activePresetId !== 'string') {
    settings.activePresetId = SETTINGS_DEFAULTS.activePresetId;
    if (!updatedKeys.includes('activePresetId')) {
      updatedKeys.push('activePresetId');
    }
  }

  if (!Object.prototype.hasOwnProperty.call(CONTEXT_MODES, settings.contextMode)) {
    settings.contextMode = SETTINGS_DEFAULTS.contextMode;
    if (!updatedKeys.includes('contextMode')) {
      updatedKeys.push('contextMode');
    }
  }

  // 只在API URL为空或无效时才使用默认值
  const currentApiUrl = String(settings.apiUrl || '').trim();
  if (!currentApiUrl) {
    const resolvedApiUrl = resolveChatCompletionsUrl(currentApiUrl);
    settings.apiUrl = resolvedApiUrl;
    if (!updatedKeys.includes('apiUrl')) {
      updatedKeys.push('apiUrl');
    }
  }

  if (updatedKeys.length > 0) {
    store.settings = settings;
    writeStore(store);
  }

  res.json({
    updated: updatedKeys.length > 0,
    updatedKeys,
    settings,
    message: updatedKeys.length > 0 ? `已自动更新配置：${updatedKeys.join('、')}` : '配置已是最新'
  });
});

app.get('/api/settings/:key', (req, res) => {
  const store = readStore();
  res.json(Object.prototype.hasOwnProperty.call(store.settings, req.params.key) ? store.settings[req.params.key] : null);
});

app.get('/api/settings', (req, res) => {
  const store = readStore();
  res.json(store.settings || {});
});

app.get('/api/chats/:id', (req, res) => {
  const store = readStore();
  const chat = store.chats.find((item) => item.id === req.params.id);
  if (!chat) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  const branchChat = chat.branch_from_chat_id ? store.chats.find((item) => item.id === chat.branch_from_chat_id) : null;
  const branchMessage = chat.branch_from_message_id ? store.messages.find((item) => item.id === chat.branch_from_message_id) : null;
  res.json({
    ...chat,
    branch_from_chat: branchChat || null,
    branch_from_message: branchMessage || null
  });
});

app.delete('/api/chats/:id', (req, res) => {
  const store = readStore();
  store.messages = store.messages.filter((item) => item.chat_id !== req.params.id);
  store.chats = store.chats.filter((item) => item.id !== req.params.id);
  store.lorebooks = store.lorebooks.filter((item) => item.chat_id !== req.params.id);
  writeStore(store);
  res.json({ success: true });
});

// Story API - 故事管理
app.get('/api/stories', (req, res) => {
  const store = readStore();
  const stories = store.stories.map(story => {
    const storyCharacters = store.storyCharacters.filter(sc => sc.story_id === story.id);
    const storyLorebooks = store.storyLorebooks.filter(sl => sl.story_id === story.id);
    const mainCharacter = storyCharacters.find(sc => sc.role === 'protagonist');
    const supportingCharacters = storyCharacters.filter(sc => sc.role === 'supporting');
    
    return {
      ...story,
      main_character_id: mainCharacter?.character_id || null,
      supporting_character_ids: supportingCharacters.map(sc => sc.character_id),
      lorebook_ids: storyLorebooks.map(sl => sl.lorebook_id),
      character_count: storyCharacters.length,
      lorebook_count: storyLorebooks.length
    };
  });
  res.json(stories);
});

app.get('/api/stories/:id', (req, res) => {
  const store = readStore();
  const story = store.stories.find(s => s.id === req.params.id);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }

  const light = req.query.light === 'true';

  const storyCharacters = store.storyCharacters.filter(sc => sc.story_id === story.id);
  const storyLorebooks = store.storyLorebooks.filter(sl => sl.story_id === story.id);
  const storyEvents = store.storyEvents.filter(se => se.story_id === story.id);
  const storyNPCs = store.storyNPCs.filter(sn => sn.story_id === story.id);
  const storyRelationships = store.storyRelationships.filter(sr => sr.story_id === story.id);
  const storyHistory = store.storyHistory.filter(sh => sh.story_id === story.id);

  const mainCharacter = storyCharacters.find(sc => sc.role === 'protagonist');
  const supportingCharacters = storyCharacters.filter(sc => sc.role === 'supporting');

  // Light 模式：只返回角色 ID，不解析完整对象；只返回最近 5 条历史
  if (light) {
    res.json({
      id: story.id,
      title: story.title,
      description: story.description,
      main_character_id: mainCharacter?.character_id || null,
      supporting_character_ids: supportingCharacters.map(sc => sc.character_id),
      lorebook_ids: storyLorebooks.map(sl => sl.lorebook_id),
      current_event_id: story.current_event_id,
      state: story.state,
      created_at: story.created_at,
      updated_at: story.updated_at,
      summary: story.summary,
      character_count: storyCharacters.length,
      lorebook_count: storyLorebooks.length,
      events_count: storyEvents.length,
      history_count: storyHistory.length
    });
    return;
  }

  // 完整模式：解析角色对象，返回完整数据
  const allCharacters = getAllCharacters(store);

  // 解析角色ID为实际角色对象
  const mainCharacterData = mainCharacter ? allCharacters.find(c => c.id === mainCharacter.character_id) || null : null;
  const supportingCharactersData = supportingCharacters
    .map(sc => allCharacters.find(c => c.id === sc.character_id))
    .filter(Boolean);

  console.log('[Story API] Story:', story.id, 'Main character:', mainCharacterData?.name, 'Supporting:', supportingCharactersData.length);
  console.log('[Story API] NPCs:', storyNPCs.length, 'Relationships:', storyRelationships.length);

  res.json({
    ...story,
    main_character: mainCharacterData,
    supporting_characters: supportingCharactersData,
    lorebooks: storyLorebooks || [],
    events: storyEvents || [],
    npcs: storyNPCs || [],
    relationships: storyRelationships || [],
    history: storyHistory || []
  });
});

// 故事初始化API
app.post('/api/stories/:id/initialize', async (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.id);
    if (!story) {
      res.status(404).json({ error: '故事不存在' });
      return;
    }

    // 检查是否已经初始化
    if (story.current_event_id) {
      res.json({ success: true, message: '故事已经初始化', current_event_id: story.current_event_id });
      return;
    }

    // 加载框架文件
    if (!story.metadata?.framework_path) {
      res.status(400).json({ error: '故事没有关联框架' });
      return;
    }

    const frameworkPath = path.join(__dirname, '..', story.metadata.framework_path);
    if (!fs.existsSync(frameworkPath)) {
      res.status(404).json({ error: '框架文件不存在' });
      return;
    }

    const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));

    // 创建初始事件
    const initialEvent = {
      id: uuidv4(),
      story_id: story.id,
      chapter_index: framework.settings?.startChapter || 0,
      title: '故事开始',
      description: framework.openingLines?.narrator || '故事开始了...',
      phase: '初期',
      choices: [],
      created_at: now()
    };

    store.storyEvents.push(initialEvent);

    // 更新故事的当前事件ID
    story.current_event_id = initialEvent.id;
    story.updated_at = now();

    writeStore(store);

    res.json({
      success: true,
      message: '故事初始化成功',
      event_id: initialEvent.id,
      event: initialEvent
    });
  } catch (error) {
    console.error('故事初始化失败:', error);
    res.status(500).json({ error: '故事初始化失败: ' + error.message });
  }
});

// 全局测试中断标志
let testInterrupted = false;

// 故事测试API
app.post('/api/stories/test', async (req, res) => {
  try {
    const { storyIds, timeLimit, autoAdvance } = req.body;
    const StoryTester = require('./story-tester');
    
    testInterrupted = false; // 重置中断标志
    const tester = new StoryTester();
    const tavernData = tester.loadStoryData();
    
    if (!tavernData) {
      res.status(500).json({ error: '无法加载故事数据' });
      return;
    }
    
    const storiesToTest = tavernData.stories.filter(s => storyIds.includes(s.id));
    
    if (autoAdvance) {
      // 自动推进模式：自动选择选项并推进故事
      const autoAdvanceStartTime = Date.now();
      const autoAdvanceEndTime = timeLimit > 0 ? autoAdvanceStartTime + timeLimit * 1000 : Infinity;

      // 先初始化所有故事
      for (const story of storiesToTest) {
        if (testInterrupted) break;

        // 检查故事是否已初始化
        const store = readStore();
        const storyData = store.stories.find(s => s.id === story.id);
        if (!storyData || !storyData.current_event_id) {
          // 初始化故事
          try {
            const axios = require('axios');
            await axios.post(`http://localhost:3000/api/stories/${story.id}/initialize`);
            console.log(`[Story Test] 初始化故事: ${story.title}`);
          } catch (error) {
            console.error(`[Story Test] 初始化故事失败: ${story.title}`, error.message);
          }
        }
      }

      // 然后自动推进故事
      for (const story of storiesToTest) {
        if (testInterrupted) break;
        await autoAdvanceStory(story.id, timeLimit);

        // 检查是否超时
        if (Date.now() >= autoAdvanceEndTime) {
          testInterrupted = true;
          break;
        }
      }
    }
    
    // 运行测试
    const results = [];
    for (const story of storiesToTest) {
      if (testInterrupted) break;
      const metadata = tester.loadMetadata();
      const result = tester.testStory(story, metadata, tavernData);
      results.push(result);
    }
    
    // 生成报告
    const report = {
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.overallScore >= 80).length,
        failed: results.filter(r => r.overallScore < 80).length,
        averageScore: results.length > 0 ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length : 0
      }
    };
    
    // 保存报告到文件
    try {
      const fs = require('fs');
      const path = require('path');
      const reportPath = path.join(__dirname, 'story-test-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log('[Story Tester] Test report saved:', reportPath);
    } catch (error) {
      console.error('[Story Tester] Failed to save report:', error);
    }
    
    // 检查是否被中断
    if (testInterrupted) {
      res.json({
        ...report,
        success: false,
        interrupted: true,
        message: '测试已停止'
      });
      return;
    }
    
    res.json({
      ...report,
      success: true
    });
  } catch (error) {
    console.error('故事测试失败:', error);
    res.status(500).json({ error: '故事测试失败: ' + error.message });
  }
});

// 停止测试API
app.post('/api/stories/test/stop', (req, res) => {
  testInterrupted = true;
  res.json({ success: true, message: '测试停止请求已发送' });
});

// 自动推进故事的辅助函数
async function autoAdvanceStory(storyId, timeLimit) {
  const startTime = Date.now();
  const endTime = timeLimit > 0 ? startTime + timeLimit * 1000 : Infinity;
  
  while (Date.now() < endTime && !testInterrupted) {
    const store = readStore();
    const story = store.stories.find(s => s.id === storyId);
    if (!story) break;
    
    const storyEvents = store.storyEvents.filter(se => se.story_id === storyId);
    const currentEvent = storyEvents.find(e => e.id === story.current_event_id);
    
    if (!currentEvent || !currentEvent.choices || currentEvent.choices.length === 0) {
      break;
    }
    
    // 随机选择一个选项
    const randomChoice = currentEvent.choices[Math.floor(Math.random() * currentEvent.choices.length)];
    
    // 调用选择并推进的API
    try {
      const axios = require('axios');
      await axios.post(`http://localhost:3000/api/stories/${storyId}/events/${currentEvent.id}/choose-and-advance`, {
        choice_index: currentEvent.choices.indexOf(randomChoice)
      });
      
      // 检查中断标志
      if (testInterrupted) break;
      
      // 等待一段时间再推进，避免过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('自动推进失败:', error);
      break;
    }
  }
}

app.post('/api/stories', (req, res) => {
  const store = readStore();
  const { title, description, main_character_id, supporting_character_ids, lorebook_ids } = req.body;
  
  if (!title || !main_character_id) {
    res.status(400).json({ error: '标题和主角角色为必填项' });
    return;
  }
  
  const allCharacters = getAllCharacters(store);
  const mainCharacter = allCharacters.find(c => c.id === main_character_id);
  if (!mainCharacter) {
    res.status(400).json({ error: '主角角色不存在' });
    return;
  }
  
  const story = {
    id: uuidv4(),
    title,
    description: description || '',
    main_character_id,
    created_at: now(),
    updated_at: now(),
    current_event_id: null,
    state: 'active'
  };
  
  store.stories.push(story);
  
  // 添加主角关联
  store.storyCharacters.push({
    id: uuidv4(),
    story_id: story.id,
    character_id: main_character_id,
    role: 'protagonist',
    joined_at: now()
  });
  
  // 添加配角关联
  if (Array.isArray(supporting_character_ids)) {
    supporting_character_ids.forEach(charId => {
      const char = allCharacters.find(c => c.id === charId);
      if (char) {
        store.storyCharacters.push({
          id: uuidv4(),
          story_id: story.id,
          character_id: charId,
          role: 'supporting',
          joined_at: now()
        });
      }
    });
  }
  
  // 添加世界书关联
  if (Array.isArray(lorebook_ids)) {
    const allLorebooks = getAllLorebooks(store);
    lorebook_ids.forEach(lorebookId => {
      const lorebook = allLorebooks.find(l => l.id === lorebookId);
      if (lorebook) {
        store.storyLorebooks.push({
          id: uuidv4(),
          story_id: story.id,
          lorebook_id: lorebookId,
          added_at: now()
        });
      }
    });
  }
  
  writeStore(store);
  res.json(story);
});

app.put('/api/stories/:id', (req, res) => {
  const store = readStore();
  const storyIndex = store.stories.findIndex(s => s.id === req.params.id);
  if (storyIndex === -1) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  const { title, description, main_character_id, supporting_character_ids, lorebook_ids, state } = req.body;
  const allCharacters = getAllCharacters(store);
  const allLorebooks = getAllLorebooks(store);
  
  const story = store.stories[storyIndex];
  if (title !== undefined) story.title = title;
  if (description !== undefined) story.description = description;
  if (state !== undefined) story.state = state;
  story.updated_at = now();
  
  // 更新主角
  if (main_character_id && main_character_id !== story.main_character_id) {
    const mainChar = allCharacters.find(c => c.id === main_character_id);
    if (mainChar) {
      // 移除旧主角
      store.storyCharacters = store.storyCharacters.filter(sc => 
        !(sc.story_id === story.id && sc.role === 'protagonist')
      );
      // 添加新主角
      store.storyCharacters.push({
        id: uuidv4(),
        story_id: story.id,
        character_id: main_character_id,
        role: 'protagonist',
        joined_at: now()
      });
      story.main_character_id = main_character_id;
    }
  }
  
  // 更新配角
  if (Array.isArray(supporting_character_ids)) {
    // 移除旧配角
    store.storyCharacters = store.storyCharacters.filter(sc => 
      !(sc.story_id === story.id && sc.role === 'supporting')
    );
    // 添加新配角
    supporting_character_ids.forEach(charId => {
      const char = allCharacters.find(c => c.id === charId);
      if (char) {
        store.storyCharacters.push({
          id: uuidv4(),
          story_id: story.id,
          character_id: charId,
          role: 'supporting',
          joined_at: now()
        });
      }
    });
  }
  
  // 更新世界书
  if (Array.isArray(lorebook_ids)) {
    // 移除旧世界书
    store.storyLorebooks = store.storyLorebooks.filter(sl => sl.story_id !== story.id);
    // 添加新世界书
    lorebook_ids.forEach(lorebookId => {
      const lorebook = allLorebooks.find(l => l.id === lorebookId);
      if (lorebook) {
        store.storyLorebooks.push({
          id: uuidv4(),
          story_id: story.id,
          lorebook_id: lorebookId,
          added_at: now()
        });
      }
    });
  }
  
  store.stories[storyIndex] = story;
  writeStore(store);
  res.json(story);
});

app.delete('/api/stories/:id', (req, res) => {
  const store = readStore();
  const story = store.stories.find(s => s.id === req.params.id);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  store.stories = store.stories.filter(s => s.id !== req.params.id);
  store.storyCharacters = store.storyCharacters.filter(sc => sc.story_id !== req.params.id);
  store.storyLorebooks = store.storyLorebooks.filter(sl => sl.story_id !== req.params.id);
  store.storyEvents = store.storyEvents.filter(se => se.story_id !== req.params.id);
  store.storyNPCs = store.storyNPCs.filter(sn => sn.story_id !== req.params.id);
  store.storyRelationships = store.storyRelationships.filter(sr => sr.story_id !== req.params.id);
  
  writeStore(store);
  res.json({ success: true });
});

// Story Event API - 故事事件/分支
app.get('/api/stories/:storyId/character-states', (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.storyId);
    if (!story) {
      res.status(404).json({ error: '故事不存在' });
      return;
    }

    // 返回空的角色状态数组（角色状态会在游戏过程中动态更新）
    res.json([]);
  } catch (error) {
    console.error('加载角色状态失败:', error);
    res.status(500).json({ error: '加载角色状态失败' });
  }
});

app.get('/api/stories/:storyId/current-chapter', (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.storyId);
    if (!story) {
      res.status(404).json({ error: '故事不存在' });
      return;
    }

    // 返回当前章节信息
    const events = store.storyEvents.filter(se => se.story_id === req.params.storyId);
    const currentEvent = events.find(e => e.id === story.current_event_id);
    
    // 尝试从framework获取章节总数
    let totalChapters = 300; // 默认值
    if (story.metadata?.framework_path) {
      try {
        const fs = require('fs');
        const path = require('path');
        // 使用 metadata.framework_path 或尝试从 frameworks 目录查找
        let frameworkPath = story.metadata.framework_path;
        if (!frameworkPath.startsWith('data/')) {
          frameworkPath = path.join('data/novels', story.metadata.novel_id, 'frameworks', frameworkPath);
        }
        const fullFrameworkPath = path.join(__dirname, '..', frameworkPath);
        
        if (fs.existsSync(fullFrameworkPath)) {
          const framework = JSON.parse(fs.readFileSync(fullFrameworkPath, 'utf8'));
          totalChapters = framework.chapters?.length || (framework.settings?.endChapter + 1) || 300;
        }
      } catch (error) {
        console.error('加载framework失败:', error);
      }
    }
    
    const chapterIndex = currentEvent?.chapter_index || 0;
    const chapterTitle = currentEvent?.title || `第 ${chapterIndex + 1} 章`;
    
    res.json({
      chapterIndex: chapterIndex + 1, // 从1开始显示
      chapterTitle: chapterTitle,
      totalChapters: totalChapters
    });
  } catch (error) {
    console.error('加载当前章节失败:', error);
    res.status(500).json({ error: '加载当前章节失败' });
  }
});

app.get('/api/stories/:storyId/events', (req, res) => {
  const store = readStore();
  const events = store.storyEvents.filter(se => se.story_id === req.params.storyId);
  res.json(events);
});

app.post('/api/stories/:storyId/events', (req, res) => {
  const store = readStore();
  const { title, description, choices, parent_event_id } = req.body;
  
  const story = store.stories.find(s => s.id === req.params.storyId);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  if (!title) {
    res.status(400).json({ error: '事件标题为必填项' });
    return;
  }
  
  const event = {
    id: uuidv4(),
    story_id: req.params.storyId,
    title,
    description: description || '',
    choices: Array.isArray(choices) ? choices : [],
    parent_event_id: parent_event_id || null,
    created_at: now()
  };
  
  store.storyEvents.push(event);
  
  // 如果是第一个事件，设为当前事件
  if (!story.current_event_id) {
    story.current_event_id = event.id;
    const storyIndex = store.stories.findIndex(s => s.id === req.params.storyId);
    store.stories[storyIndex] = story;
  }
  
  writeStore(store);
  res.json(event);
});

app.put('/api/stories/:storyId/events/:eventId', (req, res) => {
  const store = readStore();
  const eventIndex = store.storyEvents.findIndex(se => 
    se.id === req.params.eventId && se.story_id === req.params.storyId
  );
  
  if (eventIndex === -1) {
    res.status(404).json({ error: '事件不存在' });
    return;
  }
  
  const { title, description, choices } = req.body;
  const event = store.storyEvents[eventIndex];
  
  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (choices !== undefined) event.choices = choices;
  
  store.storyEvents[eventIndex] = event;
  writeStore(store);
  res.json(event);
});

app.post('/api/stories/:storyId/events/:eventId/choose', (req, res) => {
  const store = readStore();
  const { choice_index } = req.body;
  
  const event = store.storyEvents.find(se => 
    se.id === req.params.eventId && se.story_id === req.params.storyId
  );
  
  if (!event) {
    res.status(404).json({ error: '事件不存在' });
    return;
  }
  
  if (!Array.isArray(event.choices) || choice_index < 0 || choice_index >= event.choices.length) {
    res.status(400).json({ error: '无效的选择' });
    return;
  }
  
  const choice = event.choices[choice_index];
  
  // 创建新事件作为选择结果
  const newEvent = {
    id: uuidv4(),
    story_id: req.params.storyId,
    title: choice.title || '选择结果',
    description: choice.description || '',
    choices: choice.next_choices || [],
    parent_event_id: event.id,
    created_at: now()
  };
  
  store.storyEvents.push(newEvent);

  // 保存历史记录
  store.storyHistory.push({
    id: uuidv4(),
    story_id: req.params.storyId,
    type: 'choice',
    event_id: newEvent.id,
    event_title: event.title,
    event_description: event.description || '',
    choice: choice.title,
    involved_character_ids: [],
    timestamp: now(),
    phase: event.phase || '初期'
  });
  
  // 更新故事当前事件
  const storyIndex = store.stories.findIndex(s => s.id === req.params.storyId);
  store.stories[storyIndex].current_event_id = newEvent.id;
  store.stories[storyIndex].updated_at = now();
  
  writeStore(store);
  res.json(newEvent);
});

// Story NPC API - NPC生成和管理
app.get('/api/stories/:storyId/npcs', (req, res) => {
  const store = readStore();
  const npcs = store.storyNPCs.filter(sn => sn.story_id === req.params.storyId);
  res.json(npcs);
});

app.post('/api/stories/:storyId/npcs', (req, res) => {
  const store = readStore();
  const { name, description, role, traits } = req.body;
  
  const story = store.stories.find(s => s.id === req.params.storyId);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  if (!name) {
    res.status(400).json({ error: 'NPC名称为必填项' });
    return;
  }
  
  const npc = {
    id: uuidv4(),
    story_id: req.params.storyId,
    name,
    description: description || '',
    role: role || 'minor',
    traits: Array.isArray(traits) ? traits : [],
    created_at: now()
  };
  
  store.storyNPCs.push(npc);
  writeStore(store);
  res.json(npc);
});

app.post('/api/stories/:storyId/npcs/generate', async (req, res) => {
  const store = readStore();
  const { context, role } = req.body;
  
  const story = store.stories.find(s => s.id === req.params.storyId);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  const settings = store.settings || {};
  if (!settings.apiKey) {
    res.status(400).json({ error: '未配置API密钥' });
    return;
  }
  
  const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);
  
  try {
    const prompt = `根据以下上下文生成一个临时NPC角色（不需要角色卡）：
上下文：${context || '故事中的普通路人'}
角色定位：${role || '路人'}

请以JSON格式返回，包含：
- name: 姓名
- description: 简短描述
- traits: 性格特征数组（3-5个）
- role: 角色定位（merchant/guard/peasant/traveler等）`;

    const response = await axios.post(targetUrl, {
      model: settings.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: '你是一个RPG游戏助手，负责生成临时NPC角色。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const content = response.data.choices[0].message.content;
    let npcData;
    
    try {
      npcData = JSON.parse(content);
    } catch (e) {
      // 如果AI返回的不是纯JSON，尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        npcData = JSON.parse(jsonMatch[0]);
      } else {
        // 降级：手动创建简单NPC
        npcData = {
          name: '神秘路人',
          description: content.substring(0, 200),
          traits: ['普通', '路人'],
          role: 'peasant'
        };
      }
    }
    
    const npc = {
      id: uuidv4(),
      story_id: req.params.storyId,
      name: npcData.name || '神秘路人',
      description: npcData.description || '',
      role: npcData.role || role || 'peasant',
      traits: Array.isArray(npcData.traits) ? npcData.traits : [],
      created_at: now()
    };
    
    store.storyNPCs.push(npc);
    writeStore(store);
    res.json(npc);
    
  } catch (error) {
    console.error('生成NPC失败:', error);
    res.status(500).json({ error: '生成NPC失败: ' + error.message });
  }
});

app.delete('/api/stories/:storyId/npcs/:npcId', (req, res) => {
  const store = readStore();
  store.storyNPCs = store.storyNPCs.filter(sn => 
    !(sn.id === req.params.npcId && sn.story_id === req.params.storyId)
  );
  writeStore(store);
  res.json({ success: true });
});

// ===== Hidden Facts 解锁系统 =====
// 角色卡的 raw_data.hidden_facts 数组，每条形如：
//   { id, title, content, reveal_text, category, reveal_priority, blocks: [fact_ids],
//     unlock_condition: { type: 'composite'|'history_keyword'|'character_interactions'|'event_completed', ... } }
function getCharacterHiddenFacts(character) {
  const raw = character?.raw_data;
  return Array.isArray(raw?.hidden_facts) ? raw.hidden_facts : [];
}
function getCharacterAliases(character) {
  const raw = character?.raw_data;
  const list = [character?.name, raw?.name, ...(Array.isArray(raw?.aliases) ? raw.aliases : [])].filter(Boolean);
  return [...new Set(list.map(String))];
}
function evaluateUnlockCondition(condition, ctx) {
  if (!condition || typeof condition !== 'object') return false;
  const t = condition.type;
  if (t === 'composite') {
    const subs = Array.isArray(condition.conditions) ? condition.conditions : [];
    if (!subs.length) return false;
    const op = String(condition.op || 'and').toLowerCase();
    return op === 'or'
      ? subs.some(c => evaluateUnlockCondition(c, ctx))
      : subs.every(c => evaluateUnlockCondition(c, ctx));
  }
  if (t === 'history_keyword') {
    const patterns = Array.isArray(condition.patterns) ? condition.patterns : [];
    if (!patterns.length) return false;
    return patterns.some(p => {
      const s = String(p);
      try { return new RegExp(s, 'i').test(ctx.historyText); }
      catch { return ctx.historyText.includes(s); }
    });
  }
  if (t === 'character_interactions') {
    const min = Math.max(1, Number(condition.min) || 1);
    const targetName = String(condition.character_id || condition.character_name || '');
    const aliases = ctx.aliasesByName?.[targetName] || [targetName];
    if (!aliases.length || !aliases[0]) return false;
    let count = 0;
    for (const h of ctx.history) {
      const text = `${h.event_title || ''} ${h.event_description || ''} ${h.choice || ''}`;
      if (aliases.some(a => a && text.includes(a))) count++;
    }
    return count >= min;
  }
  if (t === 'event_completed') {
    const titles = Array.isArray(condition.event_titles) ? condition.event_titles : [];
    if (!titles.length) return false;
    return ctx.history.some(h => {
      const text = `${h.event_title || ''} ${h.event_description || ''}`;
      return titles.some(t => text.includes(String(t)));
    });
  }
  return false;
}
// ===== 辅助 LLM（settings.summaryModel）通用调用 =====
// 用于：故事滚动摘要、语义解锁判定、其他低成本任务
async function callAuxLlm(messages, { maxTokens = 600, temperature = 0.4, jsonMode = false, timeoutMs = 45000 } = {}) {
  const store = readStore();
  const settings = store.settings || {};
  if (!settings.apiKey) throw new Error('未配置 API 密钥');
  const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);
  const model = settings.summaryModel || settings.model || 'gpt-3.5-turbo';
  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (jsonMode && settings.disableJsonMode !== true) body.response_format = { type: 'json_object' };
  const resp = await axios.post(targetUrl, body, {
    headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    timeout: timeoutMs
  });
  return resp.data?.choices?.[0]?.message?.content || '';
}

// ===== 故事滚动摘要 =====
// 当历史 ≥ 8 条且距上次摘要更新 ≥ 5 步时，调用辅助 LLM 把最近 12 条压缩成『前情提要』段
const _storySummaryRunning = new Map();
const _storySummaryLastRunAt = new Map();
const STORY_SUMMARY_MIN_INTERVAL_MS = 90 * 1000;
const STORY_SUMMARY_MIN_HISTORY = 8;
const STORY_SUMMARY_NEW_HISTORY_TRIGGER = 5;

async function maybeUpdateStorySummary(storyId) {
  if (_storySummaryRunning.get(storyId)) return;
  const lastRun = _storySummaryLastRunAt.get(storyId) || 0;
  if (Date.now() - lastRun < STORY_SUMMARY_MIN_INTERVAL_MS) return;
  let store = readStore();
  const story = store.stories.find(s => s.id === storyId);
  if (!story) return;
  const history = (store.storyHistory || []).filter(h => h.story_id === storyId);
  if (history.length < STORY_SUMMARY_MIN_HISTORY) return;
  const lastSummaryAt = story.summaryGeneratedAt || 0;
  const newSinceSummary = history.filter(h => {
    const t = new Date(h.timestamp || h.created_at || 0).getTime();
    return t > lastSummaryAt;
  }).length;
  if (story.summary && newSinceSummary < STORY_SUMMARY_NEW_HISTORY_TRIGGER) return;

  _storySummaryRunning.set(storyId, true);
  _storySummaryLastRunAt.set(storyId, Date.now());
  try {
    const target = history.slice(-12);
    const lines = target.map(h => {
      const tag = h.type === 'choice' ? '[选]' : (h.type === 'note' ? '[记]' : '[剧]');
      const t = String(h.event_title || '').slice(0, 40);
      const d = String(h.event_description || '').slice(0, 200);
      const c = h.choice ? ` →${String(h.choice).slice(0, 40)}` : '';
      return `${tag}${t}${d ? '：' + d : ''}${c}`;
    }).join('\n');
    const oldSummary = story.summary ? `\n\n【上次摘要（可继承+更新）】\n${story.summary.slice(0, 600)}` : '';
    const prompt = `你是同人 RPG 故事的旁白助手。把下列剧情历史浓缩成一段流畅的『前情提要』叙事——保留人物互动、关键决定、情绪走向、伏笔，删去冗余细节。仅输出 1-2 段、共 220-380 字的中文叙述、不要列表/标题/引号。${oldSummary}\n\n剧情历史：\n${lines}`;
    const t0 = Date.now();
    const summary = await callAuxLlm(
      [
        { role: 'system', content: '你是简洁有力的中文叙事性助手，输出连贯流畅。' },
        { role: 'user', content: prompt }
      ],
      { maxTokens: 700, temperature: 0.4, timeoutMs: 60000 }
    );
    console.log(`[story-summary] storyId=${storyId} ${Date.now() - t0}ms`);
    if (summary && summary.trim()) {
      const fresh = readStore();
      const idx = fresh.stories.findIndex(s => s.id === storyId);
      if (idx !== -1) {
        fresh.stories[idx].summary = summary.trim();
        fresh.stories[idx].summaryGeneratedAt = Date.now();
        writeStore(fresh);
      }
    }
  } catch (err) {
    console.warn(`[story-summary] storyId=${storyId} 失败:`, err.message);
  } finally {
    _storySummaryRunning.set(storyId, false);
  }
}

// ===== 隐藏经历语义解锁 =====
// 同步规则解锁后，异步调用辅助 LLM 判定哪些 priority>=60 但规则未命中的 fact 已经在剧情中被语义展现
const _semanticUnlockRunning = new Map();
const _semanticUnlockLastRunAt = new Map();
const SEMANTIC_UNLOCK_MIN_INTERVAL_MS = 45 * 1000;
const SEMANTIC_UNLOCK_MAX_CANDIDATES = 6;

async function maybeSemanticUnlock(storyId) {
  if (_semanticUnlockRunning.get(storyId)) return;
  const lastRun = _semanticUnlockLastRunAt.get(storyId) || 0;
  if (Date.now() - lastRun < SEMANTIC_UNLOCK_MIN_INTERVAL_MS) return;
  const store = readStore();
  const story = store.stories.find(s => s.id === storyId);
  if (!story) return;
  const history = (store.storyHistory || []).filter(h => h.story_id === storyId);
  if (history.length < 3) return;
  const allChars = getAllCharacters(store);
  const storyChars = (store.storyCharacters || [])
    .filter(sc => sc.story_id === storyId)
    .map(sc => allChars.find(c => c.id === sc.character_id))
    .filter(Boolean);
  const revealedKeys = new Set(
    (store.storyRevealedFacts || []).filter(r => r.story_id === storyId).map(r => `${r.character_id}::${r.fact_id}`)
  );
  const candidates = [];
  for (const ch of storyChars) {
    const facts = getCharacterHiddenFacts(ch);
    for (const f of facts) {
      if (!f.id || revealedKeys.has(`${ch.id}::${f.id}`)) continue;
      if ((f.reveal_priority || 0) < 60) continue;
      candidates.push({ ch, fact: f });
    }
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => (b.fact.reveal_priority || 0) - (a.fact.reveal_priority || 0));
  const sliced = candidates.slice(0, SEMANTIC_UNLOCK_MAX_CANDIDATES);

  _semanticUnlockRunning.set(storyId, true);
  _semanticUnlockLastRunAt.set(storyId, Date.now());
  try {
    const recentText = history.slice(-8).map(h => {
      const t = String(h.event_title || '').slice(0, 40);
      const d = String(h.event_description || '').slice(0, 200);
      const c = h.choice ? ` 选择→${String(h.choice).slice(0, 40)}` : '';
      return `${t}：${d}${c}`;
    }).join('\n');
    const factListText = sliced.map((c, i) => `${i + 1}. [${c.ch.name}] ${c.fact.title}：${(c.fact.content || '').slice(0, 100)}`).join('\n');
    const prompt = `阅读理解任务：判断哪些『隐藏经历』已在剧情历史中被自然展现（语义层面、不必字面命中）。\n\n剧情历史：\n${recentText}\n\n隐藏经历列表：\n${factListText}\n\n仅输出 JSON：{"matched_indices":[1, 3]}（数组、空数组也可、必须 JSON）。索引基于上面列表 1-based。无关或不确定就空数组。严格判断：只在剧情真的展现了该经历核心要素时才匹配。`;
    const t0 = Date.now();
    const raw = await callAuxLlm(
      [
        { role: 'system', content: '你只输出 JSON、严格判断、不确定就空数组。' },
        { role: 'user', content: prompt }
      ],
      { maxTokens: 200, temperature: 0.1, jsonMode: true, timeoutMs: 30000 }
    );
    console.log(`[semantic-unlock] storyId=${storyId} ${Date.now() - t0}ms raw=${raw.slice(0, 80)}`);
    let matched = [];
    try {
      const parsed = JSON.parse(raw);
      matched = Array.isArray(parsed.matched_indices) ? parsed.matched_indices : [];
    } catch {
      const m = raw.match(/\[[\s\d,]*\]/);
      if (m) try { matched = JSON.parse(m[0]); } catch { matched = []; }
    }
    if (!matched.length) return;

    // 写盘
    const fresh = readStore();
    if (!Array.isArray(fresh.storyRevealedFacts)) fresh.storyRevealedFacts = [];
    const freshKeys = new Set(
      fresh.storyRevealedFacts.filter(r => r.story_id === storyId).map(r => `${r.character_id}::${r.fact_id}`)
    );
    let added = 0;
    for (const idx of matched) {
      const i = Number(idx) - 1;
      if (i < 0 || i >= sliced.length) continue;
      const { ch, fact } = sliced[i];
      const key = `${ch.id}::${fact.id}`;
      if (freshKeys.has(key)) continue;
      fresh.storyRevealedFacts.push({
        id: uuidv4(),
        story_id: storyId,
        character_id: ch.id,
        character_name: ch.name || '',
        fact_id: fact.id,
        title: String(fact.title || ''),
        reveal_text: String(fact.reveal_text || fact.content || ''),
        category: String(fact.category || ''),
        revealed_at: now(),
        via: 'semantic'
      });
      freshKeys.add(key);
      added++;
    }
    if (added > 0) {
      writeStore(fresh);
      console.log(`[semantic-unlock] storyId=${storyId} 解锁 ${added} 条`);
    }
  } catch (err) {
    console.warn(`[semantic-unlock] storyId=${storyId} 失败:`, err.message);
  } finally {
    _semanticUnlockRunning.set(storyId, false);
  }
}

// 检查并应用所有可解锁的隐藏经历，返回 newly revealed facts（不直接写盘，由调用者负责）
function checkAndApplyUnlocks(store, storyId) {
  if (!Array.isArray(store.storyRevealedFacts)) store.storyRevealedFacts = [];
  const story = store.stories.find(s => s.id === storyId);
  if (!story) return [];
  const history = (store.storyHistory || []).filter(h => h.story_id === storyId);
  const historyText = history
    .map(h => `${h.event_title || ''} ${h.event_description || ''} ${h.choice || ''}`)
    .join(' \n ');
  const revealedKeys = new Set(
    store.storyRevealedFacts.filter(r => r.story_id === storyId).map(r => `${r.character_id}::${r.fact_id}`)
  );
  const allChars = getAllCharacters(store);
  const storyChars = (store.storyCharacters || [])
    .filter(sc => sc.story_id === storyId)
    .map(sc => allChars.find(c => c.id === sc.character_id))
    .filter(Boolean);
  const aliasesByName = {};
  storyChars.forEach(c => { aliasesByName[c.name] = getCharacterAliases(c); });
  const blockedFacts = new Set();
  store.storyRevealedFacts.filter(r => r.story_id === storyId).forEach(r => {
    const ch = storyChars.find(c => c.id === r.character_id);
    if (!ch) return;
    const me = getCharacterHiddenFacts(ch).find(f => f.id === r.fact_id);
    if (me && Array.isArray(me.blocks)) me.blocks.forEach(b => blockedFacts.add(`${r.character_id}::${b}`));
  });
  const newly = [];
  for (const ch of storyChars) {
    const facts = getCharacterHiddenFacts(ch);
    if (!facts.length) continue;
    const sorted = [...facts].sort((a, b) => (b.reveal_priority || 0) - (a.reveal_priority || 0));
    for (const fact of sorted) {
      const key = `${ch.id}::${fact.id}`;
      if (!fact.id || revealedKeys.has(key) || blockedFacts.has(key)) continue;
      const ctx = { history, historyText, aliasesByName };
      if (evaluateUnlockCondition(fact.unlock_condition, ctx)) {
        const reveal = {
          id: uuidv4(),
          story_id: storyId,
          character_id: ch.id,
          character_name: ch.name || '',
          fact_id: fact.id,
          title: String(fact.title || ''),
          reveal_text: String(fact.reveal_text || fact.content || ''),
          category: String(fact.category || ''),
          revealed_at: now()
        };
        store.storyRevealedFacts.push(reveal);
        revealedKeys.add(key);
        newly.push(reveal);
        if (Array.isArray(fact.blocks)) fact.blocks.forEach(b => blockedFacts.add(`${ch.id}::${b}`));
      }
    }
  }
  return newly;
}

// ===== AI 生成下一事件的核心逻辑（被 /ai-generate 和 /choose-and-advance 复用）=====
// 返回：{ ok: true, store, newEvent } 或 { ok: false, status, error }
async function generateNextEventCore(storyId, { currentPhase, previousChoice, context }, storeArg) {
  const store = storeArg || readStore();
  const story = store.stories.find(s => s.id === storyId);
  if (!story) return { ok: false, status: 404, error: '故事不存在' };

  const settings = store.settings || {};
  if (!settings.apiKey) return { ok: false, status: 400, error: '未配置API密钥' };
  if (!settings.apiUrl) return { ok: false, status: 400, error: '未配置API地址' };

  // 读取故事框架
  let framework = null;
  try {
    // 优先从故事元数据中获取框架路径
    let frameworkPath = story.metadata?.framework_path;
    if (frameworkPath) {
      frameworkPath = path.join(__dirname, '..', frameworkPath);
    } else {
      // 回退到旧路径
      frameworkPath = path.join(__dirname, '../stories', `${story.title}.json`);
    }
    
    if (fs.existsSync(frameworkPath)) {
      framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
      console.log('[AI Generate] Framework loaded from:', frameworkPath);
    } else {
      console.log('[AI Generate] Framework file not found:', frameworkPath);
    }
  } catch (e) {
    console.error('读取框架文件失败:', e);
  }
  
  // 如果没有框架，使用默认阶段
  if (!framework) {
    console.log('[AI Generate] No framework available, using default phase');
    framework = {
      timeline: [
        { phase: '初期', title: '初期', description: '故事初期' },
        { phase: '前期', title: '前期', description: '故事前期' },
        { phase: '中期', title: '中期', description: '故事中期' },
        { phase: '后期', title: '后期', description: '故事后期' },
        { phase: '终期', title: '终期', description: '故事终期' }
      ]
    };
  }
  
  if (!framework.timeline) return { ok: false, status: 400, error: '故事框架格式错误' };

  // 找到当前阶段：优先按章节索引找（更准确），回退到按 phase 名找
  const currentChapterIndex = (() => {
    const events = (store.storyEvents || []).filter(se => se.story_id === storyId);
    const currentEvent = events.find(e => e.id === story.current_event_id);
    return currentEvent?.chapter_index ?? 0;
  })();

  // 优先匹配章节
  let phase = framework.timeline.find(p =>
    Array.isArray(p.events) && p.events.some(ev => ev.chapter === currentChapterIndex)
  );

  // 回退：按 phase 名匹配
  if (!phase) {
    phase = framework.timeline.find(p => p.phase === currentPhase) || framework.timeline[0];
  }

  if (!phase) return { ok: false, status: 400, error: '阶段不存在' };

  // 聚合同名 phase 的所有角色与关键事件，避免只取第一个章节信息
  const samePhaseEntries = framework.timeline.filter(p => p.phase === phase.phase);
  const aggregatedCharacters = Array.from(new Set(
    samePhaseEntries.flatMap(p => Array.isArray(p.characters) ? p.characters : [])
  ));
  const aggregatedKeyEvents = samePhaseEntries.flatMap(p =>
    Array.isArray(p.key_events) ? p.key_events : []
  );

  // 当前章节附近的角色（窗口扫描，确保剧情连贯）
  const nearbyChapterCharacters = Array.from(new Set(
    framework.timeline
      .filter(p => Array.isArray(p.events))
      .flatMap(p => p.events)
      .filter(ev => ev.chapter >= currentChapterIndex && ev.chapter <= currentChapterIndex + 3)
      .flatMap(ev => Array.isArray(ev.characters) ? ev.characters : [])
  ));

  // 合并：当前章节窗口角色 + 同 phase 聚合角色
  phase = {
    ...phase,
    characters: Array.from(new Set([...nearbyChapterCharacters, ...aggregatedCharacters])),
    key_events: aggregatedKeyEvents.length > 0 ? aggregatedKeyEvents : (phase.key_events || [])
  };

  const phaseKey = phase.phase || currentPhase || '初期';

  const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);

  // ---- 收集上下文 ----
  const allHistory = (store.storyHistory || [])
    .filter(h => h.story_id === storyId)
    .sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));
  const recentHistory = allHistory.slice(-5);
  const openingHistory = allHistory.length > 8 ? allHistory.slice(0, 1) : [];
  const summarizeHistoryItem = (h) => {
    const tag = h.type === 'choice' ? '选' : (h.type === 'note' ? '记' : '剧');
    const title = String(h.event_title || '').slice(0, 40);
    const desc = String(h.event_description || '').slice(0, 80);
    const choice = h.choice ? ` →${String(h.choice).slice(0, 25)}` : '';
    return `[${tag}]${title}${desc ? `：${desc}` : ''}${choice}`;
  };
  const openingBlock = openingHistory.length > 0 ? `\n【开局】${openingHistory.map(summarizeHistoryItem).join(' | ')}` : '';
  const recentBlock = recentHistory.length > 0 ? `\n【最近剧情】\n${recentHistory.map(summarizeHistoryItem).join('\n')}` : '';
  // 辅助 LLM 滚动摘要：浓缩长跨度历史、保持沉浸连贯
  const summaryBlock = story.summary
    ? `\n【前情提要（辅助 LLM 浓缩）】\n${String(story.summary).slice(0, 700)}`
    : '';

  const knownCharNames = [
    ...store.storyCharacters
      .filter(sc => sc.story_id === storyId)
      .map(sc => {
        const c = getAllCharacters(store).find(x => x.id === sc.character_id);
        return c ? c.name : null;
      })
      .filter(Boolean),
    ...store.storyNPCs.filter(n => n.story_id === storyId).map(n => n.name)
  ];
  const charsBlock = knownCharNames.length > 0 ? `\n【已登场】${knownCharNames.slice(0, 8).join('、')}` : '';

  const currentEventForCtx = store.storyEvents.find(e => e.id === story.current_event_id);
  const currentEventBlock = currentEventForCtx
    ? `\n【刚刚发生】${currentEventForCtx.title || ''}：${(currentEventForCtx.description || '').slice(0, 120)}`
    : '';

  const protagonistInfo = framework.protagonist ? JSON.stringify(framework.protagonist).slice(0, 600) : '';
  const protagonistName = framework.protagonist?.name || '未知';
  
  // 从当前状态获取主角信息，而不是初始值
  const currentProtagonistState = storyStateManager?.state?.characterStates?.[protagonistName];
  const protagonistLocation = currentProtagonistState?.location || framework.protagonist?.startingLocation || '未知地点';
  const protagonistRealm = currentProtagonistState?.realm || framework.protagonist?.startingRealm || '未知境界';
  const protagonistAlive = currentProtagonistState?.alive !== false;
  const protagonistBackground = framework.protagonist?.background || '';
  const protagonistOrigin = framework.protagonist?.origin || '';
  const protagonistFamily = framework.protagonist?.family || '';
  
  // 获取主角当前物品状态
  let protagonistCurrentItems = [];
  try {
    if (storyStateManager && storyStateManager.state && storyStateManager.state.currentItems) {
      // 故事框架模式：使用storyStateManager的当前物品
      protagonistCurrentItems = storyStateManager.state.currentItems[protagonistName] || [];
    } else {
      // 普通故事模式：从store中读取物品信息（如果有）
      // 普通故事模式暂不支持动态物品跟踪，返回空数组
      protagonistCurrentItems = [];
    }
  } catch (e) {
    console.warn('[AI Generate] Failed to get current items:', e.message);
    protagonistCurrentItems = []; // 确保始终是数组
  }
  
  const itemsPrompt = protagonistCurrentItems && protagonistCurrentItems.length > 0 
    ? `【主角当前物品】${protagonistCurrentItems.join('、')}`
    : '【主角当前物品】无特殊物品';
  
  // 获取主角当前关系状态
  let protagonistCurrentRelationships = {};
  try {
    if (storyStateManager && storyStateManager.state && storyStateManager.state.currentRelationships) {
      // 故事框架模式：使用storyStateManager的当前关系
      protagonistCurrentRelationships = storyStateManager.state.currentRelationships[protagonistName] || {};
    } else {
      // 普通故事模式：从store.storyRelationships读取关系
      const storyRelationships = (store.storyRelationships || [])
        .filter(r => r.story_id === storyId);
      
      // 构建主角的关系映射
      protagonistCurrentRelationships = {};
      storyRelationships.forEach(r => {
        const protagonistChar = store.storyCharacters.find(sc => 
          sc.story_id === storyId && sc.role === 'protagonist'
        );
        if (protagonistChar) {
          const allCharacters = getAllCharacters(store);
          const protagonistCharData = allCharacters.find(c => c.id === protagonistChar.character_id);
          if (protagonistCharData) {
            // 如果关系涉及主角
            if (r.character_id === protagonistChar.id) {
              const targetChar = allCharacters.find(c => c.id === r.target_id);
              if (targetChar) {
                protagonistCurrentRelationships[targetChar.name] = r.type;
              }
            } else if (r.target_id === protagonistChar.id) {
              const sourceChar = allCharacters.find(c => c.id === r.character_id);
              if (sourceChar) {
                protagonistCurrentRelationships[sourceChar.name] = r.type;
              }
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('[AI Generate] Failed to get current relationships:', e.message);
    protagonistCurrentRelationships = {}; // 确保始终是对象
  }
  
  const relationshipsPrompt = protagonistCurrentRelationships && Object.keys(protagonistCurrentRelationships).length > 0 
    ? `【主角当前关系】${Object.entries(protagonistCurrentRelationships).map(([char, rel]) => `${char}：${rel}`).join('、')}`
    : '【主角当前关系】无特殊关系';

  console.log('[AI Generate] Protagonist location:', protagonistLocation);
  console.log('[AI Generate] Protagonist realm:', protagonistRealm);
  console.log('[AI Generate] Protagonist alive:', protagonistAlive);
  console.log('[AI Generate] Protagonist items:', itemsPrompt);
  console.log('[AI Generate] Protagonist relationships:', relationshipsPrompt);

  // 获取小说ID和原著主角
  const novelId = story.metadata?.novel_id || '';
  const canonProtagonists = powerSystemService.getCanonProtagonists(novelId);
  const canonProtagonistList = canonProtagonists.length > 0 ? canonProtagonists : [];

  // 一致性分析：调用所有一致性分析方法
  console.log('[AI Generate] Running consistency analysis...');
  const consistencyAnalysis = {
    relationships: powerSystemService.analyzeCharacterRelationships(novelId),
    timeline: powerSystemService.analyzeTimelineConsistency(novelId),
    items: powerSystemService.analyzeItemTracking(novelId),
    factions: powerSystemService.analyzeFactionRecognition(novelId),
    powerGrowth: powerSystemService.analyzePowerGrowthTrajectory(novelId),
    geographic: powerSystemService.analyzeGeographicContinuity(novelId),
    causality: powerSystemService.analyzeCausality(novelId),
    personality: powerSystemService.analyzeCharacterPersonality(novelId),
    conflicts: powerSystemService.detectSettingConflicts(novelId),
    terms: powerSystemService.detectTermUsageConsistency(novelId)
  };

  // 生成一致性分析提示词
  const consistencyPrompt = powerSystemService.generateConsistencyPrompt(consistencyAnalysis);

  // 生成实力限制提示词
  const powerConstraintsPrompt = powerSystemService.generatePowerConstraintsPrompt(novelId, protagonistRealm);
  
  // 生成写作风格提示词
  const writingStylePrompt = powerSystemService.generateWritingStylePrompt(novelId);
  
  // 生成世界观合理性提示词
  const plausibilityPrompt = powerSystemService.generatePlausibilityPrompt(novelId);
  
  // 生成禁止概念提示词
  const forbiddenConceptsPrompt = powerSystemService.generateForbiddenConceptsPrompt(novelId);
  
  console.log('[AI Generate] Forbidden concepts prompt:', forbiddenConceptsPrompt ? 'Generated' : 'Not generated');
  
  // 生成细化规则提示词
  const detailRulesPrompt = powerSystemService.generateDetailRulesPrompt(novelId);
  
  // 生成角色关系提示词（新增）
  const relationshipPrompt = powerSystemService.generateRelationshipPrompt ? powerSystemService.generateRelationshipPrompt(novelId) : '';
  
  // 生成时间线提示词（新增）
  const timelinePrompt = powerSystemService.generateTimelinePrompt ? powerSystemService.generateTimelinePrompt(novelId) : '';
  
  // 生成势力提示词（新增）
  const factionPrompt = powerSystemService.generateFactionPrompt ? powerSystemService.generateFactionPrompt(novelId) : '';
  
  // 生成物品提示词（新增）
  const itemPrompt = powerSystemService.generateItemPrompt ? powerSystemService.generateItemPrompt(novelId) : '';
  
  // 生成实力成长提示词（新增）
  const powerGrowthPrompt = powerSystemService.generatePowerGrowthPrompt ? powerSystemService.generatePowerGrowthPrompt(novelId) : '';
  
  // 生成地理连续性提示词（新增）
  const geographicPrompt = powerSystemService.generateGeographicPrompt ? powerSystemService.generateGeographicPrompt(novelId) : '';
  
  // 生成因果关系提示词（新增）
  const causalityPrompt = powerSystemService.generateCausalityPrompt ? powerSystemService.generateCausalityPrompt(novelId) : '';
  
  // 生成角色性格提示词（新增）
  const personalityPrompt = powerSystemService.generatePersonalityPrompt ? powerSystemService.generatePersonalityPrompt(novelId) : '';
  
  // 生成设定冲突提示词（新增）
  const conflictsPrompt = powerSystemService.generateConflictsPrompt ? powerSystemService.generateConflictsPrompt(novelId) : '';
  
  // 提示词优先级控制：根据重要性排序并限制总长度
  const promptPriorities = [
    { prompt: writingStylePrompt, priority: 10, name: '写作风格' },
    { prompt: forbiddenConceptsPrompt, priority: 10, name: '禁止概念' },
    { prompt: powerConstraintsPrompt, priority: 9, name: '实力限制' },
    { prompt: plausibilityPrompt, priority: 9, name: '世界观合理性' },
    { prompt: detailRulesPrompt, priority: 8, name: '细化规则' },
    { prompt: consistencyPrompt, priority: 8, name: '一致性分析' },
    { prompt: relationshipPrompt, priority: 7, name: '角色关系' },
    { prompt: timelinePrompt, priority: 7, name: '时间线' },
    { prompt: factionPrompt, priority: 6, name: '势力' },
    { prompt: itemPrompt, priority: 6, name: '物品' },
    { prompt: powerGrowthPrompt, priority: 5, name: '实力成长' },
    { prompt: geographicPrompt, priority: 5, name: '地理连续性' },
    { prompt: causalityPrompt, priority: 4, name: '因果关系' },
    { prompt: personalityPrompt, priority: 4, name: '角色性格' },
    { prompt: conflictsPrompt, priority: 3, name: '设定冲突' }
  ];
  
  // 按优先级排序
  promptPriorities.sort((a, b) => b.priority - a.priority);
  
  // 控制提示词总长度（最多显示前8个高优先级提示词）
  const MAX_PROMPTS = 8;
  const selectedPrompts = promptPriorities
    .filter(p => p.prompt && p.prompt.trim().length > 0)
    .slice(0, MAX_PROMPTS);
  
  console.log('[AI Generate] Selected prompts:', selectedPrompts.map(p => p.name));
  
  // 合并选中的提示词
  const selectedPromptBlock = selectedPrompts
    .map(p => p.prompt)
    .filter(p => p && p.trim().length > 0)
    .join('\n');
  
  const safePhaseDesc = String(phase.description || '').slice(0, 200);
  const safeKeyEvents = (Array.isArray(phase.key_events) ? phase.key_events : []).slice(0, 7).join(' → ');
  const safePhaseChars = (Array.isArray(phase.characters) ? phase.characters : []).slice(0, 6).join('、');
  const safeWorldbook = (Array.isArray(phase.worldbook_entries) ? phase.worldbook_entries : []).slice(0, 5).join('、');

  // 原著锚点：从 canon_anchors 提炼当前阶段的"下一步该往哪推"
  const canonAnchors = Array.isArray(phase.canon_anchors) ? phase.canon_anchors : [];
  // 找出"还没在历史里出现过"的下一个 anchor 作为推进目标
  const historyTitles = allHistory.map(h => `${h.event_title || ''} ${h.event_description || ''}`).join(' ');
  const nextAnchor = canonAnchors.find(a => {
    const keywords = [a.title || '', ...(a.key_characters || []).slice(0, 3)].filter(Boolean);
    // 如果 anchor 的标题/主要角色都没在历史里出现，则认为还没推进到这里
    return keywords.length > 0 && !keywords.some(k => historyTitles.includes(k));
  }) || canonAnchors[Math.min(canonAnchors.length - 1, Math.floor(allHistory.length / 4))]; // 兜底：按历史长度推进

  const canonBlock = nextAnchor
    ? `\n【下一原著锚点】${nextAnchor.chapter ? `[${nextAnchor.chapter}] ` : ''}${nextAnchor.title}\n概要：${(nextAnchor.summary || '').slice(0, 250)}${nextAnchor.location ? `\n地点：${nextAnchor.location}` : ''}${nextAnchor.key_characters?.length ? `\n涉及人物：${nextAnchor.key_characters.slice(0, 6).join('、')}` : ''}${nextAnchor.player_hook ? `\n玩家切入：${nextAnchor.player_hook}` : ''}`
    : '';

  // ---- 隐藏经历感知：已揭示 + 接近解锁的提示 ----
  const revealedForStory = (store.storyRevealedFacts || []).filter(r => r.story_id === storyId);
  const revealedBlock = revealedForStory.length > 0
    ? `\n【已揭示的隐藏经历】（AI 可在剧情中自然引用）\n${revealedForStory.slice(-6).map(r => `- ${r.character_name}「${r.title}」`).join('\n')}`
    : '';

  // 接近解锁的 hidden_facts：扫描所有故事相关角色的 facts、按命中条件接近度筛 2-3 条
  const storyCharsForUnlock = (store.storyCharacters || [])
    .filter(sc => sc.story_id === storyId)
    .map(sc => getAllCharacters(store).find(c => c.id === sc.character_id))
    .filter(Boolean);
  const revealedKeys = new Set(revealedForStory.map(r => `${r.character_id}::${r.fact_id}`));
  const unlockHints = [];
  for (const ch of storyCharsForUnlock) {
    const facts = getCharacterHiddenFacts(ch);
    for (const fact of facts) {
      if (!fact.id || revealedKeys.has(`${ch.id}::${fact.id}`)) continue;
      // 提取一两个触发关键词作为 hint
      const cond = fact.unlock_condition;
      const kws = [];
      const collectKws = (c) => {
        if (!c) return;
        if (c.type === 'history_keyword' && Array.isArray(c.patterns)) kws.push(...c.patterns.slice(0, 2));
        if (c.type === 'event_completed' && Array.isArray(c.event_titles)) kws.push(...c.event_titles.slice(0, 2));
        if (c.type === 'composite' && Array.isArray(c.conditions)) c.conditions.forEach(collectKws);
      };
      collectKws(cond);
      if (kws.length > 0) {
        unlockHints.push({ char: ch.name, title: fact.title, kws: kws.slice(0, 3), priority: fact.reveal_priority || 0 });
      }
      if (unlockHints.length >= 8) break;
    }
    if (unlockHints.length >= 8) break;
  }
  unlockHints.sort((a, b) => b.priority - a.priority);
  const hintsBlock = unlockHints.length > 0
    ? `\n【可铺垫的隐藏经历】（自然提及关键词或安排相关事件、可触发后端解锁、丰富剧情）\n${unlockHints.slice(0, 4).map(h => `- ${h.char}：「${h.title}」相关词「${h.kws.join('、')}」`).join('\n')}`
    : '';

  // 获取短期记忆
  let shortTermMemoryBlock = '';
  try {
    if (storyStateManager && storyStateManager.state) {
      // 故事框架模式：使用storyStateManager的短期记忆
      const shortTermMemory = storyStateManager.getShortTermMemory();
      if (shortTermMemory && shortTermMemory.length > 0) {
        shortTermMemoryBlock = `\n【短期记忆】${shortTermMemory.slice(-5).map(m => {
          const type = m.type === 'choice' ? '选择' : (m.type === 'item_change' ? '物品变化' : (m.type === 'relationship_change' ? '关系变化' : '其他'));
          return `${type}：${m.summary || m.description || ''}`;
        }).join('\n')}`;
      }
    } else {
      // 普通故事模式：从store中读取历史记录作为短期记忆
      const storyHistory = (store.storyHistory || [])
        .filter(h => h.story_id === storyId)
        .sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''))
        .slice(-5);
      
      if (storyHistory.length > 0) {
        shortTermMemoryBlock = `\n【近期剧情】${storyHistory.map(h => {
          const type = h.type === 'choice' ? '选择' : (h.type === 'note' ? '记' : '剧');
          const title = String(h.event_title || '').slice(0, 40);
          const desc = String(h.event_description || '').slice(0, 80);
          const choice = h.choice ? ` →${String(h.choice).slice(0, 25)}` : '';
          return `[${type}]${title}${desc ? `：${desc}` : ''}${choice}`;
        }).join('\n')}`;
      }
    }
  } catch (e) {
    console.warn('[AI Generate] Failed to get short-term memory:', e.message);
  }

  // 获取长期记忆
  let longTermMemoryBlock = '';
  try {
    if (storyStateManager && storyStateManager.state) {
      // 故事框架模式：使用storyStateManager的长期记忆
      const queryText = `${protagonistName} ${protagonistLocation} ${protagonistRealm} ${previousChoice || ''}`;
      const longTermMemories = storyStateManager.retrieveRelevantMemories(queryText, 3);
      if (longTermMemories && longTermMemories.length > 0) {
        longTermMemoryBlock = `\n【长期记忆】${longTermMemories.map(m => `- ${m.summary || m.content || ''}`).join('\n')}`;
      }
    } else {
      // 普通故事模式：从故事摘要和历史中提取关键信息作为长期记忆
      const storySummary = story.summary || '';
      const allHistory = (store.storyHistory || [])
        .filter(h => h.story_id === storyId)
        .sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));
      
      if (storySummary) {
        longTermMemoryBlock = `\n【故事摘要】${String(storySummary).slice(0, 500)}`;
      } else if (allHistory.length > 10) {
        // 如果没有摘要，使用早期历史作为背景
        const earlyHistory = allHistory.slice(0, 3);
        longTermMemoryBlock = `\n【早期剧情】${earlyHistory.map(h => {
          const title = String(h.event_title || '').slice(0, 40);
          const desc = String(h.event_description || '').slice(0, 80);
          return `${title}${desc ? `：${desc}` : ''}`;
        }).join('\n')}`;
      }
    }
  } catch (e) {
    console.warn('[AI Generate] Failed to get long-term memory:', e.message);
  }

  // 获取动态世界书注入
  let dynamicWorldbookBlock = '';
  try {
    const allLorebooks = getAllLorebooks(store);
    // 获取故事相关的世界书
    const storyLorebooks = (store.storyLorebooks || []).filter(sl => sl.story_id === storyId);
    const relevantLorebookIds = storyLorebooks.map(sl => sl.lorebook_id);
    
    // 过滤启用的世界书
    const enabledLorebooks = allLorebooks.filter(l => 
      l.enabled && relevantLorebookIds.includes(l.id)
    );
    
    // 基于当前上下文触发世界书
    const contextText = `${protagonistName} ${protagonistLocation} ${protagonistRealm} ${previousChoice || ''} ${recentBlock || ''}`;
    const triggeredLorebooks = enabledLorebooks.filter(l => {
      if (!l.keywords || l.keywords.length === 0) return false;
      const lowerContext = contextText.toLowerCase();
      return l.keywords.some(kw => lowerContext.includes(kw.toLowerCase()));
    });
    
    if (triggeredLorebooks.length > 0) {
      dynamicWorldbookBlock = `\n【世界书设定】${triggeredLorebooks.slice(0, 5).map(l => `- ${l.title}：${String(l.content || '').slice(0, 150)}`).join('\n')}`;
    }
  } catch (e) {
    console.warn('[AI Generate] Failed to get dynamic worldbook:', e.message);
  }

  // 检查当前阶段是否需要避免主要角色
  const avoidMainChars = phase.avoidMainCharacters === true;
  const isTransition = phase.isTransition === true;
  const phaseInstruction = avoidMainChars || isTransition
    ? `\n【阶段特殊要求】本阶段为${isTransition ? '过渡阶段' : '初期阶段'}，请避免让主角过早接触原著主要角色${canonProtagonistList.length > 0 ? `（如${canonProtagonistList.slice(0, 3).join('、')}等）` : ''}。应让主角先了解现状、收集情报、与普通NPC互动、建立基础。不要直接引入主要角色或重大事件。`
    : '';

  // 读取玩家影响与互动方式（两者含义不同）
  const playerInfluenceLevel = framework.settings?.playerInfluence || 'medium';
  const interactionModeLevel = framework.settings?.interactionMode || 'medium';

  const influenceExplain = {
    low: '低：主角基本不改变原著关键结果，以旁观和收集情报为主。',
    medium: '中：主角可影响过程、与 NPC 发生互动，但关键原著结果必须保留。',
    high: '高：主角可尝试改变部分原著走向（在锚点之间），但仍需尊重硬锚点。'
  };
  const interactionExplain = {
    low: '低：主角与他人互动频率低，多数场景独自行动、观察、思考。',
    medium: '中：主角与 NPC 自然互动（对话、交易、合作），互动描写适中。',
    high: '高：主角高频深度互动，常与他人同行、结盟、冲突，场景多有对白。'
  };

  const gameplayInstruction = `\n【玩家影响程度】${playerInfluenceLevel}（${influenceExplain[playerInfluenceLevel] || ''}）\n【互动方式】${interactionModeLevel}（${interactionExplain[interactionModeLevel] || ''}）\n说明：玩家影响 = 对剧情结果的改变力度；互动方式 = 与他人互动的频率与深度。请依据这两项生成符合该强度的事件与选择。`;

  const systemPrompt = `${framework.name || '未知'}同人小说剧情生成。基于原著小说改编，严格忠实原著节奏与设定，保持原著文学风格。仅输出 JSON。

${writingStylePrompt}

【世界观】${framework.worldview || '原著小说世界观'}
【故事】${framework.name || '未知'}
【玩家扮演】${protagonistInfo ? protagonistInfo : framework.protagonist?.name || '未知'}
【主角当前位置】${protagonistLocation}
【主角当前境界】${protagonistRealm}
【主角生死状态】${protagonistAlive ? '存活' : '死亡'}
【主角背景】${protagonistBackground}
【主角家世】${protagonistFamily}
【主角来历】${protagonistOrigin}
${itemsPrompt}
${relationshipsPrompt}

【重要】必须严格遵循主角的起始位置（${protagonistLocation}）、背景（${protagonistBackground}）和家世（${protagonistFamily}）设定。所有剧情必须基于用户填写的主角档案生成，不得使用预设的主角设定。地点转换必须合理，符合原著地理设定。如果主角家世是"无亲无故"，则不得出现任何亲属关系或家族背景。

【物品状态一致性】必须严格保持主角物品状态的一致性。如果【主角当前物品】中列出了主角拥有的物品，新事件中不得随意更改或添加未提及的物品。如需获得新物品，必须通过剧情中的合理途径（如购买、战斗获取、他人赠送等）。

【剧情独立性】${!canonProtagonistList.includes(protagonistName) ? `主角是原创角色，不得重复${canonProtagonistList.join('、')}的剧情路径（如重生、夺舍、穿越等）。剧情应围绕主角自身的经历展开，避免直接套用${canonProtagonistList.join('、')}的经典剧情。主角可以旁观${canonProtagonistList.join('、')}的事件，但不能替代${canonProtagonistList.join('、')}成为事件的主角。` : ''}

${selectedPromptBlock}

${shortTermMemoryBlock}

${longTermMemoryBlock}

${dynamicWorldbookBlock}

【当前阶段】${phaseKey}-${phase.title || ''}${safePhaseDesc ? `\n${safePhaseDesc}` : ''}
${safeKeyEvents ? `原著主线锚点序列：${safeKeyEvents}\n` : ''}${safePhaseChars ? `【本阶段必须出场的原著角色】${safePhaseChars}\n（重要：根据剧情节奏，应让以上原著角色在本阶段中合理出现，不得长期回避）\n` : ''}${safeWorldbook ? `相关设定：${safeWorldbook}` : ''}${charsBlock}${openingBlock}${summaryBlock}${recentBlock}${currentEventBlock}${canonBlock}${revealedBlock}${hintsBlock}${phaseInstruction}${gameplayInstruction}

${framework.creativeToolbox || ''}

【创作要求】
1. **忠实原著**：原著剧情走向必须与原著一致。不要让原著角色的人设/行为脱离原著。
2. **优先推进【下一原著锚点】**：如果给出了下一锚点、新事件应朝那个方向推进——抵达地点、遇见关键人物、目击关键事件、为锚点做铺垫。
3. **读者是参与者**：读者的选择决定主角的去向、与谁同行、何时介入，但不改变原著主线大事件的发生。
4. **承接【刚刚发生】**：新事件必须延续上一事件的时空、人物、情绪。
5. **标题具体**：禁止"新的冒险""继续前进""未知的旅程"这类空洞标题；要有原著风的具体地名、人名、事件名。
6. **选择差异化**：2-6 个选择应有明显不同的后果方向（介入/旁观、信任/怀疑、东进/西行等）。
7. **铺垫隐藏经历**：若【可铺垫】中有合适项、可在剧情中自然提及对应关键词或安排相关事件、触发后端解锁——但不要把隐藏内容直接写在 description 里、只是『让条件命中』。
8. **不剧透**：未解锁的『秘密』不要直接写出剧情、只用环境/对话/暗示让读者自己感知。已揭示的可在后续剧情中自然引用。

【输出 JSON】{"title":"10-20字具体标题","description":"80-150字承接前文+引出新冲突，注重人物性格和环境描写","choices":[{"title":"具体行动","description":"20-30字暗示后果"}]}（2-6 个选择，仅 JSON 无其他）`;

  console.log('[AI Generate] System prompt length:', systemPrompt.length);
  console.log('[AI Generate] System prompt preview:', systemPrompt.substring(0, 500));
  console.log('[AI Generate] Protagonist location:', protagonistLocation);
  console.log('[AI Generate] Protagonist family:', protagonistFamily);

  const userPrompt = previousChoice
    ? `玩家选择「${previousChoice}」，生成承接事件。${context ? `\n${String(context).slice(0, 200)}` : ''}`
    : `生成下一事件。${context ? `\n${String(context).slice(0, 200)}` : ''}`;

  const buildBody = (useJsonMode) => {
    const body = {
      model: settings.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    return body;
  };
  const callLlm = async (useJsonMode, attempt) => {
    const t0 = Date.now();
    const r = await axios.post(targetUrl, buildBody(useJsonMode), {
      headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });
    console.log(`AI生成 - LLM ${Date.now() - t0}ms (jsonMode=${useJsonMode}, attempt=${attempt})`);
    return r;
  };

  // 透明重试
  const isTransient = (err) => {
    const s = err.response?.status;
    return s >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
  };
  const isJsonRejected = (err) => {
    const s = err.response?.status;
    const m = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    return (s === 400 || s === 422) && /response_format|json[_ ]?object|not supported|unsupported|unrecognized/i.test(String(m));
  };

  let response;
  let useJsonMode = settings.disableJsonMode !== true;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await callLlm(useJsonMode, attempt);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 3) break;
      if (isJsonRejected(err) && useJsonMode) { useJsonMode = false; continue; }
      if (isTransient(err)) {
        await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
        continue;
      }
      break; // 非临时错误，停止重试
    }
  }
  if (lastErr) {
    const status = lastErr.response?.status;
    const upstreamMsg = lastErr.response?.data?.error?.message || lastErr.response?.data?.message || lastErr.response?.data?.error || lastErr.message;
    const friendly = status ? `上游 API ${status}：${upstreamMsg}` : `${lastErr.code || '调用失败'}：${lastErr.message}`;
    return { ok: false, status: status && status < 500 ? status : 500, error: 'AI生成事件失败: ' + friendly };
  }

  if (!response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
    return { ok: false, status: 500, error: 'AI生成事件失败: API响应格式错误' };
  }

  const content = response.data.choices[0].message.content;
  let eventData;
  try {
    eventData = JSON.parse(content);
  } catch (e) {
    console.error('[AI Generate] JSON parsing failed:', e.message);
    console.error('[AI Generate] Raw content:', content);
    
    // 尝试提取 JSON 部分
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        eventData = JSON.parse(m[0]);
        console.log('[AI Generate] Fallback JSON extraction succeeded');
      } catch (e2) {
        console.error('[AI Generate] Fallback JSON parsing also failed:', e2.message);
        eventData = null;
      }
    }
    
    // 如果仍然失败，尝试修复截断的 JSON
    if (!eventData) {
      try {
        // 尝试找到并修复截断的 JSON
        let jsonStr = content;
        // 如果以 { 开头但没有闭合，尝试添加闭合括号
        if (jsonStr.trim().startsWith('{') && !jsonStr.trim().endsWith('}')) {
          // 找到最后一个完整的属性
          const lastComma = jsonStr.lastIndexOf(',');
          const lastQuote = jsonStr.lastIndexOf('"');
          if (lastComma > 0) {
            // 截断到最后一个完整属性
            jsonStr = jsonStr.substring(0, lastComma + 1);
            // 尝试闭合数组和对象
            if (jsonStr.includes('"choices"')) {
              jsonStr += ']}';
            } else {
              jsonStr += '}';
            }
          }
        }
        eventData = JSON.parse(jsonStr);
        console.log('[AI Generate] Truncated JSON repair succeeded');
      } catch (e3) {
        console.error('[AI Generate] Truncated JSON repair failed:', e3.message);
        eventData = null;
      }
    }
    
    if (!eventData) {
      console.warn('[AI Generate] Using fallback default choices');
      // 尝试从原始内容中提取有用信息
      let extractedTitle = null;
      let extractedDescription = null;
      
      try {
        extractedTitle = content.match(/"title"\s*:\s*"([^"]+)"/)?.[1];
        extractedDescription = content.match(/"description"\s*:\s*"([^"]+)"/)?.[1];
      } catch (e) {
        console.warn('[AI Generate] Regex extraction failed:', e.message);
      }
      
      eventData = {
        title: extractedTitle || '新的冒险',
        description: extractedDescription || String(content).substring(0, 200),
        choices: [
          { title: '继续前进', description: '探索未知的前方' },
          { title: '仔细观察', description: '分析当前情况' }
        ]
      };
      
      if (extractedTitle) {
        console.log('[AI Generate] Extracted title from content:', extractedTitle);
      }
    }
  }

  console.log('[AI Generate] Parsed event data:', {
    title: eventData?.title,
    choicesCount: eventData?.choices?.length,
    choices: eventData?.choices?.map(c => c.title)
  });

  const newEvent = {
    id: uuidv4(),
    story_id: storyId,
    chapter_index: Math.floor((store.storyEvents.filter(se => se.story_id === storyId).length) / 10),
    title: eventData.title || '新的冒险',
    description: eventData.description || '故事继续发展...',
    choices: Array.isArray(eventData.choices) && eventData.choices.length > 0 ? eventData.choices : [
      { title: '继续前进', description: '探索未知的前方' },
      { title: '仔细观察', description: '分析当前情况' }
    ],
    parent_event_id: story.current_event_id,
    phase: phaseKey,
    created_at: now()
  };
  store.storyEvents.push(newEvent);

  // 角色识别
  const allKnownCharsForDetect = [
    ...store.storyCharacters
      .filter(sc => sc.story_id === storyId)
      .map(sc => {
        const c = getAllCharacters(store).find(x => x.id === sc.character_id);
        return c ? { id: c.id, name: c.name } : null;
      })
      .filter(Boolean),
    ...store.storyNPCs.filter(n => n.story_id === storyId).map(n => ({ id: n.id, name: n.name }))
  ];
  const detectionText = `${eventData.title || ''} ${eventData.description || ''}`;
  const involvedIds = allKnownCharsForDetect.filter(c => c.name && detectionText.includes(c.name)).map(c => c.id);

  store.storyHistory.push({
    id: uuidv4(),
    story_id: storyId,
    type: 'ai_generate',
    event_id: newEvent.id,
    event_title: newEvent.title,
    event_description: newEvent.description,
    involved_character_ids: involvedIds,
    timestamp: now(),
    phase: phaseKey
  });

  const storyIndex = store.stories.findIndex(s => s.id === storyId);
  if (storyIndex !== -1) {
    store.stories[storyIndex].current_event_id = newEvent.id;
    store.stories[storyIndex].updated_at = now();
  }

  // 普通故事模式：提取状态变化（关系、物品等）
  if (!storyStateManager || !storyStateManager.state) {
    try {
      const eventContent = `${newEvent.title}\n${newEvent.description}`;
      const currentState = {
        protagonist: protagonistName,
        location: protagonistLocation,
        realm: protagonistRealm,
        items: protagonistCurrentItems,
        relationships: protagonistCurrentRelationships
      };
      
      const stateChanges = await stateExtractor.extractStateChanges(
        eventContent,
        novelId,
        currentState
      );
      
      if (stateChanges) {
        // 更新关系
        if (stateChanges.relationshipChanges && stateChanges.relationshipChanges.length > 0) {
          const allCharacters = getAllCharacters(store);
          
          stateChanges.relationshipChanges.forEach(change => {
            const char1 = allCharacters.find(c => c.name === change.character1);
            const char2 = allCharacters.find(c => c.name === change.character2);
            
            if (char1 && char2) {
              // 查找或创建关系记录
              const existingRelIndex = store.storyRelationships.findIndex(r =>
                r.story_id === storyId &&
                r.character_id === char1.id &&
                r.target_id === char2.id
              );
              
              if (existingRelIndex !== -1) {
                // 更新现有关系
                store.storyRelationships[existingRelIndex].type = change.newRelation;
                store.storyRelationships[existingRelIndex].description = `关系变化：${change.newRelation}`;
                store.storyRelationships[existingRelIndex].updated_at = now();
              } else {
                // 创建新关系
                store.storyRelationships.push({
                  id: uuidv4(),
                  story_id: storyId,
                  character_id: char1.id,
                  target_id: char2.id,
                  type: change.newRelation,
                  description: `关系变化：${change.newRelation}`,
                  created_at: now(),
                  updated_at: now()
                });
              }
              
              console.log(`[Normal Story Mode] Updated relationship: ${change.character1} <-> ${change.character2} = ${change.newRelation}`);
            }
          });
        }
        
        // 物品变化可以添加到历史记录中
        if (stateChanges.itemChanges && stateChanges.itemChanges.length > 0) {
          console.log(`[Normal Story Mode] Detected ${stateChanges.itemChanges.length} item changes`);
          // 普通故事模式暂不维护物品清单，只记录到历史
        }
      }
    } catch (e) {
      console.warn('[Normal Story Mode] Failed to extract state changes:', e.message);
    }
  }

  return { ok: true, store, newEvent };
}

// Story Framework AI Generation - 框架驱动的AI故事生成
app.post('/api/stories/:storyId/ai-generate', async (req, res) => {
  try {
    const result = await generateNextEventCore(req.params.storyId, req.body || {});
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    const newlyRevealed = checkAndApplyUnlocks(result.store, req.params.storyId);
    writeStore(result.store);
    res.json({ ...result.newEvent, newly_revealed_facts: newlyRevealed });
    // 异步触发辅助 LLM 任务（不阻塞响应）
    setImmediate(() => {
      maybeUpdateStorySummary(req.params.storyId).catch(() => {});
      maybeSemanticUnlock(req.params.storyId).catch(() => {});
    });
  } catch (err) {
    console.error('AI生成 - 未捕获错误:', err);
    res.status(500).json({ error: 'AI生成事件失败: ' + (err.message || '未知错误') });
  }
});

// 查询某个故事下所有已解锁的隐藏经历
app.get('/api/stories/:storyId/revealed-facts', (req, res) => {
  const store = readStore();
  const facts = (store.storyRevealedFacts || []).filter(r => r.story_id === req.params.storyId);
  res.json(facts);
});

// 查询所有角色当前状态
app.get('/api/stories/:storyId/character-states', (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ error: '故事不存在' });
    }

    // 获取故事状态管理器中的角色状态
    const storyStateManager = require('./story-state-manager');
    const state = storyStateManager.getState(story.id);
    
    if (!state || !state.characterStates) {
      // 如果没有状态，返回基本角色信息（包含描述）
      const allCharacters = [story.main_character, ...(story.supporting_characters || [])].filter(Boolean);
      return res.json(allCharacters.map(char => ({
        name: char.name,
        realm: char.realm || '未知',
        location: char.location || '未知',
        alive: true,
        isProtagonist: char.id === story.main_character?.id,
        description: char.description || ''
      })));
    }

    // 使用故事状态管理器获取动态描述
    const manager = getStoryStateManager();
    
    try {
      manager.loadSession(story.id);
    } catch (e) {
      console.warn('[Character States] Failed to load session:', e.message);
    }
    
    const characterStates = Object.entries(state.characterStates).map(([name, charState]) => {
      let description = '';
      try {
        const charStateWithDescription = manager.getCharacterState(name);
        description = charStateWithDescription?.description || '';
      } catch (e) {
        console.warn(`[Character States] Failed to get description for ${name}:`, e.message);
      }
      
      return {
        name,
        realm: charState.realm || '未知',
        location: charState.location || '未知',
        alive: charState.alive !== false,
        isProtagonist: name === story.main_character?.name,
        description: description
      };
    });

    res.json(characterStates);
  } catch (error) {
    console.error('获取角色状态失败:', error);
    res.status(500).json({ error: '获取角色状态失败: ' + error.message });
  }
});

// 查询当前章节信息
app.get('/api/stories/:storyId/current-chapter', (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ error: '故事不存在' });
    }

    // 尝试从story framework获取章节信息
    if (story.metadata?.framework_path) {
      try {
        const fs = require('fs');
        const path = require('path');
        // 使用 metadata.framework_path 或尝试从 frameworks 目录查找
        let frameworkPath = story.metadata.framework_path;
        if (!frameworkPath.startsWith('data/')) {
          frameworkPath = path.join('data/novels', story.metadata.novel_id, 'frameworks', frameworkPath);
        }
        const fullFrameworkPath = path.join(__dirname, '..', frameworkPath);
        
        if (fs.existsSync(fullFrameworkPath)) {
          const framework = JSON.parse(fs.readFileSync(fullFrameworkPath, 'utf8'));
          
          // 获取当前章节索引（从事件中推断）
          const events = store.storyEvents.filter(se => se.story_id === req.params.storyId);
          const currentChapterIndex = events.length > 0 ? Math.floor(events.length / 10) : 0;
          const totalChapters = framework.chapters?.length || (framework.settings?.endChapter + 1) || 300;
          const currentChapter = framework.chapters?.find(ch => ch.chapterIndex === currentChapterIndex);
          
          res.json({
            chapterIndex: currentChapterIndex,
            chapterTitle: currentChapter?.title || `第 ${currentChapterIndex + 1} 章`,
            totalChapters: totalChapters,
            summary: currentChapter?.summary || ''
          });
          return;
        }
      } catch (frameworkError) {
        console.warn('加载框架文件失败:', frameworkError.message);
      }
    }
    
    // 降级方案：基于事件数量估算章节
    const events = store.storyEvents.filter(se => se.story_id === req.params.storyId);
    const currentChapterIndex = events.length > 0 ? Math.floor(events.length / 10) : 0;

    // 降级方案：尝试从story metadata获取章节数
    let totalChapters = 300;
    if (story.metadata?.totalChapters && typeof story.metadata.totalChapters === 'number') {
      totalChapters = story.metadata.totalChapters;
    } else if (story.metadata?.endChapter !== undefined && typeof story.metadata.endChapter === 'number') {
      totalChapters = story.metadata.endChapter + 1;
    }

    res.json({
      chapterIndex: currentChapterIndex,
      chapterTitle: `第 ${currentChapterIndex + 1} 章`,
      totalChapters: totalChapters,
      summary: ''
    });
  } catch (error) {
    console.error('获取当前章节失败:', error);
    res.status(500).json({ error: '获取当前章节失败: ' + error.message });
  }
});

// 生成章节标题
app.post('/api/stories/:storyId/generate-chapter-title', async (req, res) => {
  try {
    const { chapterContent } = req.body;
    
    if (!chapterContent) {
      return res.status(400).json({ error: '缺少章节内容' });
    }

    const https = require('https');
    const apiKey = process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.trim() : '';
    
    if (!apiKey) {
      return res.status(500).json({ error: '未配置DeepSeek API密钥' });
    }

    const prompt = `根据以下章节内容生成一个简洁的章节标题（不超过20字）：

章节内容：
${chapterContent}

要求：
1. 标题要简洁有力
2. 能概括章节核心内容
3. 符合小说风格
4. 不超过20字

只返回标题，不要其他文字。`;

    const data = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是章节标题生成专家，能够根据章节内容生成简洁有力的标题。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    const response = await new Promise((resolve, reject) => {
      const httpsReq = https.request({
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(result.choices[0].message.content);
          } catch (error) {
            reject(error);
          }
        });
      });

      httpsReq.on('error', reject);
      httpsReq.write(data);
      httpsReq.end();
    });

    // 提取标题（去除可能的引号和多余文字）
    const title = response.replace(/^["']|["']$/g, '').trim();
    
    res.json({ title });
  } catch (error) {
    console.error('生成章节标题失败:', error);
    res.status(500).json({ error: '生成章节标题失败: ' + error.message });
  }
});

// 合并端点：选择 + 自动推进（一次完成，避免客户端时序问题）
app.post('/api/stories/:storyId/events/:eventId/choose-and-advance', async (req, res) => {
  try {
    const store = readStore();
    const { choice_index } = req.body || {};
    const event = store.storyEvents.find(se => se.id === req.params.eventId && se.story_id === req.params.storyId);
    if (!event) return res.status(404).json({ error: '事件不存在' });
    if (!Array.isArray(event.choices) || choice_index < 0 || choice_index >= event.choices.length) {
      return res.status(400).json({ error: '无效的选择' });
    }
    const choice = event.choices[choice_index];

    // ===== 第 1 步：写入选择结果事件（与 /choose 同逻辑） =====
    // 计算当前章节索引
    const storyEvents = store.storyEvents.filter(se => se.story_id === req.params.storyId);
    const currentChapterIndex = Math.floor(storyEvents.length / 10); // 每10个事件算一章
    
    const chosenEvent = {
      id: uuidv4(),
      story_id: req.params.storyId,
      chapter_index: currentChapterIndex,
      title: choice.title || '选择结果',
      description: choice.description || '',
      choices: choice.next_choices || [],
      parent_event_id: event.id,
      phase: event.phase || '初期',
      created_at: now()
    };
    store.storyEvents.push(chosenEvent);
    store.storyHistory.push({
      id: uuidv4(),
      story_id: req.params.storyId,
      type: 'choice',
      event_id: chosenEvent.id,
      event_title: event.title,
      event_description: event.description || '',
      choice: choice.title,
      involved_character_ids: [],
      timestamp: now(),
      phase: event.phase || '初期'
    });
    const storyIdx = store.stories.findIndex(s => s.id === req.params.storyId);
    if (storyIdx !== -1) {
      store.stories[storyIdx].current_event_id = chosenEvent.id;
      store.stories[storyIdx].updated_at = now();
    }

    // ===== 第 2 步：基于刚刚的选择，调用 AI 生成下一事件 =====
    const result = await generateNextEventCore(req.params.storyId, {
      currentPhase: event.phase || '初期',
      previousChoice: choice.title,
      context: choice.description || ''
    }, store);

    if (!result.ok) {
      // AI 失败也要把"选择"那一步保存下来，让用户能手动重试
      writeStore(store);
      return res.status(result.status || 500).json({
        error: result.error,
        choiceSaved: true,
        chosenEvent
      });
    }

    const newlyRevealed = checkAndApplyUnlocks(result.store, req.params.storyId);
    writeStore(result.store);
    res.json({ chosenEvent, newEvent: result.newEvent, newly_revealed_facts: newlyRevealed });
    setImmediate(() => {
      maybeUpdateStorySummary(req.params.storyId).catch(() => {});
      maybeSemanticUnlock(req.params.storyId).catch(() => {});
    });
  } catch (err) {
    console.error('choose-and-advance 未捕获错误:', err);
    res.status(500).json({ error: '自动推进失败: ' + (err.message || '未知错误') });
  }
});

// 占位以便定位旧版被删除的位置
app.post('/api/stories/:storyId/ai-generate-old-do-not-use', async (req, res) => {
  res.status(410).json({ error: 'deprecated, use /ai-generate' });
});

// 重置剧情：清空 events / history / npcs / relationships，用第一章 JSON 重新开局
app.post('/api/stories/:storyId/reset', (req, res) => {
  try {
    const store = readStore();
    const story = store.stories.find(s => s.id === req.params.storyId);
    if (!story) return res.status(404).json({ error: '故事不存在' });

    // 清空与该故事相关的所有运行时数据
    store.storyEvents = (store.storyEvents || []).filter(e => e.story_id !== story.id);
    store.storyHistory = (store.storyHistory || []).filter(h => h.story_id !== story.id);
    store.storyNPCs = (store.storyNPCs || []).filter(n => n.story_id !== story.id);
    store.storyRelationships = (store.storyRelationships || []).filter(r => r.story_id !== story.id);
    if (Array.isArray(store.storyRevealedFacts)) {
      store.storyRevealedFacts = store.storyRevealedFacts.filter(r => r.story_id !== story.id);
    }

    // 尝试用《第一章》JSON 作为开局
    let openingEvent = null;
    
    // 获取主角起始位置
    let startingLocation = '未知地点';
    try {
      if (story.metadata?.framework_path) {
        const frameworkPath = path.join(__dirname, '..', story.metadata.framework_path);
        console.log('[Story Reset] Framework path:', frameworkPath);
        if (fs.existsSync(frameworkPath)) {
          const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
          console.log('[Story Reset] Framework protagonist:', framework.protagonist);
          startingLocation = framework.protagonist?.startingLocation || '未知地点';
          console.log('[Story Reset] Starting location from framework:', startingLocation);
        } else {
          console.warn('[Story Reset] Framework file not found:', frameworkPath);
        }
      }
    } catch (e) {
      console.warn('[Story Reset] 读取框架失败，使用默认起始位置:', e.message);
    }
    
    try {
      const ch1Path = path.join(__dirname, '..', 'stories', `${story.title}_第一章.json`);
      if (fs.existsSync(ch1Path)) {
        const ch1 = JSON.parse(fs.readFileSync(ch1Path, 'utf8'));
        openingEvent = {
          id: uuidv4(),
          story_id: story.id,
          title: ch1.title || '序章',
          description: ch1.description || '',
          choices: (ch1.choices || []).map(c => ({
            title: c.text || c.title || '继续',
            description: c.description || ''
          })),
          parent_event_id: null,
          phase: ch1.phase || '初期',
          created_at: now()
        };
      }
    } catch (e) {
      console.warn('读取第一章模板失败:', e.message);
    }

    if (!openingEvent) {
      // 兜底开局 - 使用主角起始位置
      openingEvent = {
        id: uuidv4(),
        story_id: story.id,
        title: '序章：重新启程',
        description: `你来到了${startingLocation}，这里是你的起点。`,
        choices: [
          { title: '开始新的旅程', description: '让 AI 生成下一段剧情' }
        ],
        parent_event_id: null,
        phase: '初期',
        created_at: now()
      };
      console.log('[Story Reset] Opening event description:', openingEvent.description);
    }

    console.log('[Story Reset] Opening event:', openingEvent);
    store.storyEvents.push(openingEvent);
    story.current_event_id = openingEvent.id;

    store.storyHistory.push({
      id: uuidv4(),
      story_id: story.id,
      type: 'system',
      event_id: openingEvent.id,
      event_title: '剧情重置',
      event_description: '玩家选择重新开始；之前的进度已清除。',
      involved_character_ids: [],
      timestamp: now(),
      phase: openingEvent.phase
    });

    const idx = store.stories.findIndex(s => s.id === story.id);
    store.stories[idx].current_event_id = openingEvent.id;
    store.stories[idx].updated_at = now();

    writeStore(store);
    res.json({ success: true, openingEvent });
  } catch (err) {
    console.error('重置剧情失败:', err);
    res.status(500).json({ error: '重置失败: ' + (err.message || '未知错误') });
  }
});
/* DELETED_OLD_AI_GENERATE_START
app.post('/__deleted_legacy__', async (req, res) => {
  console.log('AI生成 - 收到请求，storyId:', req.params.storyId);
  console.log('AI生成 - 请求体:', req.body);
  
  const store = readStore();
  const { currentPhase, previousChoice, context } = req.body;
  
  const story = store.stories.find(s => s.id === req.params.storyId);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  const settings = store.settings || {};
  console.log('AI生成 - 设置信息:', { apiUrl: settings.apiUrl, model: settings.model, hasApiKey: !!settings.apiKey });
  
  if (!settings.apiKey) {
    res.status(400).json({ error: '未配置API密钥，请先在设置中配置API密钥' });
    return;
  }
  
  if (!settings.apiUrl) {
    res.status(400).json({ error: '未配置API地址，请先在设置中配置API地址' });
    return;
  }
  
  // 读取故事框架文件
  let framework = null;
  try {
    // 优先从故事元数据中获取框架路径
    let frameworkPath = story.metadata?.framework_path;
    if (frameworkPath) {
      frameworkPath = path.join(__dirname, '..', frameworkPath);
    } else {
      // 回退到旧路径
      frameworkPath = path.join(__dirname, '../stories', `${story.title}.json`);
    }
    
    if (fs.existsSync(frameworkPath)) {
      const frameworkContent = fs.readFileSync(frameworkPath, 'utf8');
      framework = JSON.parse(frameworkContent);
      console.log('[Choose and Advance] Framework loaded from:', frameworkPath);
    } else {
      console.log('[Choose and Advance] Framework file not found:', frameworkPath);
    }
  } catch (error) {
    console.error('读取框架文件失败:', error);
  }
  
  // 如果没有框架，使用默认阶段
  if (!framework) {
    console.log('[Choose and Advance] No framework available, using default phase');
    framework = {
      timeline: [
        { phase: '初期', title: '初期', description: '故事初期' },
        { phase: '前期', title: '前期', description: '故事前期' },
        { phase: '中期', title: '中期', description: '故事中期' },
        { phase: '后期', title: '后期', description: '故事后期' },
        { phase: '终期', title: '终期', description: '故事终期' }
      ]
    };
  }
  
  if (!framework.timeline) {
    res.status(400).json({ error: '故事框架格式错误' });
    return;
  }

  // 获取当前阶段信息：优先按章节索引匹配
  const currentChapterIdx = (() => {
    const events = (store.storyEvents || []).filter(se => se.story_id === req.params.storyId);
    const currentEvent = events.find(e => e.id === story.current_event_id);
    return currentEvent?.chapter_index ?? 0;
  })();

  let phase = framework.timeline.find(p =>
    Array.isArray(p.events) && p.events.some(ev => ev.chapter === currentChapterIdx)
  );
  if (!phase) {
    phase = framework.timeline.find(p => p.phase === currentPhase) || framework.timeline[0];
  }
  if (!phase) {
    res.status(400).json({ error: '阶段不存在' });
    return;
  }

  // 聚合同 phase 角色 + 当前章节窗口角色
  const samePhaseEntries2 = framework.timeline.filter(p => p.phase === phase.phase);
  const aggregatedChars2 = Array.from(new Set(
    samePhaseEntries2.flatMap(p => Array.isArray(p.characters) ? p.characters : [])
  ));
  const nearbyChars2 = Array.from(new Set(
    framework.timeline
      .filter(p => Array.isArray(p.events))
      .flatMap(p => p.events)
      .filter(ev => ev.chapter >= currentChapterIdx && ev.chapter <= currentChapterIdx + 3)
      .flatMap(ev => Array.isArray(ev.characters) ? ev.characters : [])
  ));
  phase = {
    ...phase,
    characters: Array.from(new Set([...nearbyChars2, ...aggregatedChars2]))
  };
  
  const targetUrl = resolveChatCompletionsUrl(settings.apiUrl);
  console.log('AI生成 - 目标URL:', targetUrl);
  
  try {
    // ===== 收集已发生的剧情上下文 =====
    const allHistory = (store.storyHistory || [])
      .filter(h => h.story_id === req.params.storyId)
      .sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));
    const recentHistory = allHistory.slice(-5); // 取最近 5 条
    const openingHistory = allHistory.length > 8 ? allHistory.slice(0, 1) : [];

    // 紧凑摘要：避免 description 大段重复
    const summarizeHistoryItem = (h) => {
      const tag = h.type === 'choice' ? '选' : (h.type === 'note' ? '记' : '剧');
      const title = (h.event_title || '').slice(0, 40);
      const desc = (h.event_description || '').slice(0, 80);
      const choice = h.choice ? ` →${String(h.choice).slice(0, 25)}` : '';
      return `[${tag}]${title}${desc ? `：${desc}` : ''}${choice}`;
    };
    const openingBlock = openingHistory.length > 0
      ? `\n【开局】${openingHistory.map(summarizeHistoryItem).join(' | ')}`
      : '';
    const recentBlock = recentHistory.length > 0
      ? `\n【最近剧情】\n${recentHistory.map(summarizeHistoryItem).join('\n')}`
      : '';

    const knownCharNames = [
      ...store.storyCharacters
        .filter(sc => sc.story_id === req.params.storyId)
        .map(sc => {
          const c = getAllCharacters(store).find(x => x.id === sc.character_id);
          return c ? c.name : null;
        })
        .filter(Boolean),
      ...store.storyNPCs.filter(n => n.story_id === req.params.storyId).map(n => n.name)
    ];
    const charsBlock = knownCharNames.length > 0
      ? `\n【已登场】${knownCharNames.slice(0, 8).join('、')}`
      : '';

    const currentEventForCtx = store.storyEvents.find(e => e.id === story.current_event_id);
    const currentEventBlock = currentEventForCtx
      ? `\n【刚刚发生】${currentEventForCtx.title}：${(currentEventForCtx.description || '').slice(0, 120)}`
      : '';

    const protagonistInfo = framework.protagonist
      ? JSON.stringify(framework.protagonist).slice(0, 250)
      : '';
    // 全部字段都做空值兜底，避免 undefined.slice/join 抛 TypeError
    const safePhaseDesc = String(phase.description || '').slice(0, 200);
    const safeKeyEvents = (Array.isArray(phase.key_events) ? phase.key_events : []).slice(0, 3).join('、');
    const safePhaseChars = (Array.isArray(phase.characters) ? phase.characters : []).slice(0, 4).join('、');
    const safeWorldbook = (Array.isArray(phase.worldbook_entries) ? phase.worldbook_entries : []).slice(0, 4).join('、');
    // 紧凑 system prompt（去掉所有冗余说明，靠 JSON 字段名传达约束）
    const systemPrompt = `RPG 剧情生成。延续已发生剧情，输出 JSON。

故事：${framework.name || '未知'}｜主角：${framework.protagonist || '未知'}${protagonistInfo ? `\n主角信息：${protagonistInfo}` : ''}
阶段：${phase.phase || '未知'}-${phase.title || ''}${safePhaseDesc ? `｜${safePhaseDesc}` : ''}
${safeKeyEvents ? `关键事件：${safeKeyEvents}\n` : ''}${safePhaseChars ? `本阶段角色：${safePhaseChars}\n` : ''}${safeWorldbook ? `设定：${safeWorldbook}` : ''}${charsBlock}${openingBlock}${recentBlock}${currentEventBlock}

规则：必须承接【刚刚发生】；标题要具体（禁用"新的冒险/继续前进"）；选择必须差异化。

输出 JSON：{"title":"10-20字具体标题","description":"60-110字承接前文","choices":[{"title":"具体行动","description":"20-30字后果"}]}（2-6 个选择，仅 JSON 无其他）`;

    const userPrompt = previousChoice
      ? `玩家选择「${previousChoice}」，生成承接事件。${context ? `\n${String(context).slice(0, 200)}` : ''}`
      : `生成下一事件。${context ? `\n${String(context).slice(0, 200)}` : ''}`;

    console.log('AI生成 - 开始API调用，目标URL:', targetUrl);
    console.log('AI生成 - 模型:', settings.model || 'gpt-3.5-turbo');

    const buildRequestBody = (useJsonMode) => {
      const body = {
        model: settings.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      };
      if (useJsonMode) body.response_format = { type: 'json_object' };
      return body;
    };

    const callLlm = async (useJsonMode, attempt) => {
      const t0 = Date.now();
      const r = await axios.post(targetUrl, buildRequestBody(useJsonMode), {
        headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000
      });
      console.log(`AI生成 - LLM 耗时 ${Date.now() - t0}ms (jsonMode=${useJsonMode}, attempt=${attempt})`);
      return r;
    };

    // ===== 透明自动重试：最多 3 次（含首次），每次根据错误自适应 =====
    const isTransient = (err) => {
      const status = err.response?.status;
      return status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
    };
    const isJsonModeRejected = (err) => {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      return (status === 400 || status === 422) &&
        /response_format|json[_ ]?object|not supported|unsupported|unrecognized/i.test(String(msg));
    };

    let response;
    let useJsonMode = settings.disableJsonMode !== true;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await callLlm(useJsonMode, attempt);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt === 3) break; // 已是最后一次

        if (isJsonModeRejected(err) && useJsonMode) {
          console.warn('AI生成 - JSON 模式被拒，下一次降级');
          useJsonMode = false;
          // 立即重试，不退避
          continue;
        }
        if (isTransient(err)) {
          const backoff = 600 * Math.pow(2, attempt - 1); // 600ms, 1200ms
          console.warn(`AI生成 - 第 ${attempt} 次失败 (${err.response?.status || err.code})，${backoff}ms 后重试`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw err; // 非临时性错误（4xx 等），不重试
      }
    }
    if (lastErr) throw lastErr;
    
    console.log('AI生成 - API调用成功，响应状态:', response.status);
    console.log('AI生成 - 响应数据:', JSON.stringify(response.data).substring(0, 500));
    
    if (!response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('AI生成 - 响应格式错误:', response.data);
      throw new Error('API响应格式错误');
    }
    
    const content = response.data.choices[0].message.content;
    console.log('AI生成 - AI返回内容:', content.substring(0, 500));
    
    let eventData;
    
    try {
      eventData = JSON.parse(content);
    } catch (e) {
      console.error('AI生成 - JSON解析失败:', e.message);
      console.error('AI生成 - 原始内容:', content);
      // 如果AI返回的不是纯JSON，尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          eventData = JSON.parse(jsonMatch[0]);
          console.log('AI生成 - 回退JSON提取成功');
        } catch (e2) {
          console.error('AI生成 - 回退JSON解析也失败:', e2.message);
          eventData = null;
        }
      }
      
      // 如果仍然失败，尝试修复截断的 JSON
      if (!eventData) {
        try {
          let jsonStr = content;
          if (jsonStr.trim().startsWith('{') && !jsonStr.trim().endsWith('}')) {
            const lastComma = jsonStr.lastIndexOf(',');
            if (lastComma > 0) {
              jsonStr = jsonStr.substring(0, lastComma + 1);
              if (jsonStr.includes('"choices"')) {
                jsonStr += ']}';
              } else {
                jsonStr += '}';
              }
            }
          }
          eventData = JSON.parse(jsonStr);
          console.log('AI生成 - 截断JSON修复成功');
        } catch (e3) {
          console.error('AI生成 - 截断JSON修复失败:', e3.message);
          eventData = null;
        }
      }
      
      if (!eventData) {
        // 降级：手动创建简单事件
        console.warn('AI生成 - 使用默认回退选项');
        // 尝试从原始内容中提取有用信息
        let extractedTitle = null;
        let extractedDescription = null;
        
        try {
          extractedTitle = content.match(/"title"\s*:\s*"([^"]+)"/)?.[1];
          extractedDescription = content.match(/"description"\s*:\s*"([^"]+)"/)?.[1];
        } catch (e) {
          console.warn('AI生成 - 正则提取失败:', e.message);
        }
        
        eventData = {
          title: extractedTitle || '新的冒险',
          description: extractedDescription || content.substring(0, 200),
          choices: [
            { title: '继续前进', description: '探索未知的前方' },
            { title: '仔细观察', description: '分析当前情况' }
          ]
        };
        
        if (extractedTitle) {
          console.log('AI生成 - 从内容中提取标题:', extractedTitle);
        }
      }
    }
    
    // 创建新事件
    const newEvent = {
      id: uuidv4(),
      story_id: req.params.storyId,
      chapter_index: Math.floor((store.storyEvents.filter(se => se.story_id === req.params.storyId).length) / 10),
      title: eventData.title || '新的冒险',
      description: eventData.description || '故事继续发展...',
      choices: Array.isArray(eventData.choices) ? eventData.choices : [
        { title: '继续前进', description: '探索未知的前方' },
        { title: '仔细观察', description: '分析当前情况' }
      ],
      parent_event_id: story.current_event_id,
      phase: currentPhase,
      created_at: now()
    };
    
    store.storyEvents.push(newEvent);

    // 检测事件中提及的角色 ID（主角 + 配角 + NPC，按 name 匹配）
    const allKnownChars = [
      ...store.storyCharacters
        .filter(sc => sc.story_id === req.params.storyId)
        .map(sc => {
          const c = getAllCharacters(store).find(x => x.id === sc.character_id);
          return c ? { id: c.id, name: c.name } : null;
        })
        .filter(Boolean),
      ...store.storyNPCs.filter(n => n.story_id === req.params.storyId).map(n => ({ id: n.id, name: n.name }))
    ];
    const detectionText = `${eventData.title || ''} ${eventData.description || ''}`;
    const involvedIds = allKnownChars
      .filter(c => c.name && detectionText.includes(c.name))
      .map(c => c.id);

    // 保存历史记录
    store.storyHistory.push({
      id: uuidv4(),
      story_id: req.params.storyId,
      type: 'ai_generate',
      event_id: newEvent.id,
      event_title: eventData.title || '新的冒险',
      event_description: eventData.description || '故事继续发展...',
      involved_character_ids: involvedIds,
      timestamp: now(),
      phase: currentPhase
    });
    
    // 更新故事的当前事件
    const storyIndex = store.stories.findIndex(s => s.id === req.params.storyId);
    if (storyIndex !== -1) {
      store.stories[storyIndex].current_event_id = newEvent.id;
      store.stories[storyIndex].updated_at = now();
    }
    
    writeStore(store);
    res.json(newEvent);
    
  } catch (error) {
    // 透传上游错误细节，方便前端定位（500 间歇性问题大多来自上游）
    const upstreamStatus = error.response?.status;
    const upstreamMsg = error.response?.data?.error?.message
      || error.response?.data?.message
      || error.response?.data?.error
      || error.message;
    const upstreamRaw = typeof error.response?.data === 'string'
      ? error.response.data.slice(0, 300)
      : JSON.stringify(error.response?.data || {}).slice(0, 300);
    console.error('AI生成事件失败:', {
      status: upstreamStatus,
      code: error.code,
      message: error.message,
      upstreamMsg,
      upstreamRaw
    });
    // 客户端看得到的消息：包含上游状态码 + 具体 message
    const friendly = upstreamStatus
      ? `上游 API ${upstreamStatus}：${upstreamMsg}`
      : `${error.code || '调用失败'}：${error.message}`;
    res.status(upstreamStatus && upstreamStatus < 500 ? upstreamStatus : 500)
      .json({ error: 'AI生成事件失败: ' + friendly });
  }
});
DELETED_OLD_AI_GENERATE_END */

// Story Relationship API - 关系管理
app.get('/api/stories/:storyId/relationships', (req, res) => {
  const store = readStore();
  const relationships = store.storyRelationships.filter(sr => sr.story_id === req.params.storyId);
  res.json(relationships);
});

app.post('/api/stories/:storyId/relationships', (req, res) => {
  const store = readStore();
  const { character_id, target_id, type, description } = req.body;
  
  const story = store.stories.find(s => s.id === req.params.storyId);
  if (!story) {
    res.status(404).json({ error: '故事不存在' });
    return;
  }
  
  if (!character_id || !target_id || !type) {
    res.status(400).json({ error: '角色ID、目标ID和关系类型为必填项' });
    return;
  }
  
  const relationship = {
    id: uuidv4(),
    story_id: req.params.storyId,
    character_id,
    target_id,
    type: type, // companion, enemy, neutral, romantic, family
    description: description || '',
    created_at: now()
  };
  
  store.storyRelationships.push(relationship);
  writeStore(store);
  res.json(relationship);
});

app.put('/api/stories/:storyId/relationships/:relationshipId', (req, res) => {
  const store = readStore();
  const relIndex = store.storyRelationships.findIndex(sr => 
    sr.id === req.params.relationshipId && sr.story_id === req.params.storyId
  );
  
  if (relIndex === -1) {
    res.status(404).json({ error: '关系不存在' });
    return;
  }
  
  const { type, description } = req.body;
  const relationship = store.storyRelationships[relIndex];
  
  if (type !== undefined) relationship.type = type;
  if (description !== undefined) relationship.description = description;
  
  store.storyRelationships[relIndex] = relationship;
  writeStore(store);
  res.json(relationship);
});

app.delete('/api/stories/:storyId/relationships/:relationshipId', (req, res) => {
  const store = readStore();
  store.storyRelationships = store.storyRelationships.filter(sr => 
    !(sr.id === req.params.relationshipId && sr.story_id === req.params.storyId)
  );
  writeStore(store);
  res.json({ success: true });
});

// ===================== 头像上传 / 故事历史管理 API =====================
const ALLOWED_AVATAR_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4MB

// 解析 dataURL，返回 { ext, buffer }
const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new HttpError(400, '头像格式错误，仅接受 base64 dataURL');
  const mime = match[1].toLowerCase();
  const ext = ALLOWED_AVATAR_MIME[mime];
  if (!ext) throw new HttpError(400, `不支持的图片类型: ${mime}（仅 jpg/png/webp/gif）`);
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0) throw new HttpError(400, '图片数据为空');
  if (buf.length > MAX_AVATAR_SIZE) throw new HttpError(400, `图片过大，最大 ${MAX_AVATAR_SIZE / 1024 / 1024}MB`);
  return { ext, buffer: buf };
};

// 删除旧头像（避免遗留文件累积）
const removeOldAvatar = (oldUrl) => {
  if (!oldUrl) return;
  const m = String(oldUrl).match(/\/api\/avatars\/([^/?#]+)/);
  if (!m) return;
  const filePath = path.join(avatarsDir, m[1]);
  if (filePath.startsWith(avatarsDir) && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }
};

// 写入头像并返回可访问 URL
const writeAvatar = (id, dataUrl) => {
  const { ext, buffer } = parseDataUrl(dataUrl);
  const fileName = `${id}-${Date.now()}.${ext}`;
  const filePath = path.join(avatarsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/api/avatars/${fileName}`;
};

// 上传/更新角色头像（DB 角色）
app.post('/api/characters/:id/avatar', (req, res, next) => {
  try {
    const id = requireString(req.params.id, 'id', { maxLen: 200 });
    const dataUrl = requireString(req.body?.dataUrl, 'dataUrl', { maxLen: 6 * 1024 * 1024 });
    const store = readStore();
    const idx = store.characters.findIndex(c => c.id === id);
    if (idx === -1) throw new HttpError(404, '角色不存在或不可编辑（文件来源角色请直接修改 .json 文件）');
    removeOldAvatar(store.characters[idx].avatar);
    const url = writeAvatar(id, dataUrl);
    store.characters[idx].avatar = url;
    store.characters[idx].updated_at = now();
    writeStore(store);
    res.json({ avatar: url });
  } catch (e) { next(e); }
});

// 上传/更新故事 NPC 头像
app.post('/api/stories/:storyId/npcs/:npcId/avatar', (req, res, next) => {
  try {
    const dataUrl = requireString(req.body?.dataUrl, 'dataUrl', { maxLen: 6 * 1024 * 1024 });
    const store = readStore();
    const idx = store.storyNPCs.findIndex(n => n.id === req.params.npcId && n.story_id === req.params.storyId);
    if (idx === -1) throw new HttpError(404, 'NPC 不存在');
    removeOldAvatar(store.storyNPCs[idx].avatar);
    const url = writeAvatar(req.params.npcId, dataUrl);
    store.storyNPCs[idx].avatar = url;
    writeStore(store);
    res.json({ avatar: url });
  } catch (e) { next(e); }
});

// 删除角色头像
app.delete('/api/characters/:id/avatar', (req, res, next) => {
  try {
    const store = readStore();
    const idx = store.characters.findIndex(c => c.id === req.params.id);
    if (idx === -1) throw new HttpError(404, '角色不存在');
    removeOldAvatar(store.characters[idx].avatar);
    store.characters[idx].avatar = '';
    store.characters[idx].updated_at = now();
    writeStore(store);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// 查询某角色参与的故事事件
// 角色匹配：name 出现在 history 条目的 event_title / event_description / choice 中
// 兼容老数据没有 involved_character_ids 字段的情况，自动按名字匹配
app.get('/api/characters/:id/events', (req, res, next) => {
  try {
    const charId = req.params.id;
    const storyIdFilter = req.query.storyId ? String(req.query.storyId) : null;
    const store = readStore();
    const character = getAllCharacters(store).find(c => c.id === charId)
      || store.storyNPCs.find(n => n.id === charId);
    if (!character) throw new HttpError(404, '角色不存在');

    const charName = String(character.name || '').trim();
    const events = store.storyHistory
      .filter(h => !storyIdFilter || h.story_id === storyIdFilter)
      .filter(h => {
        if (Array.isArray(h.involved_character_ids) && h.involved_character_ids.includes(charId)) return true;
        if (!charName) return false;
        const text = `${h.event_title || ''} ${h.event_description || ''} ${h.choice || ''}`;
        return text.includes(charName);
      })
      .sort((a, b) => (a.timestamp || a.created_at || '').localeCompare(b.timestamp || b.created_at || ''));

    res.json(events);
  } catch (e) { next(e); }
});

// 故事历史：手动添加一条笔记/事件
app.post('/api/stories/:storyId/history', (req, res, next) => {
  try {
    const title = requireString(req.body?.title, 'title', { maxLen: 200 });
    const description = optionalString(req.body?.description, 'description', { maxLen: 2000 });
    const involvedIds = Array.isArray(req.body?.involved_character_ids)
      ? req.body.involved_character_ids.filter(x => typeof x === 'string').slice(0, 50)
      : [];
    const store = readStore();
    if (!store.stories.find(s => s.id === req.params.storyId)) throw new HttpError(404, '故事不存在');
    const entry = {
      id: uuidv4(),
      story_id: req.params.storyId,
      type: 'note',
      event_title: title,
      event_description: description,
      choice: '',
      involved_character_ids: involvedIds,
      timestamp: now(),
      phase: req.body?.phase || ''
    };
    store.storyHistory.push(entry);
    writeStore(store);
    res.json(entry);
  } catch (e) { next(e); }
});

// 故事历史：编辑一条
app.put('/api/stories/:storyId/history/:historyId', (req, res, next) => {
  try {
    const store = readStore();
    const idx = store.storyHistory.findIndex(h => h.id === req.params.historyId && h.story_id === req.params.storyId);
    if (idx === -1) throw new HttpError(404, '历史条目不存在');
    const entry = store.storyHistory[idx];
    if (typeof req.body?.event_title === 'string') entry.event_title = req.body.event_title.slice(0, 200);
    if (typeof req.body?.event_description === 'string') entry.event_description = req.body.event_description.slice(0, 2000);
    if (typeof req.body?.choice === 'string') entry.choice = req.body.choice.slice(0, 500);
    if (Array.isArray(req.body?.involved_character_ids)) {
      entry.involved_character_ids = req.body.involved_character_ids.filter(x => typeof x === 'string').slice(0, 50);
    }
    entry.updated_at = now();
    writeStore(store);
    res.json(entry);
  } catch (e) { next(e); }
});

// 故事历史：删除一条
app.delete('/api/stories/:storyId/history/:historyId', (req, res, next) => {
  try {
    const store = readStore();
    const before = store.storyHistory.length;
    store.storyHistory = store.storyHistory.filter(h => !(h.id === req.params.historyId && h.story_id === req.params.storyId));
    if (store.storyHistory.length === before) throw new HttpError(404, '历史条目不存在');
    writeStore(store);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ===================== 角色卡热更新 API =====================
// 触发角色文件缓存清除，确保 AI 使用最新的角色数据
app.post('/api/characters/correct-from-novel', (req, res) => {
  try {
    // 清除目录签名缓存
    _dirSigCache.clear();
    console.log('[hot-reload] 已清除目录签名缓存');

    // 标记内存缓存为脏，强制下次重新读取文件
    _storeCache = null;
    _storeMtimeMs = 0;
    _storeDirty = false;
    _storeReadAt = 0;
    console.log('[hot-reload] 已清除内存缓存');

    // 清除角色卡特定的缓存（如果存在）
    if (typeof _characterCache !== 'undefined') {
      _characterCache.clear();
      console.log('[hot-reload] 已清除角色卡缓存');
    }

    // 清除世界书特定的缓存（如果存在）
    if (typeof _worldbookCache !== 'undefined') {
      _worldbookCache.clear();
      console.log('[hot-reload] 已清除世界书缓存');
    }

    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
      console.log('[hot-reload] 已触发垃圾回收');
    }

    res.json({
      success: true,
      message: '角色卡缓存已清除，下次加载将使用最新数据',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('[hot-reload] 清除缓存失败:', e);
    res.status(500).json({ error: '清除缓存失败' });
  }
});

// ===================== 版本号 API =====================
// 获取所有角色卡和世界书的版本号
app.get('/api/characters/versions', (req, res) => {
  try {
    const { getAllVersions } = require('./character-corrector');
    const versions = getAllVersions();
    res.json({ success: true, versions });
  } catch (e) {
    console.error('[versions] 获取版本号失败:', e);
    res.status(500).json({ error: '获取版本号失败' });
  }
});

// 获取指定角色卡或世界书的版本号
app.get('/api/characters/version', (req, res) => {
  try {
    const { ids } = req.query;
    const { getAllVersions } = require('./character-corrector');
    const allVersions = getAllVersions();
    
    if (ids) {
      const requestedIds = ids.split(',');
      const result = {};
      for (const id of requestedIds) {
        result[id] = allVersions[id] || 1;
      }
      res.json({ success: true, versions: result });
    } else {
      res.json({ success: true, versions: allVersions });
    }
  } catch (e) {
    console.error('[version] 获取版本号失败:', e);
    res.status(500).json({ error: '获取版本号失败' });
  }
});

// ===================== 仅审计 API =====================
// 仅生成差异报告，不执行修正
app.post('/api/characters/audit-only', async (req, res) => {
  try {
    const { auditOnly } = require('./character-corrector');
    const report = await auditOnly();
    res.json({ success: true, report });
  } catch (e) {
    console.error('[audit-only] 审计失败:', e);
    res.status(500).json({ error: '审计失败' });
  }
});

// ===================== 管理界面路由 =====================
app.get('/admin/correction', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-correction.html'));
});

// ===================== 验证 API =====================
// 获取角色卡的原始 JSON 数据，用于验证修正是否生效
app.get('/api/characters/raw/:id', (req, res) => {
  try {
    const { id } = req.params;
    const fs = require('fs');
    const path = require('path');
    
    const characterPath = path.join(__dirname, '../characters', `${id}.json`);
    const worldbookPath = path.join(__dirname, '../worldbook', `${id}.json`);
    
    let filePath = null;
    let type = null;
    
    if (fs.existsSync(characterPath)) {
      filePath = characterPath;
      type = 'character';
    } else if (fs.existsSync(worldbookPath)) {
      filePath = worldbookPath;
      type = 'worldbook';
    }
    
    if (!filePath) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    res.json({
      success: true,
      type: type,
      id: id,
      version: data.version || 1,
      updated_at: data.updated_at || null,
      data: data,
      file_path: filePath
    });
  } catch (e) {
    console.error('[verify] 获取角色卡原始数据失败:', e);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// ===================== 配置管理 API =====================
// 重新加载配置文件
app.post('/api/admin/reload-config', (req, res) => {
  try {
    const { reloadConfig, getCurrentConfig } = require('./scheduled-diagnosis');
    
    const newConfig = reloadConfig();
    
    console.log('[config] 配置已重新加载');
    console.log('[config] 关键词数量:', newConfig.keywords.length);
    console.log('[config] 自动修正:', newConfig.autoFix);
    
    res.json({
      success: true,
      message: '配置已重新加载',
      config: {
        keywords_count: newConfig.keywords.length,
        auto_fix: newConfig.autoFix,
        alert_on_new_errors: newConfig.alertOnNewErrors
      }
    });
  } catch (e) {
    console.error('[config] 重新加载配置失败:', e);
    res.status(500).json({ error: '重新加载配置失败' });
  }
});

// 获取当前配置
app.get('/api/admin/config', (req, res) => {
  try {
    const { getCurrentConfig } = require('./scheduled-diagnosis');
    const config = getCurrentConfig();
    
    res.json({
      success: true,
      config: {
        keywords_count: config.keywords.length,
        keywords: config.keywords,
        auto_fix: config.autoFix,
        alert_on_new_errors: config.alertOnNewErrors,
        scan_paths: config.scanPaths,
        exclude_patterns: config.excludePatterns
      }
    });
  } catch (e) {
    console.error('[config] 获取配置失败:', e);
    res.status(500).json({ error: '获取配置失败' });
  }
});

// ===================== 小说提取 API =====================
let extractionProcess = null;

// 开始提取小说
app.post('/api/admin/extract-novel', (req, res) => {
  try {
    if (extractionProcess) {
      return res.json({ success: false, message: '提取任务正在进行中' });
    }

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    
    // 读取激活的小说信息
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    const metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    
    if (!fs.existsSync(activeFilePath)) {
      return res.status(400).json({ success: false, message: '未设置激活的小说，请先上传小说文件' });
    }
    
    const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
    const activeNovelId = activeData.activeNovelId;
    
    if (!activeNovelId) {
      return res.status(400).json({ success: false, message: '未选择小说' });
    }
    
    let novelFilePath = null;
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata[activeNovelId] && metadata[activeNovelId].filePath) {
        novelFilePath = metadata[activeNovelId].filePath;
      }
    }
    
    if (!novelFilePath) {
      return res.status(400).json({ success: false, message: '未找到小说文件路径，请重新上传小说' });
    }
    
    extractionProcess = spawn('node', [path.join(__dirname, 'enrich-story-from-novel.js'), novelFilePath, activeNovelId], {
      env: { ...process.env, RETRY_FAILED: 'false' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    extractionProcess.on('close', (code) => {
      console.log(`[extract] 提取进程退出，代码: ${code}`);
      extractionProcess = null;
    });

    res.json({ success: true, message: '提取任务已启动' });
  } catch (e) {
    console.error('[extract] 启动提取失败:', e);
    res.status(500).json({ success: false, message: '启动提取失败' });
  }
});

// 重试失败章节
app.post('/api/admin/retry-failed', (req, res) => {
  try {
    if (extractionProcess) {
      return res.json({ success: false, message: '提取任务正在进行中' });
    }

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    
    // 读取激活的小说信息
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    const metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    
    if (!fs.existsSync(activeFilePath)) {
      return res.status(400).json({ success: false, message: '未设置激活的小说' });
    }
    
    const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
    const activeNovelId = activeData.activeNovelId;
    
    if (!activeNovelId) {
      return res.status(400).json({ success: false, message: '未选择小说' });
    }
    
    let novelFilePath = null;
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata[activeNovelId] && metadata[activeNovelId].filePath) {
        novelFilePath = metadata[activeNovelId].filePath;
      }
    }
    
    if (!novelFilePath) {
      return res.status(400).json({ success: false, message: '未找到小说文件路径' });
    }
    
    extractionProcess = spawn('node', [path.join(__dirname, 'enrich-story-from-novel.js'), novelFilePath, activeNovelId], {
      env: { ...process.env, RETRY_FAILED: 'true' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    extractionProcess.on('close', (code) => {
      console.log(`[extract] 重试进程退出，代码: ${code}`);
      extractionProcess = null;
    });

    res.json({ success: true, message: '重试任务已启动' });
  } catch (e) {
    console.error('[extract] 启动重试失败:', e);
    res.status(500).json({ success: false, message: '启动重试失败' });
  }
});

// 停止提取
app.post('/api/admin/extract-stop', (req, res) => {
  try {
    if (!extractionProcess) {
      return res.json({ success: false, message: '没有正在进行的提取任务' });
    }

    extractionProcess.kill('SIGTERM');
    extractionProcess = null;

    res.json({ success: true, message: '提取任务已停止' });
  } catch (e) {
    console.error('[extract] 停止提取失败:', e);
    res.status(500).json({ success: false, message: '停止提取失败' });
  }
});

// 获取提取状态
app.get('/api/admin/extract-status', (req, res) => {
  try {
    const isRunning = extractionProcess !== null;
    
    // 尝试读取提取进度
    const path = require('path');
    const fs = require('fs');
    const novelsDir = path.join(__dirname, '../data/novels');
    
    let stats = { characters: 0, events: 0, worldbook: 0 };
    
    // 查找第一个小说目录
    if (fs.existsSync(novelsDir)) {
      const novelDirs = fs.readdirSync(novelsDir).filter(d => d !== '_metadata.json' && !d.startsWith('.'));
      if (novelDirs.length > 0) {
        const novelId = novelDirs[0];
        const progressFile = path.join(novelsDir, novelId, 'extraction_progress.json');
        
        if (fs.existsSync(progressFile)) {
          try {
            const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
            if (progress.allCharacters) {
              stats.characters = Object.keys(progress.allCharacters).length;
            }
            if (progress.allEvents) {
              stats.events = progress.allEvents.length;
            }
            if (progress.allWorldbook) {
              stats.worldbook = Object.values(progress.allWorldbook).flat().length;
            }
          } catch (e) {
            console.error('[extract] 读取进度失败:', e);
          }
        }
      }
    }

    res.json({
      success: true,
      isRunning: isRunning,
      stats: stats
    });
  } catch (e) {
    console.error('[extract] 获取状态失败:', e);
    res.status(500).json({ error: '获取状态失败' });
  }
});

// 提取日志流（Server-Sent Events）
app.get('/api/admin/extract-logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const path = require('path');
  const fs = require('fs');
  const logsDir = path.join(__dirname, '../logs');
  const logFile = path.join(logsDir, 'extract-novel.log');

  // 发送日志内容
  const sendLogs = () => {
    if (fs.existsSync(logFile)) {
      try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          res.write(`data: ${JSON.stringify({ log: line })}\n\n`);
        });
      } catch (e) {
        console.error('[extract] 读取日志失败:', e);
      }
    }
  };

  // 初始发送
  sendLogs();

  // 定期检查日志更新
  const interval = setInterval(sendLogs, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// 全局错误处理：避免未捕获异常导致进程崩溃
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// ===================== 定时诊断任务 =====================
// 每天凌晨 3 点运行诊断任务
const DIAGNOSIS_CRON = process.env.DIAGNOSIS_CRON || '0 3 * * *';

function startScheduledDiagnosis() {
  try {
    const { runDiagnosis } = require('./scheduled-diagnosis');
    
    console.log('[定时诊断] 已启动，cron 表达式:', DIAGNOSIS_CRON);
    
    cron.schedule(DIAGNOSIS_CRON, async () => {
      console.log('[定时诊断] 开始执行...');
      try {
        await runDiagnosis({
          autoFix: true,
          alertOnNewErrors: true
        });
        console.log('[定时诊断] 执行完成');
      } catch (error) {
        console.error('[定时诊断] 执行失败:', error);
      }
    });
    
    // 启动时立即运行一次（可选）
    if (process.env.RUN_DIAGNOSIS_ON_START === 'true') {
      console.log('[定时诊断] 启动时立即运行诊断...');
      runDiagnosis({
        autoFix: false,
        alertOnNewErrors: true
      }).catch(error => {
        console.error('[定时诊断] 启动诊断失败:', error);
      });
    }
  } catch (error) {
    console.error('[定时诊断] 启动失败:', error);
    console.error('[定时诊断] 请确保已安装 node-cron: npm install node-cron');
    console.error('[定时诊断] 定时任务已禁用，但服务器将继续运行');
    // 不要抛出错误，让服务器继续运行
  }
}

// ===================== 新故事框架 API =====================
// 故事会话管理
app.get('/api/story-framework/sessions', (req, res) => {
  try {
    const manager = getStoryStateManager();
    const sessions = manager.listSessions();
    res.json(sessions);
  } catch (error) {
    log.error('SESSION_LIST', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/story-framework/sessions', (req, res) => {
  try {
    const manager = getStoryStateManager();
    const session = manager.createSession();
    log.info('SESSION_CREATE', { sessionId: session.sessionId });
    res.json(session);
  } catch (error) {
    log.error('SESSION_CREATE', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/story-framework/sessions/:sessionId', (req, res) => {
  try {
    const manager = getStoryStateManager();
    const session = manager.loadSession(req.params.sessionId);
    res.json(session);
  } catch (error) {
    log.error('SESSION_LOAD', error, { sessionId: req.params.sessionId });
    res.status(404).json({ error: error.message });
  }
});

app.delete('/api/story-framework/sessions/:sessionId', (req, res) => {
  try {
    const manager = getStoryStateManager();
    const success = manager.deleteSession(req.params.sessionId);
    if (success) {
      log.info('SESSION_DELETE', { sessionId: req.params.sessionId });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '会话不存在' });
    }
  } catch (error) {
    log.error('SESSION_DELETE', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 获取当前章节
app.get('/api/story-framework/sessions/:sessionId/current-chapter', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const chapter = manager.getCurrentChapter();
    res.json(chapter);
  } catch (error) {
    log.error('CHAPTER_LOAD', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 推进到下一章
app.post('/api/story-framework/sessions/:sessionId/advance', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const beforeChapterIndex = manager.state.currentChapterIndex;
    const chapter = manager.advanceToNextChapter();
    const afterChapterIndex = chapter.chapterIndex;
    
    log.logStateChange(req.params.sessionId, 'CHAPTER_ADVANCE', 
      { currentChapterIndex: beforeChapterIndex },
      { currentChapterIndex: afterChapterIndex }
    );
    
    res.json(chapter);
  } catch (error) {
    log.error('CHAPTER_ADVANCE', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 跳转到指定章节
app.post('/api/story-framework/sessions/:sessionId/jump', (req, res) => {
  try {
    const { chapterIndex } = req.body;
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const beforeChapterIndex = manager.state.currentChapterIndex;
    const chapter = manager.jumpToChapter(chapterIndex);
    const afterChapterIndex = chapter.chapterIndex;
    
    log.logStateChange(req.params.sessionId, 'CHAPTER_JUMP',
      { currentChapterIndex: beforeChapterIndex },
      { currentChapterIndex: afterChapterIndex }
    );
    
    res.json(chapter);
  } catch (error) {
    log.error('CHAPTER_JUMP', error, { sessionId: req.params.sessionId, chapterIndex });
    res.status(500).json({ error: error.message });
  }
});

// 处理分支选择
app.post('/api/story-framework/sessions/:sessionId/choose', async (req, res) => {
  try {
    const { chapterIndex, branchId, advance = false } = req.body;
    const store = readStore();
    const settings = store.settings || {};
    
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const beforeState = JSON.parse(JSON.stringify(manager.state));
    
    const handler = new choiceHandler.ChoiceHandler(settings);
    const result = await handler.handleChoice({
      sessionId: req.params.sessionId,
      chapterIndex,
      branchId,
      advance
    });
    
    const afterState = JSON.parse(JSON.stringify(manager.state));
    log.logPlayerChoice(req.params.sessionId, branchId, branchId, beforeState, afterState);
    
    res.json(result);
  } catch (error) {
    log.error('CHOICE_SUBMIT', error, { sessionId: req.params.sessionId, chapterIndex, branchId });
    res.status(500).json({ error: error.message });
  }
});

// 获取当前章节的分支选项
app.get('/api/story-framework/sessions/:sessionId/branches', (req, res) => {
  try {
    const handler = new choiceHandler.ChoiceHandler();
    const branches = handler.getCurrentBranches(req.params.sessionId);
    res.json(branches);
  } catch (error) {
    log.error('BRANCHES_LOAD', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 检查是否可以推进
app.get('/api/story-framework/sessions/:sessionId/can-advance', (req, res) => {
  try {
    const handler = new choiceHandler.ChoiceHandler();
    const result = handler.canAdvance(req.params.sessionId);
    res.json(result);
  } catch (error) {
    log.error('CAN_ADVANCE_CHECK', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 获取角色状态
app.get('/api/story-framework/sessions/:sessionId/character/:characterName', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const state = manager.getCharacterState(req.params.characterName);
    res.json(state);
  } catch (error) {
    log.error('CHARACTER_STATE', error, { sessionId: req.params.sessionId, characterName: req.params.characterName });
    res.status(500).json({ error: error.message });
  }
});

// 获取所有角色状态（批量接口）
app.get('/api/story-framework/sessions/:sessionId/characters', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    
    const session = manager.state;
    const framework = manager.framework;
    
    // 从框架中获取所有角色
    const allCharacters = [];
    
    // 添加主角
    if (framework.protagonist) {
      const protagonistState = session.characterStates[framework.protagonist.name];
      allCharacters.push({
        name: framework.protagonist.name,
        type: 'protagonist',
        description: framework.protagonist.description,
        state: protagonistState || { name: framework.protagonist.name, realm: '未知', location: '未知', alive: true }
      });
    }
    
    // 添加主要角色
    if (framework.settings.focusCharacters && Array.isArray(framework.settings.focusCharacters)) {
      for (const char of framework.settings.focusCharacters) {
        if (!allCharacters.find(c => c.name === char.name)) {
          const charState = session.characterStates[char.name];
          allCharacters.push({
            name: char.name,
            type: 'focus',
            description: char.description,
            state: charState || { name: char.name, realm: '未知', location: '未知', alive: true }
          });
        }
      }
    }
    
    // 添加当前章节的角色
    const currentChapter = manager.getCurrentChapter();
    if (currentChapter && currentChapter.characters) {
      for (const charName of currentChapter.characters) {
        if (!allCharacters.find(c => c.name === charName)) {
          const charState = session.characterStates[charName];
          allCharacters.push({
            name: charName,
            type: 'chapter',
            description: '当前章节角色',
            state: charState || { name: charName, realm: '未知', location: '未知', alive: true }
          });
        }
      }
    }
    
    res.json(allCharacters);
  } catch (error) {
    log.error('CHARACTERS_BATCH', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 记录角色互动
app.post('/api/story-framework/sessions/:sessionId/interaction', (req, res) => {
  try {
    const { characterName, interactionType, description } = req.body;
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    manager.recordInteraction(characterName, interactionType, description);
    log.info('INTERACTION_RECORD', { sessionId: req.params.sessionId, characterName, interactionType });
    res.json({ success: true });
  } catch (error) {
    log.error('INTERACTION_RECORD', error, { sessionId: req.params.sessionId, characterName });
    res.status(500).json({ error: error.message });
  }
});

// 获取会话摘要
app.get('/api/story-framework/sessions/:sessionId/summary', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const summary = manager.getSessionSummary();
    res.json(summary);
  } catch (error) {
    log.error('SUMMARY_LOAD', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// AI生成事件（使用新框架）
app.post('/api/story-framework/sessions/:sessionId/generate-event', async (req, res) => {
  const startTime = Date.now();
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    
    const store = readStore();
    const settings = store.settings || {};
    if (!settings.apiKey) {
      return res.status(400).json({ error: '未配置API密钥' });
    }
    
    const generator = new aiContentGenerator.AIContentGenerator(settings);
    const currentChapter = manager.getCurrentChapter();
    const session = manager.state;
    
    const history = session.chosenBranches.map(cb => ({
      type: 'choice',
      event_title: cb.branchTitle,
      choice: cb.branchTitle,
      timestamp: cb.timestamp
    }));
    
    const event = await generator.generateEvent({
      framework: manager.framework,
      currentChapter,
      history,
      playerInfluence: session.playerInfluence
    });
    
    const latency = Date.now() - startTime;
    log.logAIGeneration(req.params.sessionId, 
      JSON.stringify({ currentChapter, history }).substring(0, 200),
      JSON.stringify(event).substring(0, 200),
      0, // tokensUsed - 需要从 API 响应中获取
      settings.model || 'deepseek-chat',
      latency
    );
    
    res.json(event);
  } catch (error) {
    const latency = Date.now() - startTime;
    log.error('AI_GENERATION', error, { sessionId: req.params.sessionId, latency });
    res.status(500).json({ error: error.message });
  }
});

// ===================== 长期记忆管理 API =====================
// 获取短期记忆
app.get('/api/story-framework/sessions/:sessionId/memories/short-term', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const memories = manager.getShortTermMemory();
    res.json(memories);
  } catch (error) {
    log.error('MEMORY_SHORT_TERM', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 获取相关长期记忆
app.get('/api/story-framework/sessions/:sessionId/memories/long-term', (req, res) => {
  try {
    const { query, topK = 5 } = req.query;
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const memories = manager.retrieveRelevantMemories(query, parseInt(topK));
    res.json(memories);
  } catch (error) {
    log.error('MEMORY_LONG_TERM', error, { sessionId: req.params.sessionId, query });
    res.status(500).json({ error: error.message });
  }
});

// 获取所有长期记忆
app.get('/api/story-framework/sessions/:sessionId/memories/all', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const memories = manager.getAllLongTermMemories();
    res.json(memories);
  } catch (error) {
    log.error('MEMORY_ALL', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// 删除长期记忆
app.delete('/api/story-framework/sessions/:sessionId/memories/:memoryId', (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    manager.deleteLongTermMemory(req.params.memoryId);
    log.info('MEMORY_DELETE', { sessionId: req.params.sessionId, memoryId: req.params.memoryId });
    res.json({ success: true });
  } catch (error) {
    log.error('MEMORY_DELETE', error, { sessionId: req.params.sessionId, memoryId: req.params.memoryId });
    res.status(500).json({ error: error.message });
  }
});

// 清理旧记忆
app.post('/api/story-framework/sessions/:sessionId/memories/clean', (req, res) => {
  try {
    const { beforeChapterIndex } = req.body;
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const deletedCount = manager.cleanOldMemories(beforeChapterIndex);
    log.info('MEMORY_CLEAN', { sessionId: req.params.sessionId, beforeChapterIndex, deletedCount });
    res.json({ success: true, deletedCount });
  } catch (error) {
    log.error('MEMORY_CLEAN', error, { sessionId: req.params.sessionId, beforeChapterIndex });
    res.status(500).json({ error: error.message });
  }
});

// 压缩记忆
app.post('/api/story-framework/sessions/:sessionId/memories/compress', async (req, res) => {
  try {
    const manager = getStoryStateManager();
    manager.loadSession(req.params.sessionId);
    const result = await manager.compressMemories();
    log.info('MEMORY_COMPRESS', { sessionId: req.params.sessionId, result });
    res.json(result);
  } catch (error) {
    log.error('MEMORY_COMPRESS', error, { sessionId: req.params.sessionId });
    res.status(500).json({ error: error.message });
  }
});

// ===================== 记忆配置 API =====================
// 获取记忆配置
app.get('/api/story-framework/memory/config', (req, res) => {
  try {
    const config = longTermMemory.config;
    res.json(config);
  } catch (error) {
    log.error('MEMORY_CONFIG_GET', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新记忆配置
app.post('/api/story-framework/memory/config', (req, res) => {
  try {
    const newConfig = req.body;
    const updatedConfig = longTermMemory.updateMemoryConfig(newConfig);
    log.info('MEMORY_CONFIG_UPDATE', { oldConfig: longTermMemory.config, newConfig: updatedConfig });
    res.json(updatedConfig);
  } catch (error) {
    log.error('MEMORY_CONFIG_UPDATE', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取记忆统计信息
app.get('/api/story-framework/memory/stats', (req, res) => {
  try {
    const stats = longTermMemory.getMemoryStats();
    res.json(stats);
  } catch (error) {
    log.error('MEMORY_STATS', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== 监控面板 API =====================
// 监控面板页面
app.get('/admin/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin/logs.html'));
});

// 获取日志日期列表
app.get('/api/admin/log-dates', (req, res) => {
  try {
    const log = logger.getLogger();
    const dates = log.getLogFiles();
    const dateStrings = dates.map(file => file.replace('story-', '').replace('.log', ''));
    res.json(dateStrings);
  } catch (error) {
    console.error('获取日志日期失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取指定日期的日志
app.get('/api/admin/logs', (req, res) => {
  try {
    const { date } = req.query;
    const log = logger.getLogger();
    const logs = date ? log.readLogFile(date) : log.readLogFile();
    res.json(logs);
  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 一致性检查 API
app.post('/api/story-framework/consistency-check', async (req, res) => {
  try {
    const { date, autoFix = false } = req.body;
    
    const checker = new consistencyChecker.ConsistencyChecker();
    const violations = checker.run(date);
    
    let addedCount = 0;
    if (autoFix && violations.totalViolations > 0) {
      addedCount = checker.autoFix(violations.violations);
    }
    
    res.json({
      totalViolations: violations.totalViolations,
      violations: violations.violations,
      addedAnchors: addedCount
    });
  } catch (error) {
    log.error('CONSISTENCY_CHECK', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取最近自动添加的锚点
app.get('/api/story-framework/autofix-history', (req, res) => {
  try {
    const count = parseInt(req.query.count || '10', 10);
    const history = consistencyChecker.getRecentAutoFixes(count);
    res.json(history);
  } catch (error) {
    log.error('AUTOFIX_HISTORY', error);
    res.status(500).json({ error: error.message });
  }
});

// 重新生成故事框架
app.post('/api/story-framework/regenerate', async (req, res) => {
  try {
    const { resetSessions = false, protagonist, startChapter, maxChapters, focusCharacters, playerInfluence, interactionMode, branches, protagonistProfile } = req.body;
    
    // 检查是否有故事框架生成器
    const frameworkGeneratorPath = path.join(__dirname, 'story-framework-generator.js');
    if (!fs.existsSync(frameworkGeneratorPath)) {
      return res.status(400).json({ 
        error: '故事框架生成器不存在',
        message: '请确保 server/story-framework-generator.js 存在'
      });
    }
    
    log.info('FRAMEWORK_REGENERATE', { resetSessions, protagonist, startChapter, maxChapters, protagonistProfile });
    
    // 动态加载并运行生成器
    try {
      const { generateStoryFramework } = require('./story-framework-generator');
      const options = {};

      // 如果提供了参数，使用参数
      if (protagonist) options.protagonist = protagonist;
      if (startChapter) options.startingPoint = startChapter;
      if (maxChapters) options.maxChapters = maxChapters;
      if (focusCharacters) options.focusCharacters = focusCharacters;
      if (playerInfluence) options.playerInfluence = playerInfluence;
      if (interactionMode) options.interactionMode = interactionMode;
      if (branches !== undefined) options.branches = branches;
      if (protagonistProfile) options.protagonistProfile = protagonistProfile;

      const result = await generateStoryFramework(options);
      
      // 获取当前激活的小说ID
      const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
      let activeNovelId = null;
      
      if (fs.existsSync(activeFilePath)) {
        const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
        activeNovelId = activeData.activeNovelId;
      }
      
      if (!activeNovelId) {
        return res.status(400).json({ 
          error: '未选择小说',
          message: '请先在控制面板选择小说'
        });
      }
      
      // 保存框架到文件（按主角名称存储，而非按小说）
      const protagonistName = result.protagonist.name || 'default';
      const frameworkPath = path.join(__dirname, '../data/novels', activeNovelId, 'frameworks', `${protagonistName}_framework.json`);
      const frameworkDir = path.dirname(frameworkPath);
      
      if (!fs.existsSync(frameworkDir)) {
        fs.mkdirSync(frameworkDir, { recursive: true });
      }
      
      fs.writeFileSync(frameworkPath, JSON.stringify(result, null, 2));
      log.info('FRAMEWORK_SAVED', { path: frameworkPath, novelId: activeNovelId, protagonist: protagonistName });
      
      res.json({ 
        success: true, 
        framework: result,
        framework_path: frameworkPath,
        protagonist_name: protagonistName
      });
    } catch (genError) {
      log.error('FRAMEWORK_GENERATION_FAILED', genError);
      res.status(500).json({ 
        error: '框架生成失败',
        message: genError.message
      });
    }
  } catch (error) {
    log.error('FRAMEWORK_REGENERATE', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取可用的框架列表（按主角）
app.get('/api/story-framework/list', (req, res) => {
  try {
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    let activeNovelId = null;
    
    if (fs.existsSync(activeFilePath)) {
      const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
      activeNovelId = activeData.activeNovelId;
    }
    
    if (!activeNovelId) {
      return res.status(400).json({ error: '未选择小说' });
    }
    
    const frameworksDir = path.join(__dirname, '../data/novels', activeNovelId, 'frameworks');
    const frameworks = [];
    
    if (fs.existsSync(frameworksDir)) {
      const files = fs.readdirSync(frameworksDir);
      files.forEach(file => {
        if (file.endsWith('_framework.json')) {
          const protagonistName = file.replace('_framework.json', '');
          const frameworkPath = path.join(frameworksDir, file);
          const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
          frameworks.push({
            protagonist_name: protagonistName,
            framework_path: frameworkPath,
            generated_at: framework.generatedAt,
            version: framework.version
          });
        }
      });
    }
    
    res.json(frameworks);
  } catch (error) {
    log.error('FRAMEWORK_LIST', error);
    res.status(500).json({ error: error.message });
  }
});

// 从指定框架创建故事
app.post('/api/story-framework/create-story', (req, res) => {
  try {
    const { protagonist_name } = req.body;
    
    if (!protagonist_name) {
      return res.status(400).json({ error: '缺少主角名称' });
    }
    
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    let activeNovelId = null;
    
    if (fs.existsSync(activeFilePath)) {
      const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
      activeNovelId = activeData.activeNovelId;
    }
    
    if (!activeNovelId) {
      return res.status(400).json({ error: '未选择小说' });
    }
    
    const frameworkPath = path.join(__dirname, '../data/novels', activeNovelId, 'frameworks', `${protagonist_name}_framework.json`);
    
    if (!fs.existsSync(frameworkPath)) {
      return res.status(404).json({ 
        error: '框架不存在',
        message: `主角 ${protagonist_name} 的框架文件不存在`
      });
    }
    
    const result = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
    
    const store = readStore();
    
    // 检查是否已存在该框架的故事
    const existingStory = store.stories.find(s => s.metadata?.protagonist_name === protagonist_name);
    
    if (existingStory) {
      return res.json({ 
        success: true, 
        storyId: existingStory.id,
        message: '故事已存在'
      });
    }
    
    // 获取角色列表（从角色缓存）
    const characterCachePath = path.join(__dirname, '../data/novels', activeNovelId, 'character_attributes_cache.json');
    let characters = [];
    if (fs.existsSync(characterCachePath)) {
      const characterCache = JSON.parse(fs.readFileSync(characterCachePath, 'utf8'));
      characters = Object.values(characterCache);
    }
    
    // 使用框架中的主角创建或查找角色
    const protagonistName = result.protagonist.name;
    let mainCharacter = characters.find(c => c.name === protagonistName);
    
    // 如果主角不存在于角色列表中，从框架创建新角色
    if (!mainCharacter) {
      mainCharacter = {
        name: protagonistName,
        description: result.protagonist.description || '',
        personality: result.protagonist.personality || '',
        scenario: result.protagonist.openingScenario || ''
      };
    }
    
    // 创建故事
    const storyId = uuidv4();
    const story = {
      id: storyId,
      title: `${result.protagonist.name}的故事`,
      description: `基于框架生成的故事，起点：${result.settings.startChapter}，共${result.statistics.totalChapters}章`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_event_id: null,
      framework_version: result.version,
      generated_at: result.generatedAt,
      phase: result.settings.startChapter,
      metadata: {
        novel_id: activeNovelId,
        framework_path: `data/novels/${activeNovelId}/frameworks/${protagonist_name}_framework.json`,
        protagonist_name: protagonistName
      }
    };
    
    store.stories.push(story);
    
    // 将角色添加到全局角色存储（如果不存在）
    const allCharacters = getAllCharacters(store);
    
    // 关联主角
    if (mainCharacter) {
      // 检查主角是否已在全局角色存储中
      let globalMainChar = allCharacters.find(c => c.name === mainCharacter.name);
      if (!globalMainChar) {
        // 创建新角色
        globalMainChar = {
          id: uuidv4(),
          name: mainCharacter.name,
          description: mainCharacter.description || '',
          personality: mainCharacter.personality || '',
          scenario: mainCharacter.scenario || '',
          avatar: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        store.characters.push(globalMainChar);
      }
      
      store.storyCharacters.push({
        id: uuidv4(),
        story_id: storyId,
        character_id: globalMainChar.id,
        role: 'protagonist',
        created_at: new Date().toISOString()
      });
    }
    
    // 关联配角（重点角色）
    if (result.settings.focusCharacters && result.settings.focusCharacters.length > 0) {
      result.settings.focusCharacters.forEach(charName => {
        const char = characters.find(c => c.name === charName);
        if (char) {
          // 检查配角是否已在全局角色存储中
          let globalChar = allCharacters.find(c => c.name === char.name);
          if (!globalChar) {
            // 创建新角色
            globalChar = {
              id: uuidv4(),
              name: char.name,
              description: char.description || '',
              personality: char.personality || '',
              scenario: char.scenario || '',
              avatar: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            store.characters.push(globalChar);
          }
          
          store.storyCharacters.push({
            id: uuidv4(),
            story_id: storyId,
            character_id: globalChar.id,
            role: 'supporting',
            created_at: new Date().toISOString()
          });
        }
      });
    }
    
    writeStore(store);
    log.info('STORY_CREATED', { storyId, protagonist: result.protagonist.name });
    
    res.json({ 
      success: true, 
      storyId,
      story
    });
  } catch (error) {
    log.error('CREATE_STORY_FROM_FRAMEWORK', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看指定框架
app.post('/api/story-framework/view', (req, res) => {
  try {
    const { protagonist_name } = req.body;
    
    if (!protagonist_name) {
      return res.status(400).json({ error: '缺少主角名称' });
    }
    
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    let activeNovelId = null;
    
    if (fs.existsSync(activeFilePath)) {
      const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
      activeNovelId = activeData.activeNovelId;
    }
    
    if (!activeNovelId) {
      return res.status(400).json({ error: '未选择小说' });
    }
    
    const frameworkPath = path.join(__dirname, '../data/novels', activeNovelId, 'frameworks', `${protagonist_name}_framework.json`);
    
    if (!fs.existsSync(frameworkPath)) {
      return res.status(404).json({ 
        error: '框架不存在',
        message: `主角 ${protagonist_name} 的框架文件不存在`
      });
    }
    
    const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
    res.json(framework);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除指定框架
app.delete('/api/story-framework/delete', (req, res) => {
  try {
    const { protagonist_name } = req.body;
    
    if (!protagonist_name) {
      return res.status(400).json({ error: '缺少主角名称' });
    }
    
    const activeFilePath = path.join(__dirname, '../data/novels/_active.json');
    let activeNovelId = null;
    
    if (fs.existsSync(activeFilePath)) {
      const activeData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8'));
      activeNovelId = activeData.activeNovelId;
    }
    
    if (!activeNovelId) {
      return res.status(400).json({ error: '未选择小说' });
    }
    
    const frameworkPath = path.join(__dirname, '../data/novels', activeNovelId, 'frameworks', `${protagonist_name}_framework.json`);
    
    if (!fs.existsSync(frameworkPath)) {
      return res.status(404).json({ 
        error: '框架不存在',
        message: `主角 ${protagonist_name} 的框架文件不存在`
      });
    }
    
    fs.unlinkSync(frameworkPath);
    
    res.json({ 
      success: true,
      message: `主角 ${protagonist_name} 的框架已删除`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取故事框架
app.get('/api/novels/:novelId/framework', async (req, res) => {
  try {
    const { novelId } = req.params;
    const frameworkPath = path.join(__dirname, '../data/novels', novelId, 'story_framework.json');
    
    if (!fs.existsSync(frameworkPath)) {
      return res.status(404).json({ 
        error: '框架不存在',
        message: '请先生成故事框架'
      });
    }
    
    const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'));
    res.setHeader('Content-Type', 'application/json');
    res.json(framework);
  } catch (error) {
    log.error('GET_FRAMEWORK', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: error.message });
  }
});

// 获取角色重要性排名
app.get('/api/novels/:novelId/character-ranking', async (req, res) => {
  try {
    const { novelId } = req.params;
    const rankingPath = path.join(__dirname, '../data/novels', novelId, 'character_importance_ranking.json');
    
    if (!fs.existsSync(rankingPath)) {
      return res.status(404).json({ 
        error: '角色排名不存在',
        message: '请先运行角色排名脚本'
      });
    }
    
    const ranking = JSON.parse(fs.readFileSync(rankingPath, 'utf8'));
    res.json(ranking);
  } catch (error) {
    log.error('GET_CHARACTER_RANKING', error);
    res.status(500).json({ error: error.message });
  }
});

// 生成角色重要性排名
app.post('/api/novels/:novelId/generate-character-ranking', async (req, res) => {
  try {
    const { novelId } = req.params;
    
    // 检查必要文件是否存在
    const characterCachePath = path.join(__dirname, '../data/novels', novelId, 'character_attributes_cache.json');
    const eventsPath = path.join(__dirname, '../data/novels', novelId, 'events.json');
    const relationshipsPath = path.join(__dirname, '../data/novels', novelId, 'relationships.json');
    
    if (!fs.existsSync(characterCachePath)) {
      return res.status(400).json({ 
        error: '角色缓存不存在',
        message: '请先提取小说数据'
      });
    }
    
    log.info('GENERATE_CHARACTER_RANKING', { novelId });
    
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
      
      // 根据境界加分（通用：检测境界关键词）
      if (char.realm && typeof char.realm === 'string') {
        const realm = char.realm;
        // 检测高阶关键词
        if (realm.includes('仙') || realm.includes('神') || realm.includes('圣') || realm.includes('帝') || realm.includes('尊')) score += 100;
        else if (realm.includes('王') || realm.includes('皇') || realm.includes('宗') || realm.includes('祖')) score += 80;
        else if (realm.includes('灵') || realm.includes('天') || realm.includes('地') || realm.includes('玄')) score += 60;
        else if (realm.includes('元') || realm.includes('真') || realm.includes('道')) score += 40;
        else if (realm.includes('凡') || realm.includes('初') || realm.includes('入') || realm.includes('基')) score += 20;
        else score += 30; // 有境界但未匹配到关键词，给基础分
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
      
      // 特殊角色加分（由外部配置决定，不再硬编码特定角色）
      // 可通过 novel config 中的 protagonistNames 字段配置
      
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
    const rankingPath = path.join(__dirname, '../data/novels', novelId, 'character_importance_ranking.json');
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
    log.error('GENERATE_CHARACTER_RANKING', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== 健康检查端点 =====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Catch-all route for SPA (only if dist directory exists)
// This must be defined AFTER all API routes
if (fs.existsSync(clientDistPath)) {
  app.get('*', (req, res) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
} else {
  // Fallback route when dist doesn't exist
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>InkSoul / 墨魂 - Frontend Not Built</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          h1 {
            margin-bottom: 20px;
          }
          p {
            margin: 10px 0;
            line-height: 1.6;
          }
          a {
            color: #ffd700;
            text-decoration: underline;
          }
          code {
            background: rgba(0, 0, 0, 0.3);
            padding: 5px 10px;
            border-radius: 5px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎨 InkSoul / 墨魂</h1>
          <p>The frontend has not been built yet.</p>
          <p>Please use the <strong>Control Panel</strong> to manage the server:</p>
          <p><a href="http://localhost:3002">Open Control Panel</a></p>
          <hr style="border-color: rgba(255,255,255,0.3); margin: 30px 0;">
          <p>To build the frontend, run:</p>
          <p><code>cd client && npm install && npm run build</code></p>
        </div>
      </body>
      </html>
    `);
  });
}

// 获取所有故事列表
app.get('/api/stories', (req, res) => {
  try {
    const store = readStore();
    const stories = store.stories || [];
    res.json(stories);
  } catch (error) {
    console.error('Failed to get stories:', error);
    res.status(500).json({ error: 'Failed to get stories' });
  }
});

// 运行故事测试

app.listen(PORT, () => {
  console.log(`InkSoul / 墨魂服务器运行在 http://localhost:${PORT}`);
  
  // 启动定时诊断任务（异步，不阻塞服务器启动）
  setImmediate(() => {
    startScheduledDiagnosis();
  });
});
