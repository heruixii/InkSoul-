/**
 * Story State Manager
 * 故事状态管理模块 - 管理故事会话状态、章节进度、分支选择等
 * 
 * 功能：
 * - 加载和管理故事框架
 * - 跟踪当前章节索引
 * - 记录玩家选择的分支
 * - 管理已解锁的锚点
 * - 提供角色状态查询
 * 支持多小说数据隔离
 */

const fs = require('fs');
const path = require('path');
const stateExtractor = require('./state-extractor');
const dataLoader = require('./data-loader');
const storyServices = require('./story-services');
const longTermMemory = require('./long-term-memory');

const DATA_DIR = path.join(__dirname, '../data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const ACTIVE_FILE = path.join(NOVELS_DIR, '_active.json');

// Legacy paths for backward compatibility
const LEGACY_STORY_FRAMEWORK_FILE = path.join(DATA_DIR, 'generated_story_framework.json');
const LEGACY_STORY_STATE_FILE = path.join(DATA_DIR, 'story_state.json');

const SHORT_TERM_MEMORY_SIZE = 20;

/**
 * Get active novel ID
 */
function getActiveNovelId() {
  try {
    if (fs.existsSync(ACTIVE_FILE)) {
      const active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
      return active.activeNovelId || null;
    }
  } catch (e) {
    console.warn('Failed to read active novel file:', e.message);
  }
  return null;
}

/**
 * Get novel data directory for a specific novel
 */
function getNovelDataDir(novelId) {
  return path.join(NOVELS_DIR, novelId);
}

/**
 * Get data file paths for the active novel
 */
function getDataPaths(novelId) {
  const novelDataDir = getNovelDataDir(novelId);
  
  return {
    storyFrameworkFile: path.join(novelDataDir, 'story_framework.json'),
    storyStateFile: path.join(novelDataDir, 'story_state.json')
  };
}

/**
 * 故事状态管理器
 */
class StoryStateManager {
  constructor(settings = null) {
    this.framework = null;
    this.services = null;
    this.state = null;
    this.settings = settings;
    this.memoryManager = null;
  }
  
  /**
   * 初始化：加载框架和服务
   */
  initialize() {
    // Get active novel and determine file paths
    const activeNovelId = getActiveNovelId();
    if (!activeNovelId) {
      console.warn('未设置激活的小说，尝试使用旧版数据结构...');
    }
    
    this.activeNovelId = activeNovelId;
    this.paths = activeNovelId ? getDataPaths(activeNovelId) : {
      storyFrameworkFile: LEGACY_STORY_FRAMEWORK_FILE,
      storyStateFile: LEGACY_STORY_STATE_FILE
    };
    
    // 加载故事框架
    if (fs.existsSync(this.paths.storyFrameworkFile)) {
      this.framework = JSON.parse(fs.readFileSync(this.paths.storyFrameworkFile, 'utf8'));
      console.log('✓ 故事框架已加载');
    } else {
      console.warn('⚠ 故事框架文件不存在，请先运行 example-generate.js 或提取小说');
    }
    
    // 初始化服务
    const data = dataLoader.loadAllDataSync();
    this.services = {
      timeline: new storyServices.TimelineService(data),
      canonAnchors: new storyServices.CanonAnchorService(data),
      characterState: new storyServices.CharacterStateService(data),
      data: data
    };
    console.log('✓ 故事服务已初始化');
    
    // 初始化长期记忆管理器
    this.memoryManager = longTermMemory.getLongTermMemoryManager(this.settings);
    console.log('✓ 长期记忆管理器已初始化');
  }
  
  /**
   * 创建新会话状态
   */
  createSession() {
    if (!this.framework) {
      throw new Error('故事框架未加载，请先运行 example-generate.js');
    }
    
    const session = {
      sessionId: this._generateSessionId(),
      frameworkVersion: this.framework.version,
      currentChapterIndex: this.framework.settings.startChapter,
      protagonist: this.framework.protagonist,
      focusCharacters: this.framework.settings.focusCharacters,
      playerInfluence: this.framework.settings.playerInfluence,
      branchesEnabled: this.framework.settings.branchesEnabled,
      chosenBranches: [],
      unlockedAnchors: [],
      characterStates: {},
      shortTermMemory: [], // 短期记忆：保留最近 N 轮对话
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 初始化主角状态
    session.characterStates[this.framework.protagonist.name] = {
      name: this.framework.protagonist.name,
      realm: this.framework.protagonist.startingRealm,
      location: this.framework.protagonist.startingLocation,
      alive: true,
      interactions: []
    };
    
    // 初始化重点关注角色状态
    for (const charName of this.framework.settings.focusCharacters) {
      const charState = this.services.characterState.getCharacterState(
        charName,
        this.framework.settings.startChapter
      );
      session.characterStates[charName] = charState;
    }
    
    this.state = session;
    this._saveState();
    
    console.log(`✓ 新会话已创建: ${session.sessionId}`);
    return session;
  }
  
  /**
   * 加载现有会话
   */
  loadSession(sessionId) {
    if (!fs.existsSync(this.paths.storyStateFile)) {
      throw new Error('会话状态文件不存在');
    }
    
    const allSessions = JSON.parse(fs.readFileSync(this.paths.storyStateFile, 'utf8'));
    const session = allSessions[sessionId];
    
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }
    
    // 检查框架版本是否匹配
    if (session.frameworkVersion !== this.framework.version) {
      console.warn(`⚠ 框架版本不匹配: 会话 ${session.frameworkVersion}, 当前 ${this.framework.version}`);
      console.warn('建议重新创建会话以使用新框架');
    }
    
    this.state = session;
    console.log(`✓ 会话已加载: ${sessionId}`);
    return session;
  }
  
  /**
   * 获取当前章节
   */
  getCurrentChapter() {
    if (!this.state || !this.framework) {
      return null;
    }
    
    return this.framework.chapters.find(
      ch => ch.chapterIndex === this.state.currentChapterIndex
    );
  }
  
  /**
   * 推进到下一章
   */
  advanceToNextChapter() {
    if (!this.state || !this.framework) {
      throw new Error('会话或框架未初始化');
    }
    
    const nextIndex = this.state.currentChapterIndex + 1;
    const nextChapter = this.framework.chapters.find(ch => ch.chapterIndex === nextIndex);
    
    if (!nextChapter) {
      throw new Error('已经是最后一章');
    }
    
    this.state.currentChapterIndex = nextIndex;
    this.state.updatedAt = new Date().toISOString();
    
    // 更新角色状态
    this._updateCharacterStates(nextIndex);
    
    this._saveState();
    console.log(`✓ 推进到第 ${nextIndex} 章`);
    return nextChapter;
  }
  
  /**
   * 跳转到指定章节
   */
  jumpToChapter(chapterIndex) {
    if (!this.state || !this.framework) {
      throw new Error('会话或框架未初始化');
    }
    
    const chapter = this.framework.chapters.find(ch => ch.chapterIndex === chapterIndex);
    if (!chapter) {
      throw new Error(`章节 ${chapterIndex} 不存在`);
    }
    
    this.state.currentChapterIndex = chapterIndex;
    this.state.updatedAt = new Date().toISOString();
    
    // 更新角色状态
    this._updateCharacterStates(chapterIndex);
    
    this._saveState();
    console.log(`✓ 跳转到第 ${chapterIndex} 章`);
    return chapter;
  }
  
  /**
   * 记录分支选择
   */
  recordBranchChoice(chapterIndex, branchId) {
    if (!this.state) {
      throw new Error('会话未初始化');
    }
    
    const chapter = this.framework.chapters.find(ch => ch.chapterIndex === chapterIndex);
    if (!chapter) {
      throw new Error(`章节 ${chapterIndex} 不存在`);
    }
    
    const branch = chapter.branches.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`分支 ${branchId} 不存在`);
    }
    
    // 验证分支是否违反锚点
    const validation = this._validateBranch(branch, chapterIndex);
    if (!validation.valid) {
      throw new Error(`分支违反锚点: ${validation.violations.map(v => v.reason).join(', ')}`);
    }
    
    this.state.chosenBranches.push({
      chapterIndex,
      branchId,
      branchTitle: branch.title,
      timestamp: new Date().toISOString()
    });
    
    // 添加短期记忆
    this._addShortTermMemory({
      type: 'choice',
      chapterIndex,
      branchTitle: branch.title,
      description: branch.description,
      timestamp: new Date().toISOString()
    });
    
    // 异步添加长期记忆
    this._addLongTermMemoryAsync({
      type: 'choice',
      summary: `玩家选择了"${branch.title}"：${branch.description}`,
      chapterIndex,
      metadata: { branchId, branchTitle: branch.title }
    }).catch(err => {
      console.error('[Story State Manager] Failed to add long-term memory:', err);
    });

    // 提取并应用状态变化（如果有生成的内容）
    if (branch.generatedContent) {
      this._extractAndApplyStateChanges(branch.generatedContent);
    }

    this._saveState();
    console.log(`✓ 记录分支选择: ${branch.title}`);
  }

  /**
   * 提取并应用状态变化
   */
  async _extractAndApplyStateChanges(generatedContent) {
    try {
      const currentState = {
        characterStates: this.state.characterStates,
        currentItems: this.state.currentItems,
        currentRelationships: this.state.currentRelationships
      };

      const stateChanges = await stateExtractor.extractStateChanges(
        generatedContent,
        this.framework.metadata?.novel_id,
        currentState
      );

      if (stateChanges) {
        this.state = stateExtractor.applyStateChanges(this.state, stateChanges);
        this.state.updatedAt = new Date().toISOString();
        console.log('[Story State Manager] Applied state changes');
        
        // 将物品和关系变化添加到短期记忆
        if (stateChanges.itemChanges && stateChanges.itemChanges.length > 0) {
          this._addShortTermMemory({
            type: 'item_change',
            summary: stateChanges.itemChanges.map(c => `${c.character}${c.action}${c.item}`).join('、'),
            timestamp: new Date().toISOString()
          });
        }
        
        if (stateChanges.relationshipChanges && stateChanges.relationshipChanges.length > 0) {
          this._addShortTermMemory({
            type: 'relationship_change',
            summary: stateChanges.relationshipChanges.map(c => `${c.character1}与${c.character2}关系变为${c.newRelation}`).join('、'),
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('[Story State Manager] Failed to extract state changes:', error);
    }
  }

  /**
   * 获取当前锚点约束
   */
  getCurrentAnchors() {
    if (!this.state || !this.framework) {
      return [];
    }
    
    const currentChapter = this.getCurrentChapter();
    if (!currentChapter) {
      return [];
    }
    
    return this.framework.canonAnchors.filter(
      anchor => anchor.chapter >= this.state.currentChapterIndex
    );
  }
  
  /**
   * 生成动态描述
   * 基于角色当前状态生成描述
   */
  generateDynamicDescription(characterName, charState) {
    if (!charState) {
      return '';
    }

    const parts = [];

    // 境界
    if (charState.realm && charState.realm !== '未知') {
      parts.push(`境界：${charState.realm}`);
    }

    // 位置
    if (charState.location && charState.location !== '未知') {
      parts.push(`当前位置：${charState.location}`);
    }

    // 生死状态
    if (charState.alive === false) {
      parts.push('状态：已死亡');
    }

    // 持有物品
    try {
      const items = this.state?.currentItems?.[characterName] || [];
      if (items.length > 0) {
        parts.push(`持有物品：${items.join('、')}`);
      }
    } catch (e) {
      // 忽略物品获取错误
    }

    // 与其他角色的关系
    try {
      const relationships = this.state?.currentRelationships?.[characterName] || {};
      const relationshipEntries = Object.entries(relationships);
      if (relationshipEntries.length > 0) {
        const relationText = relationshipEntries
          .slice(0, 3)
          .map(([otherChar, relation]) => `${otherChar}：${relation}`)
          .join('，');
        parts.push(`人际关系：${relationText}`);
      }
    } catch (e) {
      // 忽略关系获取错误
    }

    // 互动历史（最近3条）
    try {
      const interactions = charState.interactions || [];
      if (interactions.length > 0) {
        const recentInteractions = interactions.slice(-3);
        const interactionText = recentInteractions
          .map(i => i.description)
          .join('；');
        parts.push(`近期经历：${interactionText}`);
      }
    } catch (e) {
      // 忽略互动历史获取错误
    }

    return parts.join('。') + (parts.length > 0 ? '。' : '');
  }

  /**
   * 获取角色状态
   */
  getCharacterState(characterName) {
    if (!this.state) {
      throw new Error('会话未初始化');
    }
    
    const charState = this.state.characterStates[characterName] || null;
    
    // 如果没有角色状态，返回 null
    if (!charState) {
      return null;
    }
    
    // 生成动态描述
    const dynamicDescription = this.generateDynamicDescription(characterName, charState);
    
    // 尝试从框架中获取静态描述
    let staticDescription = '';
    
    if (this.framework) {
      // 检查主角
      if (this.framework.protagonist && this.framework.protagonist.name === characterName) {
        staticDescription = this.framework.protagonist.description || '';
      }
      
      // 检查焦点角色
      if (!staticDescription && this.framework.settings && this.framework.settings.focusCharacters) {
        const focusChar = this.framework.settings.focusCharacters.find(c => c.name === characterName);
        if (focusChar) {
          staticDescription = focusChar.description || '';
        }
      }
    }
    
    // 合并静态描述和动态描述
    let description = staticDescription || '';
    if (dynamicDescription) {
      description = description ? `${description}\n\n【当前状态】\n${dynamicDescription}` : `【当前状态】\n${dynamicDescription}`;
    }
    
    return {
      ...charState,
      description: description || ''
    };
  }
  
  /**
   * 更新角色互动历史
   */
  recordInteraction(characterName, interactionType, description) {
    if (!this.state) {
      throw new Error('会话未初始化');
    }
    
    if (!this.state.characterStates[characterName]) {
      this.state.characterStates[characterName] = {
        name: characterName,
        realm: '未知',
        location: '未知',
        alive: true,
        interactions: []
      };
    }
    
    this.state.characterStates[characterName].interactions.push({
      type: interactionType,
      description,
      timestamp: new Date().toISOString()
    });
    
    this.state.updatedAt = new Date().toISOString();
    this._saveState();
  }
  
  /**
   * 获取会话摘要
   */
  getSessionSummary() {
    if (!this.state) {
      return null;
    }
    
    const currentChapter = this.getCurrentChapter();
    
    return {
      sessionId: this.state.sessionId,
      protagonist: this.state.protagonist,
      currentChapter: currentChapter ? currentChapter.title : '未知',
      currentChapterIndex: this.state.currentChapterIndex,
      totalChapters: this.framework.chapters.length,
      progress: `${this.state.currentChapterIndex}/${this.framework.settings.endChapter}`,
      branchesChosen: this.state.chosenBranches.length,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt
    };
  }
  
  /**
   * 保存状态到文件
   */
  _saveState() {
    if (!this.state) {
      return;
    }
    
    let allSessions = {};
    if (fs.existsSync(this.paths.storyStateFile)) {
      allSessions = JSON.parse(fs.readFileSync(this.paths.storyStateFile, 'utf8'));
    }
    
    allSessions[this.state.sessionId] = this.state;
    fs.writeFileSync(this.paths.storyStateFile, JSON.stringify(allSessions, null, 2));
  }
  
  /**
   * 更新角色状态
   */
  _updateCharacterStates(chapterIndex) {
    for (const charName of Object.keys(this.state.characterStates)) {
      const charState = this.services.characterState.getCharacterState(charName, chapterIndex);
      if (charState) {
        // 保留互动历史
        const interactions = this.state.characterStates[charName].interactions || [];
        this.state.characterStates[charName] = {
          ...charState,
          interactions
        };
      }
    }
  }
  
  /**
   * 验证分支是否违反锚点
   */
  _validateBranch(branch, chapterIndex) {
    const generator = require('./story-framework-generator').StoryFrameworkGenerator;
    const gen = new generator();
    return gen.validateBranch(branch, chapterIndex);
  }
  
  /**
   * 生成会话ID
   */
  _generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * 添加短期记忆
   */
  _addShortTermMemory(memory) {
    if (!this.state || !this.state.shortTermMemory) {
      return;
    }
    
    this.state.shortTermMemory.push(memory);
    
    // 保持短期记忆在限制范围内
    if (this.state.shortTermMemory.length > SHORT_TERM_MEMORY_SIZE) {
      this.state.shortTermMemory = this.state.shortTermMemory.slice(-SHORT_TERM_MEMORY_SIZE);
    }
  }
  
  /**
   * 异步添加长期记忆
   */
  async _addLongTermMemoryAsync(memoryData) {
    if (!this.memoryManager) {
      return;
    }
    
    try {
      // 如果有API密钥，使用LLM生成摘要
      if (this.settings && this.settings.apiKey) {
        const summaryData = await this.memoryManager.generateSummary(
          this.state.sessionId,
          memoryData.summary
        );
        
        // 转换 importance (1-10) 到 (0-1)
        const normalizedImportance = summaryData.importance ? summaryData.importance / 10 : 0.5;
        
        this.memoryManager.addMemory({
          sessionId: this.state.sessionId,
          type: summaryData.type || memoryData.type,
          summary: summaryData.summary,
          keywords: summaryData.keywords,
          chapterIndex: memoryData.chapterIndex,
          importance: normalizedImportance,
          metadata: { ...memoryData.metadata, importance: summaryData.importance }
        });
      } else {
        // 没有API密钥时直接添加，使用重要性评估
        const importance = this.memoryManager._evaluateImportance(memoryData.summary);
        this.memoryManager.addMemory({
          sessionId: this.state.sessionId,
          ...memoryData,
          keywords: memoryData.summary.split(/[，。！？；、\s]+/).slice(0, 5),
          importance: importance
        });
      }
    } catch (err) {
      console.warn('添加长期记忆失败:', err.message);
    }
  }
  
  /**
   * 获取短期记忆
   */
  getShortTermMemory() {
    if (!this.state || !this.state.shortTermMemory) {
      return [];
    }
    return this.state.shortTermMemory;
  }
  
  /**
   * 获取相关长期记忆
   */
  retrieveRelevantMemories(query, topK = 5) {
    if (!this.memoryManager || !this.state) {
      return [];
    }
    
    return this.memoryManager.retrieveMemories(this.state.sessionId, query, topK);
  }
  
  /**
   * 获取所有长期记忆
   */
  getAllLongTermMemories() {
    if (!this.memoryManager || !this.state) {
      return [];
    }
    
    return this.memoryManager.getSessionMemories(this.state.sessionId);
  }
  
  /**
   * 删除长期记忆
   */
  deleteLongTermMemory(memoryId) {
    if (!this.memoryManager) {
      throw new Error('记忆管理器未初始化');
    }
    
    this.memoryManager.deleteMemory(memoryId);
  }
  
  /**
   * 清理旧记忆
   */
  cleanOldMemories(beforeChapterIndex) {
    if (!this.memoryManager || !this.state) {
      throw new Error('记忆管理器或会话未初始化');
    }
    
    return this.memoryManager.cleanOldMemories(this.state.sessionId, beforeChapterIndex);
  }
  
  /**
   * 压缩记忆
   */
  async compressMemories() {
    if (!this.memoryManager || !this.state) {
      throw new Error('记忆管理器或会话未初始化');
    }
    
    return await this.memoryManager.compressMemories(this.state.sessionId);
  }
  
  /**
   * 加载所有会话状态
   */
  loadAllSessions() {
    if (!fs.existsSync(this.paths.storyStateFile)) {
      return {};
    }
    const allSessions = JSON.parse(fs.readFileSync(this.paths.storyStateFile, 'utf8'));
    return allSessions;
  }
  
  /**
   * 获取所有会话列表
   */
  listSessions() {
    const allSessions = this.loadAllSessions();
    return Object.values(allSessions).map(session => ({
      sessionId: session.sessionId,
      protagonist: session.protagonist,
      currentChapterIndex: session.currentChapterIndex,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }));
  }
  
  /**
   * 删除会话
   */
  deleteSession(sessionId) {
    if (!fs.existsSync(this.paths.storyStateFile)) {
      return false;
    }
    
    const allSessions = JSON.parse(fs.readFileSync(this.paths.storyStateFile, 'utf8'));
    delete allSessions[sessionId];
    
    fs.writeFileSync(this.paths.storyStateFile, JSON.stringify(allSessions, null, 2));
    
    if (this.state && this.state.sessionId === sessionId) {
      this.state = null;
    }
    
    console.log(`✓ 会话已删除: ${sessionId}`);
    return true;
  }
}

// 单例实例
let instance = null;

/**
 * 获取状态管理器单例
 */
function getStoryStateManager() {
  if (!instance) {
    instance = new StoryStateManager();
    instance.initialize();
  }
  return instance;
}

module.exports = {
  StoryStateManager,
  getStoryStateManager
};
