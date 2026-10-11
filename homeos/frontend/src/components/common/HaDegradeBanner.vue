<template>
  <div class="hos-degrade-banner" role="status">
    <!-- 离线：HA 已断连且非重连中 -->
    <WifiOff
      v-if="!entitiesStore.connected && !entitiesStore.reconnecting"
      class="hos-degrade-banner__icon"
      aria-hidden="true"
    />
    <!-- 重连中 -->
    <Loader2
      v-else-if="entitiesStore.reconnecting"
      class="hos-degrade-banner__icon hos-degrade-banner__icon--spin"
      aria-hidden="true"
    />
    <!-- 已连接但数据过期 / 部分离线 -->
    <AlertTriangle
      v-else
      class="hos-degrade-banner__icon"
      aria-hidden="true"
    />
    <div class="hos-degrade-banner__body">
      <p class="hos-degrade-banner__title">{{ title }}</p>
      <p class="hos-degrade-banner__text">{{ text }}</p>
    </div>
    <button
      type="button"
      class="hos-degrade-banner__retry focus-ring"
      @click="emit('retry')"
    >
      {{ retryLabel }}
    </button>
  </div>
</template>

<script setup>
/** - 图标三态：断连 WifiOff、重连中 Loader2、已连接但过期 AlertTriangle； */
import { computed } from 'vue'
import { WifiOff, Loader2, AlertTriangle } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'

defineProps({
  /** 横幅标题（如「安防数据降级」「事件数据降级」） */
  title: { type: String, required: true },
  /** 降级描述文案 */
  text: { type: String, required: true },
})

const emit = defineEmits(['retry'])

const entitiesStore = useEntitiesStore()

const retryLabel = computed(() =>
  entitiesStore.connected && !entitiesStore.reconnecting ? '刷新' : '重试连接',
)
</script>
