/**
 * Data Loader Module
 * 加载从小说提取的缓存数据（角色、事件、关系、世界书）
 * 避免重新解析小说原文或调用 DeepSeek API
 * 
 * 优化：集成文件缓存（LRU）和异步读取
 * 支持多小说数据隔离
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fileCache = require('./file-cache');

const DATA_DIR = path.join(__dirname, '../data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const ACTIVE_FILE = path.join(NOVELS_DIR, '_active.json');

/**
 * Get active novel ID
 */
function getActiveNovelId() {
  try {
    if (fsSync.existsSync(ACTIVE_FILE)) {
      const active = JSON.parse(fsSync.readFileSync(ACTIVE_FILE, 'utf8'));
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
    progressFile: path.join(novelDataDir, 'extraction_progress.json'),
    characterCacheFile: path.join(novelDataDir, 'character_attributes_cache.json'),
    eventsFile: path.join(novelDataDir, 'events.json'),
    relationshipsFile: path.join(novelDataDir, 'relationships.json'),
    worldbookFile: path.join(novelDataDir, 'worldbook.json'),
    timelineFile: path.join(novelDataDir, 'timeline.json'),
    canonAnchorsFile: path.join(novelDataDir, 'canon_anchors.json')
  };
}

// Legacy paths for backward compatibility (fallback to old structure)
const LEGACY_PROGRESS_FILE = path.join(DATA_DIR, 'extraction_progress.json');
const LEGACY_CHARACTER_CACHE_FILE = path.join(DATA_DIR, 'character_attributes_cache.json');
const LEGACY_EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const LEGACY_RELATIONSHIPS_FILE = path.join(DATA_DIR, 'relationships.json');
const LEGACY_WORLDBOOK_FILE = path.join(DATA_DIR, 'worldbook.json');
const LEGACY_TIMELINE_FILE = path.join(DATA_DIR, 'timeline.json');
const LEGACY_CANON_ANCHORS_FILE = path.join(DATA_DIR, 'canon_anchors.json');

/**
 * 加载 JSON 文件（异步，带缓存）
 */
async function loadJSON(filePath, options = {}) {
  try {
    return await fileCache.get(filePath, options);
  } catch (error) {
    console.warn(`文件 ${filePath} 读取失败:`, error.message);
    return null;
  }
}

/**
 * 同步加载 JSON 文件（用于启动时必须同步的场景）
 */
function loadJSONSync(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn(`文件 ${filePath} 读取失败:`, e.message);
      return null;
    }
  }
  return null;
}

/**
 * 加载所有缓存数据（异步，带缓存）
 */
async function loadAllData(options = {}) {
  console.log('正在加载缓存数据...');
  
  const activeNovelId = getActiveNovelId();
  if (!activeNovelId) {
    console.warn('未设置激活的小说，尝试使用旧版数据结构...');
  }
  
  const paths = activeNovelId ? getDataPaths(activeNovelId) : {
    progressFile: LEGACY_PROGRESS_FILE,
    characterCacheFile: LEGACY_CHARACTER_CACHE_FILE,
    eventsFile: LEGACY_EVENTS_FILE,
    relationshipsFile: LEGACY_RELATIONSHIPS_FILE,
    worldbookFile: LEGACY_WORLDBOOK_FILE,
    timelineFile: LEGACY_TIMELINE_FILE,
    canonAnchorsFile: LEGACY_CANON_ANCHORS_FILE
  };
  
  const data = {
    characters: {},
    events: [],
    relationships: [],
    worldbook: {},
    timeline: [],
    canonAnchors: []
  };
  
  // 优先从进度文件加载（包含所有数据）
  const progress = await loadJSON(paths.progressFile, options);
  if (progress && progress.allCharacters && Object.keys(progress.allCharacters).length > 0) {
    console.log('✓ 从进度文件加载角色数据');
    data.characters = progress.allCharacters;
    data.events = progress.allEvents || [];
    data.relationships = normalizeRelationships(progress.allRelationships || []);
    data.worldbook = progress.allWorldbook || {};
  } else {
    // 如果进度文件不存在，尝试从独立文件加载
    console.log('进度文件不存在，尝试从独立文件加载...');
    
    const charCache = await loadJSON(paths.characterCacheFile, options);
    if (charCache) {
      console.log('✓ 加载角色缓存');
      data.characters = charCache;
    }
    
    const eventsData = await loadJSON(paths.eventsFile, options);
    if (eventsData && eventsData.events) {
      console.log('✓ 加载事件数据');
      data.events = eventsData.events;
    }
    
    const relData = await loadJSON(paths.relationshipsFile, options);
    if (relData && relData.relationships) {
      console.log('✓ 加载关系数据');
      data.relationships = normalizeRelationships(relData.relationships);
    }
  }
  
  // 加载世界书
  const worldbook = await loadJSON(paths.worldbookFile, options);
  if (worldbook) {
    console.log('✓ 加载世界书数据');
    data.worldbook = worldbook;
  }
  
  // 加载时间轴
  const timeline = await loadJSON(paths.timelineFile, options);
  if (timeline && timeline.events) {
    console.log('✓ 加载时间轴数据');
    data.timeline = timeline.events;
  }
  
  // 加载原著锚点
  const anchors = await loadJSON(paths.canonAnchorsFile, options);
  if (anchors && anchors.anchors) {
    console.log('✓ 加载原著锚点数据');
    data.canonAnchors = anchors.anchors;
  }
  
  console.log(`\n数据加载完成:`);
  console.log(`  小说: ${activeNovelId || '旧版结构'}`);
  console.log(`  角色: ${Object.keys(data.characters).length} 个`);
  console.log(`  事件: ${data.events.length} 个`);
  console.log(`  关系: ${data.relationships.length} 条`);
  console.log(`  世界书分类: ${Object.keys(data.worldbook).length} 个`);
  console.log(`  时间轴事件: ${data.timeline.length} 个`);
  console.log(`  原著锚点: ${data.canonAnchors.length} 个`);
  
  return data;
}

