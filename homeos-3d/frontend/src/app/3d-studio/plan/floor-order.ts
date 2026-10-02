function spacingOrDefault(spacingInput) {
  const spacing = Number(spacingInput);
  return Number.isFinite(spacing) && spacing > 0 ? spacing : 3;
}
export function reorderFloors(floors, draggedId, targetId, placeAfter = false, spacingOption = 3) {
  if (
    !Array.isArray(floors) ||
    floors.length < 2 ||
    !draggedId ||
    !targetId ||
    draggedId === targetId
  )
    return floors;
  const fromIndex = floors.findIndex((floor) => floor?.id === draggedId),
    toIndex = floors.findIndex((candidateFloor) => candidateFloor?.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return floors;
  const reordered = [...floors],
    [movedFloor] = reordered.splice(fromIndex, 1),
    insertIndex = reordered.findIndex((movedEntry) => movedEntry?.id === targetId);
  if (
    (reordered.splice(insertIndex + (placeAfter ? 1 : 0), 0, movedFloor),
    reordered.every(
      (comparedFloor, comparedIndex) => comparedFloor?.id === floors[comparedIndex]?.id,
    ))
  )
    return floors;
  const resolvedSpacing = spacingOrDefault(spacingOption);
  return reordered.map((listFloor, listIndex) => ({
    ...listFloor,
    elevation: listIndex * resolvedSpacing,
  }));
}
