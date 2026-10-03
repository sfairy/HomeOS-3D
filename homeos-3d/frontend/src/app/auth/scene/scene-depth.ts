

(function sceneStillFlag() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;

  const iPadInDisguise = navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || "");
  if (coarsePointer || noHover || iPadInDisguise) {
    document.documentElement.classList.add("hos-touch");
  }
})();
