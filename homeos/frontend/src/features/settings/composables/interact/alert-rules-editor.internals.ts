/**
 * @file alert-rules-editor.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 告警规则面板：规则编辑与条件表达式 */

import { computed, nextTick, ref } from 'vue'
import type { AlertLevel, AlertRuleEditForm, ConditionMode, InboxAlertRule } from '@/shared/types/alert-rules'
import { clonePlain } from '@/shared/utils/core/clone-plain.util'
import {
  type AlertRulePreset,
} from '@/shared/constants/alert-rule-presets'
import {
  clauseToExpr,
  DEFAULT_ALERT_RULE_CHANNELS,
  defaultAlertClause as defaultClause,
  normalizeCooldownMinutes,
  parseCompoundCondition,
  parseConditionToVisual,
  parseSingleClause,
  serializeEditingForm,
} from '@/features/settings/composables/interact/alert-rules-condition.internals'

/** 告警规则面板：规则编辑与条件表达式 */
export function useAlertRulesPanelRuleEditor(options: {
  notify: (msg: string, type?: string) => void
  confirm: (
    message: string,
    title?: string,
    opts?: { type?: string; confirmText?: string; cancelText?: string },
  ) => Promise<boolean>
}) {
  const editing = ref<AlertRuleEditForm | null>(null)
  const editingBaseline = ref<AlertRuleEditForm | null>(null)
  /** 冷却周期单位：分钟级 / 小时级（提交前统一换算为 cooldownMinutes） */
  const cooldownUnit = ref<'minute' | 'hour'>('minute')

  function captureEditingBaseline() {
    editingBaseline.value = editing.value
      ? (clonePlain(editing.value) as AlertRuleEditForm)
      : null
  }

  const editingDirty = computed(() => {
    if (!editing.value) return false
    if (editingBaseline.value == null) return false
    return serializeEditingForm(editing.value) !== serializeEditingForm(editingBaseline.value)
  })

  function syncConditionFromVisual() {
    if (!editing.value || editing.value.conditionMode === 'raw') return
    const e = editing.value
    if (e.conditionMode === 'compound') {
      e.condition = (e.clauses || [])
        .map((c, i) => {
          const part = clauseToExpr(c)
          return i === 0 ? part : `${c.join || '&&'} ${part}`
        })
        .join(' ')
        .trim()
      return
    }
    if (e.condType === 'state') e.condition = (e.condValue || 'on').trim()
    else if (e.condType === 'contains') e.condition = `contains ${e.condValue ?? ''}`.trim()
    else if (e.condType === 'numeric')
      e.condition = `${e.condOp || '>'} ${e.condValue ?? ''}`.trim()
    else if (e.condType === 'attr' && e.condOp === 'contains') {
      e.condition = `attr:${e.condAttr || 'brightness'} contains ${e.condValue ?? ''}`.trim()
    } else
      e.condition =
        `attr:${e.condAttr || 'brightness'} ${e.condOp || '>'} ${e.condValue ?? ''}`.trim()
  }

  function syncClause() {
    syncConditionFromVisual()
  }

  function setConditionMode(mode: ConditionMode) {
    if (!editing.value) return
    editing.value.conditionMode = mode
    if (mode === 'compound') {
      editing.value.clauses = parseCompoundCondition(editing.value.condition)
      syncConditionFromVisual()
    } else if (mode === 'visual') {
      Object.assign(editing.value, parseSingleClause(editing.value.condition))
      syncConditionFromVisual()
    }
  }

  function addClause() {
    const form = editing.value
    if (!form) return
    if (!form.clauses) form.clauses = [defaultClause()]
    form.clauses.push(defaultClause())
    syncConditionFromVisual()
  }

  function removeClause(idx: number) {
    editing.value?.clauses?.splice(idx, 1)
    syncConditionFromVisual()
  }

  function openCreate() {
    editing.value = {
      name: '',
      entityId: '',
      messageTemplate: '',
      title: '',
      condition: 'on',
      level: 'warn',
      cooldownMinutes: 60,
      enabled: true,
      channels: [...DEFAULT_ALERT_RULE_CHANNELS],
      conditionMode: 'visual',
      condType: 'state',
      condOp: '>',
      condValue: 'on',
      condAttr: 'brightness',
      clauses: [defaultClause()],
    }
    inferCooldownUnit(60)
    captureEditingBaseline()
  }

  function openEdit(rule: InboxAlertRule) {
    editing.value = {
      ...rule,
      channels: rule.channels ?? [],
      ...parseConditionToVisual(rule.condition),
      clauses: parseCompoundCondition(rule.condition),
    } as AlertRuleEditForm
    inferCooldownUnit(editing.value.cooldownMinutes)
    nextTick(() => {
      if (editing.value?.conditionMode !== 'raw') syncConditionFromVisual()
      captureEditingBaseline()
    })
  }

  function closeEditing() {
    editing.value = null
    editingBaseline.value = null
  }

  async function cancelEditingChanges() {
    if (!editingDirty.value || !editing.value || !editingBaseline.value) return
    const ok = await options.confirm('确定放弃未保存的更改？此操作不可撤销。', '放弃更改', {
      type: 'danger',
      confirmText: '放弃更改',
      cancelText: '继续编辑',
    })
    if (!ok) return
    editing.value = clonePlain(editingBaseline.value) as AlertRuleEditForm
    options.notify('已取消修改', 'info')
  }

  function levelClass(level: AlertLevel | string) {
    if (level === 'danger') return 'bg-red-500/20 text-red-400'
    if (level === 'warn') return 'bg-amber-500/20 text-amber-400'
    return 'bg-blue-500/20 text-blue-400'
  }

  /**
   * 冷却输入框展示值（受 cooldownUnit 影响）。
   *
   * 源数据始终是 `cooldownMinutes`（分钟），小时单位时读写按 60 换算，
   * 因此切换单位不会丢失精度、也不需要额外转换步骤。
   */
  const cooldownDisplay = computed<number>({
    get: () => {
      const minutes = normalizeCooldownMinutes(editing.value?.cooldownMinutes)
      return cooldownUnit.value === 'hour' ? Math.round((minutes / 60) * 100) / 100 : minutes
    },
    set: (next: number) => {
      if (!editing.value) return
      // 输入框清空时 next 为 ''（而 Number('') === 0）会被误判为「0 = 不抑制」，故先回退默认 60 分钟
      const raw: unknown = next
      if (raw === '' || raw == null) {
        editing.value.cooldownMinutes = 60
        return
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      const minutes = cooldownUnit.value === 'hour' ? n * 60 : n
      editing.value.cooldownMinutes = normalizeCooldownMinutes(minutes)
    },
  })

  /** 切换冷却单位（分钟 ⇄ 小时）；源数据不变，仅切换展示口径 */
  function setCooldownUnit(unit: 'minute' | 'hour') {
    cooldownUnit.value = unit
  }

  /** 依据当前冷却分钟数推断默认单位：整小时用小时级展示，否则分钟级 */
  function inferCooldownUnit(minutes: number) {
    const m = normalizeCooldownMinutes(minutes)
    cooldownUnit.value = m > 0 && m % 60 === 0 ? 'hour' : 'minute'
  }

  /**
   * 套用常用场景模板：一次性填充名称 / 实体 / 条件 / 冷却 / 模板与级别。
   *
   * 条件同时写回可视化编辑器（单条件与组合条件各解析一次），
   * 用户套用后仍可直接微调，无需从原始表达式手工改写。
   */
  function applyQuickTemplate(preset: AlertRulePreset) {
    const form = editing.value
    if (!form) return
    form.name = preset.name
    form.entityId = preset.entityId
    form.level = preset.level
    form.cooldownMinutes = preset.cooldownMinutes
    form.messageTemplate = preset.messageTemplate
    form.title = preset.title
    form.condition = preset.condition
    form.enabled = true
    inferCooldownUnit(preset.cooldownMinutes)
    Object.assign(form, parseConditionToVisual(preset.condition))
    form.clauses = parseCompoundCondition(preset.condition)
    form.condition = preset.condition
    if (form.conditionMode !== 'raw') syncConditionFromVisual()
  }

  /** 把模板变量追加到通知模板输入框（保留用户已有文案，便于连续插入多个变量） */
  function insertTemplateVar(variable: string) {
    const form = editing.value
    if (!form) return
    form.messageTemplate = `${String(form.messageTemplate || '')}${variable}`
  }

  return {
    editing,
    editingDirty,
    cooldownUnit,
    cooldownDisplay,
    setCooldownUnit,
    inferCooldownUnit,
    applyQuickTemplate,
    insertTemplateVar,
    syncConditionFromVisual,
    syncClause,
    setConditionMode,
    addClause,
    removeClause,
    openCreate,
    openEdit,
    closeEditing,
    cancelEditingChanges,
    levelClass,
  }
}
