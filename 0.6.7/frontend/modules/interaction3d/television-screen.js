const { drawTelevisionGlass: T } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../static/3d-studio/studio-television-glass.js?v=20260916-warm-v1",
        import.meta.url,
      )
    )
  : import(
      new URL(
        "../../../../bridge-static/3d-studio/studio-television-glass.js?v=20260916-warm-v1",
        import.meta.url,
      )
    ));
import { televisionState } from "./television-state.js?v=20260914-tv-power-poster-v1";
function j(arg1, arg2, arg3) {
  (arg2.save(),
    (arg2.fillStyle = "#07111d"),
    arg2.fillRect(0, 0, arg1.width, arg1.height),
    (arg2.fillStyle = "#f4f8fb"),
    (arg2.font = "500 26px sans-serif"),
    (arg2.textAlign = "center"),
    (arg2.textBaseline = "middle"));
  const value1 = arg3.playing
    ? "正在播放中"
    : !arg3.idle && arg3.state === "paused"
      ? "已暂停"
      : !arg3.idle && arg3.state === "buffering"
        ? "正在缓冲"
        : "暂未播放";
  (arg2.fillText(value1, arg1.width / 2, arg1.height / 2), arg2.restore());
}
export function createTelevisionScreens({ THREE: arg4, requestFrame: arg5 = () => {} }) {
  let value2,
    value3,
    map1 = new Map(),
    map2 = new Map(),
    value4 = false;
  const fn1 = (arg6) => JSON.stringify([arg6.floorId, arg6.modelId]);
  function fn2(arg7) {
    if (!arg7.removed) {
      ((arg7.removed = true),
        arg7.screen.geometry.removeEventListener("dispose", arg7.onGeometryDispose),
        arg7.generation++,
        arg7.screen.material === arg7.materials && (arg7.screen.material = arg7.original));
      for (const [value5, value6] of arg7.glows) value5.visible = value6;
      (arg7.texture.dispose(), arg7.material.dispose());
    }
  }
  function fn3(arg8) {
    if (value4) return;
    const { canvas: value7, context: value8, state: value9, image: value10 } = arg8;
    if (
      ((value8.fillStyle = "#050609"),
      value9.on
        ? value8.fillRect(0, 0, value7.width, value7.height)
        : T(value7, value8, arg8.screen.userData?.sceneStyle === "warm-wood"),
      value9.on && value10)
    ) {
      const value11 = Math.min(
          value7.width / value10.naturalWidth,
          value7.height / value10.naturalHeight,
        ),
        value12 = value10.naturalWidth * value11,
        value13 = value10.naturalHeight * value11;
      value8.drawImage(
        value10,
        (value7.width - value12) / 2,
        (value7.height - value13) / 2,
        value12,
        value13,
      );
    } else value9.on && j(value7, value8, value9);
    ((arg8.texture.needsUpdate = true), arg5([arg8.floorId]));
  }
  return {
    sync({
      root: arg9,
      revision: arg10,
      bindings: arg11 = [],
      states: arg12 = {},
      focusedModel: arg13 = "",
      dimStrength: arg14 = 70,
    }) {
      if (value4) return;
      (value2 !== arg9 || value3 !== arg10) &&
        ((value2 = arg9),
        (value3 = arg10),
        (map2 = new Map()),
        value2?.traverse((arg15) => {
          arg15.userData?.environmentModelType === "tv" &&
            map2.set(
              JSON.stringify([
                arg15.userData.environmentFloorId,
                arg15.userData.environmentModelId,
              ]),
              arg15,
            );
        }));
      const set1 = new Set(),
        map3 = new Map();
      for (const [value14, value15] of map2)
        map3.set(value14, {
          floorId: value15.userData.environmentFloorId,
          modelId: value15.userData.environmentModelId,
        });
      for (const [value16, value17] of map1)
        map3.has(value16) ||
          map3.set(value16, {
            floorId: value17.floorId,
            modelId: value17.modelId,
          });
      for (const value18 of arg11) value18.visible !== false && map3.set(fn1(value18), value18);
      for (const value19 of map3.values()) {
        const value20 = fn1(value19),
          value21 = map2.get(value20);
        if ((set1.add(value20), !value21)) continue;
        let value22;
        if (
          (value21.traverse((arg16) => {
            arg16.userData?.televisionScreen && (value22 = arg16);
          }),
          !value22)
        )
          continue;
        set1.add(value20);
        let value23 = map1.get(value20);
        if (
          (value23 &&
            value23.screen !== value22 &&
            (fn2(value23), map1.delete(value20), (value23 = null)),
          !value23)
        ) {
          const value27 = document.createElement("canvas");
          ((value27.width = 512), (value27.height = 288));
          const value28 = value27.getContext("2d");
          if (!value28) continue;
          const value29 = new arg4.CanvasTexture(value27);
          value29.colorSpace = arg4.SRGBColorSpace;
          const value30 = new arg4.MeshBasicMaterial({
              map: value29,
              toneMapped: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
            value31 = value22.material,
            value32 = Array.from(
              {
                length: 6,
              },
              (arg17, arg18) =>
                arg18 === 4 ? value30 : Array.isArray(value31) ? value31[arg18] : value31,
            ),
            list1 = [];
          (value21.traverse((arg19) => {
            arg19.userData?.televisionGlow &&
              (list1.push([arg19, arg19.visible]), (arg19.visible = false));
          }),
            (value23 = {
              floorId: value19.floorId,
              modelId: value19.modelId,
              screen: value22,
              original: value31,
              materials: value32,
              material: value30,
              canvas: value27,
              context: value28,
              texture: value29,
              glows: list1,
              generation: 0,
              artwork: "",
              signature: "",
              image: null,
            }));
          const value33 = value23;
          ((value23.onGeometryDispose = () => {
            (fn2(value33), map1.get(value20) === value33 && map1.delete(value20));
          }),
            value22.geometry.addEventListener("dispose", value23.onGeometryDispose),
            (value22.material = value32),
            map1.set(value20, value23));
        }
        const value24 = televisionState(value19, arg12),
          value25 = JSON.stringify([
            value24.on,
            value24.status,
            value24.title,
            value24.app,
            value24.name,
            value24.artwork,
          ]);
        value23.state = value24;
        const value26 = arg13 && arg13 !== value20 ? Math.max(0.1, 1 - arg14 / 100) : 1;
        if (
          (value23.material.color.r !== value26 &&
            (value23.material.color.setRGB(value26, value26, value26), arg5([value23.floorId])),
          value23.signature !== value25)
        ) {
          if (((value23.signature = value25), value23.artwork !== value24.artwork)) {
            ((value23.artwork = value24.artwork), (value23.image = null));
            const value34 = ++value23.generation;
            if (value24.artwork) {
              const image1 = new Image();
              ((image1.onload = () => {
                !value4 &&
                  value34 === value23.generation &&
                  map1.get(value20) === value23 &&
                  ((value23.image = image1), fn3(value23));
              }),
                (image1.onerror = () => {
                  !value4 &&
                    value34 === value23.generation &&
                    map1.get(value20) === value23 &&
                    ((value23.image = null), fn3(value23));
                }),
                (image1.src = value24.artwork));
            }
          }
          fn3(value23);
        }
      }
      for (const [value35, value36] of map1)
        set1.has(value35) || (fn2(value36), map1.delete(value35), arg5([value36.floorId]));
    },
    dispose() {
      value4 = true;
      for (const value37 of map1.values()) fn2(value37);
      (map1.clear(), map2.clear(), (value2 = null));
    },
  };
}
