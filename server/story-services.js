/**
 * Story Services Module
 * 为故事框架生成提供底层服务：
 * - 时间轴服务：查询事件的时间顺序和相邻事件
 * - 锚点服务：提供不可违背的原著事实约束
 * - 角色状态服务：查询角色在特定时间点的状态
 */

const dataLoader = require('./data-loader');

/**
 * 时间轴服务
 * 基于提取的事件数据，提供时间顺序查询
 */
class TimelineService {
  constructor(data) {
    // 优先使用 timeline，如果不存在则使用 events
    this.events = (data.timeline || data.events || []).map((e, index) => ({
      ...e,
      chapterIndex: e.chapterIndex || Math.floor(index / 10) // 为没有章节索引的事件分配章节
    }));
    // 按章节索引排序
    this.sortedEvents = [...this.events].sort((a, b) => 
      (a.chapterIndex || 0) - (b.chapterIndex || 0)
    );
  }
  
  /**
   * 获取指定章节索引的事件
   */
  getEventsAtChapter(chapterIndex) {
    return this.sortedEvents.filter(e => e.chapterIndex === chapterIndex);
  }
  
  /**
   * 获取指定章节范围内的事件
   */
  getEventsInRange(startChapter, endChapter) {
    return this.sortedEvents.filter(e => 
      e.chapterIndex >= startChapter && e.chapterIndex <= endChapter
    );
  }
  
  /**
   * 获取某个事件的前后事件
   */
  getAdjacentEvents(eventId, count = 3) {
    const index = this.sortedEvents.findIndex(e => e.id === eventId);
    if (index === -1) return { before: [], after: [] };
    
    const before = this.sortedEvents.slice(Math.max(0, index - count), index);
    const after = this.sortedEvents.slice(index + 1, index + 1 + count);
    
    return { before, after };
  }
  
  /**
   * 根据关键词搜索事件
   */
  searchEvents(keyword) {
    if (!keyword || typeof keyword !== 'string') {
      return [];
    }
    const lowerKeyword = keyword.toLowerCase();
    return this.sortedEvents.filter(e => 
      (e.description && e.description.toLowerCase().includes(lowerKeyword)) ||
      (e.characters && e.characters.some(c => c.toLowerCase().includes(lowerKeyword)))
    );
  }
  
  /**
   * 获取角色的事件时间线
   */
  getCharacterTimeline(characterName) {
    return this.sortedEvents.filter(e => 
      e.characters && e.characters.includes(characterName)
    );
  }
}

/**
 * 锚点服务
 * 提供不可违背的原著事实约束
 */
class CanonAnchorService {
  constructor(data) {
    this.anchors = data.canonAnchors || [];
    // 从事件中推导锚点（标记为 isCanon 或 isMajor 的事件）
    this.derivedAnchors = this._deriveAnchorsFromEvents(data.events);
  }
  
  /**
   * 从事件中推导锚点
   */
  _deriveAnchorsFromEvents(events) {
    const anchors = [];
    for (const event of events || []) {
      if (event.isCanon || event.isMajor) {
        anchors.push({
          id: `derived_${event.id || event.chapterIndex}`,
          event: event.description,
          chapter: event.chapterIndex,
          characters: event.characters || [],
          type: 'derived',
          immutable: true
        });
      }
    }
    return anchors;
  }
  
  /**
   * 获取指定章节范围内的所有锚点
   */
  getAnchorsInRange(startChapter, endChapter) {
    const allAnchors = [...this.anchors, ...this.derivedAnchors];
    return allAnchors.filter(a => 
      a.chapter >= startChapter && a.chapter <= endChapter
    );
  }
  
  /**
   * 检查某个事件是否违反锚点
   */
  checkViolation(event) {
    const allAnchors = [...this.anchors, ...this.derivedAnchors];
    const violations = [];
    
    for (const anchor of allAnchors) {
      // 检查是否试图改变不可改变的事实
      if (event.chapterIndex === anchor.chapter) {
        // 如果事件描述与锚点冲突
        if (this._isConflicting(event.description, anchor.event)) {
          violations.push({
            anchor: anchor,
            reason: '试图改变原著事实'
          });
        }
      }
      
      // 检查是否试图杀死不应死亡的角色
      if (event.type === 'death' && anchor.characters) {
        for (const char of anchor.characters) {
          if (event.characters && event.characters.includes(char)) {
            violations.push({
              anchor: anchor,
              reason: `试图杀死锚点中的角色: ${char}`
            });
          }
        }
      }
    }
    
    return violations;
  }
  
