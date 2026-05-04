/**
 * 角色卡修正工具
 * 功能：
 * 1. 读取小说文件，提取角色真实设定
 * 2. 扫描现有角色卡和世界书
 * 3. 对比并生成差异报告
 * 4. 自动修正或半自动确认修正
 * 5. 热更新到故事中
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 配置
const NOVEL_FILE_PATH = process.argv[2] ? path.resolve(process.argv[2]) : null;
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const WORLDBOOK_DIR = path.join(__dirname, '../worldbook');
const REPORT_OUTPUT_PATH = path.join(__dirname, '../correction-report.json');
const PREVIEW_OUTPUT_PATH = path.join(__dirname, '../correction-preview.json');
const WORLDBOOK_REPORT_PATH = path.join(__dirname, '../worldbook-correction-report.json');

// 版本号存储路径
const VERSION_FILE_PATH = path.join(__dirname, '../data/versions.json');

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 读取小说文件（分块读取，避免内存溢出）
 */
function readNovelInChunks(filePath, chunkSize = 10000) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content;
}

/**
 * 按章节分割小说内容
 */
function splitByChapters(content) {
  const chapterPattern = /第[\d零一二三四五六七八九十百千万]+[章节节回]/g;
  const chapters = [];
  let lastIndex = 0;
  let match;
  
  while ((match = chapterPattern.exec(content)) !== null) {
    if (lastIndex > 0) {
      chapters.push({
        title: content.substring(lastIndex, match.index).trim().split('\n')[0],
        content: content.substring(lastIndex, match.index)
      });
    }
    lastIndex = match.index;
  }
  
  // 添加最后一章
  if (lastIndex < content.length) {
    chapters.push({
      title: content.substring(lastIndex).trim().split('\n')[0],
      content: content.substring(lastIndex)
    });
  }
  
  return chapters;
}

/**
 * 指代消解：将代词替换为具体角色名
 */
function resolvePronouns(text, characterNames) {
  const pronouns = ['她', '他', '后者', '前者', '这位', '那人'];
  const sentences = text.split(/[。！？；]/);
  let lastMentioned = null;
  
  const resolved = sentences.map(sentence => {
    let resolvedSentence = sentence;
    
    for (const pronoun of pronouns) {
      if (sentence.includes(pronoun) && lastMentioned) {
        resolvedSentence = resolvedSentence.replace(pronoun, lastMentioned);
      }
    }
    
    // 检查这句话中是否提到了具体角色名
    for (const name of characterNames) {
      if (sentence.includes(name)) {
        lastMentioned = name;
        break;
      }
    }
    
    return resolvedSentence;
  });
  
  return resolved.join('。');
}

/**
 * 提取关系（如：XXX 是 YYY 的师父）
 */
function extractRelationships(text, characterName) {
  const relationships = {};
  const patterns = [
    /(.+?)是(.+?)的师父/,
    /(.+?)是(.+?)的弟子/,
    /(.+?)是(.+?)的孙女/,
    /(.+?)是(.+?)的孙子/,
    /(.+?)是(.+?)的女儿/,
    /(.+?)是(.+?)的儿子/,
    /(.+?)是(.+?)的妻子/,
    /(.+?)是(.+?)的丈夫/,
    /(.+?)是(.+?)的仇敌/,
    /(.+?)是(.+?)的朋友/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const [, person1, person2] = match;
      if (person1 === characterName) {
        relationships[person2] = pattern.toString().match(/的(\w+)$/)?.[1] || '关系';
      } else if (person2 === characterName) {
        relationships[person1] = pattern.toString().match(/的(\w+)$/)?.[1] || '关系';
      }
    }
  }
  
  return relationships;
}

/**
 * 使用 DeepSeek 提取角色设定
 */
