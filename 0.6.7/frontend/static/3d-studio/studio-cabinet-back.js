export function repairGlassCabinetBack(arg1, arg2, arg3 = "glasscabinet") {
  arg2.updateMatrixWorld(true);
  let value1, value2;
  if (
    (arg2.traverse((arg4) => {
      !arg4.isMesh ||
        Array.isArray(arg4.material) ||
        (arg4.material?.name === arg3 + "-material-0" && (value1 = arg4),
        arg4.material?.name === arg3 + "-material-" + (arg3 === "bookcase" ? 7 : 10) &&
          (value2 = arg4));
    }),
    !value1 || !value2)
  )
    return false;
  (value1.geometry.computeBoundingBox(), value2.geometry.computeBoundingBox());
  const value3 = value1.geometry.boundingBox,
    value4 = value2.geometry.boundingBox
      .clone()
      .applyMatrix4(
        new arg1.Matrix4().copy(value1.matrixWorld).invert().multiply(value2.matrixWorld),
      ),
    value5 = Math.min(value3.min.z, value4.min.z) - 0.004,
    value6 = new arg1.BoxGeometry(
      value4.max.x - value4.min.x,
      value4.max.y - value4.min.y,
      value3.max.z - value5,
    );
  (value6.translate(
    (value4.min.x + value4.max.x) / 2,
    (value4.min.y + value4.max.y) / 2,
    (value5 + value3.max.z) / 2,
  ),
    value6.computeBoundingBox(),
    value6.computeBoundingSphere());
  const value7 = value1.geometry;
  value1.geometry = value6;
  let value8 = false;
  return (
    arg2.traverse((arg5) => {
      arg5 !== value1 && arg5.geometry === value7 && (value8 = true);
    }),
    value8 || value7.dispose(),
    true
  );
}
function B(arg6, arg7) {
  const list1 = [],
    list2 = [],
    list3 = [];
  for (const [value10, value11, value12, value13, value14, value15] of arg7) {
    const value16 = new arg6.BoxGeometry(value10, value11, value12),
      value17 = value16.toNonIndexed();
    (value16.dispose(),
      value17.translate(value13, value14, value15),
      list1.push(...value17.attributes.position.array),
      list2.push(...value17.attributes.normal.array),
      list3.push(...value17.attributes.uv.array),
      value17.dispose());
  }
  const value9 = new arg6.BufferGeometry();
  return (
    value9.setAttribute("position", new arg6.Float32BufferAttribute(list1, 3)),
    value9.setAttribute("normal", new arg6.Float32BufferAttribute(list2, 3)),
    value9.setAttribute("uv", new arg6.Float32BufferAttribute(list3, 2)),
    value9.computeBoundingBox(),
    value9.computeBoundingSphere(),
    value9
  );
}
export function repairSideboardJoints(arg8, arg9) {
  const map1 = new Map();
  arg9.traverse((arg10) => {
    arg10.isMesh && !Array.isArray(arg10.material) && map1.set(arg10.material?.name, arg10);
  });
  const value18 = map1.get("sideboard-material-0"),
    value19 = map1.get("sideboard-material-1"),
    value20 = map1.get("sideboard-material-2");
  if (!value18 || !value19 || !value20) return false;
  for (const value27 of [value18, value19, value20]) value27.geometry.computeBoundingBox();
  const value21 = value18.geometry.boundingBox,
    value22 = value19.geometry.boundingBox,
    value23 = value20.geometry.attributes.position;
  let value24 = -Infinity,
    value25 = Infinity;
  for (let value28 = 0; value28 < value23.count; value28++) {
    const value29 = value23.getY(value28);
    value29 <= value21.max.y
      ? (value24 = Math.max(value24, value29))
      : (value25 = Math.min(value25, value29));
  }
  if (!Number.isFinite(value24) || !Number.isFinite(value25) || value25 <= value21.max.y)
    return false;
  const value26 = value20.geometry.clone();
  for (let value30 = 0; value30 < value23.count; value30++)
    value23.getY(value30) === value24 && value26.attributes.position.setY(value30, value21.min.y);
  const list4 = [
    [value20, value26],
    [
      value19,
      B(arg8, [
        [
          value22.max.x - value22.min.x,
          value25 - value21.max.y,
          value22.max.z - value22.min.z,
          (value22.min.x + value22.max.x) / 2,
          (value25 + value21.max.y) / 2,
          (value22.min.z + value22.max.z) / 2,
        ],
      ]),
    ],
  ];
  for (const [value31, value32] of list4) {
    (value32.computeBoundingBox(), value32.computeBoundingSphere());
    const value33 = value31.geometry;
    value31.geometry = value32;
    let value34 = false;
    (arg9.traverse((arg11) => {
      arg11 !== value31 && arg11.geometry === value33 && (value34 = true);
    }),
      value34 || value33.dispose());
  }
  return true;
}
export function repairWallCabinetSides(arg12, arg13) {
  const map2 = new Map();
  arg13.traverse((arg14) => {
    arg14.isMesh && !Array.isArray(arg14.material) && map2.set(arg14.material?.name, arg14);
  });
  const value35 = map2.get("wallcabinet-material-0"),
    value36 = map2.get("wallcabinet-material-1"),
    value37 = map2.get("wallcabinet-material-2");
  if (!value35 || !value36 || !value37) return false;
  for (const value50 of [value35, value36, value37]) value50.geometry.computeBoundingBox();
  const value38 = value35.geometry.boundingBox,
    value39 = value36.geometry.boundingBox,
    value40 = value37.geometry.boundingBox,
    value41 = value38.max.x - value38.min.x,
    value42 = value39.max.z - value39.min.z,
    value43 = value38.max.z - value38.min.z,
    value44 = (value38.min.x + value38.max.x) / 2,
    value45 = (value39.min.z + value39.max.z) / 2,
    value46 = value40.min.y,
    value47 = value39.max.y,
    value48 = value40.max.y,
    value49 = value41 - value43 * 2,
    list5 = [
      [
        value36,
        B(arg12, [
          [
            value43,
            value47 - value46,
            value42,
            value44 - (value41 - value43) / 2,
            (value46 + value47) / 2,
            value45,
          ],
          [
            value43,
            value47 - value46,
            value42,
            value44 + (value41 - value43) / 2,
            (value46 + value47) / 2,
            value45,
          ],
          [value49, value47 - value48, value42, value44, (value48 + value47) / 2, value45],
        ]),
      ],
      [
        value37,
        B(arg12, [
          [value49, value43, value42, value44, value46 + value43 / 2, value45],
          [value49, value43, value42, value44, value48 - value43 / 2, value45],
        ]),
      ],
      [
        value35,
        B(arg12, [
          [
            value49,
            value48 - value46 - value43 * 2,
            value43,
            value44,
            (value46 + value48) / 2,
            value39.min.z + value43 / 2,
          ],
        ]),
      ],
    ];
  for (const [value51, value52] of list5) {
    const value53 = value51.geometry;
    value51.geometry = value52;
    let value54 = false;
    (arg13.traverse((arg15) => {
      arg15 !== value51 && arg15.geometry === value53 && (value54 = true);
    }),
      value54 || value53.dispose());
  }
  return true;
}
