/**
 * 智能角色卡修正脚本
 * 从小说中提取角色的规范属性集合并进行智能修正
 */

const fs = require('fs');
const path = require('path');

// 配置
const NOVEL_FILE = path.join(__dirname, '../Gu Zhen Ren - Gu Zhen Ren.txt');
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const WORLDBOOK_DIR = path.join(__dirname, '../worldbook');
const LOG_FILE = path.join(__dirname, '../logs/intelligent-fix.log');
const CACHE_FILE = path.join(__dirname, '../data/character_attributes_cache.json');

// 确保日志目录存在
const LOG_DIR = path.dirname(LOG_FILE);
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 写入日志
 */
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
}

/**
 * 加载角色属性缓存
 */
function loadCharacterAttributesCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheData);
      writeLog(`已加载角色属性缓存: ${CACHE_FILE}`);
      writeLog(`缓存包含 ${Object.keys(cache).filter(k => cache[k] !== null).length} 个角色`);
      return cache;
    } else {
      writeLog(`缓存文件不存在: ${CACHE_FILE}`);
      writeLog(`请先运行: node extract-novel-characters.js`);
      return {};
    }
  } catch (error) {
    writeLog(`加载缓存失败: ${error.message}`);
    return {};
  }
}

/**
 * 角色规范属性映射
 * 基于小说《蛊真人》的设定
 * 优先使用缓存，如果没有则使用硬编码的默认值
 */
let CHARACTER_CANONICAL_ATTRIBUTES = {};

/**
 * 初始化角色规范属性
 */
function initializeCharacterAttributes() {
  // 加载缓存
  const cache = loadCharacterAttributesCache();
  
  // 转换缓存格式为修正脚本需要的格式
  for (const [characterName, attrs] of Object.entries(cache)) {
    if (attrs === null) continue;
    
    // 跳过原创角色
    if (attrs.isOriginal) {
      writeLog(`  - ${characterName}: 原创角色，跳过`);
      continue;
    }
    
    CHARACTER_CANONICAL_ATTRIBUTES[characterName] = {
      name: attrs.name,
      realm: attrs.realm,
      path: attrs.path,
      title: attrs.title,
      location: attrs.location,
      tags: attrs.tags || [],
      corrections: {}
    };
    
    // 根据提取的属性生成修正规则
    if (attrs.realm && attrs.path) {
      // 如果有境界和道途，可以生成对应的修正规则
      CHARACTER_CANONICAL_ATTRIBUTES[characterName].corrections[`${attrs.path}蛊仙`] = `${attrs.realm}蛊仙`;
    }
  }
  
  writeLog(`初始化完成，共 ${Object.keys(CHARACTER_CANONICAL_ATTRIBUTES).length} 个角色有规范属性`);
}

/**
 * 境界修正规则
 * 将错误的境界表述转换为规范表述
 */
const REALM_CORRECTIONS = {
  '九转尊者': '蛊仙',
  '九转仙尊': '蛊仙',
  '九转蛊尊': '蛊仙',
  '运道蛊仙': '力道蛊仙',  // 楚度特例
  '智多星': '智道蛊仙'
};

/**
 * 势力修正规则
 */
const FORCE_CORRECTIONS = {
  '天庭之主': '天庭成员',
  '十大尊者': '尊者',
  '中洲魔道': '中洲蛊仙'
};

/**
 * 从角色卡中提取角色名
 */
function extractCharacterName(filePath) {
  const fileName = path.basename(filePath, '.json');
  if (fileName.startsWith('角色卡_')) {
    return fileName.replace('角色卡_', '');
  }
  return fileName;
}

/**
 * 智能修正角色卡
 */
