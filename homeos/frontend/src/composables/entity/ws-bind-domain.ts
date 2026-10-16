/**
 * @file ws-bind-domain.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket：家庭模式 / 通知 / 安防 / 在场 / 能源 / 地震等业务域事件 */
import type { EntitySocketHandlerContext } from '@/shared/types/entity-store'
import { notificationLevelToToastType, shouldSkipNotificationToast } from '@/shared/notifications/utils/ws-sync.util'
import { refreshEnergyFromSocket } from '@/shared/utils/bridge/store-bridge'
import { isEarthquakeAlertEnabled } from '@/composables/earthquake/earthquake-layout.util'
import { useEarthquakeStore } from '@/stores/earthquake.store'
import type { EarthquakeAlertPayload } from '@/shared/types/earthquake'
import { isEewSimulationEventId, WS_CLIENT_EVENTS } from '@homeos/shared'
import type { Socket } from 'socket.io-client'

export function bindEntitySocketDomainEvents(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
): void {
  const { logger, actions, listeners } = ctx

  const dispatchToModeListeners = (
    arr: Array<(payload: unknown) => void>,
    data: unknown,
    label: string,
  ) => {
    for (let i = 0; i < arr.length; i++) {
      try {
        arr[i](data)
      } catch (e) {
        logger.error(`${label} 监听器错误:`, e)
      }
    }
  }

  socket.on(WS_CLIENT_EVENTS.HOME_MODE, (data: unknown) => {
    dispatchToModeListeners(listeners.homeModeListeners, data, 'home_mode')
  })

  socket.on(WS_CLIENT_EVENTS.NOTIFICATION, (data: Record<string, unknown>) => {
    actions.addRemoteNotification(data)
    if (shouldSkipNotificationToast(data)) return
    const message = String(data.message || '').trim()
    if (!message) return
    void actions.appNotify(message, notificationLevelToToastType(data.level))
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_MODE, (data: { mode?: string; zones?: string[] }) => {
    actions.applySecurityModeFromSocket?.(data)
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_ZONES, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY_COMPLETED, (data: { failed?: number }) => {
    actions.refreshSecurityPanelFromSocket()
    if (data?.failed && data.failed > 0) {
      actions.appNotify(`紧急联动完成，${data.failed} 项失败`, 'warning')
    }
  })

  socket.on(WS_CLIENT_EVENTS.TTS_SPEAK, (data: { message?: string; success?: boolean; detail?: string }) => {
    if (!data?.message) return
    if (data.success === false) {
      const detail = data.detail || data.message || '未知错误'
      logger.warn(`TTS 播报未成功: ${detail}`)
      void actions.appNotify(`自动播报失败：${detail}`, 'error')
    }
  })

  // 领域事件监听（自动化 / 安防 / 在场 / 能源 / Frigate / 房间占用）
  // payload 字段以后端 ws-push-domain-events.helper.ts 为准；后端为 Record<string,unknown>
  // 的事件此处用合理的最小可选字段类型，访问均带兜底，避免使用 any。

  socket.on(
    'automation_executed',
    (data: { automationId?: string; name?: string; success?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.automationId || '自动化'
      logger.info(`自动化已执行: ${name}`)
      if (data?.success === false) {
        void actions.appNotify(`自动化「${name}」执行失败`, 'warning')
      } else {
        void actions.appNotify(`自动化「${name}」已执行`, 'info')
      }
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.SECURITY_ALARM,
    (data: {
      entityId?: string
      friendlyName?: string
      zones?: string[]
      zoneNames?: string
      mode?: string
      type?: string
      actionFailures?: string[]
      timestamp?: string
    }) => {
      const target = data?.friendlyName || data?.zoneNames || data?.entityId || '安防区域'
      const typeLabel =
        data?.type === 'smoke'
          ? '烟雾告警'
          : data?.type === 'gas_leak'
            ? '燃气泄漏'
            : data?.type === 'water_leak'
              ? '漏水告警'
              : data?.mode === 'safety'
                ? '安全传感器告警'
                : '安防告警'
      logger.warn(`${typeLabel}: ${target}(模式 ${data?.mode || 'unknown'})`)
      actions.refreshSecurityPanelFromSocket()
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新安防面板
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.PRESENCE_CHANGED,
    (data: { memberId?: string; name?: string; atHome?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.memberId || '成员'
      const status = data?.atHome ? '已到家' : '已离家'
      logger.info(`在场状态变化: ${name} ${status}`)
      void actions.appNotify(`${name}${status}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.PRESENCE_ALL_LEFT, (data: { lastMember?: string; timestamp?: string }) => {
    logger.info(`所有成员均已离家(最后一位: ${data?.lastMember || '未知'})`)
    void actions.appNotify('所有成员均已离家', 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.ENERGY_ANOMALY,
    (data: {
      friendlyName?: string
      current?: number
      average?: number
      message?: string
      entityId?: string
    }) => {
      const name = data?.friendlyName || data?.entityId || '设备'
      const cur = typeof data?.current === 'number' ? `${data.current}W` : ''
      const detail = data?.message || (cur ? `${name} 当前功耗 ${cur}` : name)
      logger.warn(`能源异常: ${detail}`)
      refreshEnergyFromSocket(data?.entityId)
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新能源 UI
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.FRIGATE_DETECTION,
    (data: { camera?: string; label?: string; message?: string; entityId?: string }) => {
      const target = data?.camera || data?.label || data?.message || data?.entityId || '摄像头'
      logger.info(`Frigate 检测: ${target}`)
      // 人物高置信度检测会同步触发 security.alarm → notification，避免双 toast
      if (String(data?.label || '').toLowerCase() === 'person') return
      void actions.appNotify(`检测到活动：${target}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.ROOM_PRESENCE, (data: { room?: string; occupied?: boolean; sensor?: string }) => {
    const room = data?.room || data?.sensor || '房间'
    const status = data?.occupied ? '有人' : '无人'
    logger.info(`房间占用变化: ${room} ${status}`)
    void actions.appNotify(`${room}${status}`, 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_ALERT,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      alertKind?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      // 模拟演练与后端一致：即使未启用 EEW 也允许弹出，便于验证全屏链路
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      if (store.isEventDismissed(eventId)) return
      store.triggerAlert({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: data.alertKind === 'confirmation' ? 'confirmation' : 'early',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_CONFIRMATION,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      store.triggerConfirmation({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: 'confirmation',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )
}
