/**
 * 嵌入舞台的光影管线判据。
 *
 * legacy 嵌入光影 = 嵌入舞台且**不是**标准光影 v2。0.8.4 老组件只写 `lightingMode`，
 * 归一化后本来就是 `region`，所以判据必须带上版本位，否则会误判成新管线 ——
 * 误判的后果是区域光控制器被创建、老组件却按旧阴影缓存出图（灯池全丢）。
 */
export function isLegacyEmbedStageLighting(searchParams: URLSearchParams) {
  return searchParams.get('lighting') !== 'standard' || searchParams.get('lightingVersion') !== '2'
}