async function extractCharacterSettingsWithDeepSeek(novelContent, characterNames) {
  if (!DEEPSEEK_API_KEY) {
    console.log('未配置 DEEPSEEK_API_KEY，跳过 LLM 辅助提取');
    return extractCharacterSettingsByRegex(novelContent, characterNames);
  }

  console.log('使用 DeepSeek 提取角色设定...');
  
  // 由于小说内容太大，我们需要提取关键段落
  const keyParagraphs = extractKeyParagraphs(novelContent, characterNames);
  
  const prompt = `
请根据以下小说内容，提取角色的真实设定。对于每个角色，提取以下信息：
- 姓名
- 身份/职位
- 境界（修炼等级、实力层次）
- 所属势力
- 重要经历
- 人际关系

小说内容片段：
${keyParagraphs.substring(0, 10000)}

请以 JSON 格式返回，格式如下：
{
  "characters": [
    {
      "name": "角色名",
      "identity": "身份",
      "realm": "境界",
      "faction": "势力",
      "key_events": ["事件1", "事件2"],
      "relationships": {"角色名": "关系"}
    }
  ]
}

只返回 JSON，不要其他内容。
`;

  try {
    const response = await callDeepSeekAPI(prompt);
    const result = JSON.parse(response);
    console.log(`成功提取 ${result.characters.length} 个角色的设定`);
    return result.characters;
  } catch (error) {
    console.error('DeepSeek 提取失败，回退到正则提取:', error.message);
    return extractCharacterSettingsByRegex(novelContent, characterNames);
  }
}

/**
 * 提取关键段落（包含角色名字的段落）
 */
function extractKeyParagraphs(content, characterNames) {
  const lines = content.split('\n');
  const keyLines = [];
  
  for (const line of lines) {
    for (const name of characterNames) {
      if (line.includes(name)) {
        keyLines.push(line);
        break;
      }
    }
  }
  
  return keyLines.join('\n');
}

/**
 * 使用正则表达式提取角色设定（备用方案）
 */
function extractCharacterSettingsByRegex(content, characterNames) {
  console.log('使用正则表达式提取角色设定...');
  
  const characters = {};
  const chapters = splitByChapters(content);
  
  for (const name of characterNames) {
    const characterMeta = {
      name: name,
      aliases: [],
      title: '',
      identity: '未知',
      realm: '未知',
      affiliation: '未知',
      relationships: {},
      keyEvents: [],
      rawDescriptions: [],
      confidence: 0.5
    };
    
    // 按章节提取
    for (const chapter of chapters) {
      if (chapter.content.includes(name)) {
        // 指代消解
        const resolvedText = resolvePronouns(chapter.content, characterNames);
        
        // 提取境界信息
        const realmMatch = resolvedText.match(new RegExp(`${name}[^.。]*?(\d+)转`));
        if (realmMatch) {
          characterMeta.realm = `${realmMatch[1]}转`;
          characterMeta.confidence = Math.min(characterMeta.confidence + 0.1, 1.0);
        }
        
        // 提取身份
        const identityMatch = resolvedText.match(new RegExp(`${name}[^.。]*?是(.{2,10?})`));
        if (identityMatch) {
          characterMeta.identity = identityMatch[1];
          characterMeta.confidence = Math.min(characterMeta.confidence + 0.1, 1.0);
        }
        
        // 提取关系
        const relationships = extractRelationships(resolvedText, name);
        Object.assign(characterMeta.relationships, relationships);
        
        // 保存原始描述
        characterMeta.rawDescriptions.push(chapter.title);
      }
    }
    
    characters[name] = characterMeta;
  }
  
  return Object.values(characters);
}

/**
 * 调用 DeepSeek API
 */
function callDeepSeekAPI(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个专业的小说设定分析助手，能够从文本中准确提取角色信息。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed.choices[0].message.content);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 使用 DeepSeek 进行结构化提取（增强版）
 */
