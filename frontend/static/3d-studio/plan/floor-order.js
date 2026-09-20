/**
 * 楼层堆叠顺序的重排计算。
 *
 * 楼层列表拖拽排序逻辑，studio-app.js 在放下拖拽项时调用：按「拖到谁前面 / 后面」的语义算出
 * 新的楼层数组，并按新顺序重算每层标高。只导出纯函数 reorderFloors，不改动入参数组。标高以米
 * 为单位，按「堆叠序号 × 层间距」线性排布。
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
 * 入参非法或结果与原来一致时原样返回入参，调用方可用引用相等判断「无需更新」。
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
