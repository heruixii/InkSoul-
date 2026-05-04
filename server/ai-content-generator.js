/**
 * AI Content Generator
 * AI内容生成模块 - 基于新故事框架生成对话和剧情内容
 * 
 * 功能：
 * - 接收新故事框架提供的上下文
 * - 动态拼接系统提示（角色+锚点约束+章节背景+历史对话）
 * - 调用 DeepSeek API 生成内容
 * - 支持重试和错误处理
 * 
 * 优化：
 * - 流式输出支持
 * - AI 请求缓存（prompt 哈希）
 * - 上下文保留逻辑
 */

const axios = require('axios');
const crypto = require('crypto');

/**
 * AI内容生成器
 */
class AIContentGenerator {
  constructor(settings) {
    this.settings = settings || {};
    this.apiUrl = this._resolveChatCompletionsUrl(this.settings.apiUrl);
    
    // AI 请求缓存（prompt 哈希）
    this.requestCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheTTL = 5 * 60 * 1000; // 5 分钟
    
    // 流式输出配置
    this.enableStreaming = settings.enableStreaming !== false; // 默认启用
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
  
  /**
   * 生成 prompt 哈希（用于缓存）
   */
  _generatePromptHash(messages, options) {
    const promptStr = JSON.stringify({ messages, options });
    return crypto.createHash('md5').update(promptStr).digest('hex');
  }
  
  /**
   * 从缓存获取结果
   */
  _getFromCache(hash) {
    const cached = this.requestCache.get(hash);
    if (!cached) return null;
    
    // 检查是否过期
    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.requestCache.delete(hash);
      return null;
    }
    
    return cached.result;
  }
  
  /**
   * 存储结果到缓存
   */
  _setToCache(hash, result) {
    // 淘汰最旧的缓存
    if (this.requestCache.size >= this.cacheMaxSize) {
      let oldestHash = null;
      let oldestTime = Infinity;
      
      for (const [key, value] of this.requestCache.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestHash = key;
        }
      }
      
      if (oldestHash) {
        this.requestCache.delete(oldestHash);
      }
    }
    
