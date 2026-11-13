<script setup>
import { Home, MapPin } from '@lucide/vue'

/**
 * 「在家人数 + 判定模式」摘要行。
 *
 * 抽出来的原因：`PresenceSection` 的两套头部（完整 `SettingsSectionHead` 与嵌入态的
 * `linkage-pane-toolbar`）各写了一遍这段标记，连图标尺寸与 `--home` 修饰类都必须同步。
 * 判定逻辑仍留在 `usePresenceEntitiesDisplay`，这里只负责呈现。
 */
defineProps({
  /** 加载中不展示摘要（避免闪出一行过期数字） */
  loading: { type: Boolean, default: false },
  /** 在家高亮样式：住户维度还是设备维度 */
  showHomeSummaryStyle: { type: Boolean, default: false },
  /** 例如「2 人在家」 */
  summaryText: { type: String, default: '' },
  /** 例如「全部判定实体在家才算在家」 */
  modeHint: { type: String, default: '' },
})
</script>

<template>
  <div v-if="!loading" class="linkage-presence-meta">
    <span :class="['linkage-presence-status', showHomeSummaryStyle && 'linkage-presence-status--home']">
      <Home v-if="showHomeSummaryStyle" class="w-3.5 h-3.5 shrink-0" />
      <MapPin v-else class="w-3.5 h-3.5 shrink-0" />
      {{ summaryText }}
    </span>
    <span class="linkage-presence-mode">{{ modeHint }}</span>
  </div>
</template>
