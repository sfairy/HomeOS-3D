<!--
  浮动组件编辑器 - 标签页视图区段。配置面板默认 Tab 与可见视图，并按组件类型提供
  趋势传感器、播放器实体、快捷开关实体的多选绑定。
-->
<script setup>
import { computed } from 'vue'
import { Settings2 } from '@lucide/vue'
import HubTabsConfigField from '../widgets/HubTabsConfigField.vue'
import EntityMultiSelect from '@/components/common/entity-multi-select/EntityMultiSelect.vue'
import { hubTabOptions } from '@/features/settings/display/composables/layout-floating.internals'
import { useDraftObjectField } from '@/features/settings/shared/composables/hub-ui.internals'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/shared/entity/utils/comma-entity-ids.util'

const afhHubTabs = defineModel('afhHubTabs', { type: Object, required: true })

defineProps({
  fw: { type: Object, required: true },
})

const afhConfig = defineModel('afhConfig', { type: Object, required: true })

const { field } = useDraftObjectField(() => afhConfig.value)

// Hub Tabs 双向计算属性：合并 defaultTab 与 visibleTabs 读写
const hubTabsModel = computed({
  get: () => ({
    defaultTab: String(afhHubTabs.value?.defaultTab || ''),
    visibleTabs: Array.isArray(afhHubTabs.value?.visibleTabs)
      ? [...afhHubTabs.value.visibleTabs]
      : [],
  }),
  set: (val) => {
    if (!val || typeof val !== 'object') return
    if (!afhHubTabs.value || typeof afhHubTabs.value !== 'object') {
      afhHubTabs.value = {
        defaultTab: val.defaultTab,
        visibleTabs: Array.isArray(val.visibleTabs) ? [...val.visibleTabs] : [],
      }
      return
    }
    afhHubTabs.value.defaultTab = val.defaultTab
    afhHubTabs.value.visibleTabs = Array.isArray(val.visibleTabs) ? [...val.visibleTabs] : []
  },
})

const sensorIdsModel = field('sensorIds')
const playerEntitiesModel = field('playerEntities')
const quickSwitchEntitiesModel = field('quickSwitchEntities')

// 趋势传感器 id 列表（逗号字符串与数组互转）
const sensorIdsList = computed({
  get: () => parseCommaEntityIds(sensorIdsModel?.value),
  set: (ids) => {
    if (sensorIdsModel) sensorIdsModel.value = joinCommaEntityIds(ids)
  },
})

// 播放器实体 id 列表（逗号字符串与数组互转）
const playerEntitiesList = computed({
  get: () => parseCommaEntityIds(playerEntitiesModel?.value),
  set: (ids) => {
    if (playerEntitiesModel) playerEntitiesModel.value = joinCommaEntityIds(ids)
  },
})
</script>

<template>
  <div class="afh-section afh-section--tabs">
    <header class="afh-section__head">
      <div class="afh-section__lead">
        <span class="afh-section__badge afh-section__badge--amber"><Settings2 /></span>
        <div>
          <h4 class="afh-section__title">{{ '标签页视图' }}</h4>
          <p class="afh-section__desc">{{ '配置面板默认 Tab 与可见视图' }}</p>
        </div>
      </div>
    </header>

    <HubTabsConfigField
      :key="`${fw.id}-hub-tabs`"
      v-model="hubTabsModel"
      :tab-set="hubTabOptions(fw.type) || []"
    />

    <div
      v-if="fw.type === 'climateHub' && afhHubTabs?.visibleTabs?.includes('trend')"
      class="afh-form__field afh-form__field--spaced"
    >
      <span class="afh-form__label">{{ '趋势传感器（留空自动发现）' }}</span>
      <EntityMultiSelect
        v-model="sensorIdsList"
        :allowed-domains="['sensor']"
        placeholder="搜索并选择趋势传感器"
      />
    </div>
    <div v-if="fw.type === 'mediaMini'" class="afh-form__field afh-form__field--spaced">
      <span class="afh-form__label">{{ '播放器实体（留空自动发现）' }}</span>
      <EntityMultiSelect
        v-model="playerEntitiesList"
        :allowed-domains="['media_player']"
        placeholder="搜索并选择播放器"
      />
    </div>
    <div v-if="fw.type === 'switchGroup'" class="afh-form__field afh-form__field--spaced">
      <span class="afh-form__label">{{ '快捷开关实体' }}</span>
      <p class="afh-form__hint">{{ '用于「快捷」页，支持 switch / input_boolean 实体。' }}</p>
      <EntityMultiSelect
        v-model="quickSwitchEntitiesModel"
        :allowed-domains="['switch', 'input_boolean']"
        placeholder="搜索并选择快捷开关"
      />
    </div>
  </div>
</template>
