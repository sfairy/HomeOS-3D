/** 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 必须在首帧前跑完：登录 / 注册 / 授权场景的样式里有整组 ``html.hos-touch …`` 规则
 * （触摸设备上关掉重动画），而这些规则只能靠这个 class 生效。所以它是
 * ``index.html`` 里的普通阻塞脚本（不导出、不 defer），由 ``vite-studio.ts``
 * 以 ``auth/scene/scene-depth`` 为入口产出 ``/static/auth/scene/scene-depth.js``。
 *
 * 与商店侧 ``homeos-store/frontend/src/scene/scene-depth.ts`` 同源：判据必须逐条一致，
 * 否则同一台设备在两个前端的「手持档」档位会不一样。
 */
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const noHover = window.matchMedia('(hover: none)').matches;
// iPadOS 装在 Mac 上：platform 报 Mac，但触点数 > 1，按手持档处理。
const iPadInDisguise =
  navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '');
if (coarsePointer || noHover || iPadInDisguise) {
  document.documentElement.classList.add('hos-touch');
}
