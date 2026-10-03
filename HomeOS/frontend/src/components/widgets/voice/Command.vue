/**
 * 语音命令组件 VoiceCommand
 *
 * 所属模块：frontend/widgets/voice
 * 职责：提供语音交互入口，支持「长按说话」与「唤醒词待命」两种交互模式，
 *       展示识别模式徽章、实时转写文本、反馈与错误信息。
 * 依赖：
 *   - @lucide/vue 的 Mic 图标
 *   - @/composables/voice/useVoiceCommand 组合式函数（封装 STT/Wake 状态机）
 *   - ./styles/voice-command.css 组件样式
 */
<template>
  <!-- 根容器：阻止冒泡以避免外层（如抽屉/弹层）误触发关闭 -->
  <div
    class="vc-root"
    :class="{ 'vc-root--embedded': embedded }"
    @click.stop
    @mousedown.stop
    @mouseup.stop
  >
    <!-- 模式徽章区：展示当前 STT 来源与唤醒/对话模式 -->
    <div class="vc-mode">
      <!-- STT 模式徽章：使用 HA STT 时附加 --ha 修饰类 -->
      <span :class="['vc-mode-badge', usesHaStt() && 'vc-mode-badge--ha']">
        {{ sttModeBadgeLabel }}
      </span>
      <!-- 唤醒待命徽章：仅在唤醒模式下显示 -->
      <span v-if="isWakeMode" class="vc-mode-badge vc-mode-badge--wake">{{ '唤醒待命' }}</span>
      <!-- HA Assistant 对话徽章：使用 HA 对话引擎时显示 -->
      <span v-if="useHaConversation" class="vc-mode-badge vc-mode-badge--conv">{{
        'HA Assistant 对话'
      }}</span>
    </div>

    <!-- 长按说话按钮：仅在非唤醒模式下显示，按下开始监听、松开结束 -->
    <button
      v-if="!isWakeMode"
      class="vc-btn"
      :class="{ 'vc-btn--listening': listening }"
      @mousedown="startListen"
      @mouseup="stopListen"
      @mouseleave="stopListen"
      @touchstart.prevent="startListen"
      @touchend.prevent="stopListen"
      @touchcancel.prevent="stopListen"
    >
      <Mic class="w-4 h-4" :class="{ 'animate-pulse': listening }" />
      <span>{{ listening ? '正在聆听...' : '长按说话' }}</span>
    </button>

    <!-- 唤醒词面板：仅在唤醒模式下显示，常驻待命 -->
    <div v-else class="vc-wake-panel" :class="{ 'vc-wake-panel--active': wakeListening }">
      <div class="vc-wake-ring" />
      <Mic class="vc-wake-icon" :class="{ 'animate-pulse': wakeListening }" />
      <p class="vc-wake-title">{{ wakeListening ? '正在聆听…' : '等待唤醒' }}</p>
      <!-- 提示文案：说「唤醒词」+ 命令 -->
      <p class="vc-wake-hint">
        {{ '说「' }}<strong>{{ wakeWordsLabel }}</strong
        >{{ '」+ 命令' }}
      </p>
      <!-- HA STT 模式提示：HA STT 不支持唤醒，需改用长按 -->
      <p v-if="sttMode === 'ha'" class="vc-wake-note">{{ 'HA STT 模式请改用「长按说话」' }}</p>
      <!-- 自动模式回退提示：浏览器识别兜底时告知用户 -->
      <p v-else-if="sttMode === 'auto' && sttFallbackActive" class="vc-wake-note">
        {{ '已回退浏览器识别' }}
      </p>
    </div>

    <!-- 提示词区：展示可用的快捷指令短语 -->
    <div v-if="hintPhrases.length" class="vc-hints">
      <span v-for="p in hintPhrases" :key="p" class="vc-hint">{{ p }}</span>
    </div>
    <!-- 可用命令清单：默认折叠，点击「查看全部命令」展开全部自定义命令（短语 → 动作） -->
    <div v-if="commands.length" class="vc-cmd-list">
      <button
        type="button"
        class="vc-cmd-list__toggle"
        :aria-expanded="cmdListOpen"
        @click="cmdListOpen = !cmdListOpen"
      >
        <span>{{ cmdListOpen ? '收起命令清单' : '查看全部命令' }}</span>
        <span class="vc-cmd-list__count">{{ `${commands.length} 条` }}</span>
        <ChevronDown
          class="vc-cmd-list__chevron"
          :class="{ 'vc-cmd-list__chevron--open': cmdListOpen }"
        />
      </button>
      <div v-if="cmdListOpen" class="vc-cmd-list__body">
        <div v-for="(item, idx) in commands" :key="idx" class="vc-cmd-item">
          <span class="vc-cmd-item__phrases">{{ item.phrases.join('，') }}</span>
          <span class="vc-cmd-item__action">{{ item.action || '未配置动作' }}</span>
        </div>
      </div>
    </div>
    <!-- 实时转写文本区 -->
    <div v-if="transcript" class="vc-transcript">{{ transcript }}</div>
    <!-- 反馈区：根据 feedbackOk 切换正常/错误样式 -->
    <div v-if="feedback" :class="['vc-feedback', feedbackOk ? '' : 'vc-feedback--err']">
      {{ feedback }}
    </div>
    <!-- 错误信息区 -->
    <div v-if="error" class="vc-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file Command.vue
 * @module widgets/voice
 * @description 语音命令部件：提供语音交互入口，支持语音识别、命令解析与执行，
 *              嵌入式与独立两种形态；通过 useVoiceCommand 管理全部语音交互状态。
 * @dependencies
 *  - vue: ref 响应式
 *  - @lucide/vue: Mic / ChevronDown 图标
 *  - @/composables/voice/useVoiceCommand: 语音命令 composable
 */
