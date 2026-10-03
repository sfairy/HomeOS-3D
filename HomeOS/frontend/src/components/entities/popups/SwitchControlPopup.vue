/**
 * @file SwitchControlPopup.vue
 * @module components/entities/popups
 * @brief 开关控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 switch 域控制面板
 * - 提供开/关按钮，点击调用 turn_on/turn_off 服务
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Power/ToggleLeft）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase（defineEntityPopupProps/useEntityPopupBase）
 * - @homeos/shared（getEntityDomain）
 */
<template>
  <!-- SwitchControlPopup 开关控制弹窗：控制开关实体 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="240"
    :height="200"
    accent="#60a5fa"
    accent-rgb="96, 165, 250"
    shell-class="popup-shell--compact"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="ToggleLeft">
      <template #status>
        <span :class="isOn ? 'scp-state-on' : 'scp-state-off'">{{ isOn ? '开启' : '关闭' }}</span>
        <span
          v-if="isOn"
          class="popup-status-dot popup-status-dot--pulse scp-dot-on shadow-[0_0_6px_#34d399]"
        />
      </template>
    </PopupHead>

    <div class="flex flex-col gap-4">
      <button
        type="button"
        :class="[
          'flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm transition-all',
          isOn
            ? 'scp-btn-on'
            : 'bg-white/5 scp-btn-off border border-white/10 hover:bg-white/10 hover:text-white',
        ]"
        @click.stop="togglePower"
      >
        <Power class="w-4 h-4" />
        <span>{{ isOn ? '关闭' : '开启' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 SwitchControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * SwitchControlPopup - 开关控制弹窗组件
 * 功能特性：
 * - 控制开关的开启/关闭
 * - 显示当前状态
 * - 弹出式面板
 */
import { computed } from 'vue'
import { Power, ToggleLeft } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { getEntityDomain } from '@homeos/shared'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityName, callService } = useEntityPopupBase(props)

const isOn = computed(() => liveEntity.value?.state === 'on')

async function togglePower() {
  const domain = getEntityDomain(liveEntity.value?.entity_id)
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  await callService(domain, svc, liveEntity.value.entity_id, undefined, '开关失败')
}
</script>

<style src="./styles/PopupAccents.css"></style>
