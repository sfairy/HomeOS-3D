/**
 * @file AlarmControlPopup.vue
 * @module components/entities/popups
 *
 * 报警主机控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染安防报警面板（alarm_control_panel 域）
 * - 提供布防模式切换：撤防 / 在家 / 离家 / 夜间
 * - 当实体要求 code_arm_required 或存在 code_format 时，展示 4 位 PIN 数字键盘
 * - 通过 callService 调用 HA 的 alarm_disarm / alarm_arm_* 服务
 *
 * 依赖：
 * - vue: ref / computed / onUnmounted
 * - @lucide/vue: Shield / ShieldAlert / ShieldOff / Home 图标
 * - @/composables/entity/useEntityPopupBase: 弹窗基础能力（liveEntity / callService 等）
 * - ./EntityPopupShell / ./PopupHead: 弹窗外壳与头部
 *
 * 通讯约定：
 * - 服务域固定为 alarm_control_panel
 * - 服务名：alarm_disarm 或 alarm_arm_${mode}（mode 去掉前缀 armed_）
 * - 需要密码时通过 data.code 透传，HA 端校验
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="360"
    accent="#f87171"
    accent-rgb="248, 113, 113"
    @close="$emit('close')"
  >
    <!-- 头部：标题 + 当前布防状态文案与脉冲指示点 -->
    <PopupHead :title="entityName" :icon="ShieldAlert">
      <template #status>
        <span :class="stateColor">{{ stateLabel }}</span>
        <!-- 已布防时显示呼吸式状态点 -->
        <span
          v-if="isArmed"
          class="popup-status-dot popup-status-dot--pulse acp-state-dot acp-state-dot--armed"
        />
      </template>
    </PopupHead>

    <!-- PIN 输入区：仅在需要密码且（当前未撤防 或 有待执行的布防操作）时显示 -->
    <div v-if="needPin && (s !== 'disarmed' || pendingArmMode)" class="mb-4">
      <!-- 4 位密码指示点：已输入位变实心 -->
      <div class="flex justify-center gap-2 mb-3">
        <template v-for="i in 4" :key="i">
          <div :class="['pin-dot', pin.length >= i ? 'pin-dot--filled' : '']" />
        </template>
      </div>
      <!-- 数字键盘：1-9 / 清除 / 0 / 退格 -->
      <div class="pin-pad">
        <button v-for="n in 9" :key="n" class="pin-key" @click="addPin(n)">{{ n }}</button>
        <button class="pin-key pin-key--clear" @click="pin = ''">{{ '清除' }}</button>
        <button class="pin-key" @click="addPin(0)">0</button>
        <button class="pin-key pin-key--del" @click="pin = pin.slice(0, -1)">⌫</button>
      </div>
    </div>

    <!-- 布防模式卡片：根据 supported_features 位掩码过滤可选模式 -->
    <div class="flex justify-center gap-2.5 mb-4">
      <button
        v-for="m in armModes"
        :key="m.key"
        :class="['mode-card', s === m.key ? m.activeClass : '']"
        @click.stop="handleArm(m.key)"
      >
        <component
          :is="m.icon"
          :class="[
            'w-5 h-5 mb-1 transition-all duration-300',
            s === m.key
              ? m.iconColor + ' drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : 'acp-ic-default',
          ]"
        />
        <span class="text-xs font-bold tracking-wider">{{ m.label }}</span>
      </button>
    </div>

    <!-- 底部状态条：当前布防/撤防文字指示 -->
    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="
            isArmed
              ? 'acp-status-pill acp-status-pill--armed'
              : 'acp-status-pill acp-status-pill--disarmed'
          "
        />
        <span class="text-xs font-semibold acp-lbl">{{ isArmed ? '已布防' : '已撤防' }}</span>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 AlarmControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref, computed, onUnmounted } from 'vue'
import { Shield, ShieldAlert, ShieldOff, Home } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
// 通过通用 props 定义注入弹窗定位/实体参数
const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

// 解构弹窗基础能力：liveEntity 为响应式实体快照，callService 用于调用 HA 服务
const { liveEntity, entityName, callService } = useEntityPopupBase(props)

/** 用户输入的 PIN 码（最多 4 位） */
const pin = ref('')
/** 待执行的布防模式：当需要密码时，先记录目标模式，待 PIN 输入完成后再下发 */
const pendingArmMode = ref(null)
/** PIN 输入满 4 位后的延时提交定时器句柄，用于防抖与卸载清理 */
let pinSubmitTimer = null

/**
 * 是否需要密码
 * 依据：实体属性 code_format 存在，或 code_arm_required 为真
 * @returns {boolean|*}
 */
const needPin = computed(
  () =>
    liveEntity.value?.attributes?.code_format || liveEntity.value?.attributes?.code_arm_required,
)

/** 当前实体状态（disarmed / armed_* / triggered / pending） */
const s = computed(() => liveEntity.value?.state)

/** 是否处于任意已布防状态（非 disarmed 即视为已布防） */
const isArmed = computed(() => s.value && s.value !== 'disarmed')

