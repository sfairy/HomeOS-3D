/**
 * 原生附加面板分发器。
 *
 * 3D 弹窗里每类 HA 实体都可能有"额外功能"：灯的颜色/特效、门锁密码、日历列表……
 * 这里按实体域挑一个面板实现。面板在首次渲染时异步加载，加载完成后只做状态刷新；
 * 实体切换或能力结构变化时销毁重建，避免每次轮询都重建 DOM。
 */
import { featureFlags } from "../device/entity-capabilities";
import { createDisplayExtraPanel } from "./display-extra-panel";
import { createImageExtraPanel } from "./image-extra-panel";
import { createCameraExtraPanel } from "./camera-extra-panel";
import { createInputExtraPanel } from "./input-extra-panel";
import { createListExtraPanel } from "./list-extra-panel";
import { createServiceExtraPanel } from "./service-extra-panel";
import { createCompoundExtraPanel } from "./compound-extra-panel";
import { createLightExtraPanel } from "./light-extra-panel";
import { createExtendedExtraPanel } from "./extended-extra-panel";
import { createClimatePanel } from "../climate/climate-panel";
import { createCoverPanel } from "../cover/cover-panel";
import { createLockPanel } from "../security/lock-panel";
import type { ExtraPanelViewModel, FeedbackSlot } from "./panel-utils";

/** 只读展示型域：没有可下发的服务，仅展示状态与属性。 */
const DISPLAY_DOMAINS = ["air_quality", "device_tracker", "event", "geo_location"];

const SERVICE_DOMAINS = [
  "ai_task",
  "assist_satellite",
  "conversation",
  "notify",
  "remote",
  "tts",
  "image_processing",
  "stt",
  "wake_word",
  "infrared",
  "radio_frequency",
];

const LIST_DOMAINS = ["calendar", "todo", "weather", "update"];

const COMPOUND_DOMAINS = [
  "humidifier",
  "valve",
  "lawn_mower",
  "siren",
  "alarm_control_panel",
  "vacuum",
];

const INPUT_DOMAINS = ["text", "date", "time", "datetime"];

function domainOf(entityIdOrDomain: any) {
  return String(entityIdOrDomain || "").split(".")[0];
}

/** 判断实体应该用哪种附加面板；返回域本身作为 kind，便于按域分派。 */
export function nativeExtraKind(entityIdOrDomain: any, state: any): string | null {
  const domain = domainOf(entityIdOrDomain);
  if (DISPLAY_DOMAINS.includes(domain)) return "display";
  if (SERVICE_DOMAINS.includes(domain)) return "service";
  if (LIST_DOMAINS.includes(domain)) return "list";
  if (COMPOUND_DOMAINS.includes(domain)) return "compound";
  if (INPUT_DOMAINS.includes(domain)) return domain;
  if (domain === "lock") return "lock";
  if (domain === "light") return "light";
  if (domain === "image") return "image";
  if (domain === "camera") return "camera";
  if (domain === "climate") return "climate";
  if (domain === "water_heater") return "water_heater";
  if (domain === "media_player") return "media_player";
  if (domain === "cover") return "cover";
  if (domain === "fan") {
    const attributes = (state?.newState || state)?.attributes || {};
    // 只有带"可调速"等能力的风扇才值得单开面板，普通开关风扇交给通用卡片。
    return featureFlags(attributes) & 0xe ? domain : null;
  }
  return null;
}

/** 各面板的可读最小宽度（px）：低于这个宽度标签会被压成竖排，宁可让弹窗变宽。 */
export function nativeExtraMinimumWidth(entityIdOrDomain: any, state: any): number {
  const domain = domainOf(entityIdOrDomain);
  const attributes = (state?.newState || state)?.attributes || {};
  const flags = featureFlags(attributes);
  const inputWidth = { text: 144, date: 196, time: 160, datetime: 260 } as Record<string, number>;
  if (inputWidth[domain]) return inputWidth[domain];
  if (domain === "light")
    return (Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : []).some(
      (mode: string) => mode !== "onoff",
    ) || flags & 0x2c
      ? 155
      : 124;
  if (["air_quality", "device_tracker", "event", "geo_location", "image_processing", "stt", "wake_word", "infrared", "radio_frequency"].includes(domain))
    return 124;
  if (domain === "lawn_mower") return 145;
  if (domain === "valve") return flags & 0x4 ? 155 : 145;
  if (domain === "humidifier") return 155;
  if (domain === "siren") return flags & 0x1c ? 155 : 124;
  if (domain === "alarm_control_panel") return attributes.code_format ? 210 : flags ? 155 : 145;
  if (domain === "lock") return 145;
  if (domain === "vacuum") return flags & 0x4100 ? 210 : 155;
  if (domain === "fan") return 155;
  if (domain === "cover") return flags & 0x84 ? 210 : 155;
  if (domain === "camera" || domain === "image") return 96;
  return 210;
}

