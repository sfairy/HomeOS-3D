/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 */
(function sceneStillFlag() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const iPadInDisguise = navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '');
  if (coarsePointer || noHover || iPadInDisguise) {
    document.documentElement.classList.add('hos-touch');
  }
})();
