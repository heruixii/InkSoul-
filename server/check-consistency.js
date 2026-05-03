/**
 * Consistency Check Script
 * 出戏检测脚本 - 检测 AI 生成内容是否违反 canon_anchors
 * 
 * 功能：
 * - 扫描日志文件
 * - 检测 AI 生成内容是否违反原著锚点
 * - 生成强化锚点记录
 * - 提示开发者将新约束加入到 canon_anchors.json
 * - --auto-fix: 自动添加违规描述为新锚点
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '../data');
const CANON_ANCHORS_FILE = path.join(DATA_DIR, 'canon_anchors.json');
const CONSISTENCY_REPORT_FILE = path.join(DATA_DIR, 'consistency_report.json');
const AUTO_FIX_LOG_FILE = path.join(DATA_DIR, 'auto_fix_log.json');

/**
 * 出戏检测器
 */
class ConsistencyChecker {
  constructor() {
    this.canonAnchors = this._loadCanonAnchors();
  }

  /**
   * 加载原著锚点
   */
  _loadCanonAnchors() {
    try {
      if (fs.existsSync(CANON_ANCHORS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CANON_ANCHORS_FILE, 'utf8'));
        return data.anchors || [];
      }
    } catch (e) {
      console.warn('加载原著锚点失败:', e.message);
    }
    return [];
  }

  /**
   * 检测单个 AI 生成内容是否违反锚点
   */
  checkAgainstAnchors(content) {
    const violations = [];

    for (const anchor of this.canonAnchors) {
      const violation = this._checkContentAgainstAnchor(content, anchor);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * 检测内容是否违反单个锚点
   */
  _checkContentAgainstAnchor(content, anchor) {
    if (!anchor.immutable) {
      return null; // 可变锚点不检测
    }

    // 检测是否提到不该死亡的角色还活着
    if (anchor.characters && anchor.characters.length > 0) {
      for (const charName of anchor.characters) {
        const deathKeywords = ['死亡', '死了', '身亡', '牺牲', '遇害', '被杀'];
        const aliveKeywords = ['活着', '存活', '还活着', '还在'];

        // 如果内容说角色活着，但锚点说该角色已死
        if (deathKeywords.some(kw => anchor.description?.includes(kw))) {
          if (aliveKeywords.some(kw => content.includes(charName + kw) || content.includes(kw + charName))) {
            return {
              anchor: anchor.event,
              reason: `${charName} 不应该还活着`,
              anchorDescription: anchor.description,
              contentSnippet: content.substring(0, 100)
            };
          }
        }
      }
    }

    // 检测是否改变了不可改变的事实
    if (anchor.immutable && anchor.description) {
      const negationKeywords = ['没有', '没', '不', '未', '并非'];
      const anchorKeywords = anchor.description.split(/[，。！？；、\s]+/).filter(w => w.length > 1);

      for (const anchorKeyword of anchorKeywords) {
        for (const negation of negationKeywords) {
          if (content.includes(negation + anchorKeyword) || content.includes(anchorKeyword + negation)) {
            return {
              anchor: anchor.event,
              reason: `否定了原著事实: ${anchorKeyword}`,
              anchorDescription: anchor.description,
              contentSnippet: content.substring(0, 100)
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * 扫描日志文件检测违规
   */
  scanLogFile(date) {
    const log = logger.getLogger();
    const logEntries = log.readLogFile(date);
    
    const aiGenerationLogs = logEntries.filter(
      entry => entry.category === 'AI_GENERATION'
    );

    const violations = [];

    for (const entry of aiGenerationLogs) {
      const content = entry.generatedContent || '';
      const entryViolations = this.checkAgainstAnchors(content);
      
      if (entryViolations.length > 0) {
        violations.push({
          sessionId: entry.sessionId,
          timestamp: entry.timestamp,
          generatedContent: content,
          violations: entryViolations
        });
      }
    }

    return violations;
  }

  /**
   * 扫描所有日志文件
   */
  scanAllLogs() {
    const log = logger.getLogger();
    const logFiles = log.getLogFiles();
    
    const allViolations = {};

    for (const file of logFiles) {
      const date = file.replace('story-', '').replace('.log', '');
      const violations = this.scanLogFile(date);
      
      if (violations.length > 0) {
        allViolations[date] = violations;
      }
    }

    return allViolations;
  }

  /**
   * 生成强化锚点建议
   */
  generateAnchorSuggestions(violations) {
    const suggestions = [];

    for (const violation of violations) {
      for (const v of violation.violations) {
        suggestions.push({
          originalAnchor: v.anchor,
          reason: v.reason,
          suggestedConstraint: `AI 生成时必须遵守：${v.anchorDescription}`,
          priority: 'high'
        });
      }
    }

    return suggestions;
  }

  /**
   * 保存一致性报告
   */
  saveReport(violations) {
    const report = {
      scanDate: new Date().toISOString(),
      totalViolations: violations.length,
      violations,
      suggestions: this.generateAnchorSuggestions(violations)
    };

    fs.writeFileSync(CONSISTENCY_REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`✓ 一致性报告已保存到: ${CONSISTENCY_REPORT_FILE}`);
    
    return report;
  }

  /**
   * 打印报告摘要
   */
  printSummary(violations) {
    console.log('\n==================== 一致性检测报告 ====================');
    console.log(`检测到违规: ${violations.length} 条`);
    
    for (const violation of violations) {
      console.log(`\n会话: ${violation.sessionId}`);
      console.log(`时间: ${violation.timestamp}`);
      console.log(`违规数: ${violation.violations.length}`);
      
      for (const v of violation.violations) {
        console.log(`  - 锚点: ${v.anchor}`);
        console.log(`    原因: ${v.reason}`);
        console.log(`    内容片段: ${v.contentSnippet}`);
      }
    }
    
    console.log('\n========================================================\n');
  }
  
  /**
   * 自动修复：将违规描述添加为新锚点
   */
  autoFix(violations) {
    let addedCount = 0;
    const addedAnchors = [];
    
    // 加载现有锚点
    const anchors = this._loadCanonAnchors();
    
    for (const violation of violations) {
      for (const v of violation.violations) {
        // 检查是否已存在相似锚点
        const exists = anchors.some(a => 
          a.fact === v.reason || 
          a.description === v.anchorDescription
        );
        
        if (!exists) {
          const newAnchor = {
            event: v.anchor,
            fact: v.reason,
            description: v.anchorDescription,
            importance: 'high',
            immutable: true,
            autoGenerated: true,
            generatedAt: new Date().toISOString()
          };
          
          anchors.push(newAnchor);
          addedAnchors.push(newAnchor);
          addedCount++;
          
          console.log(`✓ 添加新锚点: ${v.reason}`);
        }
      }
    }
    
    if (addedCount > 0) {
      // 保存更新后的锚点
      fs.writeFileSync(CANON_ANCHORS_FILE, JSON.stringify({ anchors }, null, 2));
      console.log(`✓ 已保存 ${addedCount} 个新锚点到 ${CANON_ANCHORS_FILE}`);
      
      // 记录自动修复日志
      this._logAutoFix(addedAnchors);
    } else {
      console.log('✓ 无需添加新锚点（所有违规已存在）');
    }
    
    return addedCount;
  }
  
  /**
   * 记录自动修复操作
   */
  _logAutoFix(addedAnchors) {
    const log = [];
    
    if (fs.existsSync(AUTO_FIX_LOG_FILE)) {
      const existing = JSON.parse(fs.readFileSync(AUTO_FIX_LOG_FILE, 'utf8'));
      log.push(...existing);
    }
    
    const entry = {
      timestamp: new Date().toISOString(),
      addedCount: addedAnchors.length,
      anchors: addedAnchors
    };
    
    log.push(entry);
    
    // 只保留最近 100 条记录
    if (log.length > 100) {
      log.splice(0, log.length - 100);
    }
    
    fs.writeFileSync(AUTO_FIX_LOG_FILE, JSON.stringify(log, null, 2));
  }
  
  /**
   * 获取最近自动添加的锚点
   */
  getRecentAutoFixes(count = 10) {
    if (!fs.existsSync(AUTO_FIX_LOG_FILE)) {
      return [];
    }
    
    const log = JSON.parse(fs.readFileSync(AUTO_FIX_LOG_FILE, 'utf8'));
    return log.slice(-count).reverse();
  }

  /**
   * 运行完整检测
   */
  run(date = null) {
    console.log('开始一致性检测...');
    
    let violations;
    if (date) {
      violations = this.scanLogFile(date);
    } else {
      violations = this.scanLogFile(new Date().toISOString().split('T')[0]);
    }

    if (violations.length > 0) {
      this.printSummary(violations);
      const report = this.saveReport(violations);
      return report;
    } else {
      console.log('✓ 未检测到违规');
      return { totalViolations: 0, violations: [] };
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const args = process.argv.slice(2);
  const dateArgIndex = args.indexOf('--date');
  const date = dateArgIndex >= 0 ? args[dateArgIndex + 1] : args[0];
  const autoFix = args.includes('--auto-fix');
  
  const checker = new ConsistencyChecker();
  const violations = checker.run(date);
  
  if (autoFix && violations.length > 0) {
    console.log('\n正在自动修复...');
    const addedCount = checker.autoFix(violations);
    console.log(`\n自动修复完成，添加了 ${addedCount} 个新锚点`);
  }
}

// 导出供 API 使用
module.exports = {
  ConsistencyChecker,
  getRecentAutoFixes: () => {
    const checker = new ConsistencyChecker();
    return checker.getRecentAutoFixes();
  }
};