/**
 * 状态显示文案映射
 * @returns {string} 中文状态标签，未匹配时回退为原始 state 或 '--'
 */
const stateLabel = computed(
  () =>
    ({
      disarmed: '已撤防',
      armed_home: '居家布防',
      armed_away: '离家布防',
      armed_night: '夜间布防',
      triggered: '⚠ 已触发',
    })[s.value] ||
    s.value ||
    '--',
)

/**
 * 状态文字配色类名
 * - triggered: 触发告警红
 * - 已布防：布防色
 * - 已撤防：撤防色
 * @returns {string}
 */
const stateColor = computed(() =>
  s.value === 'triggered'
    ? 'acp-state-triggered'
    : isArmed.value
      ? 'acp-state-armed'
      : 'acp-state-disarmed',
)

/** 全部已知布防模式定义：key / 图标 / 激活配色 / 中文标签 */
const ALL_ARM_MODES = [
  {
    key: 'disarmed',
    icon: ShieldOff,
    iconColor: 'acp-ic-disarmed',
    activeClass: 'acp-mode acp-mode--disarmed',
    label: '撤防',
  },
  {
    key: 'armed_home',
    icon: Home,
    iconColor: 'acp-ic-home',
    activeClass: 'acp-mode acp-mode--home',
    label: '在家',
  },
  {
    key: 'armed_away',
    icon: Shield,
    iconColor: 'acp-ic-away',
    activeClass: 'acp-mode acp-mode--away',
    label: '离家',
  },
  {
    key: 'armed_night',
    icon: ShieldAlert,
    iconColor: 'acp-ic-night',
    activeClass: 'acp-mode acp-mode--night',
    label: '夜间',
  },
]
/**
 * 当前实体支持的布防模式列表
 * 过滤规则：
 * - disarmed 始终可用
 * - 当 supported_features 为数字时，按位掩码判断：
 *   armed_home=1, armed_away=2, armed_night=4
 * - 否则按已知状态集合或当前 state 兜底
 * @returns {Array} 可展示的模式卡片配置
 */
const armModes = computed(() => {
  const supported = liveEntity.value?.attributes?.supported_features
  const knownStates = new Set([
    'disarmed',
    'armed_home',
    'armed_away',
    'armed_night',
    'armed_vacation',
    'armed_custom_bypass',
    'triggered',
    'pending',
  ])
  return ALL_ARM_MODES.filter((m) => {
    if (m.key === 'disarmed') return true
    if (supported != null && typeof supported === 'number') {
      const bit = { armed_home: 1, armed_away: 2, armed_night: 4 }[m.key]
      if (bit != null) return (supported & bit) !== 0
    }
    return knownStates.has(m.key) || s.value === m.key
  })
})

/**
 * 追加一位 PIN 数字
 * 满 4 位后延迟 200ms 自动提交，避免抖动并允许用户最后一位的视觉反馈
 * @param {number} n 0-9 数字
 * @returns {void}
 */
function addPin(n) {
  if (pin.value.length >= 4) return
  pin.value += String(n)
  if (pin.value.length === 4) {
    // 清除上一次未触发的定时器，防止重复提交
    if (pinSubmitTimer) clearTimeout(pinSubmitTimer)
    pinSubmitTimer = setTimeout(() => {
      pinSubmitTimer = null
      const mode = pendingArmMode.value || 'disarmed'
      handleArm(mode, pin.value)
      pin.value = ''
      pendingArmMode.value = null
    }, 200)
  }
}

// 组件卸载时清理挂起的定时器，避免在已销毁组件上触发状态更新
onUnmounted(() => {
  if (pinSubmitTimer) clearTimeout(pinSubmitTimer)
})

/**
 * 执行布防/撤防服务调用
 * - 需要密码但未提供时：记录 pendingArmMode 并返回，等待 PIN 输入
 * - 撤防且需要密码但未提供时：直接返回（撤防必须验证）
 * - 服务名：disarmed -> alarm_disarm；armed_xxx -> alarm_arm_xxx
 * @param {string} mode 目标模式 key
 * @param {string} [code] PIN 码，可选
 * @returns {Promise<void>}
 * @throws 通过 callService 内部统一捕获并提示 '安防操作失败'
 */
async function handleArm(mode, code) {
  if (mode !== 'disarmed' && needPin.value && !code) {
    pendingArmMode.value = mode
    return
  }
  pendingArmMode.value = null
  if (mode === 'disarmed' && needPin.value && !code) return
  const svc = mode === 'disarmed' ? 'alarm_disarm' : `alarm_arm_${mode.split('_')[1]}`
  const data = {}
  if (needPin.value) data.code = code || liveEntity.value?.attributes?.code || ''
  const entityId = liveEntity.value?.entity_id
  if (!entityId) return
  await callService('alarm_control_panel', svc, entityId, data, '安防操作失败')
}
</script>

<style scoped src="./styles/AlarmControlPopup.css"></style>