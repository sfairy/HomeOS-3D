<!--
  快捷指令编辑器（写进 `ui.agentQuickPrompts`，无需后端改动即可自定义）

  为什么单独一张卡而不是塞进「模型」表单：
  - 这排按钮属于**界面表现**，存在 app config 的 `ui` 分区，与管家模型/密钥的
    layout 表单是两条保存链路（一个走 /system/config，一个走 layout），混在一张
    卡里会出现「点了保存但只保存了一半」的错觉；
  - 清单可能为 0 条（用户就是不想看见这排按钮），需要自己的空态与「恢复默认」。

  语义（与 `shared/agent/constants/agent-quick-prompts.ts` 注释同口径）：
  字段缺省 = 用内置 6 条；显式空数组 = 关闭。保存按钮只有 dirty 时才可点。
-->
<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { Plus, RotateCcw, Save, Trash2 } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import {
  agentQuickPromptsDirty,
  agentQuickPromptsRevert,
} from '@/features/settings/interact/composables/agent-panel-helpers.internals'
import { useChromeStore } from '@/stores/chrome.store'
import {
  isSystemConfigConflictError,
  patchSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import {
  AGENT_QUICK_PROMPTS,
  AGENT_QUICK_PROMPT_LIMITS,
} from '@/shared/agent/constants/agent-quick-prompts'
import { readAgentQuickPrompts } from '@/shared/agent/utils/quick-prompts.util'

/** 编辑态行：`id` 只用于 v-for 的稳定 key，不写进配置 */
interface PromptRow {
  id: number
  label: string
  prompt: string
  hint: string
}

const chrome = useChromeStore()
let nextRowId = 0

/** 当前生效的清单（配置 → 内置默认）转成编辑态；顺带分配稳定 key */
function toRows(list: readonly { label: string; prompt: string; hint?: string }[]): PromptRow[] {
  return list.map((item) => {
    nextRowId += 1
    return { id: nextRowId, label: item.label, prompt: item.prompt, hint: item.hint || '' }
  })
}

/**
 * 洗掉编辑态里的「空行 / 前后空白」，得到真正要写进配置的数组。
 *
 * 新增行允许先空着（用户正在输入），保存时才丢弃：不这样做，一个误点「添加一条」
 * 就会因为「指令不能为空」让整张卡永远存不下去。
 */
function toConfigRows(rows: PromptRow[]): Array<{ label: string; prompt: string; hint: string }> {
  return rows
    .map((row) => {
      const prompt = row.prompt.trim()
      return {
        // 没填按钮文案就直接用指令本身，避免存进一个空白按钮
        label: row.label.trim() || prompt,
        prompt,
        hint: row.hint.trim(),
      }
    })
    .filter((row) => row.prompt)
}

/** 脏判定与去重都用同一个指纹，避免「编辑了空白也算改动」 */
function fingerprint(rows: PromptRow[]): string {
  return JSON.stringify(toConfigRows(rows))
}

const draft = ref<PromptRow[]>(toRows(readAgentQuickPrompts()))
const baseline = ref<string>(fingerprint(draft.value))
const saving = ref(false)

const dirty = computed(() => fingerprint(draft.value) !== baseline.value)
/** 有行还没填指令：保存会被跳过，提前说清楚而不是悄悄丢掉 */
const skippedCount = computed(() => draft.value.filter((row) => !row.prompt.trim()).length)
const canAdd = computed(() => draft.value.length < AGENT_QUICK_PROMPT_LIMITS.maxItems)

function addRow(): void {
  if (!canAdd.value) return
  nextRowId += 1
  draft.value.push({ id: nextRowId, label: '', prompt: '', hint: '' })
}

function removeRow(index: number): void {
  draft.value.splice(index, 1)
}

/** 恢复内置默认（仍需点保存才落库，避免「点一下就把线上配置改了」） */
function resetToDefault(): void {
  draft.value = toRows(AGENT_QUICK_PROMPTS)
}

/** 丢弃草稿：设置页确认离开时由父组件调用 */
function revert(): void {
  draft.value = toRows(readAgentQuickPrompts())
  baseline.value = fingerprint(draft.value)
}

async function save(): Promise<void> {
  if (saving.value || !dirty.value) return
  saving.value = true
  try {
    const rows = toConfigRows(draft.value)
    await patchSystemConfig({ ui: { agentQuickPrompts: rows } })
    // 必须重载公开配置：面板读的是 ui.agentQuickPrompts，不重载则保存后按钮不变
    await reloadFrontendConfig()
    draft.value = toRows(readAgentQuickPrompts())
    baseline.value = fingerprint(draft.value)
    chrome.notify(
      rows.length ? `已保存 ${rows.length} 条快捷指令` : '已关闭对话面板的快捷指令',
      'success',
    )
  } catch (error: unknown) {
    if (isSystemConfigConflictError(error)) {
      chrome.notify('配置已被其它页面修改，已刷新，请重新保存', 'warning')
      revert()
      return
    }
    logger.error('保存快捷指令失败', error)
    chrome.notify(getApiErrorMessage(error, '保存快捷指令失败'), 'error')
  } finally {
    saving.value = false
  }
}

// 把 dirty / 回滚交给面板注册的离开确认（同一 tab 只注册一次，见 agent-panel.internals）
watch(
  dirty,
  (value) => {
    agentQuickPromptsDirty.value = value
  },
  { immediate: true },
)
agentQuickPromptsRevert.value = revert
onScopeDispose(() => {
  agentQuickPromptsDirty.value = false
  agentQuickPromptsRevert.value = null
})
</script>

<template>
  <SettingsCard>
    <SettingsSectionHead
      title="快捷指令"
      eyebrow="界面配置 ui.agentQuickPrompts"
      description="对话面板底部那排按钮就来自这里：左边填按钮文案，右边填点下去真正发给管家的指令。清空全部 = 关闭快捷入口；不填说明时，悬浮提示只显示完整指令。"
      bordered
    />

    <div class="aqp-list">
      <div v-for="(row, index) in draft" :key="row.id" class="aqp-row">
        <input
          v-model="row.label"
          class="settings-field aqp-row__label"
          type="text"
          :maxlength="AGENT_QUICK_PROMPT_LIMITS.label"
          placeholder="按钮文案，如 全关所有灯"
          :aria-label="`第 ${index + 1} 条：按钮文案`"
        />
        <input
          v-model="row.prompt"
          class="settings-field aqp-row__prompt"
          type="text"
          :maxlength="AGENT_QUICK_PROMPT_LIMITS.prompt"
          placeholder="完整指令，如 把家里所有开着的灯都关掉"
          :aria-label="`第 ${index + 1} 条：完整指令`"
        />
        <input
          v-model="row.hint"
          class="settings-field aqp-row__hint"
          type="text"
          :maxlength="AGENT_QUICK_PROMPT_LIMITS.hint"
          placeholder="说明（可留空）"
          :aria-label="`第 ${index + 1} 条：说明`"
        />
        <button
          type="button"
          class="aqp-row__del"
          :aria-label="`删除第 ${index + 1} 条捷径`"
          title="删除这一条"
          @click="removeRow(index)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>

      <p v-if="!draft.length" class="aqp-empty">
        当前没有快捷指令：对话面板不会显示这排按钮。点「恢复默认」可以拿回内置的 6 条。
      </p>
    </div>

    <div class="aqp-actions">
      <button type="button" class="settings-btn-ghost" :disabled="!canAdd" @click="addRow">
        <Plus class="w-4 h-4" />
        {{ canAdd ? '添加一条' : `最多 ${AGENT_QUICK_PROMPT_LIMITS.maxItems} 条` }}
      </button>
      <button type="button" class="settings-btn-ghost" @click="resetToDefault">
        <RotateCcw class="w-4 h-4" />
        恢复默认
      </button>
      <span class="aqp-actions__spacer"></span>
      <span v-if="skippedCount" class="aqp-note">
        {{ skippedCount }} 条还没填指令，保存时会跳过
      </span>
      <button
        type="button"
        class="settings-btn-accent"
        :disabled="!dirty || saving"
        @click="save"
      >
        <Save class="w-4 h-4" />
        {{ saving ? '保存中…' : '保存快捷指令' }}
      </button>
    </div>
  </SettingsCard>
</template>

<style scoped>
.aqp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

/* 四列：文案短、指令长、说明最短、删除按钮定宽；窄栏折成三行 */
.aqp-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 2fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.aqp-row__del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--hos-radius-card);
  color: var(--set-text-secondary);
}

.aqp-row__del:hover {
  color: var(--set-danger);
  background: var(--set-glass-bg);
}

.aqp-empty {
  padding: 12px 0;
  font-size: var(--set-fs-micro);
  color: var(--set-text-secondary);
}

.aqp-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.aqp-actions__spacer {
  flex: 1 1 auto;
}

.aqp-note {
  font-size: var(--set-fs-micro);
  color: var(--set-text-secondary);
}

@container (max-width: 640px) {
  .aqp-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'label del'
      'prompt prompt'
      'hint hint';
  }

  .aqp-row__label {
    grid-area: label;
  }

  .aqp-row__prompt {
    grid-area: prompt;
  }

  .aqp-row__hint {
    grid-area: hint;
  }

  .aqp-row__del {
    grid-area: del;
  }
}
</style>
