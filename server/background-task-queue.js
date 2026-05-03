/**
 * Background Task Queue - 后台异步任务队列
 * 
 * 用途：将非实时任务移到后台队列，不影响用户请求响应时间
 * 
 * 支持的任务类型：
 * - 记忆压缩
 * - 锚点检测
 * - 日志写入
 * - 数据清理
 * 
 * 特性：
 * - 不阻塞主线程
 * - 使用 setImmediate/event loop
 * - 支持任务优先级
 * - 错误处理和重试
 */

class BackgroundTaskQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3; // 最大并发任务数
    this.queue = [];
    this.running = new Map(); // 正在运行的任务
    this.stats = {
      completed: 0,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * 添加任务到队列
   * @param {Function} task - 任务函数，返回 Promise
   * @param {Object} options - 选项
   * @param {string} options.name - 任务名称
   * @param {number} options.priority - 优先级 (1=高, 2=中, 3=低)
   * @param {number} options.retry - 重试次数
   */
  add(task, options = {}) {
    const {
      name = 'unnamed',
      priority = 2,
      retry = 1
    } = options;

    this.queue.push({
      task,
      name,
      priority,
      retry,
      retryCount: 0
    });

    // 按优先级排序
    this.queue.sort((a, b) => a.priority - b.priority);

    // 尝试执行任务
    this._processQueue();
  }

  /**
   * 处理队列
   */
  _processQueue() {
    // 如果已达到最大并发数，等待
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    // 如果队列为空，返回
    if (this.queue.length === 0) {
      return;
    }

    // 取出下一个任务
    const taskItem = this.queue.shift();
    const taskId = `${taskItem.name}_${Date.now()}`;

    // 执行任务
    this.running.set(taskId, taskItem);

    setImmediate(async () => {
      try {
        await taskItem.task();
        this.stats.completed++;
        console.log(`[BackgroundTask] 完成: ${taskItem.name}`);
      } catch (error) {
        // 重试逻辑
        if (taskItem.retryCount < taskItem.retry) {
          taskItem.retryCount++;
          console.warn(`[BackgroundTask] 重试 (${taskItem.retryCount}/${taskItem.retry}): ${taskItem.name}`);
          this.queue.push(taskItem);
        } else {
          this.stats.failed++;
          console.error(`[BackgroundTask] 失败: ${taskItem.name}`, error.message);
        }
      } finally {
        this.running.delete(taskId);
        // 继续处理队列
        this._processQueue();
      }
    });
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      stats: { ...this.stats },
      runningTasks: Array.from(this.running.values()).map(t => t.name)
    };
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
    console.log('[BackgroundTask] 队列已清空');
  }
}

// 创建全局任务队列实例
const backgroundQueue = new BackgroundTaskQueue({
  maxConcurrent: 3
});

/**
 * 后台任务包装器
 * 将同步任务包装为异步任务，在后台执行
 */
function wrapBackgroundTask(task, options = {}) {
  return async () => {
    return task();
  };
}

module.exports = {
  BackgroundTaskQueue,
  backgroundQueue,
  wrapBackgroundTask
};
