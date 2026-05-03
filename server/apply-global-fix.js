/**
 * 批量全局替换脚本
 * 基于小说文件中的正确设定，对所有角色卡进行全字段扫描与替换
 */

const fs = require('fs');
const path = require('path');
const { globalReplaceInCard, triggerHotReload } = require('./character-corrector');

// 配置
const NOVEL_FILE = path.join(__dirname, '../Gu Zhen Ren - Gu Zhen Ren.txt');
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const WORLDBOOK_DIR = path.join(__dirname, '../worldbook');
const LOG_FILE = path.join(__dirname, '../logs/global-fix.log');

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
 * 从小说中提取角色正确设定
 */
function extractCharacterSettingsFromNovel(novelContent, characterName) {
  const settings = {
    name: characterName,
    titles: [],
    realm: null,
    description: null,
    relationships: [],
    aliases: []
  };

  // 提取称号（如"方源"、"蛊真人"、"尊者"等）
  const titlePatterns = [
    new RegExp(`${characterName}([，、。\\s]*是[\\s\\u4e00-\\u9fa5]+尊者)`, 'g'),
    new RegExp(`${characterName}([，、。\\s]*是[\\s\\u4e00-\\u9fa5]+仙尊)`, 'g'),
    new RegExp(`${characterName}([，、。\\s]*是[\\s\\u4e00-\\u9fa5]+仙子)`, 'g'),
    new RegExp(`${characterName}([，、。\\s]*是[\\s\\u4e00-\\u9fa5]+蛊仙)`, 'g'),
  ];

  for (const pattern of titlePatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.titles.push(...matches);
    }
  }

  // 提取境界（如"六转"、"七转"、"八转"、"蛊仙"等）
  const realmPatterns = [
    new RegExp(`${characterName}[，、。\\s]*是[\\s\\u4e00-\\u9fa5]*([一二三四五六七八九十]转[\\u4e00-\\u9fa5]*)`, 'g'),
    new RegExp(`${characterName}[，、。\\s]*修为[\\s\\u4e00-\\u9fa5]*([一二三四五六七八九十]转[\\u4e00-\\u9fa5]*)`, 'g'),
    new RegExp(`${characterName}[，、。\\s]*境界[\\s\\u4e00-\\u9fa5]*([一二三四五六七八九十]转[\\u4e00-\\u9fa5]*)`, 'g'),
  ];

  for (const pattern of realmPatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.realm = matches[0];
      break;
    }
  }

  // 提取别名
  const aliasPatterns = [
    new RegExp(`([\\u4e00-\\u9fa5]{2,4})[，、。\\s]*即[，、。\\s]*${characterName}`, 'g'),
    new RegExp(`${characterName}[，、。\\s]*又称[，、。\\s]*([\\u4e00-\\u9fa5]{2,4})`, 'g'),
  ];

  for (const pattern of aliasPatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.aliases.push(...matches);
    }
  }

  // 提取关系
  const relationshipPatterns = [
    new RegExp(`${characterName}[，、。\\s]*是[\\s\\u4e00-\\u9fa5]*([\\u4e00-\\u9fa5]{2,6})的([\\u4e00-\\u9fa5]{2,6})`, 'g'),
  ];

  for (const pattern of relationshipPatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.relationships.push(...matches);
    }
  }

  return settings;
}

/**
 * 从小说中提取世界书正确设定
 * 提取地名、势力名、事件名、物品名等
 */
