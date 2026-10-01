export const DESIGNS = {
  traveler: {
    name: "软帽小旅人",
    en: "THE SOFT-HAT TRAVELER",
    description: "偏向一侧的软帽，圆润短外套。\n小步轻走，停下来会看看周围。",
    height: 1.35,
    pace: 1,
  },
  bean: {
    name: "豆豆小人",
    en: "THE LITTLE BEAN",
    description: "大圆头、豆子身体与迷你小帽。\n短腿交替迈步，带一点俏皮摇摆。",
    height: 1.33,
    pace: 0.78,
  },
  glow: {
    name: "小灯灵",
    en: "THE LITTLE GLOW",
    description: "实心灯罩、温暖微光与小披肩。\n细腿慢走，光线像呼吸一样起伏。",
    height: 1.45,
    pace: 0.82,
  },
};
export function createWalker(arg1, arg2 = 5421233, arg3 = "traveler") {
  DESIGNS[arg3] || (arg3 = "traveler");
  const value1 = new arg1.Group();
  value1.name = "HB-" + arg3;
  const value2 = new arg1.MeshStandardMaterial({
      color: arg2,
      roughness: 0.9,
    }),
    value3 = new arg1.MeshStandardMaterial({
      color: 16774886,
      roughness: 0.9,
    }),
    value4 = new arg1.MeshStandardMaterial({
      color: 3425857,
      roughness: 1,
    });
  function fn1(arg4, arg5, arg6, arg7 = value1) {
    const value7 = new arg1.Mesh(arg4, arg5);
    return (
      value7.position.set(...arg6),
      (value7.castShadow = true),
      (value7.receiveShadow = false),
      arg7.add(value7),
      value7
    );
  }
  function fn2(arg8, arg9, arg10, arg11 = value1) {
    const value8 = fn1(new arg1.SphereGeometry(1, 32, 20), arg10, arg9, arg11);
    return (value8.scale.set(...arg8), value8);
  }
  function fn3(arg12, arg13, arg14 = value1) {
    return fn1(
      new arg1.LatheGeometry(
        arg12.map(([arg15, arg16]) => new arg1.Vector2(arg15, arg16)),
        36,
      ),
      arg13,
      [0, 0, 0],
      arg14,
    );
  }
  const value5 = new arg1.Group();
  value1.add(value5);
  const value6 = new arg1.Group();
  value5.add(value6);
  const list1 = [],
    list2 = [],
    object1 = {
      body: value5,
      headRig: value6,
      arms: list1,
      legs: list2,
    };
  function fn4(arg17, arg18, arg19 = 0.055, arg20 = 0.012, arg21 = value6) {
    for (const value9 of [-1, 1])
      fn2([arg20, arg20 * 1.3, 0.01], [value9 * arg19, arg17, arg18], value4, arg21);
  }
  function fn5(arg22, arg23, arg24, arg25) {
    for (const value10 of [-1, 1]) {
      const value11 = new arg1.Group();
      (value11.position.set(value10 * arg23, arg22, 0),
        value5.add(value11),
        fn2([arg25, arg24 / 2, arg25], [value10 * 0.012, -arg24 / 2, 0], value2, value11),
        fn2(
          [arg25 * 0.57, arg25 * 0.66, arg25 * 0.58],
          [value10 * 0.012, -arg24, 0],
          value3,
          value11,
        ),
        (value11.rotation.z = value10 * 0.12),
        list1.push(value11));
    }
  }
  function fn6(arg26, arg27, arg28, arg29, arg30, arg31) {
    for (const value12 of [-1, 1]) {
      const value13 = new arg1.Group();
      (value13.position.set(value12 * arg27, arg26, 0),
        value1.add(value13),
        fn1(
          new arg1.CylinderGeometry(arg29, arg29 * 0.94, arg28, 12),
          value3,
          [0, -arg28 / 2, 0],
          value13,
        ));
      const value14 = new arg1.Group();
      ((value14.position.y = -arg28),
        value13.add(value14),
        fn1(
          new arg1.CylinderGeometry(arg29 * 0.94, arg29 * 0.85, arg28, 12),
          value3,
          [0, -arg28 / 2, 0],
          value14,
        ));
      const value15 = fn2([arg29 * 1.6, arg31, arg30], [0, -arg28, 0.025], value4, value14);
      list2.push({
        hip: value13,
        knee: value14,
        foot: value15,
      });
    }
    value1.userData.soleHeight = arg31;
  }
  if (arg3 === "traveler") {
    ((object1.robe = fn3(
      [
        [0, 0.36],
        [0.16, 0.36],
        [0.209, 0.38],
        [0.225, 0.43],
        [0.224, 0.56],
        [0.21, 0.71],
        [0.176, 0.83],
        [0.105, 0.877],
        [0, 0.884],
      ],
      value2,
      value5,
    )),
      fn1(new arg1.CylinderGeometry(0.049, 0.052, 0.09, 16), value3, [0, 0.903, 0], value5),
      fn2([0.188, 0.206, 0.177], [0, 1.052, 0.01], value3, value6),
      fn4(1.064, 0.184));
    const value16 = new arg1.LatheGeometry(
        [
          [0, 0],
          [0.177, 0],
          [0.215, 0.019],
          [0.255, 0.072],
          [0.25, 0.104],
          [0.209, 0.153],
          [0.13, 0.19],
          [0, 0.203],
        ].map(([arg32, arg33]) => new arg1.Vector2(arg32, arg33)),
        40,
      ),
      value17 = value16.attributes.position;
    for (let value18 = 0; value18 < value17.count; value18++) {
      const value19 = value17.getY(value18);
      (value17.setX(value18, value17.getX(value18) - (0.088 * value19) / 0.203),
        value17.setY(value18, value19 + 0.022 * value17.getX(value18)));
    }
    (value16.computeVertexNormals(),
      (object1.hat = fn1(value16, value2, [0, 1.152, 0], value6)),
      fn5(0.801, 0.18, 0.205, 0.061),
      fn6(0.404, 0.099, 0.174, 0.029, 0.066, 0.028));
  }
  if (
    (arg3 === "bean" &&
      ((object1.robe = fn2([0.274, 0.298, 0.224], [0, 0.538, 0], value2, value5)),
      fn2([0.281, 0.279, 0.253], [0, 0.998, 0.018], value3, value6),
      fn4(1.006, 0.269, 0.075, 0.016),
      (object1.hat = fn2([0.205, 0.073, 0.188], [-0.052, 1.238, -0.025], value2, value6)),
      fn2([0.026, 0.037, 0.024], [-0.102, 1.308, -0.025], value2, value6),
      fn5(0.646, 0.258, 0.135, 0.051),
      fn6(0.282, 0.125, 0.096, 0.039, 0.083, 0.039)),
    arg3 === "glow")
  ) {
    ((object1.robe = fn3(
      [
        [0, 0.32],
        [0.13, 0.32],
        [0.183, 0.35],
        [0.207, 0.43],
        [0.199, 0.57],
        [0.155, 0.72],
        [0.1, 0.8],
        [0, 0.817],
      ],
      value2,
      value5,
    )),
      fn1(new arg1.CylinderGeometry(0.038, 0.043, 0.1, 16), value4, [0, 0.832, 0], value5));
    const value20 = new arg1.MeshStandardMaterial({
        color: 16770998,
        emissive: 16762222,
        emissiveIntensity: 1,
        roughness: 0.6,
      }),
      value21 = fn2([0.11, 0.143, 0.104], [0, 1.083, 0], value20, value6);
    ((value21.castShadow = false), (value21.visible = false));
    const value22 = new arg1.MeshPhysicalMaterial({
        color: 16774877,
        emissive: 16765588,
        emissiveIntensity: 0.38,
        roughness: 0.72,
        metalness: 0,
      }),
      value23 = fn3(
        [
          [0, 0.858],
          [0.135, 0.858],
          [0.189, 0.88],
          [0.222, 0.946],
          [0.228, 1.15],
          [0.2, 1.29],
          [0.155, 1.33],
          [0, 1.33],
        ],
        value22,
        value6,
      );
    ((value23.castShadow = false),
      (value23.renderOrder = 1),
      (object1.hat = fn2([0.213, 0.036, 0.213], [0, 1.316, 0], value2, value6)));
    const value24 = fn1(new arg1.TorusGeometry(0.04, 0.009, 8, 24), value2, [0, 1.387, 0], value6);
    (fn4(1.103, 0.229, 0.06, 0.012),
      fn5(0.694, 0.172, 0.14, 0.045),
      fn6(0.363, 0.085, 0.145, 0.024, 0.053, 0.026),
      (object1.glowMat = value20),
      (object1.shadeMat = value22));
  }
  return (
    (value1.userData.parts = object1),
    (value1.userData.outfitMaterial = value2),
    (value1.userData.design = arg3),
    value1
  );
}
export function setWalkerColor(arg34, arg35) {
  arg34.userData.outfitMaterial.color.set(arg35);
}
export function animateWalker(arg36, arg37, arg38, arg39) {
  const { body: value25, legs: value26, arms: value27, headRig: value28 } = arg36.userData.parts,
    value29 = arg36.userData.design === "bean";
  ((value25.position.y =
    Math.abs(Math.sin(arg37)) * (value29 ? 0.026 : 0.012) * arg38 +
    Math.sin(arg39 * 1.65) * 0.003 * (1 - arg38)),
    (value25.rotation.z = Math.sin(arg37) * (value29 ? 0.055 : 0.018) * arg38),
    (value25.rotation.x = 0.015 * arg38),
    (value28.rotation.y = Math.sin(arg39 * 0.65) * 0.14 * (1 - arg38)));
  for (let value30 = 0; value30 < value26.length; value30++) {
    const value31 = arg37 + value30 * Math.PI;
    ((value26[value30].hip.rotation.x = Math.sin(value31) * (value29 ? 0.4 : 0.3) * arg38),
      (value26[value30].knee.rotation.x = -Math.max(0, Math.cos(value31)) * 0.24 * arg38));
  }
  for (let value32 = 0; value32 < value27.length; value32++)
    value27[value32].rotation.x = -Math.sin(arg37 + value32 * Math.PI) * 0.14 * arg38;
  arg36.userData.parts.glowMat &&
    ((arg36.userData.parts.glowMat.emissiveIntensity = 0.9 + Math.sin(arg39 * 1.7) * 0.13),
    (arg36.userData.parts.shadeMat.emissiveIntensity = 0.38 + Math.sin(arg39 * 1.7) * 0.045));
}
export function disposeWalker(arg40) {
  const set1 = new Set(),
    set2 = new Set();
  (arg40.traverse((arg41) => {
    if (arg41.isMesh) {
      set1.add(arg41.geometry);
      for (const value33 of Array.isArray(arg41.material) ? arg41.material : [arg41.material])
        set2.add(value33);
    }
  }),
    set1.forEach((arg42) => arg42.dispose()),
    set2.forEach((arg43) => arg43.dispose()),
    arg40.removeFromParent());
}
