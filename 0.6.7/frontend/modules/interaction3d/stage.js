import { bathHeaterState as bathHeaterState2 } from "./bath-heater.js";
import { purifierState as purifierState2 } from "./purifier-state.js";
import { createAirerMotion as createAirerMotion2 } from "./airer-motion.js?v=20260926-airer-v3-model-emphasis-v1";
import { createFanMotion as createFanMotion2 } from "./fan-motion.js?v=20260926-fan-v1";
import { carState as carState2 } from "./car-state.js";
import { updateCarCard as updateCarCard2 } from "./car-card.js";
import { createCarCharging as createCarCharging2 } from "./car-charging.js?v=20260926-vehicles-v3";
import { speakerState as speakerState2 } from "./speaker-state.js?v=20260926-speaker-v1";
import { createSpeakerPanel as createSpeakerPanel2 } from "./speaker-panel.js?v=20260926-speaker-clean-v6";
import { createSpeakerRings as createSpeakerRings2 } from "./speaker-ring.js?v=20260929-animation-work-v1";
const [
  { backgroundOpacity: po },
  { withPageAppearancePreset: as },
  { withRegionLightingPreset: vo },
  { withFixedLightEffects: cs },
  {
    temperatureHumidityReading: ar,
    temperatureHumidityEntities: ls,
    ENVIRONMENT_METRICS: cr,
    layoutEnvironmentReadings: ds,
  },
  { popupPlacement: us },
  { createMarkerTouch: ms, nearestMarkerTarget: fs },
] = await Promise.all([
  import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/label-appearance.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/label-appearance.js",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(
        new URL("../../static/modules/interaction3d/page-appearance-presets.js", import.meta.url)
      )
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/page-appearance-presets.js?v=20260918-page-presets-v3-review-1234",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(
        new URL("../../static/modules/interaction3d/region-lighting-presets.js", import.meta.url)
      )
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/region-lighting-presets.js?v=20260918-region-presets-v2-review-1234",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/light-effect-policy.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/light-effect-policy.js?v=20260918-fixed-effects-v2-review-1234",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/temperature-humidity.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/temperature-humidity.js?v=20260925-environment-label-v1",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(
        new URL(
          "../../static/modules/interaction3d/popup-placement.js?v=20260925-canvas-scale-v2",
          import.meta.url,
        )
      )
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/popup-placement.js?v=20260925-canvas-scale-v2",
          import.meta.url,
        )
      ),
  import.meta.url.startsWith("file:")
    ? import(new URL("../../static/modules/interaction3d/marker-input.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/modules/interaction3d/marker-input.js?v=20260925-touch-v2",
          import.meta.url,
        )
      ),
]);
import {
  createPresenceScene as createPresenceScene2,
  createPresenceWaves as createPresenceWaves2,
} from "./presence-scene.js?v=20260929-animation-work-v1";
import { createLockPanel as createLockPanel2 } from "./lock-panel.js?v=20260923-stage-cache-v1";
import { createLockMotion as createLockMotion2 } from "./lock-motion.js?v=20260929-animation-work-v1";
import {
  doorModels as doorModels2,
  lockState as lockState2,
} from "./lock-state.js?v=20260924-all-doors-v1";
import { createSceneBackground as createSceneBackground2 } from "./scene-background.js?v=20260927-background-uniform-reuse-v1-20260927-yard-anchor-v1-20260918-warm-v9-flat-stars-20260918-review-1234-v2-warm-outside-floor-scope-v1-background-cache-v1";
import { floorNavigationChoices as floorNavigationChoices2 } from "./floor-navigation.js?v=20260910-motion-quality-revert-v18";
import {
  createVacuumMotion as createVacuumMotion2,
  vacuumQuip as vacuumQuip2,
  createVacuumFollowCamera as createVacuumFollowCamera2,
  vacuumBirdCamera as vacuumBirdCamera2,
  vacuumFollowPose as vacuumFollowPose2,
} from "./vacuum-motion.js?v=20260925-vacuum-state-v2";
import {
  createVacuumMaps as createVacuumMaps2,
  vacuumStatusPresentation as vacuumStatusPresentation2,
  vacuumBindingsForMap as vacuumBindingsForMap2,
} from "./vacuum-map.js?v=20260925-vacuum-state-v2-reload-diagnostics-v2";
import {
  televisionState as televisionState2,
  televisionPower as televisionPower2,
} from "./television-state.js?v=20260914-tv-power-poster-v1";
import { createTelevisionPanel as createTelevisionPanel2 } from "./television-panel.js?v=20260914-tv-power-poster-v1";
import { createTelevisionScreens as createTelevisionScreens2 } from "./television-screen.js?v=20260926-tv-runtime-status-v1";
import { createDevicePanel as createDevicePanel2 } from "./device-panel.js?v=20260923-stage-cache-v1";
import { deviceStatus as deviceStatus2 } from "./device-status.js?v=20260923-stage-cache-v1";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
  genericDeviceMetadata as genericDeviceMetadata2,
} from "./device-profiles.js?v=20260923-stage-cache-v1-vehicles-v3";
import { createNasPanel as createNasPanel2 } from "./nas-panel.js?v=20260923-stage-cache-v1";
import {
  createNasStatus as createNasStatus2,
  nasDeviceState as nasDeviceState2,
} from "./nas-status.js?v=20260929-animation-work-v1";
import {
  createCameraStatus as createCameraStatus2,
  cameraOnline as cameraOnline2,
} from "./camera-status.js?v=20260923-stage-cache-v1";
import {
  coverState as coverState2,
  coverControl as coverControl2,
  coverIconIsOn as coverIconIsOn2,
  coverCanAdjustBlades as coverCanAdjustBlades2,
} from "./cover-state.js?v=20260914-cover-live-drag-v6-airer-icon-v1";
import { createCoverFeedback as createCoverFeedback2 } from "./cover-feedback.js?v=20260925-dream-sequence-v1";
import { createCoverPanel as createCoverPanel2 } from "./cover-panel.js?v=20260925-cover-axis-v1-20260926-airer-v3";
import { createCoverGroupPanel as createCoverGroupPanel2 } from "./cover-group-panel.js?v=20260925-cover-axis-v1";
import {
  validCurtainGroups as validCurtainGroups2,
  curtainGroupEntryId as curtainGroupEntryId2,
} from "./cover-groups.js?v=20260920-curtain-group-v1";
import { createCurtainMotion as createCurtainMotion2 } from "./curtain-motion.js?v=20260922-roller-v1-pose-reuse-v1";
import { createEnvironmentAirflow as createEnvironmentAirflow2 } from "./environment-airflow.js?v=20260929-animation-work-v1";
import { createScreenOutlines as createScreenOutlines2 } from "./environment-halos.js?v=20260925-heater-outline-v1-20260926-speaker-v1-20260926-fan-v1-model-emphasis-v1-airer-no-halo-v1-hidden-pulse-v1";
import { mountRegionRangeEditor as mountRegionRangeEditor2 } from "./light-range-editor.js?v=20260912-height-preview-v2";
import {
  climateState as climateState2,
  createClimateModeHistory as createClimateModeHistory2,
} from "./climate-state.js?v=20260926-climate-capabilities-v1";
import { createClimatePanel as createClimatePanel2 } from "./climate-panel.js?v=20260926-climate-capabilities-v1";
import {
  createEnvironmentScene as createEnvironmentScene2,
  pageDimming as pageDimming2,
  pageModelBindings as pageModelBindings2,
} from "./environment-scene.js?v=20260929-neutral-preparation-v1-vehicles-v3-20260925-tv-bound-only-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v3-model-emphasis-v1-airer-no-halo-v1-wall-top-v1";
import { startSceneSync as startSceneSync2 } from "./scene-sync.js?v=20260907-scene-sync-v1";
import {
  createStateUpdatePlan as createStateUpdatePlan2,
  lightBindingsForUpdate as lightBindingsForUpdate2,
} from "./state-update-plan.js?v=20260929-light-patch-v1-20260926-runtime-load-v1";
import {
  createLightColorPicker as createLightColorPicker2,
  createLightModeMenu as createLightModeMenu2,
} from "./light-color-picker.js?v=20260925-light-menu-v2";
import {
  hsToRgbColor as hsToRgbColor2,
  lightCommand as lightCommand2,
  createLightPreview as createLightPreview2,
  createLightStateCache as createLightStateCache2,
  lightRenderState as lightRenderState2,
} from "./light-state.js?v=20260925-rgb-standard-v2";
import {
  createDampedCameraMotion as createDampedCameraMotion2,
  automaticLightCamera as automaticLightCamera2,
  automaticAirConditionerCamera as automaticAirConditionerCamera2,
} from "./camera-motion.js?v=20260928-courtyard-no-reflection-early-settle-v1-20260925-focus-soft-start-v1";
import {
  resolvePageBehavior as resolvePageBehavior2,
  createIdleRotation as createIdleRotation2,
  createIdleIconVisibility as createIdleIconVisibility2,
  createIdleFocusExit as createIdleFocusExit2,
} from "./idle-rotation.js?v=20260907-idle-focus-exit-v1-20260909-page-behavior-airflow-zoom-v1-navigation-light-v2";
const sa =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7l-1 3H9l-1-3Z"/><path d="M9 21h6M9 15h6"/></svg>',
  Po = [
    {
      label: "柔和",
      brightness: 25,
      temperaturePercent: 10,
    },
    {
      label: "日常",
      brightness: 60,
      temperaturePercent: 50,
    },
    {
      label: "明亮",
      brightness: 100,
      temperaturePercent: 100,
    },
  ];