function extractWorldbookSettingsFromNovel(novelContent, worldbookName) {
  const settings = {
    name: worldbookName,
    type: null,
    description: null,
    locations: [],
    forces: [],
    events: [],
    items: [],
    relatedCharacters: []
  };

  // 提取类型（福地、洞天、蛊屋等）
  const typePatterns = [
    new RegExp(`${worldbookName}[，、。\\s]*是[\\s\\u4e00-\\u9fa5]*([福地洞天蛊屋])`, 'g'),
    new RegExp(`${worldbookName}[，、。\\s]*属于[\\s\\u4e00-\\u9fa5]*([福地洞天蛊屋])`, 'g'),
  ];

  for (const pattern of typePatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.type = matches[0];
      break;
    }
  }

  // 提取相关角色
  const characterPatterns = [
    new RegExp(`${worldbookName}[，、。\\s]*中[\\s\\u4e00-\\u9fa5]*([\\u4e00-\\u9fa5]{2,4})`, 'g'),
    new RegExp(`([\\u4e00-\\u9fa5]{2,4})[，、。\\s]*在[\\s\\u4e00-\\u9fa5]*${worldbookName}`, 'g'),
  ];

  for (const pattern of characterPatterns) {
    const matches = novelContent.match(pattern);
    if (matches) {
      settings.relatedCharacters.push(...matches);
    }
  }

  return settings;
}

/**
 * 预定义的错误修正规则
 * 基于小说《蛊真人》的设定
 */
const CORRECTION_RULES = {
  // 境界修正
  '九转尊者': '蛊仙',
  '九转仙尊': '当代仙子',
  '九转蛊尊': '蛊仙',
  
  // 方源相关
  '方源是魔道蛊仙': '方源是中洲蛊仙',
  '方源是魔尊': '方源是蛊仙',
  
  // 赵怜云相关
  '赵怜云是九转尊者': '赵怜云是蛊仙',
  '赵怜云是九转仙尊': '赵怜云是当代仙子',
  
  // 其他常见错误
  '天庭之主': '天庭成员',
  '十大尊者': '尊者',
};

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
 * 获取所有世界书文件
 */
function getAllWorldbookFiles() {
  if (!fs.existsSync(WORLDBOOK_DIR)) {
    return [];
  }
  return fs.readdirSync(WORLDBOOK_DIR).filter(f => f.endsWith('.json'));
}

/**
 * 应用全局替换到单个文件
 */
async function applyGlobalReplaceToFile(filePath, rules, dryRun = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const card = JSON.parse(content);
  const characterName = card.name || path.basename(filePath, '.json');
  
  let modified = false;
  const changes = [];

  // 递归替换函数
  function replaceInObject(obj, path = '') {
    if (typeof obj === 'string') {
      let newStr = obj;
      for (const [wrong, correct] of Object.entries(rules)) {
        if (newStr.includes(wrong)) {
          newStr = newStr.replace(new RegExp(wrong, 'g'), correct);
          changes.push({
            field: path,
            wrong: wrong,
            correct: correct,
            original: obj,
            modified: newStr
          });
          modified = true;
        }
      }
      return newStr;
    } else if (Array.isArray(obj)) {
      return obj.map((item, index) => replaceInObject(item, path ? `${path}[${index}]` : `[${index}]`));
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {};
      for (const key in obj) {
        newObj[key] = replaceInObject(obj[key], path ? `${path}.${key}` : key);
      }
      return newObj;
    }
    return obj;
  }

  const newCard = replaceInObject(card);

  if (modified && !dryRun) {
    newCard.version = (newCard.version || 1) + 1;
    newCard.updated_at = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(newCard, null, 2), 'utf-8');
    writeLog(`修正文件: ${filePath}`);
  }

  return {
    modified,
    changes,
    version: newCard.version || 1,
    dryRun
  };
}

/**
 * 批量应用全局替换
 */
