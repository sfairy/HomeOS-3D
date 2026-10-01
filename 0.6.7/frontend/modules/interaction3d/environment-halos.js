export function outlineHull(arg1) {
  const value1 = arg1.slice().sort((arg2, arg3) => arg2[0] - arg3[0] || arg2[1] - arg3[1]),
    fn1 = (arg4, arg5, arg6) =>
      (arg5[0] - arg4[0]) * (arg6[1] - arg4[1]) - (arg5[1] - arg4[1]) * (arg6[0] - arg4[0]),
    fn2 = (arg7) => {
      const list1 = [];
      for (const value2 of arg7) {
        for (; list1.length > 1 && fn1(list1.at(-2), list1.at(-1), value2) <= 0;) list1.pop();
        list1.push(value2);
      }
      return list1;
    };
  return [...fn2(value1).slice(0, -1), ...fn2(value1.reverse()).slice(0, -1)];
}
export function createScreenOutlines({
  THREE: arg8,
  container: arg9,
  camera: arg10,
  getCamera: arg11,
  getObjectCamera: arg12,
  color: arg13 = "#d5dedb",
  pulse: arg14 = true,
  editorSelection: arg15 = false,
}) {
  const value3 = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    value4 = document.createElementNS("http://www.w3.org/2000/svg", "path"),
    value5 = document.createElementNS("http://www.w3.org/2000/svg", "path"),
    value6 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  (value3.setAttribute("class", "i3d-model-outlines"), value3.setAttribute("aria-hidden", "true"));
  for (const [value15, value16, value17] of [
    [value5, 10, 0.14],
    [value6, 6, 0.22],
    [value4, 2.6, 0.48],
  ])
    (value15.setAttribute("fill", "none"),
      value15.setAttribute("stroke", arg13),
      value15.setAttribute("stroke-width", String(value16)),
      value15.setAttribute("stroke-opacity", String(value17)),
      value15.setAttribute("stroke-linejoin", "round"),
      value15.setAttribute("stroke-linecap", "round"));
  ((value5.style.filter = "blur(2px)"),
    (value6.style.filter = "blur(.8px)"),
    value3.append(value5),
    value3.append(value6),
    value3.append(value4),
    arg9.append(value3));
  let value7,
    value8,
    text1 = "",
    list2 = [],
    value9 = false,
    value10 = true,
    value11 = false,
    text2 = "",
    value12 = 0,
    text3 = "",
    weakMap1 = new WeakMap();
  const value13 =
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true || !arg14
      ? []
      : [value5, value6, value4]
          .map((arg16) =>
            arg16.animate?.(
              [
                {
                  opacity: 1,
                },
                {
                  opacity: 0.3,
                },
                {
                  opacity: 1,
                },
              ],
              {
                duration: 2200,
                iterations: Infinity,
                easing: "ease-in-out",
              },
            ),
          )
          .filter(Boolean);
  let value14 = false;
  value13.forEach((arg17) => arg17.pause());
  function fn3(arg18) {
    if (value14 !== arg18) {
      value14 = arg18;
      for (const value18 of value13)
        arg18 ? ((value18.currentTime = 0), value18.play()) : value18.pause();
    }
  }
  const fn4 = (arg19) => JSON.stringify([arg19.floorId, arg19.modelId]),
    list3 = [];
  for (const value19 of [-1, 0, 1])
    for (const value20 of [-1, 0, 1])
      for (const value21 of [-1, 0, 1])
        (value19 || value20 || value21) && list3.push(new arg8.Vector3(value19, value20, value21));
  function fn5(arg20) {
    const value22 = list3.map(() => ({
        score: -Infinity,
        point: null,
      })),
      value23 = new arg8.Vector3();
    function fn11(arg21, arg22) {
      if (
        arg21.userData?.environmentEffect ||
        arg21 === arg20.userData?.vacuumMobileRoot ||
        (arg21 !== arg20 && arg21.visible === false) ||
        (arg21 !== arg20 && arg21.userData?.fanPart === "yaw") ||
        (arg21 !== arg20 && arg21.userData?.environmentModelId != null)
      )
        return;
      const value24 = arg21.isMesh && arg21.geometry?.attributes?.position;
      if (value24) {
        for (let value25 = 0; value25 < value24.count; value25++)
          (value23.fromBufferAttribute(value24, value25).applyMatrix4(arg22),
            list3.forEach((arg23, arg24) => {
              const value26 = value23.dot(arg23);
              value26 > value22[arg24].score &&
                (value22[arg24] = {
                  score: value26,
                  point: value23.clone(),
                });
            }));
      }
      for (const value27 of arg21.children || [])
        (value27.matrixAutoUpdate && value27.updateMatrix(),
          fn11(value27, new arg8.Matrix4().multiplyMatrices(arg22, value27.matrix)));
    }
    return (
      fn11(arg20, new arg8.Matrix4()),
      value22.filter((arg25) => arg25.point).map((arg26) => arg26.point)
    );
  }
  function fn6(arg27, arg28, arg29, arg30) {
    if (value11) return;
    value9 = arg30;
    const value28 = arg30 && value10 && performance.now() >= value12;
    ((value3.style.opacity = value28 ? "1" : "0"), fn3(value28));
    const value29 = JSON.stringify(arg29.map(fn4));
    if (value7 === arg27 && value8 === arg28 && text1 === value29) return;
    ((value7 !== arg27 || value8 !== arg28) && (weakMap1 = new WeakMap()),
      (value7 = arg27),
      (value8 = arg28),
      (text1 = value29),
      (text2 = ""));
    const map1 = new Map();
    (value7?.traverse((arg31) => {
      if (arg15) {
        const value31 = arg31.userData?.editorModelId ?? arg31.userData?.environmentModelId,
          value32 = arg31.userData?.editorFloorId ?? arg31.userData?.environmentFloorId;
        value31 != null &&
          map1.set(
            fn4({
              floorId: value32,
              modelId: value31,
            }),
            arg31,
          );
        return;
      }
      if (
        ![
          "door",
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "speaker",
          "tv",
          "robotvacuum",
          "camera",
          "presence",
        ].includes(arg31.userData?.environmentModelType)
      )
        return;
      let value30 = arg31.userData.environmentFloorId;
      for (let value33 = arg31.parent; value30 == null && value33; value33 = value33.parent)
        value30 = value33.userData.environmentFloorId;
      map1.set(
        fn4({
          floorId: value30,
          modelId: arg31.userData.environmentModelId,
        }),
        arg31,
      );
    }),
      (list2 = arg29.flatMap((arg32) => {
        const value34 = map1.get(fn4(arg32));
        return value34 ? [value34] : [];
      })));
  }
  function fn7(arg33) {
    if (arg33.userData.environmentModelType === "fan") {
      const list4 = [];
      return (
        arg33.traverse((arg34) => {
          arg34.userData?.fanPart === "yaw" && list4.push(arg34);
        }),
        [arg33, ...list4]
      );
    }
    if (arg33.userData.environmentModelType === "curtain") {
      const list5 = [];
      if (
        (arg33.traverse((arg35) => {
          arg35.userData?.curtainMotionPanel && list5.push(arg35);
        }),
        list5.length)
      )
        return list5;
    }
    return arg33.userData.vacuumMobileRoot ? [arg33, arg33.userData.vacuumMobileRoot] : [arg33];
  }
  function fn8(arg36) {
    const value35 = arg36.geometry,
      value36 = arg36.userData?.vacuumMobileRoot,
      value37 = arg36.userData?.environmentOutlineRevision;
    if (arg15 && arg36.userData?.environmentModelType === "door") return fn5(arg36);
    const value38 = weakMap1.get(arg36);
    if (
      value38 &&
      value38.geometry === value35 &&
      value38.mobile === value36 &&
      value38.pose === value37
    )
      return value38.points;
    const value39 = fn5(arg36);
    return (
      weakMap1.set(arg36, {
        geometry: value35,
        mobile: value36,
        pose: value37,
        points: value39,
      }),
      value39
    );
  }
  function fn9() {
    if (value11 || !value9 || !value10 || performance.now() < value12) return;
    ((value3.style.transition = "opacity .18s linear"), (value3.style.opacity = "1"), fn3(true));
    const value40 = arg11?.() || arg10;
    value40.updateMatrixWorld();
    const value41 = arg9.clientWidth,
      value42 = arg9.clientHeight,
      value43 = list2
        .filter((arg37) => arg15 || !arg37.userData?.environmentOutlineMoving)
        .flatMap(fn7)
        .filter((arg38) => {
          for (let value47 = arg38; value47; value47 = value47.parent)
            if (value47.visible === false) return false;
          return true;
        })
        .map((arg39) => ({
          model: arg39,
          points: fn8(arg39),
        }));
    for (const value48 of value43)
      (value48.model.updateWorldMatrix(true, false),
        (value48.camera = arg12?.(value48.model) || value40));
    const value44 =
      value41 +
      ":" +
      value42 +
      ":" +
      value40.matrixWorld.elements +
      ":" +
      value40.projectionMatrix.elements +
      ":" +
      value43
        .map(
          (arg40) =>
            (arg15 && arg40.model.userData?.environmentModelType === "door"
              ? arg40.points.map((arg41) => arg41.toArray()).join(",")
              : "") +
            ":" +
            (arg40.model.userData?.environmentOutlineRevision ?? "") +
            ":" +
            arg40.model.uuid +
            ":" +
            (arg40.model.geometry?.uuid || "") +
            ":" +
            arg40.model.matrixWorld.elements +
            ":" +
            arg40.camera.projectionMatrix.elements,
        )
        .join("|");
    if (value44 === text2) return;
    ((text2 = value44), value3.setAttribute("viewBox", "0 0 " + value41 + " " + value42));
    const value45 = new arg8.Vector3(),
      value46 = value43
        .map((arg42) => {
          const value49 = arg42.points.map(
            (arg43) => (
              value45.copy(arg43).applyMatrix4(arg42.model.matrixWorld).project(arg42.camera),
              [((value45.x + 1) * value41) / 2, ((1 - value45.y) * value42) / 2, value45.z]
            ),
          );
          if (value49.some((arg44) => arg44[2] < -1 || arg44[2] > 1)) return "";
          const value50 = outlineHull(value49);
          return value50.length > 2
            ? "M" +
                value50.map((arg45) => arg45[0].toFixed(1) + "," + arg45[1].toFixed(1)).join("L") +
                "Z"
            : "";
        })
        .join("");
    for (const value51 of [value5, value6, value4]) value51.setAttribute("d", value46);
  }
  function fn10() {
    arg15 ||
      (fn3(false),
      (value12 = performance.now() + 120),
      (value3.style.transition = "none"),
      (value3.style.opacity = "0"));
  }
  return {
    sync: fn6,
    update: fn9,
    pause: fn10,
    setAvailable(arg46) {
      value11 ||
        value10 === !!arg46 ||
        ((value10 = !!arg46), fn3(false), (value3.style.opacity = "0"), value10 && (text2 = ""));
    },
    cameraChanged() {
      if (value11 || !value9 || !value10) return false;
      const value52 = arg11?.() || arg10,
        value53 = value52.matrixWorld.elements + ":" + value52.projectionMatrix.elements;
      return value53 === text3 ? false : ((text3 = value53), fn10(), true);
    },
    nextDelay() {
      return !value11 && value10 && value9 && performance.now() < value12
        ? Math.max(1, value12 - performance.now())
        : Infinity;
    },
    dispose() {
      ((value11 = true),
        (value9 = false),
        value13.forEach((arg47) => arg47.cancel()),
        value3.remove(),
        (list2 = []));
    },
  };
}
export function createEnvironmentHalos({ THREE: arg48, modeAmount: arg49 }) {
  const map2 = new Map();
  let value54,
    value55,
    value56,
    value57 = false;
  const fn12 = (arg50, arg51) => JSON.stringify([String(arg50 ?? ""), String(arg51 ?? "")]),
    value58 = new arg48.PlaneGeometry(1, 1);
  function fn13(arg52) {
    const value59 = new arg48.Box3();
    function fn21(arg53, arg54) {
      if (
        !(arg53.userData?.environmentEffect || arg53.userData?.curtainMotionRig) &&
        !(arg53 !== arg52 && arg53.userData?.environmentModelId != null)
      ) {
        arg53.isMesh &&
          arg53.geometry?.attributes?.position &&
          (arg53.geometry.boundingBox || arg53.geometry.computeBoundingBox(),
          value59.union(arg53.geometry.boundingBox.clone().applyMatrix4(arg54)));
        for (const value60 of arg53.children || [])
          (value60.matrixAutoUpdate && value60.updateMatrix(),
            fn21(value60, new arg48.Matrix4().multiplyMatrices(arg54, value60.matrix)));
      }
    }
    return (fn21(arg52, new arg48.Matrix4()), value59.isEmpty() ? null : value59);
  }
  function fn14(arg55) {
    (arg55.mesh.removeFromParent(), arg55.mesh.material.dispose());
  }
  function fn15(arg56, arg57, arg58, arg59) {
    const value61 = JSON.stringify(
      arg57.map((arg60) => [
        arg60.id,
        arg60.floorId,
        arg60.modelId,
        arg60.visible,
        arg60.deviceKind,
      ]),
    );
    if (value54 === arg56 && value55 === arg58 && value56 === value61) return;
    ((value54 = arg56), (value55 = arg58), (value56 = value61));
    const value62 = arg59 || new Map();
    !arg59 &&
      arg57.length &&
      value54?.traverse((arg61) => {
        if (arg61.userData?.environmentModelId == null) return;
        let value63 = arg61.userData.environmentFloorId;
        for (let value64 = arg61.parent; value63 == null && value64; value64 = value64.parent)
          value63 = value64.userData.environmentFloorId;
        value62.set(fn12(value63, arg61.userData.environmentModelId), arg61);
      });
    const set1 = new Set();
    for (const value65 of arg57) {
      if (value65.visible === false) continue;
      const value66 = value62.get(fn12(value65.floorId, value65.modelId));
      if (
        !value66 ||
        ["smallcar", "fan", "airpurifier", "floorac", "airer"].includes(
          value66.userData?.environmentModelType,
        )
      )
        continue;
      const value67 = fn13(value66);
      if (!value67) continue;
      const value68 = value67.getSize(new arg48.Vector3()),
        value69 = value67.getCenter(new arg48.Vector3()),
        value70 = value66.userData.environmentModelType === "airoutlet" && value68.z > value68.x,
        value71 = value70 ? value68.z : value68.x,
        value72 = value68.y;
      if (!(value71 > 0 && value72 > 0)) continue;
      set1.add(value65.id);
      let value73 = map2.get(value65.id);
      if (
        (value73 &&
          value73.model !== value66 &&
          (fn14(value73), map2.delete(value65.id), (value73 = null)),
        !value73)
      ) {
        const value75 = new arg48.ShaderMaterial({
            uniforms: {
              haloMode: arg49,
              haloColor: {
                value: new arg48.Color(0, 0, 0),
              },
              haloSize: {
                value: new arg48.Vector2(),
              },
              haloFeather: {
                value: 0,
              },
              haloRects: {
                value: Array.from(
                  {
                    length: 3,
                  },
                  () => new arg48.Vector4(),
                ),
              },
              haloRectCount: {
                value: 1,
              },
            },
            vertexShader:
              "varying vec2 vHaloUv; void main(){ vHaloUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
            fragmentShader:
              "varying vec2 vHaloUv;\n            uniform float haloMode, haloFeather;\n            uniform vec2 haloSize;\n            uniform vec3 haloColor;\n            uniform vec4 haloRects[3];\n            uniform int haloRectCount;\n            void main() {\n              vec2 p = (vHaloUv - 0.5) * (haloSize + vec2(haloFeather * 2.0));\n              float d = 10000.0;\n              for (int i = 0; i < 3; i++) {\n                if (i >= haloRectCount) break;\n                vec4 rect = haloRects[i];\n                float radius = min(rect.z, rect.w) * 0.18;\n                vec2 q = abs(p - rect.xy) - rect.zw + vec2(radius);\n                d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius);\n              }\n              float outer = 1.0 - smoothstep(0.0, haloFeather, max(d, 0.0));\n              float alpha = outer * outer * haloMode * 0.025;\n              if (alpha < 0.001) discard;\n              gl_FragColor = vec4(haloColor, alpha);\n              #include <colorspace_fragment>\n            }",
            transparent: true,
            blending: arg48.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            side: arg48.DoubleSide,
            forceSinglePass: true,
            toneMapped: false,
          }),
          value76 = new arg48.Mesh(value58, value75);
        ((value76.name = "environment-halo-" + value65.id),
          Object.assign(value76.userData, {
            environmentEffect: true,
            environmentHalo: true,
            externalModelSharedGeometry: true,
            externalModelSharedMaterial: true,
          }),
          (value76.raycast = () => {}),
          (value76.visible = false),
          value66.add(value76),
          (value73 = {
            model: value66,
            mesh: value76,
          }),
          map2.set(value65.id, value73));
      }
      const value74 = Math.max(0.025, Math.min(0.07, Math.min(value71, value72) * 0.15));
      (value73.mesh.material.uniforms.haloSize.value.set(value71, value72),
        (value73.mesh.material.uniforms.haloFeather.value = value74),
        value73.mesh.scale.set(value71 + value74 * 2, value72 + value74 * 2, 1),
        value73.mesh.position.copy(value69),
        (value73.mesh.rotation.y = value70 ? Math.PI / 2 : 0),
        value70
          ? (value73.mesh.position.x = value67.max.x + 0.006)
          : (value73.mesh.position.z = value67.max.z + 0.006),
        value73.mesh.updateMatrix(),
        (value73.center = value69),
        (value73.bounds = value67),
        (value73.width = value71),
        (value73.height = value72),
        (value73.panels = []),
        value66.userData.environmentModelType === "curtain" &&
          value66.traverse((arg62) => {
            arg62.userData.curtainMotionPanel && value73.panels.push(arg62);
          }),
        (value73.pose = null),
        fn16(value73));
    }
    for (const [value77, value78] of map2)
      set1.has(value77) || (fn14(value78), map2.delete(value77));
  }
  function fn16(arg63) {
    const value79 = arg63.panels.map((arg64) => arg64.visible + ":" + arg64.scale.x).join("|");
    if (value79 === arg63.pose) return;
    arg63.pose = value79;
    const value80 = arg63.mesh.material.uniforms,
      value81 = value80.haloRects.value,
      value82 = arg63.panels.filter((arg65) => arg65.visible);
    if (!value82.length) {
      ((value80.haloRectCount.value = 1), value81[0].set(0, 0, arg63.width / 2, arg63.height / 2));
      return;
    }
    let value83 = 0;
    for (const value84 of value82.slice(0, 2)) {
      const list6 = [];
      for (let value89 = value84; value89 && value89 !== arg63.model; value89 = value89.parent)
        list6.unshift(value89);
      const value85 = new arg48.Matrix4();
      for (const value90 of list6)
        (value90.matrixAutoUpdate && value90.updateMatrix(), value85.multiply(value90.matrix));
      value84.geometry.boundingBox || value84.geometry.computeBoundingBox();
      const value86 = value84.geometry.boundingBox.clone().applyMatrix4(value85),
        value87 = value86.getCenter(new arg48.Vector3()),
        value88 = value86.getSize(new arg48.Vector3());
      value81[value83++].set(
        value87.x - arg63.center.x,
        value87.y - arg63.center.y,
        value88.x / 2,
        value88.y / 2,
      );
    }
    value80.haloRectCount.value = value83;
  }
  function fn17() {
    if (value57) {
      for (const value91 of map2.values()) value91.panels.length && fn16(value91);
    }
  }
  function fn18(arg66, arg67) {
    const value92 = map2.get(arg66);
    value92 &&
      (value92.mesh.material.uniforms.haloColor.value.copy(arg67),
      (value92.mesh.visible = value57 && arg67.r + arg67.g + arg67.b > 0));
  }
  function fn19(arg68) {
    value57 = arg68;
    for (const value93 of map2.values()) {
      const value94 = value93.mesh.material.uniforms.haloColor.value;
      value93.mesh.visible = value57 && value94.r + value94.g + value94.b > 0;
    }
  }
  function fn20() {
    for (const value95 of map2.values()) fn14(value95);
    (map2.clear(), (value54 = null), (value55 = undefined), (value56 = undefined));
  }
  return {
    sync: fn15,
    setColor: fn18,
    setVisible: fn19,
    clear: fn20,
    update: fn17,
    dispose() {
      (fn20(), value58.dispose());
    },
  };
}