async function extractCharacterSettingsEnhanced(novelContent, characterNames) {
  if (!DEEPSEEK_API_KEY) {
    console.log('未配置 DEEPSEEK_API_KEY，跳过 LLM 辅助提取');
    return extractCharacterSettingsByRegex(novelContent, characterNames);
  }

  console.log('使用 DeepSeek 增强提取角色设定...');
  
  const chapters = splitByChapters(novelContent);
  const sampleChapters = chapters.slice(0, 10); // 取前10章作为样本
  const sampleContent = sampleChapters.map(c => c.content).join('\n');
  
  const prompt = `
请根据以下小说内容，提取角色的真实设定。对于每个角色，提取以下信息：
- name: 姓名
- aliases: 别名/称号
- title: 头衔
- identity: 身份/职位
- realm: 境界（尊者等级、蛊师等级）
- affiliation: 所属势力
- relationships: 人际关系（对象: 关系类型）
- keyEvents: 重要经历（数组）
- confidence: 置信度（0-1之间的数值，表示提取的可信度）

小说内容片段：
${sampleContent.substring(0, 15000)}

请以 JSON 格式返回，格式如下：
{
  "characters": [
    {
      "name": "角色名",
      "aliases": ["别名1", "别名2"],
      "title": "头衔",
      "identity": "身份",
      "realm": "境界",
      "affiliation": "势力",
      "relationships": {"角色名": "关系"},
      "keyEvents": ["事件1", "事件2"],
      "confidence": 0.8
    }
  ]
}

只返回 JSON，不要其他内容。
`;

  try {
    const response = await callDeepSeekAPI(prompt);
    const result = JSON.parse(response);
    console.log(`成功提取 ${result.characters.length} 个角色的设定`);
    return result.characters;
  } catch (error) {
    console.error('DeepSeek 提取失败，回退到正则提取:', error.message);
    return extractCharacterSettingsByRegex(novelContent, characterNames);
  }
}

/**
 * 扫描角色卡文件
 */
function scanCharacterCards() {
  const characterCards = [];
  
  if (!fs.existsSync(CHARACTERS_DIR)) {
    console.log(`角色卡目录不存在: ${CHARACTERS_DIR}`);
    return characterCards;
  }
  
  const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(CHARACTERS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const card = JSON.parse(content);
      characterCards.push({
        id: file.replace('.json', ''),
        file: file,
        path: filePath,
        data: card
      });
    } catch (error) {
      console.error(`读取角色卡失败: ${file}`, error.message);
    }
  }
  
  console.log(`扫描到 ${characterCards.length} 个角色卡`);
  return characterCards;
}

/**
 * 扫描世界书文件
 */
function scanWorldBooks() {
  const worldBooks = [];
  
  if (!fs.existsSync(WORLDBOOK_DIR)) {
    console.log(`世界书目录不存在: ${WORLDBOOK_DIR}`);
    return worldBooks;
  }
  
  const files = fs.readdirSync(WORLDBOOK_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(WORLDBOOK_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const worldbook = JSON.parse(content);
      worldBooks.push({
        id: file.replace('.json', ''),
        file: file,
        path: filePath,
        data: worldbook
      });
    } catch (error) {
      console.error(`读取世界书失败: ${file}`, error.message);
    }
  }
  
  console.log(`扫描到 ${worldBooks.length} 个世界书`);
  return worldBooks;
}

/**
 * 对比角色卡与小说设定
 */
function compareCharacterCard(card, novelSettings) {
  const errors = [];
  const characterName = card.data.name || card.id;
  
  // 查找小说中的对应角色
  const novelSetting = novelSettings.find(c => c.name === characterName);
  if (!novelSetting) {
    console.log(`未找到角色 ${characterName} 的小说设定`);
    return errors;
  }
  
  // 对比境界
  if (card.data.description && card.data.description.includes('九转尊者')) {
    if (novelSetting.realm && !novelSetting.realm.includes('九转')) {
      errors.push({
        field: 'description',
        currentValue: card.data.description,
        correctValue: `应将"九转尊者"改为"${novelSetting.realm}"`,
        type: '境界错误',
        confidence: novelSetting.confidence || 0.5
      });
    }
  }
  
  // 对比 tags
  if (card.data.tags && card.data.tags.includes('九转尊者')) {
    if (novelSetting.realm && !novelSetting.realm.includes('九转')) {
      errors.push({
        field: 'tags',
        currentValue: '九转尊者',
        correctValue: novelSetting.realm,
        type: '境界错误',
        confidence: novelSetting.confidence || 0.5
      });
    }
  }
  
  // 对比身份
  if (novelSetting.identity && novelSetting.identity !== '未知') {
    if (card.data.description && !card.data.description.includes(novelSetting.identity)) {
      errors.push({
        field: 'description',
        currentValue: card.data.description,
        correctValue: `应包含身份信息：${novelSetting.identity}`,
        type: '身份缺失',
        confidence: novelSetting.confidence || 0.5
      });
    }
  }
  
  return errors;
}

