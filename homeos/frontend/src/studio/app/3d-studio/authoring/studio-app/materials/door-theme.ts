import { resolveMaterialPaletteColor } from "../../../materials/studio-model-material-roles";

export function doorPartThemeColor(doorType: string, role: string, palette: any) {
  const themeKeys = {
    frame:
      doorType === "solid" || doorType === "frame-only"
        ? ["solidDoorFrame", "doorFrame", "frame"]
        : doorType === "entry"
          ? ["entryDoorFrame", "doorFrame", "frame"]
          : ["doorFrame", "frame"],
    door: doorType === "entry" ? ["furnitureDark"] : ["doorLeaf"],
    glass: ["glass"],
    metal: doorType === "entry" ? ["furnitureLight"] : ["furnitureDark"],
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
