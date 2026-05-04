/**
 * Story Framework Generator
 * 核心生成逻辑：根据参数动态生成故事框架
 *
 * 主角设定说明：
 * - 主角是原创角色，与原著完全无关
 * - 普通修行者，初始境界为入门阶段，没有特殊天赋
 * - 互动方式：旁观、收集情报、与NPC交易、轻度介入（不改变结果）
 * - 必须遵守原著锚点，不能改变关键事实
 */

const dataLoader = require('./data-loader');
const storyServices = require('./story-services');

/**
 * 故事框架生成器
 */
class StoryFrameworkGenerator {
  constructor() {
    this.timeline = null;
    this.canonAnchors = null;
    this.characterState = null;
    this.data = null;
  }
  
  /**
   * 异步初始化服务
   */
  async init() {
    const services = await storyServices.initServices();
    this.timeline = services.timeline;
    this.canonAnchors = services.canonAnchors;
    this.characterState = services.characterState;
    this.data = services.data;
  }
  
  /**
   * 生成故事框架
   * @param {Object} options - 生成参数
   * @param {string} options.protagonist - 主角名称（默认：主角）
   * @param {string} options.startingPoint - 起点事件描述（如：故事起点）
   * @param {Array<string>} options.focusCharacters - 重点关注的角色列表
   * @param {number} options.maxChapters - 生成多少章节
   * @param {boolean} options.branches - 是否包含分支选项
   * @param {string} options.playerInfluence - 玩家影响程度（low/medium/high）
   * @param {Object} options.protagonistProfile - 主角完整档案
   * @param {string} options.canonProtagonist - 原著主角名称（用于过滤专属事件）
   * @returns {Object} 故事框架
   */
  generate(options = {}) {
    const {
      protagonist = '主角',
      startingPoint = 1,
      maxChapters = 20,
      focusCharacters = [],
      playerInfluence = 'medium',
      interactionMode = 'medium',
      branches = true,
      protagonistProfile = {},
      canonProtagonist = null
    } = options;
    
    console.log(`\n=== 生成故事框架 ===`);
    console.log(`主角: ${protagonist}`);
    console.log(`起点: ${startingPoint || '小说开始'}`);
    console.log(`重点关注角色: ${focusCharacters.join(', ') || '无'}`);
    console.log(`章节数: ${maxChapters}`);
    console.log(`分支选项: ${branches ? '是' : '否'}`);
    console.log(`玩家影响: ${playerInfluence}`);
    console.log(`主角档案: ${JSON.stringify(protagonistProfile, null, 2)}\n`);
    
    console.log('[Framework Generator] Data loaded:');
    console.log(`  Total events in timeline: ${this.timeline?.sortedEvents?.length || 0}`);
    console.log(`  Total anchors: ${this.canonAnchors?.anchors?.length || 0}`);
    console.log(`  Total characters: ${Object.keys(this.data?.characters || {}).length}`);
    
    // Debug: Check if events have chapterIndex
    if (this.timeline?.sortedEvents?.length > 0) {
      const sampleEvents = this.timeline.sortedEvents.slice(0, 3);
      console.log(`  Sample events with chapterIndex:`);
      sampleEvents.forEach(e => {
        console.log(`    - ${e.name || e.description?.substring(0, 30)}: chapterIndex=${e.chapterIndex}`);
      });
    }
    
    // 1. 确定起点章节
    const startChapter = this._findStartChapter(startingPoint);
    
    // 2. 获取章节范围内的事件
    const endChapter = startChapter + maxChapters - 1;
    const events = this.timeline.getEventsInRange(startChapter, endChapter);
    
    console.log('[Framework Generator] Events in range:', events.length);
    console.log(`  Start chapter: ${startChapter}, End chapter: ${endChapter}`);
    
    // 3. 获取该范围内的锚点
    const anchors = this.canonAnchors.getAnchorsInRange(startChapter, endChapter);
    
    console.log('[Framework Generator] Anchors in range:', anchors.length);
    console.log(`  Anchor sample: ${anchors.slice(0, 2).map(a => ({ chapter: a.chapter, event: a.event?.substring(0, 50) }))}`);
    
    // 4. 生成章节列表
    const chapters = this._generateChapters(
      startChapter,
      endChapter,
      events,
      anchors,
      protagonist,
      focusCharacters,
      branches,
      playerInfluence,
      canonProtagonist
    );

    // 5. 创建主角档案（先创建，供时间轴和开场白使用）
    const fullProtagonistProfile = this._createProtagonistProfile(protagonist, protagonistProfile);

    // 6. 生成时间轴（基于主角档案动态生成开场阶段）
    const timeline = this._generateTimeline(events, fullProtagonistProfile);

    // 7. 生成经典开场白（使用完整的主角档案）
    const openingLines = this._generateOpeningLines(fullProtagonistProfile);
    
    // 8. 生成框架
    const framework = {
      version: '3.0',
      generatedAt: new Date().toISOString(),
      protagonist: fullProtagonistProfile,
      openingLines,
      settings: {
        startChapter,
        endChapter,
        focusCharacters,
        playerInfluence,
        interactionMode,
        branchesEnabled: branches
      },
      chapters,
      timeline,
      canonAnchors: anchors,
      statistics: {
        totalChapters: chapters.length,
        totalEvents: events.length,
        totalAnchors: anchors.length,
        branchPoints: chapters.filter(c => c.branches && c.branches.length > 0).length
      }
    };
    
    console.log(`✓ 框架生成完成`);
    console.log(`  章节数: ${chapters.length}`);
    console.log(`  事件数: ${events.length}`);
    console.log(`  锚点数: ${anchors.length}`);
    console.log(`  分支点: ${framework.statistics.branchPoints}`);
    
    return framework;
  }
  