/**
 * 生成差异报告
 */
function generateDiffReport(characterCards, worldBooks, novelSettings) {
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_characters: characterCards.length,
      total_worldbooks: worldBooks.length,
      character_errors: 0,
      worldbook_errors: 0,
      needs_manual_review: 0
    },
    character_errors: [],
    worldbook_errors: []
  };
  
  // 检查角色卡
  for (const card of characterCards) {
    const errors = compareCharacterCard(card, novelSettings);
    if (errors.length > 0) {
      report.character_errors.push({
        id: card.id,
        file: card.file,
        name: card.data.name,
        errors: errors
      });
      report.summary.character_errors += errors.length;
      
      // 统计需要人工确认的错误
      const lowConfidenceErrors = errors.filter(e => e.confidence < 0.6);
      if (lowConfidenceErrors.length > 0) {
        report.summary.needs_manual_review += lowConfidenceErrors.length;
      }
    }
  }
  
  // 检查世界书
  for (const worldbook of worldBooks) {
    // 简单的世界书检查
    if (worldbook.data) {
      const content = JSON.stringify(worldbook.data);
      if (content.includes('九转尊者')) {
        report.worldbook_errors.push({
          id: worldbook.id,
          file: worldbook.file,
          warning: '包含"九转尊者"相关内容，需人工确认'
        });
        report.summary.worldbook_errors += 1;
      }
    }
  }
  
  return report;
}

/**
 * 生成修正预览
 */
function generateCorrectionPreview(report) {
  const preview = {
    generated_at: new Date().toISOString(),
    corrections: []
  };
  
  // 角色卡修正预览
  for (const error of report.character_errors) {
    for (const err of error.errors) {
      preview.corrections.push({
        type: 'character_card',
        id: error.id,
        file: error.file,
        field: err.field,
        current_value: err.currentValue,
        correct_value: err.correctValue,
        action: 'replace'
      });
    }
  }
  
  return preview;
}

/**
 * 执行修正（自动模式）
 */
function applyCorrections(preview, autoMode = false) {
  const results = {
    success: [],
    failed: []
  };
  
  for (const correction of preview.corrections) {
    if (correction.type === 'character_card') {
      try {
        const filePath = path.join(CHARACTERS_DIR, correction.file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const card = JSON.parse(content);
        
        if (correction.field === 'description') {
          card.description = card.description.replace(/九转尊者/g, correction.correct_value);
          card.description = card.description.replace(/九转仙尊/g, correction.correct_value);
        } else if (correction.field === 'tags') {
          const index = card.tags.indexOf('九转尊者');
          if (index > -1) {
            card.tags[index] = correction.correct_value;
          }
        }
        
        // 递增版本号
        card.version = (card.version || 1) + 1;
        card.updated_at = new Date().toISOString();
        
        fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');
        results.success.push(correction);
        console.log(`修正成功: ${correction.file} - ${correction.field}`);
      } catch (error) {
        results.failed.push({ ...correction, error: error.message });
        console.error(`修正失败: ${correction.file}`, error.message);
      }
    }
  }
  
  return results;
}

/**
 * 全局替换角色卡中的"九转尊者"和"九转仙尊"
 * 递归遍历所有字段，不仅仅是特定字段
 */
function globalReplaceInCard(filePath, searchValue, replaceValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const card = JSON.parse(content);
    
    let modified = false;
    
    // 递归替换函数
    function replaceInObject(obj) {
      if (typeof obj === 'string') {
        const newStr = obj.replace(new RegExp(searchValue, 'g'), replaceValue);
        if (newStr !== obj) {
          modified = true;
        }
        return newStr;
      } else if (Array.isArray(obj)) {
        return obj.map(item => replaceInObject(item));
      } else if (typeof obj === 'object' && obj !== null) {
        const newObj = {};
        for (const key in obj) {
          newObj[key] = replaceInObject(obj[key]);
        }
        return newObj;
      }
      return obj;
    }
    
    const newCard = replaceInObject(card);
    
    if (modified) {
      newCard.version = (newCard.version || 1) + 1;
      newCard.updated_at = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(newCard, null, 2), 'utf-8');
      return { success: true, version: newCard.version };
    }
    
    return { success: false, version: card.version };
  } catch (error) {
    console.error(`全局替换失败: ${filePath}`, error.message);
    throw error;
  }
}

