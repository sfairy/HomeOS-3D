/**
 * 按实体规模估算 Socket.IO 单帧缓冲（8MB ~ 50MB）。
 *
 * 职责：依据 state-store 实体数量选择 maxHttpBufferSize 分档，避免默认 1MB 不足以推送
 * 大型 HA 实例的全量 initial_states；支持环境变量 WS_PUSH_MAX_BUFFER_MB 覆盖（8~50）。
 *
 * 关键依赖：state-store.getCount()（由 gateway 在 INITIAL_STATES 事件中传入）。
 */

const WS_BUFFER_MIN_BYTES = 8 * 1024 * 1024;
const WS_BUFFER_MAX_BYTES = 50 * 1024 * 1024;

/** 按实体数量分档计算缓冲：500/2000/5000 三段阈值，超出后取最大值 */
function computeWsMaxBufferBytes(entityCount = 0): number {
  if (entityCount <= 500) return WS_BUFFER_MIN_BYTES;
  if (entityCount <= 2000) return 16 * 1024 * 1024;
  if (entityCount <= 5000) return 32 * 1024 * 1024;
  return WS_BUFFER_MAX_BYTES;
}

/**
 * 解析最终 maxHttpBufferSize：环境变量 WS_PUSH_MAX_BUFFER_MB 优先（需在 8~50 范围），
 * 否则按实体数量分档返回。供 gateway 初始化与运行时动态调整使用。
 */
export function resolveWsMaxBufferBytes(entityCount = 0): number {
  const envMb = Number(process.env.WS_PUSH_MAX_BUFFER_MB);
  if (Number.isFinite(envMb) && envMb >= 8 && envMb <= 50) {
    return Math.round(envMb * 1024 * 1024);
  }
  return computeWsMaxBufferBytes(entityCount);
}
