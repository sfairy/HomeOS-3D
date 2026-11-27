<template>
  <div
    :class="['hos-degrade-banner', `hos-degrade-banner--${variant}`]"
    role="status"
    :title="variant === 'inline' ? detail || text : undefined"
  >
    <WifiOff
      v-if="!entitiesStore.connected && !entitiesStore.reconnecting"
      class="hos-degrade-banner__icon"
      aria-hidden="true"
    />
    <Loader2
      v-else-if="entitiesStore.reconnecting"
      class="hos-degrade-banner__icon hos-degrade-banner__icon--spin"
      aria-hidden="true"
    />
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

<script setup lang="ts">
/** - 图标三态：断连 WifiOff、重连中 Loader2、已连接但过期 AlertTriangle； */
import { computed } from 'vue'
import { WifiOff, Loader2, AlertTriangle } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'

withDefaults(
  defineProps<{
    /** 横幅标题（如「安防数据降级」「事件数据降级」） */
    title: string
    /** 降级描述文案（inline 形态下应传短摘要，整句会被裁） */
    text: string
    /** 完整文案；inline 形态作为悬停提示（tooltip），不占布局 */
    detail?: string
    /**
     * 展示形态。
     * - `banner`：独立整行横幅（默认，独占一行，会挤占下方内容高度）
     * - `inline`：并入工具栏的单行状态胶囊，不新增布局行（完整文案走 title 提示）
     */
    variant?: 'banner' | 'inline'
  }>(),
  { variant: 'banner', detail: '' },
)

const emit = defineEmits(['retry'])

const entitiesStore = useEntitiesStore()

const retryLabel = computed(() => (entitiesStore.connected && !entitiesStore.reconnecting ? '刷新' : '重试连接'))
</script>
