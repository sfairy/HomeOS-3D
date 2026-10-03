/**
 * @file HomeOS 摄像头 WebRTC 播放器 Composable
 * @module composables/camera/useHaWebRtcPlayer
 * @description
 *   封装通过 Home Assistant WebRTC 信令拉取摄像头实时画面的能力，
 *   支持两种信令路径：
 *   1. HA 原生 camera/webbrtc/* 信令（经 HomeOS REST 转发）
 *   2. go2rtc / HA /api/webrtc/ws WebSocket 信令
 *   内置 ICE 服务器缓存、连接超时控制、候选交换与会话关闭。
 *   依赖：@/services/api 的 apiGet/apiPost、@/utils/core/logger。
 */
import { apiGet, apiPost } from '@/services/api'
import { sendWebRtcCandidate, closeWebRtcSession } from '@/services/api/orchestrator'
import { logger } from '@/utils/core/logger'

/** WebRTC 停止函数类型：调用后释放连接与资源 */
type WebRtcStopFn = () => void

/** 远端 ICE 候选类型（兼容 RTCPeerConnection.addIceCandidate 入参） */
type RemoteIceCandidate = Parameters<RTCPeerConnection['addIceCandidate']>[0]
/** ICE 服务器配置 */
type IceServerConfig = { credential?: string; username?: string; urls: string | string[] }

/** 默认 ICE 服务器（Google 公共 STUN） */
const DEFAULT_ICE: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }]
/** WebRTC 协商超时（毫秒） */
const NEGOTIATE_TIMEOUT_MS = 35_000
/** WebRTC 连接建立超时（毫秒） */
const CONNECT_TIMEOUT_MS = 20_000
/** ICE 服务器缓存（进程级），避免重复请求 */
let cachedIceServers: IceServerConfig[] | null = null
/** ICE 服务器拉取 Promise（用于并发去重） */
let iceFetchPromise: Promise<IceServerConfig[]> | null = null

/**
 * 解析 ICE 服务器列表：优先使用缓存，否则从后端拉取并缓存
 * @returns ICE 服务器配置数组；拉取失败回退到 DEFAULT_ICE
 */
async function resolveIceServers(): Promise<IceServerConfig[]> {
  if (cachedIceServers) return cachedIceServers
  if (!iceFetchPromise) {
    iceFetchPromise = apiGet<{ iceServers?: IceServerConfig[] }>('/ha/webrtc/ice-servers')
      .then((res) => {
        const servers = res.data?.iceServers
        cachedIceServers = servers?.length ? servers : DEFAULT_ICE
        return cachedIceServers
      })
      .catch((e) => {
        logger.debug('[WebRTC] 拉取 ICE 服务器失败,使用默认 STUN', e)
        return DEFAULT_ICE
      })
  }
  return iceFetchPromise
}

/**
 * 将 MediaStream 绑定到 video 元素并尝试自动播放
 * @param videoEl video 元素
 * @param stream 媒体流
 */
function attachStream(videoEl: HTMLVideoElement, stream: MediaStream) {
  videoEl.srcObject = stream
  void videoEl.play().catch((e) => logger.debug('[WebRTC] 自动播放被拦截', e))
}

/**
 * 配置收发器：仅接收音视频（recvonly）
 * @param pc RTCPeerConnection 实例
 */
function setupRecvTransceivers(pc: RTCPeerConnection) {
  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })
}

/**
 * 批量添加远端 ICE 候选
 * @param pc RTCPeerConnection 实例
 * @param candidates 远端候选列表
 * @sideEffect 单条失败仅 debug 日志，不中断整体流程
 */
async function addRemoteCandidates(pc: RTCPeerConnection, candidates: Record<string, unknown>[]) {
  for (const raw of candidates) {
    try {
      await pc.addIceCandidate(raw as RemoteIceCandidate)
    } catch (e) {
      logger.debug('[WebRTC] 添加 ICE 候选已跳过', e)
    }
  }
}