import { ref } from 'vue'
import { Mic, ChevronDown } from '@lucide/vue'
import { useVoiceCommand } from '@/composables/voice/useVoiceCommand'
import './styles/voice-command.css'

/**
 * 组件 Props。
 * @property {boolean} embedded - 是否以嵌入模式渲染（影响根容器样式），默认 false
 */
defineProps({
  embedded: { type: Boolean, default: false },
})

/**
 * 从 useVoiceCommand 组合式函数解构语音交互所需的全部状态与方法。
 * - listening: 长按模式下的监听状态（ref<boolean>）
 * - wakeListening: 唤醒模式下的监听状态（ref<boolean>）
 * - transcript: 实时识别转写文本（ref<string>）
 * - error: 错误信息（ref<string>）
 * - feedback: 操作反馈信息（ref<string>）
 * - feedbackOk: 反馈是否为成功态（ref<boolean>，true 正常 / false 错误）
 * - sttMode: STT 来源模式，'browser' | 'ha' | 'auto'
 * - sttFallbackActive: 自动模式下是否已回退到浏览器识别（ref<boolean>）
 * - wakeWordsLabel: 唤醒词展示文案（ref<string>）
 * - isWakeMode: 是否处于唤醒待命模式（ref<boolean>）
 * - usesHaStt: 判断当前是否使用 HA STT 的方法
 * - sttModeBadgeLabel: STT 模式徽章展示文案（ComputedRef<string>）
 * - useHaConversation: 是否启用 HA Assistant 对话引擎（ref<boolean>）
 * - hintPhrases: 快捷指令提示短语列表（ref<string[]>）
 * - commands: 完整自定义命令清单（短语 → 动作，ComputedRef<Array<{ phrases: string[]; action: string }>>）
 * - startListen: 开始监听（长按模式下触发）
 * - stopListen: 结束监听并提交识别（长按模式下触发）
 */
const {
  listening,
  wakeListening,
  transcript,
  error,
  feedback,
  feedbackOk,
  sttMode,
  sttFallbackActive,
  wakeWordsLabel,
  isWakeMode,
  usesHaStt,
  sttModeBadgeLabel,
  useHaConversation,
  hintPhrases,
  commands,
  startListen,
  stopListen,
} = useVoiceCommand()

// 可用命令清单是否展开（默认折叠）
const cmdListOpen = ref(false)
</script>
