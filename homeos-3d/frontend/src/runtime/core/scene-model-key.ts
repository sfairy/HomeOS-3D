/**
 * 「楼层 + 模型」复合键的唯一实现。
 */
export function sceneModelKey(floorId: unknown, modelId: unknown) {
  return JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]);
}
