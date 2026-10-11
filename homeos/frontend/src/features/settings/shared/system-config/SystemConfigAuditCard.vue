<!--
  高级参数审计卡片。展示配置变更审计日志（时间、分区、字段、新旧值），按分区标签与字段标签
  本地化渲染。
-->
<template>
  <div class="config-audit">
    <div v-if="showHead" class="config-audit__head">
      <h3 class="config-audit__title">{{ '变更审计' }}</h3>
      <span class="config-audit__meta">{{ `最近 ${entries.length} 条` }}</span>
    </div>
    <div class="config-audit__list">
      <div
        v-for="(entry, i) in entries"
        :key="`${entry.at || ''}-${entry.section || ''}-${entry.action || ''}-${i}`"
        class="config-audit__row"
      >
        <span class="config-audit__time">{{ formatAuditTimestamp(entry.at) }}</span>
        <span
          :class="['config-audit__badge', entry.action === 'reset' && 'config-audit__badge--reset']"
        >
          {{ entry.action === 'reset' ? '重置' : '更新' }}
        </span>
        <span class="config-audit__body">
          <span class="config-audit__section">{{ sectionLabel(entry.section) }} · </span>
          {{ formatAuditKeys(entry) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { formatAuditTimestamp } from '@/shared/utils/format/locale-format.util'

const props = defineProps({
  entries: { type: Array, default: () => [] },
  sectionLabel: { type: Function, required: true },
  fieldLabel: { type: Function, required: true },
  showHead: { type: Boolean, default: false },
})

function formatAuditKeys(entry) {
  return (entry.keys || [])
    .map((key) => props.fieldLabel({ key }, entry.section))
    .join('、')
}
</script>

<style scoped src="./styles/SystemConfigAuditCard.css"></style>
