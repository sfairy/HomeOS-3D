const ratioByBoard = new Map();
export function cameraPreviewRatio(boardId, ratio) {
  return (
    Number.isFinite(ratio) && ratio > 0 && ratioByBoard.set(boardId, ratio),
    ratioByBoard.get(boardId) || 16 / 9
  );
}
export function cameraPopupLayout(
  boardWidth,
  boardHeight,
  previewRatio = 16 / 9,
  chromeHeight = 58,
) {
  const maxPanelWidth = Math.max(1, (boardHeight - 24) / 2 - 26 - chromeHeight),
    panelWidth = Math.max(
      27,
      Math.min(boardWidth * 0.3, (boardWidth - 32) / 2, maxPanelWidth * previewRatio + 26),
    ),
    mediaHeight = (panelWidth - 26) / previewRatio,
    panelHeight = 26 + chromeHeight + mediaHeight,
    topOffset = Math.max(
      12,
      Math.min(boardHeight * 0.56 - panelHeight, boardHeight - panelHeight * 2 - 12),
    );
  return {
    panelWidth: panelWidth,
    mediaHeight: mediaHeight,
    panelHeight: panelHeight,
    top: topOffset,
  };
}
