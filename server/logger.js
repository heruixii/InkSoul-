/**
 * Logger Module
 * 日志模块 - 结构化日志系统，支持文件轮转和日志级别
 * 
 * 功能：
 * - 结构化日志记录（玩家选择、AI生成、状态变化）
 * - 文件轮转（按日期）
 * - 控制台输出
 * - 日志级别控制
 * - 环境变量配置
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LOG_LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };

// 从环境变量读取配置
const config = {
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || LOG_DIR,
  enableConsole: process.env.ENABLE_CONSOLE !== 'false',
  enableFile: process.env.ENABLE_FILE !== 'false',
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '7', 10) // 日志保留天数
};

// 确保日志目录存在
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

/**
 * 日志记录器
 */
class Logger {
  constructor() {
    this.level = config.level;
    this.currentLogFile = this._getLogFilePath();
    this._initLogFile();
  }

  /**
   * 获取日志文件路径（按日期）
   */
  _getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(config.logDir, `story-${date}.log`);
  }

  /**
   * 初始化日志文件
   */
  _initLogFile() {
    const filePath = this._getLogFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', 'utf8');
    }
  }

  /**
   * 格式化日志条目
   */
  _formatLogEntry(level, category, data) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      category,
      ...data
    };
    return JSON.stringify(entry) + '\n';
  }

  /**
   * 写入日志
   */
  _writeLog(level, category, data) {
    // 检查日志级别
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const logEntry = this._formatLogEntry(level, category, data);

    // 控制台输出
    if (config.enableConsole) {
      const consoleMethod = level === 'debug' ? 'log' : level;
      console[consoleMethod](`[${level.toUpperCase()}] [${category}]`, data);
    }

    // 文件输出
    if (config.enableFile) {
      try {
        // 检查是否需要轮转文件（新的一天）
        const newLogFile = this._getLogFilePath();
        if (newLogFile !== this.currentLogFile) {
          this.currentLogFile = newLogFile;
          this._initLogFile();
        }

        fs.appendFileSync(this.currentLogFile, logEntry, 'utf8');
      } catch (e) {
        console.error('写入日志文件失败:', e.message);
      }
    }
  }

  /**
   * Debug 级别日志
   */
  debug(category, data) {
    this._writeLog('debug', category, data);
  }

  /**
   * Info 级别日志
   */
  info(category, data) {
    this._writeLog('info', category, data);
  }

  /**
   * Warn 级别日志
   */
  warn(category, data) {
    this._writeLog('warn', category, data);
  }

  /**
   * Error 级别日志
   */
  error(category, data) {
    this._writeLog('error', category, data);
  }

  /**
   * 记录玩家选择
   */
  logPlayerChoice(sessionId, choiceId, branchId, beforeState, afterState) {
    this.info('PLAYER_CHOICE', {
      sessionId,
      choiceId,
      branchId,
      beforeState: JSON.stringify(beforeState),
      afterState: JSON.stringify(afterState),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录 AI 生成
   */
  logAIGeneration(sessionId, promptPreview, generatedContent, tokensUsed, model, latency) {
    this.info('AI_GENERATION', {
      sessionId,
      promptPreview: promptPreview.substring(0, 200),
      generatedContent: generatedContent.substring(0, 200),
      tokensUsed,
      model,
      latency,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录状态变化
   */
  logStateChange(sessionId, changeType, beforeState, afterState) {
    this.info('STATE_CHANGE', {
      sessionId,
      changeType,
      beforeState: JSON.stringify(beforeState),
      afterState: JSON.stringify(afterState),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录错误
   */
  logError(category, error, context = {}) {
    this.error(category, {
      message: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 设置日志级别
   */
  setLevel(level) {
    if (LOG_LEVELS.includes(level)) {
      this.level = level;
    }
  }

  /**
   * 读取日志文件
   */
  readLogFile(date) {
    const filePath = date 
      ? path.join(config.logDir, `story-${date}.log`)
      : this.currentLogFile;

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }

  /**
   * 获取可用日志文件列表
   */
  getLogFiles() {
    if (!fs.existsSync(config.logDir)) {
      return [];
    }

    return fs.readdirSync(config.logDir)
      .filter(file => file.startsWith('story-') && file.endsWith('.log'))
      .sort()
      .reverse();
  }

  /**
   * 清理旧日志文件
   */
  cleanOldLogs(daysToKeep = null) {
    const days = daysToKeep || config.logRetentionDays;
    const files = this.getLogFiles();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let deletedCount = 0;
    for (const file of files) {
      const dateStr = file.replace('story-', '').replace('.log', '');
      const fileDate = new Date(dateStr);

      if (fileDate < cutoffDate) {
        const filePath = path.join(config.logDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}

// 单例实例
let instance = null;

/**
 * 获取日志记录器单例
 */
function getLogger() {
  if (!instance) {
    instance = new Logger();
  }
  return instance;
}

module.exports = {
  Logger,
  getLogger
};
