<!--
组件：SystemConfigSearchView.vue
所属模块：frontend / src / views / settings / system / system-config
职责：高级参数全局搜索结果视图。按分区分组展示匹配字段，点击可跳转至对应分区；
      无匹配时展示空态引导。
Props：
  - results：搜索结果分组列表
关键依赖：
  - SettingsCard：卡片容器
数据来源：父级透传的 results
-->
<template>
  <SettingsCard flat static extra-class="!p-0 params-panel-card params-panel-card--body">
    <div
      v-if="results.length === 0"
      class="settings-premium-empty settings-premium-empty--sky params-panel-empty"
    >
      <Search class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '没有匹配的参数' }}</p>
      <p class="settings-premium-empty__desc">{{ '尝试更换关键词，或关闭全局搜索浏览分组' }}</p>
    </div>
    <div v-else class="params-search-groups">
      <section
        v-for="group in groupedResults"
        :id="`search-sec-${group.sectionKey}`"
        :key="group.sectionKey"
        class="params-search-group"
      >
        <button
          type="button"
          class="params-search-group__head"
          @click="$emit('jump-section', group.sectionKey)"
        >
          <span class="params-search-group__title">{{ group.sectionLabel }}</span>
          <span class="params-search-group__count">{{ group.items.length }}</span>
          <span class="params-search-group__hint">{{ '打开分区' }}</span>
        </button>
        <div class="params-field-list params-field-list--search">
          <SystemConfigFieldCell
            v-for="item in group.items"
            :key="`${item.section.key}-${item.field.key}`"
            :field="item.field"
            :input-id="searchFieldId(item)"
            :label="fieldLabel(item.field, item.section.key)"
            :hint="fieldHint(item.field, item.section.key)"
            :show-dev-key="showDevKeys"
            :section-tag="item.section.label"
            :modified="isFieldPending(item.section.key, item.field.key)"
            @update:value="$emit('field-value', item.field, $event)"
            @update:is-masked="$emit('field-masked', item.field, $event)"
          />
        </div>
      </section>
    </div>
  </SettingsCard>
</template>

<script setup>
import { computed } from 'vue'
import { Search } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SystemConfigFieldCell from '@/features/settings/shared/system-config/SystemConfigFieldCell.vue'
import { groupSearchResultsBySection } from '@/features/settings/shared/system-config/field-groups.util'

const props = defineProps({
  results: { type: Array, required: true },
  showDevKeys: { type: Boolean, default: false },
  searchFieldId: { type: Function, required: true },
  fieldLabel: { type: Function, required: true },
  fieldHint: { type: Function, required: true },
  isFieldPending: { type: Function, required: true },
})

defineEmits(['field-value', 'field-masked', 'jump-section'])

const groupedResults = computed(() => groupSearchResultsBySection(props.results))
</script>
