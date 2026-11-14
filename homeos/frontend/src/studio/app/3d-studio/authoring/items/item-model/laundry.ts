/**
 * 物品模型分派族：laundry。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */
import { box, cyl } from '../mesh-shorthand'

import type { ItemModelScope } from "./types";

export function buildLaundry(scope: ItemModelScope): boolean {
  const {
    itemModelNode,
    modelItem,
    width6,
    depth,
    height6,
    furniture,
    furnitureSoft,
    furnitureLight,
    furnitureDark,
  } = scope;

  if (modelItem.type === "washer" ||
      modelItem.type === "dryer") {
    const isDryer =
        modelItem.type === "dryer",
      washerDrumRadius =
        width6 *
        (isDryer ? 0.32 : 0.29);
    (box(itemModelNode, [width6, height6, depth], [0, height6 * 0.5, 0], furnitureLight, {
        rounded: false,
        metalness: 0.1,
        roughness: 0.48,
      }),
      box(itemModelNode, [width6 * 0.92, height6 * 0.18, 0.035], [0, height6 * 0.86, depth * 0.505], furnitureSoft, {
          rounded: false,
          roughness: 0.4,
        }),
      cyl(itemModelNode, [washerDrumRadius, washerDrumRadius, 0.045], [0, height6 * 0.47, depth * 0.515], furnitureDark, {
          segments: 40,
          rotationX: Math.PI / 2,
          metalness: 0.32,
          roughness: 0.28,
        }),
      cyl(itemModelNode, [washerDrumRadius * 0.74, washerDrumRadius * 0.74, 0.03], [0, height6 * 0.47, depth * 0.545], isDryer ? 2502715 : 3622485, {
          segments: 40,
          rotationX: Math.PI / 2,
          metalness: 0.08,
          roughness: 0.22,
        }),
      cyl(itemModelNode, [width6 * 0.055, width6 * 0.055, 0.035], [width6 * 0.27, height6 * 0.86, depth * 0.535], furnitureDark, {
          segments: 24,
          rotationX: Math.PI / 2,
          metalness: 0.4,
          roughness: 0.25,
        }),
      box(itemModelNode, [width6 * 0.25, height6 * 0.035, 0.026], [-width6 * 0.23, height6 * 0.86, depth * 0.535], furnitureDark, {
          rounded: false,
          roughness: 0.3,
        }),
      isDryer ||
        box(itemModelNode, [width6 * 0.2, height6 * 0.055, 0.025], [-width6 * 0.3, height6 * 0.12, depth * 0.525], furnitureSoft, {
            rounded: false,
            roughness: 0.42,
          }));
    return true;
  } else if (modelItem.type === "dishwasher") {
    (box(itemModelNode, [width6, height6, depth], [0, height6 * 0.5, 0], furnitureLight, {
        rounded: false,
        metalness: 0.12,
        roughness: 0.48,
      }),
      box(itemModelNode, [width6 * 0.93, height6 * 0.74, 0.028], [0, height6 * 0.46, depth * 0.515], furnitureSoft, {
          rounded: false,
          metalness: 0.08,
          roughness: 0.44,
        }),
      box(itemModelNode, [width6 * 0.93, height6 * 0.14, 0.032], [0, height6 * 0.87, depth * 0.52], furnitureDark, {
          rounded: false,
          metalness: 0.18,
          roughness: 0.3,
        }),
      box(itemModelNode, [width6 * 0.58, height6 * 0.026, 0.034], [0, height6 * 0.78, depth * 0.54], furnitureDark, {
          rounded: false,
          metalness: 0.5,
          roughness: 0.22,
        }),
      box(itemModelNode, [width6 * 0.9, height6 * 0.075, depth * 0.78], [0, height6 * 0.038, -depth * 0.04], furnitureDark, {
          rounded: false,
          roughness: 0.4,
        }));
    for (const dishwasherKnobRatio of [
      0.22, 0.31, 0.4,
    ])
      cyl(itemModelNode, [width6 * 0.018, width6 * 0.018, 0.012], [width6 * dishwasherKnobRatio, height6 * 0.88, depth * 0.545], furnitureSoft, {
          segments: 18,
          rotationX: Math.PI / 2,
          metalness: 0.26,
          roughness: 0.24,
        });
    return true;
  } else if (modelItem.type === "steamoven") {
    (box(itemModelNode, [width6, height6, depth], [0, height6 * 0.5, 0], furnitureLight, {
        rounded: false,
        metalness: 0.16,
        roughness: 0.42,
      }),
      box(itemModelNode, [width6 * 0.94, height6 * 0.9, 0.026], [0, height6 * 0.5, depth * 0.515], furnitureDark, {
          rounded: false,
          metalness: 0.18,
          roughness: 0.25,
        }),
      box(itemModelNode, [width6 * 0.78, height6 * 0.56, 0.018], [-width6 * 0.03, height6 * 0.42, depth * 0.54], 1515819, {
          rounded: false,
          metalness: 0.12,
          roughness: 0.18,
        }),
      box(itemModelNode, [width6 * 0.72, height6 * 0.035, 0.038], [-width6 * 0.03, height6 * 0.74, depth * 0.56], furnitureSoft, {
          rounded: false,
          metalness: 0.52,
          roughness: 0.22,
        }),
      box(itemModelNode, [width6 * 0.24, height6 * 0.075, 0.022], [0, height6 * 0.86, depth * 0.545], 7706534, {
          rounded: false,
          emissive: 7706534,
          emissiveIntensity: 0.18,
          roughness: 0.2,
        }));
    for (const steamovenHandleRatio of [
      -0.36, 0.36,
    ])
      cyl(itemModelNode, [width6 * 0.045, width6 * 0.045, 0.026], [width6 *
          steamovenHandleRatio, height6 * 0.86, depth * 0.55], furnitureSoft, {
          segments: 24,
          rotationX: Math.PI / 2,
          metalness: 0.4,
          roughness: 0.24,
        });
    return true;
  } else if (modelItem.type === "microwave") {
    (box(itemModelNode, [width6, height6, depth], [0, height6 * 0.5, 0], furnitureLight, {
        rounded: false,
        metalness: 0.12,
        roughness: 0.44,
      }),
      box(itemModelNode, [width6 * 0.93, height6 * 0.82, 0.025], [0, height6 * 0.49, depth * 0.515], furnitureDark, {
          rounded: false,
          metalness: 0.16,
          roughness: 0.24,
        }),
      box(itemModelNode, [width6 * 0.62, height6 * 0.63, 0.018], [-width6 * 0.13, height6 * 0.48, depth * 0.54], 1515819, {
          rounded: false,
          metalness: 0.12,
          roughness: 0.18,
        }),
      box(itemModelNode, [width6 * 0.035, height6 * 0.54, 0.03], [width6 * 0.19, height6 * 0.48, depth * 0.55], furnitureSoft, {
          rounded: false,
          metalness: 0.46,
          roughness: 0.22,
        }),
      box(itemModelNode, [width6 * 0.17, height6 * 0.1, 0.02], [width6 * 0.36, height6 * 0.72, depth * 0.54], 7706534, {
          rounded: false,
          emissive: 7706534,
          emissiveIntensity: 0.16,
          roughness: 0.2,
        }));
    for (const microwaveKnobRatio of [
      0.48, 0.34, 0.2,
    ])
      box(itemModelNode, [width6 * 0.13, height6 * 0.055, 0.018], [width6 * 0.36, height6 *
          microwaveKnobRatio, depth * 0.545], furnitureSoft, {
          rounded: false,
          roughness: 0.3,
        });
    return true;
  } else if (modelItem.type ===
      "ricecooker") {
    const ricecookerPotRadius =
      Math.min(width6, depth) *
      0.47;
    (cyl(itemModelNode, [ricecookerPotRadius * 0.9, ricecookerPotRadius, height6 * 0.68], [0, height6 * 0.38, 0], furnitureLight, {
        segments: 36,
        roughness: 0.46,
      }),
      cyl(itemModelNode, [ricecookerPotRadius *
          0.94, ricecookerPotRadius *
          0.94, height6 * 0.12], [0, height6 * 0.77, 0], furnitureSoft, {
          segments: 36,
          roughness: 0.38,
        }),
      cyl(itemModelNode, [ricecookerPotRadius *
          0.72, ricecookerPotRadius *
          0.74, height6 * 0.035], [0, height6 * 0.85, 0], furnitureDark, {
          segments: 32,
          metalness: 0.12,
          roughness: 0.28,
        }),
      box(itemModelNode, [width6 * 0.5, height6 * 0.16, 0.026], [0, height6 * 0.42, depth * 0.47], furnitureDark, {
          radius:
            Math.min(
              width6,
              depth,
            ) * 0.04,
          roughness: 0.28,
        }),
      box(itemModelNode, [width6 * 0.24, height6 * 0.06, 0.018], [0, height6 * 0.43, depth * 0.49], 7706534, {
          rounded: false,
          emissive: 7706534,
          emissiveIntensity: 0.16,
          roughness: 0.2,
        }),
      box(itemModelNode, [width6 * 0.05, height6 * 0.16, depth * 0.1], [-width6 * 0.27, height6 * 0.86, 0], furnitureDark, {
          roughness: 0.3,
        }),
      box(itemModelNode, [width6 * 0.05, height6 * 0.16, depth * 0.1], [width6 * 0.27, height6 * 0.86, 0], furnitureDark, {
          roughness: 0.3,
        }),
      box(itemModelNode, [width6 * 0.58, height6 * 0.055, depth * 0.1], [0, height6 * 0.94, 0], furnitureDark, {
          roughness: 0.3,
        }));
    return true;
  } else if (modelItem.type ===
      "rangehood") {
    (box(itemModelNode, [width6 * 0.34, height6 * 0.72, depth * 0.42], [0, height6 * 0.6, -depth * 0.18], furniture, {
        rounded: false,
        metalness: 0.22,
        roughness: 0.42,
      }),
      box(itemModelNode, [width6, height6 * 0.22, depth], [0, height6 * 0.18, 0], furnitureLight, {
          rounded: false,
          metalness: 0.2,
          roughness: 0.4,
        }),
      box(itemModelNode, [width6 * 0.9, height6 * 0.07, depth * 0.8], [0, height6 * 0.055, depth * 0.02], furnitureDark, {
          rounded: false,
          metalness: 0.35,
          roughness: 0.28,
        }),
      box(itemModelNode, [width6 * 0.22, height6 * 0.035, 0.025], [width6 * 0.3, height6 * 0.2, depth * 0.515], furnitureSoft, {
          rounded: false,
          emissive:
            furnitureSoft,
          emissiveIntensity: 0.12,
          roughness: 0.3,
        }));
    return true;
  }
  return false;
}
