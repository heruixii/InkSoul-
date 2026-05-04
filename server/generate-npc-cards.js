/**
 * Generate NPC Cards from Character Cache
 * 从角色缓存生成 NPC 卡片文件
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/novels');
const NOVEL_ID = process.argv[2] || 'gu_zhen_ren';
const CHARACTER_CACHE_FILE = path.join(DATA_DIR, NOVEL_ID, 'character_attributes_cache.json');
const NPC_DIR = path.join(DATA_DIR, NOVEL_ID, 'characters', 'npc');

/**
 * 主函数
 */
function main() {
  console.log('正在读取角色缓存...');
  
  if (!fs.existsSync(CHARACTER_CACHE_FILE)) {
    console.error('错误: character_attributes_cache.json 不存在');
    process.exit(1);
  }
  
  // 确保目录存在
  if (!fs.existsSync(NPC_DIR)) {
    fs.mkdirSync(NPC_DIR, { recursive: true });
  }
  
  const characterCache = JSON.parse(fs.readFileSync(CHARACTER_CACHE_FILE, 'utf8'));
  const characters = Object.values(characterCache);
  
  console.log(`共读取 ${characters.length} 个角色`);
  
  let npcCount = 0;
  
  for (const char of characters) {
    if (!char.name) continue;
    
    // 跳过主角（由命令行参数 --skip-protagonist 指定主角名）
    const skipProtagonist = process.argv.find(a => a.startsWith('--skip-protagonist='));
    const skipName = skipProtagonist ? skipProtagonist.split('=')[1] : null;
    if (skipName && char.name === skipName) {
      continue;
    }
    
    // 生成文件名（清理特殊字符）
    const fileName = `${char.name.replace(/[<>:"/\\|?*]/g, '_')}.json`;
    const filePath = path.join(NPC_DIR, fileName);
    
    // 生成 NPC 卡片
    const npcCard = {
      name: char.name,
      type: 'npc',
      description: char.description || '',
      personality: char.personality || '',
      background: char.background || '',
      abilities: char.abilities || [],
      relationships: char.relationships || [],
      firstAppearance: char.firstAppearance || '',
      tags: char.tags || [],
      generatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(npcCard, null, 2));
    npcCount++;
  }
  
  console.log(`✓ 已生成 ${npcCount} 个 NPC 卡片文件`);
  console.log(`✓ 文件保存在: ${NPC_DIR}`);
}

main();
