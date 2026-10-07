

import { createMuralArtTexture } from "./studio-surface-textures";
import { addMeshBoxToGroup } from "./mesh-box";

const MAX_TEXTURE_ANISOTROPY = 8;

/** 构建壁画模型。
 *
 * @param {object} three 与场景同一份的 THREE 命名空间。
 * @param {object} item  场景物件（读取 width / height / depth / muralStyle）。
 * @param {object} palette 站点配色（读取 furnitureDark 作边框、furnitureLight 作画芯底）。
 * @returns {object} THREE.Group
 */
export function createMuralModel(three: any, item: any, palette: any) {
  const itemWidth = Math.max(Number(item.width) || 1.2, 0.2);
  const itemHeight = Math.max(Number(item.height) || 0.8, 0.2);
  const itemDepth = Math.max(Number(item.depth) || 0.1, 0.02);
  const frameColor = palette?.furnitureDark ?? 0x3a3f47;
  const artColor = palette?.furnitureLight ?? 0xe8e2d6;

  const group = new three.Group();
  group.name = "mural";

  const addMeshBox = (boxWidth: any, boxHeight: any, boxDepth: any, x: any, y: any, z: any, color: any, roughness: any, metalness: any) =>
    addMeshBoxToGroup(three, group, boxWidth, boxHeight, boxDepth, x, y, z, color, roughness, metalness);

  const frameDepth = Math.max(itemDepth, 0.04);
  const frameBand = Math.min(itemWidth, itemHeight) * 0.058;
  const artWidth = Math.max(itemWidth - frameBand * 1.9, itemWidth * 0.36);
  const artHeight = Math.max(itemHeight - frameBand * 1.9, itemHeight * 0.36);
  const wallZ = -frameDepth * 0.5;


  addMeshBox(itemWidth, itemHeight, frameDepth * 0.66, 0, itemHeight * 0.5, wallZ + frameDepth * 0.33, frameColor, 0.62, 0.04);


  addMeshBox(artWidth, artHeight, frameDepth * 0.34, 0, itemHeight * 0.5, wallZ + frameDepth * 0.5, artColor, 0.94, 0);


  const muralTexture = createMuralArtTexture(three, item.muralStyle, MAX_TEXTURE_ANISOTROPY);
  if (muralTexture) {
    const artworkMesh = new three.Mesh(
      new three.PlaneGeometry(artWidth, artHeight),
      new three.MeshStandardMaterial({ map: muralTexture, roughness: 0.82, metalness: 0 }),
    );
    artworkMesh.position.set(0, itemHeight * 0.5, wallZ + frameDepth * 0.72);
    artworkMesh.castShadow = false;
    artworkMesh.receiveShadow = true;
    group.add(artworkMesh);
  }


  addMeshBox(itemWidth, frameBand, frameDepth, 0, frameBand * 0.5, 0, frameColor, 0.4, 0.16);
  addMeshBox(itemWidth, frameBand, frameDepth, 0, itemHeight - frameBand * 0.5, 0, frameColor, 0.4, 0.16);
  addMeshBox(frameBand, itemHeight - frameBand * 2, frameDepth, -itemWidth * 0.5 + frameBand * 0.5, itemHeight * 0.5, 0, frameColor, 0.4, 0.16);
  addMeshBox(frameBand, itemHeight - frameBand * 2, frameDepth, itemWidth * 0.5 - frameBand * 0.5, itemHeight * 0.5, 0, frameColor, 0.4, 0.16);

  return group;
}