  /**
   * 判断两个事件描述是否冲突
   */
  _isConflicting(desc1, desc2) {
    // 简单实现：如果描述包含相反的关键词
    const conflictKeywords = [
      ['死亡', '存活'],
      ['杀死', '救下'],
      ['毁灭', '保留'],
      ['失去', '获得']
    ];
    
    for (const [word1, word2] of conflictKeywords) {
      if (desc1.includes(word1) && desc2.includes(word2)) {
        return true;
      }
      if (desc1.includes(word2) && desc2.includes(word1)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 获取特定角色的锚点约束
   */
  getCharacterAnchors(characterName) {
    const allAnchors = [...this.anchors, ...this.derivedAnchors];
    return allAnchors.filter(a => 
      a.characters && a.characters.includes(characterName)
    );
  }
}

/**
 * 角色状态服务
 * 查询角色在特定时间点的状态
 */
class CharacterStateService {
  constructor(data) {
    this.characters = data.characters || {};
    this.events = data.events || [];
    this.relationships = data.relationships || [];
  }
  
  /**
   * 获取角色在指定章节的状态
   */
  getCharacterState(characterName, chapterIndex) {
    const character = this.characters[characterName];
    if (!character) {
      return { exists: false };
    }
    
    // 获取该角色在该章节及之前的事件
    const characterEvents = this.events.filter(e => 
      e.chapterIndex <= chapterIndex &&
      e.characters && e.characters.includes(characterName)
    );
    
    // 推断状态
    const state = {
      name: characterName,
      exists: true,
      realm: character.realm || '未知',
      dao: character.dao || '未知',
      alive: true,
      location: character.location || '未知',
      relationships: this._getRelationshipsAtChapter(characterName, chapterIndex),
      recentEvents: characterEvents.slice(-5)
    };
    
    // 检查是否有死亡事件
    const deathEvent = characterEvents.find(e => 
      e.type === 'death' || e.description.includes('死亡')
    );
    if (deathEvent) {
      state.alive = false;
      state.deathChapter = deathEvent.chapterIndex;
    }
    
    return state;
  }
  
  /**
   * 获取角色在指定章节的关系
   */
  _getRelationshipsAtChapter(characterName, chapterIndex) {
    return this.relationships.filter(rel => 
      (rel.source === characterName || rel.target === characterName) &&
      rel.chapterIndex <= chapterIndex
    );
  }
  
  /**
   * 检查角色在指定章节是否存活
   */
  isCharacterAlive(characterName, chapterIndex) {
    const state = this.getCharacterState(characterName, chapterIndex);
    return state.alive;
  }
  
  /**
   * 获取角色的境界变化历史
   */
  getRealmHistory(characterName) {
    const character = this.characters[characterName];
    if (!character) return [];
    
    const realmEvents = this.events.filter(e => 
      e.characters && e.characters.includes(characterName) &&
      (e.type === 'realm_change' || e.description.includes('晋升') || e.description.includes('突破'))
    );
    
    return realmEvents.map(e => ({
      chapter: e.chapterIndex,
      event: e.description,
      timestamp: e.chapterIndex
    }));
  }
  
  /**
   * 获取角色在指定章节的位置
   */
  getCharacterLocation(characterName, chapterIndex) {
    const state = this.getCharacterState(characterName, chapterIndex);
    return state.location;
  }
}

/**
 * 初始化所有服务（异步版本）
 */
async function initServices() {
  const data = await dataLoader.loadAllData();
  
  return {
    timeline: new TimelineService(data),
    canonAnchors: new CanonAnchorService(data),
    characterState: new CharacterStateService(data),
    data: data
  };
}

/**
 * 初始化所有服务（同步版本，用于兼容）
 */
function initServicesSync() {
  const data = dataLoader.loadAllDataSync();
  
  return {
    timeline: new TimelineService(data),
    canonAnchors: new CanonAnchorService(data),
    characterState: new CharacterStateService(data),
    data: data
  };
}

module.exports = {
  TimelineService,
  CanonAnchorService,
  CharacterStateService,
  initServices,
  initServicesSync
};
