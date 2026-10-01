const O = new Set([
    "decor-books",
    "decor-vase",
    "decor-tea-tray",
    "decor-tissue-box",
    "decor-small-plant",
    "router",
    "humidifier",
    "laptop",
    "desktop",
    "nas",
    "printer",
    "microwave",
    "ricecooker",
  ]),
  j = new Set([
    "table",
    "rounddiningtable",
    "rounddiningtableturntable",
    "coffeetable",
    "squarecoffeetable",
    "tea-table-set",
    "desk",
    "nightstand",
    "tvstand",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "kitchenbase",
    "bar",
    "vanity",
  ]);
export function snapItemToSurface({
  THREE: arg1,
  item: arg2,
  items: arg3,
  pixelsPerMeter: arg4,
  mountModel: arg5,
  enabled: arg6 = true,
  movingIds: arg7 = [arg2.id],
}) {
  if (
    !arg6 ||
    arg7.length !== 1 ||
    !O.has(arg2.type) ||
    !(arg4 > 0) ||
    !(arg2.width > 0 && arg2.depth > 0)
  )
    return null;
  const value1 = ((arg2.rotation || 0) * Math.PI) / 180,
    value2 = Math.cos(value1),
    value3 = Math.sin(value1),
    value4 = [
      [0, 0],
      [-0.48, -0.48],
      [0.48, -0.48],
      [-0.48, 0.48],
      [0.48, 0.48],
      [-0.48, 0],
      [0.48, 0],
      [0, -0.48],
      [0, 0.48],
    ].map(
      ([arg8, arg9]) => (
        (arg8 *= arg2.width),
        (arg9 *= arg2.depth),
        [arg8 * value2 - arg9 * value3, arg8 * value3 + arg9 * value2]
      ),
    ),
    value5 = new arg1.Raycaster(),
    value6 = new arg1.Matrix3(),
    value7 = new arg1.Vector3(),
    value8 = new arg1.Vector3(0, -1, 0);
  let value9 = null;
  for (const value10 of arg3) {
    if (value10.id === arg2.id || !j.has(value10.type)) continue;
    const value11 = (value10.x - arg2.x) / arg4,
      value12 = (value10.y - arg2.y) / arg4;
    if (Math.hypot(value11, value12) > Math.hypot(value10.width, value10.depth) / 2) continue;
    const value13 = new arg1.Group();
    if (!arg5(value13, value10)) continue;
    (value13.position.set(value11, value10.elevation || 0, value12),
      (value13.rotation.y = (-(value10.rotation || 0) * Math.PI) / 180),
      value13.updateMatrixWorld(true));
    const list1 = [];
    value13.traverseVisible((arg10) => {
      arg10.isMesh && list1.push(arg10);
    });
    const value14 = new arg1.Box3().setFromObject(value13),
      list2 = [];
    for (const [value16, value17] of value4) {
      value5.set(new arg1.Vector3(value16, value14.max.y + 0.1, value17), value8);
      const value18 = value5.intersectObjects(list1, false)[0];
      if (
        !value18?.face ||
        (value7
          .copy(value18.face.normal)
          .applyMatrix3(value6.getNormalMatrix(value18.object.matrixWorld))
          .normalize(),
        value7.y < 0.999 || value18.point.y < 0.05 || value18.point.y > 6)
      )
        break;
      list2.push(value18.point.y);
    }
    if (list2.length !== value4.length) continue;
    const value15 = Math.max(...list2);
    value15 - Math.min(...list2) > 0.005 ||
      ((!value9 || value15 > value9.elevation) &&
        (value9 = {
          elevation: value15,
          supportId: value10.id,
        }));
  }
  return (value9 && (arg2.elevation = value9.elevation), value9);
}
