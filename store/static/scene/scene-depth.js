/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 文件名是历史遗留。这里原本是场景的**视差相机**：把指针位置写成 --hos-px / --hos-py
 * 两个 CSS 变量，各层再按自己的 --hos-depth 倍率位移，靠层间位移读出深度。
 * 2026-09 按需求整体退役（理由写在 scene.css 顶部「指针视差（已退役）」）：指针一动，
 * 倍率最高的那组（三个轨道环 + 圆心光斑）就跟着漂，而它们是细线、虚线弧与发光节点 ——
 * 这套图形里位移最不像深度，最像「页面在动」。CSS 侧的取用点也一并删了：两半必须配对
 * （tools/check_invariants.mjs 有一条正是「JS 写入的自定义属性没人读」）。
 *
 * 没有改名、也没有把这个 <script> 摘掉，是因为它还担着一件非它不可的事：
 * **静止档的判据兜底**。scene.css 的「静止档」用 @media (pointer: coarse), (hover: none)
 * 开门，但 iPad 接上妙控键盘 / 触控板之后，那条媒体查询会改口报 hover: hover /
 * pointer: fine —— 于是这台仍然是平板的设备滑出了静止档，而它的 GPU 档位与「坞体玻璃
 * 压在动效上」这两件事一点没变。html.hos-touch 就是给这条路径准备的第二把钥匙。
 *
 * 为什么必须是页面底部的同步脚本（而不是 module、也不延后）：这个类要在首帧之前挂上，
 * 否则入场那 0.75s 里静止档还没生效，动画会先跑起来再被冻住 —— 那一下正是「闪」。
 * 它不导出任何东西、不发请求、不读页面内容；CSP 的 script-src 'self' 下同源外部脚本
 * 也不需要 nonce。
 *
 * 判据与 CSS 那条刻意一致，只多一条「伪装成 Mac 的 iPad」：iPadOS 13 起 platform 报
 * MacIntel 却报出多点触控。**不能**把这条推广成「凡 maxTouchPoints > 0 就算手持」——
 * Windows 触摸本同样报多点触控，而它的主指针是鼠标 / 触控板、GPU 与桌面同级，把它也算
 * 进来就等于给桌面设备白扣一批装饰动画。
 *
 * 改动请以 design/scene/ 下的同名文件为准，两侧必须一致，勿单侧手改。
 */
(function sceneStillFlag() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const iPadInDisguise = navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '');
  if (coarsePointer || noHover || iPadInDisguise) {
    document.documentElement.classList.add('hos-touch');
  }
})();