  /**
   * 查找起点章节
   */
  _findStartChapter(startingPoint) {
    if (startingPoint === null || startingPoint === undefined || startingPoint === '') {
      return 0; // 默认从第0章开始（包含序章）
    }

    // 数字类型：直接作为章节索引
    if (typeof startingPoint === 'number') {
      return Math.max(0, Math.floor(startingPoint));
    }
    // 数字字符串
    if (typeof startingPoint === 'string' && /^\d+$/.test(startingPoint.trim())) {
      return Math.max(0, parseInt(startingPoint.trim(), 10));
    }

    // 搜索包含起点描述的事件
    const events = this.timeline.searchEvents(startingPoint);
    if (events.length > 0) {
      return events[0].chapterIndex || 0;
    }

    console.warn(`未找到起点事件 "${startingPoint}"，从第0章开始`);
    return 0;
  }
  
  /**
   * 生成章节列表
   */
  _generateChapters(startChapter, endChapter, events, anchors, protagonist, focusCharacters, branches, playerInfluence, canonProtagonist) {
    const chapters = [];
    
    for (let chapter = startChapter; chapter <= endChapter; chapter++) {
      const chapterEvents = this.timeline.getEventsAtChapter(chapter);
      
      // 过滤掉原著主角专属的事件，避免原创角色剧情与原著剧情重叠
      const filteredEvents = this._filterCanonProtagonistEvents(chapterEvents, protagonist, canonProtagonist);
      
      const chapterAnchors = anchors.filter(a => a.chapter === chapter);
      
      // 生成章节标题
      const title = this._generateChapterTitle(chapter, filteredEvents);
      
      // 生成章节概要
      const summary = this._generateChapterSummary(filteredEvents, protagonist);
      
      // 获取出场角色
      const characters = this._getCharactersInChapter(filteredEvents, protagonist, focusCharacters);
      
      // 获取关键事件
      const keyEvents = this._getKeyEvents(filteredEvents);
      
      // 生成分支选项
      let branchOptions = [];
      if (branches && filteredEvents.length > 0) {
        branchOptions = this._generateBranchOptions(
          chapter,
          filteredEvents,
          chapterAnchors,
          protagonist,
          playerInfluence
        );
      }
      
      chapters.push({
        chapterIndex: chapter,
        title,
        summary,
        characters,
        keyEvents,
        branches: branchOptions,
        hasAnchors: chapterAnchors.length > 0
      });
    }
    
    return chapters;
  }
  