/**
 * 等待 WebRTC 连接建立（track 到达或 connectionState 变为 connected）
 * @param pc RTCPeerConnection 实例
 * @param onTrack track 事件回调
 * @returns 连接成功时 resolve；超时或失败时 reject
 */
function waitForConnection(
  pc: RTCPeerConnection,
  onTrack?: (ev: RTCTrackEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('WebRTC 连接超时'))
    }, CONNECT_TIMEOUT_MS)

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(msg))
    }

    // 收到 track 即视为连接成功
    pc.addEventListener(
      'track',
      (ev) => {
        onTrack?.(ev)
        finish()
      },
      { once: true },
    )

    // 同时监听连接状态变化
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') finish()
      if (pc.connectionState === 'failed') fail('WebRTC 连接失败')
    })
  })
}

/**
 * 上报本地 ICE 候选到后端（供对端收集）
 * @param entityId 摄像头 entity_id
 * @param sessionId WebRTC 会话 id
 * @param candidate 本地 ICE 候选
 * @sideEffect 失败仅 debug 日志
 */
function postLocalCandidate(entityId: string, sessionId: string, candidate: RTCIceCandidate) {
  void sendWebRtcCandidate({
    entity_id: entityId,
    session_id: sessionId,
    candidate: candidate.toJSON(),
  }).catch((e) => logger.debug('[WebRTC] 上报候选失败', e))
}
/**
 * HA camera/webrtc/* 信令（经 HomeOS REST 转发）
 * @param entityId 摄像头 entity_id
 * @param videoEl 用于播放的 video 元素
 * @returns 停止函数，调用后关闭连接并通知后端释放会话
 * @throws 连接超时或信令失败时抛出错误
 */
