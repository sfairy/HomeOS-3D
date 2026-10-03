/**
 * 自动化 YAML 构建器
 *
 * 职责：从联动器表单 / 图状态生成 Home Assistant automation YAML 预览文本。
 *
 * 依赖：
 * - ./yaml-preview-helpers.util 的 condition / scalar / placeholder。
 * - ./action-yaml-builder.util 的动作 YAML 行生成。
 * - ./automation-trigger-yaml.util 的触发器 / wait 工具。
 * - @/types/orchestrator-builder 的 AutomationTriggerForm / BuildAutomationYamlInput。
 *
 * 注意：
 * - YAML key（alias / mode / trigger / condition / action 等）与 HA 自动化字段对齐，不翻译。
 * - OR/AND/sequence 触发逻辑通过 wait_for_trigger 链路在 action 段表达。
 */
import {
  formatAutomationConditionYaml,
  formatYamlScalar,
  yamlPreviewPlaceholder,
} from './yaml-preview-helpers.util'
import { formatOrchestratorActionYamlLines } from './action-yaml-builder.util'
import {
  buildHomeosTriggerMetaComment,
  expandSequenceTriggers,
  flattenTriggerForms,
  formatTriggerYamlLines,
  formatWaitForTriggerYamlLines,
  shouldCompileTriggerAnd,
  validateTriggerGroupsForCompile,
} from './automation-trigger-yaml.util'
import type {
  AutomationTriggerForm,
  BuildAutomationYamlInput,
} from '@/types/orchestrator-builder'

/**
 * 从 AutomationBuilder 表单状态生成 HA automation YAML 预览文本。
 *
 * 入参：
 * - automationName / automationMode：别名与执行模式。
 * - triggerGroups / conditionGroups / actions：触发器组 / 条件组 / 动作序列。
 * - condRootLogic：条件根逻辑（and / or）。
 * - triggerLogic / triggerAndTimeout：触发逻辑（and / or）与 AND 等待超时。
 * - abData：自动化参数面板下钻数据。
 * - automationId：自动化 ID（loop_* 动作需引用）。
 *
 * 边界：
 * - 无触发器与动作时返回占位文案。
 * - 触发器组合无法编译（lossy）时返回注释式预览。
 * - sequence 触发器展开为入口 trigger + wait_for_trigger 链。
 */
