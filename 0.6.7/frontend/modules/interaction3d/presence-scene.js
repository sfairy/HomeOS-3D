import { createWalker, animateWalker, disposeWalker } from "./presence-character.js";
import {
  validPresenceRoute,
  createPresenceTriggers,
  closedPath,
  sampleClosedPath,
  presenceVisibleOnPage,
} from "./presence-motion.js?v=20260911-presence-pages-v2-detection-triggers-v1";
export function createPresenceScene(arg1, arg2 = () => {}, arg3) {
  const map1 = new Map(),
    map2 = new Map();
  let value1 = 0;
  const value2 = createPresenceTriggers(arg3);
  let value3 = false,
    value4 = null;
  function fn1() {
    if (!value4) {
      const uint8Array1 = new Uint8Array(16384);
      for (let value13 = 0; value13 < 64; value13++)
        for (let value14 = 0; value14 < 64; value14++) {
          const value15 = Math.hypot(
            ((value14 + 0.5) / 64) * 2 - 1,
            ((value13 + 0.5) / 64) * 2 - 1,
          );
          uint8Array1[(value13 * 64 + value14) * 4 + 3] = Math.round(
            255 * Math.max(0, 1 - value15 * value15) ** 2,
          );
        }
      const value12 = new arg1.THREE.DataTexture(uint8Array1, 64, 64);
      ((value12.magFilter = value12.minFilter = arg1.THREE.LinearFilter),
        (value12.needsUpdate = true),
        (value4 = {
          texture: value12,
          geometry: new arg1.THREE.PlaneGeometry(1.05, 0.8),
        }));
    }
    const value10 = new arg1.THREE.MeshBasicMaterial({
        map: value4.texture,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        toneMapped: false,
      }),
      value11 = new arg1.THREE.Mesh(value4.geometry, value10);
    return (
      (value11.name = "presence-foot-shadow"),
      (value11.rotation.x = -Math.PI / 2),
      (value11.renderOrder = 2),
      (value11.userData.environmentEffect = true),
      (value11.raycast = () => {}),
      value11
    );
  }
  function fn2() {
    value3 && ((value3 = false), arg1.requestRender?.());
  }
  function fn3(arg4, arg5) {
    arg4.opacity = arg5;
    for (const [value16, value17] of arg4.materials) {
      ((value16.opacity = value17.opacity * arg5),
        (value16.depthWrite = arg5 < 1 ? false : value17.depthWrite));
      const value18 = value17.transparent || arg5 < 1;
      value16.transparent !== value18 &&
        ((value16.transparent = value18), (value16.needsUpdate = true));
    }
    ((arg4.shadow.material.opacity = 0.62 * arg5), (value3 = true));
  }
  function fn4(arg6) {
    const value19 = new arg1.THREE.Box3();
    arg6.root.updateWorldMatrix(true, true);
    for (const value20 of arg6.root.children)
      value20 !== arg6.shadow && value19.expandByObject(value20);
    return value19;
  }
  const value5 = new arg1.THREE.Vector3();
  let value6,
    value7,
    value8,
    value9,
    list1 = [];
  function fn5(arg7, arg8) {
    if (
      value6 !== arg1.modelRoot ||
      value7 !== arg1.sceneRevision ||
      value8 !== arg1.backgroundFloor ||
      value9 !== arg1.document
    ) {
      ((value6 = arg1.modelRoot),
        (value7 = arg1.sceneRevision),
        (value8 = arg1.backgroundFloor),
        (value9 = arg1.document),
        (list1 = []));
      for (const value22 of arg1.document?.floors || [])
        for (const value23 of value22.scene?.items || []) {
          if (value23.type !== "rug") continue;
          const value24 = value22.scene.calibration?.pixelsPerMeter || 1,
            value25 = ((value23.rotation || 0) * Math.PI) / 180,
            value26 = Math.cos(value25),
            value27 = Math.sin(value25),
            value28 = arg1.worldPoint(value22.id, value23.x, value23.y, value23.elevation || 0),
            value29 = arg1.worldPoint(
              value22.id,
              value23.x + value26 * value24,
              value23.y + value27 * value24,
              value23.elevation || 0,
            ),
            value30 = arg1.worldPoint(
              value22.id,
              value23.x - value27 * value24,
              value23.y + value26 * value24,
              value23.elevation || 0,
            );
          !value28 ||
            !value29 ||
            !value30 ||
            list1.push({
              floorId: value22.id,
              center: value28,
              x: value29.sub(value28).normalize(),
              z: value30.sub(value28).normalize(),
              width: value23.width,
              depth: value23.depth,
              height: Math.max(0.004, Math.min(0.018, value23.height ?? 0.012)) + 0.001,
            });
        }
    }
    let value21 = arg7.y;
    for (const value31 of list1) {
      if (value31.floorId !== arg8) continue;
      const value32 = arg7.x - value31.center.x,
        value33 = arg7.z - value31.center.z;
      if (
        Math.abs(value32 * value31.x.x + value33 * value31.x.z) > value31.width / 2 ||
        Math.abs(value32 * value31.z.x + value33 * value31.z.z) > value31.depth / 2
      )
        continue;
      const value34 = value31.center.y + value31.height;
      value34 >= value21 && value34 - arg7.y <= 0.05 && (value21 = value34);
    }
    return value21;
  }
  const fn6 = (arg9) => {
    const value35 = map1.get(arg9);
    (map2.set(arg9, {
      key: value35.progressKey,
      distance: value35.distance,
    }),
      (value3 = true),
      value35.shadow.removeFromParent(),
      value35.shadow.material.dispose(),
      disposeWalker(value35.root),
      value35.routeLine &&
        (value35.routeLine.geometry.dispose(),
        value35.routeLine.material.dispose(),
        value35.routeLine.removeFromParent()),
      map1.delete(arg9));
  };
  function fn7(arg10) {
    const value36 = sampleClosedPath(arg10.path, arg10.distance);
    if (!value36) return;
    const value37 = fn5(value36, arg10.floorId);
    (arg10.root.position.set(value36.x, value37, value36.z),
      (arg10.root.rotation.y = value36.heading),
      animateWalker(arg10.root, (arg10.distance / arg10.size) * 12, arg10.preview ? 0 : 1, value1),
      arg10.root.updateMatrixWorld(true));
    const value38 = Math.min(
      ...arg10.root.userData.parts.legs.map(
        (arg11) => (
          arg11.foot.getWorldPosition(value5),
          value5.y - arg10.root.userData.soleHeight * arg10.size
        ),
      ),
    );
    ((arg10.root.position.y += value37 + 0.014 * arg10.size - value38),
      (arg10.shadow.position.y = (value37 + 0.008 - arg10.root.position.y) / arg10.size));
  }
  function fn8(arg12, arg13, arg14, arg15) {
    const value39 = arg13.getBoundingClientRect(),
      list2 = [];
    for (const [value40, value41] of map1) {
      const value42 = arg14.find((arg16) => arg16.id === value40);
      if (!value42?.clickToFocus || value41.exiting || value41.opacity <= 0) continue;
      const value43 = fn4(value41),
        list3 = [];
      for (const value53 of [value43.min.x, value43.max.x])
        for (const value54 of [value43.min.y, value43.max.y])
          for (const value55 of [value43.min.z, value43.max.z])
            list3.push(new arg1.THREE.Vector3(value53, value54, value55).project(arg12));
      if (list3.every((arg17) => arg17.z < -1 || arg17.z > 1)) continue;
      const value44 = list3.map((arg18) => value39.left + ((arg18.x + 1) * value39.width) / 2),
        value45 = list3.map((arg19) => value39.top + ((1 - arg19.y) * value39.height) / 2),
        value46 = Math.min(...value44),
        value47 = Math.min(...value45),
        value48 = Math.max(...value44) - value46,
        value49 = Math.max(...value45) - value47,
        value50 = value42.hitPadding ?? 8,
        value51 = arg15?.width > 0 ? value39.width / arg15.width : 1,
        value52 = arg15?.height > 0 ? value39.height / arg15.height : 1;
      list2.push({
        id: value40,
        left: value46,
        top: value47,
        width: value48,
        height: value49,
        padding: value50,
        scaleX: value51,
        scaleY: value52,
      });
    }
    return list2;
  }
  return {
    sync(
      arg20 = [],
      arg21 = {},
      arg22 = false,
      arg23 = "all",
      arg24 = false,
      arg25 = false,
      arg26 = "light",
    ) {
      value2.sync(arg20, arg21);
      const set1 = new Set();
      let value56 = false;
      if (arg1.overlayScene && arg1.worldPoint)
        for (const value57 of arg20) {
          if (
            value57.routeClosed === false ||
            (!arg24 && !value57.entityId) ||
            !validPresenceRoute(value57.route) ||
            !arg22 ||
            (arg23 !== "all" && value57.floorId !== arg23) ||
            (!arg24 && (!value2.visible(value57.id) || !presenceVisibleOnPage(value57, arg26)))
          )
            continue;
          const value58 = value57.route.map((arg27) =>
            arg1.worldPoint(value57.floorId, arg27.x, arg27.y, 0),
          );
          if (
            value58.some((arg28) => !arg28 || ![arg28.x, arg28.y, arg28.z].every(Number.isFinite))
          )
            continue;
          const value59 = JSON.stringify([value57, value58, arg24, arg25]);
          let value60 = map1.get(value57.id);
          if (
            (value60 && value60.signature !== value59 && (fn6(value57.id), (value60 = null)),
            !value60)
          ) {
            const value61 = createWalker(
                arg1.THREE,
                value57.color === "orange" ? 15376452 : 5421233,
                value57.character,
              ),
              set2 = new Set();
            value61.traverse((arg29) => {
              arg29.isMesh && set2.add(arg29.material);
            });
            for (const value65 of set2)
              value65.emissive?.getHex() ||
                (value65.emissive.copy(value65.color), (value65.emissiveIntensity = 0.55));
            const value62 = value57.size ?? 1;
            (value61.scale.setScalar(value62),
              (value61.userData.presenceId = value57.id),
              (value61.userData.environmentFloorId = value57.floorId),
              arg1.overlayScene.add(value61));
            const value63 = JSON.stringify([
                value57.entityId,
                value57.floorId,
                value57.route,
                arg24,
              ]),
              value64 = map2.get(value57.id);
            if (
              ((value60 = {
                root: value61,
                size: value62,
                floorId: value57.floorId,
                shadow: fn1(),
                materials: new Map(
                  [...set2].map((arg30) => [
                    arg30,
                    {
                      opacity: arg30.opacity,
                      transparent: arg30.transparent,
                      depthWrite: arg30.depthWrite,
                    },
                  ]),
                ),
                opacity: 1,
                exiting: false,
                path: closedPath(value58),
                distance: value64?.key === value63 ? value64.distance : 0,
                progressKey: value63,
                speed: value57.speed ?? 0.45,
                signature: value59,
                simulated: arg24,
                preview: arg24 && !arg25,
              }),
              value61.add(value60.shadow),
              fn3(value60, arg24 ? 1 : 0),
              arg24)
            ) {
              const value66 = [...value58, value58[0]].map(
                (arg31) => new arg1.THREE.Vector3(arg31.x, arg31.y + 0.025, arg31.z),
              );
              ((value60.routeLine = new arg1.THREE.Line(
                new arg1.THREE.BufferGeometry().setFromPoints(value66),
                new arg1.THREE.LineBasicMaterial({
                  color: value57.color === "orange" ? 15376452 : 5421233,
                  depthTest: true,
                }),
              )),
                (value60.routeLine.name = "presence-route-preview"),
                (value60.routeLine.userData.environmentFloorId = value57.floorId),
                (value60.routeLine.userData.environmentEffect = true),
                arg1.overlayScene.add(value60.routeLine));
            }
            (map1.set(value57.id, value60), fn7(value60), (value56 = true));
          }
          (value60.exiting && ((value60.exiting = false), (value56 = true)), set1.add(value57.id));
        }
      for (const [value67, value68] of map1)
        if (!set1.has(value67)) {
          const value69 = arg20.find((arg32) => arg32.id === value67);
          !arg24 &&
          arg22 &&
          value69 &&
          value2.visible(value67) &&
          (arg23 === "all" || value68.floorId === arg23) &&
          !presenceVisibleOnPage(value69, arg26)
            ? value68.exiting || ((value68.exiting = true), (value56 = true))
            : (fn6(value67), (value56 = true));
        }
      for (const value70 of map2.keys())
        (!arg20.some((arg33) => arg33.id === value70) || (!arg24 && !value2.visible(value70))) &&
          map2.delete(value70);
      (fn2(), value56 && (arg1.requestRender?.(), arg2()));
    },
    tick(arg34) {
      const value71 = Math.max(0, Math.min(0.1, Number(arg34) || 0));
      value1 += value71;
      let value72 = false;
      for (const value74 of map1.keys())
        !map1.get(value74).simulated &&
          !value2.visible(value74) &&
          (fn6(value74), map2.delete(value74), (value72 = true));
      for (const [value75, value76] of map1) {
        const value77 = value76.exiting ? 0 : 1;
        if (
          (value76.opacity !== value77 &&
            value71 > 0 &&
            fn3(
              value76,
              value77 > value76.opacity
                ? Math.min(1, value76.opacity + value71 / 0.22)
                : Math.max(0, value76.opacity - value71 / 0.22),
            ),
          value76.exiting)
        ) {
          value76.opacity === 0 && fn6(value75);
          continue;
        }
        value76.preview ||
          value71 === 0 ||
          ((value76.distance = (value76.distance + value71 * value76.speed) % value76.path.length),
          fn7(value76),
          (value3 = true));
      }
      const value73 = [...map1.values()].some((arg35) => !arg35.preview || arg35.opacity !== 1);
      return (fn2(), (value73 || value72) && arg1.requestRender?.(), value73);
    },
    anchor(arg36) {
      const value78 = map1.get(arg36);
      return value78
        ? {
            center: [
              value78.root.position.x,
              value78.root.position.y + 0.7 * value78.size,
              value78.root.position.z,
            ],
          }
        : null;
    },
    hitRects: fn8,
    pick(arg37, arg38, arg39, arg40, arg41, arg42) {
      const value79 = arg40.getBoundingClientRect();
      if (!value79.width || !value79.height) return null;
      const value80 = [...map1.entries()].filter(
          ([arg43, arg44]) =>
            !arg44.exiting &&
            arg44.opacity > 0 &&
            arg41.find((arg45) => arg45.id === arg43)?.clickToFocus === true,
        ),
        value81 = new arg1.THREE.Raycaster();
      value81.setFromCamera(
        new arg1.THREE.Vector2(
          ((arg37 - value79.left) / value79.width) * 2 - 1,
          1 - ((arg38 - value79.top) / value79.height) * 2,
        ),
        arg39,
      );
      for (const [, value83] of value80) value83.root.updateMatrixWorld(true);
      const value82 = value81.intersectObjects(
        value80.map(([, arg46]) => arg46.root),
        true,
      );
      if (value82.length)
        return (
          value80.find(([, arg47]) => {
            let value84 = value82[0].object;
            for (; value84;) {
              if (value84 === arg47.root) return true;
              value84 = value84.parent;
            }
            return false;
          })?.[0] || null
        );
      const list4 = [];
      for (const {
        id: value85,
        left: value86,
        top: value87,
        width: value88,
        height: value89,
        padding: value90,
        scaleX: value91,
        scaleY: value92,
      } of fn8(arg39, arg40, arg41, arg42)) {
        if (!value90) continue;
        const value93 = Math.max(value86 - arg37, 0, arg37 - value86 - value88),
          value94 = Math.max(value87 - arg38, 0, arg38 - value87 - value89),
          value95 = Math.hypot(value93 / value91, value94 / value92);
        value95 <= value90 &&
          list4.push({
            id: value85,
            distance: value95,
          });
      }
      return list4.sort((arg48, arg49) => arg48.distance - arg49.distance)[0]?.id || null;
    },
    dispose() {
      for (const value96 of map1.keys()) fn6(value96);
      (map2.clear(),
        fn2(),
        value4?.geometry.dispose(),
        value4?.texture.dispose(),
        (value4 = null),
        (list1 = []),
        (value6 = null),
        (value7 = null),
        (value9 = null),
        (value8 = null));
    },
  };
}
export function createPresenceWaves(arg50, arg51 = () => {}) {
  const { THREE: value97 } = arg50,
    map3 = new Map(),
    value98 = new value97.RingGeometry(0.965, 1, 48);
  value98.rotateX(-Math.PI / 2);
  let value99,
    value100,
    text1 = "",
    value101 = false,
    value102 = false;
  const fn9 = () => {
      (arg50.requestRender?.(), arg51());
    },
    value103 =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    fn10 = () => {
      !value101 && value102 && fn9();
    };
  value103?.addEventListener?.("change", fn10);
  const fn11 = (arg52) => {
      for (let value104 = arg52; value104; value104 = value104.parent) {
        if (value104.visible === false) return false;
        if (value104 === value99) return true;
      }
      return false;
    },
    fn12 = (arg53) => {
      (arg53.group.removeFromParent(), arg53.rings.forEach((arg54) => arg54.material.dispose()));
    };
  function fn13({
    bindings: arg55 = [],
    states: arg56 = {},
    enabled: arg57 = false,
    floorId: arg58 = "",
    preview: arg59 = false,
  }) {
    if (value101) return;
    let value105 = false;
    const value106 = arg50.environmentRevision ?? arg50.sceneRevision,
      value107 = JSON.stringify(
        arg55.map((arg60) => [
          arg60.id,
          arg60.floorId,
          arg60.modelId,
          arg60.width,
          arg60.height,
          arg60.depth,
        ]),
      );
    if (value99 !== arg50.modelRoot || value100 !== value106 || text1 !== value107) {
      ((value99 = arg50.modelRoot), (value100 = value106), (text1 = value107));
      const map4 = new Map();
      value99?.traverse((arg61) => {
        arg61.userData?.environmentModelType === "presence" &&
          map4.set(
            JSON.stringify([arg61.userData.environmentFloorId, arg61.userData.environmentModelId]),
            arg61,
          );
      });
      const set3 = new Set();
      for (const value108 of arg55) {
        const value109 = map4.get(JSON.stringify([value108.floorId, value108.modelId]));
        if (!value109 || !arg50.overlayScene) continue;
        set3.add(value108.id);
        let value110 = map3.get(value108.id);
        if (value110?.model !== value109) {
          ((value105 = true), value110 && fn12(value110));
          const value114 = new value97.Group();
          ((value114.name = "presence-waves-" + value108.id),
            (value114.matrixAutoUpdate = false),
            (value114.userData.environmentEffect = true));
          const value115 = Array.from(
            {
              length: 3,
            },
            () => {
              const value116 = new value97.Mesh(
                value98,
                new value97.MeshBasicMaterial({
                  color: 12838102,
                  transparent: true,
                  opacity: 0,
                  side: value97.DoubleSide,
                  depthWrite: false,
                  toneMapped: false,
                }),
              );
              return ((value116.raycast = () => {}), value114.add(value116), value116);
            },
          );
          (arg50.overlayScene.add(value114),
            (value110 = {
              group: value114,
              rings: value115,
              model: value109,
            }),
            map3.set(value108.id, value110));
        }
        const value111 = Math.max(0.02, (value108.width || 0.16) * 0.5),
          value112 = (value108.depth || value108.width || 0.16) / (value108.width || 0.16),
          value113 = (value108.height || 0.2) * 0.755;
        ((value110.radius !== value111 ||
          value110.depthRatio !== value112 ||
          value110.rings[0].position.y !== value113) &&
          (value105 = true),
          (value110.radius = value111),
          (value110.depthRatio = value112));
        for (const value117 of value110.rings) value117.position.y = value113;
      }
      for (const [value118, value119] of map3)
        set3.has(value118) || ((value105 = true), fn12(value119), map3.delete(value118));
    }
    value102 = false;
    for (const value120 of arg55) {
      const value121 = map3.get(value120.id);
      if (!value121) continue;
      const value122 = Number.isFinite(value120.waveScale)
          ? Math.max(0.25, Math.min(3, value120.waveScale))
          : 1,
        value123 = Number.isFinite(value120.waveOpacity)
          ? Math.max(0, Math.min(100, value120.waveOpacity)) / 100
          : 0.68;
      ((value121.scale !== value122 || value121.opacity !== value123) && (value105 = true),
        (value121.scale = value122),
        (value121.opacity = value123));
      const value124 = arg56?.get?.(value120.entityId) ?? arg56[value120.entityId],
        value125 = value124?.newState || value124,
        value126 =
          value125?.available !== false &&
          !!value125?.state &&
          !["unknown", "unavailable"].includes(value125.state);
      value121.enabled =
        arg57 &&
        value120.waveEnabled !== false &&
        value121.opacity > 0 &&
        (arg59 || value126) &&
        value120.floorId === arg58;
      const value127 = value121.enabled && fn11(value121.model);
      (value121.group.visible !== value127 && (value105 = true),
        (value121.group.visible = value127),
        (value102 ||= value121.enabled));
    }
    value105 && fn9();
  }
  function fn14(arg62) {
    if (value101 || !value102) return false;
    const value128 = value103?.matches === true;
    let value129 = false,
      value130 = false;
    for (const value131 of map3.values()) {
      const value132 = value131.enabled && fn11(value131.model);
      if (
        (value131.group.visible !== value132 &&
          ((value131.group.visible = value132), (value129 = true)),
        !!value132)
      ) {
        ((value130 ||= !value128),
          value131.model.updateWorldMatrix(true, false),
          value131.group.matrix.equals(value131.model.matrixWorld) ||
            (value131.group.matrix.copy(value131.model.matrixWorld),
            (value131.group.matrixWorldNeedsUpdate = true),
            (value129 = true)));
        for (let value133 = 0; value133 < value131.rings.length; value133++) {
          const value134 = value128 ? 0.35 : (arg62 / 2400 + value133 / 3) % 1,
            value135 = value131.radius * (1.05 + value134 * 20) * value131.scale,
            value136 = value131.rings[value133],
            value137 = !value128 || value133 === 0,
            value138 = value131.opacity * Math.pow(1 - value134, 0.7),
            value139 = value135 * value131.depthRatio;
          ((value136.visible !== value137 ||
            value136.scale.x !== value135 ||
            value136.scale.z !== value139 ||
            value136.material.opacity !== value138) &&
            (value129 = true),
            (value136.visible = value137),
            value136.scale.set(value135, 1, value139),
            (value136.material.opacity = value138));
        }
      }
    }
    return (value129 && fn9(), value130);
  }
  return {
    sync: fn13,
    tick: fn14,
    dispose() {
      if (!value101) {
        ((value101 = true), value103?.removeEventListener?.("change", fn10));
        for (const value140 of map3.values()) fn12(value140);
        (map3.clear(), value98.dispose());
      }
    },
  };
}