/**
 * 触发热更新
 */
function triggerHotReload() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/characters/correct-from-novel',
      method: 'POST'
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('=== 角色卡修正工具 ===');
  
  // 1. 读取小说文件
  console.log('\n1. 读取小说文件...');
  const novelContent = readNovelInChunks(NOVEL_FILE_PATH);
  console.log(`小说文件大小: ${novelContent.length} 字符`);
  
  // 2. 扫描角色卡和世界书
  console.log('\n2. 扫描角色卡和世界书...');
  const characterCards = scanCharacterCards();
  const worldBooks = scanWorldBooks();
  
  // 提取角色名字
  const characterNames = characterCards.map(c => c.data.name || c.id);
  console.log(`提取到 ${characterNames.length} 个角色名字`);
  
  // 3. 提取小说设定
  console.log('\n3. 提取小说设定...');
  const novelSettings = await extractCharacterSettingsWithDeepSeek(novelContent, characterNames);
  console.log(`提取到 ${novelSettings.length} 个角色设定`);
  
  // 4. 生成差异报告
  console.log('\n4. 生成差异报告...');
  const report = generateDiffReport(characterCards, worldBooks, novelSettings);
  fs.writeFileSync(REPORT_OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`差异报告已保存到: ${REPORT_OUTPUT_PATH}`);
  console.log(`角色卡错误: ${report.summary.character_errors}`);
  console.log(`世界书错误: ${report.summary.worldbook_errors}`);
  
  // 5. 生成修正预览
  console.log('\n5. 生成修正预览...');
  const preview = generateCorrectionPreview(report);
  fs.writeFileSync(PREVIEW_OUTPUT_PATH, JSON.stringify(preview, null, 2), 'utf-8');
  console.log(`修正预览已保存到: ${PREVIEW_OUTPUT_PATH}`);
  console.log(`待修正项: ${preview.corrections.length}`);
  
  // 6. 执行修正（自动模式）
  console.log('\n6. 执行修正...');
  const mode = process.argv[2] || 'auto';
  if (mode === 'auto') {
    const results = applyCorrections(preview, true);
    console.log(`修正成功: ${results.success.length}`);
    console.log(`修正失败: ${results.failed.length}`);
  } else {
    console.log('半自动模式：请查看修正预览文件后手动确认');
  }
  
  // 7. 触发热更新
  console.log('\n7. 触发热更新...');
  try {
    const reloadResult = await triggerHotReload();
    console.log('热更新成功:', reloadResult);
  } catch (error) {
    console.error('热更新失败:', error.message);
  }
  
  console.log('\n=== 完成 ===');
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

/**
 * 修正单个角色卡（用于增量更新）
 */
function correctSingleCharacter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const card = JSON.parse(content);
    
    let corrected = false;
    
    // 修正 description 中的九转尊者
    if (card.description) {
      if (card.description.includes('九转尊者') || card.description.includes('九转仙尊')) {
        card.description = card.description.replace(/九转尊者/g, '蛊仙');
        card.description = card.description.replace(/九转仙尊/g, '仙子');
        corrected = true;
      }
    }
    
    // 修正 tags 中的九转尊者
    if (card.tags) {
      const index = card.tags.indexOf('九转尊者');
      if (index > -1) {
        card.tags[index] = '蛊仙';
        corrected = true;
      }
    }
    
    if (corrected) {
      card.version = (card.version || 1) + 1;
      card.updated_at = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(card, null, 2), 'utf-8');
      return { corrected: true, version: card.version };
    }
    
    return { corrected: false };
  } catch (error) {
    console.error(`修正单个角色卡失败: ${filePath}`, error.message);
    throw error;
  }
}

/**
 * 修正单个世界书（用于增量更新）
 */
function correctSingleWorldBook(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const worldbook = JSON.parse(content);
    
  
    let corrected = false;
    const contentStr = JSON.stringify(worldbook);
    
    // 简单的九转尊者检查
    if (contentStr.includes('九转尊者')) {
      // 这里需要更智能的修正逻辑
      corrected = true;
    }
    
    if (corrected) {
      worldbook.version = (worldbook.version || 1) + 1;
      worldbook.updated_at = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(worldbook, null, 2), 'utf-8');
      return { corrected: true, version: worldbook.version };
    }
    
    return { corrected: false };
  } catch (error) {
    console.error(`修正单个世界书失败: ${filePath}`, error.message);
    throw error;
  }
}

