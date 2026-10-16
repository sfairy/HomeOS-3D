/**
 * @file alert-rules.internals.ts
 * @module frontend/src/views
 */
/** 告警规则面板 */
import { ChevronDown, Inbox, Loader2, Moon, Plus, Save, Sun, Trash2, Volume2 } from '@lucide/vue'
import type { Ref } from 'vue'
import { useAlertRulesPanelContext } from '@/features/settings/composables/interact/alert-rules-context.internals'

// ── useAlertRulesPanel ──
/** 设置 → 告警规则面板逻辑 */
export function useAlertRulesPanel(activeTabSource: Ref<string | undefined> | string) {
  const ctx = useAlertRulesPanelContext(activeTabSource)
  return {
    ...ctx,
    Save,
    Loader2,
    Plus,
    Trash2,
    ChevronDown,
    Inbox,
    Volume2,
    Moon,
    Sun,
  }
}

export { useAlertRulesPanelContext } from '@/features/settings/composables/interact/alert-rules-context.internals'
export { useAlertRulesPanelDnd } from '@/features/settings/composables/interact/alert-rules-dnd.internals'
export { useAlertRulesPanelRuleEditor } from '@/features/settings/composables/interact/alert-rules-editor.internals'
export { useAlertRulesRecommend } from '@/features/settings/composables/interact/alert-rules-recommend.internals'