/**
 * 同步加载所有缓存数据（用于启动时）
 */
function loadAllDataSync() {
  console.log('正在同步加载缓存数据...');
  
  const activeNovelId = getActiveNovelId();
  if (!activeNovelId) {
    console.warn('未设置激活的小说，尝试使用旧版数据结构...');
  }
  
  const paths = activeNovelId ? getDataPaths(activeNovelId) : {
    progressFile: LEGACY_PROGRESS_FILE,
    characterCacheFile: LEGACY_CHARACTER_CACHE_FILE,
    eventsFile: LEGACY_EVENTS_FILE,
    relationshipsFile: LEGACY_RELATIONSHIPS_FILE,
    worldbookFile: LEGACY_WORLDBOOK_FILE,
    timelineFile: LEGACY_TIMELINE_FILE,
    canonAnchorsFile: LEGACY_CANON_ANCHORS_FILE
  };
  
  const data = {
    characters: {},
    events: [],
    relationships: [],
    worldbook: {},
    timeline: [],
    canonAnchors: []
  };
  
  // 优先从进度文件加载
  const progress = loadJSONSync(paths.progressFile);
  if (progress && progress.allCharacters && Object.keys(progress.allCharacters).length > 0) {
    console.log('✓ 从进度文件加载角色数据');
    data.characters = progress.allCharacters;
    data.events = progress.allEvents || [];
    data.relationships = normalizeRelationships(progress.allRelationships || []);
    data.worldbook = progress.allWorldbook || {};
  } else {
    const charCache = loadJSONSync(paths.characterCacheFile);
    if (charCache) {
      console.log('✓ 加载角色缓存');
      data.characters = charCache;
    }
    
    const eventsData = loadJSONSync(paths.eventsFile);
    if (eventsData && eventsData.events) {
      console.log('✓ 加载事件数据');
      data.events = eventsData.events;
    }
    
    const relData = loadJSONSync(paths.relationshipsFile);
    if (relData && relData.relationships) {
      console.log('✓ 加载关系数据');
      data.relationships = normalizeRelationships(relData.relationships);
    }
  }
  
  const worldbook = loadJSONSync(paths.worldbookFile);
  if (worldbook) {
    console.log('✓ 加载世界书数据');
    data.worldbook = worldbook;
  }
  
  const timeline = loadJSONSync(paths.timelineFile);
  if (timeline && timeline.events) {
    console.log('✓ 加载时间轴数据');
    data.timeline = timeline.events;
  }
  
  const anchors = loadJSONSync(paths.canonAnchorsFile);
  if (anchors && anchors.anchors) {
    console.log('✓ 加载原著锚点数据');
    data.canonAnchors = anchors.anchors;
  }
  
  console.log(`\n数据加载完成:`);
  console.log(`  小说: ${activeNovelId || '旧版结构'}`);
  console.log(`  角色: ${Object.keys(data.characters).length} 个`);
  console.log(`  事件: ${data.events.length} 个`);
  console.log(`  关系: ${data.relationships.length} 条`);
  console.log(`  世界书分类: ${Object.keys(data.worldbook).length} 个`);
  console.log(`  时间轴事件: ${data.timeline.length} 个`);
  console.log(`  原著锚点: ${data.canonAnchors.length} 个`);
  
  return data;
}

/**
 * 根据名称获取角色信息
 */
function getCharacter(data, name) {
  return data.characters[name] || null;
}

/**
 * 根据关键词搜索角色
 */
function searchCharacters(data, keyword) {
  const results = [];
  const lowerKeyword = keyword.toLowerCase();
  
  for (const [name, char] of Object.entries(data.characters)) {
    if (name.toLowerCase().includes(lowerKeyword) ||
        (char.description && char.description.toLowerCase().includes(lowerKeyword))) {
      results.push({ name, ...char });
    }
  }
  
  return results;
}

/**
 * 根据章节索引获取事件
 */
function getEventsByChapter(data, chapterIndex) {
  return data.events.filter(event => event.chapterIndex === chapterIndex);
}

/**
 * 根据角色获取相关事件
 */
function getEventsByCharacter(data, characterName) {
  return data.events.filter(event => 
    event.characters && event.characters.includes(characterName)
  );
}

/**
 * 标准化关系字段名：将 character1/character2 映射为 source/target
 * 兼容提取脚本产出的旧格式
 */
function normalizeRelationships(relationships) {
  if (!Array.isArray(relationships)) return [];
  return relationships.map(rel => ({
    ...rel,
    source: rel.source || rel.character1,
    target: rel.target || rel.character2
  }));
}

/**
 * 获取角色的关系
 */
function getCharacterRelationships(data, characterName) {
  return data.relationships.filter(rel => 
    rel.source === characterName || rel.target === characterName
  );
}

module.exports = {
  loadAllData,
  loadAllDataSync,
  getCharacter,
  searchCharacters,
  getEventsByChapter,
  getEventsByCharacter,
  getCharacterRelationships,
  fileCache,
  getActiveNovelId,
  getNovelDataDir,
  getDataPaths
};
