<template>
  <div v-if="localVersion || remoteVersion" class="character-version-info" :class="{ outdated: isOutdated }">
    <span>版本: {{ localVersion || '未知' }}</span>
    <span v-if="isOutdated" class="version-arrow">→</span>
    <span v-if="isOutdated" class="version-new">{{ remoteVersion }}</span>
    <span v-if="isOutdated" class="version-warning">⚠️</span>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useVersionManager } from '../composables/useVersionManager';

const props = defineProps({
  characterId: {
    type: String,
    required: true
  }
});

const { localVersions, remoteVersions, onVersionChange, offVersionChange } = useVersionManager();

const localVersion = ref(null);
const remoteVersion = ref(null);
const isOutdated = ref(false);

const updateVersions = () => {
  localVersion.value = localVersions.value.get(props.characterId) || null;
  remoteVersion.value = remoteVersions.value.get(props.characterId) || null;
  isOutdated.value = remoteVersion.value && (!localVersion.value || localVersion.value < remoteVersion.value);
};

const handleVersionChange = (id, oldVersion, newVersion) => {
  if (id === props.characterId) {
    updateVersions();
  }
};

onMounted(() => {
  updateVersions();
  onVersionChange(props.characterId, handleVersionChange);
});

onUnmounted(() => {
  offVersionChange(props.characterId, handleVersionChange);
});
</script>

<style scoped>
.character-version-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: #d4edda;
  border-radius: 4px;
  font-size: 12px;
  color: #155724;
}

.character-version-info.outdated {
  background: #fff3cd;
  color: #856404;
}

.version-arrow {
  margin: 0 4px;
}

.version-new {
  font-weight: 600;
  color: #856404;
}

.version-warning {
  margin-left: 4px;
}
</style>
