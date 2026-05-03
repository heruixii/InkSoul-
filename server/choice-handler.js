/**
 * Choice Handler
 * 玩家选择处理模块 - 处理玩家的分支选择，验证锚点约束，更新故事状态
 * 
 * 功能：
 * - 验证选择是否违反锚点
 * - 更新故事状态（章节、分支历史、角色关系）
 * - 调用 AI 生成后续内容
 * - 返回选择结果
 */

const storyStateManager = require('./story-state-manager');
const aiContentGenerator = require('./ai-content-generator');
const storyServices = require('./story-services');

/**
 * 选择处理器
 */
class ChoiceHandler {
  constructor(settings) {
    this.settings = settings || {};
    this.stateManager = storyStateManager.getStoryStateManager();
    this.aiGenerator = new aiContentGenerator.AIContentGenerator(settings);
  }
  
  /**
   * 处理玩家选择
   * @param {Object} params - 参数
   * @param {string} params.sessionId - 会话ID
   * @param {number} params.chapterIndex - 章节索引
   * @param {string} params.branchId - 分支ID
   * @param {boolean} params.advance - 是否自动推进到下一章
   * @returns {Promise<Object>} 选择结果
   */
  async handleChoice(params) {
    const { sessionId, chapterIndex, branchId, advance = false } = params;
    
    // 1. 加载会话
    const session = this.stateManager.loadSession(sessionId);
    
    // 2. 获取当前章节
    const currentChapter = this.stateManager.getCurrentChapter();
    if (!currentChapter) {
      throw new Error('无法获取当前章节');
    }
    
    // 3. 验证章节索引匹配
    if (currentChapter.chapterIndex !== chapterIndex) {
      throw new Error(`章节索引不匹配：当前 ${currentChapter.chapterIndex}，请求 ${chapterIndex}`);
    }
    
    // 4. 获取分支选项
    const branch = currentChapter.branches.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`分支 ${branchId} 不存在`);
    }
    
    // 5. 验证分支是否违反锚点
    const validation = this._validateBranch(branch, chapterIndex);
    if (!validation.valid) {
      throw new Error(`分支违反锚点：${validation.violations.map(v => v.reason).join(', ')}`);
    }
    
    // 6. 记录分支选择
    this.stateManager.recordBranchChoice(chapterIndex, branchId);
    
    // 7. 记录角色互动
    if (branch.influence !== 'none') {
      for (const charName of currentChapter.characters) {
        this.stateManager.recordInteraction(
          charName,
          'choice',
          `选择了分支：${branch.title}`
        );
      }
    }
    
    // 8. 如果需要自动推进，调用AI生成下一章内容
    let nextChapter = null;
    let generatedEvent = null;
    
    if (advance) {
      try {
        // 推进到下一章
        nextChapter = this.stateManager.advanceToNextChapter();
        
        // AI生成新事件
        const framework = this.stateManager.framework;
        const history = session.chosenBranches.map(cb => ({
          type: 'choice',
          event_title: cb.branchTitle,
          choice: cb.branchTitle,
          timestamp: cb.timestamp
        }));
        
        generatedEvent = await this.aiGenerator.generateEvent({
          framework,
          currentChapter: nextChapter,
          previousChoice: branch.title,
          history,
          playerInfluence: session.playerInfluence
        });
        
      } catch (error) {
        console.warn('自动推进失败:', error.message);
        // 不抛出错误，允许用户手动推进
      }
    }
    
    return {
      success: true,
      branch,
      currentChapter,
      nextChapter,
      generatedEvent,
      sessionSummary: this.stateManager.getSessionSummary()
    };
  }
  
  /**
   * 验证分支是否违反锚点
   */
  _validateBranch(branch, chapterIndex) {
    const services = this.stateManager.services;
    if (!services || !services.canonAnchors) {
      return { valid: true, violations: [] };
    }
    
    // 获取当前章节的锚点
    const anchors = this.stateManager.getCurrentAnchors();
    const violations = [];
    
    // 检查分支是否违反锚点约束
    for (const anchor of anchors) {
      // 如果分支试图改变不可改变的事实
      if (branch.influence !== 'none' && branch.influence !== 'low' && anchor.immutable) {
        violations.push({
          anchor: anchor.event,
          reason: '试图改变不可改变的原著事实'
        });
      }
      
      // 检查是否试图杀死不应死亡的角色
      if (branch.influence === 'high' && anchor.characters) {
        for (const charName of anchor.characters) {
          if (branch.description && branch.description.includes('杀死') && 
              branch.description.includes(charName)) {
            violations.push({
              anchor: anchor.event,
              reason: `试图杀死锚点中的角色: ${charName}`
            });
          }
        }
      }
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
  
  /**
   * 获取当前章节的分支选项
   */
  getCurrentBranches(sessionId) {
    const session = this.stateManager.loadSession(sessionId);
    const currentChapter = this.stateManager.getCurrentChapter();
    
    if (!currentChapter) {
      return [];
    }
    
    // 过滤掉已经选择的分支
    const chosenBranchIds = session.chosenBranches
      .filter(cb => cb.chapterIndex === currentChapter.chapterIndex)
      .map(cb => cb.branchId);
    
    return currentChapter.branches.filter(b => !chosenBranchIds.includes(b.id));
  }
  
  /**
   * 检查是否可以推进到下一章
   */
  canAdvance(sessionId) {
    const session = this.stateManager.loadSession(sessionId);
    const currentChapter = this.stateManager.getCurrentChapter();
    
    if (!currentChapter) {
      return { canAdvance: false, reason: '无法获取当前章节' };
    }
    
    // 检查是否已经是最后一章
    if (session.currentChapterIndex >= this.stateManager.framework.settings.endChapter) {
      return { canAdvance: false, reason: '已经是最后一章' };
    }
    
    // 检查是否已经选择了分支（如果需要）
    const chosenBranches = session.chosenBranches.filter(
      cb => cb.chapterIndex === currentChapter.chapterIndex
    );
    
    if (session.branchesEnabled && chosenBranches.length === 0) {
      return { canAdvance: false, reason: '需要先选择分支' };
    }
    
    return { canAdvance: true };
  }
}

module.exports = {
  ChoiceHandler
};
