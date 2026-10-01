import { mergeGeometries } from "../vendor/three/0.182.0/BufferGeometryUtils.js";
function ne(arg1) {
  if (globalThis.requestIdleCallback) {
    const value2 = requestIdleCallback(arg1, {
      timeout: 250,
    });
    return () => cancelIdleCallback(value2);
  }
  const value1 = setTimeout(arg1, 0);
  return () => clearTimeout(value1);
}
export function createReflectionPasses({
  THREE: arg2,
  requestFrame: arg3 = () => {},
  scheduleWork: arg4 = ne,
  maxBytes: arg5 = 8 * 1024 * 1024,
  maxDetailDiameter: arg6 = 0.14,
  maxDetailPixels: arg7 = 2.5,
} = {}) {
  const object1 = {
      batch: true,
      small: true,
      material: true,
    },
    object2 = {
      batches: 0,
      bytes: 0,
      pending: 0,
      savedDraws: 0,
      omitted: 0,
      materials: 0,
    },
    map1 = new Map(),
    list1 = [],
    list2 = [],
    map2 = new Map(),
    list3 = [],
    list4 = [],
    weakMap1 = new WeakMap(),
    value3 = new arg2.Matrix4(),
    value4 = new arg2.Matrix4(),
    value5 = new arg2.Vector3(),
    value6 = new arg2.Vector4(),
    value7 = new arg2.Matrix4();
  let value8 = 0,
    value9 = null,
    list5 = [],
    value10 = null,
    value11 = false;
  const value12 = arg2.Material.prototype.customProgramCacheKey.call(new arg2.Material()),
    fn1 = (arg8) => ({
      index: arg8.index,
      version: arg8.index?.version,
      start: arg8.drawRange.start,
      count: arg8.drawRange.count,
      attributes: Object.entries(arg8.attributes).map(([arg9, arg10]) => ({
        name: arg9,
        attribute: arg10,
        version: arg10.version,
        dataVersion: arg10.data?.version,
        count: arg10.count,
      })),
    }),
    fn2 = (arg11) => {
      const value13 = arg11.object.geometry,
        value14 = arg11.key;
      if (value13 !== arg11.geometry) return false;
      if (value9?.has(value14)) return value9.get(value14);
      const value15 =
        value14.index === value13.index &&
        value14.version === value13.index?.version &&
        value14.start === value13.drawRange.start &&
        value14.count === value13.drawRange.count &&
        Object.keys(value13.attributes).length === value14.attributes.length &&
        value14.attributes.every((arg12) => {
          const value16 = value13.attributes[arg12.name];
          return (
            value16 === arg12.attribute &&
            value16.version === arg12.version &&
            value16.data?.version === arg12.dataVersion &&
            value16.count === arg12.count
          );
        });
      return (value9?.set(value14, value15), value15);
    },
    fn3 = (arg13) => {
      for (let value17 = arg13; value17; value17 = value17.parent)
        if (!value17.visible) return false;
      return true;
    };
  function fn4(arg14) {
    for (let value18 = arg14.parent; value18; value18 = value18.parent) {
      const value19 = value18.userData.floorId || value18.userData.regionFloorId;
      if (value19)
        return {
          object: value18,
          id: String(value19),
        };
    }
    return null;
  }
  function fn5(arg15) {
    const value20 = arg15.geometry,
      value21 = arg15.material;
    return (
      arg15.isMesh &&
      !arg15.children.length &&
      !arg15.isInstancedMesh &&
      !arg15.isBatchedMesh &&
      !arg15.isSkinnedMesh &&
      !arg15.morphTargetInfluences?.length &&
      !Object.keys(value20?.morphAttributes || {}).length &&
      arg15.onBeforeRender === arg2.Object3D.prototype.onBeforeRender &&
      value20?.attributes.position &&
      value20.drawRange.start === 0 &&
      value20.drawRange.count === Infinity &&
      value21?.isMeshStandardMaterial &&
      !value21.transparent &&
      !value21.alphaTest &&
      !value21.alphaHash &&
      !value21.displacementMap &&
      !(value21.transmission > 0) &&
      !value21.clippingPlanes?.length &&
      !arg15.userData.reflectionOverlay &&
      !arg15.userData.regionReceiverKind &&
      !["background", "grid", "outline"].includes(arg15.userData.exportRole)
    );
  }
  function fn6(arg16) {
    return (
      arg16.onBeforeCompile === arg2.Material.prototype.onBeforeCompile ||
      (arg16.userData.plan2RegionMaterial &&
        !arg16.userData.plan2DetailedSurface &&
        arg16.customProgramCacheKey().split("|plan2-")[0] === value12)
    );
  }
  function fn7(arg17) {
    if (
      !object1.material ||
      !arg17?.isMeshStandardMaterial ||
      arg17.transparent ||
      arg17.transmission > 0 ||
      arg17.userData.alphaWallBand ||
      arg17.displacementMap ||
      arg17.clippingPlanes?.length ||
      (arg17.userData.plan2RegionMaterial &&
        !arg17.userData.plan2DetailedSurface &&
        !arg17.normalMap &&
        !arg17.bumpMap &&
        !arg17.roughnessMap &&
        !arg17.metalnessMap) ||
      (!arg17.userData.plan2RegionMaterial && !fn6(arg17))
    )
      return arg17;
    let value22 = map1.get(arg17);
    if (
      (value22 && value22.version !== arg17.version && (value22.release(), (value22 = null)),
      !value22)
    ) {
      const value24 = arg17.clone();
      ((value24.roughness = 1),
        (value24.metalness = 0),
        (value24.envMap = null),
        (value24.normalMap = value24.bumpMap = value24.roughnessMap = value24.metalnessMap = null),
        value24.isMeshPhysicalMaterial &&
          ((value24.clearcoat = 0),
          (value24.sheen = 0),
          (value24.iridescence = 0),
          (value24.anisotropy = 0)),
        (value24.onBeforeCompile = function (arg18, arg19) {
          (arg17.onBeforeCompile.call(this, arg18, arg19),
            arg17.userData.plan2DetailedSurface &&
              ((arg18.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + arg18.fragmentShader),
              (arg18.fragmentShader = arg18.fragmentShader
                .replace(
                  "#include <lights_fragment_begin>",
                  "\n            vec3 reflectionNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n            float reflectionUp = reflectionNormal.y * 0.5 + 0.5;\n            float reflectionKey = max(dot(reflectionNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n            vec3 reflectionTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0), reflectionUp);\n            reflectedLight.indirectDiffuse = diffuseColor.rgb * reflectionTint * (0.30 + 0.40 * reflectionUp + 0.18 * reflectionKey);\n          ",
                )
                .replace("#include <lights_fragment_maps>", "")
                .replace("#include <lights_fragment_end>", ""))));
        }),
        (value24.customProgramCacheKey = () =>
          arg17.customProgramCacheKey() + "|reflection-light-v1"),
        (value22 = {
          copy: value24,
          version: arg17.version,
          release() {
            (arg17.removeEventListener("dispose", value22.release),
              value24.dispose(),
              map1.delete(arg17),
              (object2.materials = map1.size));
          },
        }),
        arg17.addEventListener("dispose", value22.release),
        map1.set(arg17, value22),
        (object2.materials = map1.size));
    }
    const value23 = value22.copy;
    return (
      value23.color.copy(arg17.color),
      value23.emissive.copy(arg17.emissive),
      (value23.emissiveIntensity = arg17.emissiveIntensity),
      (value23.opacity = arg17.opacity),
      (value23.map = arg17.map),
      (value23.alphaMap = arg17.alphaMap),
      (value23.lightMap = arg17.lightMap),
      (value23.lightMapIntensity = arg17.lightMapIntensity),
      (value23.aoMap = arg17.aoMap),
      (value23.aoMapIntensity = arg17.aoMapIntensity),
      value23
    );
  }
  function fn8() {
    (value10?.(), (value10 = null), (list5 = []), (object2.pending = 0));
    for (const value25 of list1) value25.dispose();
    ((list1.length = 0), (list2.length = 0), map2.clear(), (object2.batches = object2.bytes = 0));
  }
  function fn9() {
    ((object2.pending = list5.length),
      !(value11 || value10 || !list5.length) &&
        (value10 = arg4(() => {
          value10 = null;
          const value26 = list5.shift();
          object2.pending = list5.length;
          try {
            fn10(value26);
          } catch {
            value26.dispose();
          } finally {
            list5.length ? fn9() : arg3();
          }
        })));
  }
  function fn10(arg20) {
    if (value11 || arg20.dead || !arg20.entries.every(fn2)) return;
    const value27 = arg20.entries.reduce(
      (arg21, arg22) =>
        arg21 +
        Object.values(arg22.geometry.attributes).reduce(
          (arg23, arg24) => arg23 + arg24.count * arg24.itemSize * 4,
          0,
        ) +
        (arg22.geometry.index?.count ?? arg22.geometry.attributes.position.count) * 8,
      0,
    );
    if (object2.bytes + value27 > arg5) return;
    const list6 = [];
    try {
      for (const value30 of arg20.entries) {
        const value31 = new arg2.BufferGeometry();
        list6.push(value31);
        for (const [value33, value34] of Object.entries(value30.geometry.attributes)) {
          const float32Array1 = new Float32Array(value34.count * value34.itemSize),
            list7 = ["getX", "getY", "getZ", "getW"];
          for (let value35 = 0; value35 < value34.count; value35++)
            for (let value36 = 0; value36 < value34.itemSize; value36++)
              float32Array1[value35 * value34.itemSize + value36] =
                value34[list7[value36]](value35);
          value31.setAttribute(value33, new arg2.BufferAttribute(float32Array1, value34.itemSize));
        }
        const value32 = value30.geometry.index?.count ?? value30.geometry.attributes.position.count,
          uint32Array1 = new Uint32Array(value32);
        for (let value37 = 0; value37 < value32; value37++)
          uint32Array1[value37] = value30.geometry.index
            ? value30.geometry.index.getX(value37)
            : value37;
        (value31.setIndex(new arg2.BufferAttribute(uint32Array1, 1)),
          value31.applyMatrix4(value30.matrix));
      }
      const value28 = mergeGeometries(list6);
      if (!value28) return;
      ((arg20.geometry = value28), (arg20.partialGeometry = new arg2.BufferGeometry()));
      for (const [value38, value39] of Object.entries(value28.attributes))
        arg20.partialGeometry.setAttribute(value38, value39);
      (arg20.partialGeometry.setIndex(
        new arg2.BufferAttribute(new Uint32Array(value28.index.count), 1).setUsage(
          arg2.DynamicDrawUsage,
        ),
      ),
        (arg20.selected = []),
        (arg20.selection = new Uint8Array(arg20.entries.length)));
      let value29 = 0;
      for (const value40 of arg20.entries)
        ((value40.offset = value29),
          (value40.count =
            value40.geometry.index?.count ?? value40.geometry.attributes.position.count),
          (value29 += value40.count));
      ((arg20.proxy = new arg2.Mesh(value28, arg20.material)),
        (arg20.proxy.matrixAutoUpdate = false),
        (arg20.proxy.frustumCulled = false),
        (arg20.proxy.receiveShadow = arg20.entries[0].object.receiveShadow),
        (arg20.proxy.layers.mask = arg20.entries[0].object.layers.mask),
        (arg20.proxy.renderOrder = arg20.entries[0].object.renderOrder),
        (arg20.proxy.userData.floorId = arg20.owner.id),
        (arg20.proxy.userData.reflectionBatch = true),
        (arg20.bytes = value27),
        (object2.bytes += arg20.bytes),
        object2.batches++);
    } finally {
      for (const value41 of list6) value41.dispose();
    }
  }
  function fn11(arg25) {
    if (value11) return;
    (fn15(), fn8());
    const map3 = new Map(),
      map4 = new Map(),
      fn16 = (arg26) => (map4.has(arg26) || map4.set(arg26, fn1(arg26)), map4.get(arg26));
    arg25.traverse((arg27) => {
      if (!fn5(arg27) || !fn6(arg27.material)) return;
      const value42 = arg27.geometry,
        value43 = fn4(arg27);
      if (!value43) return;
      value42.boundingSphere || value42.computeBoundingSphere();
      const value44 =
        !arg27.userData.reflectionRole && !arg27.material.emissive.getHex()
          ? {
              object: arg27,
              geometry: value42,
              key: fn16(value42),
              radius: value42.boundingSphere.radius,
              center: value42.boundingSphere.center.clone(),
            }
          : null;
      if (
        (value44 &&
          (list2.push(value44),
          map2.has(value43.id) || map2.set(value43.id, []),
          map2.get(value43.id).push(value44)),
        arg27.userData.reflectionSimplifiable || arg27.userData.reflectionRole || !fn3(arg27))
      )
        return;
      const value45 = Object.entries(value42.attributes)
        .map(([arg28, arg29]) => [arg28, arg29.itemSize])
        .sort();
      if (Object.values(value42.attributes).some((arg30) => arg30.itemSize > 4)) return;
      const value46 = JSON.stringify([
        value43.object.id,
        arg27.material.uuid,
        arg27.receiveShadow,
        arg27.renderOrder,
        arg27.layers.mask,
        value45,
      ]);
      (map3.has(value46) ||
        map3.set(value46, {
          owner: value43,
          material: arg27.material,
          entries: [],
        }),
        map3.get(value46).entries.push({
          object: arg27,
          geometry: value42,
          key: fn16(value42),
          small: value44,
          matrix: new arg2.Matrix4()
            .copy(value43.object.matrixWorld)
            .invert()
            .multiply(arg27.matrixWorld),
        }));
    });
    for (const value47 of map3.values())
      if (!(value47.entries.length < 2)) {
        value47.dispose = () => {
          if (!value47.dead) {
            value47.dead = true;
            for (const value48 of value47.entries)
              value48.geometry.removeEventListener("dispose", value47.dispose);
            (value47.material.removeEventListener("dispose", value47.dispose),
              value47.proxy &&
                (value47.proxy.removeFromParent(),
                value47.geometry.dispose(),
                value47.partialGeometry?.dispose(),
                (object2.bytes -= value47.bytes),
                object2.batches--));
          }
        };
        for (const value49 of value47.entries)
          value49.geometry.addEventListener("dispose", value47.dispose);
        (value47.material.addEventListener("dispose", value47.dispose),
          list1.push(value47),
          list5.push(value47));
      }
    fn9();
  }
  function fn12(arg31) {
    return (
      value5.setFromMatrixScale(arg31.object.matrixWorld),
      arg31.radius * 2 * Math.max(Math.abs(value5.x), Math.abs(value5.y), Math.abs(value5.z))
    );
  }
  function fn13(arg32, arg33, arg34) {
    const value50 = arg32.object,
      value51 = fn12(arg32);
    if (value51 > arg6 || !fn2(arg32) || !fn5(value50) || value50.material.emissive?.getHex())
      return false;
    value6
      .set(arg32.center.x, arg32.center.y, arg32.center.z, 1)
      .applyMatrix4(value50.matrixWorld)
      .applyMatrix4(value7);
    const value52 = (value51 * value8) / value6.w;
    return value6.w > 0 && value52 <= arg7;
  }
  function fn14(arg35, arg36, arg37, arg38) {
    if (
      (fn15(),
      (value9 = new Map()),
      value7.multiplyMatrices(arg36.projectionMatrix, arg36.matrixWorldInverse),
      (value8 =
        (Math.max(
          Math.abs(arg36.projectionMatrix.elements[0]),
          Math.abs(arg36.projectionMatrix.elements[5]),
        ) *
          arg37) /
        2),
      object1.batch)
    )
      for (const value53 of list1) {
        if (
          value53.dead ||
          !value53.proxy ||
          (arg38 != null && value53.owner.id !== arg38) ||
          !fn3(value53.owner.object)
        )
          continue;
        (value3.copy(value53.owner.object.matrixWorld).invert(), (value53.selected.length = 0));
        let value54 = false,
          value55 = 0;
        for (let value56 = 0; value56 < value53.entries.length; value56++) {
          const value57 = value53.entries[value56],
            value58 =
              fn3(value57.object) &&
              fn2(value57) &&
              (value57.object.material === value53.material ||
                value57.object.material === map1.get(value53.material)?.copy ||
                weakMap1.get(value57.object.material) === value53.material) &&
              value57.object.receiveShadow === value53.proxy.receiveShadow &&
              value57.object.layers.mask === value53.proxy.layers.mask &&
              value57.object.renderOrder === value53.proxy.renderOrder &&
              value4.copy(value3).multiply(value57.object.matrixWorld).equals(value57.matrix),
            value59 =
              value58 && object1.small && value57.small && fn13(value57.small, arg36, arg37),
            value60 = value58 ? (value59 ? 2 : 1) : 0;
          ((value57.omitted = value59),
            (value54 ||= value53.selection[value56] !== value60),
            (value53.selection[value56] = value60),
            value60 && (value53.selected.push(value57), value59 || (value55 += value57.count)));
        }
        if (value53.selected.length < 2) {
          value53.partialValid = false;
          continue;
        }
        if (
          ((value53.proxy.geometry =
            value55 === value53.geometry.index.count ? value53.geometry : value53.partialGeometry),
          value53.proxy.geometry === value53.partialGeometry && (value54 || !value53.partialValid))
        ) {
          const value61 = value53.partialGeometry.index;
          let value62 = 0;
          for (const value63 of value53.selected)
            value63.omitted ||
              (value61.array.set(
                value53.geometry.index.array.subarray(
                  value63.offset,
                  value63.offset + value63.count,
                ),
                value62,
              ),
              (value62 += value63.count));
          ((value61.needsUpdate = true),
            value53.partialGeometry.setDrawRange(0, value55),
            (value53.partialValid = true));
        }
        for (const value64 of value53.selected)
          (list3.push(value64.object),
            (value64.object.visible = false),
            value64.omitted && object2.omitted++);
        value55 !== 0 &&
          ((value53.proxy.material = value53.selected[0].object.material),
          value53.proxy.matrix.copy(value53.owner.object.matrixWorld),
          value53.proxy.matrixWorld.copy(value53.owner.object.matrixWorld),
          arg35.add(value53.proxy),
          list4.push(value53.proxy),
          (object2.savedDraws += value53.selected.length - 1));
      }
    if (object1.small)
      for (const value65 of arg38 == null ? list2 : map2.get(String(arg38)) || []) {
        const value66 = value65.object;
        value66.geometry !== value65.geometry ||
          !fn3(value66) ||
          value66.material.emissive?.getHex() ||
          (fn13(value65, arg36, arg37) &&
            (list3.push(value66), (value66.visible = false), object2.omitted++));
      }
  }
  function fn15() {
    value9 = null;
    for (const value67 of list4) value67.removeFromParent();
    list4.length = 0;
    for (const value68 of list3) value68.visible = true;
    list3.length = 0;
  }
  return {
    options: object1,
    stats: object2,
    prepare: fn11,
    material: fn7,
    begin: fn14,
    restore: fn15,
    aliasMaterial(arg39, arg40) {
      weakMap1.set(arg40, arg39);
    },
    dispose() {
      ((value11 = true), fn15(), fn8());
      for (const value69 of [...map1.values()]) value69.release();
    },
  };
}
