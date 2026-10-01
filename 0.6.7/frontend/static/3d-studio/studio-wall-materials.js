export function createWallSideMaterial(arg1, arg2, arg3 = true, arg4 = "", arg5 = false) {
  const set1 = new Set(arg4.split(",")),
    value1 = arg3 && set1.has("shader") ? y(arg1, arg2, arg5) : new arg1.MeshPhysicalMaterial(arg2);
  return (
    arg3 && set1.has("single") && (value1.forceSinglePass = true),
    arg3 && set1.has("depth") && (value1.depthWrite = true),
    value1.userData.hbDedicatedWall ||
      !arg3 ||
      ((value1.onBeforeCompile = (arg6) => {
        ((arg6.vertexShader =
          "attribute float hbWallHeight; varying float vHbWallHeight;\n" + arg6.vertexShader),
          (arg6.vertexShader = arg6.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHbWallHeight = hbWallHeight;",
          )),
          (arg6.fragmentShader = "varying float vHbWallHeight;\n" + arg6.fragmentShader),
          (arg6.fragmentShader = arg6.fragmentShader.replace(
            "#include <opaque_fragment>",
            "\n      float wallHeightBlend = smoothstep(0.0, 0.65, vHbWallHeight);\n      outgoingLight *= mix(" +
              (arg5 ? "0.92" : "0.70") +
              ", 1.0, wallHeightBlend);\n      diffuseColor.a += diffuseColor.a * (1.0 - diffuseColor.a) * " +
              (arg5 ? "0.0" : "0.65") +
              " * (1.0 - wallHeightBlend);\n      #include <opaque_fragment>",
          )));
      }),
      (value1.customProgramCacheKey = () =>
        arg5 ? "hb-wall-warm-clean-v1" : "hb-wall-height-gradient-v3")),
    value1
  );
}
function y(arg7, arg8, arg9 = false) {
  const value2 = new arg7.ShaderMaterial({
    uniforms: {
      diffuse: {
        value: new arg7.Color(arg8.color),
      },
      opacity: {
        value: arg8.opacity,
      },
    },
    vertexShader:
      "\n      attribute float hbWallHeight;\n      attribute vec2 hbWallCornerDistance;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_vertex>\n      void main() {\n        vHbWallHeight = hbWallHeight;\n        vHbWallCornerDistance = hbWallCornerDistance;\n        vHbNormal = normalize(normalMatrix * normal);\n        #include <begin_vertex>\n        #include <project_vertex>\n        #include <clipping_planes_vertex>\n      }",
    fragmentShader:
      "\n      uniform vec3 diffuse;\n      uniform float opacity;\n      uniform mat4 plan2ViewToWorld;\n      varying float vHbWallHeight;\n      varying vec2 vHbWallCornerDistance;\n      varying vec3 vHbNormal;\n      #include <common>\n      #include <clipping_planes_pars_fragment>\n      void main() {\n        #include <clipping_planes_fragment>\n        // These are closed wall volumes. Their opposite surface would show\n        // its displaced bottom edge through the nearer translucent surface.\n        // Keep the camera-facing surface from either side of the wall.\n        if (!gl_FrontFacing) discard;\n        vec3 normal = normalize(vHbNormal) * (gl_FrontFacing ? 1.0 : -1.0);\n        vec3 worldNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n        float up = worldNormal.y * 0.5 + 0.5;\n        float key = max(dot(worldNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        vec3 outgoingLight = diffuse * " +
      (arg9
        ? "mix(vec3(0.98, 0.98, 0.97), vec3(1.0), up) * (0.66 + 0.16 * up + 0.10 * key)"
        : "mix(vec3(0.82, 0.85, 0.91), vec3(1.0), up) * (0.30 + 0.40 * up + 0.18 * key)") +
      ";\n        outgoingLight += mix(diffuse, sqrt(max(diffuse, vec3(0.0))), 0.6) * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain;\n        // Height changes colour only. Changing coverage as well accentuates\n        // the draw-order boundaries between translucent door/window bands.\n        float wallRootShade = 1.0 - smoothstep(0.0, 0.55, vHbWallHeight);\n        // Retain the wall/light hue with a gentler neutral root tint.\n        outgoingLight *= 1.0 - " +
      (arg9 ? "0.14" : "0.54") +
      " * wallRootShade;\n        float cornerDistance = min(vHbWallCornerDistance.x, vHbWallCornerDistance.y);\n        float cornerShade = 1.0 - smoothstep(0.0, 0.24, cornerDistance);\n        outgoingLight *= 1.0 - " +
      (arg9 ? "0.08" : "0.28") +
      " * cornerShade;\n        gl_FragColor = vec4(outgoingLight, opacity);\n        #include <tonemapping_fragment>\n        #include <colorspace_fragment>\n      }",
    transparent: arg8.transparent,
    depthWrite: arg8.depthWrite ?? true,
    depthFunc: arg8.depthFunc ?? arg7.LessEqualDepth,
    side: arg7.FrontSide,
    forceSinglePass: false,
  });
  return (
    (value2.color = new arg7.Color(arg8.color)),
    (value2.opacity = arg8.opacity),
    (value2.userData.hbDedicatedWall = true),
    (value2.defaultAttributeValues.hbWallCornerDistance = [100, 100]),
    (value2.customProgramCacheKey = () =>
      arg9 ? "hb-dedicated-wall-warm-clean-v1" : "hb-dedicated-wall-front-corner-balanced-v9"),
    value2
  );
}
export function setWallCornerDistances(arg10, arg11, arg12) {
  const list1 = [];
  for (const value6 of arg12) {
    let value7 = value6.filter(
      (arg13, arg14) =>
        !arg14 || Math.hypot(arg13.x - value6[arg14 - 1].x, arg13.y - value6[arg14 - 1].y) > 1e-7,
    );
    (value7.length > 1 &&
      Math.hypot(value7[0].x - value7.at(-1).x, value7[0].y - value7.at(-1).y) < 1e-7 &&
      (value7 = value7.slice(0, -1)),
      (value7 = value7.filter((arg15, arg16, arg17) => {
        const value8 = arg17[(arg16 + arg17.length - 1) % arg17.length],
          value9 = arg17[(arg16 + 1) % arg17.length],
          value10 = arg15.x - value8.x,
          value11 = arg15.y - value8.y,
          value12 = value9.x - arg15.x,
          value13 = value9.y - arg15.y;
        return (
          value10 * value12 + value11 * value13 <= 0 ||
          Math.abs(value10 * value13 - value11 * value12) >
            0.000001 * Math.hypot(value10, value11) * Math.hypot(value12, value13)
        );
      })));
    for (let value14 = 0; value14 < value7.length; value14++) {
      const value15 = value7[value14],
        value16 = value7[(value14 + 1) % value7.length],
        value17 = Math.hypot(value16.x - value15.x, value16.y - value15.y);
      value17 > 1e-7 &&
        list1.push({
          x: value15.x,
          y: value15.y,
          tx: (value16.x - value15.x) / value17,
          ty: (value16.y - value15.y) / value17,
          length: value17,
        });
    }
  }
  const value3 = arg11.attributes.position,
    value4 = arg11.attributes.normal,
    value5 = new Float32Array(value3.count * 2).fill(100);
  for (let value18 = 0; value18 < value3.count; value18++) {
    if (!value4 || Math.abs(value4.getZ(value18)) > 0.5) continue;
    let value19 = Infinity;
    for (const value20 of list1) {
      const value21 = value3.getX(value18) - value20.x,
        value22 = value3.getY(value18) - value20.y,
        value23 = value21 * value20.tx + value22 * value20.ty,
        value24 =
          Math.abs(value21 * value20.ty - value22 * value20.tx) +
          Math.max(-value23, 0, value23 - value20.length) +
          Math.abs(value4.getX(value18) * value20.tx + value4.getY(value18) * value20.ty);
      value24 < value19 &&
        ((value19 = value24),
        (value5[value18 * 2] = Math.max(0, Math.min(value20.length, value23))),
        (value5[value18 * 2 + 1] = value20.length - value5[value18 * 2]));
    }
  }
  arg11.setAttribute("hbWallCornerDistance", new arg10.BufferAttribute(value5, 2));
}
export function mergeWallBands(arg18, arg19, arg20) {
  const map1 = new Map();
  for (const value25 of arg19.children) {
    if (!value25.userData.hbMergeWallBand || !Array.isArray(value25.material)) continue;
    const value26 = value25.material[1],
      value27 = JSON.stringify([
        value26.type,
        value26.color.getHex(),
        value26.opacity,
        value26.depthWrite,
        value26.depthFunc,
        value26.side,
        value26.forceSinglePass,
        value26.transparent,
        value25.layers.mask,
        value25.castShadow,
        value25.receiveShadow,
        value25.renderOrder,
      ]);
    (map1.has(value27) || map1.set(value27, []), map1.get(value27).push(value25));
  }
  for (const value28 of map1.values()) {
    if (value28.length < 2) continue;
    const list2 = [];
    for (const value33 of value28) {
      value33.updateMatrix();
      const value34 = value33.geometry.index ? value33.geometry.toNonIndexed() : value33.geometry;
      for (const value35 of value34.groups.filter((arg21) => arg21.materialIndex === 1)) {
        const value36 = new arg18.BufferGeometry();
        for (const [value37, value38] of Object.entries(value34.attributes))
          value36.setAttribute(
            value37,
            new arg18.BufferAttribute(
              value38.array.slice(
                value35.start * value38.itemSize,
                (value35.start + value35.count) * value38.itemSize,
              ),
              value38.itemSize,
              value38.normalized,
            ),
          );
        (value36.applyMatrix4(value33.matrix), list2.push(value36));
      }
      value34 !== value33.geometry && value34.dispose();
    }
    const value29 = list2.length ? arg20(list2, false) : null;
    for (const value39 of list2) value39.dispose();
    if (!value29) continue;
    (value29.computeBoundingBox(), value29.computeBoundingSphere());
    const value30 = value28[0],
      value31 = value30.material[1],
      value32 = new arg18.Mesh(value29, value31);
    ((value32.userData = {
      ...value30.userData,
      hbMergedWallCount: value28.length,
      regionReceiverKind: "wall",
    }),
      (value32.layers.mask = value30.layers.mask),
      (value32.renderOrder = value30.renderOrder),
      (value32.castShadow = value30.castShadow),
      (value32.receiveShadow = value30.receiveShadow));
    const set2 = new Set();
    for (const value40 of value28) {
      (arg19.remove(value40), value40.geometry.dispose());
      for (const value41 of value40.material)
        value41 !== value31 && !set2.has(value41) && (set2.add(value41), value41.dispose());
    }
    arg19.add(value32);
  }
}
export function setWallGradientHeight(arg22, arg23, arg24, arg25, arg26, arg27) {
  const value42 = arg23.attributes.position,
    float32Array1 = new Float32Array(value42.count),
    value43 = Math.max(0.01, arg27);
  for (let value44 = 0; value44 < value42.count; value44++) {
    const value45 = arg24 === "z" ? value42.getZ(value44) : value42.getY(value44);
    float32Array1[value44] = Math.max(0, Math.min(1, (arg25 + arg26 * value45) / value43));
  }
  arg23.setAttribute("hbWallHeight", new arg22.BufferAttribute(float32Array1, 1));
}
