/**
 * Long Term Memory Module
 * 长期记忆模块 - 支撑超长互动故事的分层记忆系统
 * 
 * 功能：
 * - 短期记忆：保留最近 N 轮对话
 * - 长期记忆：向量存储历史事件摘要、角色关系变化、玩家关键选择
 * - 自动生成摘要并向量化
 * - 相关记忆检索
 * - 记忆管理 API
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { backgroundQueue } = require('./background-task-queue');

const DATA_DIR = path.join(__dirname, '../data');
const MEMORY_FILE = path.join(DATA_DIR, 'long_term_memory.json');
const MEMORY_INDEX_FILE = path.join(DATA_DIR, 'memory_index.json');
const MEMORY_CONFIG_FILE = path.join(DATA_DIR, 'memory_config.json');

// 默认配置
const DEFAULT_CONFIG = {
  IMPORTANCE_THRESHOLD: 0.7,      // 事件重要性阈值（0-1）
  MAX_SHORT_TERM: 20,             // 短期记忆最大条数
  MEMORY_COMPRESS_INTERVAL: 100,  // 自动压缩间隔（轮数）
  MAX_LONG_TERM: 500,             // 长期记忆最大条数
  TOP_K_RETRIEVAL: 5              // 检索最相关的5条记忆
};

// 配置（可动态调整）
let config = { ...DEFAULT_CONFIG };

/**
 * 加载记忆配置
 */
