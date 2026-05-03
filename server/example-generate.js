/**
 * Example: Generate Story Framework
 * 演示如何生成具体的故事框架
 * 
 * 示例：以"方源重生"为起点，韩立旁观模式，生成20章的故事框架
 */

const fs = require('fs');
const path = require('path');
const storyFrameworkGenerator = require('./story-framework-generator');

const DATA_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(DATA_DIR, 'generated_story_framework.json');

/**
 * 示例1：以"方源重生"为起点，韩立旁观模式
 */
function example1() {
  console.log('\n=== 示例1：方源重生，韩立旁观模式 ===\n');
  
  const framework = storyFrameworkGenerator.generateStoryFramework({
    protagonist: '韩立',
    startingPoint: '方源重生',
    focusCharacters: ['方源', '古月药姬', '楚度'],
    maxChapters: 20,
    branches: true,
    playerInfluence: 'low'
  });
  
  // 保存到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(framework, null, 2));
  console.log(`\n✓ 故事框架已保存到: ${OUTPUT_FILE}`);
  
  // 打印概要
  console.log('\n--- 故事框架概要 ---');
  console.log(`版本: ${framework.version}`);
  console.log(`生成时间: ${framework.generatedAt}`);
  console.log(`\n主角档案:`);
  console.log(`  姓名: ${framework.protagonist.name}`);
  console.log(`  类型: ${framework.protagonist.type}`);
  console.log(`  描述: ${framework.protagonist.description}`);
  console.log(`  初始位置: ${framework.protagonist.startingLocation}`);
  console.log(`  初始境界: ${framework.protagonist.startingRealm}`);
  console.log(`\n设置:`);
  console.log(`  起始章节: ${framework.settings.startChapter}`);
  console.log(`  结束章节: ${framework.settings.endChapter}`);
  console.log(`  玩家影响: ${framework.settings.playerInfluence}`);
  console.log(`\n统计:`);
  console.log(`  总章节数: ${framework.statistics.totalChapters}`);
  console.log(`  总事件数: ${framework.statistics.totalEvents}`);
  console.log(`  锚点数: ${framework.statistics.totalAnchors}`);
  console.log(`  分支点数: ${framework.statistics.branchPoints}`);
  
  // 打印前3章的详细内容
  console.log('\n--- 前3章详细内容 ---');
  for (let i = 0; i < Math.min(3, framework.chapters.length); i++) {
    const chapter = framework.chapters[i];
    console.log(`\n${chapter.title}`);
    console.log(`  概要: ${chapter.summary}`);
    console.log(`  出场角色: ${chapter.characters.join(', ')}`);
    console.log(`  关键事件数: ${chapter.keyEvents.length}`);
    console.log(`  分支选项数: ${chapter.branches.length}`);
    if (chapter.branches.length > 0) {
      console.log(`  分支选项:`);
      chapter.branches.forEach(branch => {
        console.log(`    - ${branch.title}: ${branch.description}`);
      });
    }
    if (chapter.hasAnchors) {
      console.log(`  ⚠️ 本章包含原著锚点`);
    }
  }
  
  return framework;
}

/**
 * 示例2：从小说开始，中度影响
 */
function example2() {
  console.log('\n=== 示例2：从小说开始，中度影响 ===\n');
  
  const framework = storyFrameworkGenerator.generateStoryFramework({
    protagonist: '韩立',
    startingPoint: null, // 从第一章开始
    focusCharacters: ['方源'],
    maxChapters: 10,
    branches: true,
    playerInfluence: 'medium'
  });
  
  const outputFile = path.join(DATA_DIR, 'generated_story_framework_medium.json');
  fs.writeFileSync(outputFile, JSON.stringify(framework, null, 2));
  console.log(`✓ 故事框架已保存到: ${outputFile}`);
  
  console.log(`\n统计:`);
  console.log(`  总章节数: ${framework.statistics.totalChapters}`);
  console.log(`  总事件数: ${framework.statistics.totalEvents}`);
  console.log(`  分支点数: ${framework.statistics.branchPoints}`);
  
  return framework;
}

/**
 * 示例3：高影响，更多章节
 */
function example3() {
  console.log('\n=== 示例3：高影响，更多章节 ===\n');
  
  const framework = storyFrameworkGenerator.generateStoryFramework({
    protagonist: '韩立',
    startingPoint: '方源',
    focusCharacters: ['方源', '古月药姬', '楚度', '白凝冰'],
    maxChapters: 30,
    branches: true,
    playerInfluence: 'high'
  });
  
  const outputFile = path.join(DATA_DIR, 'generated_story_framework_high.json');
  fs.writeFileSync(outputFile, JSON.stringify(framework, null, 2));
  console.log(`✓ 故事框架已保存到: ${outputFile}`);
  
  console.log(`\n统计:`);
  console.log(`  总章节数: ${framework.statistics.totalChapters}`);
  console.log(`  总事件数: ${framework.statistics.totalEvents}`);
  console.log(`  分支点数: ${framework.statistics.branchPoints}`);
  
  return framework;
}

/**
 * 验证分支是否违反锚点
 */
function exampleValidateBranches(framework) {
  console.log('\n=== 验证分支是否违反锚点 ===\n');
  
  const generator = new storyFrameworkGenerator.StoryFrameworkGenerator();
  let totalViolations = 0;
  
  for (const chapter of framework.chapters) {
    if (chapter.branches && chapter.branches.length > 0) {
      console.log(`\n第 ${chapter.chapterIndex} 章:`);
      
      for (const branch of chapter.branches) {
        const validation = generator.validateBranch(branch, chapter.chapterIndex);
        
        if (validation.valid) {
          console.log(`  ✓ ${branch.title}: 通过验证`);
        } else {
          console.log(`  ✗ ${branch.title}: 违反锚点`);
          validation.violations.forEach(v => {
            console.log(`    - ${v.reason}: ${v.constraint}`);
          });
          totalViolations++;
        }
      }
    }
  }
  
  console.log(`\n总计违反次数: ${totalViolations}`);
}

/**
 * 主函数
 */
function main() {
  console.log('=== 故事框架生成示例 ===\n');
  
  try {
    // 运行示例1
    const framework1 = example1();
    
    // 验证分支
    exampleValidateBranches(framework1);
    
    // 运行示例2（可选）
    // example2();
    
    // 运行示例3（可选）
    // example3();
    
    console.log('\n=== 所有示例运行完成 ===');
  } catch (error) {
    console.error('运行示例时出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  example1,
  example2,
  example3,
  exampleValidateBranches
};
