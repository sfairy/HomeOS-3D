const {
    normalizeCurtainTrack: H,
    createCurtainTrack: ct,
    createTrackClothGeometry: dt,
    poseTrackCloth: pt,
    curtainPanelRanges: mt,
    createDreamBladeGeometry: ht,
    poseDreamBlades: gt,
    createRollerCurtain: ft,
  } = await (import.meta.url.startsWith("file:")
    ? import(
        new URL(
          "../../static/3d-studio/studio-curtain-track.js?v=20260926-dream-depth-v1",
          import.meta.url,
        )
      )
    : import(
        new URL(
          "../../../../bridge-static/3d-studio/studio-curtain-track.js?v=20260926-dream-depth-v1",
          import.meta.url,
        )
      )),
  it = new Set(["left", "right", "split"]),
  E = new Set(["cloth", "band"]),
  yt = new Set(["rod", "cap", ...E]),
  et = 1000 / 30,
  vt = 420,
  Mt = 0.12,
  bt = 0.15,
  Y = (arg1) => (arg1.curtainFabric === "sheer" ? "sheer" : "cloth"),
  tt = (arg2) =>
    !arg2.entityId && Number.isFinite(arg2.unboundPosition)
      ? Math.max(0, Math.min(100, arg2.unboundPosition))
      : 0,
  nt = (arg3) =>
    Math.max(
      4,
      Math.min(
        96,
        Math.round(
          (Number(arg3.curtainWidth) || 1.8) /
            (Z(arg3) === "split" ? 2 : 1) /
            (Y(arg3) === "sheer" ? 0.1 : bt),
        ),
      ),
    ),
  rt = (arg4, arg5) => JSON.stringify([String(arg4 ?? ""), String(arg5 ?? "")]),
  Z = (arg6) =>
    it.has(arg6.coverDirection)
      ? arg6.coverDirection
      : it.has(arg6.curtainPosition)
        ? arg6.curtainPosition
        : "split",
  st = (arg7) =>
    typeof arg7?.position == "number" && Number.isFinite(arg7.position)
      ? Math.max(0, Math.min(100, arg7.position))
      : null,
  q = (arg8) =>
    Array.isArray(arg8.userData?.curtainRigBasis) &&
    arg8.userData.curtainRigBasis.length === 3 &&
    arg8.userData.curtainRigBasis.every(
      (arg9) => typeof arg9 == "number" && Number.isFinite(arg9) && arg9 > 0,
    )
      ? [...arg8.userData.curtainRigBasis]
      : [1.8, 2.4, 0.18];
