/** 程序化家具构件的基础积木：往分组里加一个「投影 + 受影」的标准材质盒子。 */
export function addMeshBoxToGroup(
  three: any,
  group: any,
  boxWidth: any,
  boxHeight: any,
  boxDepth: any,
  x: any,
  y: any,
  z: any,
  color: any,
  roughness: any,
  metalness: any,
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
