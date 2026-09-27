/**
 * 楼层堆叠顺序的重排计算。
 */

type FloorRecord = {
  id?: unknown;
  elevation?: number;
  [key: string]: unknown;
};

function toPositiveNumber(value: unknown): number {
  const parsedValue = Number(value);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  } else {
    return 3;
  }
}

/**
 * 把某个楼层拖到目标楼层的前面或后面，并顺带刷新各层标高。
 */
export function reorderFloors(
  floors: FloorRecord[],
  draggedFloorId: unknown,
  targetFloorId: unknown,
  placeAfter = false,
  defaultFloorSpacing = 3
): FloorRecord[] {
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