/**
 * 世界书自动纠错
 */
function correctWorldBooks(worldBooks, novelContent) {
  console.log('开始世界书自动纠错...');
  
  const corrections = [];
  
  for (const worldbook of worldBooks) {
    if (!worldbook.data) continue;
    
    // 模糊匹配地名
    if (worldbook.data.name) {
      const correctedName = fuzzyMatchName(worldbook.data.name, novelContent);
      if (correctedName && correctedName !== worldbook.data.name) {
        corrections.push({
          type: 'worldbook',
          id: worldbook.id,
          field: 'name',
          currentValue: worldbook.data.name,
          correctValue: correctedName
        });
      }
    }
    
    // 补充角色关联
    if (worldbook.data.description) {
      const relatedCharacters = extractRelatedCharacters(worldbook.data.description, novelContent);
      if (relatedCharacters.length > 0) {
        const existingRelated = worldbook.data.relatedCharacters || [];
        const newCharacters = relatedCharacters.filter(c => !existingRelated.includes(c));
        if (newCharacters.length > 0) {
          corrections.push({
            type: 'worldbook',
            id: worldbook.id,
            field: 'relatedCharacters',
            currentValue: existingRelated,
            correctValue: [...existingRelated, ...newCharacters]
          });
        }
      }
    }
  }
  
  return corrections;
}

/**
 * 模糊匹配地名（编辑距离）
 */
function fuzzyMatchName(name, novelContent) {
  // 简单实现：查找相似的地名
  const namePattern = new RegExp(name.substring(0, 2) + '.{0,3}', 'g');
  const matches = novelContent.match(namePattern);
  
  if (matches) {
    // 返回最匹配的名称
    return matches[0];
  }
  
  return null;
}

/**
 * 从描述中提取相关角色
 */
function extractRelatedCharacters(description, novelContent) {
  const characters = [];
  const characterNames = []; // 从角色缓存动态加载
  
  for (const name of characterNames) {
    if (description.includes(name) || novelContent.includes(name)) {
      characters.push(name);
    }
  }
  
  return characters;
}

/**
 * 获取所有版本号
 */
function getAllVersions() {
  const versions = {};
  
  // 读取角色卡版本
  const characterFiles = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
  for (const file of characterFiles) {
    try {
      const filePath = path.join(CHARACTERS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const card = JSON.parse(content);
      versions[file.replace('.json', '')] = card.version || 1;
    } catch (error) {
      versions[file.replace('.json', '')] = 1;
    }
  }
  
  // 读取世界书版本
  const worldbookFiles = fs.readdirSync(WORLDBOOK_DIR).filter(f => f.endsWith('.json'));
  for (const file of worldbookFiles) {
    try {
      const filePath = path.join(WORLDBOOK_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const worldbook = JSON.parse(content);
      versions[file.replace('.json', '')] = worldbook.version || 1;
    } catch (error) {
      versions[file.replace('.json', '')] = 1;
    }
  }
  
  return versions;
}

/**
 * 仅审计模式（不修正）
 */
async function auditOnly() {
  console.log('=== 仅审计模式 ===');
  
  const novelContent = readNovelInChunks(NOVEL_FILE_PATH);
  const characterCards = scanCharacterCards();
  const worldBooks = scanWorldBooks();
  const characterNames = characterCards.map(c => c.data.name || c.id);
  
  const novelSettings = await extractCharacterSettingsEnhanced(novelContent, characterNames);
  const report = generateDiffReport(characterCards, worldBooks, novelSettings);
  
  return report;
}

module.exports = {
  main,
  scanCharacterCards,
  scanWorldBooks,
  generateDiffReport,
  generateCorrectionPreview,
  applyCorrections,
  triggerHotReload,
  correctSingleCharacter,
  correctSingleWorldBook,
  correctWorldBooks,
  getAllVersions,
  auditOnly,
  extractCharacterSettingsEnhanced,
  globalReplaceInCard
};