  /**
   * 过滤掉原著主角专属的事件
   * 如果主角不是原著主角，则过滤掉原著主角专属的事件，避免剧情重叠
   */
  _filterCanonProtagonistEvents(events, protagonist, canonProtagonists) {
    // 如果没有指定原著主角，或者主角就是原著主角之一，则不过滤
    if (!canonProtagonists || canonProtagonists.length === 0) {
      return events;
    }
    
    if (canonProtagonists.includes(protagonist)) {
      return events;
    }
    
    // 过滤掉原著主角专属的事件
    // 原著主角专属的事件通常包含以下特征：
    // 1. 角色列表中只有原著主角之一
    // 2. 事件描述中明确提到原著主角的独有行为（如重生、夺舍、特定法宝等）
    const canonKeywords = ['重生', '夺舍', '前世', '转世', '穿越', '逆光阴', '轮回'];
    
    return events.filter(event => {
      // 如果事件的角色列表包含原著主角之一和其他角色，则保留（可能是互动事件）
      if (event.characters && event.characters.length > 1) {
        const hasCanonProtagonist = event.characters.some(char => canonProtagonists.includes(char));
        if (hasCanonProtagonist) {
          return true;
        }
      }
      
      // 如果事件的角色列表只有原著主角之一，则过滤
      if (event.characters && event.characters.length === 1) {
        if (canonProtagonists.includes(event.characters[0])) {
          return false;
        }
      }
      
      // 如果事件描述包含原著主角专属关键词，则过滤
      if (event.description) {
        const hasCanonKeyword = canonKeywords.some(keyword => event.description.includes(keyword));
        if (hasCanonKeyword) {
          return false;
        }
      }
      
      // 其他事件保留
      return true;
    });
  }
  
  /**
   * 生成章节标题
   */
  _generateChapterTitle(chapterIndex, events) {
    if (events.length === 0) {
      return `第 ${chapterIndex} 章`;
    }
    
    // 使用第一个事件的描述作为标题基础
    const firstEvent = events[0];
    const description = firstEvent.description || '';
    
    // 提取关键词作为标题
    const keywords = description.slice(0, 30);
    return `第 ${chapterIndex} 章：${keywords}`;
  }
  
  /**
   * 生成章节概要
   */
  _generateChapterSummary(events, protagonist) {
    if (events.length === 0) {
      return '本章无明显事件';
    }
    
    const descriptions = events.map(e => e.description || '');
    const summary = descriptions.join('；');
    
    // 如果有主角，添加主角视角
    if (protagonist && summary.length > 0) {
      return `${protagonist} 旁观：${summary}`;
    }
    
    return summary;
  }
  
  /**
   * 获取章节中的角色
   */
  _getCharactersInChapter(events, protagonist, focusCharacters) {
    const characterSet = new Set();
    
    for (const event of events) {
      if (event.characters) {
        event.characters.forEach(char => characterSet.add(char));
      }
    }
    
    const characters = Array.from(characterSet);
    
    // 确保主角在列表中
    if (protagonist && !characters.includes(protagonist)) {
      characters.unshift(protagonist);
    }
    
    // 将重点关注的角色排在前面
    if (focusCharacters.length > 0) {
      characters.sort((a, b) => {
        const aIndex = focusCharacters.indexOf(a);
        const bIndex = focusCharacters.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });
    }
    
    return characters;
  }
  
  /**
   * 获取关键事件
   */
  _getKeyEvents(events) {
    return events.filter(e => e.isMajor || e.isCanon || (e.description && e.description.length > 20));
  }
  
