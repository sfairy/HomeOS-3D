// 背景墙（featurewall）程序化模型。
//
// 迁移自 homeos-3d 的 studio-render-pipeline.ts::buildFeatureWallItemMeshGroup
// 与其 item-builders/storage-cabinets.ts::buildFeaturewallItem。
// 结构：基板 + 一张贴了程序化饰面的面片；slat（木格栅）额外生成实体竖条。
// 饰面贴图与材质参数来自 studio-surface-textures.js，按 wallStyle 缓存。

import {
  createFeatureWallTexture,
  FEATURE_WALL_STYLE_MATERIAL,
  normalizeFeatureWallStyle,
} from "./studio-surface-textures";

const MAX_TEXTURE_ANISOTROPY = 8;

/**
 * 构建背景墙模型。
 * @param {object} three 与场景同一份的 THREE 命名空间。
 * @param {object} item  场景物件（读取 width / height / depth / wallStyle）。
 * @returns {object} THREE.Group
 */
export function createFeaturewallModel(three, item) {
  const itemWidth = Math.max(Number(item.width) || 3, 0.3);
  const itemHeight = Math.max(Number(item.height) || 2.4, 0.3);
  const itemDepth = Math.max(Number(item.depth) || 0.1, 0.02);

  const group = new three.Group();
  group.name = "featurewall";

  const addMeshBox = (boxWidth, boxHeight, boxDepth, x, y, z, color, roughness, metalness) => {
    const mesh = new three.Mesh(
      new three.BoxGeometry(boxWidth, boxHeight, boxDepth),
      new three.MeshStandardMaterial({ color, roughness, metalness }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const wallStyle = normalizeFeatureWallStyle(item.wallStyle);
  const wallMaterial = FEATURE_WALL_STYLE_MATERIAL[wallStyle];
  const panelDepth = Math.max(itemDepth, 0.04);

  // 基板：饰面贴图之下的实体，保证侧看有厚度。
  addMeshBox(itemWidth, itemHeight, panelDepth, 0, itemHeight * 0.5, -panelDepth * 0.5, wallMaterial.color, wallMaterial.roughness, wallMaterial.metalness);

  // 饰面面片：程序化画布贴图。
  const panelTexture = createFeatureWallTexture(three, wallStyle, MAX_TEXTURE_ANISOTROPY);
  if (panelTexture) {
    const claddingMesh = new three.Mesh(
      new three.PlaneGeometry(itemWidth, itemHeight),
      new three.MeshStandardMaterial({
        map: panelTexture,
        roughness: wallMaterial.roughness,
        metalness: wallMaterial.metalness,
      }),
    );
    claddingMesh.position.set(0, itemHeight * 0.5, 0.0015);
    claddingMesh.castShadow = false;
    claddingMesh.receiveShadow = true;
    group.add(claddingMesh);
  }

  // 木格栅：贴图之外再长出一排实体竖条，只有贴图会显得是平的一张纸。
  if (wallStyle === "slat") {
    const slatCount = Math.min(48, Math.max(4, Math.round(itemWidth / 0.1)));
    const slatPitch = itemWidth / slatCount;
    const slatWidth = slatPitch * 0.62;
    const slatDepth = Math.min(Math.max(panelDepth * 0.62, 0.02), 0.05);
    for (let slat = 0; slat < slatCount; slat += 1) {
      addMeshBox(
        slatWidth,
        itemHeight,
        slatDepth,
        -itemWidth * 0.5 + slatPitch * (slat + 0.5),
        itemHeight * 0.5,
        slatDepth * 0.5 + 0.002,
        wallMaterial.color,
        0.7,
        0.03,
      );
    }
  }

  return group;
}
