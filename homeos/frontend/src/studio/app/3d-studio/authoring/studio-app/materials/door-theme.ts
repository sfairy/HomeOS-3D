import { resolveMaterialPaletteColor } from "../../../materials/studio-model-material-roles";

export function doorPartThemeColor(doorType: string, role: string, palette: any) {
  /** 入户门与入户子母门共用一套深色门扇 + 浅色五金。 */
  const isEntryDoor = doorType === "entry" || doorType === "entry-child-mother";
  const themeKeys = {
    frame:
      doorType === "solid" || doorType === "frame-only"
        ? ["solidDoorFrame", "doorFrame", "frame"]
        : isEntryDoor
          ? ["entryDoorFrame", "doorFrame", "frame"]
          : ["doorFrame", "frame"],
    door: isEntryDoor ? ["furnitureDark"] : ["doorLeaf"],
    glass: ["glass"],
    metal: isEntryDoor ? ["furnitureLight"] : ["furnitureDark"],
    shutter: ["rollerCurtain", "furnitureSoft"],
    slat: ["rollerSlat", "furnitureDark"],
    trim: ["furnitureSoft", "furnitureDark"],
  }[role];
  if (!themeKeys) return resolveMaterialPaletteColor(palette, "furniture");


  for (const themeKey of themeKeys) {
    const colorValue = palette?.[themeKey];
    if (typeof colorValue === "number") return colorValue;
  }
  return resolveMaterialPaletteColor(palette, themeKeys[themeKeys.length - 1]);
}
