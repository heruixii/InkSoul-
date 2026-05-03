/**
 * 故事测试脚本
 * 用于测试已有故事与原作剧情设定、角色设定的符合度，以及剧情合理度
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class StoryTester {
  constructor() {
    this.tavernPath = path.join(__dirname, 'data/tavern.json');
    this.metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    this.testResults = [];
    this.timeLimit = null;
    this.timeoutId = null;
    this.isInterrupted = false;
  }

  /**
   * 加载故事数据
   */
  loadStoryData() {
    try {
      const tavernData = JSON.parse(fs.readFileSync(this.tavernPath, 'utf8'));
      return tavernData;
    } catch (error) {
      console.error('[Story Tester] Failed to load story data:', error);
      return null;
    }
  }

  /**
   * 加载小说元数据
   */
  loadMetadata() {
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      return metadata;
    } catch (error) {
      console.error('[Story Tester] Failed to load metadata:', error);
      return null;
    }
  }

  /**
   * 测试单个故事
   */
  testStory(story, metadata, tavernData) {
    const result = {
      storyId: story.id,
      storyTitle: story.title,
      tests: [],
      overallScore: 0,
      issues: []
    };

    console.log(`\n[Story Tester] Testing story: ${story.title}`);

    // 1. 检查禁止概念使用
    const forbiddenConceptTest = this.testForbiddenConcepts(story, metadata);
    result.tests.push(forbiddenConceptTest);
    result.issues.push(...forbiddenConceptTest.issues);

    // 2. 检查角色设定符合度
    const characterConsistencyTest = this.testCharacterConsistency(story, metadata, tavernData);
    result.tests.push(characterConsistencyTest);
    result.issues.push(...characterConsistencyTest.issues);

    // 3. 检查剧情合理度
    const plotPlausibilityTest = this.testPlotPlausibility(story, metadata);
    result.tests.push(plotPlausibilityTest);
    result.issues.push(...plotPlausibilityTest.issues);

    // 4. 检查状态一致性
    const stateConsistencyTest = this.testStateConsistency(story, metadata);
    result.tests.push(stateConsistencyTest);
    result.issues.push(...stateConsistencyTest.issues);

    // 计算总分
    const totalTests = result.tests.length;
    const passedTests = result.tests.filter(t => t.passed).length;
    result.overallScore = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return result;
  }

  /**
   * 测试禁止概念使用
   */
  testForbiddenConcepts(story, metadata) {
    const test = {
      name: '禁止概念使用测试',
      description: '检查故事内容是否使用了禁止的概念术语',
      passed: true,
      issues: []
    };

    // 获取小说的禁止概念配置
    const novelId = story.metadata?.novel_id;
    if (!novelId || !metadata[novelId]) {
      test.passed = true; // 没有配置则跳过
      test.issues.push('未找到小说元数据配置，跳过禁止概念测试');
      return test;
    }

    const forbiddenConcepts = metadata[novelId].forbiddenConcepts;
    if (!forbiddenConcepts) {
      test.passed = true; // 没有配置则跳过
      test.issues.push('该小说未配置禁止概念规则，跳过测试');
      return test;
    }

    // 收集所有禁止术语
    const forbiddenTerms = [];
    
    // 从分类结构中收集
    if (forbiddenConcepts.currency?.forbidden) {
      forbiddenConcepts.currency.forbidden.forEach(item => forbiddenTerms.push(item.term));
    }
    if (forbiddenConcepts.cultivation?.forbidden) {
      forbiddenConcepts.cultivation.forbidden.forEach(item => forbiddenTerms.push(item.term));
    }
    if (forbiddenConcepts.energy?.forbidden) {
      forbiddenConcepts.energy.forbidden.forEach(item => forbiddenTerms.push(item.term));
    }
    if (forbiddenConcepts.realm?.forbidden) {
      forbiddenConcepts.realm.forbidden.forEach(item => forbiddenTerms.push(item.term));
    }
    if (forbiddenConcepts.concepts) {
      forbiddenConcepts.concepts.forEach(item => forbiddenTerms.push(item.term));
    }

    // 检查故事摘要和事件描述
    const storyText = this.extractStoryText(story);
    
    if (forbiddenTerms.length === 0) {
      test.issues.push('该小说未配置禁止术语列表，跳过测试');
      return test;
    }
    
    forbiddenTerms.forEach(term => {
      if (storyText.includes(term)) {
        test.passed = false;
        test.issues.push(`检测到禁止使用的术语："${term}"`);
      }
    });

    return test;
  }

  /**
   * 测试角色设定符合度
   */
  testCharacterConsistency(story, metadata, tavernData) {
    const test = {
      name: '角色设定符合度测试',
      description: '检查角色行为是否符合其设定',
      passed: true,
      issues: []
    };

    // 获取故事中的角色
    const storyCharacters = (tavernData.storyCharacters || []).filter(sc => sc.story_id === story.id);
    const characters = tavernData.characters || [];

    if (storyCharacters.length === 0) {
      test.issues.push('故事中没有角色');
      return test;
    }

    // 检查主角设定
    const protagonist = storyCharacters.find(sc => sc.role === 'protagonist');
    if (protagonist) {
      const character = characters.find(c => c.id === protagonist.character_id);
      if (character) {
        // 检查背景是否符合验证规则
        const novelId = story.metadata?.novel_id;
        if (novelId && metadata[novelId]?.characterValidationRules) {
          const validation = this.validateCharacterBackground(
            novelId,
            character.type,
            character.scenario || '',
            metadata
          );
          
          if (!validation.valid) {
            test.passed = false;
            test.issues.push(`角色"${character.name}"背景验证失败: ${validation.errors.join(', ')}`);
          }
        } else {
          test.issues.push('该小说未配置角色验证规则，跳过背景验证');
        }
      }
    }

    return test;
  }

  /**
   * 测试剧情合理度
   */
  testPlotPlausibility(story, metadata) {
    const test = {
      name: '剧情合理度测试',
      description: '检查剧情是否符合世界观合理性规则',
      passed: true,
      issues: []
    };

    const novelId = story.metadata?.novel_id;
    if (!novelId || !metadata[novelId]) {
      test.issues.push('未找到小说元数据配置，跳过剧情合理度测试');
      return test;
    }

    const worldview = metadata[novelId].worldview;
    if (!worldview) {
      test.issues.push('该小说未配置世界观规则，跳过剧情合理度测试');
      return test;
    }

    // 提取故事文本
    const storyText = this.extractStoryText(story);
    const events = story.storyEvents || [];

    // 检查地理连续性
    const locations = this.extractLocations(events);
    if (locations.length > 1) {
      for (let i = 0; i < locations.length - 1; i++) {
        const from = locations[i];
        const to = locations[i + 1];
        
        // 检查是否有合理的移动逻辑
        const distanceRule = this.checkDistanceRule(from, to, worldview);
        if (distanceRule) {
          test.issues.push(`地点移动可能不合理: ${from} -> ${to} (${distanceRule})`);
          test.passed = false;
        }
      }
    }

    return test;
  }

  /**
   * 测试状态一致性
   */
  testStateConsistency(story, metadata) {
    const test = {
      name: '状态一致性测试',
      description: '检查物品、关系等状态是否保持一致',
      passed: true,
      issues: []
    };

    const events = story.storyEvents || [];
    if (events.length === 0) {
      return test;
    }

    // 检查物品状态
    const itemChanges = this.extractItemChanges(events);
    const inconsistentItems = this.checkItemConsistency(itemChanges);
    
    if (inconsistentItems.length > 0) {
      test.passed = false;
      test.issues.push(...inconsistentItems);
    }

    // 检查关系状态
    const relationshipChanges = this.extractRelationshipChanges(events);
    const inconsistentRelationships = this.checkRelationshipConsistency(relationshipChanges);
    
    if (inconsistentRelationships.length > 0) {
      test.passed = false;
      test.issues.push(...inconsistentRelationships);
    }

    return test;
  }

  /**
   * 提取故事文本
   */
  extractStoryText(story) {
    let text = '';
    
    // 添加摘要
    if (story.summary) {
      text += story.summary + ' ';
    }
    
    // 添加事件描述
    const events = story.storyEvents || [];
    events.forEach(event => {
      if (event.description) {
        text += event.description + ' ';
      }
    });

    return text;
  }

  /**
   * 验证角色背景
   */
  validateCharacterBackground(novelId, characterType, background, metadata) {
    const rules = metadata[novelId]?.characterValidationRules;
    if (!rules) {
      return { valid: true, errors: [] };
    }

    const typeRules = rules[characterType];
    if (!typeRules) {
      return { valid: true, errors: [] };
    }

    const errors = [];

    // 检查禁止的模式
    if (typeRules.forbiddenBackgroundPatterns) {
      for (const pattern of typeRules.forbiddenBackgroundPatterns) {
        if (background.includes(pattern)) {
          errors.push(`背景包含禁止模式："${pattern}"`);
        }
      }
    }

    // 检查必需元素
    if (typeRules.requiredElements && typeRules.requiredElements.length > 0) {
      const hasRequiredElement = typeRules.requiredElements.some(element => 
        background.includes(element)
      );
      if (!hasRequiredElement) {
        errors.push(`背景缺少必需元素: ${typeRules.requiredElements.join('、')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 提取地点信息
   */
  extractLocations(events) {
    const locations = [];
    events.forEach(event => {
      const description = event.description || '';
      // 通用地点关键词，适用于大多数小说
      const locationKeywords = ['山', '谷', '宗', '派', '镇', '城', '殿', '阁', '林', '海', '宫', '院', '峰', '崖', '洞', '府', '寨', '堡', '庄', '村', '县', '州', '省', '国'];
      locationKeywords.forEach(keyword => {
        const regex = new RegExp(`[\\u4e00-\\u9fa5]{1,3}${keyword}`, 'g');
        const matches = description.match(regex);
        if (matches) {
          locations.push(...matches);
        }
      });
    });
    return [...new Set(locations)]; // 去重
  }

  /**
   * 检查距离规则
   */
  checkDistanceRule(from, to, worldview) {
    if (!worldview.distanceRules) {
      return null;
    }

    // 简化检查：实际应该匹配具体的地点ID
    const rule = worldview.distanceRules.find(r => 
      from.includes(r.from) || to.includes(r.to)
    );

    if (rule && rule.difficulty === '极高') {
      return `距离极远，需要合理的时间和理由`;
    }

    return null;
  }

  /**
   * 提取物品变化
   */
  extractItemChanges(events) {
    const changes = [];
    events.forEach(event => {
      const description = event.description || '';
      // 通用物品变化关键词
      const itemKeywords = ['获得', '失去', '使用', '炼化', '购买', '出售', '赠送', '抢夺', '拾取', '收藏', '装备', '卸下'];
      itemKeywords.forEach(keyword => {
        if (description.includes(keyword)) {
          changes.push({
            eventId: event.id,
            description: description,
            keyword: keyword
          });
        }
      });
    });
    return changes;
  }

  /**
   * 检查物品一致性
   */
  checkItemConsistency(itemChanges) {
    const issues = [];
    // 简化检查：实际应该追踪具体的物品状态
    if (itemChanges.length > 5) {
      issues.push('物品变化频繁，可能存在不一致');
    }
    return issues;
  }

  /**
   * 提取关系变化
   */
  extractRelationshipChanges(events) {
    const changes = [];
    events.forEach(event => {
      const description = event.description || '';
      // 通用关系变化关键词
      const relationshipKeywords = ['关系', '结识', '仇视', '结盟', '背叛', '信任', '怀疑', '友谊', '敌意', '爱情', '亲情', '师徒', '主仆'];
      relationshipKeywords.forEach(keyword => {
        if (description.includes(keyword)) {
          changes.push({
            eventId: event.id,
            description: description,
            keyword: keyword
          });
        }
      });
    });
    return changes;
  }

  /**
   * 检查关系一致性
   */
  checkRelationshipConsistency(relationshipChanges) {
    const issues = [];
    // 简化检查：实际应该追踪具体的关系状态
    return issues;
  }

  /**
   * 列出所有故事
   */
  listStories(stories) {
    console.log('\n========================================');
    console.log('可用故事列表');
    console.log('========================================');
    stories.forEach((story, index) => {
      console.log(`${index + 1}. ${story.title} (ID: ${story.id})`);
      console.log(`   描述: ${story.description || '无'}`);
      console.log(`   创建时间: ${story.created_at || '未知'}`);
      console.log('');
    });
    console.log('========================================');
  }

  /**
   * 设置时间限制
   */
  setTimeLimit(seconds) {
    this.timeLimit = seconds;
    console.log(`[Story Tester] 设置时间限制: ${seconds}秒`);
  }

  /**
   * 启动超时计时器
   */
  startTimeoutTimer() {
    if (!this.timeLimit || this.timeLimit <= 0) {
      return;
    }

    this.timeoutId = setTimeout(() => {
      console.log(`\n[Story Tester] 测试超时 (${this.timeLimit}秒)，自动中断`);
      this.isInterrupted = true;
      this.generateTestReport();
      process.exit(0);
    }, this.timeLimit * 1000);
  }

  /**
   * 清除超时计时器
   */
  clearTimeoutTimer() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * 运行交互式测试
   */
  async runInteractiveTest() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      console.log('[Story Tester] Starting interactive story test...\n');

      const tavernData = this.loadStoryData();
      if (!tavernData) {
        console.error('[Story Tester] Failed to load story data');
        rl.close();
        return;
      }

      const metadata = this.loadMetadata();
      if (!metadata) {
        console.error('[Story Tester] Failed to load metadata');
        rl.close();
        return;
      }

      const stories = tavernData.stories || [];
      if (stories.length === 0) {
        console.log('[Story Tester] No stories found');
        rl.close();
        return;
      }

      // 列出所有故事
      this.listStories(stories);

      // 选择故事
      const storyIndex = await this.askQuestion(rl, `请选择要测试的故事 (1-${stories.length}, 或输入 'all' 测试所有): `);
      
      let selectedStories = [];
      if (storyIndex.toLowerCase() === 'all') {
        selectedStories = stories;
      } else {
        const index = parseInt(storyIndex) - 1;
        if (index >= 0 && index < stories.length) {
          selectedStories = [stories[index]];
        } else {
          console.log('[Story Tester] 无效的选择');
          rl.close();
          return;
        }
      }

      // 设置时间限制
      const timeLimitInput = await this.askQuestion(rl, '请设置时间限制（秒，输入 0 或留空表示无限制）: ');
      const timeLimit = parseInt(timeLimitInput) || 0;
      if (timeLimit > 0) {
        this.setTimeLimit(timeLimit);
      }

      console.log(`\n[Story Tester] 准备测试 ${selectedStories.length} 个故事...\n`);

      // 启动超时计时器
      this.startTimeoutTimer();

      // 测试选中的故事
      for (const story of selectedStories) {
        if (this.isInterrupted) {
          break;
        }
        const result = this.testStory(story, metadata, tavernData);
        this.testResults.push(result);
      }

      // 清除超时计时器
      this.clearTimeoutTimer();

      // 生成测试报告
      this.generateTestReport();

    } catch (error) {
      console.error('[Story Tester] Error:', error);
    } finally {
      rl.close();
    }
  }

  /**
   * 询问用户问题
   */
  askQuestion(rl, question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * 运行所有测试
   */
  runAllTests() {
    console.log('[Story Tester] Starting story tests...\n');
    
    const tavernData = this.loadStoryData();
    if (!tavernData) {
      console.error('[Story Tester] Failed to load story data');
      return;
    }

    const metadata = this.loadMetadata();
    if (!metadata) {
      console.error('[Story Tester] Failed to load metadata');
      return;
    }

    const stories = tavernData.stories || [];
    console.log(`[Story Tester] Found ${stories.length} stories to test`);

    stories.forEach(story => {
      const result = this.testStory(story, metadata, tavernData);
      this.testResults.push(result);
    });

    // 生成测试报告
    this.generateTestReport();
  }

  /**
   * 生成测试报告
   */
  generateTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalStories: this.testResults.length,
      overallResults: {
        passed: 0,
        failed: 0,
        averageScore: 0
      },
      storyResults: this.testResults,
      summary: this.generateSummary()
    };

    // 计算总体统计
    report.overallResults.passed = this.testResults.filter(r => r.overallScore >= 80).length;
    report.overallResults.failed = this.testResults.filter(r => r.overallScore < 80).length;
    report.overallResults.averageScore = this.testResults.reduce((sum, r) => sum + r.overallScore, 0) / this.testResults.length;

    // 保存报告
    const reportPath = path.join(__dirname, 'story-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n[Story Tester] Test report generated:', reportPath);
    this.printSummary(report);
  }

  /**
   * 生成总结
   */
  generateSummary() {
    const summary = [];
    
    this.testResults.forEach(result => {
      if (result.issues.length > 0) {
        summary.push({
          story: result.storyTitle,
          issueCount: result.issues.length,
          issues: result.issues
        });
      }
    });

    return summary;
  }

  /**
   * 打印总结
   */
  printSummary(report) {
    console.log('\n========================================');
    console.log('测试总结');
    console.log('========================================');
    console.log(`总故事数: ${report.totalStories}`);
    console.log(`通过: ${report.overallResults.passed}`);
    console.log(`失败: ${report.overallResults.failed}`);
    console.log(`平均分数: ${report.overallResults.averageScore.toFixed(2)}%`);
    console.log('\n问题汇总:');
    
    report.summary.forEach(item => {
      console.log(`\n故事: ${item.story}`);
      console.log(`问题数量: ${item.issueCount}`);
      item.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    });
    
    console.log('\n========================================');
  }
}

// 运行测试
if (require.main === module) {
  const tester = new StoryTester();
  
  // 检查命令行参数
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive') || args.includes('-i')) {
    // 交互式模式
    tester.runInteractiveTest();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('故事测试脚本使用方法:');
    console.log('  node story-tester.js              # 测试所有故事');
    console.log('  node story-tester.js -i           # 交互式模式（选择故事和时间限制）');
    console.log('  node story-tester.js --interactive # 交互式模式');
    console.log('  node story-tester.js --help       # 显示帮助');
  } else {
    // 默认测试所有故事
    tester.runAllTests();
  }
}

module.exports = StoryTester;
