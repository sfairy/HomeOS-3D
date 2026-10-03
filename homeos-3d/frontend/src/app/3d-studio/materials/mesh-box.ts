/**
 * 程序化家具构件的基础积木：往分组里加一个「投影 + 受影」的标准材质盒子。
 *
 * 背景墙（featurewall）与壁画（mural）各自内联了一份实现完全相同的
 * `addMeshBox`，收成一处。
 */
export function addMeshBoxToGroup(
  three,
  group,
  boxWidth,
  boxHeight,
  boxDepth,
  x,
  y,
  z,
  color,
  roughness,
  metalness,
) {
  const mesh = new three.Mesh(
    new three.BoxGeometry(boxWidth, boxHeight, boxDepth),
    new three.MeshStandardMaterial({ color, roughness, metalness }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
