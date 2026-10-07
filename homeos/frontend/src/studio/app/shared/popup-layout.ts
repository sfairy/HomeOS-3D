export function popupLayoutColumns(options: any) {
  const columns = Number(options?.columns);
  return columns >= 2 && columns <= 4 ? columns : 3;
}
function popupModuleColumnSpan(moduleSpec: any) {
  const moduleType = typeof moduleSpec == "string" ? moduleSpec : moduleSpec?.type,
    moduleDeviceType =
      typeof moduleSpec == "object"
        ? moduleSpec?.deviceType || moduleSpec?.properties?.deviceType
        : "";
  return moduleType === "electric-bed" ||
    moduleDeviceType === "electric-bed" ||
    ["climate", "air-purifier", "water-heater", "media-player", "camera", "line-chart"].includes(
      moduleType,
    )
    ? 2
    : 1;
}
function popupModuleRowSpan(_rowModuleSpec: any) {
  return 1;
}
function placeModules(modules: any, columnLimit: any) {
  const placements: any[] = [],
    occupied: any = [];
  for (const module of modules || []) {
    const columnSpan = popupModuleColumnSpan(module),
      rowSpan = popupModuleRowSpan(module);
    if (columnSpan > columnLimit) return null;
    let placement: any = null;
    const maxRows = Math.max(4, (modules?.length || 0) * 2 + 1);
    for (let row = 0; row < maxRows && !placement; row += 1)
      for (let column = 0; column <= columnLimit - columnSpan; column += 1)
        if (
          Array.from(
            {
              length: rowSpan,
            },
            (_unusedRowIndex, rowOffset) =>
              Array.from(
                {
                  length: columnSpan,
                },
                (_unusedColumnIndex, columnOffset) =>
                  !occupied[row + rowOffset]?.[column + columnOffset],
              ).every(Boolean),
          ).every(Boolean)
        ) {
          placement = {
            x: column,
            y: row,
            width: columnSpan,
            height: rowSpan,
          };
          for (let rowIndex = 0; rowIndex < rowSpan; rowIndex += 1) {
            occupied[row + rowIndex] || (occupied[row + rowIndex] = []);
            for (let columnIndex = 0; columnIndex < columnSpan; columnIndex += 1)
              occupied[row + rowIndex][column + columnIndex] = true;
          }
          break;
        }
    if (!placement) return null;
    placements.push(placement);
  }
  return placements;
}
export function packPopupModules(moduleList: any, columnTotal: any) {
  const columnCount = popupLayoutColumns(columnTotal),
    packedPlacements = placeModules(moduleList, columnCount) || [],
    rowCount = Math.max(
      1,
      packedPlacements.reduce(
        (maxRow, packedPlacement) => Math.max(maxRow, packedPlacement.y + packedPlacement.height),
        0,
      ),
    );
  return {
    rows: Math.min(rowCount, 3),
    columns: columnCount,
    placements: packedPlacements,
    fits: rowCount <= 3,
  };
}
export function popupLayoutMetrics(moduleSpecs: any, layoutOptions: any) {
  const layout = packPopupModules(moduleSpecs, layoutOptions),
    gridWidth = 56 + layout.columns * 420 + (layout.columns - 1) * 14,
    gridHeight = 56 + layout.rows * 470 + (layout.rows - 1) * 14;
  return {
    ...layout,
    gridWidth: gridWidth,
    gridHeight: gridHeight,
    popupWidth: gridWidth,
    popupHeight: 88 + gridHeight,
  };
}