  /**
   * 生成分支选项
   */
  _generateBranchOptions(chapterIndex, events, anchors, protagonist, playerInfluence) {
    const options = [];
    
    if (events.length === 0) {
      return options;
    }
    
    // 选项1：跟随原著剧情
    options.push({
      id: 'follow_original',
      title: '跟随原著剧情',
      description: '完全按照原著发展，不进行任何干预',
      influence: 'none',
      outcome: '保持原著结果'
    });
    
    // 选项2：主角旁观
    options.push({
      id: 'observe',
      title: `${protagonist}旁观`,
      description: `${protagonist} 在一旁观察，收集情报但不介入`,
      influence: 'low',
      outcome: '获得情报，不影响剧情'
    });
    
    // 选项3：轻度介入（仅在影响程度允许时）
    if (playerInfluence !== 'low') {
      // 检查是否有可以轻度介入的事件
      const intervenableEvents = events.filter(e => !e.isCanon && !e.isMajor);
      
      if (intervenableEvents.length > 0) {
        options.push({
          id: 'light_intervention',
          title: `${protagonist}轻度介入`,
          description: `${protagonist} 与NPC互动或提供轻微帮助，不改变事件结果`,
          influence: 'low',
          outcome: '增加互动，保持原著结果',
          constraints: this._getConstraintsForChapter(anchors)
        });
      }
    }
    
    // 选项4：中度介入（仅在影响程度允许时）
    if (playerInfluence === 'high') {
      options.push({
        id: 'medium_intervention',
        title: `${protagonist}中度介入`,
        description: `${protagonist} 主动参与事件，尝试影响过程但尊重锚点约束`,
        influence: 'medium',
        outcome: '可能改变过程，但遵守原著关键事实',
        constraints: this._getConstraintsForChapter(anchors)
      });
    }
    
    return options;
  }
  
  /**
   * 获取章节的约束条件
   */
  _getConstraintsForChapter(anchors) {
    if (anchors.length === 0) {
      return [];
    }
    
    return anchors.map(a => ({
      type: 'canon_anchor',
      description: a.event,
      immutable: a.immutable
    }));
  }
  
  /**
   * 生成时间轴
   */
  _generateTimeline(events, protagonist = {}) {
    // 按章节分组事件，生成阶段
    const phases = [];
    const chapterGroups = {};
    
    events.forEach(e => {
      const chapter = e.chapterIndex || 1;
      if (!chapterGroups[chapter]) {
        chapterGroups[chapter] = [];
      }
      chapterGroups[chapter].push(e);
    });
    
    const chapters = Object.keys(chapterGroups).sort((a, b) => parseInt(a) - parseInt(b));
    const totalChapters = chapters.length;
    
    // 根据主角档案动态生成开场/过渡阶段
    const opening = this._buildOpeningPhase(protagonist);
    const transition = this._buildTransitionPhase(protagonist);

    phases.push(opening);
    phases.push(transition);
    
    chapters.forEach((chapter, index) => {
      const chapterEvents = chapterGroups[chapter];
      const progress = (index + 1) / totalChapters;
      
      // 生成随机浮动值（每次生成框架时随机）
      // 前期结束点：10%-16%浮动
      const earlyPhaseEnd = 0.10 + Math.random() * 0.06; // 0.10-0.16
      // 中期结束点：55%-65%浮动
      const midPhaseEnd = 0.55 + Math.random() * 0.10; // 0.55-0.65
      // 后期结束点：75%-85%浮动
      const latePhaseEnd = 0.75 + Math.random() * 0.10; // 0.75-0.85
      
      let phaseName;
      if (progress < earlyPhaseEnd) {
        phaseName = '前期';
      } else if (progress < midPhaseEnd) {
        phaseName = '中期';
      } else if (progress < latePhaseEnd) {
        phaseName = '后期';
      } else {
        phaseName = '终期';
      }
      
      // 检查是否包含主要角色
      const hasMainCharacters = chapterEvents.some(e =>
        e.characters && e.characters.length > 0
      );

      // 提取本章所有角色
      const chapterCharacters = new Set();
      chapterEvents.forEach(e => {
        if (e.characters) {
          e.characters.forEach(char => chapterCharacters.add(char));
        }
      });

      phases.push({
        phase: phaseName,
        title: `第${chapter}章`,
        description: chapterEvents.map(e => e.description).join('，').substring(0, 200) + '...',
        isTransition: false,
        avoidMainCharacters: false, // 所有阶段都可以出现主要角色
        characters: Array.from(chapterCharacters), // 添加角色字段
        key_events: chapterEvents.filter(e => e.isMajor).map(e => e.description),
        events: chapterEvents.map(e => ({
          chapter: e.chapterIndex,
          event: e.description,
          characters: e.characters || [],
          isMajor: e.isMajor || false,
          isCanon: e.isCanon || false
        }))
      });
    });
    
    return phases;
  }
  
