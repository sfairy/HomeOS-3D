// 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
//
// 源：homeos-3d/frontend/src/app/auth/scene/scene-depth.ts。
// 之所以要这个开关：场景里那些持续动效（极光、星点、扫描线）在手机上既费电又掉帧，
// scene.css 用 .hos-touch 把整组动效降级成静止的一帧；判断必须在首帧前跑完，
// 所以它是普通脚本（不导出、不 defer）而不是模块。
(function sceneStillFlag() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  // iPad 伪装成 Mac：matchMedia 两条都报 false，只能靠触点数识别。
  const iPadInDisguise = navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || "");
  if (coarsePointer || noHover || iPadInDisguise) {
    document.documentElement.classList.add("hos-touch");
  }
})();