async function applyGlobalFix(options = {}) {
  const {
    character = null,  // 指定角色名，如 "方源"
    all = false,       // 修正所有角色卡
    dryRun = false,    // 仅预览，不实际修改
    worldbook = false  // 是否也修正世界书
  } = options;

  writeLog('=== 开始批量全局替换 ===');
  writeLog(`参数: character=${character}, all=${all}, dryRun=${dryRun}, worldbook=${worldbook}`);

  // 读取小说文件
  let novelContent = '';
  if (fs.existsSync(NOVEL_FILE)) {
    novelContent = fs.readFileSync(NOVEL_FILE, 'utf-8');
    writeLog(`已读取小说文件: ${NOVEL_FILE} (${novelContent.length} 字符)`);
  } else {
    writeLog(`警告: 小说文件不存在: ${NOVEL_FILE}`);
  }

  // 获取修正规则
  const rules = { ...CORRECTION_RULES };
  writeLog(`修正规则数量: ${Object.keys(rules).length}`);

  // 获取要处理的文件列表
  let filesToProcess = [];

  if (character) {
    // 处理指定角色
    const characterFile = `角色卡_${character}.json`;
    const filePath = path.join(CHARACTERS_DIR, characterFile);
    if (fs.existsSync(filePath)) {
      filesToProcess.push(filePath);
    } else {
      writeLog(`错误: 角色卡文件不存在: ${filePath}`);
      return;
    }
  } else if (all) {
    // 处理所有角色卡
    const characterFiles = getAllCharacterFiles();
    filesToProcess = characterFiles.map(f => path.join(CHARACTERS_DIR, f));
    writeLog(`将处理 ${filesToProcess.length} 个角色卡文件`);
  }

  if (worldbook) {
    const worldbookFiles = getAllWorldbookFiles();
    const worldbookPaths = worldbookFiles.map(f => path.join(WORLDBOOK_DIR, f));
    filesToProcess = filesToProcess.concat(worldbookPaths);
    writeLog(`将处理 ${worldbookPaths.length} 个世界书文件`);
  }

  // 应用修正
  const results = {
    totalFiles: filesToProcess.length,
    modifiedFiles: 0,
    totalChanges: 0,
    details: []
  };

  for (const filePath of filesToProcess) {
    try {
      const result = await applyGlobalReplaceToFile(filePath, rules, dryRun);
      
      if (result.modified) {
        results.modifiedFiles++;
        results.totalChanges += result.changes.length;
        results.details.push({
          file: filePath,
          changes: result.changes,
          version: result.version
        });
        writeLog(`  - ${path.basename(filePath)}: 修改了 ${result.changes.length} 处，版本号: ${result.version}`);
        
        // 输出详细修改
        for (const change of result.changes) {
          writeLog(`    [${change.field}] "${change.wrong}" → "${change.correct}"`);
        }
      } else {
        writeLog(`  - ${path.basename(filePath)}: 无需修改`);
      }
    } catch (error) {
      writeLog(`错误: 处理文件失败 ${filePath}: ${error.message}`);
    }
  }

  writeLog(`=== 批量全局替换完成 ===`);
  writeLog(`总文件数: ${results.totalFiles}`);
  writeLog(`修改文件数: ${results.modifiedFiles}`);
  writeLog(`总修改数: ${results.totalChanges}`);

  // 如果有修改且不是预览模式，触发热更新
  if (results.modifiedFiles > 0 && !dryRun) {
    writeLog('触发热更新...');
    try {
      await triggerHotReload();
      writeLog('热更新成功');
    } catch (error) {
      writeLog(`热更新失败: ${error.message}`);
    }
  }

  return results;
}

/**
 * 命令行入口
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    character: null,
    all: false,
    dryRun: false,
    worldbook: false
  };

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--character' || arg === '-c') {
      options.character = args[++i];
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--worldbook' || arg === '-w') {
      options.worldbook = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
批量全局替换脚本
用法: node apply-global-fix.js [选项]

选项:
  -c, --character <name>  仅修正指定角色卡（如: 方源）
  -a, --all               修正所有角色卡
  -w, --worldbook         同时修正世界书
  -d, --dry-run           仅预览，不实际修改
  -h, --help              显示帮助信息

示例:
  node apply-global-fix.js --character=方源
  node apply-global-fix.js --all
  node apply-global-fix.js --all --dry-run
  node apply-global-fix.js --character=方源 --worldbook
      `);
      process.exit(0);
    }
  }

  // 验证参数
  if (!options.character && !options.all) {
    console.error('错误: 必须指定 --character 或 --all');
    console.error('使用 --help 查看帮助信息');
    process.exit(1);
  }

  // 执行批量替换
  await applyGlobalFix(options);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  applyGlobalFix,
  extractCharacterSettingsFromNovel,
  extractWorldbookSettingsFromNovel,
  CORRECTION_RULES
};