async function startHaNativeWebRtc(
  entityId: string,
  videoEl: HTMLVideoElement,
): Promise<WebRtcStopFn> {
  let iceServers = await resolveIceServers()
  try {
    const configRes = await apiGet<{ configuration?: { iceServers?: IceServerConfig[] } }>(
      `/ha/webrtc/client-config?entity_id=${encodeURIComponent(entityId)}`,
    )
    const fromHa = configRes.data?.configuration?.iceServers
    if (fromHa?.length) iceServers = fromHa
  } catch (e) {
    logger.debug('[WebRTC] client-config 不可用，中止 WebRTC 以降级到 HLS/MJPEG', e)
    throw e instanceof Error ? e : new Error('WebRTC client-config 不可用')
  }

  const pc = new RTCPeerConnection({ iceServers })
  setupRecvTransceivers(pc)

  const remoteStream = new MediaStream()
  attachStream(videoEl, remoteStream)

  let sessionId = ''
  let stopped = false
  // 在 sessionId 就绪前缓存的本地候选
  const pendingLocalCandidates: RTCIceCandidate[] = []

  pc.onicecandidate = (ev) => {
    if (!ev.candidate || stopped) return
    // sessionId 未就绪时先缓存，就绪后统一上报
    if (!sessionId) {
      pendingLocalCandidates.push(ev.candidate)
      return
    }
    postLocalCandidate(entityId, sessionId, ev.candidate)
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // 提交 offer 进行协商，获取 answer 与远端候选
  const negotiatedRes = await apiPost<{
    session_id: string
    answer: string
    candidates: Record<string, unknown>[]
    subscription_id: number
  }>(
    '/ha/webrtc/negotiate',
    { entity_id: entityId, offer: offer.sdp },
    { timeout: NEGOTIATE_TIMEOUT_MS },
  )

  const negotiated = negotiatedRes.data
  sessionId = negotiated.session_id
  const subscriptionId = negotiated.subscription_id

  // 补报协商前缓存的本地候选
  for (const c of pendingLocalCandidates) postLocalCandidate(entityId, sessionId, c)
  pendingLocalCandidates.length = 0

  await pc.setRemoteDescription({ type: 'answer', sdp: negotiated.answer })
  await addRemoteCandidates(pc, negotiated.candidates ?? [])

  await waitForConnection(pc, (ev) => {
    if (ev.track) remoteStream.addTrack(ev.track)
  })

  // 返回停止函数：关闭连接、清理资源、通知后端释放会话
  return () => {
    stopped = true
    pc.close()
    videoEl.srcObject = null
    if (subscriptionId != null) {
      void closeWebRtcSession({
        entity_id: entityId,
        subscription_id: subscriptionId,
      }).catch((e) => logger.debug('[WebRTC] 关闭会话失败', e))
    }
  }
}

/**
 * go2rtc / HA /api/webrtc/ws 信令
 * @param wsUrl WebSocket 信令地址
 * @param videoEl 用于播放的 video 元素
 * @returns 停止函数，调用后关闭 WS 与连接
 * @throws WebSocket 连接超时或失败时抛出错误
 */
async function startGo2RtcWebRtc(
  wsUrl: string,
  videoEl: HTMLVideoElement,
): Promise<WebRtcStopFn> {
  const iceServers = await resolveIceServers()
  const pc = new RTCPeerConnection({ iceServers })
  setupRecvTransceivers(pc)

  const remoteStream = new MediaStream()
  attachStream(videoEl, remoteStream)

  let ws: WebSocket | null = null
  let stopped = false

  // 建立 WebSocket 连接（带超时）
  await new Promise<void>((resolve, reject) => {
    ws = new WebSocket(wsUrl)
    const t = setTimeout(() => reject(new Error('WebRTC WebSocket 连接超时')), CONNECT_TIMEOUT_MS)
    ws.onopen = () => {
      clearTimeout(t)
      resolve()
    }
    ws.onerror = () => {
      clearTimeout(t)
      reject(new Error('WebRTC WebSocket 连接失败'))
    }
  })

  // 本地候选通过 WS 上报
  pc.onicecandidate = (ev) => {
    if (!ev.candidate || stopped || !ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'webrtc/candidate', value: ev.candidate.candidate }))
  }

  // 处理 WS 信令消息：answer / candidate / error
  ws!.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(String(ev.data))
      if (msg.type === 'webrtc/answer' && msg.value) {
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.value })
      }
      if (msg.type === 'webrtc/candidate' && msg.value) {
        await pc.addIceCandidate({ candidate: msg.value, sdpMid: '0', sdpMLineIndex: 0 })
      }
      if (msg.type === 'error') {
        logger.warn('[WebRTC] go2rtc 错误', msg.value)
      }
    } catch (e) {
      logger.debug('[WebRTC] WS 消息解析失败', e)
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  ws!.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }))

  await waitForConnection(pc, (ev) => {
    if (ev.track) remoteStream.addTrack(ev.track)
  })

  // 返回停止函数：关闭 WS 与连接、清理资源
  return () => {
    stopped = true
    ws?.close()
    ws = null
    pc.close()
    videoEl.srcObject = null
  }
}

/**
 * 摄像头 WebRTC 播放入口：根据 display 配置自动选择信令路径
 * @param display 包含 webrtcSignal / url / entityId 的显示配置
 * @param videoEl 用于播放的 video 元素
 * @returns 停止函数
 * @throws 配置不完整时抛出错误
 */
export async function startCameraWebRtc(
  display: { webrtcSignal?: string; url?: string; entityId?: string },
  videoEl: HTMLVideoElement,
): Promise<WebRtcStopFn> {
  // go2rtc 信令：需要 ws url
  if (display.webrtcSignal === 'go2rtc' && display.url) {
    return startGo2RtcWebRtc(display.url, videoEl)
  }
  // HA 原生信令：需要 entityId
  if (display.entityId) {
    return startHaNativeWebRtc(display.entityId, videoEl)
  }
  throw new Error('WebRTC 配置不完整')
}