function St(arg10, arg11, arg12) {
  const value1 = arg12 === "sheer",
    value2 = Math.max(64, arg11 * 6),
    value3 = 2.28168,
    value4 = value1 ? 0.023 : 0.046,
    value5 = 0.003,
    list1 = [],
    list2 = [],
    list3 = [],
    list4 = [],
    list5 = [],
    fn1 = (arg13) => value4 * Math.sin(arg13 * arg11 * Math.PI * 2),
    fn2 = (arg14) => value4 * arg11 * Math.PI * 2 * Math.cos(arg14 * arg11 * Math.PI * 2),
    fn3 = (arg15, arg16, arg17, arg18, arg19, arg20, arg21, arg22) => {
      (list1.push(arg15, arg16, arg17), list2.push(arg18, arg19, arg20), list3.push(arg21, arg22));
      const value7 = 0.5 - 0.5 * Math.sin(arg15 * arg11 * Math.PI * 2),
        value8 = 1 - (value1 ? 0.16 : 0.34) * value7 * value7;
      list4.push(value8, value8, value8);
    };
  for (const value9 of value1 ? ["front"] : ["front", "back", "top", "bottom"]) {
    const value10 = list1.length / 3;
    for (let value11 = 0; value11 <= value2; value11++) {
      const value12 = value11 / value2,
        value13 = fn1(value12),
        value14 = fn2(value12),
        value15 = Math.hypot(value14, 1);
      if (value9 === "front" || value9 === "back") {
        const value16 = value9 === "front" ? 1 : -1;
        for (const value17 of [0, value3])
          fn3(
            value12,
            value17,
            value13 + (value16 * value5) / 2,
            (-value16 * value14) / value15,
            0,
            value16 / value15,
            value12,
            value17 / value3,
          );
      } else {
        const value18 = value9 === "top" ? 1 : -1;
        for (const value19 of [-value5 / 2, value5 / 2])
          fn3(
            value12,
            value18 > 0 ? value3 : 0,
            value13 + value19,
            0,
            value18,
            0,
            value12,
            value19 > 0 ? 1 : 0,
          );
      }
      if (value11 < value2) {
        const value20 = value10 + value11 * 2;
        value9 === "front" || value9 === "bottom"
          ? list5.push(value20, value20 + 2, value20 + 1, value20 + 1, value20 + 2, value20 + 3)
          : list5.push(value20, value20 + 1, value20 + 2, value20 + 1, value20 + 3, value20 + 2);
      }
    }
  }
  for (const value21 of value1 ? [] : [0, 1]) {
    const value22 = list1.length / 3,
      value23 = value21 === 0 ? -1 : 1;
    for (const value24 of [0, value3])
      for (const value25 of [-value5 / 2, value5 / 2])
        fn3(
          value21,
          value24,
          fn1(value21) + value25,
          value23,
          0,
          0,
          value25 > 0 ? 1 : 0,
          value24 / value3,
        );
    value23 > 0
      ? list5.push(value22, value22 + 2, value22 + 1, value22 + 1, value22 + 2, value22 + 3)
      : list5.push(value22, value22 + 1, value22 + 2, value22 + 1, value22 + 3, value22 + 2);
  }
  const value6 = new arg10.BufferGeometry();
  return (
    value6.setAttribute("position", new arg10.Float32BufferAttribute(list1, 3)),
    value6.setAttribute("normal", new arg10.Float32BufferAttribute(list2, 3)),
    value6.setAttribute("uv", new arg10.Float32BufferAttribute(list3, 2)),
    value6.setAttribute("color", new arg10.Float32BufferAttribute(list4, 3)),
    value6.setIndex(list5),
    value6.computeBoundingBox(),
    value6.computeBoundingSphere(),
    value6
  );
}
function ot(arg23, arg24) {
  for (let value26 = arg23; value26; value26 = value26.parent) if (value26 === arg24) return true;
  return false;
}
function It(arg25) {
  const list6 = [],
    list7 = [];
  function fn4(arg26) {
    if (
      !(arg26.userData?.curtainMotionRig || arg26.userData?.curtainMotionPanel) &&
      !(arg26 !== arg25 && arg26.userData?.environmentModelId != null)
    ) {
      (arg26.userData?.curtainRigRoot === true && list7.push(arg26),
        arg26.isMesh && yt.has(arg26.userData?.curtainPart) && list6.push(arg26));
      for (const value28 of arg26.children || []) fn4(value28);
    }
  }
  if ((fn4(arg25), !list6.some((arg27) => E.has(arg27.userData.curtainPart)))) return null;
  let value27 = list7.find((arg28) => list6.every((arg29) => ot(arg29, arg28)));
  if (!value27) {
    for (value27 = list6[0].parent; value27 && !list6.every((arg30) => ot(arg30, value27));)
      value27 = value27.parent;
  }
  return value27 && ot(value27, arg25)
    ? {
        anchor: value27,
        parts: list6,
      }
    : null;
}
export function createCurtainMotion({ THREE: arg31, requestRender: arg32 = () => {} } = {}) {
  let value29 = null,
    value30,
    text1 = "",
    value31 = false;
  const map1 = new Map();
  function fn5(arg33, arg34) {
    const value36 = arg34 + ":" + arg33;
    return (map1.has(value36) || map1.set(value36, St(arg31, arg33, arg34)), map1.get(value36));
  }
  let map2 = new Map(),
    map3 = new Map(),
    value32 = -Infinity,
    value33 = true,
    text2 = "",
    map4 = new Map(),
    value34 = 1,
    value35 = true,
    text3 = "";
  function fn6() {
    ((value33 = true), arg32());
  }
  function fn7(arg35, arg36, arg37) {
    const value37 = arg36.coverKind === "roller",
      value38 = arg37.parts.filter(
        (arg38) =>
          value37 || arg37.anchor.userData.curtainRollerModel || E.has(arg38.userData.curtainPart),
      ),
      value39 = value38
        .filter((arg39) => arg39.userData.curtainPart === "cloth")
        .flatMap((arg40) => (Array.isArray(arg40.material) ? arg40.material : [arg40.material]))
        .filter(Boolean),
      fn19 = (arg41) => (arg41.color ? arg41.color.r + arg41.color.g + arg41.color.b : 0),
      value40 = value39.reduce(
        (arg42, arg43) => (!arg42 || fn19(arg43) > fn19(arg42) ? arg43 : arg42),
        null,
      ),
      value41 = Y(arg36),
      value42 = value41 === "sheer",
      value43 = value42
        ? new arg31.MeshStandardMaterial({
            color: 16118766,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
          })
        : value40?.clone?.() ||
          new arg31.MeshStandardMaterial({
            color: 13094354,
            roughness: 0.94,
            metalness: 0,
          });
    if (
      (value43.color?.lerp(new arg31.Color(16777215), 0.2),
      (value43.emissiveIntensity = Math.min(value43.emissiveIntensity ?? 0, 0.06)),
      (value43.vertexColors = true),
      (value43.side = arg31.DoubleSide),
      (value43.forceSinglePass = true),
      value37)
    ) {
      const value51 = q(arg37.anchor),
        value52 = ft(
          arg31,
          {
            width: value51[0],
            height: value51[1],
            curtainFabric: value41,
          },
          {
            material: value43,
          },
        ),
        value53 = value52.group;
      value53.userData.curtainMotionRig = true;
      for (const value54 of value52.meshes)
        Object.assign(value54.userData, {
          curtainMotionPanel: true,
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true,
          externalModelSharedTextures: true,
        });
      return (
        arg37.anchor.add(value53),
        {
          model: arg35,
          binding: arg36,
          roller: value52,
          fabric: value41,
          anchor: arg37.anchor,
          parts: arg37.parts,
          rig: value53,
          basis: value51,
          generation: value34++,
          panels: value52.meshes,
          material: value43,
          direction: Z(arg36),
          originals: new Map(value38.map((arg44) => [arg44, arg44.visible])),
          position: null,
          target: null,
          motionFrom: null,
          motionStart: null,
        }
      );
    }
    const value44 = arg36.coverKind === "dream",
      value45 = arg37.anchor.userData.curtainTrackModel || value44 ? ct(arg36) : null,
      value46 = nt(arg36),
      value47 = value45 ? null : fn5(value46, value41),
      value48 = new arg31.Group(),
      value49 = q(arg37.anchor);
    ((value48.name = "curtain-motion-" + arg36.id),
      (value48.userData.curtainMotionRig = true),
      value48.scale.set(
        ...(value45 ? [1, 1, 1] : [value49[0] / 1.8, value49[1] / 2.4, value49[2] / 0.18]),
      ),
      arg37.anchor.add(value48));
    const value50 = ["left", "right"].map((arg45) => {
      const value55 = new arg31.Mesh(
        value44
          ? ht(arg31, value45, value49[1])
          : value45
            ? dt(arg31, value45, value49[1], value41)
            : value47,
        value43,
      );
      return (
        (value55.name = "curtain-motion-" + arg36.id + "-" + arg45),
        (value55.userData.curtainMotionPanel = true),
        (value55.userData.curtainSide = arg45),
        (value55.userData.externalModelSharedGeometry = true),
        (value55.userData.externalModelSharedTextures = true),
        (value55.userData.externalModelSharedMaterial = true),
        value45 || value55.position.set(arg45 === "left" ? -0.9 : 0.9, 0.06, 0),
        (value55.castShadow = !value42 && value38.some((arg46) => arg46.castShadow)),
        (value55.receiveShadow = value38.some((arg47) => arg47.receiveShadow)),
        (value55.visible = false),
        value48.add(value55),
        value55
      );
    });
    return {
      model: arg35,
      binding: arg36,
      dream: value44,
      fabric: value41,
      folds: value46,
      track: value45,
      anchor: arg37.anchor,
      parts: arg37.parts,
      rig: value48,
      basis: value49,
      generation: value34++,
      panels: value50,
      material: value43,
      originals: new Map(value38.map((arg48) => [arg48, arg48.visible])),
      direction: Z(arg36),
      position: null,
      target: null,
      motionFrom: null,
      motionStart: null,
    };
  }
  function fn8(arg49) {
    for (const [value56, value57] of arg49.originals) value56.visible = value57;
    if (
      (arg49.rig.removeFromParent(),
      arg49.roller?.dispose({
        keepMaterial: true,
      }),
      arg49.track)
    ) {
      for (const value58 of arg49.panels) value58.geometry.dispose();
    }
    arg49.material.dispose();
  }
  function fn9(arg50) {
    ((arg50.position = null),
      (arg50.target = null),
      (arg50.motionFrom = null),
      (arg50.motionStart = null),
      (arg50.bladePosition = null),
      fn10(arg50));
  }
  function fn10(arg51) {
    const value59 = arg51.position ?? tt(arg51.binding);
    if (arg51.roller) {
      for (const value63 of arg51.originals.keys()) value63.visible = false;
      (arg51.roller.pose(value59), (value33 = true));
      return;
    }
    if (arg51.track) {
      for (const value65 of arg51.originals.keys()) value65.visible = false;
      const value64 = value59 + ":" + arg51.direction + ":" + (arg51.bladePosition ?? 50);
      if (arg51.geometryPose === value64) return;
      (mt(arg51.track, value59, arg51.direction).forEach((arg52, arg53) => {
        const value66 = arg51.panels[arg53];
        value66.visible = arg52.visible;
        const object1 = {
          ...arg52,
          side: arg53,
          split: arg51.direction === "split",
        };
        arg51.dream
          ? gt(value66.geometry, arg51.track, object1, arg51.bladePosition ?? 50)
          : pt(value66.geometry, arg51.track, object1);
      }),
        (arg51.geometryPose = value64),
        (value33 = true));
      return;
    }
    const value60 = arg51.direction === "split",
      value61 = value60 ? (arg51.fabric === "sheer" ? 0.9 : 0.906) : 1.8,
      value62 = 1 - ((1 - Mt) * value59) / 100;
    for (const value67 of arg51.originals.keys()) value67.visible = false;
    for (const value68 of arg51.panels) {
      const value69 = value68.userData.curtainSide === "left";
      ((value68.visible = value60 || arg51.direction === (value69 ? "left" : "right")),
        (value68.scale.x = (value69 ? 1 : -1) * value61 * value62),
        value68.updateMatrix());
    }
    value33 = true;
  }
  function fn11(arg54, arg55, arg56 = false) {
    const value70 = st(arg55),
      value71 = arg54.bladePosition !== arg55.bladePosition;
    if (
      ((arg54.bladePosition = arg55.bladePosition),
      value71 && arg54.dream && fn10(arg54),
      value70 === null)
    ) {
      const value72 = arg54.target !== arg54.position;
      return ((arg54.target = arg54.position), (arg54.motionStart = null), value72 || value71);
    }
    if (arg54.position === null || arg56) {
      const value73 = arg54.position !== value70 || arg54.target !== value70;
      return (
        (arg54.position = value70),
        (arg54.target = value70),
        (arg54.motionStart = null),
        value73 && fn10(arg54),
        value73 || value71
      );
    }
    return arg54.target === value70
      ? value71
      : ((arg54.target = value70),
        (arg54.motionFrom = arg54.position),
        (arg54.motionStart = null),
        true);
  }
  function fn12(arg57, arg58 = [], arg59) {
    if (value31) return;
    const set1 = new Set(),
      set2 = new Set(),
      value74 = (Array.isArray(arg58) ? arg58 : [])
        .filter((arg60) => {
          if (!arg60 || arg60.id == null || arg60.modelId == null) return false;
          const value78 = String(arg60.id),
            value79 = rt(arg60.floorId, arg60.modelId);
          return set1.has(value78) || set2.has(value79)
            ? false
            : (set1.add(value78), set2.add(value79), true);
        })
        .map((arg61) => ({
          id: String(arg61.id),
          entityId: String(arg61.entityId ?? ""),
          floorId: String(arg61.floorId ?? ""),
          modelId: String(arg61.modelId),
          curtainWidth: Number(arg61.curtainWidth) > 0 ? Number(arg61.curtainWidth) : 1.8,
          coverDirection: arg61.coverDirection || "auto",
          curtainPosition: arg61.curtainPosition || "split",
          coverKind: ["dream", "roller"].includes(arg61.coverKind) ? arg61.coverKind : "standard",
          ...H(arg61),
          curtainFabric: Y(arg61),
          unboundPosition: tt(arg61),
        })),
      value75 = JSON.stringify(value74);
    if (value29 === arg57 && value30 === arg59 && text1 === value75) return;
    const map5 = new Map(value74.map((arg62) => [arg62.id, arg62.entityId]));
    for (const value80 of map3.keys())
      (!map5.has(value80) || (map4.has(value80) && map4.get(value80) !== map5.get(value80))) &&
        map3.delete(value80);
    ((map4 = map5), (value29 = arg57 || null), (value30 = arg59), (text1 = value75));
    const map6 = new Map();
    value74.length &&
      value29?.traverse?.((arg63) => {
        if (
          arg63.userData?.environmentModelType !== "curtain" ||
          arg63.userData?.environmentModelId == null
        )
          return;
        let value81 = arg63.userData.environmentFloorId;
        for (let value82 = arg63.parent; value81 == null && value82; value82 = value82.parent)
          value81 = value82.userData?.environmentFloorId;
        map6.set(rt(value81, arg63.userData.environmentModelId), arg63);
      });
    const value76 = value74
        .map((arg64) => {
          const value83 = map6.get(rt(arg64.floorId, arg64.modelId)),
            value84 = value83 ? It(value83) : null;
          return value84
            ? {
                binding: arg64,
                model: value83,
                located: value84,
              }
            : null;
        })
        .filter(Boolean),
      map7 = new Map();
    for (const value85 of value76) {
      const value86 = map2.get(value85.binding.id);
      value86 &&
        value86.binding.coverKind === value85.binding.coverKind &&
        JSON.stringify(value86.basis) === JSON.stringify(q(value85.located.anchor)) &&
        (!value86.track ||
          JSON.stringify([H(value86.binding), value86.binding.curtainWidth]) ===
            JSON.stringify([H(value85.binding), value85.binding.curtainWidth])) &&
        value86.fabric === Y(value85.binding) &&
        value86.model === value85.model &&
        value86.anchor === value85.located.anchor &&
        value86.parts.length === value85.located.parts.length &&
        value86.parts.every((arg65, arg66) => arg65 === value85.located.parts[arg66]) &&
        map7.set(value85.binding.id, value86);
    }
    for (const [value87, value88] of map2) map7.has(value87) || fn8(value88);
    const value77 = map2;
    map2 = new Map();
    for (const { binding: value89, model: value90, located: value91 } of value76) {
      const value92 = map7.get(value89.id) || fn7(value90, value89, value91),
        value93 = value77.get(value89.id);
      if (
        value93 &&
        value93 !== value92 &&
        value93.model === value90 &&
        value93.binding.entityId === value89.entityId
      ) {
        for (const value96 of ["position", "target", "motionFrom", "motionStart", "bladePosition"])
          value92[value96] = value93[value96];
        fn10(value92);
      }
      const value94 = Z(value89);
      (value92.binding.entityId !== value89.entityId && fn9(value92), (value92.binding = value89));
      const value95 = nt(value89);
      if (!value92.track && !value92.roller && value92.folds !== value95) {
        value92.folds = value95;
        for (const value97 of value92.panels) value97.geometry = fn5(value95, value92.fabric);
      }
      ((value92.basis = q(value92.anchor)),
        value92.rig.scale.set(
          ...(value92.track || value92.roller
            ? [1, 1, 1]
            : [value92.basis[0] / 1.8, value92.basis[1] / 2.4, value92.basis[2] / 0.18]),
        ),
        value92.direction !== value94 && ((value92.direction = value94), fn10(value92)),
        map2.set(value89.id, value92),
        map3.has(value89.id) && fn11(value92, map3.get(value89.id)),
        value92.position === null && fn10(value92));
    }
    ((value35 = true), fn6());
  }
  function fn13(arg67, arg68, { immediate: arg69 = false } = {}) {
    if (value31 || arg67 == null) return;
    const value98 = String(arg67),
      object2 = {
        position: st(arg68),
        bladePosition: Number.isFinite(arg68?.tiltPosition) ? arg68.tiltPosition : null,
      };
    map3.set(value98, object2);
    const value99 = map2.get(value98);
    value99 && fn11(value99, object2, arg69) && fn6();
  }
  function fn14() {
    return (
      !value31 &&
      [...map2.values()].some((arg70) => arg70.position !== null && arg70.target !== arg70.position)
    );
  }
  function fn15(arg71) {
    if (
      !fn14() ||
      (Number.isFinite(arg71) || (arg71 = globalThis.performance?.now() ?? Date.now()),
      arg71 >= value32 && arg71 - value32 < et)
    )
      return false;
    value32 =
      Number.isFinite(value32) && arg71 >= value32 ? arg71 - ((arg71 - value32) % et) : arg71;
    let value100 = false;
    for (const value101 of map2.values()) {
      if (value101.position === null || value101.target === value101.position) continue;
      (value101.motionStart === null || arg71 < value101.motionStart) &&
        (value101.motionStart = arg71);
      const value102 = Math.min(1, (arg71 - value101.motionStart) / vt),
        value103 = value102 * value102 * (3 - 2 * value102),
        value104 =
          value102 === 1
            ? value101.target
            : value101.motionFrom + (value101.target - value101.motionFrom) * value103;
      value104 !== value101.position &&
        ((value101.position = value104), fn10(value101), (value100 = true));
    }
    return value100;
  }
  function fn16() {
    return (
      value33 &&
        ((text2 = JSON.stringify(
          [...map2.values()]
            .map((arg72) => [
              arg72.binding.id,
              arg72.binding.floorId,
              arg72.binding.modelId,
              arg72.binding.entityId,
              arg72.generation,
              arg72.direction,
              arg72.basis,
              arg72.folds,
              arg72.bladePosition,
              arg72.position === null
                ? "preview-" + tt(arg72.binding)
                : Math.round(arg72.position * 100) / 100,
            ])
            .sort((arg73, arg74) => arg73[0].localeCompare(arg74[0])),
        )),
        (value33 = false)),
      text2
    );
  }
  function fn17() {
    return (
      value35 &&
        ((text3 = JSON.stringify(
          [...map2.values()]
            .map((arg75) => [
              arg75.binding.id,
              arg75.binding.floorId,
              arg75.binding.modelId,
              arg75.generation,
              arg75.direction,
              arg75.basis,
              arg75.folds,
            ])
            .sort((arg76, arg77) => arg76[0].localeCompare(arg77[0])),
        )),
        (value35 = false)),
      text3
    );
  }
  function fn18() {
    if (!value31) {
      value31 = true;
      for (const value105 of map2.values()) fn8(value105);
      (map2.clear(), map3.clear(), map4.clear());
      for (const value106 of map1.values()) value106.dispose();
      (map1.clear(), (value29 = null), (value33 = true), (value35 = true), arg32());
    }
  }
  return {
    setBindings: fn12,
    setState: fn13,
    update: fn15,
    isMoving: fn14,
    poseKey: fn16,
    structureKey: fn17,
    dispose: fn18,
  };
}
