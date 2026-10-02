export function syncAppleDisplaySurface(boardConfig, env = window) {
  const { document: documentNode, navigator: nav } = env,
    isIosDevice =
      /iPad|iPhone|iPod/i.test(nav.userAgent || "") ||
      (/Macintosh/i.test(nav.userAgent || "") && Number(nav.maxTouchPoints || 0) > 1),
    isStandalone =
      nav.standalone === true || env.matchMedia?.("(display-mode: standalone)").matches === true;
  if (!isIosDevice || !isStandalone) return;
  const canvasBackground = boardConfig?.canvas?.background,
    surfaceColor =
      canvasBackground?.type === "color" &&
      typeof canvasBackground.color == "string" &&
      env.CSS?.supports("color", canvasBackground.color)
        ? canvasBackground.color
        : "#070b0e";
  (documentNode.documentElement.style.setProperty("--display-surface-background", surfaceColor),
    documentNode.querySelector('meta[name="theme-color"]')?.setAttribute("content", surfaceColor));
}
