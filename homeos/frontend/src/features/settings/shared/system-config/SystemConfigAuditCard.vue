<!--
组件：SystemConfigAuditCard.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数审计卡片。展示配置变更审计日志（时间、分区、字段、新旧值），按分区标签与字段标签
      本地化渲染。
Props：
  - entries：审计日志条目列表
  - sectionLabel：分区标签渲染函数
  - fieldLabel：字段标签渲染函数
  - showHead：是否显示表头
关键依赖：
  - formatAuditTimestamp：审计时间戳格式化
数据来源：父级透传的 entries
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
import { formatAuditTimestamp } from '@/utils/format/locale-format.util'

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
