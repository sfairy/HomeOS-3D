/**
 * @file RemoteControlPopup.vue
 * @module components/entities/popups
 * @brief 遥控器控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 remote 域控制面板
 * - 展示并切换当前 activity（来自 activity_list 或自定义电源/音量按钮）
 * - 支持遥控学习模式（learn_command / key press）
 *
 * 依赖：
 * - vue（computed/ref）、@lucide/vue（Power/Tv/Volume2/Home/Circle）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="320"
    accent="#94a3b8"
    accent-rgb="148, 163, 184"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Tv" :eyebrow="isOn ? '已开启' : '已关闭'" />

    <div class="flex flex-wrap justify-center gap-2.5 mb-4">
      <button
        v-for="a in activities"
        :key="a.name"
        :class="['mode-card', currentActivity === a.name ? 'mode-card--active' : '']"
        @click.stop="sendCommand(a.name)"
      >
        <component :is="a.icon" class="w-5 h-5 mb-1 rcp-activity-icon" />
        <span class="text-xs font-bold tracking-wider">{{ a.label }}</span>
      </button>
    </div>

    <div class="flex items-center justify-between px-1 gap-2">
      <button
        type="button"
        class="popup-off-btn shrink-0 bg-white/5 rcp-learn-btn hover:bg-white/10 border-white/5"
        :disabled="learning"
        @click.stop="learnCommand"
      >
        <span>{{ learning ? '学习中，请对准遥控器…' : '学习红外' }}</span>
      </button>
      <button
        :class="['popup-off-btn shrink-0', !isOn ? 'rcp-power-btn--on' : 'rcp-power-btn--off']"
        @click.stop="togglePower"
      >
        <Power class="w-3.5 h-3.5" />
        <span>{{ isOn ? '关闭' : '开启' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 RemoteControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref } from 'vue'
import { Power, Tv, Volume2, Home, Circle } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityName, callService } = useEntityPopupBase(props)
const learning = ref(false)

const s = computed(() => liveEntity.value?.state)
const isOn = computed(() => s.value === 'on')
const currentActivity = computed(() => liveEntity.value?.attributes?.current_activity || null)

const activities = computed(() => {
  const list = liveEntity.value?.attributes?.activity_list
  if (Array.isArray(list) && list.length > 0) {
    return list.map((name) => ({ name, icon: Circle, label: name }))
  }
  return [
    { name: 'power', icon: Power, label: '电源' },
    { name: 'volume_up', icon: Volume2, label: '音量+' },
    { name: 'volume_down', icon: Volume2, label: '音量-' },
    { name: 'channel_up', icon: Tv, label: '频道+' },
    { name: 'channel_down', icon: Tv, label: '频道-' },
    { name: 'home', icon: Home, label: '主页' },
  ]
})

async function sendCommand(cmd) {
  await callService(
    'remote',
    'send_command',
    liveEntity.value.entity_id,
    { command: cmd },
    '遥控命令失败',
  )
}

async function togglePower() {
  const cmd = isOn.value ? 'turn_off' : 'turn_on'
  await callService('remote', cmd, liveEntity.value.entity_id, undefined, '遥控开关失败')
}

async function learnCommand() {
  if (!liveEntity.value?.entity_id || learning.value) return
  learning.value = true
  try {
    await callService(
      'remote',
      'learn_command',
      liveEntity.value.entity_id,
      {
        command: 'learn',
        device: liveEntity.value.entity_id,
      },
      '学习失败',
    )
  } finally {
    learning.value = false
  }
}
</script>

<style src="./styles/PopupAccents.css"></style>