export function buildAutomationYaml({
  automationName,
  automationMode,
  triggerGroups,
  conditionGroups,
  condRootLogic,
  actions,
  abData,
  triggerLogic = 'or',
  triggerAndTimeout = 60,
  automationId = '',
}: BuildAutomationYamlInput) {
  if (triggerGroups.length === 0 && actions.length === 0) {
    return yamlPreviewPlaceholder('addTriggersAndActions')
  }
  const lossyTrig = validateTriggerGroupsForCompile(triggerLogic, triggerGroups)
  if (lossyTrig) {
    return `# @homeos-preview ${lossyTrig}`
  }
  const L: string[] = []
  const useAnd = shouldCompileTriggerAnd(triggerLogic, triggerGroups)
  const timeoutSec = Math.max(1, Number(triggerAndTimeout) || 60)
  const flatRaw = flattenTriggerForms(triggerGroups)
  const hasSequence = flatRaw.some(
    (t) => t.type === 'sequence' && Array.isArray(t.sequenceSteps) && t.sequenceSteps.length > 1,
  )

  L.push(
    buildHomeosTriggerMetaComment({
      triggerLogic: useAnd ? 'and' : 'or',
      triggerAndTimeout: timeoutSec,
      hasSequence: hasSequence || undefined,
    }),
  )
  L.push(`alias: ${formatYamlScalar(automationName || '自动化规则')}`)
  L.push(`mode: ${automationMode}`)
  L.push('')

  // sequence 始终展开为入口 + wait 链；其余按 OR/AND 处理
  const entryTriggers: AutomationTriggerForm[] = []
  const andWaitTriggers: AutomationTriggerForm[] = []
  const andWaitTimeouts: number[] = []

  for (const t of flatRaw) {
    if (t.type === 'sequence' && Array.isArray(t.sequenceSteps) && t.sequenceSteps.length) {
      const steps = t.sequenceSteps as AutomationTriggerForm[]
      const seqTimeout = Math.max(1, Number(t.sequenceTimeout) || timeoutSec)
      entryTriggers.push(steps[0]!)
      for (const step of steps.slice(1)) {
        andWaitTriggers.push(step)
        andWaitTimeouts.push(seqTimeout)
      }
    } else {
      entryTriggers.push(t)
    }
  }

  const expanded = expandSequenceTriggers(entryTriggers)
  // AND：仅保留第一个为 trigger，其余进 wait
  let triggerList = expanded
  if (useAnd && expanded.length > 1) {
    triggerList = [expanded[0]!]
    const rest = expanded.slice(1)
    andWaitTriggers.unshift(...rest)
    andWaitTimeouts.unshift(...rest.map(() => timeoutSec))
  }

  if (triggerList.length > 0) {
    L.push('trigger:')
    for (const t of triggerList) {
      L.push(...formatTriggerYamlLines(t))
    }
  }

  if (conditionGroups.length > 0) {
    L.push('')
    L.push('condition:')
    const needsNestedAnd =
      condRootLogic === 'and' &&
      (conditionGroups.length > 1 ||
        conditionGroups.some((g) => g.logic === 'or' || (g.conditions?.length ?? 0) > 1))
    if (condRootLogic === 'or' && !needsNestedAnd) {
      L.push('  - condition: or')
      L.push('    conditions:')
      for (const c of conditionGroups.flatMap((g) => g.conditions)) {
        L.push(...formatAutomationConditionYaml(c, '      '))
      }
    } else if (needsNestedAnd) {
      L.push('  - condition: and')
      L.push('    conditions:')
      for (const g of conditionGroups) {
        if (g.logic === 'or' && g.conditions.length > 1) {
          L.push('    - condition: or')
          L.push('      conditions:')
          for (const c of g.conditions) {
            L.push(...formatAutomationConditionYaml(c, '        '))
          }
        } else {
          for (const c of g.conditions) {
            L.push(...formatAutomationConditionYaml(c, '      '))
          }
        }
      }
    } else {
      for (const c of conditionGroups.flatMap((g) => g.conditions)) {
        L.push(...formatAutomationConditionYaml(c, '  '))
      }
    }
  }

  if (andWaitTriggers.length > 0 || actions.length > 0) {
    L.push('')
    L.push('action:')
    for (let i = 0; i < andWaitTriggers.length; i++) {
      L.push(
        ...formatWaitForTriggerYamlLines(
          andWaitTriggers[i]!,
          andWaitTimeouts[i] ?? timeoutSec,
        ),
      )
    }
    for (const a of actions) {
      if (a.type === 'home_mode') {
        L.push('  - event: homeMode.activate.request')
        L.push('    event_data:')
        L.push(`      mode_id: ${formatYamlScalar(a.modeId || '')}`)
      } else if (a.type === 'notify_homeos') {
        L.push('  - event: notification.homeos.send')
        L.push('    event_data:')
        L.push(`      message: ${formatYamlScalar(a.notifyMsg || '通知')}`)
      } else if (a.type === 'loop_start' || a.type === 'loop_stop') {
        L.push(`  - event: homeos.${a.type === 'loop_start' ? 'loop_start' : 'loop_stop'}`)
        L.push('    event_data:')
        L.push(
          `      automation_id: ${formatYamlScalar(a.entityId || automationId || '')}`,
        )
      } else {
        L.push(
          ...formatOrchestratorActionYamlLines(a, {
            dataPanel: abData,
            panelOpen: !!a._showParams,
            variant: 'automation',
            automationId,
          }),
        )
      }
    }
  }
  return L.join('\n')
}