  /**
   * 推断主角的"来历类型"：rebirth / transmigration / native / unknown
   */
  _inferOriginType(protagonist = {}) {
    const text = [
      protagonist.openingScenario,
      protagonist.background,
      protagonist.description,
      protagonist.openingKnowledge
    ].filter(Boolean).join(' ');
    if (/重生|前世|轮回|逆光阴|转世/.test(text)) return 'rebirth';
    if (/穿越|魂穿|天外之魔|降临/.test(text)) return 'transmigration';
    if (protagonist.type === 'canon') return 'native';
    return 'unknown';
  }

  /**
   * 构建开场阶段（基于主角档案）
   */
  _buildOpeningPhase(protagonist = {}) {
    const origin = this._inferOriginType(protagonist);
    const name = protagonist.name || '主角';
    const loc = protagonist.startingLocation || '故事起点';

    const titleByOrigin = {
      rebirth: '序幕：重生归来',
      transmigration: '序幕：异界初临',
      native: '序幕：故事开端',
      unknown: '序幕：故事开端'
    };
    const descByOrigin = {
      rebirth: `${name}带着前世记忆回到${loc}，需要了解当前处境，开始谋划未来`,
      transmigration: `${name}穿越来到${loc}，对世界尚不熟悉，需要先收集情报、适应环境`,
      native: `${name}身处${loc}，开始踏上属于自己的修行之路`,
      unknown: `${name}于${loc}开始新的旅程，先了解现状，再谋划未来`
    };

    return {
      phase: '开场',
      title: titleByOrigin[origin] || titleByOrigin.unknown,
      description: descByOrigin[origin] || descByOrigin.unknown,
      isTransition: true,
      avoidMainCharacters: false,
      characters: [],
      key_events: [],
      events: []
    };
  }

  /**
   * 构建过渡阶段（基于主角档案）
   */
  _buildTransitionPhase(protagonist = {}) {
    const origin = this._inferOriginType(protagonist);
    const name = protagonist.name || '主角';

    const titleByOrigin = {
      rebirth: '第一章：故地重游',
      transmigration: '第一章：站稳脚跟',
      native: '第一章：初步探索',
      unknown: '第一章：初步探索'
    };
    const descByOrigin = {
      rebirth: `${name}重新熟悉旧地，盘算手中可用资源，谨慎试探周遭局势`,
      transmigration: `${name}努力适应新身份，积累初始资源，观察周围环境与人物关系`,
      native: `${name}开始独立行动，探索故事舞台，建立基础关系`,
      unknown: `${name}积累初始资源，观察周围环境，谋划下一步行动`
    };

    return {
      phase: '过渡',
      title: titleByOrigin[origin] || titleByOrigin.unknown,
      description: descByOrigin[origin] || descByOrigin.unknown,
      isTransition: true,
      avoidMainCharacters: false,
      characters: [],
      key_events: [],
      events: []
    };
  }

