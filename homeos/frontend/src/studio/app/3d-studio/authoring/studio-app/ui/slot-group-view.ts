import { materialSlotGroupOf } from "../../../materials/studio-material-slot-groups";
import type { StudioAppContext } from "../studio-app-context";

export function materialSlotGroupView(appCtx: StudioAppContext, materialSlotEntries: any) {
  const groupsInOrder: any = [];
  for (const slotEntry of materialSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry);
    if (!groupsInOrder.some((groupEntry: any) => groupEntry.id === slotGroup.id))
      groupsInOrder.push({ id: slotGroup.id, label: slotGroup.label });
  }
  const isFilterable = groupsInOrder.length > 1,
    activeGroupId =
      isFilterable && groupsInOrder.some((groupEntry: any) => groupEntry.id === appCtx.materialSlotGroupFilter)
        ? appCtx.materialSlotGroupFilter
        : "";
  return {
    groups: groupsInOrder,
    isFilterable: isFilterable,
    activeGroupId: activeGroupId,
    visibleSlotEntries: activeGroupId
      ? materialSlotEntries.filter((slotEntry: any) => materialSlotGroupOf(slotEntry).id === activeGroupId)
      : materialSlotEntries,
  };
}
