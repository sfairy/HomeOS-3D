import { doorMaterialPartIndex, doorMaterialPartRolesForType } from "../../../materials/studio-model-material-roles";
import { MATERIAL_STYLE_AUTO, materialStylePaletteColors, materialStyleRecipeFor, normalizeMaterialStyle } from "../../../materials/studio-material-presets";
import { normalizeMaterialOverrides, normalizeMaterialSurfaceOverrides } from "../../scene/studio-scene-payload";
import type { DoorPartMaterial } from "../../types/studio-app-types";
import { doorPartThemeColor } from "./door-theme";

export function resolveDoorPartMaterials(doorRecord: any, themePalette: any): Record<string, DoorPartMaterial> {
  const doorType = doorRecord?.doorType || "solid",
    doorStyleId = normalizeMaterialStyle("door", doorRecord?.materialStyle),
    doorPalette = {
      ...themePalette,
      ...materialStylePaletteColors("door", doorStyleId),
    };
  doorStyleId !== MATERIAL_STYLE_AUTO && (doorPalette.materialStyle = doorStyleId);
  const overrideColors = normalizeMaterialOverrides(doorRecord?.materialOverrides) || {},
    surfaceOverrides = normalizeMaterialSurfaceOverrides(doorRecord?.materialSurfaceOverrides),
    partMaterials: Record<string, DoorPartMaterial> = {};
  for (const role of doorMaterialPartRolesForType(doorType)) {
    const partIndex = doorMaterialPartIndex(role),
      materialName = "door-material-" + partIndex,
      styleRecipe = materialStyleRecipeFor("door", materialName, doorPalette, partIndex),
      overrideColor = overrideColors[materialName],
      overrideColorValue = overrideColor ? Number.parseInt(overrideColor.slice(1), 16) : undefined,
      slotSurfaceOverride = surfaceOverrides[materialName] || {};
    partMaterials[role] = {
      role,
      materialName,
      /** 画面用的色号：逐门覆盖色 > 档位配方 > 主题键。 */
      colorValue:
        overrideColorValue !== undefined
          ? overrideColorValue
          : styleRecipe?.colorValue ?? doorPartThemeColor(doorType, role, doorPalette),
      overrideColor: overrideColor || "",

      roughness: slotSurfaceOverride.roughness ?? styleRecipe?.roughness,
      metalness: slotSurfaceOverride.metalness ?? styleRecipe?.metalness,
      transparent: styleRecipe?.transparent === true,
      opacity: styleRecipe?.opacity ?? 1,
      depthWrite: styleRecipe?.depthWrite !== false,
      emissiveValue: styleRecipe?.emissiveValue,
      emissiveIntensity: styleRecipe?.emissiveIntensity,
    };
  }
  return partMaterials;
}

export function describeDoorMaterials(backgroundSettings: () => any, doorRecord: any) {
  const themePalette = backgroundSettings(),
    partMaterials = resolveDoorPartMaterials(doorRecord, themePalette),
    surfaceOverrides = normalizeMaterialSurfaceOverrides(doorRecord?.materialSurfaceOverrides);
  return doorMaterialPartRolesForType(doorRecord?.doorType).map((role) => {
    const partMaterial = partMaterials[role];
    return {
      name: partMaterial.materialName,
      role,
      roleSource: "role-table",
      slot: doorMaterialPartIndex(role),
      /** 门永远由角色表出图：没有「沿用模型自带色」这种情况。 */
      fromPalette: true,
      color: "#" + (partMaterial.colorValue & 0xffffff).toString(16).padStart(6, "0"),
      roughness: partMaterial.roughness ?? 0.58,
      metalness: partMaterial.metalness ?? 0.08,
      transparent: partMaterial.transparent === true,
      opacity: partMaterial.opacity ?? 1,
      emissive: "",
      emissiveIntensity: 0,
      depthWrite: partMaterial.depthWrite !== false,
      overrideColor: partMaterial.overrideColor,
      surfaceOverride: surfaceOverrides[partMaterial.materialName] || null,
      slab: "",
    };
  });
}
