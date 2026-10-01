const D = new WeakMap();
function I(arg1) {
  let value1 = D.get(arg1);
  return (
    value1 ||
      ((value1 = {
        weave: null,
        grilles: new Map(),
      }),
      D.set(arg1, value1)),
    value1
  );
}
function Y(arg2) {
  const value2 = I(arg2);
  if (value2.weave) return value2.weave;
  const value3 = arg2.createElement("canvas");
  ((value3.width = 512), (value3.height = 512));
  const value4 = value3.getContext("2d"),
    value5 = value4.createImageData(512, 512);
  for (let value6 = 0; value6 < 512; value6++)
    for (let value7 = 0; value7 < 512; value7++) {
      const value8 = (value7 / 512) * Math.PI * 2 * 64,
        value9 = (value6 / 512) * Math.PI * 2 * 64,
        value10 = Math.round(
          128 + 55 * Math.sin(value8) * Math.sin(value9) + 20 * Math.cos(value8 * 2 + value9),
        ),
        value11 = (value6 * 512 + value7) * 4;
      ((value5.data[value11] = value5.data[value11 + 1] = value5.data[value11 + 2] = value10),
        (value5.data[value11 + 3] = 255));
    }
  return (value4.putImageData(value5, 0, 0), (value2.weave = value3), value3);
}
function z(arg3, arg4, arg5) {
  const value12 = I(arg3),
    value13 = arg4 + "|" + arg5;
  if (value12.grilles.has(value13)) return value12.grilles.get(value13);
  const value14 = arg3.createElement("canvas");
  ((value14.width = 2048), (value14.height = 1024));
  const value15 = value14.getContext("2d"),
    fn1 = (arg6) => "#" + arg6.toString(16).padStart(6, "0");
  ((value15.fillStyle = fn1(arg4)),
    value15.fillRect(0, 0, 2048, 1024),
    (value15.fillStyle = fn1(arg5)));
  for (let value16 = 0; value16 < 48; value16++)
    for (let value17 = 0; value17 < 128; value17++) {
      const value18 = 0.042 + value16 * 0.00345;
      (value15.beginPath(),
        value15.ellipse(
          (value17 + (value16 % 2) * 0.5) * 16,
          1024 * (1 - value18 / 0.227),
          2.2,
          2.5,
          0,
          0,
          Math.PI * 2,
        ),
        value15.fill());
    }
  return (
    value12.grilles.size >= 2 && value12.grilles.delete(value12.grilles.keys().next().value),
    value12.grilles.set(value13, value14),
    value14
  );
}
export function createSpeakerModel(arg7, arg8, arg9) {
  const value19 = !!arg9.warmWood,
    value20 = Y(document),
    value21 = new arg7.CanvasTexture(value20);
  ((value21.wrapS = value21.wrapT = arg7.RepeatWrapping), value21.repeat.set(1, 1));
  const fn2 = (arg10, arg11 = 0.65, arg12 = 0) =>
      new arg7.MeshStandardMaterial({
        color: arg10,
        roughness: arg11,
        metalness: arg12,
      }),
    value22 = fn2(value19 ? arg9.furnitureLight : arg9.appliance, 0.92);
  ((value22.bumpMap = value21), (value22.bumpScale = 0.00022), (value21.anisotropy = 4));
  const value23 = fn2(value19 ? arg9.wood : arg9.applianceDark, 0.52, 0.08),
    value24 = fn2(value19 ? arg9.appliance : arg9.applianceDark, 0.53, 0.05),
    value25 = fn2(arg9.applianceDark, 0.8),
    value26 = fn2(value19 ? arg9.woodDark : arg9.applianceSoft, 0.5),
    value27 = new arg7.Group();
  function fn3(arg13, arg14, arg15 = 0, arg16 = 0, arg17 = 0) {
    const value36 = new arg7.Mesh(arg13, arg14);
    return (
      value36.position.set(arg15, arg16, arg17),
      (value36.castShadow = true),
      (value36.receiveShadow = false),
      value27.add(value36),
      value36
    );
  }
  function fn4(arg18, arg19) {
    return fn3(
      new arg7.LatheGeometry(
        arg18.map(([arg20, arg21]) => new arg7.Vector2(arg20, arg21)),
        96,
      ),
      arg19,
    );
  }
  function fn5(arg22, arg23, arg24, arg25) {
    return fn3(new arg7.CylinderGeometry(arg22, arg22, arg23, 96), arg25, 0, arg24);
  }
  (fn5(0.069, 0.006, 0.004, value25),
    fn4(
      [
        [0, 0.006],
        [0.069, 0.006],
        [0.076, 0.008],
        [0.081, 0.012],
        [0.083, 0.018],
        [0.083, 0.025],
        [0.081, 0.03],
        [0, 0.03],
      ],
      value23,
    ),
    fn4(
      [
        [0, 0.024],
        [0.077, 0.024],
        [0.081, 0.028],
        [0.0835, 0.036],
        [0.085, 0.05],
        [0.085, 0.182],
        [0.084, 0.202],
        [0.08, 0.215],
        [0.075, 0.224],
        [0.071, 0.227],
        [0.0698, 0.227],
        [0.0698, 0.223],
      ],
      value22,
    ));
  const value28 = z(
      document,
      value19 ? arg9.furnitureLight : arg9.appliance,
      value19 ? arg9.solidDoorFrame : arg9.applianceDark,
    ),
    value29 = new arg7.CanvasTexture(value28);
  ((value29.colorSpace = arg7.SRGBColorSpace), (value29.anisotropy = 4));
  const value30 = value27.children[value27.children.length - 1],
    value31 = value30.geometry.attributes.position,
    value32 = value30.geometry.attributes.uv;
  for (let value37 = 0; value37 < value32.count; value37++)
    value32.setY(value37, value31.getY(value37) / 0.227);
  ((value32.needsUpdate = true),
    (value22.map = value29),
    value22.color.setRGB(1, 1, 1),
    fn5(0.0715, 0.002, 0.2278, value25));
  function fn6(arg26) {
    const value38 = new arg7.TorusGeometry(0.0709, arg26, 12, 160),
      value39 = value38.attributes.position,
      list1 = [],
      value40 = new arg7.Color();
    for (let value41 = 0; value41 < value39.count; value41++) {
      const value42 =
        (Math.atan2(value39.getY(value41), value39.getX(value41)) / (Math.PI * 2) + 1) % 1;
      (value40.setHSL(value42, 0.95, 0.48), list1.push(value40.r, value40.g, value40.b));
    }
    return (value38.setAttribute("color", new arg7.Float32BufferAttribute(list1, 3)), value38);
  }
  const value33 = new arg7.MeshBasicMaterial({
      color: 16777215,
      vertexColors: true,
      toneMapped: false,
    }),
    value34 = fn3(fn6(0.0016), value33, 0, 0.232, 0);
  ((value34.rotation.x = Math.PI / 2), (value34.castShadow = false));
  const value35 = [0.0025, 0.004, 0.006].map((arg27, arg28) => {
    const value43 = new arg7.MeshBasicMaterial({
        color: 16777215,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: arg7.AdditiveBlending,
        toneMapped: false,
      }),
      value44 = fn3(fn6(arg27), value43, 0, 0.232, 0);
    return (
      (value44.rotation.x = Math.PI / 2),
      (value44.castShadow = false),
      (value44.renderOrder = 2 + arg28),
      {
        mesh: value44,
        material: value43,
        peak: [0.3, 0.14, 0.06][arg28],
      }
    );
  });
  fn4(
    [
      [0, 0.229],
      [0.066, 0.229],
      [0.069, 0.23],
      [0.069, 0.231],
      [0.0675, 0.232],
      [0, 0.232],
    ],
    value24,
  );
  const fn7 = (arg29, arg30, arg31, arg32) => {
    const value45 = fn3(new arg7.BoxGeometry(arg29, 0.0006, arg30), value26, arg31, 0.2324, arg32);
    return ((value45.castShadow = false), value45);
  };
  (fn7(0.01, 0.0015, -0.034, 0),
    fn7(0.0015, 0.00425, -0.034, -0.002875),
    fn7(0.0015, 0.00425, -0.034, 0.002875),
    fn7(0.01, 0.0015, 0.034, 0),
    fn7(0.0017, 0.009, -0.0024, 0),
    fn7(0.0017, 0.009, 0.0024, 0));
  for (const value46 of [-0.029, 0.029])
    for (const value47 of [-0.037, 0.037]) {
      const value48 = fn5(0.0011, 0.0005, 0.2324, value25);
      (value48.position.set(value46, 0.2324, value47), (value48.castShadow = false));
    }
  (fn3(new arg7.BoxGeometry(0.013, 0.004, 0.0018), value25, 0, 0.017, -0.083),
    fn3(new arg7.BoxGeometry(0.009, 0.0013, 0.0019), value26, 0, 0.017, -0.084),
    (value34.userData.speakerRing = true),
    (value34.visible = false));
  for (const value49 of value35)
    ((value49.mesh.userData.speakerHalo = value49.peak), (value49.mesh.visible = false));
  return (value27.scale.set(arg8.width / 0.17, arg8.height / 0.2336, arg8.depth / 0.17), value27);
}
