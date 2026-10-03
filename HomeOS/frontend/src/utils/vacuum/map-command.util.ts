/**
 * 小米 / 石头（miio）扫地机地图相关 send_command 载荷构造
 *
 * 职责：
 * - 把分区清扫 / 指点前往 / 划区清扫等地图意图构造为 miio send_command 载荷。
 * - 对入参做有效性校验，无效输入返回 null，避免下发非法命令。
 *
 * 依赖：无外部依赖，纯函数。
 *
 * 注意：command（app_segment_clean / app_goto_target / app_zoned_clean）为
 *   miio 协议指令字符串，不翻译。
 */

/** miio send_command 载荷结构 */
interface VacuumSendCommandPayload {
  command: string
  params?: unknown
}

/**
 * 分区清扫：app_segment_clean。
 *
 * @param segmentIds 分区 id 列表（自动去重、过滤非正整数）
 * @returns 载荷对象；输入无效时返回 null
 */
export function buildSegmentCleanCommand(segmentIds: number[]): VacuumSendCommandPayload | null {
  const ids = [...new Set(segmentIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
  if (!ids.length) return null
  return {
    command: 'app_segment_clean',
    params: ids,
  }
}

/**
 * 指哪扫哪 / 前往：app_goto_target。
 *
 * @param x 目标点 X 坐标
 * @param y 目标点 Y 坐标
 * @returns 载荷对象（坐标四舍五入为整数）；非有限坐标返回 null
 */
export function buildGotoTargetCommand(x: number, y: number): VacuumSendCommandPayload | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    command: 'app_goto_target',
    params: [Math.round(x), Math.round(y)],
  }
}

/**
 * 划区清扫：app_zoned_clean（params 为 [[x1,y1,x2,y2,1], ...]）。
 *
 * @param zones 区域数组，每项为 [x1, y1, x2, y2] 坐标
 * @returns 载荷对象；空数组返回 null
 */
export function buildZonedCleanCommand(
  zones: Array<[number, number, number, number]>,
): VacuumSendCommandPayload | null {
  if (!zones.length) return null
  return {
    command: 'app_zoned_clean',
    params: zones.map(([x1, y1, x2, y2]) => [
      Math.round(x1),
      Math.round(y1),
      Math.round(x2),
      Math.round(y2),
      1,
    ]),
  }
}
