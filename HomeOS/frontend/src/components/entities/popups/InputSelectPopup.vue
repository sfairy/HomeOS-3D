/**
 * @file InputSelectPopup.vue
 * @module components/entities/popups
 * @brief 选择输入弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 input_select 域控制面板
 * - 展示可用选项列表，点击切换并调用 select_option 服务
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Check/ListChecks）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、entities.store
 * - @/services/notify（notifyError）、@/utils/entity/derived.util（getEntityDisplayName）
 */
<template>
  <!-- InputSelectPopup 选择输入弹窗：设置 input_select 实体的选项 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="200"
    :height="280"
    accent="#a78bfa"
    accent-rgb="167, 139, 250"
    shell-class="popup-shell--compact-select"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="ListChecks" :eyebrow="currentValue" />

    <div class="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
      <button
        v-for="opt in options"
        :key="opt"
        :class="['select-option', opt === currentValue ? 'select-option--active' : '']"
        @click="selectOption(opt)"
      >
        <span>{{ opt }}</span>
        <Check v-if="opt === currentValue" class="w-3.5 h-3.5 isp-check" />
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 InputSelectPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * InputSelectPopup - 选择输入弹窗组件
 * 功能特性：
 * - 设置 input_select 实体的选项
 * - 展示可用选项列表
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
import { computed } from 'vue'
import { Check, ListChecks } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useEntitiesStore } from '@/stores/entities.store'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])
const es = useEntitiesStore()

const { liveEntity } = useEntityPopupBase(props)

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)
const currentValue = computed(() => liveEntity.value?.state || '')
const options = computed(() => liveEntity.value?.attributes?.options || [])

async function selectOption(opt) {
  const domain = getEntityDomain(liveEntity.value.entity_id)
  try {
    if (domain === 'input_select') {
      await es.callService('input_select', 'select_option', liveEntity.value.entity_id, {
        option: opt,
      })
    } else {
      await es.callService('select', 'select_option', liveEntity.value.entity_id, { option: opt })
    }
  } catch (e) {
    notifyError(e, '选项设置')
  }
}
</script>

<style src="./styles/PopupAccents.css"></style>
