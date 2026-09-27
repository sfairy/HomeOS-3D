/**
 * 「楼层 + 模型」复合键的唯一实现。
 */
export function sceneModelKey(floorId, modelId) {
  return JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]);
}
