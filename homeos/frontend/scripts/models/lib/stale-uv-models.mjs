/**
 * 必须丢掉 GLB 里那套「归一化伪 UV」的模型。
 *
 * 判据（三条同时成立，缺一不可）：
 * 1. 文件里 **零贴图**（`images` / `textures` 都为空），也没有运行期给它们挂的整块贴图
 *    （不是石材板族、不是图集族）；
 * 2. UV 是 **0..1 铺满整个构件** 的归一化值，不是米制；
 * 3. 它走调色板重建 + `applySurfaceDetailFinish`（需要 UV 的那条链）。
 *
 * 为什么必须删：运行期 `ensureSceneBoxUvs` 见「已有 UV」就跳过补盒式 UV
 * （`studio-box-uv.ts` 的边界 1），于是程序化细节图按这套归一化值平铺 —— 一根 2.8m 高的
 * 圆柱只铺 1 个纹理周期（应为约 4.7 个），纹理被拉粗近 5 倍；半圆柱的柱身与柱脚
 * （2.91 vs 0.45）密度还互不一致。删掉 UV 后运行时按**米**做盒式投影，密度与全库其它
 * 漆面一致。
 *
 * 不进这张表的（UV 有真实消费者）：
 * - 石材板族（`kitchensink` / `kitchencooktop` / `kitchenisland` / `coffeetable` 的台面）：
 *   运行期 `applyStoneSlabFinish` 会挂程序化石材图，手写 UV 是那块图的布局；
 * - 图集族（`car` / `小汽车-开合件`）：`baseColorTexture` 直接采样。
 *
 * 新增条目要附上实测 UV 跨度（`u` / `v`），并在提交说明里给出删前 / 删后的细节图密度对比。
 * 名单按 **itemType** 匹配。
 */
export const STALE_UV_ITEM_TYPES = Object.freeze({
  'pillar-round': '0..1 铺满 2.8m 柱身（跨度 1.00），细节图密度只有应有的 1/4.7',
  'pillar-semicircle': '跨度 2.91×2.00，且 base（0.45）与 body（2.91）不同尺度',
  'pillar-quarter': '同 `pillar-semicircle`：跨度 2.91×2.00，柱身与柱脚尺度不一致',
  'pillar-quarterinner': '跨度 0.45×2.54，与其它柱族不同尺度（四款柱子三种密度）',
  freezer: '9 个材质全部 0..1 铺满整台 1.85m 高的冰柜（跨度 1.00），细节图被拉粗约 3 倍',
})