function intelligentFixCharacter(filePath, canonicalAttrs, dryRun = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const card = JSON.parse(content);
  const characterName = canonicalAttrs.name;
  
  let modified = false;
  const changes = [];
  
  // 1. 修正 tags 字段
  if (card.tags && Array.isArray(card.tags)) {
    const originalTags = [...card.tags];
    
    // 应用规范标签
    if (canonicalAttrs.tags) {
      // 保留规范标签中存在的标签
      const newTags = canonicalAttrs.tags.filter(tag => card.tags.includes(tag));
      
      // 添加规范标签中缺失的标签
      for (const tag of canonicalAttrs.tags) {
        if (!card.tags.includes(tag)) {
          newTags.push(tag);
          changes.push({
            field: 'tags',
            type: 'add',
            value: tag
          });
          modified = true;
        }
      }
      
      // 移除规范标签中不存在的标签（除非是通用标签）
      const commonTags = ['蛊仙', '八转', '六转', '五转', '四转', '三转', '二转', '一转'];
      for (const tag of originalTags) {
        if (!canonicalAttrs.tags.includes(tag) && !commonTags.includes(tag)) {
          const index = newTags.indexOf(tag);
          if (index > -1) {
            newTags.splice(index, 1);
            changes.push({
              field: 'tags',
              type: 'remove',
              value: tag
            });
            modified = true;
          }
        }
      }
      
      card.tags = newTags;
    }
    
    // 应用特定修正规则
    if (canonicalAttrs.corrections) {
      for (let i = 0; i < card.tags.length; i++) {
        const tag = card.tags[i];
        for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
          if (tag.includes(wrong)) {
            const oldTag = card.tags[i];
            card.tags[i] = tag.replace(new RegExp(wrong, 'g'), correct);
            changes.push({
              field: 'tags',
              type: 'replace',
              old: oldTag,
              new: card.tags[i]
            });
            modified = true;
          }
        }
      }
    }
  }
  
  // 2. 修正 description 字段
  if (card.description && typeof card.description === 'string') {
    const originalDescription = card.description;
    let newDescription = card.description;
    
    // 应用特定修正规则
    if (canonicalAttrs.corrections) {
      for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
        if (newDescription.includes(wrong)) {
          newDescription = newDescription.replace(new RegExp(wrong, 'g'), correct);
          changes.push({
            field: 'description',
            type: 'replace',
            wrong: wrong,
            correct: correct
          });
          modified = true;
        }
      }
    }
    
    // 应用通用境界修正
    for (const [wrong, correct] of Object.entries(REALM_CORRECTIONS)) {
      if (newDescription.includes(wrong)) {
        newDescription = newDescription.replace(new RegExp(wrong, 'g'), correct);
        changes.push({
          field: 'description',
          type: 'replace',
          wrong: wrong,
          correct: correct
        });
        modified = true;
      }
    }
    
    card.description = newDescription;
  }
  
  // 3. 修正 personality 字段
  if (card.personality && typeof card.personality === 'string') {
    const originalPersonality = card.personality;
    let newPersonality = card.personality;
    
    // 应用特定修正规则
    if (canonicalAttrs.corrections) {
      for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
        if (newPersonality.includes(wrong)) {
          newPersonality = newPersonality.replace(new RegExp(wrong, 'g'), correct);
          changes.push({
            field: 'personality',
            type: 'replace',
            wrong: wrong,
            correct: correct
          });
          modified = true;
        }
      }
    }
    
    card.personality = newPersonality;
  }
  
  // 4. 修正 background 字段
  if (card.background && typeof card.background === 'string') {
    const originalBackground = card.background;
    let newBackground = card.background;
    
    // 应用特定修正规则
    if (canonicalAttrs.corrections) {
      for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
        if (newBackground.includes(wrong)) {
          newBackground = newBackground.replace(new RegExp(wrong, 'g'), correct);
          changes.push({
            field: 'background',
            type: 'replace',
            wrong: wrong,
            correct: correct
          });
          modified = true;
        }
      }
    }
    
    card.background = newBackground;
  }
  
  // 5. 修正 relationships 字段
  if (card.relationships && typeof card.relationships === 'object') {
    for (const [key, value] of Object.entries(card.relationships)) {
      if (typeof value === 'string') {
        let newValue = value;
        
        // 应用特定修正规则
        if (canonicalAttrs.corrections) {
          for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
            if (newValue.includes(wrong)) {
              newValue = newValue.replace(new RegExp(wrong, 'g'), correct);
              changes.push({
                field: `relationships.${key}`,
                type: 'replace',
                wrong: wrong,
                correct: correct
              });
              modified = true;
            }
          }
        }
        
        card.relationships[key] = newValue;
      }
    }
  }
  
  // 6. 修正 hidden_facts 字段
  if (card.hidden_facts && Array.isArray(card.hidden_facts)) {
    for (const fact of card.hidden_facts) {
      if (fact.content && typeof fact.content === 'string') {
        let newContent = fact.content;
        
        // 应用特定修正规则
        if (canonicalAttrs.corrections) {
          for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
            if (newContent.includes(wrong)) {
              newContent = newContent.replace(new RegExp(wrong, 'g'), correct);
              changes.push({
                field: `hidden_facts.${fact.id}`,
                type: 'replace',
                wrong: wrong,
                correct: correct
              });
              modified = true;
            }
          }
        }
        
        fact.content = newContent;
      }
      
      if (fact.reveal_text && typeof fact.reveal_text === 'string') {
        let newRevealText = fact.reveal_text;
        
        // 应用特定修正规则
        if (canonicalAttrs.corrections) {
          for (const [wrong, correct] of Object.entries(canonicalAttrs.corrections)) {
            if (newRevealText.includes(wrong)) {
              newRevealText = newRevealText.replace(new RegExp(wrong, 'g'), correct);
              changes.push({
                field: `hidden_facts.${fact.id}.reveal_text`,
                type: 'replace',
                wrong: wrong,
                correct: correct
              });
              modified = true;
            }
          }
        }
        
        fact.reveal_text = newRevealText;
      }
    }
  }
  
  // 保存修改
  if (modified && !dryRun) {
    card.version = (card.version || 1) + 1;
    card.updated_at = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');
  }
  
  return {
    modified,
    changes,
    version: card.version || 1,
    dryRun
  };
}

