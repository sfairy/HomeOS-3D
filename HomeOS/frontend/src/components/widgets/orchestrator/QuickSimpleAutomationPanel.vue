<!--
  @module 简易自动化面板（QuickSimpleAutomationPanel）
  @description 面向普通家庭成员的向导式自动化创建入口。用户通过向导填写触发条件与动作，
    生成 YAML 草稿后调用 createOrchestratorItem 保存为 automation 草稿，待管理员审核启用。
    仅 admin / adult 角色可创建。
  @dependencies
    - vue（ref/computed）
    - @lucide/vue Zap 图标
    - SimpleAutomationWizard 向导组件
    - services/api/orchestrator createOrchestratorItem
    - stores/chrome.store 通知
    - stores/auth.store 角色判断
    - utils/core/error-message 错误信息提取
    - utils/orchestrator/room-automation-draft.util 草稿 YAML 暂存
-->
<template>
  <div :class="['qsa-panel', embedded && 'qsa-panel--embedded']">
    <header v-if="!embedded" class="qsa-panel__head">
      <Zap class="w-3.5 h-3.5 qsa-icon" />
      <h3>{{ '简易自动化' }}</h3>
    </header>
    <p class="qsa-panel__desc">
      {{ '通过向导创建自动化草稿，保存后由管理员在联动中心审核启用。' }}
    </p>
    <button
      type="button"
      class="qsa-panel__btn"
      :disabled="busy"
      @click="
        () => {
          refreshShellTeleport()
          showWizard = true
        }
      "
    >
      {{ busy ? '保存中…' : '打开向导' }}
    </button>
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <SimpleAutomationWizard
        v-if="showWizard"
        :open="true"
        @close="showWizard = false"
        @applied="onApplied"
      />
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 简易自动化面板脚本
 *
 * 流程：
 * 1. 用户点击"打开向导"打开 SimpleAutomationWizard
 * 2. 向导 apply 事件触发 onApplied
 * 3. 从草稿暂存取出 YAML，解析 alias 作为名称
 * 4. 调用 createOrchestratorItem 保存为 automation 草稿
 */
import { ref, computed } from 'vue'
import { Zap } from '@lucide/vue'
import SimpleAutomationWizard from '@/components/dashboard/SimpleAutomationWizard.vue'
import { createOrchestratorItem } from '@/services/api/orchestrator'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { consumeAutomationDraftYaml } from '@/utils/orchestrator/room-automation-draft.util'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

defineProps({
  /** 是否嵌入到容器中（嵌入时隐藏头部） */
  embedded: { type: Boolean, default: false },
})

const chrome = useChromeStore()
const authStore = useAuthStore()
/** 向导是否打开 */
const showWizard = ref(false)
/** 保存中标记，用于禁用按钮与展示文案 */
const busy = ref(false)
const { teleportTarget, shellTeleportPending, refreshShellTeleport } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

/** 当前角色是否允许创建自动化（admin/adult） */
const canUse = computed(() => ['admin', 'adult'].includes(authStore.role || ''))

/**
 * 向导应用回调：取出暂存的 YAML 草稿并保存为 automation 草稿
 * - 权限不足：仅提示，不发起请求
 * - YAML 缺失：直接返回
 * - 名称解析失败：兜底为"简单自动化"
 * @returns {Promise<void>}
 */
async function onApplied() {
  if (!canUse.value) {
    chrome.notify('当前角色无权创建自动化', 'warning')
    return
  }
  const yaml = consumeAutomationDraftYaml()
  if (!yaml) return
  // 从 YAML 顶部 alias 字段解析名称，解析失败兜底为"简单自动化"
  const aliasMatch = yaml.match(/^alias:\s*["']?([^"'\n]+)/m)
  const name = aliasMatch?.[1]?.trim() || '简单自动化'
  busy.value = true
  try {
    await createOrchestratorItem('automation', { name, yaml })
    chrome.notify('已保存自动化草稿，请联系管理员启用', 'success')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped src="./styles/QuickSimpleAutomationPanel.css"></style>