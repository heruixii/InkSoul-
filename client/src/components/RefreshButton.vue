<template>
  <div class="refresh-button-container">
    <button
      @click="handleRefresh"
      :disabled="isRefreshing"
      class="refresh-button"
    >
      <span v-if="!isRefreshing">🔄</span>
      <span v-else>⏳</span>
      <span>{{ isRefreshing ? '刷新中...' : '刷新角色卡' }}</span>
    </button>
    <div v-if="lastRefreshTime" class="last-refresh-time">
      上次刷新: {{ formatTime(lastRefreshTime) }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useVersionManager } from '../composables/useVersionManager';

const emit = defineEmits(['refresh']);

const { refreshAll } = useVersionManager();

const isRefreshing = ref(false);
const lastRefreshTime = ref(null);

const handleRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshAll();
    lastRefreshTime.value = new Date();
    emit('refresh');
  } catch (error) {
    console.error('刷新失败:', error);
    alert('刷新失败，请重试');
  } finally {
    isRefreshing.value = false;
  }
};

const formatTime = (date) => {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<style scoped>
.refresh-button-container {
  display: inline-block;
}

.refresh-button {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  font-size: 14px;
}

.refresh-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.last-refresh-time {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}
</style>