export function configuredModuleKinds(v1 = {}) {
  return [
    "light",
    ...(v1.environment?.airConditioners?.length ||
    v1.environment?.fans?.length ||
    v1.environment?.airPurifiers?.length ||
    v1.environment?.curtains?.length ||
    v1.environment?.temperatureHumidity?.length
      ? ["environment"]
      : []),
    ...(GENERIC_DEVICE_KINDS2.some(
      (arg1) => v1.devices?.[genericDeviceProfile2(arg1).collection]?.length,
    ) ||
    v1.environment?.airers?.length ||
    v1.environment?.waterHeaters?.length ||
    v1.devices?.nas?.length ||
    v1.devices?.speakers?.length ||
    v1.devices?.televisions?.length
      ? ["devices"]
      : []),
    ...(v1.devices?.vacuums?.length ? ["vacuum"] : []),
    ...(v1.security?.locks?.length ||
    v1.security?.cameras?.length ||
    v1.security?.presenceSensors?.length
      ? ["security"]
      : []),
  ];
}
export function mountStage(arg2) {
  const { THREE: v2, container: element, canvas: element2 } = arg2,
    uRLSearchParams = new URLSearchParams(location.search),
    v3 =
      "ha-bridge:i3d-ui-calibration:" +
      (uRLSearchParams.get("projectId") || "project") +
      ":" +
      (uRLSearchParams.get("sceneId") || "scene") +
      ":" +
      (uRLSearchParams.get("componentId") || "component");
  let value = null,
    value2 = null;
  const v4 = () => !!value,
    v5 = () => {};
  let options = {
      lights: [],
    },
    options2 = {},
    v6 = false,
    v7 = false,
    v8 = false,
    text = "",
    text2 = "",
    text3 = "",
    v9 = false,
    v10 = false,
    num = 0,
    value3 = null,
    value4 = null,
    v11 = false,
    num2 = 0,
    v12 = resolvePageBehavior2(),
    text4 = "light",
    text5 = "",
    text6 = "",
    text7 = "",
    text8 = "",
    v13 = false;
  const v14 = () => text4 === "overview" || (!v6 && text3 === "all"),
    v15 = (arg3) => text3 === "all" || arg3.floorId === text3;
  let text9 = "",
    value5 = null,
    value6 = null,
    num3 = 0,
    v16 = false,
    v17 = false,
    v18 = false,
    v19 = false,
    value7 = null,
    value8 = null,
    v20 = false,
    v21 = true,
    v22 = false,
    value9 = null,
    v23 = false,
    v24 = false,
    v25 = false;
  const v26 = () => value8?.wake(),
    v27 = () => value8?.wakeAnimation(),
    v28 = createSceneBackground2(arg2, v26),
    v29 = createLockMotion2(arg2);
  let value10 = null;
  arg2.setBackgroundTheme?.(v28);
  let v30 = false,
    v31 = false;
  const set = new Set(),
    set2 = new Set(),
    map = new Map(),
    map2 = new Map(),
    map3 = new Map(),
    v32 = new v2.Vector3();
  let v33,
    v34,
    value11 = null;
  const vector = createLightPreview2(),
    v35 = document.body?.dataset?.i3dLightHistoryScope;
  let v36;
  if (v35)
    try {
      v36 = window.localStorage;
    } catch {}
  const v37 = createLightStateCache2({
      storage: v36,
      scope: v35,
    }),
    v38 = createClimateModeHistory2({
      storage: v36,
      scope: v35,
    });
  function fn1(v39 = null) {
    if (!v6) {
      for (const v40 of options.environment?.airConditioners || [])
        (!v39 || v39.changed.has(v40.entityId)) &&
          v38.observe(v40.entityId, options2[v40.entityId]);
    }
  }
  const v41 = (arg4) => v37.resolve(arg4 || "", options2[arg4]);
  let value12 = null,
    options3 = {
      lights: [],
    },
    v42 = false,
    v43 = false,
    value13 = null,
    v44 = -Infinity;
  const v45 = (arg5, v46 = options.floorSelection, v47 = false) =>
      arg2.transformCamera?.(arg5, v46, v47) ?? arg5,
    v48 = () => v45(arg2.cameraState(true), options.floorSelection, true);
  function fn2(arg6) {
    const as2 = as(structuredClone(arg6));
    if (
      ((as2.camera = v45(as2.floorCameras?.[as2.floorSelection] || as2.camera, as2.floorSelection)),
      (as2.lights = (as2.lights || []).map((arg7) => ({
        ...arg7,
        ...(arg7.focusCamera
          ? {
              focusCamera: v45(arg7.focusCamera, as2.floorSelection),
            }
          : {}),
      }))),
      as2.security?.cameras &&
        (as2.security.cameras = (as2.security.cameras || []).map((arg8) => ({
          ...arg8,
          ...(arg8.focusCamera
            ? {
                focusCamera: v45(arg8.focusCamera, as2.floorSelection),
              }
            : {}),
        }))),
      as2.security?.presenceSensors &&
        (as2.security.presenceSensors = as2.security.presenceSensors.map((arg9) => ({
          ...arg9,
          ...(arg9.focusCamera
            ? {
                focusCamera: v45(arg9.focusCamera, as2.floorSelection),
              }
            : {}),
        }))),
      as2.environment)
    ) {
      for (const v49 of [
        "airConditioners",
        "airers",
        "fans",
        "airPurifiers",
        "waterHeaters",
        "curtains",
        "curtainGroups",
        "temperatureHumidity",
      ])
        as2.environment[v49] = (as2.environment[v49] || []).map((arg10) => ({
          ...arg10,
          ...(arg10.focusCamera
            ? {
                focusCamera: v45(arg10.focusCamera, as2.floorSelection),
              }
            : {}),
        }));
    }
    for (const v50 of [
      "nas",
      "speakers",
      "televisions",
      "vacuums",
      ...GENERIC_DEVICE_KINDS2.map((arg11) => genericDeviceProfile2(arg11).collection),
    ])
      as2.devices?.[v50] &&
        (as2.devices[v50] = as2.devices[v50].map((arg12) => ({
          ...arg12,
          ...(arg12.focusCamera
            ? {
                focusCamera: v45(arg12.focusCamera, as2.floorSelection),
              }
            : {}),
        })));
    if (as2.devices?.vacuums) {
      for (const v51 of as2.devices.vacuums)
        v51.followCamera && (v51.followCamera = v45(v51.followCamera, as2.floorSelection));
    }
    return as2;
  }
  const v52 = (arg13) =>
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          ...arg13,
        },
        location.origin,
      ),
    v53 = (arg14, arg15, arg16) => {
      const element3 = document.createElement(arg14);
      return (
        (element3.className = arg15 || ""),
        arg16 && (element3.textContent = arg16),
        element3
      );
    };
  let num4 = arg2.onStartupEffectsProgress ? 0 : 1;
  const element4 = v53("div", "i3d-markers"),
    v54 = v53("div", "i3d-vacuum-working-layer");
  let num5 = 0,
    text10 = "",
    v55 = false,
    num6 = 0,
    v56 = -1,
    text11 = "",
    value14 = null,
    value15 = null;
  const v57 = new v2.Quaternion();
  let value16 = null;
  const element5 = v53("div", "i3d-presentation");
  let value17 = null,
    value18 = null,
    num7 = 1;
  const element6 = v53("div", "i3d-focus-vignette");
  element6.setAttribute("aria-hidden", "true");
  const element7 = v53("nav", "i3d-toolbar"),
    element8 = v53("div", "i3d-navigation"),
    element9 = v53("nav", "i3d-floor-tabs");
  element9.setAttribute("aria-label", "选择楼层");
  let text12 = "";
  const element10 = v53("nav", "i3d-module-tabs");
  element10.setAttribute("aria-label", "3D 控制模块");
  let value19 = null,
    value20 = null;
  const map4 = new Map();
  let configuredModuleKinds2 = configuredModuleKinds(options);
  for (const [v58, v59] of [
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"],
  ]) {
    const element11 = v53("button", "", v59);
    ((element11.type = "button"),
      (element11.dataset.module = v58),
      element11.style.setProperty("--i3d-tab-index", String(map4.size)),
      element11.addEventListener("click", () => fn48(v58)),
      element10.append(element11),
      map4.set(v58, element11));
  }
  const element12 = v53("p", "i3d-module-empty");
  (element12.setAttribute("role", "status"), (element12.hidden = true));
  const element13 = v53("button", "", "恢复视角");
  ((element13.type = "button"), (element13.hidden = true), element7.append(element13));
  const element14 = v53("section", "i3d-light-panel");
  (element14.setAttribute("aria-label", "灯光控制"), element14.setAttribute("inert", ""));
  const element15 = v53("header"),
    v60 = v53("div", "i3d-light-heading-text"),
    element16 = v53("strong", "", "灯光"),
    element17 = v53("p", "i3d-device-status");
  v60.append(element16, element17);
  const element18 = v53("button", "i3d-power");
  element18.type = "button";
  const element19 = v53("span", "i3d-lamp-drawing");
  element19.setAttribute("aria-hidden", "true");
  const v61 = v53("span", "i3d-lamp-aura"),
    v62 = v53("span", "i3d-lamp-body");
  for (const v63 of ["cord", "shade", "bulb", "filament"]) v62.append(v53("i", "i3d-lamp-" + v63));
  (element19.append(v61, v62), element18.append(element19), element15.append(v60, element18));
  const v64 = createLightModeMenu2((arg17) => {
    const v65 = v236();
    if (!v65) return;
    const v66 = fn49(v65);
    (v67.cancel(),
      fn76(
        arg17,
        arg17 === "color"
          ? v66.colorHs || [0, 0]
          : arg17 === "temperature"
            ? v66.kelvin || v66.minimum
            : true,
      ));
  });
  v60.append(v64.root);
  const element20 = v53("div", "i3d-light-controls"),
    v67 = createLightColorPicker2({
      onPreview(arg18) {
        const v68 = v236();
        if (!v68 || v6 || !fn49(v68).available) return null;
        const set3 = vector.set(v68.entityId, "color", arg18);
        return (
          v26(),
          fn51({
            preview: true,
          }),
          fn71(fn49(v68)),
          set3
        );
      },
      onCommit: (arg19) => void fn76("color", arg19),
      onCancel(arg20, arg21) {
        (vector.reject(arg20, arg21),
          fn51({
            preview: true,
          }),
          fn72());
      },
    });
  element20.append(v67.root);
  function fn3(arg22, arg23, arg24, arg25) {
    const v69 = v53("label", "i3d-slider i3d-" + arg23),
      v70 = v53("span", "", arg22),
      v71 = v53("output"),
      element21 = v53("input");
    ((element21.name = "i3d-light-" + arg23),
      (element21.type = "range"),
      (element21.min = arg24),
      (element21.max = arg25),
      (element21.step = arg23 === "temperature" ? "10" : "1"),
      element21.setAttribute("aria-label", arg22));
    const v72 = v53("div", "i3d-slider-heading");
    v72.append(v70, v71);
    const v73 = v53("span", "i3d-slider-legend");
    return (
      v73.append(
        v53("small", "", arg23 === "temperature" ? "暖色" : "暗"),
        v53("small", "", arg23 === "temperature" ? "冷色" : "亮"),
      ),
      v69.append(v72, element21, v73),
      element21.addEventListener("input", () => {
        v71.value = "" + element21.value + (arg23 === "temperature" ? " K" : "%");
        const v74 = v236();
        !v74 ||
          v6 ||
          !fn49(v74).available ||
          (vector.set(v74.entityId, arg23, Number(element21.value)),
          v26(),
          fn72(),
          fn51({
            preview: true,
          }));
      }),
      element21.addEventListener("change", () => void fn76(arg23, Number(element21.value))),
      element20.append(v69),
      {
        root: v69,
        input: element21,
        value: v71,
      }
    );
  }
  const v75 = fn3("色温", "temperature", "2000", "6500"),
    v76 = fn3("亮度", "brightness", "1", "100"),
    element22 = v53("div", "i3d-light-presets");
  (element22.setAttribute("role", "group"), element22.setAttribute("aria-label", "灯光预设"));
  const map5 = Po.map((arg26) => {
    const element23 = v53("button", "i3d-light-preset");
    element23.type = "button";
    const v77 = v53("small", "", arg26.brightness + "%");
    return (
      element23.append(v53("strong", "", arg26.label), v77),
      element23.addEventListener("click", () => void fn76("preset", arg26)),
      element22.append(element23),
      {
        ...arg26,
        button: element23,
        detail: v77,
      }
    );
  });
  element20.append(element22);
  const element24 = v53("p", "i3d-control-error");
  element24.setAttribute("role", "status");
  const map6 = new Map(),
    v78 = (arg27, arg28, v79 = false) => ({
      ...arg27,
      bindingId: v79 ? arg28.id.slice(arg28.deviceKind.length + 1) : arg28.id,
      bindingFloorId: arg28.floorId,
      bindingModelId: arg28.modelId,
    }),
    v80 = createClimatePanel2({
      modeHistory: v38,
      onLayout: (arg29) => {
        v6 &&
          ["climate", "fan", "purifier", "water-heater"].includes(text4) &&
          v236() &&
          v52({
            type: "edit",
            action: "purifier-layout",
            id: v236().id,
            extraControls: arg29,
          });
      },
      onControl: (arg30, arg31) =>
        new Promise((arg32, arg33) => {
          const v81 = fn15().find(
              (arg34) =>
                arg31 &&
                (arg34.id === arg31.id || "climate:" + arg34.id === arg31.id) &&
                arg34.floorId === arg31.floorId &&
                arg34.modelId === arg31.modelId,
            ),
            text13 = v81?.pedestalFan
              ? "fan-extra"
              : v81?.waterHeater
                ? "water-heater-extra"
                : v81?.climateType === "bath-heater"
                  ? "climate-extra"
                  : v81?.airPurifier || v81?.entityId?.startsWith("fan.")
                    ? "purifier-extra"
                    : "climate-extra",
            v82 = arg30.deviceKind?.endsWith("-extra")
              ? arg30.deviceKind === text13 &&
                v81?.extraControls?.some((arg35) => arg35.entityId === arg30.entityId)
              : v81?.entityId === arg30.entityId &&
                !!v81?.pedestalFan == (arg30.deviceKind === "fan");
          if (
            !v8 ||
            v6 ||
            v9 ||
            !v82 ||
            !v15(v81 || {}) ||
            v81?.visible === false ||
            text4 !== (v81?.waterHeater ? "devices" : "environment") ||
            !v81?.modelId ||
            !v81.modelAvailable
          ) {
            arg33(new Error("当前设备不可控制。"));
            return;
          }
          const v83 = "climate-" + ++num,
            setTimeout2 = setTimeout(() => fn4(v83, "请求超时，请检查设备状态。"), 14000);
          (map6.set(v83, {
            resolve: arg32,
            reject: arg33,
            timeout: setTimeout2,
          }),
            v52({
              type: "control",
              requestId: v83,
              command:
                v81.climateType === "bath-heater"
                  ? v78(
                      {
                        ...arg30,
                        deviceKind: arg30.deviceKind?.endsWith("-extra")
                          ? "climate-extra"
                          : "bath-heater",
                      },
                      v81,
                    )
                  : arg30.deviceKind?.endsWith("-extra")
                    ? v78(arg30, v81)
                    : arg30,
            }));
        }),
    });
  function fn4(arg36, arg37) {
    const v84 = map6.get(arg36);
    v84 &&
      (clearTimeout(v84.timeout),
      map6.delete(arg36),
      arg37 ? v84.reject(new Error(arg37)) : v84.resolve());
  }
  const map7 = new Map(),
    v85 = (arg38) =>
      JSON.stringify([arg38.entityId, arg38.coverKind === "dream" ? "dream" : "rail"]),
    v86 = (arg39, arg40) =>
      fn17().find(
        (arg41) =>
          arg41.entityId === arg39 &&
          (!arg40?.id || arg41.id === arg40.id || "cover:" + arg41.id === arg40.id),
      );
  let v87;
  if (v35)
    try {
      v87 = window.sessionStorage;
    } catch {}
  const map8 = new Map(),
    v88 = createCoverFeedback2({
      commandPreview: true,
      storage: v87,
      scope: v35,
    }),
    v89 = createCoverFeedback2({
      commandPreview: true,
      travelTime: 2400,
    });
  function fn5() {
    for (const [v90, v91] of map7) {
      const v92 = v88.read(v90),
        v93 = v89.read(v90);
      if (!v92?.available || !v93?.available) {
        map7.delete(v90);
        continue;
      }
      if (v92.positionReported && v92.raw.attributes.current_position !== v91.reported) {
        map7.delete(v90);
        continue;
      }
      Math.abs((v93.position ?? -100) - 50) > 0.01 ||
        (map7.delete(v90), v88.startPreview(v90, v91.requestId));
    }
  }
  const v94 = () => Math.min(v88.nextDelay(), v89.nextDelay());
  function fn6(arg42, v95 = coverState2(arg42.entityId, options2[arg42.entityId], arg42)) {
    if (arg42.airer) return v145.read(arg42, v95);
    const v96 = v88.read(v85(arg42), v95);
    if (arg42.coverKind !== "dream") return v96;
    const v97 = v89.read(v85(arg42)),
      v98 = map7.has(v85(arg42));
    return {
      ...v96,
      ...(v98
        ? {
            state: "opening",
            opening: true,
            closing: false,
            moving: true,
            closedConfirmed: false,
          }
        : {}),
      tiltPosition: v97?.position ?? v95.tiltPosition,
      tiltTarget: v97?.targetPosition ?? null,
      error: v97?.error || v96?.error || "",
    };
  }
  const options4 = {
      onPreview: (arg43, arg44, arg45) => {
        const v99 = v86(arg43, arg45);
        if (!v99) return;
        if (v99.airer) return fn6(v99);
        const v100 = v85(v99);
        return (
          (arg44 !== null &&
            v99?.coverKind === "dream" &&
            !coverCanAdjustBlades2(
              coverState2(v99.entityId, options2[v99.entityId], v99),
              fn6(v99),
            )) ||
            (arg44 === null
              ? (v89.preview(v100, null), v88.preview(v100, null))
              : (v99.coverKind === "dream" ? v89 : v88).preview(v100, arg44),
            fn9(),
            v26()),
          fn6(v99)
        );
      },
      onControl: (arg46, arg47) =>
        new Promise((arg48, arg49) => {
          const v101 = v86(arg46.entityId, arg47);
          if (
            !v8 ||
            v6 ||
            v9 ||
            text4 !== (v101?.airer ? "devices" : "environment") ||
            !v101?.modelId ||
            !v101.modelAvailable ||
            !v15(v101)
          ) {
            arg49(new Error(v101?.airer ? "当前晾衣架不可控制。" : "当前窗帘不可控制。"));
            return;
          }
          if (v101.airer) {
            const v102 = "airer-" + ++num,
              setTimeout3 = setTimeout(() => fn8(v102, "请求超时，请检查设备状态。"), 14000);
            (map9.set(v102, {
              resolve: arg48,
              reject: arg49,
              timeout: setTimeout3,
            }),
              v52({
                type: "control",
                requestId: v102,
                command: {
                  ...arg46,
                  deviceKind: "airer",
                },
              }));
            return;
          }
          const v103 = v85(v101),
            options5 = {
              ...arg46,
              entityId: v103,
            },
            v104 = "cover-" + ++num,
            setTimeout4 = setTimeout(() => fn7(v104, "请求超时，请检查设备状态。"), 14000);
          fn10();
          const includes =
            v101.coverKind === "dream" &&
            ["set_cover_position", "set_cover_tilt_position"].includes(arg46.service);
          if (
            includes &&
            !coverCanAdjustBlades2(
              coverState2(v101.entityId, options2[v101.entityId], v101),
              fn6(v101),
            )
          ) {
            (clearTimeout(setTimeout4),
              arg49(new Error("只有确认整体完全关闭且停止后，才能调整叶片。")));
            return;
          }
          let v105 = false;
          if (!includes && v101.coverKind === "dream") {
            map7.delete(v103);
            const v106 = fn6(v101);
            ((v105 =
              arg46.service === "open_cover" &&
              v106.tiltPosition !== null &&
              Math.abs(v106.tiltPosition - 50) > 0.01),
              v105 &&
                map7.set(v103, {
                  requestId: v104,
                  reported: v106.raw.attributes.current_position,
                }),
              arg46.service === "stop_cover"
                ? v89.begin(options5, v104)
                : v89.begin(
                    {
                      ...options5,
                      service: "set_cover_position",
                      data: {
                        position: 50,
                      },
                    },
                    v104,
                  ));
          }
          const v107 = includes ? v89 : v88;
          (v107.begin(
            includes
              ? {
                  ...options5,
                  service: "set_cover_position",
                  data: {
                    position: arg46.data.tilt_position ?? arg46.data.position,
                  },
                }
              : options5,
            v104,
            {
              defer: v105,
            },
          ),
            fn9(),
            map8.set(v104, {
              resolve: arg48,
              reject: arg49,
              timeout: setTimeout4,
              key: v103,
              feedback: v107,
            }),
            v52({
              type: "control",
              requestId: v104,
              command: arg46,
            }),
            fn80(),
            v26());
        }),
    },
    v108 = createCoverPanel2({
      ...options4,
      onLayout: (arg50) => {
        v6 &&
          text4 === "airer" &&
          v236() &&
          v52({
            type: "edit",
            action: "purifier-layout",
            id: v236().id,
            extraControls: arg50,
          });
      },
      onExtraControl: (arg51) =>
        new Promise((arg52, arg53) => {
          const v109 = v236();
          if (
            !v8 ||
            v6 ||
            v9 ||
            text4 !== "devices" ||
            !v109?.airer ||
            !v109.modelAvailable ||
            !v15(v109) ||
            !(v109.extraControls || []).some((arg54) => arg54.entityId === arg51.entityId)
          ) {
            arg53(new Error("当前晾衣架不可控制。"));
            return;
          }
          const v110 = "airer-extra-" + ++num,
            setTimeout5 = setTimeout(() => fn8(v110, "请求超时，请检查设备状态。"), 14000);
          (map9.set(v110, {
            resolve: arg52,
            reject: arg53,
            timeout: setTimeout5,
          }),
            v52({
              type: "control",
              requestId: v110,
              command: v78(
                {
                  ...arg51,
                  deviceKind: "airer-extra",
                },
                v109,
                true,
              ),
            }));
        }),
    }),
    v111 = createCoverGroupPanel2(options4);
  function fn7(arg55, arg56) {
    const v112 = map8.get(arg55);
    v112 &&
      (clearTimeout(v112.timeout),
      map8.delete(arg55),
      arg56
        ? (map7.get(v112.key)?.requestId === arg55 && map7.delete(v112.key),
          v89.fail(v112.key, arg55, arg56),
          v112.feedback.fail(v112.key, arg55, arg56),
          fn9(),
          fn72(),
          v26(),
          v112.reject(new Error(arg56)))
        : v112.resolve());
  }
  const map9 = new Map(),
    v113 = (arg57, v114 = v236()) =>
      new Promise((arg58, arg59) => {
        if (
          !v8 ||
          v6 ||
          v9 ||
          text4 !== "devices" ||
          !["television", "speaker"].includes(v114?.deviceKind) ||
          arg57.deviceKind !== v114.deviceKind ||
          !v114.modelAvailable ||
          !v15(v114) ||
          ((["turn_on", "turn_off"].includes(arg57.service) && v114.powerEntityId) ||
            v114.entityId) !== arg57.entityId
        ) {
          arg59(new Error("当前媒体设备不可控制。"));
          return;
        }
        const v115 = "television-" + ++num,
          setTimeout6 = setTimeout(() => fn8(v115, "请求超时，请检查设备状态。"), 14000);
        (map9.set(v115, {
          resolve: arg58,
          reject: arg59,
          timeout: setTimeout6,
          entityId: arg57.entityId,
        }),
          v52({
            type: "control",
            requestId: v115,
            command: arg57,
          }));
      }),
    v116 = createSpeakerPanel2({
      onControl: v113,
    }),
    v117 = createNasPanel2(),
    v118 = createTelevisionPanel2({
      onControl: v113,
    }),
    v119 = createDevicePanel2({
      onLayout: (arg60) => {
        v6 &&
          isGenericDeviceKind2(text4) &&
          v236() &&
          v52({
            type: "edit",
            action: "device-layout",
            id: v236().id,
            extraControls: arg60,
          });
      },
      onControl: (arg61) =>
        new Promise((arg62, arg63) => {
          const v120 = v236();
          if (
            !v8 ||
            v6 ||
            v9 ||
            text4 !== "devices" ||
            !isGenericDeviceKind2(v120?.deviceKind) ||
            !v120.modelAvailable ||
            !(v120.extraControls || []).some((arg64) => arg64.entityId === arg61.entityId)
          ) {
            arg63(new Error("当前设备不可控制。"));
            return;
          }
          const v121 = "device-" + ++num,
            setTimeout7 = setTimeout(() => fn8(v121, "请求超时，请检查设备状态。"), 14000);
          (map9.set(v121, {
            resolve: arg62,
            reject: arg63,
            timeout: setTimeout7,
          }),
            v52({
              type: "control",
              requestId: v121,
              command: v78(arg61, v120, true),
            }));
        }),
    });
  function fn8(arg65, arg66) {
    const v122 = map9.get(arg65);
    v122 &&
      (clearTimeout(v122.timeout),
      map9.delete(arg65),
      arg66 ? v122.reject(new Error(arg66)) : v122.resolve());
  }
  const v123 = createLockPanel2({
    onControl: (arg67) =>
      new Promise((arg68, arg69) => {
        const v124 = v236();
        if (
          !v8 ||
          v6 ||
          v9 ||
          text4 !== "security" ||
          v124?.deviceKind !== "lock" ||
          !v124.modelAvailable ||
          arg67.entityId !== v124.entityId
        ) {
          arg69(new Error("当前门锁不可控制。"));
          return;
        }
        const v125 = "lock-" + ++num,
          setTimeout8 = setTimeout(() => fn8(v125, "请求超时，请检查门锁状态。"), 14000);
        (map9.set(v125, {
          resolve: arg68,
          reject: arg69,
          timeout: setTimeout8,
        }),
          v52({
            type: "control",
            requestId: v125,
            command: arg67,
          }));
      }),
  });
  element14.append(
    element15,
    element20,
    element24,
    v80.root,
    v108.root,
    v111.root,
    v117.root,
    v118.root,
    v116.root,
    v119.root,
    v123.root,
  );
  const v126 = createCurtainMotion2({
    THREE: v2,
    requestRender: () => v27(),
  });
  let value21 = null,
    list = [],
    list2 = [];
  function fn9() {
    for (const v127 of list2) {
      const v128 = fn6(v127);
      v127.airer ||
        v126.setState(v127.id, v128, {
          immediate: true,
        });
      const element25 = map.get("cover:" + v127.id);
      element25 && element25.classList.toggle("is-on", coverIconIsOn2(v127, v128));
    }
    for (const v129 of fn18()) {
      const element26 = map.get(
        v6 ? v129.id : v129.isCurtainGroup ? "cover:" + v129.id : "cover:" + v129.id,
      );
      element26 &&
        v129.memberItems.forEach((arg70, arg71) => {
          const v130 = element26.children[arg71],
            v131 = fn6(arg70);
          (v130?.classList.toggle("is-on", arg70.modelAvailable && coverIconIsOn2(arg70, v131)),
            v130?.classList.toggle(
              "is-offline",
              !v6 && (!arg70.entityId || !arg70.modelAvailable || !v131?.available),
            ));
        });
    }
  }
  function fn10() {
    const modelRoot = arg2.modelRoot,
      sceneRevision = arg2.sceneRevision,
      document2 = arg2.document;
    if (
      value21?.config === options &&
      value21.states === options2 &&
      value21.root === modelRoot &&
      value21.revision === sceneRevision &&
      value21.source === document2
    ) {
      fn9();
      return;
    }
    value21 = {
      config: options,
      states: options2,
      root: modelRoot,
      revision: sceneRevision,
      source: document2,
    };
    const list3 = [...fn17(), ...fn35()];
    ((list2 = list3),
      (list = [...new Set(list3.map((arg72) => arg72.floorId).filter(Boolean))]),
      v126.setBindings(
        modelRoot,
        list3.filter((arg73) => !arg73.airer),
        sceneRevision,
      ),
      v88.retain(list3.map(v85)));
    const map10 = list3.filter((arg74) => arg74.coverKind === "dream").map(v85);
    v89.retain(map10);
    for (const v132 of map7.keys()) map10.includes(v132) || map7.delete(v132);
    for (const v133 of list3) {
      const v134 = coverState2(v133.entityId, options2[v133.entityId], v133);
      (v133.coverKind === "dream" &&
        v89.sync(v85(v133), {
          ...v134,
          dream: false,
          overallFeedbackAvailable: true,
          axis: "blade",
          state: "open",
          position: v134.tiltPosition,
          opening: false,
          closing: false,
          moving: false,
        }),
        v88.sync(v85(v133), v134));
    }
    (fn5(),
      fn9(),
      arg2.curtainFrame?.({
        key: v126.poseKey(),
        structure: v126.structureKey(),
        floorIds: list,
        moving: num4 > 0 && (v126.isMoving() || v94() <= 1000 / 30),
      }));
  }
  arg2.setCurtainSync?.(fn10);
  const v135 = createNasStatus2({
      THREE: v2,
      requestFrame: () => {
        (arg2.requestRender?.(), v27());
      },
    }),
    entries = Object.fromEntries(
      GENERIC_DEVICE_KINDS2.map((arg75) => [
        arg75,
        createNasStatus2({
          THREE: v2,
          modelType: genericDeviceProfile2(arg75).modelType,
          readState: deviceStatus2,
          requestFrame: () => {
            (arg2.requestRender?.(), v27());
          },
        }),
      ]),
    ),
    entries2 = Object.fromEntries(
      ["storagewaterheater", "gaswaterheater"].map((arg76) => [
        arg76,
        createNasStatus2({
          THREE: v2,
          modelType: arg76,
          readState: deviceStatus2,
          requestFrame: () => {
            (arg2.requestRender?.(), v27());
          },
        }),
      ]),
    );
  let v136;
  const v137 = createCameraStatus2({
    THREE: v2,
    requestFrame: () => arg2.requestRender?.(),
  });
  let v138;
  function fn11() {
    if (num4 === 0) return;
    const modelRoot2 = arg2.modelRoot,
      sceneRevision2 = arg2.sceneRevision,
      v139 = !v7 && !v22,
      num8 = text4 === "security" && text3 !== "all" ? 1 : 0.55;
    if (
      v138?.root === modelRoot2 &&
      v138.revision === sceneRevision2 &&
      v138.config === options &&
      v138.states === options2 &&
      v138.enabled === v139 &&
      v138.brightness === num8
    )
      return;
    v138 = {
      root: modelRoot2,
      revision: sceneRevision2,
      config: options,
      states: options2,
      enabled: v139,
      brightness: num8,
    };
    const map11 = (options.security?.cameras || []).map((arg77) => {
      const v140 = arg2.document.floors
        .find((arg78) => arg78.id === arg77.floorId)
        ?.scene.items.find((arg79) => arg79.id === arg77.modelId && arg79.type === "camera");
      return {
        ...arg77,
        width: v140?.width || 0.2,
        height: v140?.height || 0.3,
        depth: v140?.depth || 0.2,
      };
    });
    v137.sync({
      root: modelRoot2,
      revision: sceneRevision2,
      bindings: map11,
      states: options2,
      enabled: v139,
      brightness: num8,
    });
  }
  function fn12() {
    if (num4 === 0) return;
    const v141 = !v7 && !v22,
      modelRoot3 = arg2.modelRoot,
      sceneRevision3 = arg2.sceneRevision,
      num9 = text3 === "all" ? 0.75 : 1,
      num10 =
        text3 !== "all" &&
        (["devices", "nas", "television", "speaker", "water-heater"].includes(text4) ||
          isGenericDeviceKind2(text4))
          ? 1
          : 0.6;
    if (!(
      v136?.root === modelRoot3 &&
      v136.revision === sceneRevision3 &&
      v136.config === options &&
      v136.states === options2 &&
      v136.enabled === v141 &&
      v136.sizeScale === num9 &&
      v136.brightness === num10
    )) {
      ((v136 = {
        root: modelRoot3,
        revision: sceneRevision3,
        config: options,
        states: options2,
        enabled: v141,
        sizeScale: num9,
        brightness: num10,
      }),
        v135.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: fn23(),
          states: options2,
          enabled: v141,
          sizeScale: num9,
          brightness: num10,
        }));
      for (const v142 of Object.values(entries2))
        v142.sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: options.environment?.waterHeaters || [],
          states: options2,
          enabled: v141,
          sizeScale: num9,
          brightness: num10,
        });
      for (const v143 of GENERIC_DEVICE_KINDS2)
        entries[v143].sync({
          root: modelRoot3,
          revision: sceneRevision3,
          bindings: fn22(v143),
          states: options2,
          enabled: v141,
          sizeScale: num9,
          brightness: num10,
        });
    }
  }
  const v144 = createTelevisionScreens2({
      THREE: v2,
      requestFrame: (arg80) => {
        (arg2.requestRender?.(), arg2.invalidateReflections?.(arg80), v27());
      },
    }),
    v145 = createAirerMotion2({
      requestFrame: () => {
        (arg2.requestRender?.(), v27());
      },
    }),
    v146 = createFanMotion2({
      requestFrame: () => {
        (arg2.requestRender?.(), v27());
      },
    }),
    v147 = createCarCharging2({
      requestFrame: () => {
        (arg2.requestRender?.(), v27());
      },
    });
  let v148 = false;
  const v149 = arg2.onStartupEffectsProgress?.((arg81) => {
    const v150 = num4 === 0;
    ((num4 = arg81),
      v147.setPresentationGain(arg81),
      (element4.style.opacity = v54.style.opacity = String(arg81)),
      element5.classList.toggle("i3d-startup-effects-pending", arg81 === 0),
      v148 && v150 && arg81 > 0 && ((num6 = 0), fn39(), fn80(), v26()));
  });
  v148 = true;
  const v151 = createSpeakerRings2({
    requestFrame: () => {
      (arg2.requestRender?.(), v27());
    },
  });
  let v152, v153;
  function fn13() {
    if (num4 === 0) return;
    const modelRoot4 = arg2.modelRoot,
      sceneRevision4 = arg2.sceneRevision,
      environmentRevision = arg2.environmentRevision ?? sceneRevision4,
      document3 = arg2.document;
    (!v153 ||
      v153.root !== modelRoot4 ||
      v153.revision !== sceneRevision4 ||
      v153.environmentRevision !== environmentRevision ||
      v153.source !== document3 ||
      v153.config !== options ||
      v153.states !== options2) &&
      (v151.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: fn33(),
        states: options2,
      }),
      v147.sync({
        root: modelRoot4,
        revision: environmentRevision,
        retainedRoots: arg2.retainedModelRoots || [],
        bindings: options.devices?.cars || [],
        states: options2,
      }),
      v145.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: fn17().filter((arg82) => arg82.airer),
        states: options2,
      }),
      v146.sync({
        root: modelRoot4,
        revision: environmentRevision,
        bindings: options.environment?.fans || [],
        states: options2,
      }),
      (v153 = {
        root: modelRoot4,
        revision: sceneRevision4,
        environmentRevision: environmentRevision,
        source: document3,
        config: options,
        states: options2,
      }));
    const text14 = text4 !== "light" && !v7 && !v22 ? (v6 ? text : text2) : "";
    (v152?.root === modelRoot4 &&
      v152.revision === sceneRevision4 &&
      v152.config === options &&
      v152.states === options2 &&
      v152.focused === text14 &&
      v152.module === text4) ||
      ((v152 = {
        root: modelRoot4,
        revision: sceneRevision4,
        config: options,
        states: options2,
        focused: text14,
        module: text4,
      }),
      v144.sync({
        root: modelRoot4,
        revision: sceneRevision4,
        bindings: fn34(),
        states: options2,
        focusedModel: "",
        dimStrength: 0,
      }));
  }
  const v154 = createEnvironmentScene2({
    THREE: v2,
    prepareMaterials: () => arg2.prepareEnvironmentMaterials?.(),
    requestFrame: (arg83) => {
      (arg2.requestRender?.(), arg2.invalidateReflections?.(arg83), v27());
    },
  });
  (arg2.setTelevisionSync?.(fn13), arg2.setEnvironmentScene?.(v154));
  const v155 = createEnvironmentAirflow2({
    THREE: v2,
    camera: arg2.camera,
    requestFrame: () => {
      (arg2.requestRender?.(), v27());
    },
  });
  arg2.setEnvironmentAirflow?.(v155);
  const element27 = v53(
    "p",
    "i3d-view-help",
    "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。",
  );
  ((element27.hidden = true),
    element8.append(element10),
    element5.append(element4, v54, element8, element9, element12, element14, element27),
    element8.append(element7),
    element.append(element6, element5));
  const v156 = createScreenOutlines2({
      THREE: v2,
      container: element5,
      getCamera: () => arg2.camera,
      getObjectCamera: (arg84) => arg2.presentationCamera?.(arg84) || arg2.camera,
    }),
    v157 = createScreenOutlines2({
      THREE: v2,
      container: element5,
      getCamera: () => arg2.camera,
      getObjectCamera: (arg85) => arg2.presentationCamera?.(arg85) || arg2.camera,
      color: "#ffbb45",
      pulse: false,
      editorSelection: true,
    }),
    element28 = v53("div", "i3d-editor-selection");
  (element28.setAttribute("role", "status"), (element28.hidden = true), element5.append(element28));
  function fn14() {
    const value22 = v6 ? v194().find((arg86) => arg86.id === text || arg86.entryId === text) : null;
    element28.hidden = !v6;
    const options6 = {
        light: "灯光",
        climate: "空调/浴霸",
        fan: "电风扇",
        purifier: "空气净化器",
        "water-heater": "热水器",
        airer: "晾衣架",
        cover: "窗帘",
        nas: "NAS",
        speaker: "智能音响",
        television: "电视",
        vacuum: "扫地机",
        "vacuum-shortcut": "快捷按钮",
        "temperature-humidity": "环境标签",
        lock: "门",
        camera: "摄像头",
        presence: "人体传感器",
      },
      v158 = text4 === "security" ? text5 : text4,
      v159 = arg2.document.floors.find((arg87) => arg87.id === value22?.floorId),
      map12 = value22
        ? text4 === "light"
          ? (v159?.scene?.items || [])
              .filter((arg88) => arg88.lightGroupId === value22.groupId)
              .map((arg89) => ({
                floorId: v159.id,
                modelId: arg89.id,
              }))
          : fn20([value22]).filter((arg90) => arg90.modelId)
        : [];
    ((element28.textContent = value22
      ? "正在配置：" +
        (options6[v158] || genericDeviceProfile2(v158)?.label || "设备") +
        " · " +
        (value22.label || value22.deviceName || value22.entityId || "未命名") +
        (v159?.name ? " · " + v159.name : "") +
        (map12.length > 1 ? " · " + map12.length + " 个模型" : "")
      : "请选择要配置的对象"),
      v157.sync(
        arg2.modelRoot,
        arg2.environmentRevision ?? arg2.sceneRevision,
        map12,
        !!(v6 && value22 && value22.deviceKind !== "smallcar" && !arg2.floorTransitionActive),
      ),
      v157.update());
  }
  function fn15() {
    return [
      ...(options.environment?.airConditioners || []),
      ...(options.environment?.fans || []),
      ...(options.environment?.airPurifiers || []),
      ...(options.environment?.waterHeaters || []),
    ].map((arg91) => {
      const v160 = arg2.document.floors
        .find((arg92) => arg92.id === arg91.floorId)
        ?.scene.items.find(
          (arg93) =>
            arg93.id === arg91.modelId &&
            (options.environment?.waterHeaters?.includes(arg91)
              ? ["storagewaterheater", "gaswaterheater"]
              : options.environment?.fans?.includes(arg91)
                ? ["fan"]
                : options.environment?.airPurifiers?.includes(arg91)
                  ? ["airpurifier"]
                  : ["wallac", "floorac", "airoutlet"]
            ).includes(arg93.type),
        );
      return {
        ...arg91,
        pedestalFan: (options.environment?.fans || []).includes(arg91),
        waterHeater: (options.environment?.waterHeaters || []).includes(arg91),
        airPurifier: (options.environment?.airPurifiers || []).includes(arg91),
        deviceKind: "climate",
        x: Number.isFinite(arg91.x) ? arg91.x : (v160?.x ?? 0),
        y: Number.isFinite(arg91.y) ? arg91.y : (v160?.y ?? 0),
        height: Number.isFinite(arg91.height)
          ? arg91.height
          : v160
            ? (Number(v160.elevation) || 0) + (Number(v160.height) || 0.28) / 2
            : 0,
        modelAvailable: !!v160,
        icon:
          arg91.icon ||
          (options.environment?.waterHeaters?.includes(arg91)
            ? "mdi:water-boiler"
            : options.environment?.fans?.includes(arg91)
              ? "mdi:fan"
              : options.environment?.airPurifiers?.includes(arg91)
                ? "mdi:air-purifier"
                : "mdi:air-conditioner"),
      };
    });
  }
  function fn16(arg94, v161 = {}) {
    return {
      curtainWidth: Number(arg94?.width) || 1.8,
      curtainPosition: arg94?.curtainPosition || "split",
      curtainTrack: arg94?.curtainTrack || "straight",
      curtainCorner: arg94?.curtainCorner,
      curtainLeftLength: arg94?.curtainLeftLength,
      curtainRightLength: arg94?.curtainRightLength,
      curtainMeet: arg94?.curtainMeet,
      curtainFabric:
        v161.curtainFabricOverride === true
          ? v161.curtainFabric === "sheer"
            ? "sheer"
            : "cloth"
          : arg94?.curtainFabric || v161.curtainFabric || "cloth",
      coverKind:
        v161.coverKindOverride === true
          ? ["dream", "roller"].includes(v161.coverKind)
            ? v161.coverKind
            : "standard"
          : arg94?.curtainForm === "roller"
            ? "roller"
            : ["dream", "roller"].includes(v161.coverKind)
              ? v161.coverKind
              : "standard",
      unboundPosition: Number.isFinite(v161.unboundPosition)
        ? v161.unboundPosition
        : Number(arg94?.curtainPreview) || 0,
    };
  }
  function fn17() {
    return [...(options.environment?.curtains || []), ...(options.environment?.airers || [])].map(
      (arg95) => {
        const includes2 = (options.environment?.airers || []).includes(arg95),
          v162 = arg2.document.floors
            .find((arg96) => arg96.id === arg95.floorId)
            ?.scene.items.find(
              (arg97) =>
                arg97.id === arg95.modelId && arg97.type === (includes2 ? "airer" : "curtain"),
            );
        return {
          ...arg95,
          airer: includes2,
          deviceKind: "cover",
          x: Number.isFinite(arg95.x) ? arg95.x : (v162?.x ?? 0),
          y: Number.isFinite(arg95.y) ? arg95.y : (v162?.y ?? 0),
          height: Number.isFinite(arg95.height)
            ? arg95.height
            : v162
              ? (Number(v162.elevation) || 0) + (Number(v162.height) || 2.4) / 2
              : 0,
          ...fn16(v162, arg95),
          ...(includes2
            ? {
                coverKind: "airer",
                unboundPosition: v162?.airerPreview ?? 55,
                height:
                  arg95.height ??
                  (Number(v162?.elevation) || 2.7) - (Number(v162?.airerExtension) || 1.2) / 2,
              }
            : {}),
          modelAvailable: !!v162,
          icon: arg95.icon || (includes2 ? "mdi:hanger" : "mdi:curtains"),
        };
      },
    );
  }
  function fn18() {
    const v163 = fn17();
    return validCurtainGroups2(options.environment)
      .map((arg98) => {
        const filter = (arg98.memberIds || [])
            .map((arg99) => v163.find((arg100) => arg100.id === arg99))
            .filter(Boolean),
          vector2 = filter.find((arg101) => arg101.modelAvailable) || filter[0];
        return vector2
          ? {
              ...arg98,
              id: curtainGroupEntryId2(arg98),
              deviceKind: "cover",
              entityId: "",
              modelId: vector2.modelId,
              memberItems: filter,
              groupId: arg98.id,
              x: Number.isFinite(arg98.x) ? arg98.x : vector2.x,
              y: Number.isFinite(arg98.y) ? arg98.y : vector2.y,
              height: Number.isFinite(arg98.height) ? arg98.height : vector2.height,
              modelAvailable: true,
              isCurtainGroup: true,
              icon: "",
              clickAction: arg98.clickAction || "focus",
            }
          : null;
      })
      .filter(Boolean);
  }
  function fn19() {
    const set4 = new Set(
      validCurtainGroups2(options.environment).flatMap((arg102) => arg102.memberIds),
    );
    return [...fn18(), ...fn17().filter((arg103) => !set4.has(arg103.id))];
  }
  function fn20(arg104) {
    return arg104.flatMap((arg105) =>
      arg105.isCurtainGroup
        ? arg105.memberItems.map((arg106) => ({
            ...arg106,
            id: arg105.id + ":member:" + arg106.id,
            entryId: arg105.id,
            visible: arg105.visible,
            buttonHidden: arg105.buttonHidden,
            hiddenClickable: arg105.hiddenClickable,
          }))
        : [arg105],
    );
  }
  function fn21(arg107) {
    const filter2 = arg107.memberItems
      .filter((arg108) => arg108.modelAvailable)
      .map((arg109) => arg2.environmentModelPose?.(arg109.floorId, arg109.modelId))
      .filter(Boolean);
    if (!filter2.length) return null;
    const v164 = new v2.Box3();
    for (const v165 of filter2) {
      const array = new v2.Vector3().fromArray(v165.center),
        array2 = new v2.Vector3().fromArray(v165.size || [1, 1, 1]);
      v164.union(new v2.Box3().setFromCenterAndSize(array, array2));
    }
    return {
      center: v164.getCenter(new v2.Vector3()).toArray(),
      size: v164.getSize(new v2.Vector3()).toArray(),
      forward: filter2[0].forward,
    };
  }
  function fn22(arg110) {
    const v166 = genericDeviceProfile2(arg110);
    return v166
      ? (options.devices?.[v166.collection] || []).map((arg111) => {
          const v167 = arg2.document.floors
            .find((arg112) => arg112.id === arg111.floorId)
            ?.scene.items.find(
              (arg113) =>
                arg113.id === arg111.modelId &&
                (v166.modelTypes || [v166.modelType]).includes(arg113.type),
            );
          return {
            ...arg111,
            clickAction: arg111.clickAction || "focus-panel",
            deviceKind: arg110,
            deviceLabel: v166.label,
            x:
              arg110 === "smallcar"
                ? (v167?.x ?? 0) + (arg111.x ?? 0)
                : Number.isFinite(arg111.x)
                  ? arg111.x
                  : (v167?.x ?? 0),
            y:
              arg110 === "smallcar"
                ? (v167?.y ?? 0) + (arg111.y ?? 0)
                : Number.isFinite(arg111.y)
                  ? arg111.y
                  : (v167?.y ?? 0),
            height: Number.isFinite(arg111.height)
              ? arg111.height
              : (Number(v167?.elevation) || 0) +
                (Number(v167?.height) || v166.height) * (arg110 === "smallcar" ? 1 : 0.5) +
                (arg110 === "smallcar" ? 0.25 : 0),
            modelAvailable: !!v167,
            icon: arg111.icon || v166.icon,
          };
        })
      : [];
  }
  function fn23() {
    return (options.devices?.nas || []).map((arg114) => {
      const v168 = arg2.document.floors
        .find((arg115) => arg115.id === arg114.floorId)
        ?.scene.items.find((arg116) => arg116.id === arg114.modelId && arg116.type === "nas");
      return {
        ...arg114,
        clickAction: arg114.clickAction || "focus",
        deviceKind: "nas",
        x: Number.isFinite(arg114.x) ? arg114.x : (v168?.x ?? 0),
        y: Number.isFinite(arg114.y) ? arg114.y : (v168?.y ?? 0),
        height: Number.isFinite(arg114.height)
          ? arg114.height
          : (Number(v168?.elevation) || 0) + (Number(v168?.height) || 0.34) / 2,
        modelAvailable: !!v168,
        icon: arg114.icon || "mdi:nas",
      };
    });
  }
  const element29 = v53("button", "", "跟随漫游");
  ((element29.type = "button"),
    (element29.hidden = true),
    (element29.title = "以鸟瞰视角跟随扫地机"),
    element7.append(element29));
  function fn24(v169 = true) {
    if (!text11) return;
    const v170 = value14;
    ((text11 = ""),
      (value14 = null),
      (value15 = null),
      v172.reset(),
      v52({
        type: "vacuum-follow-state",
        active: false,
      }),
      (element29.textContent = "跟随漫游"),
      element29.setAttribute("aria-pressed", "false"),
      arg2.endCameraMotion(),
      v169 && v170 && fn61(v170, false, false, () => arg2.restoreCamera(v170), "follow-return"),
      fn56(),
      fn52(),
      fn64());
  }
  element29.addEventListener("click", () => {
    if (text11) {
      fn24();
      return;
    }
    if (arg2.floorTransitionActive || value6?.owner === "floor") return;
    const filter3 = (options.devices?.vacuums || []).filter(
        (arg117) => v15(arg117) && v179.hasTracking(arg117.id),
      ),
      v171 =
        filter3.find((arg118) => "vacuum:" + arg118.id === text2) ||
        filter3.find((arg119) => vacuumStatusPresentation2(arg119, options2).active) ||
        filter3[0];
    if (!v171) return;
    const structuredClone2 = structuredClone(arg2.cameraState(true));
    (v52({
      type: "vacuum-follow-state",
      active: true,
    }),
      v52({
        type: "vacuum-popup-close",
      }),
      fn69({
        immediate: true,
      }),
      (value6 = null),
      arg2.endCameraMotion(),
      (value14 = structuredClone2),
      (text11 = v171.id),
      (value15 = structuredClone(
        v171.followCamera ||
          vacuumBirdCamera2(
            options.camera || structuredClone2,
            arg2.environmentModelPose(v171.floorId, v171.modelId)?.center ||
              structuredClone2.target,
          ),
      )),
      arg2.setFocusViewport(0),
      arg2.beginCameraMotion(value15.mode),
      (element29.textContent = "退出跟随"),
      element29.setAttribute("aria-pressed", "true"),
      fn56(),
      fn52(),
      fn64(),
      v26());
  });
  const v172 = createVacuumFollowCamera2(v2);
  function fn25(arg120) {
    if (!text11) return;
    const worldPosition = v179.worldPosition(text11),
      v173 = (options.devices?.vacuums || []).find((arg121) => arg121.id === text11);
    if (!worldPosition || !v173) {
      fn24();
      return;
    }
    const v174 = arg2.environmentModelPose(v173.floorId, v173.modelId)?.center,
      add = (v174 ? new v2.Vector3(...v174) : worldPosition.clone()).add(
        new v2.Vector3(0, 0.05, 0),
      ),
      v175 = vacuumFollowPose2(value15, add.toArray()),
      v176 = new v2.Vector3(...v175.position);
    (v172.reveal(arg2, v173, add, v176), arg2.setFocusViewport(0), arg2.applyCameraPose(v175));
  }
  const v177 = (arg122) =>
      ["lock", "nas", "television", "speaker", "vacuum", "presence", "camera"].includes(
        arg122?.deviceKind,
      ) || isGenericDeviceKind2(arg122?.deviceKind),
    v178 = createVacuumMaps2(arg2, () => {
      (arg2.requestRender?.(), v27());
    }),
    v179 = createVacuumMotion2(arg2, v26),
    v180 = createPresenceScene2(arg2, v26),
    v181 = createPresenceWaves2(arg2, v27);
  let value23 = null,
    v182 = false,
    v183 = false;
  const element30 = v53("div", "i3d-presence-hit-layer");
  (element30.setAttribute("aria-hidden", "true"), element5.append(element30));
  const map13 = new Map();
  function fn26() {
    if ((!v6 || !v183) && !map13.size) return;
    const hitRects =
        v6 && v183
          ? v180.hitRects(
              arg2.camera,
              element2,
              text5 === "presence" ? options.security?.presenceSensors || [] : [],
              value17,
            )
          : [],
      set5 = new Set(hitRects.map((arg123) => arg123.id)),
      boundingClientRect = element.getBoundingClientRect(),
      num11 = value17 ? boundingClientRect.width / value17.width : 1,
      num12 = value17 ? boundingClientRect.height / value17.height : 1;
    if (num11 > 0 && num12 > 0) {
      for (const [v184, v185] of map13) set5.has(v184) || (v185.remove(), map13.delete(v184));
      for (const v186 of hitRects) {
        let v187 = map13.get(v186.id);
        (v187 ||
          ((v187 = v53("div", "i3d-presence-hit-box")),
          map13.set(v186.id, v187),
          element30.append(v187)),
          Object.assign(v187.style, {
            left: (v186.left - boundingClientRect.left) / num11 - v186.padding + "px",
            top: (v186.top - boundingClientRect.top) / num12 - v186.padding + "px",
            width: v186.width / num11 + v186.padding * 2 + "px",
            height: v186.height / num12 + v186.padding * 2 + "px",
            borderRadius: v186.padding + "px",
          }));
      }
    }
  }
  function fn27() {
    if (num4 === 0) return;
    const v188 =
        v11 &&
        (!v10 || (v6 && text4 === "security")) &&
        (!v6 || text4 === "security") &&
        !v7 &&
        !v22 &&
        v21 &&
        !document.hidden &&
        !arg2.floorTransitionActive &&
        value6?.owner !== "floor",
      list4 =
        v6 && text4 !== "security" && text5 !== "presence"
          ? []
          : options.security?.presenceSensors || [],
      list5 = [options, options2, arg2.sceneRevision, text3, v188, v182, text4, text5];
    (value23 && list5.every((arg124, arg125) => arg124 === value23[arg125])) ||
      ((value23 = list5), v180.sync(list4, options2, v188, text3, v6, v182, text4));
  }
  let value24 = null;
  function fn28() {
    if (num4 === 0) return;
    const v189 = v11 && !v6 && !v7 && v21 && !document.hidden,
      list6 = [options, options2, arg2.sceneRevision, v189];
    (value24 && list6.every((arg126, arg127) => arg126 === value24[arg127])) ||
      ((value24 = list6),
      v179.sync(vacuumBindingsForMap2(options.devices?.vacuums || [], options2), options2, v189));
  }
  const map14 = new Map();
  let value25 = null;
  function fn29() {
    const v190 =
        text4 === "vacuum" &&
        !v7 &&
        !v22 &&
        !arg2.floorTransitionActive &&
        value6?.owner !== "floor" &&
        v21 &&
        !document.hidden,
      list7 = [options, options2, arg2.sceneRevision, text3, v190];
    (value25 && list7.every((arg128, arg129) => arg128 === value25[arg129])) ||
      ((value25 = list7),
      v178.sync(vacuumBindingsForMap2(fn30(), options2), v190, text3, options2));
  }
  document.addEventListener("visibilitychange", fn29);
  function fn30() {
    return (options.devices?.vacuums || []).map((arg130) => {
      const v191 = arg2.document.floors
          .find((arg131) => arg131.id === arg130.floorId)
          ?.scene.items.find(
            (arg132) => arg132.id === arg130.modelId && arg132.type === "robotvacuum",
          ),
        options7 = (!v6 && v179.offset(arg130.id)) || {
          x: 0,
          y: 0,
        };
      return {
        ...arg130,
        deviceKind: "vacuum",
        clickAction: arg130.clickAction || "focus-panel",
        x: (Number.isFinite(arg130.x) ? arg130.x : (v191?.x ?? 0)) + options7.x,
        y: (Number.isFinite(arg130.y) ? arg130.y : (v191?.y ?? 0)) + options7.y,
        height: Number.isFinite(arg130.height)
          ? arg130.height
          : (Number(v191?.elevation) || 0) + (Number(v191?.height) || 0.85) + 0.25,
        modelAvailable: !!v191,
        icon: arg130.icon || "mdi:robot-vacuum",
      };
    });
  }
  function fn31() {
    return fn30()
      .filter(
        (arg133) =>
          arg133.visible !== false &&
          (v6 || arg133.entityId) &&
          (v6 ||
            (!vacuumStatusPresentation2(arg133, options2).active &&
              !vacuumStatusPresentation2(arg133, options2).paused)),
      )
      .flatMap((arg134) =>
        (arg134.shortcuts || [])
          .filter((arg135) => v6 || arg135.entityId)
          .map((arg136) => ({
            ...arg136,
            id: "vacuum-room:" + arg134.id + ":" + arg136.id,
            vacuumId: arg134.id,
            shortcutId: arg136.id,
            floorId: arg134.floorId,
            height: arg136.height ?? 0.08,
            deviceKind: "vacuum-room",
            modelAvailable: arg134.modelAvailable,
            icon: arg136.icon || "mdi:broom",
            size: arg136.size ?? 44,
            iconSize: arg136.iconSize ?? 26,
            hitSize: arg136.hitSize ?? 44,
          })),
      );
  }
  function fn32(arg137) {
    if (
      !v6 &&
      v8 &&
      arg137.deviceKind === "camera" &&
      arg137.entityId &&
      text2 === arg137.id &&
      text9 !== "edit"
    ) {
      v52({
        type: "camera-popup",
        id: arg137.id,
      });
      return;
    }
    !text11 &&
      !v6 &&
      v8 &&
      arg137.deviceKind === "vacuum" &&
      arg137.entityId &&
      (text9 === "panel" || arg137.clickAction !== "focus") &&
      text2 === arg137.id &&
      v52({
        type: "vacuum-popup",
        id: arg137.id,
      });
  }
  function fn33() {
    return (options.devices?.speakers || []).map((arg138) => {
      const v192 = arg2.document.floors
        .find((arg139) => arg139.id === arg138.floorId)
        ?.scene.items.find((arg140) => arg140.id === arg138.modelId && arg140.type === "speaker");
      return {
        ...arg138,
        clickAction: arg138.clickAction || "focus-panel",
        deviceKind: "speaker",
        x: Number.isFinite(arg138.x) ? arg138.x : (v192?.x ?? 0),
        y: Number.isFinite(arg138.y) ? arg138.y : (v192?.y ?? 0),
        height: Number.isFinite(arg138.height)
          ? arg138.height
          : (Number(v192?.elevation) || 0) + (Number(v192?.height) || 0.2336) / 2,
        modelAvailable: !!v192,
        icon: arg138.icon || "mdi:speaker",
      };
    });
  }
  function fn34() {
    return (options.devices?.televisions || []).map((arg141) => {
      const v193 = arg2.document.floors
        .find((arg142) => arg142.id === arg141.floorId)
        ?.scene.items.find((arg143) => arg143.id === arg141.modelId && arg143.type === "tv");
      return {
        ...arg141,
        clickAction: arg141.clickAction || "focus-panel",
        deviceKind: "television",
        x: Number.isFinite(arg141.x) ? arg141.x : (v193?.x ?? 0),
        y: Number.isFinite(arg141.y) ? arg141.y : (v193?.y ?? 0),
        height: Number.isFinite(arg141.height)
          ? arg141.height
          : (Number(v193?.elevation) || 0) + (Number(v193?.height) || 0.92) * 0.62,
        modelAvailable: !!v193,
        icon: arg141.icon || "mdi:television",
      };
    });
  }
  function fn35() {
    const set6 = new Set(fn17().map((arg144) => JSON.stringify([arg144.floorId, arg144.modelId])));
    return arg2.document.floors.flatMap((arg145) =>
      (arg145.scene?.items || [])
        .filter(
          (arg146) =>
            arg146.type === "curtain" && !set6.has(JSON.stringify([arg145.id, arg146.id])),
        )
        .map((arg147) => ({
          id: "preview-cover:" + JSON.stringify([arg145.id, arg147.id]),
          floorId: arg145.id,
          modelId: arg147.id,
          entityId: "",
          deviceKind: "cover",
          ...fn16(arg147),
          modelAvailable: true,
          previewOnly: true,
        })),
    );
  }
  function fn36() {
    const map15 = (options.environment?.temperatureHumidity || []).map((arg148) => ({
      ...arg148,
      deviceKind: "temperature-humidity",
    }));
    return v14()
      ? []
      : text4 === "security"
        ? fn41()
        : text4 === "vacuum-shortcut"
          ? fn31().filter((arg149) => arg149.vacuumId === text6)
          : isGenericDeviceKind2(text4)
            ? fn22(text4)
            : text4 === "nas"
              ? fn23()
              : text4 === "vacuum"
                ? fn30()
                    .filter((arg150) => v6 || arg150.entityId)
                    .map((arg151) => ({
                      ...arg151,
                      id: v6 ? arg151.id : "vacuum:" + arg151.id,
                    }))
                : text4 === "speaker"
                  ? fn33()
                  : text4 === "television"
                    ? fn34()
                    : text4 === "devices"
                      ? [
                          ...fn17().filter((arg152) => arg152.airer),
                          ...fn15().filter((arg153) => arg153.waterHeater),
                          ...fn23(),
                          ...fn33(),
                          ...fn34(),
                          ...GENERIC_DEVICE_KINDS2.flatMap((arg154) => fn22(arg154)),
                        ].map((arg155) => ({
                          ...arg155,
                          id: arg155.deviceKind + ":" + arg155.id,
                        }))
                      : text4 === "airer"
                        ? fn17().filter((arg156) => arg156.airer)
                        : text4 === "cover"
                          ? fn19().filter((arg157) => !arg157.airer)
                          : text4 === "climate"
                            ? fn15().filter((arg158) =>
                                (options.environment?.airConditioners || []).some(
                                  (arg159) => arg159.id === arg158.id,
                                ),
                              )
                            : text4 === "water-heater"
                              ? fn15().filter((arg160) =>
                                  (options.environment?.waterHeaters || []).some(
                                    (arg161) => arg161.id === arg160.id,
                                  ),
                                )
                              : text4 === "fan"
                                ? fn15().filter((arg162) => arg162.pedestalFan)
                                : text4 === "purifier"
                                  ? fn15().filter((arg163) =>
                                      (options.environment?.airPurifiers || []).some(
                                        (arg164) => arg164.id === arg163.id,
                                      ),
                                    )
                                  : text4 === "temperature-humidity"
                                    ? map15
                                    : [
                                        ...fn15().filter((arg165) => !arg165.waterHeater),
                                        ...fn19().filter((arg166) => !arg166.airer),
                                        ...map15,
                                      ].map((arg167) => ({
                                        ...arg167,
                                        id: arg167.deviceKind + ":" + arg167.id,
                                      }));
  }
  const v194 = () =>
    (text4 === "security"
      ? fn41()
      : text4 === "light"
        ? options.lights || []
        : [...fn36(), ...(text4 === "vacuum" && !v6 ? fn31() : [])]
    ).filter(v15);
  function fn37() {
    ((element8.hidden = !v10 && (v6 || v7 || v22)),
      (element9.hidden = v6 || v7 || v22 || arg2.document.floors.length < 2));
    const v195 = floorNavigationChoices2(arg2.document.floors, options.floorNumbers),
      text15 = text3 === "all" ? v195.filter(([v196]) => v196 !== "all").at(-1)?.[0] || "" : null;
    (arg2.groundReflections?.setOutsideFloor?.(text15),
      arg2.groundReflections?.setVisibleFloor?.(null));
    const stringify = JSON.stringify(v195);
    if (stringify !== text12) {
      ((text12 = stringify), element9.replaceChildren());
      for (const [v197, v198, v199] of v195) {
        const element31 = v53("button", "", v198);
        ((element31.type = "button"),
          (element31.dataset.floor = v197),
          (element31.title = v199),
          element31.setAttribute("aria-label", v199),
          element31.addEventListener("click", () => fn38(v197)),
          element9.append(element31));
      }
    }
    for (const element32 of element9.children)
      element32.setAttribute("aria-pressed", String(element32.dataset.floor === text3));
  }
  function fn38(arg168) {
    if (
      v6 ||
      v7 ||
      v22 ||
      v42 ||
      arg168 === text3 ||
      (arg168 !== "all" && !arg2.document.floors.some((arg169) => arg169.id === arg168))
    )
      return;
    (fn24(false),
      fn69({
        immediate: true,
        preserveCamera: true,
      }),
      fn85());
    const cameraState = arg2.cameraState(true),
      v200 = arg2.getOrbitCenter?.(),
      v201 = arg2.getCameraMotionState?.();
    ((text7 = arg168),
      fn46(() => {
        (fn39(), (text3 = arg168));
        const transitionFloor = arg2.transitionFloor
            ? arg2.transitionFloor(arg168)
            : (arg2.setFloor(arg168), arg2.getOrbitCenter?.()),
          v202 = v45(
            options3.floorCameras?.[arg168] ||
              (arg168 === options3.floorSelection ? options3.camera : null),
            arg168,
          ),
          cameraState2 = v202 || arg2.floorDefaultCamera?.(arg168) || arg2.cameraState();
        ((value4 = v202 || cameraState2),
          (options = fn2({
            ...options3,
            floorSelection: arg168,
          })),
          (options.camera = value4),
          arg168 === "all"
            ? ((text4 = "overview"), (text8 = ""))
            : text4 === "overview"
              ? (text4 = "light")
              : text8 && ((text4 = text8), (text8 = "")),
          fn39(),
          fn12(),
          arg2.restoreCamera(cameraState, v201),
          fn61(
            cameraState2,
            false,
            false,
            () => {
              (arg2.finishFloorTransition?.(), fn39(), fn51(), fn43(), fn29(), fn55());
            },
            "floor",
            {
              fromPivot: v200,
              toPivot: transitionFloor,
            },
          ),
          map3.clear(),
          fn51({
            immediate: true,
          }),
          fn80(),
          fn58(),
          fn64());
      }));
  }
  function fn39() {
    const v203 = fn42();
    arg2.setLockMoving?.(v29.sync(v203.bindings, v203.states));
  }
  function fn40(arg170) {
    const v204 = (arg171, v205 = "") =>
        v52({
          type: "range-editor-state",
          active: arg171,
          ...(arg170
            ? {
                requestId: arg170,
              }
            : {}),
          ...(v205
            ? {
                error: v205,
              }
            : {}),
        }),
      text16 = v23
        ? arg2.regionLighting
          ? v11
            ? v42
              ? "户型正在同步，请稍候再调整照射范围。"
              : v7
                ? "请先完成户型视角调整，再编辑照射范围。"
                : ""
            : "户型还在加载，请稍候再调整照射范围。"
          : "请先选择轻量柔光模式。"
        : "请在已授权的控件编辑器中调整照射范围。";
    if (text16) {
      v204(false, text16);
      return;
    }
    if (v22) {
      v204(true);
      return;
    }
    (fn69({
      immediate: true,
    }),
      (v22 = true),
      (v24 = true),
      fn64(),
      fn52(),
      fn43(),
      (element5.style.display = "none"),
      element5.setAttribute("inert", ""),
      (element6.style.display = "none"));
    try {
      ((value9 ||= mountRegionRangeEditor2(arg2, {
        getConfig: () => options,
        standalone: v25,
        wake: v26,
        onChange(arg172) {
          v23 &&
            ((options.lightRegionOverrides = structuredClone(arg172)),
            (options3.lightRegionOverrides = structuredClone(arg172)),
            v52({
              type: "range-overrides",
              overrides: arg172,
            }));
        },
        onClose() {
          ((v22 = false),
            (element5.style.display = ""),
            element5.removeAttribute("inert"),
            (element6.style.display = ""),
            fn51({
              immediate: true,
            }),
            fn52(),
            fn43(),
            fn58(),
            fn78(true),
            fn64(),
            v24 ||
              v52({
                type: "range-editor-state",
                active: false,
              }));
        },
      })),
        value9.open(),
        v204(true));
    } catch (v206) {
      (value9?.close(),
        (v22 = false),
        (element5.style.display = ""),
        element5.removeAttribute("inert"),
        (element6.style.display = ""),
        fn52(),
        fn43(),
        fn64(),
        v204(false, v206.message || "范围编辑暂时不可用"));
    } finally {
      v24 = false;
    }
  }
  const v207 = () =>
      (options.security?.locks || [])
        .map((arg173) => {
          const v208 = arg2.document.floors.find((arg174) => arg174.id === arg173.floorId),
            v209 = v208 && doorModels2(v208).find((arg175) => arg175.modelId === arg173.modelId);
          return {
            ...arg173,
            hinge: arg173.hinge || v209?.hinge || "left",
            id: "lock:" + arg173.id,
            deviceKind: "lock",
            clickAction: "focus-panel",
            icon: arg173.icon || "mdi:door-closed",
            modelAvailable: !!v209,
            x: Number.isFinite(arg173.x) ? arg173.x : (v209?.x ?? 0),
            y: Number.isFinite(arg173.y) ? arg173.y : (v209?.y ?? 0),
            height: Number.isFinite(arg173.height) ? arg173.height : (v209?.height ?? 2.2) * 0.5,
          };
        })
        .filter(
          (arg176) =>
            v6 ||
            arg176.doorEntityId ||
            arg176.doorEventEntityId ||
            arg176.doorOpenEntityId ||
            arg176.doorCloseEntityId ||
            arg176.batteryEntityId ||
            arg176.entityId,
        ),
    v210 = (arg177) =>
      arg177.labelMode === "hidden" || arg177.labelMode === "open" || arg177.labelMode === "always"
        ? arg177.labelMode
        : arg177.labelHidden === true
          ? "hidden"
          : "always",
    v211 = (arg178, arg179) =>
      arg178.deviceKind !== "lock" ||
      v210(arg178) === "always" ||
      (v210(arg178) === "open" && arg179?.doorOpen === true),
    v212 = () =>
      (options.security?.cameras || []).map((arg180) => {
        const v213 = arg2.document.floors
          .find((arg181) => arg181.id === arg180.floorId)
          ?.scene.items.find((arg182) => arg182.id === arg180.modelId && arg182.type === "camera");
        return {
          ...arg180,
          buttonHidden: false,
          hiddenClickable: false,
          id: "camera:" + arg180.id,
          deviceKind: "camera",
          clickAction: "focus",
          modelAvailable: !!v213,
          icon: arg180.icon || "mdi:cctv",
          x: Number.isFinite(arg180.x) ? arg180.x : (v213?.x ?? 0),
          y: Number.isFinite(arg180.y) ? arg180.y : (v213?.y ?? 0),
          height: Number.isFinite(arg180.height)
            ? arg180.height
            : (Number(v213?.elevation) || 0) + (Number(v213?.height) || 0.3) / 2,
        };
      }),
    v214 = () =>
      (options.security?.presenceSensors || []).map((arg183) => {
        const v215 = arg2.document.floors
          .find((arg184) => arg184.id === arg183.floorId)
          ?.scene.items.find(
            (arg185) => arg185.id === arg183.modelId && arg185.type === "presence",
          );
        return {
          ...arg183,
          modelAvailable: arg183.modelId ? !!v215 : undefined,
          id: "presence:" + arg183.id,
          deviceKind: "presence",
          clickAction: "focus",
          icon: "mdi:motion-sensor",
          size: arg183.modelId ? 36 : arg183.size,
          x: v215?.x ?? arg183.route?.[0]?.x ?? 0,
          y: v215?.y ?? arg183.route?.[0]?.y ?? 0,
          height: v215
            ? (Number(v215.elevation) || 0) + (Number(v215.height) || 0.2) / 2
            : (arg183.size ?? 1) * 0.7,
        };
      });
  function fn41() {
    const list8 = [
      ...v207(),
      ...v212(),
      ...v214().filter((arg186) => (v6 && arg186.modelId) || !v6),
    ];
    return v6 && text5 ? list8.filter((arg187) => arg187.deviceKind === text5) : list8;
  }
  function fn42() {
    const list9 = options.security?.locks || [];
    if (v6 && !value10)
      return {
        bindings: [],
        states: {},
      };
    if (!v6 || text5 !== "lock" || !value10?.id)
      return {
        bindings: list9,
        states: options2,
      };
    const replace = value10.id.replace(/^lock:/, ""),
      v216 = list9.find((arg188) => arg188.id === replace);
    if (!v216)
      return {
        bindings: list9,
        states: options2,
      };
    const text17 = v216.doorEntityId || "__hb_lock_motion_preview__",
      options8 = {
        ...v216,
        doorEntityId: text17,
      };
    return {
      bindings: list9.map((arg189) => (arg189 === v216 ? options8 : arg189)),
      states: {
        ...options2,
        [text17]: {
          state: value10.open ? "open" : "closed",
          available: true,
        },
      },
    };
  }
  const v217 = (arg190) =>
    v194().find((arg191) => arg191.id === arg190) ||
    v207().find((arg192) => arg192.id === arg190) ||
    v212().find((arg193) => arg193.id === arg190) ||
    v214().find((arg194) => arg194.id === arg190);
  function fn43() {
    (fn14(),
      fn63(),
      fn27(),
      v181.sync({
        bindings: (options.security?.presenceSensors || [])
          .filter((arg195) => !v6 || "presence:" + arg195.id === text)
          .map((arg196) => {
            const v218 = arg2.document.floors
              .find((arg197) => arg197.id === arg196.floorId)
              ?.scene.items.find((arg198) => arg198.id === arg196.modelId);
            return {
              ...arg196,
              width: v218?.width,
              height: v218?.height,
              depth: v218?.depth,
            };
          }),
        states: options2,
        floorId: text3,
        preview: v6,
        enabled:
          num4 > 0 &&
          text4 === "security" &&
          !text2 &&
          !text9 &&
          !v7 &&
          !v22 &&
          !arg2.floorTransitionActive &&
          value6?.owner !== "floor",
      }),
      fn29());
    const floorTransitionActive = arg2.floorTransitionActive || value6?.owner === "floor";
    if (
      (v147.sync({
        root: arg2.modelRoot,
        revision: arg2.environmentRevision ?? arg2.sceneRevision,
        retainedRoots: arg2.retainedModelRoots || [],
        bindings: options.devices?.cars || [],
        states: options2,
      }),
      v154.setRoot(arg2.modelRoot, arg2.environmentRevision ?? arg2.sceneRevision),
      !floorTransitionActive || value6?.presentationRevealed)
    ) {
      floorTransitionActive || (fn10(), fn12(), fn11(), fn13(), fn28());
      const filter4 = fn36().filter(v15),
        filter5 = fn20(
          v6
            ? [
                ...filter4,
                ...([
                  "climate",
                  "water-heater",
                  "devices",
                  "nas",
                  "television",
                  "speaker",
                  "vacuum",
                  ...GENERIC_DEVICE_KINDS2,
                ].includes(text4)
                  ? []
                  : fn35()),
              ]
            : [
                ...fn15(),
                ...fn19(),
                ...fn23(),
                ...fn33(),
                ...fn34(),
                ...GENERIC_DEVICE_KINDS2.flatMap((arg199) => fn22(arg199)),
                ...fn30(),
                ...v207(),
                ...v212(),
                ...v214(),
              ]
                .map((arg200) => ({
                  ...arg200,
                  id: ["lock", "camera", "presence"].includes(arg200.deviceKind)
                    ? arg200.id
                    : arg200.deviceKind + ":" + arg200.id,
                }))
                .concat(fn35()),
        ).filter((arg201) => arg201.modelAvailable && v15(arg201)),
        v219 = pageDimming2(options, text4, !!text2 && text9 !== "panel"),
        enabled = !v7 && !v22 && v219.enabled,
        v220 = v6 && text4 === "temperature-humidity",
        list10 = v220 ? [] : pageModelBindings2(arg2.document.floors, filter5, v219.page, text3);
      if (v6 && !v220 && text) {
        for (const v221 of filter5)
          (v221.id === text || v221.entryId === text) &&
            !list10.some(
              (arg202) => arg202.floorId === v221.floorId && arg202.modelId === v221.modelId,
            ) &&
            list10.push({
              ...v221,
              visible: true,
            });
      }
      (v156.sync(
        arg2.modelRoot,
        arg2.environmentRevision ?? arg2.sceneRevision,
        list10.filter(
          (arg203) =>
            arg203.deviceKind !== "smallcar" &&
            (!text || arg203.id === text || arg203.entryId === text),
        ),
        !v6 &&
          !text2 &&
          !v7 &&
          !v22 &&
          text3 !== "all" &&
          ["environment", "devices", "vacuum", "security"].includes(v219.page),
      ),
        v155.setRoot(arg2.modelRoot, arg2.sceneRevision),
        v154.setMode({
          enabled: enabled,
          saturation: v219.saturation,
          dimStrength: enabled ? v219.strength : 0,
          bindings: list10,
          animateBindings: !v6 && !v7,
          states: options2,
          focusedId: text2,
          selectedId: v6 ? text : "",
        }),
        v155.setState({
          enabled: num4 > 0 && !v7 && !v22 && !v220,
          bindings: filter5.filter(
            (arg204) => arg204.deviceKind === "climate" && !arg204.waterHeater,
          ),
          states: options2,
          focusedId: text2,
          overview: !text2 || text9 === "panel",
        }),
        arg2.setEnvironmentActive?.(enabled || v154.isActive));
    }
    const filter6 = fn36().filter(v15);
    fn37();
    const v222 = text3 === "all";
    fn44(!v10 && (v6 || v7 || v22 || v222));
    const text18 = ["water-heater", "airer"].includes(text4)
      ? "devices"
      : ["overview", "security", "light", "devices", "vacuum"].includes(text4)
        ? text4
        : "environment";
    (element10.classList.toggle("is-all-floors", v222),
      element10.style.setProperty("--i3d-tab-count", String(configuredModuleKinds2.length)),
      element10.style.setProperty(
        "--i3d-selected-tab",
        String(Math.max(0, configuredModuleKinds2.indexOf(text18))),
      ));
    for (const [v223, element33] of map4) {
      const indexOf = configuredModuleKinds2.indexOf(v223),
        v224 = v222 || indexOf < 0;
      (v224 && fn54(element33),
        (element33.hidden = element10.hidden || indexOf < 0),
        (element33.disabled = v224),
        element33.style.setProperty("--i3d-tab-index", String(Math.max(0, indexOf))),
        element33.setAttribute("aria-pressed", String(v223 === text18)));
    }
    ((element12.hidden =
      v222 ||
      element10.hidden ||
      (!text8 &&
        (text4 === "security"
          ? [
              ...(options.security?.locks || []),
              ...(options.security?.presenceSensors || []),
              ...(options.security?.cameras || []),
            ].some(v15)
          : text4 === "overview" || text4 === "light" || filter6.length > 0))),
      (element12.textContent = text8
        ? "请选择楼层，再使用" + (map4.get(text8)?.textContent || "控制") + "。"
        : text4 === "security"
          ? "尚未配置安防相关设备"
          : text4 === "vacuum"
            ? "尚未配置扫地机相关设备"
            : text4 === "devices"
              ? "尚未配置相关设备"
              : "尚未配置环境相关设备"));
  }
  function fn44(arg205) {
    if (value19 === arg205) return;
    const v225 = value19 === null,
      computedStyle =
        !element10.hidden && element10.animate && typeof getComputedStyle == "function"
          ? getComputedStyle(element10)
          : null,
      options9 = {
        clipPath: element10.hidden
          ? "inset(0 100% 0 0 round 12px)"
          : computedStyle?.clipPath && computedStyle.clipPath !== "none"
            ? computedStyle.clipPath
            : "inset(0 0% 0 0 round 12px)",
        opacity: element10.hidden ? 0 : Number(computedStyle?.opacity ?? 1),
        transform: element10.hidden ? "translateX(-6px)" : computedStyle?.transform || "none",
      };
    if (
      (value20?.cancel(),
      (value20 = null),
      (value19 = arg205),
      (element10.inert = arg205),
      element10.setAttribute("aria-hidden", String(arg205)),
      arg205 && fn54(element10),
      v225 || !element10.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      element10.hidden = arg205;
      return;
    }
    element10.hidden = false;
    const list11 = arg205
        ? [
            options9,
            {
              clipPath: "inset(0 100% 0 0 round 12px)",
              opacity: 0,
              transform: "translateX(-4px)",
            },
          ]
        : [
            options9,
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(2px)",
              offset: 0.8,
            },
            {
              clipPath: "inset(0 0% 0 0 round 12px)",
              opacity: 1,
              transform: "translateX(0)",
            },
          ],
      animate = element10.animate(list11, {
        duration: arg205 ? 380 : 480,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "both",
      });
    ((value20 = animate),
      (animate.onfinish = () => {
        if (value20 === animate) {
          ((value20 = null), (element10.hidden = arg205));
          for (const [v226, v227] of map4)
            v227.hidden = arg205 || !configuredModuleKinds2.includes(v226);
          animate.cancel();
        }
      }));
  }
  let value26 = null;
  function fn45() {
    const v228 = value26;
    if (((value26 = null), !!v228)) {
      for (const v229 of v228.animations) v229.cancel();
      (v228.ghost.remove(), element4.removeAttribute("inert"));
    }
  }
  function fn46(arg206) {
    const map16 = element4.animate
      ? [...element4.children].map((arg207) => Number(getComputedStyle(arg207).opacity))
      : [];
    if (
      (fn45(), !element4.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    ) {
      arg206();
      return;
    }
    const map17 = new Map([...element4.children].map((arg208, arg209) => [arg208, arg209])),
      filter7 = v194()
        .map((arg210) => ({
          ...arg210,
          index: map17.get(map.get(arg210.id)) ?? -1,
        }))
        .filter((arg211) => arg211.index >= 0),
      cloneNode = element4.cloneNode(true);
    (cloneNode.setAttribute("aria-hidden", "true"),
      cloneNode.setAttribute("inert", ""),
      cloneNode.classList.add("i3d-module-outgoing"),
      (cloneNode.style.pointerEvents = "none"));
    for (const element34 of cloneNode.querySelectorAll("button"))
      ((element34.style.pointerEvents = "none"), element34.removeAttribute("id"));
    (element4.parentNode.append(cloneNode), arg206(), element4.setAttribute("inert", ""));
    const v230 = (value26 = {
      ghost: cloneNode,
      animations: [],
      outgoing: filter7.map((arg212) => ({
        ...arg212,
        node: cloneNode.children[arg212.index],
      })),
    });
    for (const [v231, v232] of [...cloneNode.children].entries())
      v232.hidden ||
        v230.animations.push(
          v232.animate(
            [
              {
                opacity: map16[v231] ?? 1,
              },
              {
                opacity: 0,
              },
            ],
            {
              duration: 240,
              easing: "linear",
              fill: "both",
            },
          ),
        );
    if (!element4.classList.contains("is-concealed")) {
      for (const v233 of element4.children)
        if (!v233.hidden) {
          const v234 = Number(getComputedStyle(v233).opacity);
          v230.animations.push(
            v233.animate(
              [
                {
                  opacity: 0,
                },
                {
                  opacity: v234,
                },
              ],
              {
                duration: 240,
                easing: "linear",
                fill: "backwards",
              },
            ),
          );
        }
    }
    Promise.all(v230.animations.map((arg213) => arg213.finished))
      .then(() => {
        value26 === v230 && (fn45(), fn55());
      })
      .catch(() => {});
  }
  function fn47(arg214, arg215, arg216) {
    try {
      const list12 = ["light", "environment", "devices", "vacuum", "security"];
      arg2.reportLifecycle?.(arg214, {
        fromCategory: list12.indexOf(arg215),
        toCategory: list12.indexOf(arg216),
        ...v178.diagnostics?.(),
      });
    } catch {}
  }
  function fn48(arg217) {
    if (v6 || v7 || v22 || v42 || !configuredModuleKinds2.includes(arg217) || text3 === "all")
      return;
    if (((text8 = ""), arg217 === text4)) {
      fn43();
      return;
    }
    const v235 = text4;
    (fn47("category-switch-start", v235, arg217),
      text11 && fn24(),
      fn69(),
      fn46(() => {
        ((text4 = arg217),
          v285.activity(),
          v289.activity(),
          v290.activity(),
          map3.clear(),
          fn43(),
          fn80(),
          fn47("category-switch-applied", v235, arg217));
      }));
  }
  const v236 = () => v217(text2),
    v237 = (arg218) => vector.state(arg218, v41(arg218));
  function fn49(arg219) {
    const v238 = v237(arg219?.entityId),
      v239 = v41(arg219?.entityId);
    if (!arg219?.entityId?.startsWith("light.")) return v238;
    const options10 =
      v239.capabilitiesKnown || v238.brightnessSupported || v238.temperatureSupported
        ? {
            ...v238,
          }
        : {
            ...v238,
            brightnessSupported: true,
            temperatureSupported: true,
            brightness: v238.on ? (v238.brightness ?? 100) : 0,
            kelvin: v238.kelvin ?? 3500,
          };
    return (
      !options10.on && options10.brightnessSupported && (options10.brightness = 0),
      options10
    );
  }
  function fn50(arg220) {
    const v240 = v237(arg220.entityId);
    return (
      v6 &&
        value12?.id === arg220.id &&
        ((v240.on = true),
        (v240.available = true),
        value12.kind !== "defaults" &&
          (v240.brightness = value12.kind === "brightnessMin" ? 1 : 100),
        value12.kind.startsWith("brightness") && (v240.brightnessSupported = true),
        value12.kind.startsWith("temperature") &&
          ((v240.temperatureSupported = true),
          (v240.kelvin = value12.kind.endsWith("Min") ? v240.minimum : v240.maximum))),
      v240
    );
  }
  function fn51(arg221, v241 = null) {
    const v242 = v6 || v7,
      value27 = v242 && !v7 && text9 !== "edit" ? value12?.id : null;
    if (
      (arg2.setEditorEffects?.(v242, !!value27),
      (arg2.floorTransitionActive || value6?.owner === "floor") && !arg2.floorEffectsFollow)
    )
      return;
    const v243 = !v242 && v241 && arg2.lightStatePatchReady === true,
      filter8 = (options.lights || []).filter((arg222) => arg222.entityId),
      v244 = v243 ? lightBindingsForUpdate2(filter8, v241) : filter8;
    arg2.setLightStates(
      v244.map((arg223) => {
        const v245 = fn50(arg223);
        return {
          ...cs(arg223),
          ...(v6 && value12?.id === arg223.id ? v245 : lightRenderState2(v245)),
          ...(v242 && arg223.id !== value27
            ? {
                on: false,
              }
            : {}),
        };
      }),
      v242
        ? {
            ...arg221,
            editor: true,
            immediate: true,
          }
        : v243
          ? {
              ...arg221,
              partial: true,
            }
          : arg221,
    );
  }
  function fn52() {
    if (v22 && value9?.syncCameraInteraction) {
      value9.syncCameraInteraction();
      return;
    }
    if (v22 || text11) {
      arg2.setCameraInteraction({
        enabled: false,
        panEnabled: false,
        zoomEnabled: false,
      });
      return;
    }
    const options11 = {
        ...options.camera,
        ...resolvePageBehavior2(options, text4).interaction,
      },
      v246 = v7 || text9 === "edit" || (v6 && !text9 && !value6),
      value28 = text9 === "edit" ? v236() : null,
      anchor =
        value28 &&
        (value28.isCurtainGroup
          ? fn21(value28)
          : value28.deviceKind === "presence"
            ? v180.anchor(value28.id.slice(9))
            : value28.modelId
              ? arg2.environmentModelPose?.(value28.floorId, value28.modelId)
              : null),
      value29 = value28
        ? anchor?.center ||
          arg2.worldPoint(value28.floorId, value28.x, value28.y, value28.height)?.toArray()
        : null;
    arg2.setCameraInteraction({
      enabled: !value3 && (v246 || (v8 && (!text9 || text9 === "panel") && !value6 && !v18)),
      rotationMode: v246 ? "free" : options11.rotationMode,
      panEnabled: v246,
      zoomEnabled: v246,
      focusEditing: text9 === "edit",
      focusPoint: value29,
    });
  }
  let text19 = "";
  const v247 = () => {
    const v248 = v236(),
      v249 = options.popupLayout?.[v248?.deviceKind === "camera" ? "camera" : "general"];
    if (
      (Number.isFinite(v249?.x) && v249.x < 75) ||
      (!v6 && v177(v248) && v248?.clickAction === "focus")
    )
      return 0;
    const clientWidth = value17?.width || element.clientWidth,
      v250 = element14.getBoundingClientRect().width / Math.max(num7, 0.0001);
    return Math.min(0.7, (v250 + 24) / Math.max(clientWidth, 1));
  };
  function fn53() {
    const boundingClientRect2 = element.getBoundingClientRect(),
      width2 = value17?.width || boundingClientRect2.width,
      height = value17?.height || boundingClientRect2.height;
    if (!(
      width2 > 0 &&
      height > 0 &&
      boundingClientRect2.width > 0 &&
      boundingClientRect2.height > 0
    ))
      return;
    ((value18 = {
      width: boundingClientRect2.width,
      height: boundingClientRect2.height,
    }),
      (num7 = boundingClientRect2.width / width2));
    const v251 = boundingClientRect2.height / height,
      v252 = !!value17,
      v253 = typeof arg2 < "u" && v252,
      width3 = v253 ? width2 : boundingClientRect2.width,
      height2 = v253 ? height : boundingClientRect2.height,
      num13 = v252 ? num7 : 1,
      num14 = v252 ? v251 : 1;
    ((value = v252
      ? {
          x: num13,
          y: num14,
          width: width2,
          height: height,
        }
      : null),
      (value2 = value));
    const v254 = configuredModuleKinds2.length * 50 + 6,
      options12 = options.navigation || {},
      v255 = (arg224) =>
        Number.isFinite(arg224?.scale) ? Math.max(0.5, Math.min(10, arg224.scale)) : 1,
      v256 = 2 * v255(options12.categories),
      v257 = 2 * v255(options12.floors),
      num15 = element8.offsetHeight || 36,
      num16 = element9.offsetWidth || 80,
      num17 = element9.offsetHeight || 120,
      num18 = element7.offsetHeight || 30,
      num19 = element14.offsetWidth || 360,
      num20 = element14.offsetHeight || 400,
      v258 = v116.root.hidden
        ? num20
        : num20 +
          Math.max(0, parseFloat(getComputedStyle(v116.root).maxHeight) - v116.root.offsetHeight);
    (element5.style.setProperty("--i3d-presentation-width", width3 + "px"),
      element5.style.setProperty("--i3d-presentation-height", height2 + "px"),
      element5.style.setProperty("--i3d-touch-hit-width", 44 / num13 + "px"),
      element5.style.setProperty("--i3d-touch-hit-height", 44 / num14 + "px"),
      element5.style.setProperty("--i3d-media-canvas-width", width2 + "px"),
      element5.style.setProperty("--i3d-media-canvas-height", height + "px"),
      element5.style.setProperty("--i3d-media-scale-x", String(num13)),
      element5.style.setProperty("--i3d-media-scale-y", String(num14)),
      element5.style.setProperty("--i3d-navigation-scale", String(v256)),
      element5.style.setProperty("--i3d-floor-scale", String(v257)));
    const v259 = (arg225, arg226, arg227, arg228, arg229, arg230) => {
        const v260 = arg229 * arg228,
          v261 = arg230 * arg228,
          v262 = (arg231, arg232) =>
            Number.isFinite(arg226?.[arg231]) ? Math.max(0, Math.min(100, arg226[arg231])) : arg232,
          max = Math.max(
            12 + v260 / 2,
            Math.min(width3 - 12 - v260 / 2, (width3 * v262("x", arg227[0])) / 100),
          ),
          max2 = Math.max(
            12 + v261 / 2,
            Math.min(height2 - 12 - v261 / 2, (height2 * v262("y", arg227[1])) / 100),
          );
        return (
          (arg225.style.left = max + "px"),
          (arg225.style.top = max2 + "px"),
          max2 - v261 / 2
        );
      },
      v263 = v259(element8, options12.categories, [50, 94], v256, v254, num15),
      max3 = Number.isFinite(options12.followOffset)
        ? Math.max(0, Math.min(300, options12.followOffset))
        : 16,
      v264 = num18 * v256,
      v265 = v263 >= v264 + 12;
    ((element7.style.bottom = v265
      ? "calc(100% + " + Math.min(max3, v263 - v264 - 12) / v256 + "px)"
      : "auto"),
      (element7.style.top = v265 ? "auto" : "calc(100% + 8px)"),
      v259(element9, options12.floors, [96, 50], v257, num16, num17));
    const max4 = Math.max(12, Math.min(height * 0.56 - 400, height - 812));
    element5.style.setProperty("--i3d-navigation-bottom", Math.max(12, v263 - 50 * v256) + "px");
    const us2 = us({
      width: width3,
      height: height2,
      panelWidth: num19,
      panelHeight: v258,
      defaultTop: max4,
      defaultScale: 2,
      settings: options.popupLayout?.general,
    });
    (element14.style.setProperty("--i3d-control-top", us2.top + "px"),
      element14.style.setProperty("--i3d-control-scale", String(us2.scale)),
      (element14.style.right = us2.right + "px"),
      Object.assign(element5.style, {
        width: width3 + "px",
        height: height2 + "px",
        transform: v253 ? "scale(" + num7 + "," + v251 + ")" : "none",
      }));
    const stringify2 = JSON.stringify({
      fixedUi: v252,
      width: width3,
      height: height2,
      uiScaleX: num13,
      uiScaleY: num14,
    });
    (typeof text19 < "u" &&
      stringify2 !== text19 &&
      ((text19 = stringify2),
      v52({
        type: "presentation-ui",
        fixedUi: v252,
        width: width3,
        height: height2,
        uiScaleX: num13,
        uiScaleY: num14,
        sourceWidth: width2,
        sourceHeight: height,
      })),
      value6?.focused && (value6.targetInset = v247()),
      text9 && text9 !== "panel" && !value6 && ((num3 = v247()), arg2.setFocusViewport(num3)),
      fn78(true));
  }
  function fn54(arg233, v266 = element2) {
    const activeElement = document.activeElement;
    !activeElement ||
      !arg233.contains(activeElement) ||
      (v266.setAttribute("tabindex", "-1"),
      v266.focus({
        preventScroll: true,
      }),
      arg233.contains(document.activeElement) &&
        v266 !== element2 &&
        (element2.setAttribute("tabindex", "-1"),
        element2.focus({
          preventScroll: true,
        })),
      arg233.contains(document.activeElement) && activeElement.blur());
  }
  function fn55() {
    const v267 = value6?.owner === "floor" && !value6.markersRevealed,
      v268 = v194(),
      map18 = new Map(v268.map((arg234) => [arg234.id, arg234])),
      some =
        !v6 &&
        !v7 &&
        v268.some(
          (arg235) =>
            arg235.visible !== false &&
            arg235.buttonHidden !== true &&
            arg235.hiddenClickable === true,
        ),
      v269 =
        v267 ||
        v16 ||
        v43 ||
        v55 ||
        (v30 && !some) ||
        (v19 && v12.hideIconsWhileRotating === true) ||
        !!(text9 && !["edit", "panel"].includes(text9));
    for (const [v270, element35] of map) {
      const v271 = map18.get(v270) || v217(v270),
        v272 = !v6 && v271?.buttonHidden === true,
        v273 = !v6 && !v7 && !v272 && v271?.hiddenClickable === true;
      element35.disabled =
        value6?.owner === "floor" || v272 || (!v6 && (v14() || v271?.overviewQuip === true));
      const active =
          !v6 &&
          (v271?.passiveSensor ||
            (v271?.deviceKind === "vacuum" && vacuumStatusPresentation2(v271, options2).active)),
        v274 = active ? v54 : element4;
      element35.parentElement !== v274 && v274.append(element35);
      const v275 = (v267 && active) || (!active && (v30 || v55) && !v273 && !v6 && !v7);
      (element35.classList.toggle("is-hidden-clickable", v273),
        element35.classList.toggle("is-idle-hidden", v275),
        v275 || v272 || (!v6 && (v14() || v271?.overviewQuip === true))
          ? (fn54(element35), element35.setAttribute("inert", ""))
          : element35.removeAttribute("inert"),
        (element35.title = v273 ? "" : element35.getAttribute("aria-label") || ""));
    }
    (v269
      ? (fn54(element4, element14.classList.contains("is-open") ? element14 : element2),
        element4.setAttribute("inert", ""))
      : value26
        ? element4.setAttribute("inert", "")
        : element4.removeAttribute("inert"),
      element4.removeAttribute("aria-hidden"),
      v269 && value11 === null ? (value11 = performance.now()) : v269 || (value11 = null),
      element4.classList.toggle("is-floor-concealed", v267),
      element4.classList.toggle("is-concealed", v269));
  }
  function fn56() {
    (element10.classList.toggle("is-follow-hidden", !!text11),
      (element10.inert = !!(text11 || value19)),
      element10.setAttribute("aria-hidden", String(!!(text11 || value19))));
    const v276 = v16 || !!(text2 && text9 && text9 !== "panel");
    for (const element36 of [element8, element9]) {
      const v277 =
        (v276 || (!!text11 && element36 === element9)) && !(v10 && element36 === element8);
      (element36.classList.toggle("is-focus-hidden", v277),
        (element36.inert = v277),
        element36.setAttribute("aria-hidden", String(v277)));
    }
  }
  function fn57() {
    v16 && ((v16 = false), fn55(), fn78(true), fn56());
  }
  function fn58() {
    fn56();
    const max5 = Number.isFinite(options.popupOpacity)
      ? Math.max(0, Math.min(100, options.popupOpacity))
      : 74;
    element14.style.setProperty("--i3d-panel-opacity", String(max5 / 100));
    const max6 = Number.isFinite(options.focusVignetteStrength)
      ? Math.max(0, Math.min(60, options.focusVignetteStrength))
      : 14;
    (element6.style.setProperty("--i3d-vignette-opacity", String(max6 / 100)),
      (element6.hidden = v7 || text9 === "edit" || text9 === "panel"),
      element6.classList.toggle("is-active", max6 > 0 && !!text2 && !!text9 && !element6.hidden),
      (element27.hidden = !v7 && text9 !== "edit" && !(v6 && !text9)),
      (element27.textContent =
        text9 === "edit"
          ? "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存视角。"
          : v6 && !v7
            ? "拖动空白处旋转 · 右键平移 · 滚轮缩放。临时查看不改变已保存视角。"
            : "拖动旋转 · 右键平移 · 滚轮缩放。调整完成后固定视角。"),
      element4.classList.toggle("is-view-editing", v7 || text9 === "edit"),
      element14.classList.toggle("is-preview", v6),
      fn43(),
      fn55());
  }
  function fn59(arg236) {
    if (!value6) return;
    const now = performance.now(),
      v278 = now - arg236 > 50 ? now : arg236,
      max7 = Math.max(v278, value6.lastFrame ?? value6.started);
    (value6.firstFrame && ((value6.lastFrame = max7), (value6.firstFrame = false)),
      (value6.elapsed += Math.min(50, Math.max(0, max7 - (value6.lastFrame ?? max7)))),
      (value6.lastFrame = max7));
    const v279 = value6,
      elapsed = value6.elapsed,
      progress = value6.transition.progress(elapsed);
    ((value6.amount = progress),
      (num3 = value6.inset + (value6.targetInset - value6.inset) * progress));
    const sample = value6.transition.sample(elapsed);
    (value6.owner === "floor" && arg2.advanceFloorTransition?.(progress, sample),
      arg2.applyCameraFrame
        ? arg2.applyCameraFrame(sample, progress, num3)
        : (arg2.applyCameraPose(sample, progress), arg2.setFocusViewport(num3)),
      value6.owner === "floor" &&
        progress >= 0.9 &&
        !value6.presentationRevealed &&
        ((value6.presentationRevealed = true), fn43()),
      value6.owner === "floor" &&
        progress >= 0.9 &&
        !value6.markersRevealed &&
        ((value6.markersRevealed = true), fn55(), fn78(true)),
      value6.owner === "focus" && !value6.focused && progress >= 0.99 && fn57(),
      value6.transition.settled(elapsed) &&
        value6 === v279 &&
        ((value6 = null), arg2.endCameraMotion(), fn52(), v279.done?.(), fn64()));
  }
  function fn60(arg237) {
    if (!arg237) return arg237;
    if (arg237.view !== "top")
      return arg2.constrainCameraPose({
        ...arg237,
        up: [0, 1, 0],
      });
    const vector3 = new v2.Vector3(...arg237.target),
      max8 = Math.max(new v2.Vector3(...arg237.position).distanceTo(vector3), 0.001),
      degToRad = v2.MathUtils.degToRad(arg237.topRotation || 0),
      vector4 = new v2.Vector3(...(arg237.up || [Math.sin(degToRad), 0, -Math.cos(degToRad)]));
    return (
      (vector4.y = 0),
      vector4.lengthSq() < 1e-12 && vector4.set(Math.sin(degToRad), 0, -Math.cos(degToRad)),
      arg2.constrainCameraPose({
        ...arg237,
        position: [vector3.x, vector3.y + max8, vector3.z],
        up: vector4.normalize().toArray(),
      })
    );
  }
  function fn61(arg238, arg239, v280 = false, arg240, v281 = "focus", v282 = null) {
    const v283 = v281 === "follow-return" ? arg238 : fn60(arg238),
      beginCameraMotion = arg2.beginCameraMotion(v283.mode, v283, v281);
    v281 === "floor" && arg2.setFloorSlideCameras?.(beginCameraMotion, v283);
    const v284 = v280 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ((value6 = {
      from: beginCameraMotion,
      to: structuredClone(v283),
      inset: num3,
      targetInset: arg239 ? v247() : 0,
      transition: createDampedCameraMotion2(v2, beginCameraMotion, v283, {
        immediate: v284,
        owner: v281,
        floorFrame: v282,
      }),
      focused: arg239,
      owner: v281,
      started: performance.now(),
      elapsed: 0,
      done: arg240,
    }),
      (v281 !== "focus" || arg239) && fn57(),
      fn64(),
      fn52(),
      fn59(value6.started),
      value6 && (value6.firstFrame = true),
      v26());
  }
  function fn62(arg241, arg242) {
    return (
      arg241.mode === arg242.mode &&
      Math.abs(arg241.zoom - arg242.zoom) < 0.000001 &&
      ["position", "target", "up"].every((arg243) =>
        (arg241[arg243] || [0, 1, 0]).every(
          (arg244, arg245) => Math.abs(arg244 - (arg242[arg243] || [0, 1, 0])[arg245]) < 0.000001,
        ),
      ) &&
      ["frameSize", "focalLength"].every(
        (arg246) => Math.abs((arg241[arg246] || 0) - (arg242[arg246] || 0)) < 0.000001,
      )
    );
  }
  const v285 = createIdleRotation2({
      returnToBase(arg247) {
        ((v19 = true),
          (value7 = structuredClone(
            v12.autoRotate.returnToDefault === true
              ? fn60(options.camera || value4 || arg2.cameraState())
              : arg2.cameraState(true),
          )));
        const v286 = !!(text2 || text9);
        ((text2 = ""),
          (text9 = ""),
          (value5 = null),
          (v16 = false),
          fn54(element14),
          element14.classList.remove("is-open"),
          element14.setAttribute("inert", ""),
          fn58(),
          v286 &&
            v52({
              type: "focus-state",
              active: false,
            }),
          arg2.setOrbitPivot(null),
          !value6 && !num3 && fn62(arg2.cameraState(), value7)
            ? arg247()
            : fn61(value7, false, false, arg247, "idle"));
      },
      start() {
        ((v18 = true), arg2.beginCameraMotion(value7.mode), fn52());
      },
      rotate(arg248) {
        arg2.applyCameraPose(arg2.orbitCameraPose(value7, arg248));
      },
      stop() {
        const v287 = value6?.owner === "idle",
          v288 = v18;
        ((v18 = false),
          (v19 = false),
          (v55 = false),
          (num5 = 0),
          (text10 = arg2.camera.quaternion?.toArray?.().join(",") || ""),
          fn55(),
          v287 && (value6 = null),
          (v287 || v288) && arg2.endCameraMotion(),
          fn52());
      },
    }),
    v289 = createIdleIconVisibility2({
      onChange(arg249) {
        ((v30 = arg249), fn55());
      },
    }),
    v290 = createIdleFocusExit2({
      onExit: () => fn69(),
    });
  function fn63() {
    ((v12 = resolvePageBehavior2(options, text4)),
      v285.configure(v12.autoRotate),
      v289.configure(v12.idleHideIcons),
      v290.configure(v12.idleExitFocus),
      fn52(),
      v12.hideIconsWhileRotating || ((v55 = false), (num5 = 0)));
  }
  function fn64() {
    const v291 = v11 && v17 && v8 && !v6 && !v7 && !v22 && !document.hidden && !v9;
    (v291 || fn67(),
      v285.setAvailable(
        v291 && !text11 && !text2 && !text9 && !(value6 && value6.owner !== "idle"),
      ),
      v290.setAvailable(v291 && !!text2 && ["runtime", "panel"].includes(text9) && !value6),
      v289.setAvailable(v291));
    const v292 = !v9 && !document.hidden && (!v20 || v21);
    (value8?.setAvailable(v292),
      v156.setAvailable(v292),
      v157.setAvailable(v292),
      document.body?.classList.toggle("is-render-suspended", !v292),
      (document.hidden || !v21) && v28.suspend(),
      v26());
  }
  function fn65() {
    const v293 = v31 || set.size > 0 || set2.size > 0;
    (v285.hold(v293), v289.hold(v293), v290.hold(v293), v26());
  }
  function fn66(arg250) {
    (text11 && arg250.key === "Escape" && fn24(),
      (v44 = performance.now()),
      (v43 = false),
      fn55(),
      arg250.type === "pointerdown" && set.add(arg250.pointerId),
      (arg250.type === "pointerup" || arg250.type === "pointercancel") &&
        set.delete(arg250.pointerId),
      arg250.type === "keydown" && set2.add(arg250.code || arg250.key),
      arg250.type === "keyup" && set2.delete(arg250.code || arg250.key),
      fn65());
  }
  const list13 = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup",
  ];
  for (const v294 of list13)
    window.addEventListener(v294, fn66, {
      capture: true,
      passive: true,
    });
  function fn67() {
    (set.clear(), set2.clear(), (v31 = false), fn65());
  }
  window.addEventListener("blur", fn67);
  function fn68() {
    (document.hidden &&
      value30 &&
      v399({
        pointerId: value30.pointerId,
      }),
      fn64());
  }
  document.addEventListener && document.addEventListener("visibilitychange", fn68);
  function fn69(v295 = {}) {
    if (
      (v80.cancelPending?.(),
      v64.close(),
      v67.cancel(),
      v108.deactivate(),
      typeof v111 < "u" && v111.deactivate(),
      v236()?.deviceKind === "vacuum" &&
        v52({
          type: "vacuum-popup-close",
        }),
      v236()?.deviceKind === "camera" &&
        v52({
          type: "camera-popup-close",
        }),
      v118.hide(),
      v116.hide(),
      !text2 && !text9 && (!value5 || v295.immediate !== true))
    )
      return;
    const v296 = !!value12;
    value12 = null;
    const v297 = !!(text9 && v6);
    ((v16 = !!(
      value5 &&
      !v6 &&
      text9 !== "panel" &&
      v295.immediate !== true &&
      !v295.preserveCamera
    )),
      (text2 = ""),
      (text9 = ""),
      fn54(element14),
      element14.classList.remove("is-open"),
      element14.setAttribute("inert", ""),
      fn58(),
      v52({
        type: "focus-state",
        active: false,
      }),
      v295.preserveCamera
        ? ((value6 = null), (value5 = null), arg2.setOrbitPivot(null))
        : value5 &&
          fn61(value5, false, v295.immediate === true, () => {
            ((value5 = null), arg2.setOrbitPivot(null));
          }),
      fn64(),
      v297 &&
        v52({
          type: "edit",
          action: "focus-exited",
        }),
      v296 && fn51(),
      fn52());
  }
  function fn70(arg251, v298 = "runtime", v299 = false) {
    const vector5 = v217(arg251);
    if (
      !vector5 ||
      vector5.modelAvailable === false ||
      (text2 !== arg251 && (v64.close(), v67.cancel()), vector5.deviceKind === "lock")
    )
      return;
    if (
      (value12 && ((value12 = null), fn51()),
      text2 === arg251 && text9 === v298 && v298 === "runtime")
    ) {
      fn69();
      return;
    }
    if (!v6 && ["runtime", "panel"].includes(v298) && (!v8 || v14())) return;
    if ((v290.activity(), v298 === "panel")) {
      ((value5 || value6) &&
        fn69({
          immediate: true,
        }),
        (text2 = arg251),
        (text9 = "panel"),
        (element24.textContent = ""),
        element14.removeAttribute("inert"),
        element14.classList.add("is-open"),
        fn58(),
        fn72(),
        fn52(),
        fn64(),
        v52({
          type: "focus-state",
          active: false,
          panelOpen: true,
          id: arg251,
        }),
        fn32(vector5));
      return;
    }
    value5 ||= arg2.cameraState(true);
    const anchor2 = vector5.isCurtainGroup
        ? fn21(vector5)
        : vector5.deviceKind === "presence"
          ? v180.anchor(vector5.id.slice(9))
          : vector5.modelId
            ? arg2.environmentModelPose?.(vector5.floorId, vector5.modelId)
            : null,
      v300 =
        anchor2?.center ||
        arg2.worldPoint(vector5.floorId, vector5.x, vector5.y, vector5.height)?.toArray();
    if (!v300) return;
    ((text2 = arg251),
      (text9 = v298),
      (element24.textContent = ""),
      v6 || !v177(vector5) || vector5.clickAction !== "focus"
        ? (element14.removeAttribute("inert"), element14.classList.add("is-open"))
        : (element14.setAttribute("inert", ""), element14.classList.remove("is-open")),
      arg2.setOrbitPivot(null),
      fn58(),
      fn72());
    const camera = options.camera || value4 || value5,
      focusCamera =
        vector5.focusCamera ||
        (vector5.modelId
          ? automaticAirConditionerCamera2(
              v2,
              {
                ...camera,
                viewportAspect: element2.clientWidth / Math.max(1, element2.clientHeight),
              },
              v300,
              anchor2?.forward,
              anchor2?.size,
              vector5.deviceKind === "nas"
                ? {
                    minimumFrameSize: 0.7,
                    minimumDistance: 0.6,
                  }
                : {},
            )
          : automaticLightCamera2(v2, camera, v300));
    (v6 ||
      v52({
        type: "focus-state",
        active: true,
        id: arg251,
      }),
      fn61(focusCamera, true, v299, () => {}),
      (vector5.deviceKind === "camera" || vector5.deviceKind === "vacuum") && fn32(vector5));
  }
  (element13.addEventListener("click", () => {
    text9 || value5 || value6 ? fn69() : arg2.restoreCamera(fn60(options.camera || value4));
  }),
    element18.addEventListener("click", () => {
      const v301 = v236();
      v301 && fn76("power", !v237(v301.entityId).on);
    }));
  function fn71(arg252) {
    const max9 = Math.max(
        1,
        Math.min(100, Number(arg252.brightness) || (arg252.brightnessSupported ? 1 : 100)),
      ),
      v302 = (Math.max(2000, Math.min(6500, Number(arg252.kelvin) || 3000)) - 2000) / 4500,
      list14 = [255, 132, 42],
      list15 = [172, 225, 255],
      list16 =
        arg252.colorMode === "white"
          ? [255, 255, 255]
          : arg252.colorSupported &&
              !["color_temp", "onoff", "brightness", "unknown"].includes(arg252.colorMode) &&
              arg252.colorHs
            ? arg252.colorRgb || hsToRgbColor2(arg252.colorHs)
            : list14.map((arg253, arg254) => Math.round(arg253 + (list15[arg254] - arg253) * v302));
    (element18.classList.toggle("is-on", arg252.on),
      element18.setAttribute("aria-pressed", String(arg252.on)),
      element18.setAttribute(
        "aria-label",
        "" +
          (v236()?.label || arg252.name) +
          (arg252.available ? (arg252.on ? "已开启，点击关闭" : "已关闭，点击开启") : "当前不可用"),
      ),
      element18.style.setProperty("--i3d-lamp-color", "rgb(" + list16.join(",") + ")"),
      element18.style.setProperty(
        "--i3d-lamp-opacity",
        arg252.on && max9 > 0 ? String(0.08 + (max9 / 100) * 0.92) : "0",
      ),
      element18.style.setProperty("--i3d-lamp-scale", String(0.62 + (max9 / 100) * 1.05)));
  }
  function fn72() {
    element14.classList.toggle("is-airer-panel", !!v236()?.airer);
    const v303 = v236();
    if (!(v303?.deviceKind === "lock")) v123.hide();
    else {
      v123.root.hidden = false;
      for (const v304 of [
        element15,
        element20,
        element24,
        v80.root,
        v108.root,
        v111.root,
        v117.root,
        v118.root,
        v116.root,
        v119.root,
      ])
        v304.hidden = true;
      (element14.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "is-nas-panel",
        "is-television-panel",
        "has-light-controls",
      ),
        element14.setAttribute("aria-label", "门"),
        v123.update({
          item: v303,
          states: options2,
          editing: v6 || !v8 || !v303.modelAvailable,
        }));
      return;
    }
    const v305 = v303?.isCurtainGroup === true;
    if (
      (typeof v111 < "u" && (v111.root.hidden = !v305),
      element14.classList.toggle("is-cover-group-panel", v305),
      element14.classList.toggle(
        "is-cover-group-vertical",
        v305 && v303.panelLayout === "vertical",
      ),
      !v305 && typeof v111 < "u" && v111.deactivate(),
      ["vacuum", "presence", "camera"].includes(v303?.deviceKind))
    ) {
      (element14.classList.remove("is-open"), element14.setAttribute("inert", ""));
      return;
    }
    const v306 = isGenericDeviceKind2(v303?.deviceKind);
    typeof v119 < "u" && (v119.root.hidden = !v306);
    const v307 = v303?.deviceKind === "speaker";
    !v307 || !element14.classList.contains("is-open") ? v116.hide() : (v116.root.hidden = false);
    const v308 = v303?.deviceKind === "nas",
      v309 = v303?.deviceKind === "television";
    if (
      (!v309 || !element14.classList.contains("is-open") ? v118.hide() : (v118.root.hidden = false),
      (v117.root.hidden = !v308),
      element14.classList.toggle("is-nas-panel", v308),
      element14.classList.toggle("is-television-panel", v309 || v307),
      v308 || v309 || v307 || v306)
    ) {
      (element14.classList.remove(
        "is-cover-panel",
        "is-climate-panel",
        "has-light-controls",
        "has-error",
      ),
        element14.classList.toggle("is-climate-panel", v306),
        element14.setAttribute(
          "aria-label",
          v306
            ? (v303.deviceLabel || genericDeviceProfile2(v303.deviceKind)?.label || "设备") + "控制"
            : v307
              ? "智能音响控制"
              : v309
                ? "电视状态"
                : "NAS 状态",
        ),
        v303.clickAction === "focus" &&
          !v6 &&
          (element14.classList.remove("is-open"), element14.setAttribute("inert", "")),
        (v80.root.hidden =
          v108.root.hidden =
          element15.hidden =
          element20.hidden =
          element24.hidden =
            true),
        v307
          ? (v6 || v303.clickAction !== "focus") &&
            element14.classList.contains("is-open") &&
            v116.update({
              item: v303,
              states: options2,
              editing: v6 || !v8 || !v303.modelAvailable,
            })
          : v309
            ? (v6 || v303.clickAction !== "focus") &&
              element14.classList.contains("is-open") &&
              v118.update({
                item: v303,
                states: options2,
                editing: v6 || !v8,
              })
            : v306 && typeof v119 < "u"
              ? v119.update({
                  item: v303,
                  states: options2,
                  editing: v6 || !v8 || !v303.modelAvailable,
                })
              : v117.update({
                  item: v303,
                  states: options2,
                }));
      return;
    }
    const v310 = v303?.deviceKind === "cover",
      v311 = !!v303?.modelId && !v310;
    if (
      ((v80.root.hidden = !v311),
      (v108.root.hidden = !v310 || v305),
      typeof v111 < "u" && (v111.root.hidden = !v305),
      (element15.hidden = element20.hidden = element24.hidden = v311 || v310),
      element14.classList.toggle("is-cover-panel", v310),
      element14.classList.toggle("is-climate-panel", v311),
      element14.setAttribute(
        "aria-label",
        v310
          ? v303.airer
            ? "晾衣架控制"
            : "窗帘控制"
          : v311
            ? v303.waterHeater
              ? "热水器控制"
              : v303.pedestalFan
                ? "电风扇控制"
                : v303.airPurifier
                  ? "空气净化器控制"
                  : "空调控制"
            : "灯光控制",
      ),
      !v303)
    )
      return fn69();
    if (v310) {
      if ((element14.classList.remove("has-light-controls", "has-error"), v305)) {
        const entries3 = Object.fromEntries(
            v303.memberItems.map((arg255) => [
              arg255.id,
              coverState2(arg255.entityId, options2[arg255.entityId], arg255),
            ]),
          ),
          entries4 = Object.fromEntries(
            v303.memberItems.map((arg256) => [arg256.id, fn6(arg256, entries3[arg256.id])]),
          );
        typeof v111 < "u" &&
          v111.update({
            item: v303,
            states: entries3,
            presentations: entries4,
            editing: v6 || !v8,
            errors: Object.fromEntries(
              v303.memberItems.map((arg257) => [
                arg257.id,
                arg257.modelAvailable
                  ? entries4[arg257.id]?.error || ""
                  : "窗帘模型已移除，请重新配置。",
              ]),
            ),
          });
      } else {
        const v312 = coverState2(v303.entityId, options2[v303.entityId], v303);
        v303.modelAvailable || (v312.available = false);
        const v313 = fn6(v303, v312);
        v108.update({
          item: v303,
          state: v312,
          states: options2,
          presentation: v313,
          editing: v6 || !v8,
          error: v303.modelAvailable ? v313.error || "" : "窗帘模型已移除，请重新配置。",
        });
      }
      return;
    }
    if (v311) {
      element14.classList.remove("has-light-controls", "has-error");
      const v314 = climateState2(v303.entityId, options2[v303.entityId]);
      (v303.modelAvailable || (v314.available = false),
        v80.update({
          item: v303,
          state: v314,
          states: options2,
          editing: v6 || !v8 || !v303.modelAvailable,
          error: v303.modelAvailable ? "" : "设备模型已移除，请重新配置。",
        }));
      return;
    }
    const v315 = fn49(v303);
    ((element16.textContent = v303.label || v315.name),
      (element17.textContent = v303.entityId
        ? v315.available
          ? v315.on
            ? "已开启"
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备"),
      (element16.title = element16.textContent),
      (element24.title = element24.textContent),
      fn71(v315),
      element17.classList.toggle("is-on", v315.available && v315.on));
    const some2 = [...map2.values()].some((arg258) => arg258.entityId === v303.entityId);
    (element14.classList.toggle("is-command-pending", some2 && v315.available && !v6),
      element14.setAttribute("aria-busy", String(some2)));
    const colorSupported =
        v315.brightnessSupported || v315.temperatureSupported || v315.colorSupported,
      text20 =
        v315.colorMode === "white"
          ? "white"
          : v315.colorMode === "color_temp" && v315.temperatureSupported
            ? "temperature"
            : v315.colorSupported
              ? "color"
              : "temperature",
      options13 = {
        color: v315.colorSupported,
        temperature: v315.temperatureSupported,
        white: v315.colorModes?.includes("white"),
      };
    (v64.update({
      modes: options13,
      value: text20,
      disabled: v6 || !v315.available,
      entity: v303.entityId,
    }),
      v67.update({
        entityId: v303.entityId,
        hs: v315.colorHs,
        visible: v315.colorSupported && text20 === "color",
        enabled: !v6 && v315.available,
      }),
      element14.classList.toggle("has-light-controls", colorSupported),
      element14.classList.toggle("has-color-controls", v315.colorSupported && text20 === "color"),
      element14.classList.toggle("has-error", !!element24.textContent),
      (v6 || !v315.available || !v315.on) && fn54(element20, element14),
      colorSupported
        ? element20.removeAttribute("inert")
        : (fn54(element20, element14), element20.setAttribute("inert", "")),
      element20.removeAttribute("aria-hidden"),
      (element18.disabled = v6 || !v315.available),
      (v76.input.min = 0),
      (v76.input.max = 100),
      (v75.input.min = v315.minimum),
      (v75.input.max = v315.maximum));
    for (const [v316, v317, v318, v319] of [
      [v76, v315.brightnessSupported, v315.brightness, "%"],
      [v75, v315.temperatureSupported && text20 === "temperature", v315.kelvin, " K"],
    ])
      ((v316.root.hidden = !v317),
        (v316.input.disabled = v6 || !v315.available),
        v316 === v76 && !v315.on && v317 && (v316.input.value = "0"),
        document.activeElement !== v316.input &&
          ((v316.input.value = v318 ?? (v316 === v76 ? 100 : v315.minimum)),
          (v316.value.value = v318 === null ? "—" : "" + v318 + v319)));
    element22.hidden =
      v315.colorSupported || (!v315.brightnessSupported && !v315.temperatureSupported);
    for (const v320 of map5) {
      const round = Math.round(
          v315.minimum + ((v315.maximum - v315.minimum) * v320.temperaturePercent) / 100,
        ),
        on =
          v315.on &&
          (!v315.brightnessSupported || Math.abs(v315.brightness - v320.brightness) <= 4) &&
          (!v315.temperatureSupported ||
            Math.abs(v315.kelvin - round) <= Math.max(50, (v315.maximum - v315.minimum) * 0.06));
      ((v320.button.disabled = v6 || !v315.available || element22.hidden),
        v320.button.classList.toggle("is-active", on),
        v320.button.setAttribute("aria-pressed", String(on)),
        (v320.detail.textContent = v315.brightnessSupported ? v320.brightness + "%" : "开启"));
    }
  }
  function fn73(arg259, arg260) {
    const v321 = String(++num),
      entityId2 = arg259.entityId;
    vector.retain(entityId2, arg260);
    const setTimeout9 = setTimeout(() => fn75(v321, "请求超时，请检查设备状态。", true), 14000);
    (map2.set(v321, {
      entityId: entityId2,
      command: arg259,
      previewToken: arg260,
      timeout: setTimeout9,
      next: null,
    }),
      v52({
        type: "control",
        requestId: v321,
        command: arg259,
      }));
  }
  function fn74(arg261, arg262) {
    const v322 = [...map2.values()].find((arg263) => arg263.entityId === arg261.entityId);
    if (!v322) return fn73(arg261, arg262);
    const command = v322.next?.command || v322.command;
    if (command.service === "turn_on" && arg261.service === "turn_on") {
      const options14 = {
        ...command.data,
      };
      (("brightness" in arg261.data || "brightness_pct" in arg261.data) &&
        (delete options14.brightness, delete options14.brightness_pct),
        ["hs_color", "rgb_color", "color_temp_kelvin", "white"].some(
          (arg264) => arg264 in arg261.data,
        ) &&
          (delete options14.hs_color,
          delete options14.rgb_color,
          delete options14.color_temp_kelvin,
          delete options14.white),
        (arg261 = {
          ...arg261,
          data: {
            ...options14,
            ...arg261.data,
          },
        }));
    }
    ((v322.next = {
      command: arg261,
      previewToken: arg262,
    }),
      vector.hold(arg261.entityId, arg262));
  }
  function fn75(arg265, v323 = "", v324 = false) {
    const v325 = map2.get(arg265);
    if (!v325) return;
    (clearTimeout(v325.timeout), map2.delete(arg265));
    const next = v325.next,
      available =
        next &&
        !v324 &&
        !v9 &&
        !v6 &&
        v8 &&
        text4 === "light" &&
        text3 !== "all" &&
        (options.lights || []).some((arg266) => v15(arg266) && arg266.entityId === v325.entityId) &&
        v41(v325.entityId).available;
    (v323
      ? vector.reject(v325.entityId, v325.previewToken)
      : vector.acknowledge(v325.entityId, v325.previewToken),
      available
        ? fn73(next.command, next.previewToken)
        : next && vector.reject(v325.entityId, next.previewToken),
      v236()?.entityId === v325.entityId && (element24.textContent = available ? "" : v323),
      fn80());
  }
  async function fn76(arg267, arg268, v326 = v236()) {
    if (!(!v326 || v6 || v9))
      try {
        const v327 = fn49(v326);
        let v328,
          v329 = arg268;
        if (arg267 === "preset") {
          if (!Po.includes(arg268)) throw new Error("灯光预设无效。");
          const list17 = [];
          if (
            ((v329 = {}),
            v327.brightnessSupported &&
              (list17.push(["brightness", arg268.brightness]),
              (v329.brightness = arg268.brightness)),
            v327.temperatureSupported &&
              ((v329.kelvin = Math.round(
                v327.minimum + ((v327.maximum - v327.minimum) * arg268.temperaturePercent) / 100,
              )),
              list17.push(["temperature", v329.kelvin])),
            !list17.length)
          )
            throw new Error("此设备不支持灯光预设。");
          const map19 = list17.map(([v330, v331]) =>
            lightCommand2(v326.entityId, v330, v331, v327),
          );
          ((v328 = {
            ...map19[0],
            data: Object.assign({}, ...map19.map((arg269) => arg269.data)),
          }),
            v327.brightnessSupported &&
              arg268.brightness < 100 &&
              (delete v328.data.brightness, (v328.data.brightness_pct = arg268.brightness)));
        } else v328 = lightCommand2(v326.entityId, arg267, arg268, v327);
        const set7 = vector.set(v326.entityId, arg267, v329, true);
        (fn51({
          preview: arg267 !== "power",
        }),
          fn74(v328, set7),
          (element24.textContent = ""),
          fn80());
      } catch (v332) {
        ((element24.textContent = v332.message), fn72());
      }
  }
  function fn77(arg270, v333 = false) {
    if (!v6 && v14()) return;
    const v334 = v217(arg270);
    if (
      !v334 ||
      v334.modelAvailable === false ||
      (!v6 && (v334.overviewQuip || v334.passiveSensor)) ||
      (text11 && !v6) ||
      (!v6 && ["temperature-humidity", "smallcar"].includes(v334.deviceKind)) ||
      (!v6 && v334.deviceKind === "lock")
    )
      return;
    const text21 = v334.clickAction || "focus";
    if (v6) {
      ((text = arg270),
        v52({
          type: "edit",
          action: "select",
          id: arg270,
        }),
        fn80());
      return;
    }
    if (v334.deviceKind === "camera") {
      v8 && v334.entityId && fn70(arg270);
      return;
    }
    if (v334.deviceKind === "vacuum-room") {
      if (!v8 || !v334.entityId || map14.has(arg270)) return;
      const setTimeout10 = setTimeout(() => {
        map14.delete(arg270);
        const element37 = map.get(arg270);
        element37 && ((element37.disabled = false), (element37.title = "请求超时，请检查设备状态"));
      }, 14000);
      (map14.set(arg270, setTimeout10),
        map.get(arg270) && (map.get(arg270).disabled = true),
        v52({
          type: "vacuum-room",
          id: arg270,
          vacuumId: v334.vacuumId,
          shortcutId: v334.shortcutId,
        }));
      return;
    }
    const includes3 = ["turn-on", "turn-on-focus", "turn-on-panel"].includes(text21),
      v335 = () => {
        const text22 = text21 === "turn-on-panel" ? "panel" : "runtime";
        (text2 === arg270 && text9 === text22) || fn70(arg270, text22);
      },
      v336 = (arg271) => {
        if (v9) return;
        const v337 = map.get(arg270);
        (v337 && (v337.title = arg271.message),
          text2 === arg270 && ((element24.textContent = arg271.message), fn72()));
      };
    if (v334.deviceKind === "television" && includes3) {
      if (!v8) return;
      const v338 = televisionPower2(v334, options2);
      if (
        (text21 !== "turn-on" && !v338.on && v335(),
        !v338.available ||
          !v338.supported ||
          [...map9.values()].some((arg272) => arg272.entityId === v338.entityId))
      )
        return;
      v113(v338.command, v334).catch(v336);
      return;
    }
    if (v177(v334)) {
      const active2 =
        v333 && v334.deviceKind === "vacuum" && vacuumStatusPresentation2(v334, options2).active;
      fn70(arg270, active2 || v334.clickAction === "panel" ? "panel" : "runtime");
      return;
    }
    if (v334.deviceKind === "cover") {
      if (includes3) {
        if (!v8) return;
        const filter9 = (v334.isCurtainGroup ? v334.memberItems : [v334])
            .filter((arg273) => arg273.modelAvailable !== false)
            .map((arg274) => ({
              item: arg274,
              state: fn6(arg274),
            }))
            .filter(({ state: v339 }) => v339.available),
          some3 = filter9.some(({ state: v340 }) => v340.moving),
          some4 = filter9.some(
            ({ state: v341 }) => v341.on || v341.position > 0 || v341.state === "open",
          ),
          text23 = some3 ? "stop_cover" : some4 ? "close_cover" : "open_cover";
        text21 !== "turn-on" && !some3 && !some4 && v335();
        const set8 = new Set();
        for (const { item: v342, state: v343 } of filter9)
          if (!(
            (text23 === "open_cover" && !v343.closedConfirmed) ||
            (some3 && !v343.moving) ||
            set8.has(v342.entityId)
          ))
            try {
              const v344 = coverControl2(v343, text23);
              (set8.add(v342.entityId), options4.onControl(v344, v342).catch(v336));
            } catch (v345) {
              v336(v345);
            }
        return;
      }
      fn70(arg270, text21 === "panel" ? "panel" : "runtime");
      return;
    }
    if (v334.modelId) {
      const v346 = climateState2(v334.entityId, options2[v334.entityId]);
      if (
        (v334.climateType === "bath-heater" || v334.airPurifier || v334.waterHeater) &&
        !v334.entityId
      ) {
        fn70(arg270, text21 === "turn-on-panel" ? "panel" : "runtime");
        return;
      }
      const includes4 = ["turn-on-focus", "turn-on-panel"].includes(text21);
      if (text21 === "turn-on" || (includes4 && v346.available && v346.on)) {
        (v80.update({
          item: v334,
          state: v346,
          states: options2,
          editing: v6 || !v8 || !v334.modelAvailable,
        }),
          v80.power?.({
            toggle: true,
          }));
        return;
      }
      ((text21 === "turn-on-focus" && text2 === arg270 && text9 === "runtime") ||
        fn70(arg270, text21 === "turn-on-panel" ? "panel" : "runtime"),
        text21 !== "focus" &&
          text2 === arg270 &&
          v80.power?.({
            toggle: false,
          }));
      return;
    }
    const v347 = v237(v334.entityId);
    if (text21 === "turn-on") {
      v347.available && fn76("power", !v347.on, v334);
      return;
    }
    if (["turn-on-focus", "turn-on-panel"].includes(text21) && v347.available && v347.on) {
      fn76("power", false, v334);
      return;
    }
    if (text21 === "turn-on-panel") {
      (fn70(arg270, "panel"), v347.available && !v347.on && fn76("power", true, v334));
      return;
    }
    ((text21 === "turn-on-focus" && text2 === arg270 && text9 === "runtime") || fn70(arg270),
      text2 === arg270 &&
        text9 === "runtime" &&
        text21 === "turn-on-focus" &&
        v347.available &&
        !v347.on &&
        fn76("power", true));
  }
  let text24 = "";
  function fn78(v348 = false) {
    if (v22 || v42 || v9) return;
    ((arg2.floorTransitionActive || value6) && v156.pause(), v156.update(), v157.update());
    const v349 = value11 !== null && performance.now() - value11 >= 240;
    if (v349 && !v54.childElementCount) {
      text24 = "";
      return;
    }
    (arg2.camera.updateMatrixWorld(),
      (v33 !== arg2.document || v34 !== text3) &&
        (map3.clear(), (v33 = arg2.document), (v34 = text3)));
    const boundingClientRect3 = value18 || element.getBoundingClientRect(),
      width4 = (v4() && value17?.width) || boundingClientRect3.width,
      height3 = (v4() && value17?.height) || boundingClientRect3.height;
    if (value26 && arg2.presentationPoint)
      for (const vector6 of value26.outgoing) {
        if (!vector6.node) continue;
        const presentationPoint = arg2.presentationPoint(
          vector6.floorId,
          vector6.x,
          vector6.y,
          vector6.height,
        );
        if (!presentationPoint) {
          vector6.node.hidden = true;
          continue;
        }
        const project = presentationPoint.project(arg2.camera);
        ((vector6.node.hidden =
          project.z < -1 ||
          project.z > 1 ||
          Math.abs(project.x) > 1.05 ||
          Math.abs(project.y) > 1.05),
          (vector6.node.style.left = ((project.x + 1) * width4) / 2 + "px"),
          (vector6.node.style.top = ((1 - project.y) * height3) / 2 + "px"));
      }
    const v350 = text3 === "all" && arg2.document.uniformOverviewStack === true,
      v351 =
        width4 +
        ":" +
        height3 +
        ":" +
        v350 +
        ":" +
        arg2.camera.matrixWorld.elements +
        ":" +
        arg2.camera.projectionMatrix.elements;
    if (!(v348 !== true && !arg2.floorTransitionActive && v351 === text24)) {
      text24 = v351;
      for (const v352 of v194()) {
        const options15 =
            value3?.id === v352.id
              ? {
                  ...v352,
                  ...value3.point,
                }
              : v352,
          v353 = options15.id,
          element38 = map.get(v353);
        if (!element38 || (v349 && element38.parentElement === element4)) continue;
        const v354 =
          (v6 || options15.deviceKind !== "presence") &&
          (v6 || options15.visible !== false) &&
          (v6 || options15.buttonHidden !== true) &&
          options15.modelAvailable !== false &&
          (text3 === "all" || options15.floorId === text3);
        let vector7 = map3.get(v353);
        v354 &&
          (!vector7 ||
            vector7.floorId !== options15.floorId ||
            vector7.x !== options15.x ||
            vector7.y !== options15.y ||
            vector7.height !== options15.height) &&
          ((vector7 = {
            floorId: options15.floorId,
            x: options15.x,
            y: options15.y,
            height: options15.height,
            point: arg2.worldPoint(options15.floorId, options15.x, options15.y, options15.height),
          }),
          map3.set(v353, vector7));
        const presentationPoint2 =
          v354 &&
          ((arg2.floorTransitionActive || v350) && arg2.presentationPoint
            ? arg2.presentationPoint(options15.floorId, options15.x, options15.y, options15.height)
            : vector7?.point);
        if (!presentationPoint2) {
          element38.hidden = true;
          continue;
        }
        const project2 = v32.copy(presentationPoint2).project(arg2.camera);
        ((element38.hidden =
          project2.z < -1 ||
          project2.z > 1 ||
          Math.abs(project2.x) > 1.05 ||
          Math.abs(project2.y) > 1.05),
          (element38.style.left = ((project2.x + 1) * width4) / 2 + "px"),
          (element38.style.top = ((1 - project2.y) * height3) / 2 + "px"));
      }
    }
  }
  function fn79(arg275, arg276) {
    if (v6) return arg276;
    const list18 = [];
    for (const [v355, element39] of map) {
      if (element39.hidden || element39.disabled || element39.closest("[inert]")) continue;
      const computedStyle2 = getComputedStyle(element39);
      if (computedStyle2.pointerEvents === "none" || computedStyle2.visibility === "hidden")
        continue;
      const boundingClientRect4 = element39.getBoundingClientRect();
      boundingClientRect4.width > 0 &&
        boundingClientRect4.height > 0 &&
        list18.push({
          id: v355,
          rect: boundingClientRect4,
          width:
            ((parseFloat(element39.style.width) || element39.offsetWidth) *
              boundingClientRect4.width) /
            element39.offsetWidth,
          height:
            ((parseFloat(element39.style.height) || element39.offsetHeight) *
              boundingClientRect4.height) /
            element39.offsetHeight,
        });
    }
    return fs(list18, arg275.clientX, arg275.clientY) || arg276;
  }
  function fn80(v356 = null) {
    if (v42) return;
    (v26(), element4.classList.toggle("is-editing", v6));
    const filter10 = v194().filter((arg277) => v6 || arg277.deviceKind !== "presence"),
      set9 = new Set(filter10.map((arg278) => arg278.id));
    let v357 = false;
    for (const [v358, v359] of map)
      set9.has(v358) || (v359.remove(), map.delete(v358), map3.delete(v358), (v357 = true));
    for (const v360 of filter10) {
      let element40 = map.get(v360.id);
      if (element40 && v356 && !v356.affects(v360)) continue;
      if (((v357 = true), !element40)) {
        ((element40 = v53(
          v360.passiveSensor ||
            ["temperature-humidity", "smallcar", "lock"].includes(v360.deviceKind)
            ? "div"
            : "button",
          "i3d-marker",
        )),
          (element40.type = "button"));
        const ms2 = ms((arg279) => fn79(arg279, v360.id));
        (element40.addEventListener("pointerdown", (arg280) => {
          v6 || ms2.down(arg280);
        }),
          element40.addEventListener("pointermove", (arg281) => ms2.move(arg281)),
          element40.addEventListener("pointerup", (arg282) => ms2.up(arg282)),
          element40.addEventListener("pointercancel", () => ms2.cancel()),
          element40.addEventListener("click", (arg283) => {
            if (
              (arg283.stopPropagation(),
              v217(v360.id)?.passiveSensor ||
                v42 ||
                v7 ||
                text9 === "edit" ||
                (!v6 && v217(v360.id)?.buttonHidden === true))
            )
              return;
            if (element40.dataset.dragged === "true") {
              element40.dataset.dragged = "";
              return;
            }
            const v361 = !v6 && arg283.detail > 0 ? fn79(arg283, v360.id) : v360.id,
              target = v6 ? v360.id : ms2.target(arg283, v361);
            target && fn77(target, true);
          }),
          element40.addEventListener("pointerdown", (arg284) => fn82(arg284, v360.id)),
          element40.addEventListener("pointermove", fn83),
          element40.addEventListener("pointerup", fn84),
          element40.addEventListener("pointercancel", fn85),
          element4.append(element40),
          map.set(v360.id, element40));
      }
      const icon2 = /^mdi:[a-z0-9-]+$/.test(v360.icon || "") ? v360.icon : "",
        v362 = v360.deviceKind === "vacuum",
        v363 = v360.deviceKind === "vacuum-room";
      if (v360.isCurtainGroup) {
        const map20 = v360.memberItems.map((arg285) =>
            /^mdi:[a-z0-9-]+$/.test(arg285.icon || "") ? arg285.icon : "mdi:curtains",
          ),
          join = map20.join("|");
        element40.dataset.groupIcons !== join &&
          ((element40.dataset.groupIcons = join),
          element40.replaceChildren(
            ...map20.map((arg286) => {
              const element41 = v53("span", "i3d-marker-icon i3d-curtain-group-icon"),
                v364 = 'url("/bridge-static/vendor/mdi/7.4.47/svg/' + arg286.slice(4) + '.svg")';
              return (
                element41.style.setProperty("mask-image", v364),
                element41.style.setProperty("-webkit-mask-image", v364),
                element41
              );
            }),
          ));
      } else {
        if (
          !v362 &&
          v360.deviceKind !== "smallcar" &&
          v360.deviceKind !== "temperature-humidity" &&
          element40.dataset.icon !== icon2
        ) {
          if (((element40.dataset.icon = icon2), icon2)) {
            const element42 = v53("span", "i3d-marker-icon");
            element42.setAttribute("aria-hidden", "true");
            const v365 = 'url("/bridge-static/vendor/mdi/7.4.47/svg/' + icon2.slice(4) + '.svg")';
            (element42.style.setProperty("mask-image", v365),
              element42.style.setProperty("-webkit-mask-image", v365),
              element40.replaceChildren(element42));
          } else element40.innerHTML = sa;
        }
      }
      const options16 = v360.isCurtainGroup
          ? {
              available: v360.memberItems.some(
                (arg287) =>
                  coverState2(arg287.entityId, options2[arg287.entityId], arg287).available,
              ),
              on: v360.memberItems.some((arg288) =>
                coverIconIsOn2(
                  arg288,
                  coverState2(arg288.entityId, options2[arg288.entityId], arg288),
                ),
              ),
            }
          : v360.deviceKind === "temperature-humidity"
            ? {
                available: ls([v360]).some(({ entityId: v366 }) => ar(options2[v366]).available),
                on: false,
              }
            : v360.deviceKind?.startsWith("vacuum")
              ? {
                  available: !!(
                    options2[v360.entityId] &&
                    !["unknown", "unavailable"].includes(options2[v360.entityId].state)
                  ),
                  on: options2[v360.entityId]?.state === "cleaning",
                }
              : v360.deviceKind === "lock"
                ? (() => {
                    const v367 = lockState2(v360, options2);
                    return {
                      available: v367.available,
                      on: v367.state === "unlocked" || v367.state === "open",
                      name: v360.label || "门",
                      lock: v367,
                    };
                  })()
                : v360.deviceKind === "speaker"
                  ? speakerState2(v360, options2)
                  : v360.deviceKind === "television"
                    ? televisionState2(v360, options2)
                    : v360.deviceKind === "smallcar"
                      ? carState2(v360, options2)
                      : isGenericDeviceKind2(v360.deviceKind)
                        ? deviceStatus2(v360, options2)
                        : v360.deviceKind === "nas"
                          ? nasDeviceState2(v360, options2)
                          : v360.deviceKind === "cover"
                            ? coverState2(v360.entityId, options2[v360.entityId], v360)
                            : v360.modelId
                              ? v360.waterHeater && !v360.entityId
                                ? deviceStatus2(v360, options2)
                                : v360.airPurifier
                                  ? purifierState2(v360, options2)
                                  : v360.climateType === "bath-heater"
                                    ? bathHeaterState2(v360, options2)
                                    : climateState2(v360.entityId, options2[v360.entityId])
                              : v237(v360.entityId),
        size = Number.isFinite(v360.size) && v360.size > 0 ? v360.size : 44,
        iconSize =
          Number.isFinite(v360.iconSize) && v360.iconSize > 0
            ? v360.iconSize
            : v362
              ? 26
              : Math.min(size, Math.max(4, size - 18)),
        hitSize =
          Number.isFinite(v360.hitSize) && v360.hitSize > 0 ? v360.hitSize : Math.max(44, size),
        num21 = 1,
        num22 = 1,
        v368 = num21,
        v369 = size * num21,
        v370 = size * num22,
        v371 = iconSize * num21,
        v372 = iconSize * num22,
        v373 = hitSize * num21,
        v374 = hitSize * num22;
      if (
        ((element40.style.width = v373 + "px"),
        (element40.style.height = v374 + "px"),
        v360.isCurtainGroup &&
          ((element40.style.width =
            Math.max(v373, v369 * 2 + 4 * num21, v371 * 2 + 12 * num21) + "px"),
          (element40.style.height = Math.max(v374, v370, v372 + 8 * num22) + "px")),
        element40.classList.toggle("is-vacuum-status", v362),
        element40.classList.toggle("is-curtain-group", v360.isCurtainGroup === true),
        element40.classList.toggle("is-overview-quip", v360.overviewQuip === true),
        (element40.style.pointerEvents =
          v360.overviewQuip || (v360.passiveSensor && v360.deviceKind !== "temperature-humidity")
            ? "none"
            : ""),
        element40.classList.toggle(
          "is-presence-wave",
          v360.passiveSensor === true && v360.deviceKind !== "temperature-humidity",
        ),
        element40.classList.toggle(
          "is-security-label",
          v360.deviceKind === "lock" ||
            v360.deviceKind === "camera" ||
            v360.deviceKind === "presence",
        ),
        element40.classList.toggle("is-lock-label", v360.deviceKind === "lock"),
        element40.classList.toggle(
          "is-temperature-humidity",
          v360.deviceKind === "temperature-humidity",
        ),
        element40.classList.toggle(
          "is-editable-temperature-humidity",
          v360.deviceKind === "temperature-humidity" && v6,
        ),
        v360.deviceKind === "temperature-humidity")
      ) {
        let selector = element40.querySelector(".i3d-temperature-humidity-card");
        if (!selector) {
          selector = v53("span", "i3d-temperature-humidity-card");
          const v375 = v53("span", "i3d-environment-header"),
            v376 = v53("span", "i3d-environment-battery"),
            element43 = v53("i", "i3d-meter-icon");
          element43.setAttribute("aria-hidden", "true");
          const text25 = "url('/bridge-static/vendor/mdi/7.4.47/svg/battery.svg')";
          (element43.style.setProperty("mask-image", text25),
            element43.style.setProperty("-webkit-mask-image", text25),
            v376.append(
              element43,
              v53("span", "i3d-meter-label", "电量"),
              v53("span", "i3d-meter-number"),
            ),
            v375.append(v53("strong", "i3d-temperature-humidity-title"), v376),
            selector.append(v375, v53("span", "i3d-temperature-humidity-values")));
          for (const { key: v377, label: v378, icon: v379 } of cr) {
            const element44 = v53("span", "i3d-meter-reading is-" + v377),
              element45 = v53("i", "i3d-meter-icon");
            element45.setAttribute("aria-hidden", "true");
            const v380 = "url('/bridge-static/vendor/mdi/7.4.47/svg/" + v379 + ".svg')";
            (element45.style.setProperty("mask-image", v380),
              element45.style.setProperty("-webkit-mask-image", v380),
              element44.setAttribute("aria-label", v378),
              (element44.title = v378),
              element44.append(
                element45,
                v53("span", "i3d-meter-label", v378),
                v53("span", "i3d-meter-number"),
                v53("span", "i3d-meter-unit"),
              ),
              selector.lastElementChild.append(element44));
          }
          element40.replaceChildren(selector);
        }
        const selector2 = selector.querySelector(".i3d-temperature-humidity-title");
        ((selector2.textContent = v360.label ?? "环境标签"),
          (selector2.hidden = !selector2.textContent));
        const v381 = v360.showMetricNames !== false;
        selector.classList.toggle("is-metric-names-hidden", !v381);
        const selector3 = selector.querySelector(".i3d-environment-battery"),
          ar2 = ar(options2[v360.batteryEntityId]);
        ((selector3.hidden = !v360.batteryEntityId),
          (selector3.querySelector(".i3d-meter-label").hidden = !v381),
          selector3.classList.toggle("is-unavailable", !ar2.available));
        const v382 = "" + ar2.value + (ar2.available ? ar2.unit || "%" : "");
        ((selector3.querySelector(".i3d-meter-number").textContent = v382),
          selector3.setAttribute("aria-label", "电量 " + v382),
          (selector.querySelector(".i3d-environment-header").hidden =
            selector2.hidden && selector3.hidden));
        const some5 = cr.some(({ key: v383 }) => v360[v383 + "EntityId"]);
        selector.querySelector(".i3d-temperature-humidity-values").hidden = !some5;
        for (const { key: v384 } of cr) {
          const v385 = v360[v384 + "EntityId"],
            ar3 = ar(options2[v385]),
            selector4 = selector.querySelector(".is-" + v384);
          ((selector4.hidden = !v385),
            (selector4.querySelector(".i3d-meter-label").hidden = !v381),
            selector4.classList.toggle("is-unavailable", !ar3.available),
            (selector4.querySelector(".i3d-meter-number").textContent = ar3.value));
          const selector5 = selector4.querySelector(".i3d-meter-unit");
          ((selector5.textContent = ar3.unit), (selector5.hidden = !ar3.unit));
        }
        const min = Math.min(600, Math.max(100, Number(v360.size) || 180));
        ((selector.style.fontSize = Math.min(24, Math.max(9, Number(v360.iconSize) || 12)) + "px"),
          selector.style.setProperty(
            "--meter-background-opacity",
            String(Number.isFinite(v360.opacity) ? Math.min(1, Math.max(0, v360.opacity)) : 1),
          ),
          (selector.style.width = min + "px"),
          ds(selector, v360.columns),
          (selector.style.transformOrigin = "top left"),
          (selector.style.transform = "scale(" + num21 + ", " + num22 + ")"),
          (element40.style.width =
            Math.min(600, Math.max(100, Number(v360.size) || 180)) * num21 + "px"),
          (element40.style.height = Math.max(44, selector.offsetHeight || 48) * num22 + "px"),
          element40.setAttribute("role", v6 ? "button" : "group"),
          v6 ? element40.setAttribute("tabindex", "0") : element40.removeAttribute("tabindex"));
      }
      if (
        (element40.classList.toggle("is-car-status", v360.deviceKind === "smallcar"),
        v360.deviceKind === "smallcar" &&
          (updateCarCard2(element40, v360, options2),
          (element40.style.pointerEvents = v6 ? "" : "none"),
          element40.setAttribute("role", v6 ? "button" : "group"),
          v6 ? element40.setAttribute("tabindex", "0") : element40.removeAttribute("tabindex")),
        v362)
      ) {
        element40.style.setProperty(
          "--label-background-opacity",
          String(po(v360.backgroundOpacity)),
        );
        let selector6 = element40.querySelector(".i3d-vacuum-status");
        (!selector6 || selector6.dataset.compact !== String(v360.overviewQuip === true)) &&
          ((selector6 = v53("span", "i3d-vacuum-status")),
          (selector6.dataset.compact = String(v360.overviewQuip === true)),
          v360.overviewQuip ||
            (selector6.append(
              v53("strong", "i3d-vacuum-status-name"),
              v53("span", "i3d-vacuum-status-detail"),
            ),
            selector6.lastElementChild.append(
              v53("span", "i3d-vacuum-status-text"),
              v53("span", "i3d-vacuum-status-battery"),
            )),
          selector6.append(v53("span", "i3d-vacuum-quip")),
          v360.overviewQuip &&
            (Object.assign(selector6.style, {
              opacity: ".55",
              pointerEvents: "none",
              background: "none",
              border: "none",
              boxShadow: "none",
              backdropFilter: "none",
              webkitBackdropFilter: "none",
            }),
            (selector6.lastElementChild.style.pointerEvents = "none")),
          element40.replaceChildren(selector6));
        const v386 = vacuumStatusPresentation2(v360, options2),
          v387 = v369 / 44,
          v388 = v370 / 44;
        v360.overviewQuip ||
          ((selector6.querySelector(".i3d-vacuum-status-name").textContent =
            v360.label || "扫地机器人"),
          (selector6.querySelector(".i3d-vacuum-status-text").textContent = v386.status),
          (selector6.querySelector(".i3d-vacuum-status-battery").textContent = v386.battery));
        const selector7 = selector6.querySelector(".i3d-vacuum-quip");
        ((selector7.textContent = v386.active
          ? vacuumQuip2(v360, options2, performance.now())
          : ""),
          (selector7.hidden = !selector7.textContent),
          (selector6.style.transform = "translate(-50%,-50%) scale(" + v387 + "," + v388 + ")"),
          (selector6.style.fontSize = Math.max(8, iconSize / 2) + "px"));
        const max10 = Math.max(v360.overviewQuip ? 28 : 50, selector6.offsetHeight);
        ((element40.style.width = Math.max(v373, 140 * v387) + "px"),
          (element40.style.height = Math.max(v374, max10 * v388) + "px"),
          (element40.dataset.status = v386.status),
          (element40.title =
            (v360.label || "扫地机器人") + " · " + v386.status + " · " + v386.battery),
          (options16.on = v386.active),
          (options16.available = v386.available));
      }
      if (
        v360.deviceKind === "lock" ||
        v360.deviceKind === "camera" ||
        v360.deviceKind === "presence"
      ) {
        const v389 = options2[v360.entityId]?.newState || options2[v360.entityId],
          lock = v360.deviceKind === "lock" ? options16.lock : null,
          available2 =
            v360.deviceKind === "lock"
              ? lock.available
              : v360.deviceKind === "camera"
                ? cameraOnline2(v389)
                : v389?.available !== false &&
                  !!v389?.state &&
                  !["unknown", "unavailable"].includes(v389.state);
        if (
          ((options16.available = available2),
          (options16.on =
            v360.deviceKind === "lock"
              ? lock.state === "unlocked" || lock.state === "open"
              : v360.deviceKind === "camera"
                ? v389?.state === "recording"
                : v389?.state === "on"),
          v360.passiveSensor)
        )
          (element40.querySelector(".i3d-sensor-wave") ||
            element40.replaceChildren(...[0, 1, 2].map(() => v53("span", "i3d-sensor-wave"))),
            (element40.hidden = !available2),
            element40.setAttribute("aria-hidden", "true"),
            element40.classList.toggle("is-inactive", !available2));
        else {
          const v390 = v360.deviceKind === "presence" && v6;
          element40.classList.toggle("is-sensor-choice", v390);
          let selector8 = element40.querySelector(".i3d-security-label");
          (selector8 ||
            ((selector8 = v53("span", "i3d-security-label")),
            selector8.append(v53("strong"), v53("span")),
            element40.append(selector8)),
            (selector8.children[0].textContent =
              v360.label ||
              (v360.deviceKind === "lock"
                ? "门"
                : v360.deviceKind === "camera"
                  ? "摄像头"
                  : "人体传感器")));
          const entityId3 =
            v360.deviceKind === "lock" &&
            (v360.doorEntityId ||
              v360.doorEventEntityId ||
              v360.doorOpenEntityId ||
              v360.doorCloseEntityId ||
              v360.batteryEntityId ||
              v360.entityId);
          if (
            ((selector8.children[1].textContent =
              v6 && !(v360.deviceKind === "lock" ? entityId3 : v360.entityId)
                ? "未绑定实体"
                : available2
                  ? v360.deviceKind === "lock"
                    ? "" +
                      (lock.doorOpen === true
                        ? "已打开"
                        : lock.doorOpen === false
                          ? "已关闭"
                          : "状态未知") +
                      (v360.batteryEntityId && lock.battery !== "—" ? " · " + lock.battery : "")
                    : v360.deviceKind === "presence"
                      ? v389.state === "on"
                        ? "有人"
                        : "检测中"
                      : "在线"
                  : "离线"),
            (selector8.children[1].hidden = v390),
            selector8.classList.toggle("is-camera-status", v360.deviceKind === "camera"),
            selector8.classList.toggle("is-lock-status", v360.deviceKind === "lock"),
            selector8.classList.toggle("is-camera-offline", !available2),
            (selector8.hidden = !v211(v360, lock)),
            (selector8.style.fontSize = (v360.fontSize || 12) + "px"),
            selector8.style.setProperty(
              "--label-background-opacity",
              String(po(v360.backgroundOpacity)),
            ),
            v360.deviceKind === "camera" || v360.deviceKind === "lock")
          ) {
            const selector9 = element40.querySelector(".i3d-marker-icon");
            (selector9 && selector9.parentNode !== selector8 && selector8.append(selector9),
              selector8.style.setProperty("--i3d-marker-icon-size", iconSize + "px"));
          }
          (element40.style.setProperty("--i3d-security-scale", String(v369 / 44)),
            element40.style.setProperty("--i3d-security-scale-y", String(v370 / 44)),
            (element40.style.width =
              Math.max(
                v373,
                ((v360.deviceKind === "camera" ? selector8.offsetWidth || 0 : v390 ? 120 : 180) *
                  v369) /
                  44,
              ) + "px"),
            (element40.style.height =
              Math.max(
                v374,
                ((v360.deviceKind === "camera" ? selector8.offsetHeight || 0 : v390 ? 32 : 58) *
                  v370) /
                  44,
              ) + "px"));
        }
      }
      if (
        (element40.classList.toggle("i3d-vacuum-room", v363),
        element40.classList.toggle("is-icon-hidden", v363 && v360.iconHidden === true),
        v363)
      ) {
        let selector10 = element40.querySelector(".i3d-room-label");
        (selector10 || ((selector10 = v53("span", "i3d-room-label")), element40.append(selector10)),
          (selector10.textContent = v360.label || "清扫"),
          (selector10.hidden = v360.labelHidden === true),
          (selector10.style.fontSize = (v360.fontSize || 12) * v368 + "px"));
      }
      (element40.style.setProperty("--i3d-marker-size", v369 + "px"),
        element40.style.setProperty("--i3d-marker-size-y", v370 + "px"),
        element40.style.setProperty("--i3d-marker-icon-size", v371 + "px"),
        element40.style.setProperty("--i3d-marker-icon-size-y", v372 + "px"),
        v360.deviceKind !== "smallcar" &&
          element40.setAttribute(
            "aria-label",
            v360.overviewQuip
              ? vacuumQuip2(v360, options2, performance.now())
              : v360.label || options16.name || "灯光",
          ),
        !v362 &&
          v360.deviceKind !== "smallcar" &&
          (element40.title = v360.label || options16.name));
      const playing =
        v360.deviceKind === "speaker"
          ? options16.available && options16.playing
          : v360.deviceKind === "cover"
            ? coverIconIsOn2(v360, options16)
            : options16.on;
      (element40.classList.toggle("is-on", !v362 && v360.deviceKind !== "smallcar" && playing),
        element40.classList.toggle("is-offline", !v6 && !options16.available),
        element40.classList.toggle("is-nas", v360.deviceKind === "nas"),
        element40.classList.toggle("is-selected", v6 && text === v360.id));
    }
    ((!v356 || v356.lighting) && fn51(undefined, v356), (!v356 || v356.environment) && fn43());
    const v391 = !v356 || !!(text2 && v356.affects(v236()));
    (v391 && fn72(), (!v356 || v357 || v391) && (fn53(), fn55(), fn78(true)));
  }
  function fn81(arg289, arg290) {
    const worldPoint = arg2.worldPoint(arg290.floorId, 0, 0, arg290.height);
    if (!worldPoint) return null;
    const boundingClientRect5 = element.getBoundingClientRect(),
      v392 = new v2.Raycaster(),
      v393 = new v2.Vector2(
        ((arg289.clientX - boundingClientRect5.left) / boundingClientRect5.width) * 2 - 1,
        1 - ((arg289.clientY - boundingClientRect5.top) / boundingClientRect5.height) * 2,
      );
    arg2.presentationRay
      ? arg2.presentationRay(arg290.floorId, v393, v392)
      : v392.setFromCamera(v393, arg2.camera);
    const intersectPlane = v392.ray.intersectPlane(
      new v2.Plane(new v2.Vector3(0, 1, 0), -worldPoint.y),
      new v2.Vector3(),
    );
    if (!intersectPlane) return null;
    const sub = arg2.worldPoint(arg290.floorId, 1, 0, arg290.height).sub(worldPoint),
      sub2 = arg2.worldPoint(arg290.floorId, 0, 1, arg290.height).sub(worldPoint),
      sub3 = intersectPlane.sub(worldPoint);
    return {
      x: Math.round((sub3.dot(sub) / sub.lengthSq()) * 100) / 100,
      y: Math.round((sub3.dot(sub2) / sub2.lengthSq()) * 100) / 100,
    };
  }
  function fn82(arg291, arg292) {
    if (!v6 || text9 || arg291.button !== 0) return;
    (arg291.preventDefault(), arg291.stopPropagation());
    const vector8 = v217(arg292);
    if (!vector8) return;
    if (vector8.deviceKind === "presence") {
      ((text = arg292),
        fn43(),
        v52({
          type: "edit",
          action: "select",
          id: arg292,
        }));
      return;
    }
    ((text = arg292),
      fn43(),
      v52({
        type: "edit",
        action: "select",
        id: arg292,
      }));
    const vector9 = fn81(arg291, vector8);
    ((value3 = {
      id: arg292,
      pointerId: arg291.pointerId,
      clientX: arg291.clientX,
      clientY: arg291.clientY,
      original: {
        x: vector8.x,
        y: vector8.y,
      },
      point: {
        x: vector8.x,
        y: vector8.y,
      },
      height: vector8.height,
      offset: vector9
        ? {
            x: vector8.x - vector9.x,
            y: vector8.y - vector9.y,
          }
        : {
            x: 0,
            y: 0,
          },
      moved: false,
    }),
      arg291.currentTarget.setPointerCapture(arg291.pointerId),
      (arg2.controls.enabled = false));
  }
  function fn83(arg293) {
    if (
      !value3 ||
      value3.pointerId !== arg293.pointerId ||
      (Math.hypot(arg293.clientX - value3.clientX, arg293.clientY - value3.clientY) < 4 &&
        !value3.moved)
    )
      return;
    const vector10 = fn81(arg293, v217(value3.id));
    vector10 &&
      ((value3.moved = true),
      (value3.point = {
        x: Math.round((vector10.x + value3.offset.x) * 100) / 100,
        y: Math.round((vector10.y + value3.offset.y) * 100) / 100,
      }),
      text4 === "light" && Object.assign(v217(value3.id), value3.point),
      fn78(true));
  }
  function fn84(arg294) {
    if (!(!value3 || value3.pointerId !== arg294.pointerId)) {
      if (value3.moved) {
        arg294.currentTarget.dataset.dragged = "true";
        const v394 = v217(value3.id),
          v395 =
            v394.deviceKind === "temperature-humidity"
              ? options.environment?.temperatureHumidity?.find((arg295) => arg295.id === v394.id)
              : v394.isCurtainGroup
                ? options.environment?.curtainGroups?.find(
                    (arg296) => curtainGroupEntryId2(arg296) === v394.id,
                  )
                : v394.deviceKind === "camera"
                  ? options.security?.cameras?.find((arg297) => "camera:" + arg297.id === v394.id)
                  : v394.deviceKind === "vacuum-room"
                    ? options.devices?.vacuums
                        ?.find((arg298) => arg298.id === v394.vacuumId)
                        ?.shortcuts?.find((arg299) => arg299.id === v394.shortcutId)
                    : text4 === "light"
                      ? v394
                      : (isGenericDeviceKind2(text4)
                          ? options.devices?.[genericDeviceProfile2(text4).collection] || []
                          : ["nas", "television", "speaker", "vacuum"].includes(text4)
                            ? options.devices?.[
                                text4 === "vacuum"
                                  ? "vacuums"
                                  : text4 === "speaker"
                                    ? "speakers"
                                    : text4 === "television"
                                      ? "televisions"
                                      : "nas"
                              ] || []
                            : options.environment?.[
                                text4 === "airer"
                                  ? "airers"
                                  : text4 === "cover"
                                    ? "curtains"
                                    : text4 === "water-heater"
                                      ? "waterHeaters"
                                      : text4 === "fan"
                                        ? "fans"
                                        : text4 === "purifier"
                                          ? "airPurifiers"
                                          : "airConditioners"
                              ] || []
                        ).find((arg300) => arg300.id === value3.id),
          options17 = {
            ...value3.point,
          };
        if (v394.deviceKind === "smallcar") {
          const v396 = arg2.document.floors
            .find((arg301) => arg301.id === v394.floorId)
            ?.scene.items.find((arg302) => arg302.id === v394.modelId);
          ((options17.x -= v396?.x ?? 0), (options17.y -= v396?.y ?? 0));
        }
        (v395 && Object.assign(v395, options17),
          v52({
            type: "edit",
            action: "position",
            id: v394.id,
            ...options17,
          }));
      }
      ((value3 = null), fn52());
    }
  }
  function fn85() {
    (value3 && text4 === "light" && Object.assign(v217(value3.id), value3.original),
      (value3 = null),
      fn52(),
      fn78(true));
  }
  let vector11,
    value30 = null;
  const v397 = (arg303) => (arg303.pointerType === "touch" ? 8 : 5);
  (element2.addEventListener(
    "pointerdown",
    (arg304) => {
      if (!(
        arg304.isPrimary === false ||
        (arg304.button != null && arg304.button !== 0) ||
        v22 ||
        text11 ||
        value3 ||
        (!v8 && !v6 && !v7) ||
        text2 ||
        text9
      )) {
        if (value6?.owner === "floor") {
          if (!(value6.amount >= 0.999) || !value6.presentationRevealed || !value6.markersRevealed)
            return;
          const v398 = value6;
          ((value6 = null),
            arg2.advanceFloorTransition?.(1, arg2.cameraState()),
            arg2.endCameraMotion(),
            v398.done?.(),
            arg2.setOrbitPivot(null),
            fn52(),
            fn64(),
            v26());
          return;
        }
        value6?.owner !== "focus" ||
          value6.focused ||
          ((value30 = {
            motion: value6,
            pointerId: arg304.pointerId,
            x: arg304.clientX,
            y: arg304.clientY,
            slop: v397(arg304),
            returnCamera: value5,
          }),
          (value6 = null),
          arg2.endCameraMotion(),
          fn52(),
          v26());
      }
    },
    {
      capture: true,
    },
  ),
    element2.addEventListener(
      "pointermove",
      (arg305) => {
        const vector12 = value30;
        !vector12 ||
          arg305.pointerId !== vector12.pointerId ||
          Math.hypot(arg305.clientX - vector12.x, arg305.clientY - vector12.y) < vector12.slop ||
          ((value30 = null),
          !value6 &&
            !text9 &&
            value5 === vector12.returnCamera &&
            ((value5 = null), arg2.setOrbitPivot(null), fn57(), fn64()));
      },
      {
        capture: true,
      },
    ));
  const v399 = (arg306) => {
    const v400 = value30;
    !v400 ||
      arg306.pointerId !== v400.pointerId ||
      ((value30 = null),
      !value6 &&
        !text9 &&
        value5 === v400.returnCamera &&
        fn61(v400.motion.to, false, false, v400.motion.done));
  };
  (element2.addEventListener("pointerup", v399, {
    capture: true,
  }),
    element2.addEventListener("pointercancel", v399, {
      capture: true,
    }),
    window.addEventListener("blur", () => {
      value30 &&
        v399({
          pointerId: value30.pointerId,
        });
    }),
    element2.addEventListener("pointerdown", (arg307) => {
      vector11 =
        (arg307.button == null || arg307.button === 0) && arg307.isPrimary !== false
          ? {
              x: arg307.clientX,
              y: arg307.clientY,
              id: arg307.pointerId,
              slop: v397(arg307),
              moved: false,
            }
          : null;
    }),
    element2.addEventListener("pointermove", (arg308) => {
      (vector11 &&
        (arg308.pointerId !== vector11.id ||
          Math.hypot(arg308.clientX - vector11.x, arg308.clientY - vector11.y) >= vector11.slop) &&
        (vector11.moved = true),
        vector11?.moved && !v22 && v28.interact(arg308));
    }),
    element2.addEventListener(
      "wheel",
      (arg309) => {
        v22 || v28.interact(arg309);
      },
      {
        passive: true,
      },
    ),
    element2.addEventListener("pointercancel", () => {
      vector11 = null;
    }),
    element2.addEventListener("pointerup", (arg310) => {
      const v401 =
        vector11 &&
        !vector11.moved &&
        vector11.id === arg310.pointerId &&
        Math.hypot(arg310.clientX - vector11.x, arg310.clientY - vector11.y) < vector11.slop;
      if (((vector11 = null), !v401 || text11 || text9 === "edit")) return;
      if (text9 && text9 !== "panel" && !v6) {
        fn69();
        return;
      }
      if (!v6 && v14()) return;
      const v402 = !value6 || (value6.owner === "focus" && !value6.focused && !text2 && !text9);
      if (text4 === "security" && !v6 && !v7 && v8 && v402) {
        const pick = v180.pick(
          arg310.clientX,
          arg310.clientY,
          arg2.camera,
          element2,
          options.security?.presenceSensors || [],
          value17,
        );
        if (pick) {
          fn70("presence:" + pick);
          return;
        }
      }
      if (!v14() && text4 !== "light" && !v7 && v402 && (v6 || v8)) {
        const v403 = arg2.pickEnvironmentModel?.(
            arg310.clientX,
            arg310.clientY,
            fn20(v194()),
            (arg310.pointerType === "touch" ? 10 : 5) * Math.min(value?.x || 1, value?.y || 1),
          ),
          v404 =
            v403 &&
            fn20(v194()).find(
              (arg311) => arg311.floorId === v403.floorId && arg311.modelId === v403.modelId,
            ),
          v405 = v404 && v217(v404.entryId || v404.id);
        if (v405) {
          fn77(v405.id);
          return;
        }
      }
      fn69();
    }),
    window.addEventListener("keydown", (arg312) => {
      arg312.key === "Escape" && fn69();
    }));
  function fn86(arg313) {
    if (
      arg313.origin !== location.origin ||
      arg313.source !== window.parent ||
      arg313.data?.channel !== "hb-i3d-v1"
    )
      return;
    const data = arg313.data;
    if ((data.type !== "states" && v26(), data.type === "presentation-layout"))
      Number.isFinite(data.width) &&
        data.width > 0 &&
        Number.isFinite(data.height) &&
        data.height > 0 &&
        ((value17 = {
          width: data.width,
          height: data.height,
        }),
        fn53());
    else {
      if (data.type === "config") {
        if (v42) {
          value13 = arg313;
          return;
        }
        ((v25 = data.rangeEditorOnly === true),
          (v23 = data.allowRangeEditing === true || data.editing === true),
          v22 &&
            (!v23 ||
              data.viewEditing === true ||
              data.properties?.lightingMode !== "region" ||
              data.properties?.floorSelection !== options3.floorSelection ||
              JSON.stringify(data.properties?.camera) !== JSON.stringify(options3.camera) ||
              JSON.stringify(data.properties?.lightRegionOverrides || {}) !==
                JSON.stringify(options3.lightRegionOverrides || {})) &&
            value9?.close(),
          (v43 = false),
          text2.startsWith("vacuum:") &&
            JSON.stringify(
              (options3.devices?.vacuums || []).find((arg314) => "vacuum:" + arg314.id === text2),
            ) !==
              JSON.stringify(
                (data.properties.devices?.vacuums || []).find(
                  (arg315) => "vacuum:" + arg315.id === text2,
                ),
              ) &&
            fn69({
              immediate: true,
            }),
          (data.editing ||
            data.viewEditing ||
            options3.floorSelection !== data.properties.floorSelection ||
            JSON.stringify(options3.floorCameras) !==
              JSON.stringify(data.properties.floorCameras)) &&
            ((text7 = ""), (text8 = "")),
          (options3 = structuredClone(data.properties)),
          !v13 &&
            !data.editing &&
            !data.viewEditing &&
            ((v13 = true), arg2.document.floors.length > 1 && (text7 = "all")),
          text7 &&
            text7 !== "all" &&
            !arg2.document.floors.some((arg316) => arg316.id === text7) &&
            (text7 = ""),
          (data?.editing ||
            data?.viewEditing ||
            (options3.floorSelection !== options.floorSelection && !text7)) &&
            arg2.finishFloorTransition?.(),
          arg2.setFloorGap?.(options3.floorGap),
          arg2.setUniformOverviewStack?.(options3.uniformOverviewStack),
          (data.properties = fn2({
            ...options3,
            ...(text7
              ? {
                  floorSelection: text7,
                }
              : {}),
          })),
          text7 && value4
            ? (data.properties.camera = value4)
            : text7 &&
              text7 !== options3.floorSelection &&
              (data.properties.camera = v45(options3.floorCameras?.[text7] || null, text7)),
          v285.activity(),
          v289.activity(),
          v290.activity());
        const v406 =
          (v7 && data.viewEditing !== true) ||
          JSON.stringify(options.camera) !== JSON.stringify(data.properties.camera);
        (text9 || value5 || value6) &&
          (v406 ||
            options.sceneStyle !== data.properties.sceneStyle ||
            options.wallOpacity !== data.properties.wallOpacity ||
            options.floorSelection !== data.properties.floorSelection ||
            v6 !== (data.editing === true) ||
            data.viewEditing === true ||
            (v6 && text !== (data.selectedId || ""))) &&
          (fn69({
            immediate: true,
          }),
          value6 && ((value6 = null), arg2.finishFloorTransition?.(), arg2.endCameraMotion()));
        const editingSecurityKind =
          data.editing === true && ["camera", "presence", "lock"].includes(data.editingSecurityKind)
            ? data.editingSecurityKind
            : "";
        ((data.editing !== true ||
          editingSecurityKind !== "lock" ||
          (text && text !== (data.selectedId || ""))) &&
          (value10 = null),
          (options = structuredClone(data.properties)),
          (v6 = data.editing === true),
          (text5 = editingSecurityKind),
          (v7 = data.viewEditing === true),
          (text = data.selectedId || ""),
          (options2 = data.states || {}),
          fn1(),
          (v10 = data.editorCanvas === true && !v6),
          document.body?.dataset &&
            (document.body.dataset.sceneStyle =
              options.sceneStyle === "warm-wood" ? "warm-wood" : "default"),
          v28.configure(options.backgroundTheme, options),
          (v8 = !v6 && data.interactive === true),
          (text6 = data.editingVacuumId || ""),
          (configuredModuleKinds2 = configuredModuleKinds(options)));
        let editingModule = v6
          ? [
              "security",
              "climate",
              "fan",
              "purifier",
              "water-heater",
              "airer",
              "cover",
              "nas",
              "television",
              "speaker",
              "vacuum",
              "vacuum-shortcut",
              "temperature-humidity",
              ...GENERIC_DEVICE_KINDS2,
            ].includes(data.editingModule)
            ? data.editingModule
            : "light"
          : ["overview", "security", "light", "devices", "vacuum"].includes(text4)
            ? text4
            : [
                  "nas",
                  "television",
                  "speaker",
                  "water-heater",
                  "airer",
                  ...GENERIC_DEVICE_KINDS2,
                ].includes(text4)
              ? "devices"
              : "environment";
        (!v6 &&
          editingModule !== "overview" &&
          !configuredModuleKinds2.includes(editingModule) &&
          (editingModule = "light"),
          text8 && !configuredModuleKinds2.includes(text8) && (text8 = ""),
          text4 !== editingModule &&
            (fn24(),
            fn69({
              immediate: true,
            }),
            fn45(),
            (text4 = editingModule),
            map3.clear()));
        for (const v407 of map2.values())
          v407.next &&
            (!v8 || !(options.lights || []).some((arg317) => arg317.entityId === v407.entityId)) &&
            (vector.reject(v407.entityId, v407.next.previewToken), (v407.next = null));
        (fn63(),
          fn64(),
          arg2.appearance(
            vo(
              v22
                ? {
                    ...options,
                    lightRegionOverrides: arg2.regionLighting.getOverrides(),
                  }
                : options,
            ),
          ));
        const floorSelection =
          arg2.document.floors.some((arg318) => arg318.id === options.floorSelection) ||
          options.floorSelection === "all"
            ? options.floorSelection
            : arg2.document.floors[0].id;
        (v6 ||
          (floorSelection === "all"
            ? (text4 = "overview")
            : text4 === "overview" && (text4 = "light")),
          text3 !== floorSelection
            ? (fn24(false),
              (text3 = floorSelection),
              arg2.setFloor(floorSelection),
              arg2.restoreCamera(fn60(options.camera || arg2.floorDefaultCamera?.(floorSelection))),
              (value4 = arg2.cameraState()))
            : v406 &&
              (arg2.restoreCamera(fn60(options.camera || value4)), (value4 = arg2.cameraState())),
          fn52(),
          (element7.hidden = true),
          fn58(),
          (v7 || (!v6 && !v8)) &&
            fn69({
              immediate: true,
            }),
          fn80());
        const v408 = ++num2;
        (v11 ? Promise.resolve() : arg2.whenPresented())
          .then(() => {
            v9 ||
              v408 !== num2 ||
              (v11 || (value4 = arg2.cameraState()),
              (v11 = true),
              fn64(),
              fn78(true),
              v5(),
              v52({
                type: "presented",
                configId: data.configId,
                camera: v45(arg2.cameraState(), options.floorSelection, true),
              }));
          })
          .catch((arg319) => {
            !v9 &&
              v408 === num2 &&
              v52({
                type: "error",
                message: arg319.message || "户型画面准备失败，请重新载入。",
              });
          });
      } else {
        if (data.type === "vacuum-room-result") {
          (clearTimeout(map14.get(data.id)), map14.delete(data.id));
          const element46 = map.get(data.id);
          (element46 && ((element46.disabled = false), (element46.title = data.error || "")),
            data.error && ((element12.hidden = false), (element12.textContent = data.error)));
        } else {
          if (data.type === "range-editor") {
            if (data.flush === true) {
              const text26 = !v23 || !v22 ? "请先打开照射范围编辑。" : "";
              (text26 || value9.flush(),
                v52({
                  type: "range-editor-state",
                  active: v22,
                  requestId: data.requestId,
                  ...(text26
                    ? {
                        error: text26,
                      }
                    : {}),
                }));
            } else {
              if (data.open === false) {
                v24 = !!data.requestId;
                try {
                  value9?.close();
                } finally {
                  v24 = false;
                }
                data.requestId &&
                  v52({
                    type: "range-editor-state",
                    active: false,
                    requestId: data.requestId,
                  });
              } else fn40(data.requestId);
            }
          } else {
            if (data.type === "range-save-result") value9?.setSaveStatus?.(data.error || "");
            else {
              if (data.type === "activity-state")
                ((v20 = true),
                  (v17 = data.visible === true),
                  (v21 =
                    data.presentedVisible === undefined ? v17 : data.presentedVisible === true),
                  (!v17 || !v21) &&
                    value30 &&
                    v399({
                      pointerId: value30.pointerId,
                    }),
                  arg2.setPresentedVisible?.(v21),
                  fn29(),
                  v17 || (v43 = false),
                  fn64());
              else {
                if (data.type === "user-activity")
                  ((v43 = false),
                    (v44 = performance.now()),
                    fn55(),
                    (v31 = data.held === true),
                    fn65());
                else {
                  if (data.type === "dismiss-focus")
                    (v285.activity(),
                      v289.activity(),
                      fn24(data.immediate !== true),
                      fn69({
                        immediate: data.immediate === true,
                      }));
                  else {
                    if (data.type === "states") {
                      const value31 =
                          data.patch === true ? createStateUpdatePlan2(options, data.states) : null,
                        v409 = (arg320) => JSON.stringify([v41(arg320), v237(arg320)]),
                        map21 = new Map(
                          (value31?.lightOnlyIds || []).map((arg321) => [arg321, v409(arg321)]),
                        );
                      ((options2 =
                        data.patch === true
                          ? {
                              ...options2,
                              ...(data.states || {}),
                            }
                          : data.states || {}),
                        fn1(value31));
                      for (const v410 of options.lights || [])
                        (data.patch !== true || Object.hasOwn(data.states || {}, v410.entityId)) &&
                          vector.reconcile(v410.entityId, v41(v410.entityId));
                      for (const [v411, v412] of map21)
                        v409(v411) === v412 && value31.changed.delete(v411);
                      (!value31 || value31.changed.size) && fn80(value31);
                    } else {
                      if (data.type === "control-result")
                        map9.has(data.requestId)
                          ? fn8(data.requestId, data.error)
                          : map8.has(data.requestId)
                            ? fn7(data.requestId, data.error)
                            : map6.has(data.requestId)
                              ? fn4(data.requestId, data.error)
                              : fn75(data.requestId, data.error || "", data.timedOut === true);
                      else {
                        if (data.type === "editor-command" && v6)
                          try {
                            if (data.command === "preview-lock-motion") {
                              if (text5 !== "lock") throw new Error("请先选择门。");
                              const v413 = v217(data.id);
                              if (v413?.deviceKind !== "lock" || !v413.modelAvailable)
                                throw new Error("请选择可用的门模型。");
                              ((value10 = {
                                id: data.id,
                                open: data.value !== "closed",
                              }),
                                v26(),
                                fn52());
                              return;
                            } else {
                              if (data.command === "presence-top-view") {
                                const { floorId: options18, box: options19 } = data.value || {};
                                if (
                                  !options19 ||
                                  ![options19.x, options19.y, options19.w, options19.h].every(
                                    Number.isFinite,
                                  ) ||
                                  options19.w <= 0 ||
                                  options19.h <= 0
                                )
                                  throw new Error("顶视图范围无效。");
                                const worldPoint2 = arg2.worldPoint(
                                    options18,
                                    options19.x + options19.w / 2,
                                    options19.y + options19.h / 2,
                                    0,
                                  ),
                                  worldPoint3 = arg2.worldPoint(
                                    options18,
                                    options19.x,
                                    options19.y,
                                    0,
                                  ),
                                  worldPoint4 = arg2.worldPoint(
                                    options18,
                                    options19.x + options19.w,
                                    options19.y + options19.h,
                                    0,
                                  );
                                if (!worldPoint2 || !worldPoint3 || !worldPoint4)
                                  throw new Error("请选择有效楼层。");
                                const max11 = Math.max(
                                  Math.abs(worldPoint4.z - worldPoint3.z),
                                  Math.abs(worldPoint4.x - worldPoint3.x) /
                                    (element2.clientWidth / Math.max(1, element2.clientHeight)),
                                );
                                (fn69({
                                  immediate: true,
                                }),
                                  arg2.restoreCamera({
                                    mode: "orthographic",
                                    view: "top",
                                    topRotation: 0,
                                    position: [
                                      worldPoint2.x,
                                      worldPoint2.y + Math.max(20, max11 * 2),
                                      worldPoint2.z,
                                    ],
                                    target: worldPoint2.toArray(),
                                    up: [0, 0, -1],
                                    zoom: 1,
                                    frameSize: max11,
                                  }));
                              } else {
                                if (data.command === "presence-3d-view")
                                  (arg2.setCameraView?.("free"),
                                    arg2.restoreCamera(
                                      options.camera || arg2.floorDefaultCamera?.(text3) || value4,
                                    ));
                                else {
                                  if (data.command === "presence-preview-walk")
                                    ((v182 = data.value === true), fn27());
                                  else {
                                    if (data.command === "presence-show-hit-range")
                                      ((v183 = data.value === true), fn26());
                                    else {
                                      if (data.command === "edit-follow-camera") {
                                        const v414 = v217(data.id);
                                        if (v414?.deviceKind !== "vacuum")
                                          throw new Error("请选择扫地机。");
                                        fn70(data.id, "edit", true);
                                        const target2 =
                                          arg2.environmentModelPose(v414.floorId, v414.modelId)
                                            ?.center || arg2.cameraState().target;
                                        fn61(
                                          v414.followCamera ||
                                            vacuumBirdCamera2(
                                              options.camera || arg2.cameraState(),
                                              target2,
                                            ),
                                          false,
                                          true,
                                        );
                                      } else {
                                        if (data.command === "edit-light-camera")
                                          fn70(data.id, "edit", true);
                                        else {
                                          if (data.command === "preview-light-camera")
                                            fn70(data.id, "preview");
                                          else {
                                            if (data.command === "preview-device-panel")
                                              fn70(data.id, "panel");
                                            else {
                                              if (data.command === "preview-light-effect") {
                                                if (
                                                  ![
                                                    "brightnessMin",
                                                    "brightnessMax",
                                                    "temperatureMin",
                                                    "temperatureMax",
                                                    "defaults",
                                                  ].includes(data.value)
                                                )
                                                  throw new Error("请选择要预览的效果。");
                                                if (!v217(data.id))
                                                  throw new Error("灯光按钮已移除。");
                                                if (!v217(data.id).entityId)
                                                  throw new Error("请先绑定实体，再预览灯光效果。");
                                                (fn70(data.id, "preview"),
                                                  (value12 = {
                                                    id: data.id,
                                                    kind: data.value,
                                                  }),
                                                  fn51({
                                                    preview: true,
                                                  }),
                                                  fn72());
                                              } else {
                                                if (data.command === "cancel-light-camera")
                                                  fn69({
                                                    immediate: true,
                                                  });
                                                else {
                                                  if (text9 !== "edit" || data.id !== text2)
                                                    throw new Error("请先进入视角调整。");
                                                  (data.command === "focus-projection" &&
                                                    arg2.setCameraProjection(data.value),
                                                    data.command === "focus-focal-length" &&
                                                      arg2.setCameraFocalLength(data.value));
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            fn52();
                            const v415 = v48();
                            (v52({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              id: data.id,
                              camera: v415,
                            }),
                              data.command === "save-light-camera" &&
                                fn69({
                                  immediate: true,
                                }));
                          } catch (v416) {
                            v52({
                              type: "edit",
                              action: "focus-camera",
                              requestId: data.requestId,
                              error: v416.message,
                            });
                          }
                        else
                          data.type === "editor-command" &&
                            v7 &&
                            (data.command === "projection" && arg2.setCameraProjection(data.value),
                            data.command === "focal-length" &&
                              arg2.setCameraFocalLength(data.value),
                            fn52(),
                            (data.command === "save-camera" || data.requestId) &&
                              v52({
                                type: "edit",
                                action: "camera",
                                requestId: data.requestId,
                                camera: v48(),
                              }));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  window.addEventListener("message", fn86);
  const controls = arg2.controls,
    v417 = arg2.onCameraChange?.(() => {
      const cameraChanged = v156.cameraChanged();
      (fn78(), fn26(), (cameraChanged || v12.hideIconsWhileRotating === true) && v26());
    });
  v417 || controls.addEventListener("change", fn78);
  const resizeObserver = new ResizeObserver(fn53);
  (resizeObserver.observe(element),
    resizeObserver.observe(element14),
    resizeObserver.observe(element8),
    resizeObserver.observe(element9));
  async function fn87(arg322) {
    const savedScene = arg2.savedScene,
      v418 = v48(),
      now2 = performance.now(),
      v419 = (arg323) => {
        try {
          Promise.resolve(
            arg2.reportLifecycle?.(arg323, {
              sourceRevision: arg322?.revision,
              floorCount: arg322?.scene?.floors?.length,
              durationMs: Math.max(0, performance.now() - now2),
            }),
          ).catch(() => {});
        } catch {}
      };
    (v419("source-adopt-start"),
      (v43 = v43 || (v19 && v12.hideIconsWhileRotating === true) || v30),
      (v42 = true),
      v285.activity(),
      fn55());
    let v420 = () => {},
      v421 = false;
    const v422 = async (arg324) => {
      if ((arg2.finishFloorTransition?.(), await arg2.replaceScene(arg324), v9)) return;
      (arg2.setFloorGap?.(options3.floorGap),
        arg2.setUniformOverviewStack?.(options3.uniformOverviewStack));
      const floorSelection2 = text7 || options3.floorSelection,
        v423 =
          arg2.document.floors.some((arg325) => arg325.id === floorSelection2) ||
          floorSelection2 === "all"
            ? floorSelection2
            : arg2.document.floors[0].id;
      (text7 && (text7 = v423),
        (options = fn2({
          ...options3,
          floorSelection: v423,
        })),
        (text3 = v423),
        v423 === "all" ? (text4 = "overview") : text4 === "overview" && (text4 = "light"),
        arg2.setFloor(v423),
        arg2.appearance(vo(options)),
        (value4 = v45(options3.floorCameras?.[v423] || options3.camera || v418, v423)),
        arg2.restoreCamera(v45(v418, v423)),
        fn51({
          immediate: true,
        }),
        await arg2.whenPresented(),
        v9 ||
          fn51({
            immediate: true,
          }));
    };
    try {
      ((v420 = arg2.coverSceneUpdate()),
        arg2.setCameraInteraction({
          enabled: false,
        }),
        (v421 = true),
        await v422(arg322),
        v9 ||
          (v52({
            type: "model-metadata",
            metadata: fn89(),
          }),
          v419("source-adopt-complete")));
    } catch (v424) {
      throw (v419("source-adopt-failed"), v421 && !v9 && (await v422(savedScene)), v424);
    } finally {
      if (
        (v420(),
        (v42 = false),
        map3.clear(),
        (text24 = ""),
        !v9 && (fn52(), fn80(), fn78(true), value13))
      ) {
        const v425 = value13;
        ((value13 = null), fn86(v425));
      }
    }
  }
  const v426 = arg2.readSceneUpdate
    ? startSceneSync2({
        eligible: () =>
          !v9 &&
          v11 &&
          v17 &&
          !document.hidden &&
          !v6 &&
          !v7 &&
          !v10 &&
          !text9 &&
          !text11 &&
          !value6 &&
          !value3 &&
          !v22 &&
          !v42 &&
          !map2.size &&
          !map6.size &&
          !map8.size &&
          !map9.size &&
          !v126.isMoving() &&
          v94() === Infinity &&
          !v31 &&
          !set.size &&
          !set2.size &&
          performance.now() - v44 > 1200,
        read: (arg326) => arg2.readSceneUpdate(arg326),
        apply: fn87,
      })
    : () => {};
  function fn88(arg327) {
    if (v9 || document.hidden || v42 || num4 === 0) return Infinity;
    fn27();
    const floorTransitionActive2 = arg2.floorTransitionActive || value6?.owner === "floor";
    if ((arg2.recordFloorFrame?.(arg327, !!floorTransitionActive2), !floorTransitionActive2)) {
      (fn10(),
        fn12(),
        fn11(),
        fn13(),
        fn28(),
        v151.tick(arg327),
        v147.tick(arg327),
        v146.tick(arg327),
        v145.tick(arg327),
        v135.tick(arg327));
      for (const v427 of Object.values(entries2)) v427.tick(arg327);
      for (const v428 of Object.values(entries)) v428.tick(arg327);
      ([v88.tick(arg327), v89.tick(arg327)].some(Boolean) &&
        (fn5(), fn9(), v236()?.deviceKind === "cover" && fn72()),
        v126.update(arg327));
    }
    (fn29(),
      arg2.curtainFrame?.({
        key: v126.poseKey(),
        structure: v126.structureKey(),
        floorIds: list,
        moving: num4 > 0 && (v126.isMoving() || v94() <= 1000 / 30),
      }));
    const tick = v181.tick(arg327),
      tick2 = v154.tick(arg327);
    (floorTransitionActive2 || v155.tick(arg327),
      arg2.setEnvironmentActive?.(v154.isActive),
      fn59(arg327));
    const tick3 = v28.tick(arg327),
      tick4 = v178.tick(arg327);
    (v290.tick(arg327), v285.tick(arg327), v289.tick(arg327), vector.expire() && fn80());
    const min2 = num6 ? Math.min(0.1, (arg327 - num6) / 1000) : 0;
    num6 = arg327;
    const v429 = fn42(),
      tick5 = !floorTransitionActive2 && v29.tick(arg327, v429.bindings, v429.states);
    arg2.setLockMoving?.(tick5);
    const tick6 = !floorTransitionActive2 && v180.tick(min2);
    fn26();
    const tick7 = !floorTransitionActive2 && v179.tick(min2);
    tick7 && ((text24 = ""), fn78(true));
    const some6 = (options.devices?.vacuums || []).some(
        (arg328) => vacuumStatusPresentation2(arg328, options2).active,
      ),
      floor = Math.floor(arg327 / 7000);
    (some6 && floor !== v56 && ((v56 = floor), fn80()), fn25(min2));
    const text27 = arg2.camera.quaternion?.toArray?.().join(",") || "";
    if (text27 !== text10) {
      const v430 = Math.min(100, Math.max(1, arg327 - (value16 ?? arg327 - 16.7))) / 1000,
        v431 = v57.angleTo(arg2.camera.quaternion) / v430;
      (text10 && !value6 && !text11 && (set.size || v31 || v431 > 0.035) && (num5 = arg327 + 60),
        (text10 = text27));
    }
    (v57.copy(arg2.camera.quaternion), (value16 = arg327));
    const v432 = v55 && !value6 && !text11 && (set.size > 0 || v31),
      v433 = v12.hideIconsWhileRotating === true && !v6 && !v7 && (v18 || v432 || arg327 < num5);
    v433 !== v55 && ((v55 = v433), fn55());
    const some7 = (options.devices?.vacuums || []).some(
      (arg329) => v15(arg329) && v179.hasTracking(arg329.id),
    );
    return (
      (element29.hidden = v6 || (!text11 && (text4 !== "vacuum" || !some7))),
      (element7.hidden = element29.hidden),
      (element29.disabled = !text11 && !some7),
      fn78(),
      (element2.dataset.stageFrameChecks = String(value8.stats.frames)),
      Math.min(
        v147.nextDelay(),
        v145.nextDelay(),
        v146.nextDelay(),
        v151.nextDelay(),
        tick5 ? 1000 / 30 : Infinity,
        tick3,
        tick ? 1000 / 30 : Infinity,
        v156.nextDelay(),
        tick6 ? 0 : Infinity,
        tick7 || text11 ? 1000 / 30 : Infinity,
        v55 ? 60 : Infinity,
        some6 ? 7000 - (arg327 % 7000) : Infinity,
        value6 || tick2 || tick4 ? 0 : Infinity,
        v126.isMoving() ? 1000 / 30 : Infinity,
        Math.min(v88.nextDelay(arg327), v89.nextDelay(arg327)),
        v155.nextDelay(),
        v135.nextDelay(),
        ...Object.values(entries2).map((arg330) => arg330.nextDelay()),
        ...Object.values(entries).map((arg331) => arg331.nextDelay()),
        v290.nextDelay(arg327),
        v285.nextDelay(arg327),
        v289.nextDelay(arg327),
        vector.nextDelay(arg327),
      )
    );
  }
  ((value8 = arg2.createFrameLoop({
    step: (arg332) =>
      arg2.profileFrameWork
        ? arg2.profileFrameWork("stage-updates", () => fn88(arg332))
        : fn88(arg332),
  })),
    fn64(),
    window.addEventListener("pagehide", () => {
      (v29.dispose(),
        arg2.setLockMoving?.(false),
        v123.dispose(),
        v28.dispose(),
        arg2.setBackgroundTheme?.(null),
        value20?.cancel(),
        (value20 = null),
        fn45(),
        document.removeEventListener("visibilitychange", fn29),
        v178.dispose(),
        v179.dispose(),
        v180.dispose(),
        v181.dispose(),
        text11 && fn24(false));
      for (const v434 of map14.values()) clearTimeout(v434);
      (map14.clear(),
        (v23 = false),
        value9?.dispose(),
        arg2.setCurtainSync?.(null),
        arg2.setTelevisionSync?.(null),
        v108.dispose(),
        v111.dispose(),
        v126.dispose(),
        v88.clear(),
        v89.clear(),
        map7.clear());
      for (const v435 of map9.keys()) fn8(v435, "页面已关闭。");
      for (const v436 of map8.keys()) fn7(v436, "页面已关闭。");
      (v64.dispose(),
        v67.dispose(),
        v37.flush(),
        v426(),
        v156.dispose(),
        v157.dispose(),
        element28.remove(),
        v117.dispose(),
        v135.dispose());
      for (const v437 of Object.values(entries2)) v437.dispose();
      for (const v438 of Object.values(entries)) v438.dispose();
      (v119.dispose(),
        v137.dispose(),
        v116.dispose(),
        v151.dispose(),
        v146.dispose(),
        v145.dispose(),
        v118.dispose(),
        v144.dispose(),
        v155.dispose(),
        v154.dispose(),
        v149?.(),
        v147.dispose(),
        v80.dispose());
      for (const v439 of map6.keys()) fn4(v439, "页面已关闭。");
      (arg2.finishFloorTransition?.(),
        (v9 = true),
        v285.dispose(),
        v289.dispose(),
        v290.dispose(),
        (value6 = null),
        v52({
          type: "focus-state",
          active: false,
        }));
      for (const v440 of list13) window.removeEventListener(v440, fn66, true);
      (window.removeEventListener("blur", fn67),
        document.removeEventListener?.("visibilitychange", fn68),
        value8.dispose(),
        v417?.(),
        v417 || controls.removeEventListener("change", fn78),
        resizeObserver.disconnect(),
        map2.forEach((arg333) => clearTimeout(arg333.timeout)),
        map2.clear());
    }));
  function fn89() {
    const map22 = new Map(
      floorNavigationChoices2(arg2.document.floors)
        .filter(([v441]) => v441 !== "all")
        .map(([v442, v443]) => [
          v442,
          v443.startsWith("B") ? -Number(v443.slice(1)) : Number(v443.slice(0, -1)),
        ]),
    );
    return (
      arg2.regionLighting?.sync?.(arg2.camera),
      {
        floorGap: arg2.document.previewFloorGap,
        uniformOverviewStack: arg2.document.uniformOverviewStack === true,
        appearanceCapabilities: {
          detailedLighting: (arg2.regionLighting?.stats?.detailedMaterials || 0) > 0,
        },
        camera: v45(
          arg2.cameraState(),
          options.floorSelection || arg2.document.activeFloorId,
          true,
        ),
        baseLighting: arg2.document.baseLighting,
        defaults: arg2.defaults,
        floors: arg2.document.floors.map((arg334) => {
          const v444 = arg334.scene.settings?.wallHeight,
            filter11 = arg334.scene.walls
              .map((arg335) => arg335.height)
              .filter((arg336) => Number.isFinite(arg336) && arg336 > 0),
            max12 = Math.max(
              0.01,
              Math.min(
                6,
                Number.isFinite(v444) && v444 > 0 ? v444 : Math.max(0, ...filter11) || 2.8,
              ),
            ),
            map23 = doorModels2(arg334).map((arg337) => ({
              id: arg337.modelId,
              name: arg337.name,
              doorType: arg337.doorType,
              doorLabel: arg337.doorLabel,
            }));
          return {
            id: arg334.id,
            name: arg334.name,
            elevation: arg334.elevation,
            number: map22.get(arg334.id),
            wallHeight: max12,
            doors: map23,
            entryDoors: map23,
            plan: {
              pixelsPerMeter: arg334.scene.calibration?.pixelsPerMeter || 1,
              walls: arg334.scene.walls.map((arg338) => ({
                start: arg338.start,
                end: arg338.end,
                thickness: arg338.thickness,
              })),
              items: arg334.scene.items.map(
                ({
                  id: v445,
                  type: v446,
                  name: v447,
                  x: v448,
                  y: v449,
                  width: v450,
                  depth: v451,
                  rotation: v452,
                  color: v453,
                }) => ({
                  id: v445,
                  type: v446,
                  name: v447,
                  x: v448,
                  y: v449,
                  width: v450,
                  depth: v451,
                  rotation: v452,
                  color: v453,
                }),
              ),
            },
            cameras: arg334.scene.items
              .filter((arg339) => arg339.type === "camera")
              .map((arg340, arg341) => ({
                id: arg340.id,
                name: arg340.name || "摄像头 " + (arg341 + 1),
                x: arg340.x,
                y: arg340.y,
                height: (Number(arg340.elevation) || 0) + (Number(arg340.height) || 0.3) / 2,
              })),
            presenceSensors: arg334.scene.items
              .filter((arg342) => arg342.type === "presence")
              .map((arg343, arg344) => ({
                id: arg343.id,
                name: arg343.name || "人体传感器 " + (arg344 + 1),
              })),
            vacuums: arg334.scene.items
              .filter((arg345) => arg345.type === "robotvacuum")
              .map((arg346, arg347) => ({
                id: arg346.id,
                name: arg346.name || "扫地机 " + (arg347 + 1),
                x: arg346.x,
                y: arg346.y,
                height: (Number(arg346.elevation) || 0) + (Number(arg346.height) || 0.85) / 2,
              })),
            speakers: arg334.scene.items
              .filter((arg348) => arg348.type === "speaker")
              .map((arg349, arg350) => ({
                id: arg349.id,
                name: arg349.name || "智能音响 " + (arg350 + 1),
                type: arg349.type,
                x: arg349.x,
                y: arg349.y,
                height: (Number(arg349.elevation) || 0) + (Number(arg349.height) || 0.2336) / 2,
              })),
            televisions: arg334.scene.items
              .filter((arg351) => arg351.type === "tv")
              .map((arg352, arg353) => ({
                id: arg352.id,
                name: arg352.name || "电视 " + (arg353 + 1),
                type: arg352.type,
                x: arg352.x,
                y: arg352.y,
                height: (Number(arg352.elevation) || 0) + (Number(arg352.height) || 0.92) * 0.62,
              })),
            ...genericDeviceMetadata2(arg334.scene.items),
            nas: arg334.scene.items
              .filter((arg354) => arg354.type === "nas")
              .map((arg355, arg356) => ({
                id: arg355.id,
                name: arg355.name || "NAS " + (arg356 + 1),
                type: arg355.type,
                x: arg355.x,
                y: arg355.y,
                height: (Number(arg355.elevation) || 0) + (Number(arg355.height) || 0.34) / 2,
              })),
            curtains: arg334.scene.items
              .filter((arg357) => arg357.type === "curtain")
              .map((arg358, arg359) => ({
                id: arg358.id,
                name: arg358.name || "窗帘 " + (arg359 + 1),
                type: arg358.type,
                x: arg358.x,
                y: arg358.y,
                height: (Number(arg358.elevation) || 0) + (Number(arg358.height) || 2.4) / 2,
                curtainPosition: arg358.curtainPosition || "split",
                curtainTrack: arg358.curtainTrack || "straight",
                curtainForm: arg358.curtainForm === "roller" ? "roller" : "standard",
                curtainFabric: arg358.curtainFabric,
              })),
            waterHeaters: arg334.scene.items
              .filter((arg360) => ["storagewaterheater", "gaswaterheater"].includes(arg360.type))
              .map((arg361, arg362) => ({
                ...arg361,
                name: arg361.name || "热水器 " + (arg362 + 1),
              })),
            airers: arg334.scene.items
              .filter((arg363) => arg363.type === "airer")
              .map((arg364, arg365) => ({
                ...arg364,
                height:
                  (Number(arg364.elevation) || 2.7) - (Number(arg364.airerExtension) || 1.2) / 2,
                name: arg364.name || "晾衣架 " + (arg365 + 1),
              })),
            fans: arg334.scene.items
              .filter((arg366) => arg366.type === "fan")
              .map((arg367, arg368) => ({
                ...arg367,
                name: arg367.name || "电风扇 " + (arg368 + 1),
              })),
            airPurifiers: arg334.scene.items
              .filter((arg369) => arg369.type === "airpurifier")
              .map((arg370, arg371) => ({
                ...arg370,
                name: arg370.name || "空气净化器 " + (arg371 + 1),
              })),
            airConditioners: arg334.scene.items
              .filter((arg372) => ["wallac", "floorac", "airoutlet"].includes(arg372.type))
              .map((arg373, arg374) => ({
                id: arg373.id,
                name:
                  arg373.name ||
                  (arg373.type === "airpurifier"
                    ? "空气净化器"
                    : arg373.type === "airoutlet"
                      ? "出风口"
                      : arg373.type === "wallac"
                        ? "挂机空调"
                        : "柜机空调") +
                    " " +
                    (arg374 + 1),
                type: arg373.type,
                x: arg373.x,
                y: arg373.y,
                height: (Number(arg373.elevation) || 0) + (Number(arg373.height) || 0.28) / 2,
              })),
            groups: arg334.scene.lightGroups.map((arg375) => {
              const filter12 = arg334.scene.items.filter(
                  (arg376) => arg376.lightGroupId === arg375.id,
                ),
                map24 = filter12.length
                  ? filter12
                  : arg334.scene.walls.map((arg377) => arg377.start);
              return {
                id: arg375.id,
                name: arg375.name,
                height: max12,
                x: map24.length
                  ? map24.reduce((arg378, arg379) => arg378 + arg379.x, 0) / map24.length
                  : 0,
                y: map24.length
                  ? map24.reduce((arg380, arg381) => arg380 + arg381.y, 0) / map24.length
                  : 0,
              };
            }),
          };
        }),
      }
    );
  }
  v52({
    type: "ready",
    statePatches: true,
    metadata: fn89(),
  });
}
