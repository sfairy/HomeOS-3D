/**
 * 「楼层 + 模型」复合键的唯一实现。
 *
 * 模型要跨模块定位（状态点、屏幕、轮廓、气流、绑定对账），而模型 ID 只在一个楼层内唯一，
 * 所以键必须是 (楼层 ID, 模型 ID) 二元组。这里用 JSON 而不是拼分隔符：楼层 ID 与模型 ID 都
 * 可能含分隔符，JSON 转义能保证可逆。注意这与「光区键」是两种键，别混用 —— 那种是
 * (楼层, 光区)／(区域, 灯具)。
 *
 * 唯一的语义要点：两个标识都归一到字符串、缺省成空串，于是「一侧缺字段」与「另一侧写的空串」
 * 必须是**同一个键**。配置里可能没写楼层，场景节点的 `userData` 也可能没有
 * `environmentFloorId`，两侧本来就常常一个缺、一个有值；写成
 * `JSON.stringify([floorId, modelId])` 会把缺失编码成 `null`、空串编码成 `""`，
 * 同一个模型于是拿到两个身份，查表永远不命中 —— 表现为「状态点 / 屏幕就是挂不上」，
 * 而且不报错，只在视觉上少个东西。
 *
 * 对已经确定的字符串 ID，本函数与 `JSON.stringify([floorId, modelId])` 逐字节相同，
 * 所以把既有实现统一过来不会改变现有文档的键，只在缺失 / 空串这类边界上把两侧拉齐。
 */
export function sceneModelKey(floorId, modelId) {
  return JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]);
}
