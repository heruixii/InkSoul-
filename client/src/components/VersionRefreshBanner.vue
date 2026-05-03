<template>
  <div v-if="showBanner" class="version-refresh-banner">
    <div class="banner-content">
      <div class="banner-icon">🔄</div>
      <div class="banner-text">
        <div class="banner-title">角色卡已更新</div>
        <div class="banner-subtitle">发现 {{ changedCount }} 个角色卡有新版本</div>
      </div>
    </div>
    <div class="banner-actions">
      <button 
        @click="handleRefresh" 
        :disabled="isRefreshing"
        class="btn btn-primary"
      >
        {{ isRefreshing ? '刷新中...' : '立即刷新' }}
      </button>
      <button @click="handleDismiss" class="btn btn-secondary">
        稍后
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useVersionManager } from '../composables/useVersionManager';

const props = defineProps({
  autoDismiss: {
    type: Boolean,
    default: false
  },
  dismissTimeout: {
    type: Number,
    default: 10000 // 10 秒后自动消失
  }
});

const emit = defineEmits(['refresh', 'dismiss']);

const {
  changedCount,
  refreshAll,
  onVersionChange,
  offVersionChange
} = useVersionManager();

const showBanner = ref(false);
const isRefreshing = ref(false);

const handleVersionChange = (characterId, oldVersion, newVersion) => {
  console.log(`[VersionBanner] ${characterId} 版本变化: ${oldVersion} -> ${newVersion}`);
  showBanner.value = true;
  
  if (props.autoDismiss) {
    setTimeout(() => {
      handleDismiss();
    }, props.dismissTimeout);
  }
};

const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshAll();
    showBanner.value = false;
    emit('refresh');
  } catch (error) {
    console.error('刷新失败:', error);
    alert('刷新失败，请重试');
  } finally {
    isRefreshing.value = false;
  }
};

const handleDismiss = () => {
  showBanner.value = false;
  emit('dismiss');
};

onMounted(() => {
  // 监听所有版本变化
  onVersionChange('*', handleVersionChange);
});

onUnmounted(() => {
  offVersionChange('*', handleVersionChange);
});
</script>

<style scoped>
.version-refresh-banner {
  position: fixed;
  top: 20px;
  right: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 24px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  max-width: 400px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.banner-icon {
  font-size: 24px;
}

.banner-text {
  flex: 1;
}

.banner-title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 4px;
}

.banner-subtitle {
  font-size: 14px;
  opacity: 0.9;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: white;
  color: #667eea;
}

.btn-primary:hover:not(:disabled) {
  background: #f8f9ff;
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: white;
  border: 1px solid white;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
