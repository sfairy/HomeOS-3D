/**
 * S7d · device_timer 保持独立域。
 *
 * 计划原本把它并入 `client_power/timer`（都属「电源与定时」）。实测该移动会把
 * 原本 5 个独立强连通分量并成一个 14 包巨环（device_timer 既被 client_power 侧引用，
 * 又引用 notification/logs 侧）。定时能力本身也是一个独立职责，保留独立域更准确。
 */
const B = 'homeos/backend/src'

export default {
  dirMoves: [{ from: `${B}/domains/client_power/timer`, to: `${B}/domains/device_timer` }],
}
