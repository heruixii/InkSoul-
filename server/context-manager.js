/**
 * Context Manager - 上下文管理模块
 * 
 * 用途：处理长上下文，使用滑动窗口+摘要策略
 * 
 * 核心原则：
 * - 绝不损害故事质量
 * - 保持上下文完整性
 * - 保留重要记忆和锚点
 * - 对旧对话生成摘要（非截断）
 * 
 * 策略：
 * 1. 滑动窗口：保留最近 N 条对话
 * 2. 摘要生成：对窗口外的对话生成摘要
 * 3. 重要记忆：永久保留高重要性记忆
 * 4. 锚点约束：始终包含当前章节的锚点
 */

const crypto = require('crypto');

class ContextManager {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10; // 滑动窗口大小
    this.summaryThreshold = options.summaryThreshold || 20; // 超过此条数触发摘要
    this.importantMemoryKeywords = options.importantMemoryKeywords || [
      '死亡', '结盟', '突破', '背叛', '约定', '秘密', '传承', '神器'
    ];
    
    this.summaries = new Map(); // 存储摘要：key = conversationId, value = summary
    this.summaryCache = new Map(); // 摘要缓存
  }

  /**
   * 生成对话 ID（用于摘要管理）
   */
  _generateConversationId(messages) {
    const content = messages.map(m => m.content).join('');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 检查消息是否包含重要关键词
   */
  _isImportantMessage(message) {
    const content = message.content || '';
    return this.importantMemoryKeywords.some(keyword => content.includes(keyword));
  }

  /**
   * 提取重要消息（永久保留）
   */
  _extractImportantMessages(messages) {
    const important = [];
    for (const msg of messages) {
      if (this._isImportantMessage(msg)) {
        important.push(msg);
      }
    }
    return important;
  }

  /**
   * 构建滑动窗口上下文
   * @param {Array} messages - 完整消息历史
   * @param {Object} options - 选项
   * @returns {Object} { messages, summary, contextInfo }
   */
  buildContext(messages, options = {}) {
    const {
      keepImportant = true, // 是否保留重要消息
      generateSummary = true, // 是否生成摘要
      maxTokens = 4000 // 最大 token 预算
    } = options;

    if (messages.length <= this.windowSize) {
      // 不需要滑动窗口
      return {
        messages,
        summary: null,
        contextInfo: {
          strategy: 'full',
          originalCount: messages.length,
          windowCount: messages.length,
          summaryCount: 0,
          importantCount: 0
        }
      };
    }

    // 提取重要消息
    const importantMessages = keepImportant ? this._extractImportantMessages(messages) : [];
    
    // 分离重要消息和普通消息
    const nonImportantMessages = messages.filter(msg => !importantMessages.includes(msg));
    
    // 滑动窗口：保留最近的消息
    const windowMessages = nonImportantMessages.slice(-this.windowSize);
    
    // 窗口外的消息需要摘要
    const toSummarize = nonImportantMessages.slice(0, -this.windowSize);
    
    let summary = null;
    let summaryCount = 0;
    
    if (toSummarize.length > 0 && generateSummary) {
      const conversationId = this._generateConversationId(toSummarize);
      summary = this._getSummary(conversationId, toSummarize);
      summaryCount = toSummarize.length;
    }
    
    // 构建最终上下文
    const finalMessages = [];
    
    // 1. 先添加摘要（如果有）
    if (summary) {
      finalMessages.push({
        role: 'system',
        content: `【历史对话摘要】\n${summary}`
      });
    }
    
    // 2. 添加重要消息
    finalMessages.push(...importantMessages);
    
    // 3. 添加滑动窗口内的消息
    finalMessages.push(...windowMessages);
    
    return {
      messages: finalMessages,
      summary,
      contextInfo: {
        strategy: 'sliding_window',
        originalCount: messages.length,
        windowCount: windowMessages.length,
        summaryCount,
        importantCount: importantMessages.length
      }
    };
  }

  /**
   * 获取对话摘要（从缓存或生成）
   */
  _getSummary(conversationId, messages) {
    // 检查缓存
    const cached = this.summaryCache.get(conversationId);
    if (cached) {
      return cached;
    }
    
    // 生成摘要
    const summary = this._generateSummary(messages);
    
    // 存入缓存
    this.summaryCache.set(conversationId, summary);
    
    return summary;
  }

  /**
   * 生成对话摘要
   * 注意：这是简化版本，实际应该调用 AI 生成摘要
   * 为了保持性能，这里使用基于规则的摘要
   */
  _generateSummary(messages) {
    const summaryParts = [];
    
    // 提取关键事件
    const events = [];
    for (const msg of messages) {
      if (msg.role === 'user' || (msg.role === 'assistant' && this._isImportantMessage(msg))) {
        const content = msg.content || '';
        // 提取关键信息（简化）
        const keyInfo = content.substring(0, 100);
        events.push(keyInfo);
      }
    }
    
    if (events.length > 0) {
      summaryParts.push(`之前发生了 ${events.length} 个关键事件：`);
      summaryParts.push(...events.slice(0, 5).map((e, i) => `${i + 1}. ${e}`));
    }
    
    return summaryParts.join('\n');
  }

  /**
   * 估算 token 数量（简化）
   */
  _estimateTokens(text) {
    // 中文字符：约 1.5 token/char
    // 英文单词：约 0.75 token/word
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - chineseChars - englishWords;
    
    return chineseChars * 1.5 + englishWords * 0.75 + otherChars * 0.5;
  }

  /**
   * 检查上下文是否需要处理
   */
  needsProcessing(messages, maxTokens = 4000) {
    if (messages.length <= this.windowSize) {
      return false;
    }
    
    // 估算总 token
    const totalTokens = messages.reduce((sum, msg) => {
      return sum + this._estimateTokens(msg.content || '');
    }, 0);
    
    return totalTokens > maxTokens;
  }

  /**
   * 清除摘要缓存
   */
  clearSummaryCache() {
    this.summaryCache.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      windowSize: this.windowSize,
      summaryThreshold: this.summaryThreshold,
      cachedSummaries: this.summaryCache.size,
      importantKeywords: this.importantMemoryKeywords
    };
  }
}

module.exports = ContextManager;
