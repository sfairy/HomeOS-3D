/**
 * @file alert-rules-crud.internals.ts
 * @module frontend/src/views
 */
/** 告警规则：列表 CRUD */
import {
  createNotificationRule,
  deleteNotificationRule,
  fetchNotificationRules,
  testNotificationRule,
  updateNotificationRule,
} from '@/services/api/notifications'
import type { AlertRuleEditForm, InboxAlertRule } from '@/shared/types/alert-rules'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import {
  normalizeAlertRuleChannels,
  normalizeCooldownMinutes,
} from '@/features/settings/composables/interact/alert-rules-condition.internals'
import { useEntitiesStore } from '@/stores/entities.store'
import type { NotifyType } from '@/shared/types/notify'
import { ref, type Ref } from 'vue'

export function useAlertRulesCrud(initOptions: {
  chrome: {
    notify: (msg: string, type?: NotifyType, duration?: number) => void
    confirm: (
      message: string,
      title?: string,
      opts?: { type?: string; confirmText?: string; cancelText?: string },
    ) => Promise<boolean>
  }
  dndPanel: { loadDndSettings: (silent?: boolean) => Promise<void> }
  ruleEditor: {
    editing: Ref<AlertRuleEditForm | null>
    syncConditionFromVisual: () => void
    closeEditing: () => void
  }
}) {
  const { chrome, dndPanel, ruleEditor } = initOptions
  const entitiesStore = useEntitiesStore()
  const rules = ref<InboxAlertRule[]>([])
  const loading = ref(false)
  const rulesLoadError = ref<string>('')

  let rulesLoaded = false

  async function loadRules(options: { silent?: boolean } = {}) {
    const showLoading = !options.silent && !rulesLoaded
    if (showLoading) {
      loading.value = true
      rulesLoadError.value = ''
    }
    try {
      const rulesRes = await fetchNotificationRules()
      rules.value = (rulesRes.data as InboxAlertRule[] | undefined) || []
      await dndPanel.loadDndSettings(true)
      rulesLoaded = true
    } catch (e) {
      logger.warn('加载规则失败', e)
      if (showLoading || !rulesLoaded) {
        rules.value = []
        rulesLoadError.value = getApiErrorMessage(e, '加载规则失败')
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function saveRule() {
    const form = ruleEditor.editing.value
    if (!form) return
    if (!form.name?.trim()) {
      chrome.notify('请填写规则名称', 'error')
      return
    }
    if (form.conditionMode !== 'raw') ruleEditor.syncConditionFromVisual()
    const condition = form.condition?.trim()
    if (!condition) {
      chrome.notify('请填写触发条件', 'error')
      return
    }
    // 冷却 0 = 不抑制（事件型规则，如门铃）；NaN/空值回退默认 60 分钟
    const payload = {
      name: form.name.trim(),
      entityId: form.entityId || undefined,
      messageTemplate: form.messageTemplate?.trim() || undefined,
      // 外部推送标题（Email/WebPush/企微）；留空时由各通道内置标题兜底
      title: form.title?.trim() || undefined,
      condition,
      level: form.level,
      channels: normalizeAlertRuleChannels(form.channels),
      cooldownMinutes: normalizeCooldownMinutes(form.cooldownMinutes),
      enabled: form.enabled !== false,
    }
    try {
      if (form.id) await updateNotificationRule(form.id, payload)
      else await createNotificationRule(payload)
      ruleEditor.closeEditing()
      await loadRules({ silent: true })
      chrome.notify('规则已保存', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败（需 admin 权限）'), 'error')
      logger.warn('保存规则失败', e)
    }
  }

  async function testRule(rule: Pick<InboxAlertRule, 'entityId' | 'condition'>) {
    const entity = rule.entityId ? entitiesStore.entities[rule.entityId] : null
    if (rule.entityId && !entity) {
      chrome.notify(`实体 ${rule.entityId} 当前不可用`, 'info')
      return
    }
    try {
      const res = await testNotificationRule({
        condition: rule.condition,
        entityId: rule.entityId,
        state: entity?.state ?? '',
        attributes: entity?.attributes ?? {},
      })
      const { matched, state } = res.data || {}
      const stateLabel = state || '(空)'
      chrome.notify(
        matched ? `条件匹配，当前状态: ${stateLabel}` : `条件不匹配，当前状态: ${stateLabel}`,
        matched ? 'success' : 'info',
      )
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '测试失败'), 'error')
    }
  }

  /**
   * 一键启闭规则（不进入编辑弹窗）。
   *
   * 先本地乐观更新行内开关，接口失败时回滚，保证窄屏也能快速控制推送。
   */
  async function toggleRuleEnabled(rule: InboxAlertRule, enabled: boolean) {
    if (!rule.id) return
    const prev = rule.enabled
    rule.enabled = enabled
    try {
      await updateNotificationRule(rule.id, { enabled })
      chrome.notify(enabled ? '规则已启用' : '规则已停用', 'success')
    } catch (e) {
      rule.enabled = prev
      chrome.notify(getApiErrorMessage(e, '操作失败（需 admin 权限）'), 'error')
    }
  }

  async function removeRule(id: string) {
    const ok = await chrome.confirm('确定删除此规则？', '删除规则', {
      confirmText: '删除',
      type: 'danger',
    })
    if (!ok) return
    try {
      await deleteNotificationRule(id)
      await loadRules({ silent: true })
      chrome.notify('规则已删除', 'success')
    } catch {
      chrome.notify('删除失败', 'error')
    }
  }

  return {
    rules,
    loading,
    rulesLoadError,
    loadRules,
    saveRule,
    testRule,
    toggleRuleEnabled,
    removeRule,
  }
}
