/**
 * 栈 D 设备弹窗右上角 CSS 交互动态图工厂。
 * 与灯光 `i3d-lamp-*` 同定位语义；各面板注入 onActivate 承接开关等主操作。
 */
export type StageDeviceVisualKind =
  | "climate"
  | "water-heater"
  | "bath-heater"
  | "air-purifier"
  | "fan"
  | "cover"
  | "airer"
  | "television"
  | "speaker"
  | "lock"
  | "nas"
  | "generic";

export type StageDeviceVisualState = {
  kind?: StageDeviceVisualKind;
  on?: boolean;
  running?: boolean;
  available?: boolean;
  disabled?: boolean;
  interactive?: boolean;
  label?: string;
  accent?: string;
  mode?: string;
  visualMode?: string;
  targetTemperature?: number | string | null;
  position?: number | null;
  moving?: boolean;
  locked?: boolean;
  jammed?: boolean;
  busy?: boolean;
  playing?: boolean;
  artworkUrl?: string | null;
  status?: "normal" | "warning" | "off" | "unknown" | string;
  lightOn?: boolean;
  coverDirection?: "left" | "right" | "split" | string;
  displayText?: string;
  hidden?: boolean;
};

type CreateStageDeviceVisualOptions = {
  kind?: StageDeviceVisualKind;
  document?: Document;
  onActivate?: () => void;
};

function el(doc: Document, tag: string, className = "", text = "") {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildClimateDrawing(doc: Document, kind: StageDeviceVisualKind) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--climate");
  const unit = el(doc, "span", "i3d-device-climate-unit");
  const brand = el(
    doc,
    "span",
    "i3d-device-climate-brand",
    kind === "bath-heater"
      ? "BATH"
      : kind === "water-heater"
        ? "WATER"
        : kind === "air-purifier"
          ? "PURE"
          : kind === "fan"
            ? "FAN"
            : "AIR",
  );
  const display = el(doc, "strong", "i3d-device-climate-display", "OFF");
  const vent = el(doc, "span", "i3d-device-climate-vent");
  for (let i = 0; i < 5; i += 1) vent.append(el(doc, "i"));
  unit.append(brand, display, vent);
  const airflow = el(doc, "span", "i3d-device-climate-airflow");
  for (let i = 0; i < 3; i += 1) airflow.append(el(doc, "i"));
  if (kind === "air-purifier") {
    drawing.classList.add("is-purifier");
    const body = el(doc, "span", "i3d-device-purifier-body");
    body.append(
      el(doc, "i", "i3d-device-purifier-top"),
      el(doc, "i", "i3d-device-purifier-vent"),
      el(doc, "i", "i3d-device-purifier-display"),
    );
    drawing.append(el(doc, "i", "i3d-device-purifier-aura"), body, airflow);
  } else if (kind === "fan") {
    drawing.classList.add("is-fan");
    const fan = el(doc, "span", "i3d-device-fan-body");
    fan.append(el(doc, "i", "i3d-device-fan-hub"), el(doc, "i", "i3d-device-fan-blade"));
    drawing.append(fan);
  } else {
    drawing.classList.toggle("is-bath-heater", kind === "bath-heater");
    drawing.classList.toggle("is-water-heater", kind === "water-heater");
    drawing.append(unit, airflow);
  }
  return { drawing, display };
}

function buildCoverDrawing(doc: Document, kind: StageDeviceVisualKind) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--cover");
  drawing.classList.toggle("is-airer", kind === "airer");
  const windowPane = el(doc, "i", "i3d-device-cover-window");
  const rail = el(doc, "i", "i3d-device-cover-rail");
  const left = el(doc, "i", "i3d-device-cover-panel left");
  const right = el(doc, "i", "i3d-device-cover-panel right");
  const slats = el(doc, "span", "i3d-device-cover-slats");
  const slatTotal = 9;
  for (let i = 0; i < slatTotal; i += 1) {
    const slat = el(doc, "span", "i3d-device-cover-slat");
    slat.style.setProperty("--i3d-cover-slat-index", String(i));
    slats.append(slat);
  }
  drawing.append(windowPane, rail, left, right, slats);
  if (kind === "airer") {
    const airer = el(doc, "span", "i3d-device-airer");
    airer.append(
      el(doc, "i", "i3d-device-airer-glow"),
      el(doc, "i", "i3d-device-airer-lamp"),
      el(doc, "span", "i3d-device-airer-rack"),
    );
    const rack = airer.querySelector(".i3d-device-airer-rack")!;
    for (let i = 0; i < 3; i += 1) rack.append(el(doc, "i"));
    drawing.append(airer);
  }
  return { drawing };
}

function buildTelevisionDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--television");
  const bezel = el(doc, "span", "i3d-device-tv-bezel");
  const screen = el(doc, "span", "i3d-device-tv-screen");
  const glow = el(doc, "i", "i3d-device-tv-glow");
  bezel.append(screen, el(doc, "i", "i3d-device-tv-stand"));
  drawing.append(glow, bezel);
  return { drawing, screen };
}

function buildSpeakerDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--speaker");
  const body = el(doc, "span", "i3d-device-speaker-body");
  const artwork = el(doc, "img", "i3d-device-speaker-artwork") as HTMLImageElement;
  artwork.alt = "";
  artwork.hidden = true;
  body.append(artwork, el(doc, "i", "i3d-device-speaker-ring"), el(doc, "i", "i3d-device-speaker-light"));
  drawing.append(body);
  return { drawing, artwork };
}

function buildLockDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--lock");
  drawing.append(
    el(doc, "i", "i3d-device-lock-shackle"),
    el(doc, "span", "i3d-device-lock-body"),
    el(doc, "i", "i3d-device-lock-keyhole"),
  );
  return { drawing };
}

function buildNasDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--nas");
  const chassis = el(doc, "span", "i3d-device-nas-chassis");
  for (let i = 0; i < 3; i += 1) chassis.append(el(doc, "i", "i3d-device-nas-bay"));
  drawing.append(chassis, el(doc, "i", "i3d-device-nas-led"));
  return { drawing };
}

function buildGenericDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--generic");
  drawing.append(
    el(doc, "i", "i3d-device-generic-aura"),
    el(doc, "span", "i3d-device-generic-body"),
    el(doc, "i", "i3d-device-generic-badge"),
  );
  return { drawing };
}

function buildDrawing(doc: Document, kind: StageDeviceVisualKind) {
  switch (kind) {
    case "cover":
    case "airer":
      return buildCoverDrawing(doc, kind);
    case "television":
      return buildTelevisionDrawing(doc);
    case "speaker":
      return buildSpeakerDrawing(doc);
    case "lock":
      return buildLockDrawing(doc);
    case "nas":
      return buildNasDrawing(doc);
    case "generic":
      return buildGenericDrawing(doc);
    default:
      return buildClimateDrawing(doc, kind);
  }
}

export function resolveClimateVisualKind(item: any, deviceState: any = {}): StageDeviceVisualKind {
  if (item?.waterHeater || deviceState?.waterHeater) return "water-heater";
  if (item?.climateType === "bath-heater") return "bath-heater";
  if (item?.airPurifier || deviceState?.purifier) return "air-purifier";
  if (item?.pedestalFan) return "fan";
  return "climate";
}

