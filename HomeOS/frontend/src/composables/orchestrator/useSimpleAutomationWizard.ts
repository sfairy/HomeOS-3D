/**
 * 简易自动化向导 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 引导用户用最少字段生成可用的自动化 YAML（state/time/sun/zone 触发，device/notify 动作）
 *  - 将表单字段拼装成 automation YAML 字符串，并通过 draft util 暂存到房间草稿
 * 依赖：room-automation-draft.util（草稿暂存）
 */
import { computed, ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { stashAutomationDraftYaml } from '@/utils/orchestrator/room-automation-draft.util'

/** 向导事件类型：close 关闭、applied 已应用草稿 */
type WizardEmit = (event: 'close' | 'applied') => void

/**
 * 简易自动化向导 composable 入口
 * @param emit 事件发射器，applied 时已写入草稿，close 时关闭弹窗
 * @returns 触发/动作表单字段、提示文案、buildYaml 与 apply 方法
 */
export function useSimpleAutomationWizard(emit: WizardEmit) {
  /** 自动化别名 */
  const name = ref('')
  /** 触发类型：state | time | sun | zone */
  const triggerType = ref('state')
  /** 状态/zone 触发关联的实体 id */
  const triggerEntity = ref('')
  /** state 触发的目标状态值 */
  const triggerTo = ref('on')
  /** time 触发的固定时刻（HH:mm） */
  const triggerAt = ref('22:00')
  /** sun 触发的事件：sunrise | sunset */
  const sunEvent = ref('sunset')
  /** zone 触发的区域实体 id */
  const zoneId = ref('zone.home')
  /** zone 触发的事件：enter | leave */
  const zoneEvent = ref('enter')
  /** 动作类型：device 调用服务 | notify 推送 HomeOS 通知 */
  const actionKind = ref('device')
  /** device 动作的目标实体 id */
  const actionEntity = ref('')
  /** device 动作调用的 service 名（不含 domain 前缀） */
  const actionService = ref('turn_on')
  /** notify 动作的消息内容 */
  const notifyMsg = ref('自动化已触发')

  /** 触发类型说明文案（根据 triggerType 切换） */
  const triggerTypeHint = computed(() => {
    const hints: Record<string, string> = {
      state: '实体状态变为指定值时触发',
      time: '每天固定时间触发',
      sun: '日出或日落时触发',
      zone: '人员进入或离开区域时触发',
    }
    return hints[triggerType.value] || ''
  })

  /** 动作类型说明文案（device 走 HA 服务调用，notify 走 HomeOS 通知） */
  const actionKindHint = computed(() =>
    actionKind.value === 'device' ? '向 Home Assistant 实体发送服务调用' : '推送 HomeOS 系统通知',
  )

  /**
   * 根据当前表单字段拼装 automation YAML 字符串
   * @returns 包含 alias/triggers/conditions/actions 的 YAML 字符串
   */
  function buildYaml() {
    const alias = name.value.trim() || '简单自动化'
    let triggers = ''
    if (triggerType.value === 'state') {
      triggers = `triggers:\n  - platform: state\n    entity_id: ${triggerEntity.value || 'binary_sensor.motion_placeholder'}\n    to: "${triggerTo.value || 'on'}"`
    } else if (triggerType.value === 'time') {
      triggers = `triggers:\n  - platform: time\n    at: "${triggerAt.value || '22:00'}"`
    } else if (triggerType.value === 'zone') {
      triggers = `triggers:\n  - platform: zone\n    entity_id: ${triggerEntity.value || 'person.placeholder'}\n    zone: ${zoneId.value || 'zone.home'}\n    event: ${zoneEvent.value}`
    } else {
      triggers = `triggers:\n  - platform: sun\n    event: ${sunEvent.value}`
    }
    let actions = ''
    if (actionKind.value === 'notify') {
      actions = `actions:\n  - service: notify.homeos\n    data:\n      message: "${notifyMsg.value || '自动化已触发'}"`
    } else {
      // 从 entity_id 中拆出 domain 作为 service 前缀，缺失时回退到 light
      const domain = getEntityDomain(actionEntity.value || 'light.placeholder') || 'light'
      actions = `actions:\n  - service: ${domain}.${actionService.value}\n    target:\n      entity_id: ${actionEntity.value || 'light.placeholder'}`
    }
    return `${triggers}\nconditions: []\n${actions}\n`.replace(/^/, `alias: "${alias}"\n`)
  }

  /**
   * 应用当前配置：将 YAML 暂存为草稿并触发 applied/close 事件
   * @sideEffect 写入房间自动化草稿，由父组件跳转到完整 Builder 继续编辑
   */
  function apply() {
    stashAutomationDraftYaml(buildYaml())
    emit('applied')
    emit('close')
  }

  return {
    name,
    triggerType,
    triggerEntity,
    triggerTo,
    triggerAt,
    sunEvent,
    zoneId,
    zoneEvent,
    actionKind,
    actionEntity,
    actionService,
    notifyMsg,
    triggerTypeHint,
    actionKindHint,
    apply,
  }
}