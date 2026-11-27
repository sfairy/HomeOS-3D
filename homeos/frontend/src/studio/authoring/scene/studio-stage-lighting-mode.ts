/**
 * 嵌入舞台的光影管线判据。
 *
 * legacy 嵌入光影 = 嵌入舞台且**不是**标准光影。0.8.4 老组件只写 `lightingMode`，
 * 宿主归一化（`normalizeInteraction3dLightingMode`）后本来就是 `region`，URL 上是
 * `lighting=region` —— 所以「URL 里写着 standard」已经足够判定新管线，版本位只作为
 * 诊断信息保留，不再作为放行条件。
 *
 * 为什么不再要求 `lightingVersion=2`：宿主拼 URL 与舞台跑判据是两份独立产物。只要宿主
 * 那一份是旧的（升级后浏览器/ServiceWorker 还留着旧 runtime chunk），URL 就只会带
 * `lighting=standard` 而漏版本位，舞台侧于是**静默降级**成轻量柔光 —— 画面和「没切」
 * 一模一样，且不报任何错。版本位缺失只可能来自这种自相矛盾的组合，宁可跑到用户要求的
 * 标准管线，也不要悄悄退回旧管线。
 */
export function isLegacyEmbedStageLighting(searchParams: URLSearchParams) {
  return searchParams.get('lighting') !== 'standard'
}

/**
 * 判据 + 诊断上报：舞台只跑一次，落选的那条管线不会留下任何痕迹。
 *
 * 「属性面板已经切到标准光影，但画面没变」这类反馈几乎只能靠猜：宿主拼 URL 时漏掉
 * `lightingVersion`、组件属性里版本位被后端刷掉，或者舞台其实已经是新管线、差别另有
 * 所在 —— 三种情况的画面完全一样。
 *
 * 所以把「URL 要求哪条管线 / 实际跑了哪条」写到 `documentElement.dataset.i3dLightingPipeline`
 * 并打一条 info：线上只要在控制台执行一次
 * `document.documentElement.dataset.i3dLightingPipeline` 就能分辨。
 * 诊断本身不能影响渲染，任何异常都吞掉。
 */
export function resolveStageLightingPipeline(searchParams: URLSearchParams) {
  const lighting = searchParams.get('lighting') || '',
    lightingVersion = searchParams.get('lightingVersion') || '',
    isLegacy = isLegacyEmbedStageLighting(searchParams),
    report = {
      lighting,
      lightingVersion,
      // 版本位缺失 = 宿主产物是旧的；这里如实标出来，方便一眼看出该清缓存还是重发版。
      staleHost: lighting === 'standard' && lightingVersion !== '2',
      pipeline: isLegacy ? 'stage-region' : 'stage-standard',
    }
  try {
    document.documentElement.dataset.i3dLightingPipeline = JSON.stringify(report)
    window.HomeOSLog?.info?.('[3D 舞台] 光影管线', report)
  } catch {
    /* 诊断写入失败不影响渲染 */
  }
  return isLegacy
}
