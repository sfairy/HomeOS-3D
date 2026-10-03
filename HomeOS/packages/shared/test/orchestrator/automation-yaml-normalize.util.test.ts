/**
 * @file automation-yaml-normalize.util.test.ts
 * @module @homeos/shared/orchestrator
 * @brief 自动化 YAML 规范化工具的单元测试。
 *
 * 职责：
 *  - 验证 validateAutomationYamlStructure 对 webhook 触发器的结构校验：
 *    - 缺少 webhook_secret 时须报错；
 *    - 携带 secret 时通过 webhook 相关的结构校验。
 *
 * 约定：
 *  - webhook 触发器是 HomeOS 的扩展能力（非标准 HA），必须强制携带 HMAC 密钥字段以保障部署安全；
 *  - 校验结果为字符串错误数组，无错误返回空数组。
 */
import { describe, expect, test } from 'bun:test'
import { validateAutomationYamlStructure } from '../../src/orchestrator/automation-yaml-normalize.util'

describe('validateAutomationYamlStructure webhook', () => {
  test('webhook 缺少 secret 报错', () => {
    const errors = validateAutomationYamlStructure({
      trigger: { platform: 'webhook', webhook_id: 'wh1' },
      action: { service: 'light.turn_on', target: { entity_id: 'light.x' } },
    })
    expect(errors.some((e) => e.includes('webhook_secret') || e.includes('secret'))).toBe(true)
  })

  test('webhook 带 secret 通过结构校验', () => {
    const errors = validateAutomationYamlStructure({
      trigger: { platform: 'webhook', webhook_id: 'wh1', secret: 's3cret-value' },
      action: { service: 'light.turn_on', target: { entity_id: 'light.x' } },
    })
    expect(errors.filter((e) => e.includes('webhook'))).toEqual([])
  })
})