type NativeExtraPanelOptions = {
  element: any;
  headerControls?: any;
  feedbackSlot?: FeedbackSlot;
  kind: string;
  onControl: (command: any) => Promise<any>;
  onResize?: () => void;
};

type MountedPanel = {
  root?: any;
  update?: (viewModel: any) => void;
  dispose?: () => void;
};

export function createNativeExtraPanel({
  element: hostElement,
  headerControls,
  feedbackSlot,
  kind,
  onControl,
  onResize = () => {},
}: NativeExtraPanelOptions) {
  let mountPanel: MountedPanel | null = null;
  let viewModel: ExtraPanelViewModel | null = null;
  let disposed = false;

  const errorElement = hostElement.ownerDocument.createElement("p");
  errorElement.className = "i3d-climate-error";
  errorElement.setAttribute("role", "status");
  hostElement.append(errorElement);

  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => onResize()) : null;

  /** 原生面板只关心实体自身，附加卡片列表必须清空，否则会递归渲染。 */
  function panelItem() {
    const item = viewModel?.item || {};
    return {
      id: `${item.id}:${item.entityId}`,
      entityId: item.entityId,
      label: item.label,
      modelAvailable: item.modelAvailable,
      extraControls: [],
      ...(kind === "water_heater" ? { waterHeater: true } : {}),
      ...(kind === "fan" ? { pedestalFan: true } : {}),
    };
  }

  function refresh() {
    if (!mountPanel || !viewModel || disposed) return;
    mountPanel.root && (mountPanel.root.hidden = false);
    mountPanel.update?.({
      item: panelItem(),
      state: viewModel.state,
      states: viewModel.states,
      editing: viewModel.editing,
      numberFormats: viewModel.numberFormats || {},
    });
    onResize();
  }

  function sendControl(command: any) {
    if (disposed || !viewModel || viewModel.editing || command.entityId !== viewModel.item.entityId)
      return;
    return onControl({ ...command, deviceKind: "purifier-extra" });
  }

  function makePanel(): MountedPanel {
    const options = {
      element: hostElement,
      feedbackSlot,
      onControl: sendControl,
    } as any;
    if (kind === "display") return createDisplayExtraPanel(options);
    if (kind === "climate" || kind === "media_player") {
      const panel = createExtendedExtraPanel({ ...options, kind });
      return panel;
    }
    if (kind === "service") return createServiceExtraPanel(options);
    if (kind === "list") return createListExtraPanel(options);
    if (kind === "compound") return createCompoundExtraPanel({ ...options, headerControls });
    if (kind === "light") return createLightExtraPanel({ ...options, headerControls });
    if (kind === "image") return createImageExtraPanel({ ...options });
    if (kind === "camera") return createCameraExtraPanel(options);
    if (kind === "lock") {
      const panel = createLockPanel({ onControl: sendControl, feedbackSlot });
      hostElement.append(panel.root);
      return {
        root: panel.root,
        update: (model: any) =>
          panel.update({ item: model.item, states: model.states || {}, editing: model.editing }),
        dispose: () => {
          panel.dispose?.();
          panel.root?.remove?.();
        },
      };
    }
    if (kind === "cover") {
      const panel = createCoverPanel({
        element: hostElement,
        feedbackSlot,
        onControl: sendControl,
        onExtraControl: sendControl,
      });
      return panel;
    }
    if (INPUT_DOMAINS.includes(kind)) return createInputExtraPanel(options);
    if (kind === "water_heater" || kind === "fan")
      return createClimatePanel({ element: hostElement, feedbackSlot, onControl: sendControl });
    return createServiceExtraPanel(options);
  }

  const ready = Promise.resolve()
    .then(() => {
      if (disposed) return;
      mountPanel = makePanel();
      hostElement.classList.add("i3d-extra-native-panel");
      resizeObserver?.observe(hostElement);
      refresh();
    })
    .catch((error: any) => {
      if (disposed) return;
      hostElement.replaceChildren(errorElement);
      errorElement.textContent = error?.message || "控制面板加载失败";
      onResize();
    });

  return {
    ready,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return;
      viewModel = nextViewModel;
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      viewModel = null;
      resizeObserver?.disconnect();
      mountPanel?.dispose?.();
      mountPanel = null;
      hostElement.replaceChildren();
    },
  };
}
