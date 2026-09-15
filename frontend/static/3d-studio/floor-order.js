/**
 * 楼层堆叠顺序的重排计算。
 *
 * 位置：3D 工作室楼层列表的拖拽排序逻辑，被 studio-app.js 在放下拖拽项时调用。
 * 职责：按「拖到谁前面 / 后面」的语义算出新的楼层数组，并按新顺序重算每层标高。
 * 对外：只导出 reorderFloors；纯函数，不改动入参数组。
 * 约定：楼层标高以米为单位，按「堆叠序号 × 层间距」线性排布，
 *   即重排后楼层在竖直方向上一定是等距的。
 */

// 层间距兜底值（米）：传进来的值非法时用它，避免楼层全部塌到 y = 0 重叠在一起。
function toPositiveNumber(value) {
  const parsedValue = Number(value);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  } else {
    return 3;
  }
}

/**
 * 把某个楼层拖到目标楼层的前面或后面，并顺带刷新各层标高。
 *
 * 无法重排时（入参不是数组、不足两层、缺少 id、拖动项与目标项相同、id 找不到）
 * 原样返回入参，调用方可以直接用返回值覆盖状态，无需再做额外判断。
 * 若重排结果与原来完全一致，也返回原数组，便于调用方用引用相等判断「无需更新」。
 *
 * @param {Array<object>} floors 楼层列表，每项至少含 id 与 elevation。
 * @param {string} draggedFloorId 被拖动的楼层 id。
 * @param {string} targetFloorId 落点所在的楼层 id。
 * @param {boolean} [placeAfter] true 表示插到目标楼层之后，默认插到之前。
 * @param {number} [defaultFloorSpacing] 层间距（米），默认 3。
 * @returns {Array<object>} 新的楼层数组；未发生改动时返回原数组。
 */
export function reorderFloors(
  floors,
  draggedFloorId,
  targetFloorId,
  placeAfter = false,
  defaultFloorSpacing = 3
) {
  if (
    !Array.isArray(floors) ||
    floors.length < 2 ||
    !draggedFloorId ||
    !targetFloorId ||
    draggedFloorId === targetFloorId
  ) {
    return floors;
  }
  const draggedIndex = floors.findIndex(floorEntry => floorEntry?.id === draggedFloorId);
  const targetIndex = floors.findIndex(candidateFloor => candidateFloor?.id === targetFloorId);
  // 任一 id 在列表里找不到说明数据已过期，宁可不动也不要产生错位的顺序。
  if (draggedIndex < 0 || targetIndex < 0) {
    return floors;
  }
  // 先复制再改，保持本函数无副作用。
  const reorderedFloors = [...floors];
  const [movedFloor] = reorderedFloors.splice(draggedIndex, 1);
  // 移除后下标会整体前移，所以要在删完之后重新定位目标楼层。
  const insertIndex = reorderedFloors.findIndex(
    remainingFloor => remainingFloor?.id === targetFloorId
  );
  reorderedFloors.splice(insertIndex + (placeAfter ? 1 : 0), 0, movedFloor);
  // 顺序没变（例如拖回原位）时返回原数组，调用方可用 === 判断提前退出。
  if (
    reorderedFloors.every((orderedFloor, floorIndex) => orderedFloor?.id === floors[floorIndex]?.id)
  ) {
    return floors;
  }
  const floorSpacing = toPositiveNumber(defaultFloorSpacing);
  // 重排后按堆叠序号重新分配标高，保证竖直方向连续无空洞。
  return reorderedFloors.map((floorRecord, stackIndex) => ({
    ...floorRecord,
    elevation: stackIndex * floorSpacing
  }));
}
