import React, { useState, useEffect } from 'react';
import { getVersionManager } from './versionManager';

/**
 * 版本刷新提示条组件
 * 当检测到角色卡版本变化时显示提示
 */
export function VersionRefreshBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [changedCount, setChangedCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const versionManager = getVersionManager();

  useEffect(() => {
    // 监听版本变化
    const handleVersionChange = (characterId, oldVersion, newVersion) => {
      console.log(`[VersionBanner] ${characterId} 版本变化: ${oldVersion} -> ${newVersion}`);
      setShowBanner(true);
      setChangedCount(prev => prev + 1);
    };

    // 监听所有版本变化
    versionManager.onVersionChange('*', handleVersionChange);

    return () => {
      versionManager.offVersionChange('*', handleVersionChange);
    };
  }, [versionManager]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await versionManager.refreshAll();
      setShowBanner(false);
      setChangedCount(0);
    } catch (error) {
      console.error('刷新失败:', error);
      alert('刷新失败，请重试');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setChangedCount(0);
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      backgroundColor: '#667eea',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
      maxWidth: '400px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '24px' }}>🔄</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            角色卡已更新
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            发现 {changedCount} 个角色卡有新版本
          </div>
        </div>
      </div>
      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            flex: 1,
            padding: '8px 16px',
            backgroundColor: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            opacity: isRefreshing ? 0.6 : 1
          }}
        >
          {isRefreshing ? '刷新中...' : '立即刷新'}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          稍后
        </button>
      </div>
    </div>
  );
}

/**
 * 手动刷新按钮组件
 */
export function RefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  const versionManager = getVersionManager();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await versionManager.refreshAll();
      setLastRefreshTime(new Date());
      alert('刷新成功');
    } catch (error) {
      console.error('刷新失败:', error);
      alert('刷新失败，请重试');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        style={{
          padding: '10px 20px',
          backgroundColor: '#667eea',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: isRefreshing ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isRefreshing ? (
          <>
            <span>⏳</span>
            <span>刷新中...</span>
          </>
        ) : (
          <>
            <span>🔄</span>
            <span>刷新角色卡</span>
          </>
        )}
      </button>
      {lastRefreshTime && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          上次刷新: {lastRefreshTime.toLocaleString()}
        </div>
      )}
    </div>
  );
}

/**
 * 角色卡版本信息显示组件
 */
export function CharacterVersionInfo({ characterId }) {
  const [localVersion, setLocalVersion] = useState(null);
  const [remoteVersion, setRemoteVersion] = useState(null);

  const versionManager = getVersionManager();

  useEffect(() => {
    // 获取本地和远程版本
    const updateVersions = () => {
      setLocalVersion(versionManager.getLocalVersion(characterId));
      setRemoteVersion(versionManager.getRemoteVersion(characterId));
    };

    updateVersions();

    // 监听版本变化
    const handleVersionChange = (id, oldVersion, newVersion) => {
      if (id === characterId) {
        updateVersions();
      }
    };

    versionManager.onVersionChange(characterId, handleVersionChange);

    return () => {
      versionManager.offVersionChange(characterId, handleVersionChange);
    };
  }, [characterId, versionManager]);

  if (!localVersion && !remoteVersion) {
    return null;
  }

  const isOutdated = remoteVersion && localVersion < remoteVersion;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 8px',
      backgroundColor: isOutdated ? '#fff3cd' : '#d4edda',
      borderRadius: '4px',
      fontSize: '12px'
    }}>
      <span>版本: {localVersion || '未知'}</span>
      {isOutdated && (
        <>
          <span>→</span>
          <span style={{ fontWeight: 600, color: '#856404' }}>
            {remoteVersion}
          </span>
          <span style={{ marginLeft: '4px' }}>⚠️</span>
        </>
      )}
    </div>
  );
}
