export function addSecurityModel(arg1, arg2, arg3, arg4) {
  const { width: value1, depth: value2, height: value3 } = arg3,
    object1 = {
      shell: new arg1.MeshStandardMaterial({
        color: arg4.applianceSoft ?? arg4.furnitureLight,
        roughness: 0.5,
      }),
      trim: new arg1.MeshStandardMaterial({
        color: arg4.appliance ?? arg4.furniture,
        roughness: 0.42,
      }),
      dark: new arg1.MeshStandardMaterial({
        color: arg4.applianceDark ?? arg4.furnitureDark,
        roughness: 0.23,
        metalness: 0.12,
      }),
      lens: new arg1.MeshStandardMaterial({
        color: arg4.furnitureDark,
        roughness: 0.12,
        metalness: 0.3,
      }),
    },
    fn1 = (arg5, arg6, arg7, arg8, arg9, arg10) => {
      const value4 = new arg1.Mesh(arg5, object1[arg6]);
      return (
        value4.position.set(arg7, arg8, arg9),
        arg10 && value4.scale.set(...arg10),
        (value4.castShadow = true),
        (value4.receiveShadow = true),
        arg2.add(value4),
        value4
      );
    },
    fn2 = (arg11, arg12, arg13, arg14, arg15 = "shell") =>
      fn1(new arg1.CylinderGeometry(arg11, arg12, arg13, 24), arg15, 0, arg14, 0),
    fn3 = (arg16, arg17, arg18, arg19, arg20, arg21, arg22) =>
      fn1(new arg1.SphereGeometry(1, 24, 16), arg16, arg17, arg18, arg19, [arg20, arg21, arg22]);
  if (arg3.type === "camera") {
    (fn2(value1 * 0.35, value1 * 0.36, value3 * 0.075, value3 * 0.0375, "trim"),
      fn2(value1 * 0.27, value1 * 0.4, value3 * 0.35, value3 * 0.245),
      fn3("shell", 0, value3 * 0.71, 0, value1 * 0.49, value3 * 0.29, value2 * 0.48),
      fn3("dark", 0, value3 * 0.71, value2 * 0.34, value1 * 0.385, value3 * 0.215, value2 * 0.16));
    for (const value6 of [-value1 * 0.145, value1 * 0.145]) {
      const value7 = fn1(
        new arg1.CylinderGeometry(value1 * 0.115, value1 * 0.115, value2 * 0.065, 20),
        "trim",
        value6,
        value3 * 0.71,
        value2 * 0.485,
      );
      value7.rotation.x = Math.PI / 2;
      const value8 = fn1(
        new arg1.CylinderGeometry(value1 * 0.078, value1 * 0.078, value2 * 0.018, 20),
        "lens",
        value6,
        value3 * 0.71,
        value2 * 0.525,
      );
      ((value8.rotation.x = Math.PI / 2),
        fn3(
          "trim",
          value6 - value1 * 0.018,
          value3 * 0.733,
          value2 * 0.538,
          value1 * 0.018,
          value3 * 0.01,
          value2 * 0.006,
        ));
    }
    const value5 = fn1(
      new arg1.TorusGeometry(value1 * 0.043, value1 * 0.006, 4, 20),
      "trim",
      0,
      value3 * 0.3,
      value2 * 0.355,
    );
    value5.rotation.x = 0.1;
  } else {
    (fn2(value1 * 0.09, value1 * 0.49, value3 * 0.31, value3 * 0.155),
      fn2(value1 * 0.065, value1 * 0.065, value3 * 0.18, value3 * 0.38, "trim"),
      fn2(value1 * 0.44, value1 * 0.44, value3 * 0.43, value3 * 0.755),
      fn2(value1 * 0.45, value1 * 0.45, value3 * 0.035, value3 * 0.9825, "trim"),
      fn2(value1 * 0.45, value1 * 0.45, value3 * 0.04, value3 * 0.52, "trim"));
    const value9 = fn1(
      new arg1.CylinderGeometry(
        value1 * 0.446,
        value1 * 0.446,
        value3 * 0.31,
        16,
        1,
        true,
        -Math.PI * 0.36,
        Math.PI * 0.72,
      ),
      "trim",
      0,
      value3 * 0.755,
      0,
    );
    value9.scale.z = value2 / value1;
  }
  if (arg3.type === "presence") {
    for (const value10 of arg2.children)
      (value10.geometry?.type !== "CylinderGeometry" || !value10.geometry.parameters.openEnded) &&
        (value10.scale.z = value2 / value1);
  }
  const set1 = new Set(arg2.children.map((arg23) => arg23.material));
  for (const value11 of Object.values(object1)) set1.has(value11) || value11.dispose();
  return arg2;
}
