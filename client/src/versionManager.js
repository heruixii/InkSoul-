/**
 * 前端版本号管理模块
 * 用于监控角色卡版本变化并自动刷新数据
 */

// ==================== 配置 ====================

const CONFIG = {
  versionCheckInterval: 30000, // 版本检查间隔（毫秒），默认 30 秒
  apiBaseUrl: 'http://localhost:3001',
  versionEndpoint: '/api/characters/versions',
  characterEndpoint: '/api/characters/raw',
  localStoragePrefix: 'character_version_',
  cachePrefix: 'character_cache_',
  cacheExpiry: 24 * 60 * 60 * 1000 // 缓存过期时间（毫秒），默认 24 小时
};

// ==================== 版本管理器类 ====================

class VersionManager {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...options };
    this.localVersions = new Map();
    this.remoteVersions = new Map();
    this.checkInterval = null;
    this.listeners = new Map();
    this.isChecking = false;
    
    // 从 localStorage 加载本地版本
    this.loadLocalVersions();
  }

  /**
   * 从 localStorage 加载本地版本号
   */
  loadLocalVersions() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.config.localStoragePrefix)) {
          const characterId = key.replace(this.config.localStoragePrefix, '');
          const version = localStorage.getItem(key);
          this.localVersions.set(characterId, parseInt(version, 10));
        }
      }
      console.log('[VersionManager] 已加载', this.localVersions.size, '个本地版本号');
    } catch (error) {
      console.error('[VersionManager] 加载本地版本号失败:', error);
    }
  }

  /**
   * 保存本地版本号
   */
  saveLocalVersion(characterId, version) {
    try {
      localStorage.setItem(this.config.localStoragePrefix + characterId, version);
      this.localVersions.set(characterId, version);
    } catch (error) {
      console.error('[VersionManager] 保存本地版本号失败:', error);
    }
  }

  /**
   * 获取本地版本号
   */
  getLocalVersion(characterId) {
    return this.localVersions.get(characterId) || null;
  }

  /**
   * 获取远程版本号
   */
  getRemoteVersion(characterId) {
    return this.remoteVersions.get(characterId) || null;
  }

  /**
   * 从服务器获取所有版本号
   */
  async fetchRemoteVersions() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const response = await fetch(this.config.apiBaseUrl + this.config.versionEndpoint);
      const data = await response.json();

      if (data.success) {
        this.remoteVersions = new Map(Object.entries(data.versions));
        console.log('[VersionManager] 已获取', this.remoteVersions.size, '个远程版本号');
        return data.versions;
      } else {
        throw new Error('获取版本号失败');
      }
    } catch (error) {
      console.error('[VersionManager] 获取远程版本号失败:', error);
      throw error;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 检查版本变化
   */
  async checkVersionChanges(characterIds = null) {
    try {
      await this.fetchRemoteVersions();

      const changes = [];

      if (characterIds) {
        // 检查指定的角色卡
        for (const id of characterIds) {
          const local = this.getLocalVersion(id);
          const remote = this.getRemoteVersion(id);

          if (remote && (!local || local < remote)) {
            changes.push({ id, local, remote });
          }
        }
      } else {
        // 检查所有角色卡
        for (const [id, remote] of this.remoteVersions) {
          const local = this.getLocalVersion(id);

          if (!local || local < remote) {
            changes.push({ id, local, remote });
          }
        }
      }

      // 通知监听器
      for (const change of changes) {
        this.notifyListeners(change.id, change.local, change.remote);
      }

      return changes;
    } catch (error) {
      console.error('[VersionManager] 检查版本变化失败:', error);
      return [];
    }
  }

  /**
   * 添加版本变化监听器
   */
  onVersionChange(characterId, callback) {
    if (!this.listeners.has(characterId)) {
      this.listeners.set(characterId, []);
    }
    this.listeners.get(characterId).push(callback);
  }

  /**
   * 移除版本变化监听器
   */
  offVersionChange(characterId, callback) {
    if (this.listeners.has(characterId)) {
      const callbacks = this.listeners.get(characterId);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 通知监听器
   */
  notifyListeners(characterId, oldVersion, newVersion) {
    if (this.listeners.has(characterId)) {
      const callbacks = this.listeners.get(characterId);
      callbacks.forEach(callback => {
        try {
          callback(characterId, oldVersion, newVersion);
        } catch (error) {
          console.error('[VersionManager] 监听器执行失败:', error);
        }
      });
    }
  }

  /**
   * 启动定期检查
   */
  startPeriodicCheck(interval = this.config.versionCheckInterval) {
    this.stopPeriodicCheck();
    
    // 立即检查一次
    this.checkVersionChanges();

    this.checkInterval = setInterval(() => {
      this.checkVersionChanges();
    }, interval);

    console.log('[VersionManager] 已启动定期检查，间隔:', interval, 'ms');
  }

  /**
   * 停止定期检查
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[VersionManager] 已停止定期检查');
    }
  }

  /**
   * 获取角色卡数据（带缓存）
   */
  async getCharacter(characterId, forceRefresh = false) {
    const cacheKey = this.config.cachePrefix + characterId;

    // 尝试从缓存读取
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheData = JSON.parse(cached);
          
          // 检查缓存是否过期
          if (Date.now() - cacheData.timestamp < this.config.cacheExpiry) {
            // 检查版本是否匹配
            const localVersion = this.getLocalVersion(characterId);
            if (!localVersion || localVersion === cacheData.version) {
              console.log('[VersionManager] 从缓存加载角色卡:', characterId);
              return cacheData.data;
            }
          }
        }
      } catch (error) {
        console.error('[VersionManager] 读取缓存失败:', error);
      }
    }

    // 从服务器加载
    try {
      const response = await fetch(this.config.apiBaseUrl + this.config.characterEndpoint + '/' + encodeURIComponent(characterId));
      const data = await response.json();

      if (data.success) {
        // 保存到缓存
        const cacheData = {
          data: data.data,
          version: data.version,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        
        // 更新本地版本号
        this.saveLocalVersion(characterId, data.version);
        
        console.log('[VersionManager] 从服务器加载角色卡:', characterId, '版本:', data.version);
        return data.data;
      } else {
        throw new Error(data.error || '获取角色卡失败');
      }
    } catch (error) {
      console.error('[VersionManager] 获取角色卡失败:', error);
      throw error;
    }
  }

  /**
   * 清除角色卡缓存
   */
  clearCharacterCache(characterId) {
    const cacheKey = this.config.cachePrefix + characterId;
    localStorage.removeItem(cacheKey);
    console.log('[VersionManager] 已清除角色卡缓存:', characterId);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.config.cachePrefix) || key.startsWith(this.config.localStoragePrefix)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('[VersionManager] 已清除所有缓存，共', keysToRemove.length, '项');
  }

  /**
   * 手动刷新所有角色卡
   */
  async refreshAll() {
    console.log('[VersionManager] 开始刷新所有角色卡...');
    
    try {
      const changes = await this.checkVersionChanges();
      
      for (const change of changes) {
        await this.getCharacter(change.id, true);
      }
      
      console.log('[VersionManager] 刷新完成，共', changes.length, '个角色卡');
      return changes;
    } catch (error) {
      console.error('[VersionManager] 刷新失败:', error);
      throw error;
    }
  }
}

// ==================== 单例模式 ====================

let instance = null;

/**
 * 获取版本管理器单例
 */
export function getVersionManager(options) {
  if (!instance) {
    instance = new VersionManager(options);
  }
  return instance;
}

/**
 * 重置版本管理器（用于测试）
 */
export function resetVersionManager() {
  if (instance) {
    instance.stopPeriodicCheck();
    instance = null;
  }
}

// ==================== 导出 ====================

export { VersionManager, CONFIG };
