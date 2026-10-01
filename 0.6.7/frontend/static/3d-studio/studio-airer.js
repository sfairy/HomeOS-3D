import { RoundedBoxGeometry } from "../vendor/three/0.182.0/RoundedBoxGeometry.js";
export function airerDimensions(arg1 = {}) {
  const fn1 = (arg2, arg3) =>
      arg2 !== null && arg2 !== "" && Number.isFinite(Number(arg2)) ? Number(arg2) : arg3,
    fn2 = (arg4, arg5, arg6) => Math.max(arg5, Math.min(arg6, arg4)),
    value1 = fn2(fn1(arg1.elevation, 2.7), 0.5, 6),
    value2 = fn2(fn1(arg1.airerExtension, 1.2), 0.3, Math.min(2.4, value1 - 0.12));
  return {
    elevation: value1,
    airerExtension: value2,
    airerPreview: fn2(fn1(arg1.airerPreview, 55), 0, 100),
    width: fn2(fn1(arg1.width, 2.24), 1, 3.5),
    depth: fn2(fn1(arg1.depth, 0.57), 0.4, 1),
    height: value2,
  };
}
export function createAirerModel(arg7, arg8, arg9) {
  const value3 = airerDimensions(arg8),
    value4 = Math.max(3, Math.ceil(value3.airerExtension / 0.4)),
    object1 = {
      body: arg9.appliance,
      soft: arg9.applianceSoft,
      dark: arg9.applianceDark,
      trim: arg9.warmWood ? arg9.wood : arg9.appliance,
    },
    value5 = new arg7.Group();
  value5.name = "electric-airer";
  const value6 = Object.fromEntries(
      ["body", "soft", "dark", "trim"].map((arg10) => [
        arg10,
        new arg7.MeshStandardMaterial({
          color: object1[arg10],
          roughness: arg10 === "dark" ? 0.55 : 0.75,
          metalness: arg10 === "dark" ? 0.18 : 0.04,
        }),
      ]),
    ),
    fn3 = (arg11, arg12, arg13 = value5) => {
      const value9 = new arg7.Mesh(arg11, value6[arg12]);
      return ((value9.castShadow = true), (value9.receiveShadow = true), arg13.add(value9), value9);
    },
    fn4 = (arg14, arg15, arg16, arg17, arg18, arg19, arg20, arg21 = value5, arg22 = 0.012) => {
      const value10 = fn3(
        new RoundedBoxGeometry(
          arg14,
          arg15,
          arg16,
          2,
          Math.min(arg22, arg14 / 3, arg15 / 3, arg16 / 3),
        ),
        arg20,
        arg21,
      );
      return (value10.position.set(arg17, arg18, arg19), value10);
    },
    fn5 = (arg23, arg24, arg25, arg26, arg27 = value5) => {
      const value11 = new arg7.Vector3(...arg23),
        value12 = new arg7.Vector3(...arg24),
        value13 = fn3(
          new arg7.CylinderGeometry(arg25, arg25, value11.distanceTo(value12), 10),
          arg26,
          arg27,
        );
      return (
        value13.position.copy(value11).add(value12).multiplyScalar(0.5),
        value13.quaternion.setFromUnitVectors(
          new arg7.Vector3(0, 1, 0),
          value12.sub(value11).normalize(),
        ),
        value13
      );
    },
    value7 = 0,
    value8 = new arg7.Group();
  ((value8.name = "moving-rack"), value5.add(value8));
  for (const value14 of [-0.26, 0.26]) {
    fn5([-1.02, 0, value14], [1.02, 0, value14], 0.02, "soft", value8);
    for (const value15 of [-1, 1])
      (fn5([value15 * 0.95, 0, value14], [value15 * 1.1, 0, value14], 0.014, "body", value8),
        fn4(0.04, 0.048, 0.048, value15 * 1.1, 0, value14, "trim", value8, 0.01));
    for (let value16 = 0; value16 < 13; value16++)
      fn3(new arg7.TorusGeometry(0.016, 0.004, 6, 12), "body", value8).position.set(
        (value16 - 6) * 0.142,
        -0.023,
        value14,
      );
  }
  for (const value17 of [-0.68, 0.68])
    (fn4(0.056, 0.04, 0.55, value17, 0.012, 0, "trim", value8, 0.012),
      fn4(0.074, 0.055, 0.13, value17, 0.02, 0, "body", value8));
  for (const value18 of [-0.96, 0.96])
    fn5([value18, 0, -0.26], [value18, 0, 0.26], 0.01, "body", value8);
  const list1 = [];
  for (const value19 of [-1, 1]) {
    const value20 = value19 * 0.68,
      list2 = [],
      list3 = [];
    for (let value21 = 0; value21 < value4; value21++)
      for (let value22 = 0; value22 < 2; value22++) {
        const value23 = fn4(0.016, 1, 0.024, 0, 0, 0, value22 ? "body" : "dark");
        list2.push(value23);
      }
    for (let value24 = 0; value24 < value4 * 3 + 2; value24++) {
      const value25 = fn3(new arg7.CylinderGeometry(0.019, 0.019, 0.032, 12), "trim");
      ((value25.rotation.z = Math.PI / 2), list3.push(value25));
    }
    (list1.push({
      x: value20,
      arms: list2,
      pins: list3,
    }),
      (fn4(0.065, 0.018, 0.3, value20, value7, 0, "body").name =
        value19 < 0 ? "mount-left" : "mount-right"));
  }
  function fn6(arg28) {
    const value26 = arg7.MathUtils.clamp(arg28, 0, 100) / 100,
      value27 = 0.22 + (1 - value26) * (value3.airerExtension - 0.22),
      value28 = value27 / value4,
      value29 = Math.hypot(value3.airerExtension / value4, 0.12),
      value30 = Math.sqrt(Math.max(0, value29 * value29 - value28 * value28));
    value8.position.y = value7 - value27;
    for (const { x: value31, arms: value32, pins: value33 } of list1) {
      let value34 = 0,
        value35 = 0;
      for (let value36 = 0; value36 < value4; value36++) {
        const value37 = value7 - value36 * value28;
        for (const value38 of [-1, 1]) {
          const value39 = new arg7.Vector3(
              value31 + (value38 > 0 ? 0.011 : -0.011),
              value37,
              (value38 * value30) / 2,
            ),
            value40 = new arg7.Vector3(value39.x, value37 - value28, (-value38 * value30) / 2),
            value41 = value32[value34++];
          (value41.position.copy(value39).add(value40).multiplyScalar(0.5),
            (value41.scale.y = value29),
            value41.quaternion.setFromUnitVectors(
              new arg7.Vector3(0, 1, 0),
              value40.sub(value39).normalize(),
            ));
        }
        value33[value35++].position.set(value31, value37 - value28 / 2, 0);
      }
      for (let value42 = 0; value42 <= value4; value42++)
        for (const value43 of [-1, 1])
          value33[value35++].position.set(
            value31,
            value7 - value42 * value28,
            (value43 * value30) / 2,
          );
    }
  }
  return (
    value5.scale.set(value3.width / 2.24, 1, value3.depth / 0.57),
    fn6(value3.airerPreview),
    (value5.userData.airerRig = {
      preview: value3.airerPreview,
      pose: fn6,
      setLight: () => {},
    }),
    value5
  );
}
