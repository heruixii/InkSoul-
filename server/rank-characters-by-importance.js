/**
 * Rank Characters by Importance
 * 根据小说中角色的重要性进行排名
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/novels');
const NOVEL_ID = 'gu_zhen_ren___gu_zhen_ren';
const CHARACTER_CACHE_FILE = path.join(DATA_DIR, NOVEL_ID, 'character_attributes_cache.json');
const EVENTS_FILE = path.join(DATA_DIR, NOVEL_ID, 'events.json');
const RELATIONSHIPS_FILE = path.join(DATA_DIR, NOVEL_ID, 'relationships.json');

/**
 * 通用角色重要性分数计算（基于名字出现频率）
 * 适用于所有小说，主要考虑事件出现次数
 */
function calculateImportanceScoreGeneric(character, events, relationships) {
  let score = 0;
  
  // 1. 根据事件出现次数加分（主要权重）
  const eventCount = events.filter(e => 
    e.characters && e.characters.includes(character.name)
  ).length;
  score += eventCount * 10;
  
  // 2. 根据关系数量加分
  const relationshipCount = relationships.filter(r => 
    r.character1 === character.name || r.character2 === character.name
  ).length;
  score += relationshipCount * 5;
  
  // 3. 根据描述长度加分（最多10分）
  if (character.description) {
    score += Math.min(character.description.length / 50, 10);
  }
  
  return Math.round(score);
}

/**
 * 蛊真人专用角色重要性分数计算
 * 包含特殊角色加分（天庭三公、十大尊者等）
 */
function calculateImportanceScoreGuZhenRen(character, events, relationships) {
  let score = 0;
  
  // 1. 根据境界加分（修复逻辑：先检查转数，再检查是否是蛊仙）
  if (character.realm && typeof character.realm === 'string') {
    const realm = character.realm;
    if (realm.includes('九转')) score += 25;
    else if (realm.includes('八转')) score += 20;
    else if (realm.includes('七转')) score += 15;
    else if (realm.includes('六转')) score += 10;
    else if (realm.includes('五转')) score += 8;
    else if (realm.includes('四转')) score += 6;
    else if (realm.includes('三转')) score += 4;
    else if (realm.includes('二转')) score += 2;
    else if (realm.includes('一转')) score += 1;
    else if (realm.includes('仙')) score += 30; // 蛊仙但未明确转数
  }
  
  // 2. 根据描述长度加分（降低权重，最多15分）
  if (character.description) {
    score += Math.min(character.description.length / 50, 15);
  }
  
  // 3. 根据事件出现次数加分（提高权重）
  const eventCount = events.filter(e => 
    e.characters && e.characters.includes(character.name)
  ).length;
  score += eventCount * 10;
  
  // 4. 根据关系数量加分（提高权重）
  const relationshipCount = relationships.filter(r => 
    r.character1 === character.name || r.character2 === character.name
  ).length;
  score += relationshipCount * 5;
  
  // 5. 特殊角色加分
  const specialCharacters = ['方源', '古月方源'];
  if (specialCharacters.includes(character.name)) {
    score += 500;
  }
  
  // 6. 天庭三公加分（龙公、眉公、铜公）
  const tiantingSangong = ['龙公', '眉公', '铜公'];
  if (tiantingSangong.includes(character.name)) {
    score += 300;
  }
  
  // 7. 十大尊者加分
  const shidaZunzhe = ['巨阳仙尊', '幽魂魔尊', '红莲魔尊', '灵缘仙尊', '星宿仙尊', 
                       '无极魔尊', '盗天魔尊', '元始仙尊', '大爱仙尊', '黄庭老祖'];
  if (shidaZunzhe.includes(character.name)) {
    score += 250;
  }
  
  // 8. 霸仙加分
  if (character.description && character.description.includes('霸仙')) {
    score += 150;
  }
  
  // 9. 仙尊级别加分
  if (character.realm && typeof character.realm === 'string' && character.realm.includes('仙尊')) {
    score += 200;
  }
  
  // 10. 魔尊加分
  if (character.realm && typeof character.realm === 'string' && character.realm.includes('魔尊')) {
    score += 200;
  }
  
  // 11. 太上长老/家老加分
  if (character.description && (character.description.includes('太上长老') || 
      character.description.includes('家老') || 
      character.description.includes('太上'))) {
    score += 100;
  }
  
  return Math.round(score);
}

/**
 * 计算角色重要性分数（根据小说ID自动选择算法）
 */
function calculateImportanceScore(character, events, relationships, novelId) {
  // 蛊真人小说使用专用算法
  if (novelId === 'gu_zhen_ren___gu_zhen_ren') {
    return calculateImportanceScoreGuZhenRen(character, events, relationships);
  }
  // 其他小说使用通用算法
  return calculateImportanceScoreGeneric(character, events, relationships);
}

/**
 * 主函数
 */
function main() {
  console.log('正在读取角色数据...');
  
  if (!fs.existsSync(CHARACTER_CACHE_FILE)) {
    console.error('错误: character_attributes_cache.json 不存在');
    process.exit(1);
  }
  
  const characterCache = JSON.parse(fs.readFileSync(CHARACTER_CACHE_FILE, 'utf8'));
  const characters = Object.values(characterCache);
  
  // 读取事件数据
  let events = [];
  if (fs.existsSync(EVENTS_FILE)) {
    const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
    events = eventsData.events || [];
  }
  
  // 读取关系数据
  let relationships = [];
  if (fs.existsSync(RELATIONSHIPS_FILE)) {
    const relationshipsData = JSON.parse(fs.readFileSync(RELATIONSHIPS_FILE, 'utf8'));
    relationships = relationshipsData.relationships || [];
  }
  
  console.log(`共读取 ${characters.length} 个角色`);
  console.log(`共读取 ${events.length} 个事件`);
  
  // 计算每个角色的重要性分数
  const characterScores = characters.map(char => ({
    name: char.name,
    realm: char.realm,
    description: char.description,
    score: calculateImportanceScore(char, events, relationships, NOVEL_ID)
  }));
  
  // 按分数排序
  characterScores.sort((a, b) => b.score - a.score);
  
  console.log('\n=== 按重要性排名的角色（前20）===\n');
  characterScores.slice(0, 20).forEach((char, index) => {
    console.log(`${index + 1}. ${char.name} (分数: ${char.score})`);
    console.log(`   境界: ${char.realm || '未知'}`);
    console.log(`   描述: ${char.description || '无'}`);
    console.log('');
  });
  
  // 输出前10个角色名称，用于复制到控制面板
  console.log('=== 前10个重点角色（用于控制面板）===');
  const top10 = characterScores.slice(0, 10).map(c => c.name).join(', ');
  console.log(top10);
  
  // 保存排名结果
  const outputPath = path.join(DATA_DIR, NOVEL_ID, 'character_importance_ranking.json');
  const output = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    totalCharacters: characters.length,
    rankings: characterScores
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ 排名结果已保存到: ${outputPath}`);
}

main();