function loadMemoryConfig() {
  try {
    if (fs.existsSync(MEMORY_CONFIG_FILE)) {
      const loadedConfig = JSON.parse(fs.readFileSync(MEMORY_CONFIG_FILE, 'utf8'));
      config = { ...DEFAULT_CONFIG, ...loadedConfig };
    }
  } catch (e) {
    console.warn('加载记忆配置失败，使用默认配置:', e.message);
    config = { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存记忆配置
 */
function saveMemoryConfig() {
  try {
    fs.writeFileSync(MEMORY_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('保存记忆配置失败:', e.message);
  }
}

// 初始化配置
loadMemoryConfig();

/**
 * 长期记忆管理器
 */
class LongTermMemoryManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.memories = [];
    this.index = {};
    this.compressionCount = 0; // 压缩计数器
    this.lastCompressionTime = null;
    
    // 检索缓存（优化性能）
    this.retrievalCache = new Map();
    this.cacheMaxSize = 50;
    this.cacheTTL = 2 * 60 * 1000; // 2 分钟
    
    // 关键词倒排索引（加速检索）
    this.keywordIndex = new Map();
    
    this._loadMemories();
    this._buildKeywordIndex();
  }
  
  /**
   * 加载记忆数据
   */
  _loadMemories() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        this.memories = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      }
      if (fs.existsSync(MEMORY_INDEX_FILE)) {
        this.index = JSON.parse(fs.readFileSync(MEMORY_INDEX_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('加载记忆数据失败:', e.message);
      this.memories = [];
      this.index = {};
    }
  }
  
  /**
   * 构建关键词倒排索引
   */
  _buildKeywordIndex() {
    this.keywordIndex.clear();
    
    for (const memory of this.memories) {
      const keywords = memory.keywords || [];
      for (const keyword of keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword).push(memory.id);
      }
      
      // 也索引摘要中的重要词汇
      const summaryWords = (memory.summary || '').split(/[，。！？；、\s]+/).filter(w => w.length > 1);
      for (const word of summaryWords) {
        if (!this.keywordIndex.has(word)) {
          this.keywordIndex.set(word, []);
        }
        this.keywordIndex.get(word).push(memory.id);
      }
    }
  }
  
  /**
   * 更新关键词索引
   */
  _updateKeywordIndex(memory) {
    const keywords = memory.keywords || [];
    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      if (!this.keywordIndex.get(keyword).includes(memory.id)) {
        this.keywordIndex.get(keyword).push(memory.id);
      }
    }
  }
  
  /**
   * 保存记忆数据
   */
  _saveMemories() {
    try {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memories, null, 2));
      fs.writeFileSync(MEMORY_INDEX_FILE, JSON.stringify(this.index, null, 2));
    } catch (e) {
      console.error('保存记忆数据失败:', e.message);
    }
  }
  
  /**
   * 添加记忆
   * @param {Object} memory - 记忆对象
   * @param {string} memory.sessionId - 会话ID
   * @param {string} memory.type - 类型 (event, relationship, choice, character)
   * @param {string} memory.summary - 摘要
   * @param {Array} memory.keywords - 关键词
   * @param {number} memory.chapterIndex - 章节索引
   * @param {Object} memory.metadata - 元数据
   * @param {number} memory.importance - 重要性（0-1）
   */
  addMemory(memory) {
    // 检查重要性阈值
    const importance = memory.importance !== undefined ? memory.importance : this._evaluateImportance(memory.summary);
    if (importance < config.IMPORTANCE_THRESHOLD && memory.type !== 'choice') {
      console.log(`记忆重要性 ${importance.toFixed(2)} 低于阈值 ${config.IMPORTANCE_THRESHOLD}，跳过存储`);
      return null;
    }
    
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newMemory = {
      id: memoryId,
      sessionId: memory.sessionId,
      type: memory.type || 'event',
      summary: memory.summary || '',
      keywords: memory.keywords || [],
      chapterIndex: memory.chapterIndex || 0,
      metadata: memory.metadata || {},
      importance: importance,
      createdAt: new Date().toISOString(),
      vector: null // 向量将在异步任务中生成
    };
    
    this.memories.push(newMemory);
    
    // 更新索引
    if (!this.index[memory.sessionId]) {
      this.index[memory.sessionId] = [];
    }
    this.index[memory.sessionId].push(memoryId);
    
    // 更新关键词倒排索引
    this._updateKeywordIndex(newMemory);
    
    this._saveMemories();
    
    // 检查是否需要自动压缩
    this._checkAutoCompression();
    
    // 异步生成向量
    this._vectorizeMemoryAsync(memoryId, newMemory.summary).catch(err => {
      console.warn(`向量生成失败 (${memoryId}):`, err.message);
    });
    
    return memoryId;
  }
  
  /**
   * 评估事件重要性
   * 基于关键词：选择、死亡、结盟、背叛、突破等
   */
  _evaluateImportance(text) {
    const highImportanceKeywords = ['死亡', '身亡', '结盟', '背叛', '突破', '晋升', '决战', '传承', '杀戮'];
    const mediumImportanceKeywords = ['选择', '决定', '承诺', '誓言', '交易', '相遇', '离别', '战斗'];
    const lowImportanceKeywords = ['对话', '交谈', '观察', '移动', '休息', '行走'];
    
    let score = 0.5; // 基础分数
    
    for (const keyword of highImportanceKeywords) {
      if (text.includes(keyword)) {
        score += 0.3;
      }
    }
    
    for (const keyword of mediumImportanceKeywords) {
      if (text.includes(keyword)) {
        score += 0.15;
      }
    }
    
    for (const keyword of lowImportanceKeywords) {
      if (text.includes(keyword)) {
        score -= 0.1;
      }
    }
    
    // 限制在 0-1 范围内
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * 检查是否需要自动压缩（使用后台任务队列）
   */
  _checkAutoCompression() {
    this.compressionCount++;
    
    // 检查是否达到压缩间隔
    if (this.compressionCount >= config.MEMORY_COMPRESS_INTERVAL) {
      this.compressionCount = 0;
      console.log('达到压缩间隔，触发自动压缩（后台任务）');
      
      // 添加到后台任务队列
      backgroundQueue.add(
        async () => await this._autoCompressAll(),
        {
          name: 'memory_compression',
          priority: 2, // 中优先级
          retry: 2
        }
      );
    }
    
    // 检查是否超过最大长期记忆数量
    if (this.memories.length > config.MAX_LONG_TERM) {
      console.log(`长期记忆数量 ${this.memories.length} 超过阈值 ${config.MAX_LONG_TERM}，触发压缩（后台任务）`);
      
      // 添加到后台任务队列
      backgroundQueue.add(
        async () => await this._autoCompressAll(),
        {
          name: 'memory_compression',
          priority: 1, // 高优先级
          retry: 2
        }
      );
    }
  }
  
  /**
   * 自动压缩所有记忆
   */
  async _autoCompressAll() {
    const sessionIds = Object.keys(this.index);
    let totalCompressed = 0;
    
    for (const sessionId of sessionIds) {
      const result = await this.compressMemories(sessionId);
      totalCompressed += result.compressed;
    }
    
    this.lastCompressionTime = new Date().toISOString();
    console.log(`自动压缩完成，共压缩 ${totalCompressed} 条记忆`);
    
    return { totalCompressed, compressedAt: this.lastCompressionTime };
  }
  
  /**
   * 异步向量化记忆
   */
  async _vectorizeMemoryAsync(memoryId, text) {
    if (!this.settings.apiKey) {
      return; // 没有API密钥时跳过向量化
    }
    
    try {
      const response = await axios.post(
        this._resolveChatCompletionsUrl(this.settings.apiUrl),
        {
          model: this.settings.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: '将以下文本转换为关键词数组，用于后续相似度检索。只输出JSON格式的关键词数组。' },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${this.settings.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const content = response.data.choices[0].message.content;
      let keywords = [];
      try {
        keywords = JSON.parse(content);
      } catch (e) {
        // 解析失败，使用简单的分词
        keywords = text.split(/[，。！？；、\s]+/).filter(w => w.length > 1);
      }
      
      // 更新记忆的向量（使用关键词作为简单的向量表示）
      const memory = this.memories.find(m => m.id === memoryId);
      if (memory) {
        memory.vector = this._simpleVectorize(keywords);
        memory.keywords = keywords;
        this._saveMemories();
      }
    } catch (e) {
      console.warn(`向量化失败 (${memoryId}):`, e.message);
    }
  }
  
  /**
   * 简单向量化（使用关键词的hash作为向量）
   * TODO: 可升级为使用真实的embedding模型
   */
  _simpleVectorize(keywords) {
    // 简单实现：使用关键词的字符码之和作为向量
    return keywords.map(k => {
      let hash = 0;
      for (let i = 0; i < k.length; i++) {
        hash = ((hash << 5) - hash) + k.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    });
  }
  
  /**
   * 检索相关记忆（优化版，使用索引和缓存）
   * @param {string} sessionId - 会话ID
   * @param {string} query - 查询文本
   * @param {number} topK - 返回前K条
   * @param {Object} options - 选项
   */
  retrieveMemories(sessionId, query = '', topK = null, options = {}) {
    const { skipCache = false, ensureRecall = true } = options;
    
    const sessionMemories = this.memories.filter(m => m.sessionId === sessionId);
    
    if (sessionMemories.length === 0) {
      return [];
    }
    
    const k = topK || config.TOP_K_RETRIEVAL;
    
    // 生成缓存键
    const cacheKey = `${sessionId}_${query}_${k}`;
    
    // 检查缓存
    if (!skipCache) {
      const cached = this._getFromRetrievalCache(cacheKey);
      if (cached) {
        console.log('[LongTermMemory] 命中检索缓存');
        return cached;
      }
    }
    
    // 如果没有查询文本，返回最近的记忆（优先高重要性）
    if (!query) {
      const result = sessionMemories
        .sort((a, b) => {
          // 优先高重要性
          const importanceDiff = (b.importance || 0) - (a.importance || 0);
          if (Math.abs(importanceDiff) > 0.1) {
            return importanceDiff;
          }
          // 其次按时间
          return new Date(b.createdAt) - new Date(a.createdAt);
        })
        .slice(0, k);
      
      if (!skipCache) {
        this._setToRetrievalCache(cacheKey, result);
      }
      
      return result;
    }
    
    // 使用关键词索引加速检索
    const queryKeywords = query.split(/[，。！？；、\s]+/).filter(w => w.length > 1);
    
    // 收集候选记忆ID（通过关键词索引）
    const candidateIds = new Set();
    for (const qk of queryKeywords) {
      const ids = this.keywordIndex.get(qk) || [];
      for (const id of ids) {
        candidateIds.add(id);
      }
    }
    
    // 如果确保召回率，添加所有会话记忆作为候选
    const candidateMemories = ensureRecall 
      ? sessionMemories 
      : sessionMemories.filter(m => candidateIds.has(m.id));
    
    // 评分
    const scored = candidateMemories.map(memory => {
      let score = 0;
      
      // 关键词匹配分数
      for (const qk of queryKeywords) {
        for (const mk of (memory.keywords || [])) {
          if (mk.includes(qk) || qk.includes(mk)) {
            score += 1;
          }
        }
        // 摘要匹配
        if (memory.summary && memory.summary.includes(qk)) {
          score += 0.5;
        }
      }
      
      // 重要性加权
      score += (memory.importance || 0) * 2;
      
      // 时间加权（最近的记忆略微加分）
      const daysSinceCreated = (Date.now() - new Date(memory.createdAt)) / (1000 * 60 * 60 * 24);
      const timeWeight = Math.max(0, 1 - daysSinceCreated / 30); // 30天内线性衰减
      score += timeWeight * 0.5;
      
      return { memory, score };
    });
    
    // 排序并返回
    const result = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.memory);
    
    // 存入缓存
    if (!skipCache) {
      this._setToRetrievalCache(cacheKey, result);
    }
    
    return result;
  }
  
  /**
   * 从检索缓存获取
   */
  _getFromRetrievalCache(key) {
    const cached = this.retrievalCache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.retrievalCache.delete(key);
      return null;
    }
    
    return cached.result;
  }
  
  /**
   * 存储到检索缓存
   */
  _setToRetrievalCache(key, result) {
    // 淘汰最旧的缓存
    if (this.retrievalCache.size >= this.cacheMaxSize) {
      let oldestKey = null;
      let oldestTime = Infinity;
      
      for (const [k, v] of this.retrievalCache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.retrievalCache.delete(oldestKey);
      }
    }
    
    this.retrievalCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }
  
  /**
   * 清除检索缓存
   */
  clearRetrievalCache() {
    this.retrievalCache.clear();
  }
  
  /**
   * 获取会话的所有记忆
   */
  getSessionMemories(sessionId) {
    return this.memories.filter(m => m.sessionId === sessionId);
  }
  
  /**
   * 删除记忆
   */
  deleteMemory(memoryId) {
    this.memories = this.memories.filter(m => m.id !== memoryId);
    
    // 更新索引
    for (const sessionId in this.index) {
      this.index[sessionId] = this.index[sessionId].filter(id => id !== memoryId);
    }
    
    this._saveMemories();
  }
  
  /**
   * 清理旧记忆
   * @param {string} sessionId - 会话ID
   * @param {number} beforeChapterIndex - 清理此章节之前的记忆
   */
  cleanOldMemories(sessionId, beforeChapterIndex) {
    const toDelete = this.memories.filter(
      m => m.sessionId === sessionId && m.chapterIndex < beforeChapterIndex
    );
    
    for (const memory of toDelete) {
      this.deleteMemory(memory.id);
    }
    
    return toDelete.length;
  }
  
  /**
   * 压缩记忆（合并相似记忆）
   */
  async compressMemories(sessionId) {
    const sessionMemories = this.getSessionMemories(sessionId);
    if (sessionMemories.length < 10) {
      return { compressed: 0, message: '记忆数量不足，无需压缩' };
    }
    
    // 按章节分组
    const byChapter = {};
    for (const memory of sessionMemories) {
      const chapter = memory.chapterIndex;
      if (!byChapter[chapter]) {
        byChapter[chapter] = [];
      }
      byChapter[chapter].push(memory);
    }
    
    // 对每个章节的记忆进行压缩
    let compressedCount = 0;
    for (const chapter in byChapter) {
      const chapterMemories = byChapter[chapter];
      if (chapterMemories.length > 3) {
        // 删除旧记忆，保留最新的
        const toDelete = chapterMemories.slice(0, chapterMemories.length - 3);
        for (const memory of toDelete) {
          this.deleteMemory(memory.id);
          compressedCount++;
        }
      }
    }
    
    return { compressed: compressedCount, message: `压缩了 ${compressedCount} 条记忆` };
  }
  
  /**
   * 自动生成摘要（通过LLM）
   */
  async generateSummary(sessionId, context) {
    if (!this.settings.apiKey) {
      throw new Error('未配置API密钥');
    }
    
    const prompt = `请将以下剧情内容生成一条结构化摘要，用于长期记忆存储。

剧情内容：
${context}

请以JSON格式返回，包含以下字段：
- summary: 50-100字的摘要
- keywords: 3-5个关键词数组
- type: 类型（event/relationship/choice/character）
- importance: 重要性（1-10）`;

    try {
      const response = await axios.post(
        this._resolveChatCompletionsUrl(this.settings.apiUrl),
        {
          model: this.settings.summaryModel || 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是剧情摘要助手，只输出JSON。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 300
        },
        {
          headers: {
            'Authorization': `Bearer ${this.settings.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const content = response.data.choices[0].message.content;
      let summaryData;
      
      try {
        summaryData = JSON.parse(content);
      } catch (e) {
        // 解析失败，使用默认值
        summaryData = {
          summary: context.substring(0, 100),
          keywords: context.split(/[，。！？；、\s]+/).slice(0, 5),
          type: 'event',
          importance: 5
        };
      }
      
      return summaryData;
    } catch (e) {
      console.error('生成摘要失败:', e.message);
      throw e;
    }
  }
  
  /**
   * 解析 Chat Completions URL
   */
  _resolveChatCompletionsUrl(apiUrl) {
    if (!apiUrl) return '';
    const url = apiUrl.trim();
    if (url.includes('/v1/chat/completions')) return url;
    if (url.endsWith('/v1')) return url + '/chat/completions';
    if (url.endsWith('/')) return url + 'v1/chat/completions';
    return url + '/v1/chat/completions';
  }
}

// 单例实例
let instance = null;

/**
 * 获取长期记忆管理器单例
 */
function getLongTermMemoryManager(settings) {
  if (!instance) {
    instance = new LongTermMemoryManager(settings);
  }
  return instance;
}

module.exports = {
  LongTermMemoryManager,
  getLongTermMemoryManager,
  config,
  loadMemoryConfig,
  saveMemoryConfig,
  updateMemoryConfig,
  getMemoryStats
};

/**
 * 更新记忆配置
 */
function updateMemoryConfig(newConfig) {
  config = { ...config, ...newConfig };
  saveMemoryConfig();
  return config;
}

/**
 * 获取记忆统计信息
 */
function getMemoryStats() {
  const instance = getLongTermMemoryManager();
  return {
    totalMemories: instance.memories.length,
    totalSessions: Object.keys(instance.index).length,
    config: { ...config },
    compressionCount: instance.compressionCount,
    lastCompressionTime: instance.lastCompressionTime
  };
}
