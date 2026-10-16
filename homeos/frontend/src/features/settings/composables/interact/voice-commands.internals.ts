/**
 * @file voice-commands.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 语音设置：指令编辑器（域/实体范围/服务） */

import { reactive } from 'vue'
import { servicesForDomainBuilder } from '@/shared/utils/registry/widget-catalog'

function domainPrefix(domain: string | undefined) {
  return `${String(domain || '').trim()}.`
}

export function useVoiceCommandEditor() {
  /** 记录用户显式选择「指定实体」但尚未填值的命令，避免 entityMatch 为空时被推回 all */
  const specificScopeCmds = reactive(new Set<object>())

  function servicesForCmd(cmd: { domain?: string } | null | undefined) {
    return servicesForDomainBuilder(cmd?.domain || 'light')
  }

  function entityScope(cmd: { domain?: string; entityMatch?: string }) {
    if (specificScopeCmds.has(cmd)) return 'specific'
    const prefix = domainPrefix(cmd.domain || 'light')
    const match = String(cmd.entityMatch || '').trim()
    return !match || match === prefix ? 'all' : 'specific'
  }

  function entityInputValue(cmd: { domain?: string; entityMatch?: string }) {
    const prefix = domainPrefix(cmd.domain || 'light')
    const match = String(cmd.entityMatch || '').trim()
    return match === prefix ? '' : match
  }

  function onEntityScopeChange(cmd: { domain?: string; entityMatch?: string }, scope: string) {
    if (scope === 'specific') {
      specificScopeCmds.add(cmd)
      cmd.entityMatch = ''
    } else {
      specificScopeCmds.delete(cmd)
      cmd.entityMatch = domainPrefix(cmd.domain)
    }
  }

  function onEntityInput(cmd: { domain?: string; entityMatch?: string }, val: unknown) {
    const value = String(val || '').trim()
    cmd.entityMatch = value || domainPrefix(cmd.domain)
    if (value) specificScopeCmds.delete(cmd)
  }

  function onDomainChange(
    cmd: {
      domain?: string
      service?: string
      entityMatch?: string
      serviceData?: unknown
    },
    domain: string,
  ) {
    cmd.domain = domain
    const services = servicesForDomainBuilder(domain)
    if (!services.includes(cmd.service || '')) cmd.service = services[0] || 'turn_on'
    cmd.entityMatch = domainPrefix(domain)
    cmd.serviceData = undefined
    specificScopeCmds.delete(cmd)
  }

  function needsClimateMode(cmd: { domain?: string; service?: string }) {
    return cmd.domain === 'climate' && cmd.service === 'set_hvac_mode'
  }

  function setClimateMode(cmd: { serviceData?: Record<string, unknown> }, mode: string) {
    cmd.serviceData = { ...(cmd.serviceData || {}), hvac_mode: mode }
  }

  function onServiceChange(cmd: {
    domain?: string
    service?: string
    serviceData?: Record<string, unknown>
  }) {
    if (needsClimateMode(cmd) && !cmd.serviceData?.hvac_mode) setClimateMode(cmd, 'cool')
  }

  return {
    servicesForCmd,
    entityScope,
    entityInputValue,
    onEntityScopeChange,
    onEntityInput,
    onDomainChange,
    needsClimateMode,
    setClimateMode,
    onServiceChange,
  }
}