/**
 * 获取所有角色卡文件
 */
function getAllCharacterFiles() {
  if (!fs.existsSync(CHARACTERS_DIR)) {
    return [];
  }
  return fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
}

/**
 * 批量智能修正
 */
async function intelligentFixAll(options = {}) {
  const {
    dryRun = false,
    worldbook = false
  } = options;
  
  writeLog('=== 开始智能角色卡修正 ===');
  writeLog(`参数: dryRun=${dryRun}, worldbook=${worldbook}`);
  
  // 初始化角色规范属性（从缓存加载）
  initializeCharacterAttributes();
  
  const characterFiles = getAllCharacterFiles();
  writeLog(`找到 ${characterFiles.length} 个角色卡文件`);
  
  const results = {
    totalFiles: characterFiles.length,
    modifiedFiles: 0,
    totalChanges: 0,
    details: []
  };
  
  for (const file of characterFiles) {
    const filePath = path.join(CHARACTERS_DIR, file);
    const characterName = extractCharacterName(filePath);
    
    // 检查是否有规范属性
    const canonicalAttrs = CHARACTER_CANONICAL_ATTRIBUTES[characterName];
    
    if (!canonicalAttrs) {
      writeLog(`  - ${file}: 无规范属性，跳过（可能是原创角色）`);
      continue;
    }
    
    writeLog(`  - ${file}: 使用规范属性进行修正...`);
    
    try {
      const result = intelligentFixCharacter(filePath, canonicalAttrs, dryRun);
      
      if (result.modified) {
        results.modifiedFiles++;
        results.totalChanges += result.changes.length;
        results.details.push({
          file: file,
          character: characterName,
          changes: result.changes,
          version: result.version
        });
        writeLog(`    修改了 ${result.changes.length} 处，版本号: ${result.version}`);
        
        // 输出详细修改
        for (const change of result.changes) {
          if (change.type === 'replace') {
            writeLog(`      [${change.field}] "${change.wrong}" → "${change.correct}"`);
          } else if (change.type === 'add') {
            writeLog(`      [${change.field}] 添加 "${change.value}"`);
          } else if (change.type === 'remove') {
            writeLog(`      [${change.field}] 移除 "${change.value}"`);
          }
        }
      } else {
        writeLog(`    无需修改`);
      }
    } catch (error) {
      writeLog(`    错误: ${error.message}`);
    }
  }
  
  writeLog(`=== 智能角色卡修正完成 ===`);
  writeLog(`总文件数: ${results.totalFiles}`);
  writeLog(`修改文件数: ${results.modifiedFiles}`);
  writeLog(`总修改数: ${results.totalChanges}`);
  
  return results;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    worldbook: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--worldbook' || arg === '-w') {
      options.worldbook = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
智能角色卡修正脚本
用法: node fix-all-from-novel.js [选项]

选项:
  -d, --dry-run    仅预览，不实际修改
  -w, --worldbook  同时修正世界书
  -h, --help       显示帮助信息

示例:
  node fix-all-from-novel.js
  node fix-all-from-novel.js --dry-run
      `);
      process.exit(0);
    }
  }
  
  await intelligentFixAll(options);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  intelligentFixAll,
  CHARACTER_CANONICAL_ATTRIBUTES
};
