/**
 * File Cache Module - 文件缓存模块
 * 
 * 用途：LRU 缓存已加载的 JSON 数据，避免重复解析大文件
 * 
 * 特性：
 * - LRU 缓存策略
 * - TTL 过期机制
 * - 异步预加载高频数据
 * - 文件变更检测（避免缓存失效）
 * 
 * 使用方法：
 * const fileCache = require('./file-cache');
 * const data = await fileCache.get('data/character_attributes_cache.json');
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100; // 最大缓存条目数
    this.ttl = options.ttl || 5 * 60 * 1000; // 默认 TTL 5 分钟
    this.fileStats = new Map(); // 文件统计信息（用于变更检测）
    this.preloadQueue = []; // 预加载队列
    this.isPreloading = false;
  }

  /**
   * 生成缓存键
   */
  _getCacheKey(filePath) {
    return path.resolve(filePath);
  }

  /**
   * 计算文件内容的哈希值（用于变更检测）
   */
  async _getFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查文件是否已变更
   */
  async _hasFileChanged(filePath, cachedHash) {
    try {
      const stats = await fs.stat(filePath);
      const currentHash = await this._getFileHash(filePath);
      return currentHash !== cachedHash;
    } catch (error) {
      return true; // 文件不存在或读取失败，视为已变更
    }
  }

  /**
   * 解析 JSON 文件
   */
  async _parseJSON(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`文件解析失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 淘汰最旧的缓存条目（LRU）
   */
  _evictOldest() {
    if (this.cache.size >= this.maxSize) {
      // 找到最旧的条目
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.fileStats.delete(oldestKey);
        console.log(`[FileCache] 淘汰缓存: ${oldestKey}`);
      }
    }
  }

  /**
   * 获取缓存数据
   */
  async get(filePath, options = {}) {
    const cacheKey = this._getCacheKey(filePath);
    const customTTL = options.ttl || this.ttl;
    const skipCache = options.skipCache || false;

    // 如果跳过缓存，直接读取
    if (skipCache) {
      return await this._parseJSON(filePath);
    }

    // 检查缓存是否存在且未过期
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp < customTTL)) {
      // 检查文件是否已变更
      const hasChanged = await this._hasFileChanged(filePath, cached.hash);
      
      if (!hasChanged) {
        // 更新访问时间（LRU）
        cached.timestamp = now;
        cached.accessCount = (cached.accessCount || 0) + 1;
        return cached.data;
      } else {
        // 文件已变更，删除缓存
        this.cache.delete(cacheKey);
        this.fileStats.delete(cacheKey);
        console.log(`[FileCache] 文件已变更，删除缓存: ${filePath}`);
      }
    }

    // 读取文件
    const data = await this._parseJSON(filePath);
    const hash = await this._getFileHash(filePath);

    // 淘汰最旧的条目
    this._evictOldest();

    // 存入缓存
    this.cache.set(cacheKey, {
      data,
      hash,
      timestamp: now,
      accessCount: 1
    });

    this.fileStats.set(cacheKey, {
      size: JSON.stringify(data).length,
      lastModified: now
    });

    console.log(`[FileCache] 缓存文件: ${filePath} (${this.formatSize(JSON.stringify(data).length)})`);
    
    return data;
  }

  /**
   * 预加载高频数据
   */
  async preload(filePaths) {
    if (this.isPreloading) {
      this.preloadQueue.push(...filePaths);
      return;
    }

    this.isPreloading = true;
    console.log(`[FileCache] 开始预加载 ${filePaths.length} 个文件...`);

    for (const filePath of filePaths) {
      try {
        await this.get(filePath);
      } catch (error) {
        console.error(`[FileCache] 预加载失败: ${filePath}`, error);
      }
    }

    console.log(`[FileCache] 预加载完成`);
    this.isPreloading = false;

    // 处理队列中的文件
    if (this.preloadQueue.length > 0) {
      const queue = this.preloadQueue;
      this.preloadQueue = [];
      await this.preload(queue);
    }
  }

  /**
   * 清除指定文件的缓存
   */
  invalidate(filePath) {
    const cacheKey = this._getCacheKey(filePath);
    this.cache.delete(cacheKey);
    this.fileStats.delete(cacheKey);
    console.log(`[FileCache] 清除缓存: ${filePath}`);
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
    this.fileStats.clear();
    console.log(`[FileCache] 清除所有缓存`);
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: [],
      totalSize: 0
    };

    for (const [key, value] of this.cache.entries()) {
      const fileStats = this.fileStats.get(key);
      stats.entries.push({
        path: key,
        accessCount: value.accessCount || 0,
        age: Date.now() - value.timestamp,
        size: fileStats?.size || 0
      });
      stats.totalSize += fileStats?.size || 0;
    }

    return stats;
  }

  /**
   * 格式化文件大小
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// 创建单例实例
const fileCache = new FileCache({
  maxSize: 100,
  ttl: 5 * 60 * 1000 // 5 分钟
});

module.exports = fileCache;