  /**
   * 生成经典开场白（基于主角档案动态生成）
   */
  _generateOpeningLines(protagonist) {
    const origin = this._inferOriginType(protagonist);
    const name = protagonist.name || '主角';
    const loc = protagonist.startingLocation || '故事起点';
    const scenario = protagonist.openingScenario || '';
    const mood = protagonist.openingMood || '冷静、谨慎';
    const personality = protagonist.personality || '';

    const linesByOrigin = {
      rebirth: {
        narrator: '当命运的齿轮再次转动，一切都将重新开始。',
        protagonist: '这一次，我绝不会重蹈覆辙。',
        situation: `${name}重新回到${loc}，这是他前世留下遗憾的地方，也是一切的起点。`
      },
      transmigration: {
        narrator: '陌生的天地之间，一段从未写就的命运正在开启。',
        protagonist: '既然来到这里，我就要在这世界活出自己的痕迹。',
        situation: `${name}从异世来到${loc}，对身边的一切既熟悉又陌生，前路未知。`
      },
      native: {
        narrator: '故事的序章正缓缓拉开。',
        protagonist: '路在脚下，需要一步步走出来。',
        situation: `${name}站在${loc}，准备迈出属于自己的第一步。`
      },
      unknown: {
        narrator: '故事的序章正缓缓拉开。',
        protagonist: '前路未明，但脚下的路必须由我自己去走。',
        situation: `${name}立于${loc}，开始新的旅程。`
      }
    };

    const picked = linesByOrigin[origin] || linesByOrigin.unknown;

    return {
      narrator: picked.narrator,
      protagonist: picked.protagonist,
      setting: scenario || `${loc}的天地依旧，但属于${name}的故事才刚刚开始。`,
      situation: picked.situation,
      mood: mood + (personality ? `（${personality}）` : ''),
      hint: protagonist.openingKnowledge || '先了解现状，收集情报，再谋划下一步。'
    };
  }
  
  /**
   * 创建主角档案
   */
  _createProtagonistProfile(name, customProfile = {}) {
    const defaultProfile = {
      // 基本信息
      description: '一名修行者',
      birth: '未知',
      age: '外表约20岁',
      gender: '男',

      // 背景故事
      background: '正在了解自己的处境和当前的状况',
      family: '无依无靠',

      // 起始状态
      startingRealm: '入门阶段',
      startingLocation: '故事起点',

      // 实力设定
      cultivationPath: '修行',
      specialAbilities: '依靠观察和智慧',
      combatStrength: '入门阶段，战力普通',

      // 性格特征
      personality: '冷静，心思缜密，沉着',
      goals: '追求长生',
      fears: '死亡、失去控制',

      // 互动模式
      interactionMode: '旁观、收集情报、与NPC交易、轻度介入',
      cautionLevel: '高（避免过早暴露实力）',

      // 开场设定
      openingScenario: '开始新的生活',
      openingMood: '冷静、谨慎',
      openingKnowledge: '需要收集情报，了解现状'
    };

    // 合并自定义配置（用户填写的优先）
    const profile = { ...defaultProfile };

    // 只覆盖非空的字段
    Object.keys(customProfile).forEach(key => {
      if (customProfile[key] && customProfile[key].trim()) {
        profile[key] = customProfile[key].trim();
      }
    });

    return {
      name,
      type: 'original',
      ...profile
    };
  }
  
  /**
   * 验证分支是否违反锚点
   */
  validateBranch(branch, chapterIndex) {
    const violations = [];
    
    for (const constraint of (branch.constraints || [])) {
      if (constraint.type === 'canon_anchor' && constraint.immutable) {
        // 检查分支是否会改变不可改变的事实
        if (branch.influence !== 'none' && branch.influence !== 'low') {
          violations.push({
            constraint: constraint.description,
            reason: '试图改变不可改变的原著事实'
          });
        }
      }
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
}

/**
 * 便捷函数：生成故事框架
 */
async function generateStoryFramework(options) {
  const generator = new StoryFrameworkGenerator();
  await generator.init();
  return generator.generate(options);
}

module.exports = {
  StoryFrameworkGenerator,
  generateStoryFramework
};
