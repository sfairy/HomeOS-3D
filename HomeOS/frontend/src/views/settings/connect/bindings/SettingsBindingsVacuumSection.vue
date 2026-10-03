<!--
组件：SettingsBindingsVacuumSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：扫地机地图绑定分区。将 vacuum.* 与小米云地图提取器生成的 camera.* 成对绑定，
      支持新增/移除绑定行，并以流程概览展示总对数与完整绑定数。
关键依赖：
  - EntityInput：vacuum/camera 实体选择
  - SettingsFlowBand / SettingsFlowStat：流程概览
数据来源：父级透传的 vacuumMaps（双向）+ remove emit 回调
-->
<template>
  <div class="settings-hub-section bind-vacuum-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="vacuumFlowSteps"
        class="bind-vac-flow"
        band-class="bind-vac-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="vacuumFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'绑定对数'"
            :value="`${vacuumMaps.length} 对`"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'完整绑定'"
            :value="completeCount"
            tone="emerald"
            val-tone="emerald"
          />
        </template>
      </SettingsFlowBand>

      <header class="bind-section__head">
        <div>
          <p class="bind-section__eyebrow">{{ '小米 / 石头' }}</p>
          <h3 class="bind-section__title">{{ '扫地机地图' }}</h3>
          <p class="bind-section__desc">
            {{
              '将 vacuum.* 与小米云地图提取器生成的 camera.* 成对绑定。需先在 Home Assistant 安装并配置该组件。'
            }}
          </p>
        </div>
        <span v-if="vacuumMaps.length" class="bind-section__badge">{{
          `${vacuumMaps.length} 对`
        }}</span>
      </header>

      <div v-if="vacuumMaps.length" class="bind-vac-list">
        <article v-for="(row, idx) in vacuumMaps" :key="idx" class="bind-vac-card">
          <header class="bind-vac-card__head">
            <span class="bind-vac-card__index">{{ idx + 1 }}</span>
            <button
              type="button"
              class="bind-vac-card__delete"
              :title="'移除绑定'"
              :aria-label="'移除绑定'"
              @click="$emit('remove', idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </header>
          <div class="bind-vac-card__fields">
            <label class="bind-vac-field">
              <span class="bind-vac-field__label">{{ '扫地机' }}</span>
              <EntityInput
                v-model="row.vacuumEntityId"
                :placeholder="'vacuum.xxx'"
                domain-filter="vacuum"
              />
            </label>
            <label class="bind-vac-field">
              <span class="bind-vac-field__label">{{ '地图 Camera' }}</span>
              <EntityInput
                v-model="row.mapCameraEntityId"
                :placeholder="'camera.xiaomi_cloud_map_extractor'"
                domain-filter="camera"
              />
            </label>
          </div>
        </article>
      </div>
      <div v-else class="bind-vac-empty">
        <Bot class="bind-vac-empty__icon" />
        <p class="bind-vac-empty__title">{{ '尚未绑定扫地机地图' }}</p>
        <p class="bind-vac-empty__desc">{{ '点击页头「添加绑定」关联 vacuum 与地图 camera' }}</p>
      </div>

      <p class="settings-note-callout settings-note-callout--emerald mt-4">
        <span class="settings-note-callout__label">{{ '推荐 YAML attributes' }}</span>
        <span>{{
          'calibration_points、rooms、room_numbers、cleaned_rooms、vacuum_position、vacuum_room、vacuum_room_name、map_name、zones。缺 calibration_points 则无法指哪去/划区。'
        }}</span>
      </p>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bot, Camera, Link2, Trash2 } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'

// 双向绑定：扫地机与地图 camera 成对绑定列表
const vacuumMaps = defineModel('vacuumMaps', { type: Array, default: () => [] })

// 对外事件：移除某行绑定
defineEmits(['remove'])

// 完整绑定数：vacuum 与 mapCamera 均已填写的行数
const completeCount = computed(
  () =>
    vacuumMaps.value.filter(
      (r) => String(r?.vacuumEntityId || '').trim() && String(r?.mapCameraEntityId || '').trim(),
    ).length,
)

// 流程概览折叠态摘要文案：总对数 · 完整数
const vacuumFlowSummary = computed(
  () => `${vacuumMaps.value.length} 对 · ${completeCount.value} 完整`,
)

// 流程概览步骤：vacuum → 地图提取器 → 成对绑定
const vacuumFlowSteps = computed(() => [
  { label: 'vacuum.*', meta: `${vacuumMaps.value.length} 台`, icon: Bot, tone: 'in' },
  { label: '地图提取器', meta: 'HA 摄像头', icon: Camera, tone: 'sky' },
  {
    label: '成对绑定',
    meta: `${completeCount.value} 完整`,
    icon: Link2,
    tone: 'out',
  },
])
</script>

<style scoped src="./styles/SettingsBindingsVacuumSection.css"></style>