    this.requestCache.set(hash, {
      result,
      timestamp: Date.now()
    });
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this.requestCache.clear();
  }
  
  /**
   * 生成对话内容
   * @param {Object} params - 生成参数
   * @param {Object} params.framework - 故事框架
   * @param {Object} params.currentChapter - 当前章节
   * @param {Object} params.characterStates - 角色状态
   * @param {Array} params.anchors - 当前锚点约束
   * @param {Array} params.history - 对话历史
   * @param {string} params.playerInfluence - 玩家影响程度
   * @param {boolean} params.stream - 是否使用流式输出
   * @returns {Promise<string|AsyncGenerator>} 生成的内容或流式生成器
   */
  async generateDialogue(params) {
    const {
      framework,
      currentChapter,
      characterStates,
      anchors,
      history = [],
      playerInfluence = 'low',
      stream = false
    } = params;
    
    const systemPrompt = this._buildSystemPrompt({
      framework,
      currentChapter,
      characterStates,
      anchors,
      playerInfluence
    });
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];
    
    if (stream && this.enableStreaming) {
      return this._callAPIStream(messages, {
        temperature: 0.7,
        maxTokens: 1000
      });
    }
    
    return this._callAPI(messages, {
      temperature: 0.7,
      maxTokens: 1000
    });
  }
  
  /**
   * 生成剧情事件
   * @param {Object} params - 生成参数
   * @param {Object} params.framework - 故事框架
   * @param {Object} params.currentChapter - 当前章节
   * @param {Object} params.previousChoice - 上一个选择
   * @param {Array} params.history - 历史记录
   * @param {string} params.playerInfluence - 玩家影响程度
   * @param {boolean} params.stream - 是否使用流式输出
   * @returns {Promise<Object>} 生成的事件 {title, description, choices}
   */
  async generateEvent(params) {
    const {
      framework,
      currentChapter,
      previousChoice,
      history = [],
      playerInfluence = 'low',
      stream = false
    } = params;
    
    const systemPrompt = this._buildEventSystemPrompt({
      framework,
      currentChapter,
      previousChoice,
      history,
      playerInfluence
    });
    
    const userPrompt = previousChoice
      ? `玩家选择「${previousChoice}」，生成承接事件。`
      : `生成下一事件。`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    let content;
    
    if (stream && this.enableStreaming) {
      // 流式模式下，收集所有 chunk 后再解析
      const stream = await this._callAPIStream(messages, {
        temperature: 0.7,
        maxTokens: 900
      });
      
      let fullContent = '';
      for await (const chunk of stream) {
        // 处理 SSE 格式的流式响应
        if (chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
          fullContent += chunk.choices[0].delta.content || '';
        } else if (typeof chunk === 'string') {
          fullContent += chunk;
        }
      }
      content = fullContent;
    } else {
      content = await this._callAPI(messages, {
        temperature: 0.7,
        maxTokens: 900
      });
    }
    
    // 解析 JSON 响应
    return this._parseEventResponse(content);
  }
  
  /**
   * 构建对话系统提示
   */
  _buildSystemPrompt(params) {
    const { framework, currentChapter, characterStates, anchors, playerInfluence } = params;
    
    const protagonist = framework.protagonist;
    const anchorBlock = this._buildAnchorBlock(anchors);
    const characterBlock = this._buildCharacterBlock(characterStates);
    const chapterBlock = this._buildChapterBlock(currentChapter);
    
    return `${framework.name || '同人'} RPG 对话生成系统

【主角设定】
姓名：${protagonist.name}
类型：${protagonist.type}（原创角色）
描述：${protagonist.description}
初始位置：${protagonist.startingLocation}
初始境界：${protagonist.startingRealm}
背景：${protagonist.background}
能力：${protagonist.abilities}
互动方式：${protagonist.interactionMode}

【当前章节】
${chapterBlock}

【角色状态】
${characterBlock}

【原著锚点约束】
${anchorBlock}

【玩家影响程度】
${playerInfluence === 'low' ? '低：仅旁观、收集情报、与NPC交易、轻度介入（不改变结果）' : 
  playerInfluence === 'medium' ? '中：可主动参与事件，尝试影响过程但尊重锚点约束' : 
  '高：可深度介入，但必须遵守不可改变的原著事实'}

【生成规则】
1. ${protagonist.name}是原创主角，不是原著中的已有角色
2. 互动限于：旁观、收集情报、与NPC交易、轻度介入（不改变结果）
3. 必须遵守原著锚点，不能改变关键事实
4. 对话应符合原著世界观和角色性格
5. 保持对话自然流畅，符合角色身份和情境`
  }
  
  /**
   * 构建事件系统提示
   */
  _buildEventSystemPrompt(params) {
    const { framework, currentChapter, previousChoice, history, playerInfluence } = params;
    
    const protagonist = framework.protagonist;
    const chapterBlock = this._buildChapterBlock(currentChapter);
    const historyBlock = this._buildHistoryBlock(history);
    
    // 获取当前章节的锚点
    const anchors = framework.canonAnchors.filter(
      a => a.chapter >= currentChapter.chapterIndex && a.chapter <= currentChapter.chapterIndex + 5
    );
    const anchorBlock = this._buildAnchorBlock(anchors);
    
    // 获取下一锚点作为推进目标
    const nextAnchor = this._findNextAnchor(anchors, history);
    const nextAnchorBlock = nextAnchor 
      ? `\n【下一原著锚点】${nextAnchor.chapter ? `[${nextAnchor.chapter}] ` : ''}${nextAnchor.event}`
      : '';
    
    return `${framework.name || '同人'} RPG 剧情生成系统

【主角设定】
姓名：${protagonist.name}
类型：${protagonist.type}（原创角色）
描述：${protagonist.description}
互动方式：${protagonist.interactionMode}

【当前章节】
${chapterBlock}

【剧情历史】
${historyBlock}

${nextAnchorBlock}

【原著锚点约束】
${anchorBlock}

【玩家影响程度】
${playerInfluence === 'low' ? '低：仅旁观、收集情报、与NPC交易、轻度介入（不改变结果）' : 
  playerInfluence === 'medium' ? '中：可主动参与事件，尝试影响过程但尊重锚点约束' : 
  '高：可深度介入，但必须遵守不可改变的原著事实'}

【生成铁律】
1. **忠实原著**：原著主要角色的剧情走向必须与原著一致
2. **优先推进【下一原著锚点】**：如果给出了下一锚点，新事件应朝那个方向推进
3. **玩家是参与者不是改写者**：玩家的选择决定他自己的去向，但不改变原著主线大事件
4. **承接【刚刚发生】**：新事件必须延续上一事件的时空、人物、情绪
5. **标题具体**：禁止"新的冒险""继续前进"这类空洞标题；要有具体地名、人名、事件名
6. **选择差异化**：2-6个选择应有明显不同的后果方向
7. **主角限制**：主角是原创角色，无特殊天赋，只能旁观、收集情报、轻度介入

【输出 JSON】
{"title":"10-20字具体标题","description":"60-110字承接前文+引出新冲突","choices":[{"title":"具体行动","description":"20-30字暗示后果"}]}
（2-6个选择，仅JSON无其他）`
  }
  
  /**
   * 构建章节信息块
   */
  _buildChapterBlock(chapter) {
    if (!chapter) return '无章节信息';
    
    return `章节：${chapter.title}
概要：${chapter.summary}
出场角色：${chapter.characters.join('、')}
关键事件数：${chapter.keyEvents.length}`;
  }
  
  /**
   * 构建角色状态块
   */
  _buildCharacterBlock(characterStates) {
    if (!characterStates || Object.keys(characterStates).length === 0) {
      return '无角色状态信息';
    }
    
    return Object.entries(characterStates)
      .map(([name, state]) => {
        const status = state.alive ? '存活' : '已死亡';
        return `${name}：${state.realm} | ${state.location} | ${status}`;
      })
      .join('\n');
  }
  
  /**
   * 构建锚点约束块
   */
  _buildAnchorBlock(anchors) {
    if (!anchors || anchors.length === 0) {
      return '无当前锚点约束';
    }
    
    return anchors
      .slice(0, 5)
      .map(a => `- 第${a.chapter}章：${a.event}`)
      .join('\n');
  }
  
  /**
   * 构建历史记录块
   */
  _buildHistoryBlock(history) {
    if (!history || history.length === 0) {
      return '无历史记录';
    }
    
    const recent = history.slice(-5);
    return recent
      .map(h => {
        const tag = h.type === 'choice' ? '[选]' : (h.type === 'ai_generate' ? '[AI]' : '[剧]');
        const title = String(h.event_title || '').slice(0, 40);
        const desc = String(h.event_description || '').slice(0, 80);
        const choice = h.choice ? ` →${String(h.choice).slice(0, 25)}` : '';
        return `${tag}${title}${desc ? `：${desc}` : ''}${choice}`;
      })
      .join('\n');
  }
  
  /**
   * 查找下一个锚点
   */
  _findNextAnchor(anchors, history) {
    if (!anchors || anchors.length === 0) return null;
    
    const historyText = history
      .map(h => `${h.event_title || ''} ${h.event_description || ''}`)
      .join(' ');
    
    return anchors.find(a => {
      const keywords = [a.event, ...(a.characters || [])].filter(Boolean);
      return keywords.length > 0 && !keywords.some(k => historyText.includes(k));
    }) || anchors[0];
  }
  
  /**
   * 调用 API（非流式，带缓存）
   */
  async _callAPI(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 1000, skipCache = false } = options;
    
    if (!this.settings.apiKey) {
      throw new Error('未配置 API 密钥');
    }
    
    if (!this.apiUrl) {
      throw new Error('未配置 API 地址');
    }
    
    // 检查缓存
    const hash = this._generatePromptHash(messages, { temperature, maxTokens });
    if (!skipCache) {
      const cached = this._getFromCache(hash);
      if (cached) {
        console.log('[AI-Generator] 命中缓存');
        return cached;
      }
    }
    
    const body = {
      model: this.settings.model || 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens
    };
    
    const response = await axios.post(this.apiUrl, body, {
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
    
    const result = response.data.choices[0].message.content;
    
    // 存入缓存
    if (!skipCache) {
      this._setToCache(hash, result);
    }
    
    return result;
  }
  
  /**
   * 调用 API（流式输出）
   */
  async _callAPIStream(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 1000, skipCache = false } = options;
    
    if (!this.settings.apiKey) {
      throw new Error('未配置 API 密钥');
    }
    
    if (!this.apiUrl) {
      throw new Error('未配置 API 地址');
    }
    
    // 检查缓存（流式模式下也检查，如果命中则快速返回）
    const hash = this._generatePromptHash(messages, { temperature, maxTokens });
    if (!skipCache) {
      const cached = this._getFromCache(hash);
      if (cached) {
        console.log('[AI-Generator] 命中缓存（流式模式）');
        // 模拟流式输出
        return this._simulateStream(cached);
      }
    }
    
    const body = {
      model: this.settings.model || 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    };
    
    const response = await axios.post(this.apiUrl, body, {
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000,
      responseType: 'stream'
    });
    
    return response.data;
  }
  
  /**
   * 模拟流式输出（用于缓存命中）
   */
  async* _simulateStream(content) {
    const chunks = content.split(/(?=[。！？，、；：])/);
    for (const chunk of chunks) {
      yield chunk;
      await new Promise(resolve => setTimeout(resolve, 10)); // 模拟延迟
    }
  }
  
  /**
   * 解析事件响应
   */
  _parseEventResponse(content) {
    try {
      return JSON.parse(content);
    } catch (e) {
      // 尝试提取 JSON 部分
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {
          // 降级：返回默认事件
        }
      }
      
      // 返回默认事件
      return {
        title: '新的冒险',
        description: String(content).substring(0, 200),
        choices: [
          { title: '继续前进', description: '探索未知的前方' },
          { title: '仔细观察', description: '分析当前情况' }
        ]
      };
    }
  }
}

module.exports = {
  AIContentGenerator
};
