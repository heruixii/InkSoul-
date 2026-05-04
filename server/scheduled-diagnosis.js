/**
 * 定时诊断脚本
 * 用于定期扫描项目中的错误关键词并自动修正
 */

const fs = require('fs');
const path = require('path');
const { applyGlobalFix } = require('./apply-global-fix');

// 配置
const CONFIG_PATH = process.env.FORBIDDEN_WORDS_PATH || path.join(__dirname, '../config/forbidden-words.json');
const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, `diagnose-${new Date().toISOString().split('T')[0]}.log`);

// 全局配置缓存
let globalConfig = null;

// 确保日志目录存在
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
 * 加载配置
 */
function loadConfig() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    
    // 环境变量覆盖
    if (process.env.DIAGNOSIS_AUTO_FIX !== undefined) {
      config.autoFix = process.env.DIAGNOSIS_AUTO_FIX === 'true';
    }
    
    globalConfig = config;
    return config;
  } catch (error) {
    console.error('加载配置文件失败:', error);
    const defaultConfig = {
      keywords: [],
      corrections: {},
      autoFix: process.env.DIAGNOSIS_AUTO_FIX === 'true' || false,
      alertOnNewErrors: true
    };
    globalConfig = defaultConfig;
    return defaultConfig;
  }
}

/**
 * 重新加载配置
 */
function reloadConfig() {
  globalConfig = null;
  return loadConfig();
}

/**
 * 获取当前配置
 */
function getCurrentConfig() {
  if (!globalConfig) {
    return loadConfig();
  }
  return globalConfig;
}

/**
 * 搜索包含关键词的文件
 */
function searchForKeywords(projectRoot, keywords, excludePatterns) {
  const results = [];
  
  function searchDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      // 检查是否需要排除
      const relativePath = path.relative(projectRoot, filePath);
      const shouldExclude = excludePatterns.some(pattern => 
        relativePath.includes(pattern) || filePath.includes(pattern)
      );
      
      if (shouldExclude) {
        continue;
      }
      
      if (stat.isDirectory()) {
        searchDirectory(filePath);
      } else if (stat.isFile() && (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.md'))) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const foundKeywords = [];
          
          for (const keyword of keywords) {
            if (content.includes(keyword)) {
              const matches = content.match(new RegExp(keyword, 'g'));
              foundKeywords.push({
                keyword: keyword,
                count: matches ? matches.length : 1
              });
            }
          }
          
          if (foundKeywords.length > 0) {
            results.push({
              file: relativePath,
              path: filePath,
              keywords: foundKeywords,
              type: relativePath.includes('characters') ? 'character' : 
                     relativePath.includes('worldbook') ? 'worldbook' : 'other'
            });
          }
        } catch (error) {
          // 忽略读取错误
        }
      }
    }
  }
  
  searchDirectory(projectRoot);
  return results;
}

/**
 * 运行诊断
 */
async function runDiagnosis(options = {}) {
  const {
    autoFix = false,
    alertOnNewErrors = true
  } = options;

  writeLog('=== 开始定时诊断 ===');
  
  // 加载配置
  const config = loadConfig();
  writeLog(`已加载配置: ${Object.keys(config).length} 项`);
  writeLog(`关键词数量: ${config.keywords.length}`);
  
  // 搜索包含关键词的文件
  const projectRoot = path.join(__dirname, '..');
  const excludePatterns = config.excludePatterns || ['temp_epub', 'node_modules', '.git'];
  
  writeLog('开始搜索包含关键词的文件...');
  const results = searchForKeywords(projectRoot, config.keywords, excludePatterns);
  writeLog(`找到 ${results.length} 个包含关键词的文件`);
  
  // 输出详细结果
  for (const result of results) {
    writeLog(`  - ${result.file}:`);
    for (const kw of result.keywords) {
      writeLog(`    [${kw.keyword}] ${kw.count} 处`);
    }
  }
  
  // 统计
  const totalErrors = results.reduce((sum, r) => {
    return sum + r.keywords.reduce((s, k) => s + k.count, 0);
  }, 0);
  
  writeLog(`总计发现 ${totalErrors} 处错误`);
  
  // 如果启用了自动修正
  if (autoFix && results.length > 0) {
    writeLog('开始自动修正...');
    
    try {
      // 只修正角色卡和世界书
      const characterFiles = results.filter(r => 
        r.file.startsWith('characters/') && r.file.endsWith('.json')
      );
      const worldbookFiles = results.filter(r => 
        r.file.startsWith('worldbook/') && r.file.endsWith('.json')
      );
      
      writeLog(`发现角色卡文件: ${characterFiles.length} 个`);
      writeLog(`发现世界书文件: ${worldbookFiles.length} 个`);
      
      if (characterFiles.length > 0 || worldbookFiles.length > 0) {
        // 使用 applyGlobalFix 进行修正
        const fixResult = await applyGlobalFix({
          all: true,
          worldbook: true,
          dryRun: false
        });
        
        writeLog(`自动修正完成: 修改了 ${fixResult.modifiedFiles} 个文件`);
        
        // 输出详细修正信息
        if (fixResult.details && fixResult.details.length > 0) {
          writeLog('修正详情:');
          for (const detail of fixResult.details) {
            const fileType = detail.file.includes('worldbook') ? '世界书' : '角色卡';
            writeLog(`  [${fileType}] ${path.basename(detail.file)}: ${detail.changes.length} 处修改`);
          }
        }
      } else {
        writeLog('没有需要自动修正的角色卡或世界书文件');
      }
    } catch (error) {
      writeLog(`自动修正失败: ${error.message}`);
    }
  }
  
  // 如果启用了警报
  if (alertOnNewErrors && results.length > 0) {
    writeLog('⚠️ 警报: 发现新的错误关键词');
    
    // 写入警报日志
    const alertFile = path.join(LOG_DIR, 'alert.log');
    const alertMessage = `[${new Date().toISOString()}] 发现 ${results.length} 个文件包含错误关键词，共 ${totalErrors} 处\n`;
    fs.appendFileSync(alertFile, alertMessage, 'utf-8');
  }
  
  writeLog('=== 定时诊断完成 ===');
  
  return {
    totalFiles: results.length,
    totalErrors,
    files: results
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    autoFix: false,
    alertOnNewErrors: true
  };
  
  // 解析参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--auto-fix' || arg === '-a') {
      options.autoFix = true;
    } else if (arg === '--no-alert' || arg === '-n') {
      options.alertOnNewErrors = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
定时诊断脚本
用法: node scheduled-diagnosis.js [选项]

选项:
  -a, --auto-fix    发现错误后自动修正
  -n, --no-alert    不发送警报
  -h, --help        显示帮助信息

示例:
  node scheduled-diagnosis.js
  node scheduled-diagnosis.js --auto-fix
      `);
      process.exit(0);
    }
  }
  
  await runDiagnosis(options);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runDiagnosis,
  loadConfig,
  reloadConfig,
  getCurrentConfig
};