export function createStageDeviceVisual({
  kind: initialKind = "generic",
  document: ownerDocument = globalThis.document,
  onActivate = undefined,
}: CreateStageDeviceVisualOptions = {}) {
  const root = el(ownerDocument, "button", "i3d-device-visual") as HTMLButtonElement;
  root.type = "button";
  root.setAttribute("aria-hidden", "false");

  let kind: StageDeviceVisualKind = initialKind;
  let displayEl: HTMLElement | null = null;
  let artworkEl: HTMLImageElement | null = null;
  let artworkUrl = "";
  let disposed = false;

  function mountDrawing(nextKind: StageDeviceVisualKind) {
    kind = nextKind;
    root.replaceChildren();
    root.dataset.visualKind = kind;
    root.className = "i3d-device-visual i3d-device-visual--" + kind;
    const built = buildDrawing(ownerDocument, kind) as any;
    root.append(built.drawing);
    displayEl = built.display || null;
    artworkEl = built.artwork || null;
    artworkUrl = "";
  }

  mountDrawing(initialKind);

  root.addEventListener("click", (event) => {
    if (disposed || root.disabled || root.classList.contains("is-decorative")) return;
    event.preventDefault();
    onActivate?.();
  });

  function sync(state: StageDeviceVisualState = {}) {
    if (disposed) return;
    if (state.kind && state.kind !== kind) mountDrawing(state.kind);
    if (state.hidden != null) root.hidden = !!state.hidden;

    const available = state.available !== false;
    const on = !!state.on && available;
    const running = !!state.running && available;
    const interactive = state.interactive !== false && available && !state.disabled;
    const accent = state.accent || "#c9a26d";

    root.classList.toggle("is-on", on);
    root.classList.toggle("is-running", running);
    root.classList.toggle("is-unavailable", !available);
    root.classList.toggle("is-busy", !!state.busy);
    root.classList.toggle("is-playing", !!state.playing);
    root.classList.toggle("is-moving", !!state.moving);
    root.classList.toggle("is-locked", !!state.locked);
    root.classList.toggle("is-jammed", !!state.jammed);
    root.classList.toggle("is-light-on", !!state.lightOn);
    root.classList.toggle("is-decorative", !interactive);
    root.disabled = !!state.disabled || !interactive;
    root.style.setProperty("--i3d-device-accent", accent);
    root.dataset.visualMode = state.visualMode || (on ? "on" : "off");
    if (state.status) root.dataset.status = state.status;

    if (
      (kind === "climate" ||
        kind === "water-heater" ||
        kind === "bath-heater" ||
        kind === "air-purifier") &&
      displayEl
    ) {
      const finite =
        state.targetTemperature != null &&
        state.targetTemperature !== "" &&
        Number.isFinite(Number(state.targetTemperature));
      displayEl.textContent = on
        ? finite
          ? Number(state.targetTemperature) + "°"
          : state.displayText || state.mode || "ON"
        : "OFF";
    }

    if (kind === "cover" || kind === "airer") {
      const position = Math.max(0, Math.min(100, Number(state.position ?? (on ? 100 : 0))));
      root.style.setProperty("--i3d-cover-open-position", position + "%");
      const direction = state.coverDirection || "split";
      root.classList.toggle("direction-left", direction === "left");
      root.classList.toggle("direction-right", direction === "right");
      root.classList.toggle("direction-split", direction === "split" || !["left", "right"].includes(direction));
    }

    if (kind === "speaker" && artworkEl) {
      const nextUrl = state.artworkUrl || "";
      if (nextUrl !== artworkUrl) {
        artworkUrl = nextUrl;
        if (artworkUrl) {
          artworkEl.hidden = true;
          artworkEl.onload = () => {
            if (artworkUrl === nextUrl) artworkEl!.hidden = false;
          };
          artworkEl.src = artworkUrl;
        } else {
          artworkEl.removeAttribute("src");
          artworkEl.hidden = true;
        }
      }
      artworkEl.classList.toggle("is-visible", !!artworkUrl && !artworkEl.hidden);
    }

    const label = state.label || kind;
    root.setAttribute("aria-pressed", String(on));
    root.setAttribute(
      "aria-label",
      !available
        ? label + "不可用"
        : kind === "lock"
          ? label + (state.locked ? "，已上锁" : "，已解锁")
          : interactive
            ? label + (on ? "，点击关闭" : "，点击开启")
            : label + (on ? "，已开启" : "，已关闭"),
    );
  }

  return {
    root,
    get kind() {
      return kind;
    },
    setKind(nextKind: StageDeviceVisualKind) {
      if (nextKind !== kind) mountDrawing(nextKind);
    },
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (artworkEl) {
        artworkEl.onload = null;
        artworkEl.removeAttribute("src");
      }
      root.remove();
    },
  };
}
