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
  | "fridge"
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
  /** 梦幻帘叶片角度 0–100；50 约等于 90° 打开。 */
  tiltPosition?: number | null;
  /** 梦幻帘：轨道开合与叶片角度分离。 */
  dream?: boolean;
  moving?: boolean;
  locked?: boolean;
  jammed?: boolean;
  busy?: boolean;
  /** 门锁图形语义：locked / unlocked / locking / unlocking / jammed / unknown。为空时退回 locked 布尔。 */
  lockState?: string;
  playing?: boolean;
  artworkUrl?: string | null;
  status?: "normal" | "warning" | "off" | "unknown" | string;
  lightOn?: boolean;
  coverDirection?: "left" | "right" | "split" | string;
  displayText?: string;
  hidden?: boolean;
  /**
   * 冰箱图形各开口的开合态（true = 打开）：left/right 为上冷藏室对开门，top/bottom 为下冷冻室两层抽屉。
   * 缺省或未绑定门磁时全部按闭合渲染。
   */
  fridgeOpenings?: {
    left?: boolean;
    right?: boolean;
    top?: boolean;
    bottom?: boolean;
  } | null;
};

type CreateStageDeviceVisualOptions = {
  kind?: StageDeviceVisualKind;
  document?: Document;
  onActivate?: () => void;
};

/** 门锁图形能表达的语义档位；其余状态（unknown/unavailable/未绑定）都归到 unknown。 */
const LOCK_VISUAL_STATES = new Set(["locked", "unlocked", "locking", "unlocking", "jammed"]);
const LOCK_STATE_ARIA = {
  locked: "，已上锁",
  unlocked: "，已解锁",
  locking: "，正在上锁",
  unlocking: "，正在解锁",
  jammed: "，门锁卡住",
} as Record<string, string>;

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

/**
 * 梦幻帘完全收拢时相邻叶片的堆叠步距（px）：与 0.6.5 同口径，取略小于叶片间距的值，
 * 让收拢后的叶片互相压住而不是完全重合成一条线。
 */
const SLAT_GATHER_STEP_PX = 6.5;

function buildCoverDrawing(doc: Document, kind: StageDeviceVisualKind) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--cover");
  drawing.classList.toggle("is-airer", kind === "airer");
  const windowPane = el(doc, "i", "i3d-device-cover-window");
  const rail = el(doc, "i", "i3d-device-cover-rail");
  const left = el(doc, "i", "i3d-device-cover-panel left");
  const right = el(doc, "i", "i3d-device-cover-panel right");
  const slats = el(doc, "span", "i3d-device-cover-slats");
  // 叶片数固定 13，与 0.6.5 一致：再密会在窗洞里糊成一片，再疏则看不出「帘」。
  const slatTotal = 13;
  for (let i = 0; i < slatTotal; i += 1) {
    const slat = el(doc, "span", "i3d-device-cover-slat");
    slat.style.setProperty("--i3d-cover-slat-index", String(i));
    // 叶片本体单独一层 <i>：翻转角度（rotateY）只作用在它上面，外层负责收拢位移。
    slat.append(el(doc, "i", ""));
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

/**
 * 冰箱图形：对齐场景里的对开门冰箱模型 —— 上冷藏室左右对开门，下冷冻室两层抽屉。
 * 各开口的开合由 `fridgeOpenings` 驱动，门磁变化时随时重绘。
 */
function buildFridgeDrawing(doc: Document) {
  const drawing = el(doc, "span", "i3d-device-drawing i3d-device-drawing--fridge");
  const body = el(doc, "span", "i3d-device-fridge-body");

  const upperCompartment = el(doc, "span", "i3d-device-fridge-compartment top");
  upperCompartment.append(el(doc, "i", "i3d-device-fridge-cavity"));
  for (const side of ["left", "right"]) {
    const door = el(doc, "span", "i3d-device-fridge-door " + side);
    door.append(el(doc, "i", "i3d-device-fridge-handle"));
    upperCompartment.append(door);
  }

  const lowerCompartment = el(doc, "span", "i3d-device-fridge-compartment bottom");
  lowerCompartment.append(el(doc, "i", "i3d-device-fridge-cavity"));
  for (const layer of ["top", "bottom"]) {
    const drawer = el(doc, "span", "i3d-device-fridge-drawer " + layer);
    drawer.append(el(doc, "i", "i3d-device-fridge-handle"));
    lowerCompartment.append(drawer);
  }

  body.append(upperCompartment, lowerCompartment);
  drawing.append(body);
  return { drawing };
}

/** 冰箱图形的无障碍描述：把各开口开合说清楚，而不是笼统的「已开启 / 已关闭」。 */
function fridgeOpeningsAria(openings: StageDeviceVisualState["fridgeOpenings"], available: boolean) {
  if (!available) return "，状态未知";
  const openLabels: string[] = [];
  if (openings?.left) openLabels.push("上左门打开");
  if (openings?.right) openLabels.push("上右门打开");
  if (openings?.top) openLabels.push("下上抽屉打开");
  if (openings?.bottom) openLabels.push("下下抽屉打开");
  return openLabels.length ? "，" + openLabels.join("，") : "，全部关闭";
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
    case "fridge":
      return buildFridgeDrawing(doc);
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

    const nextVisualMode = String(state.visualMode || (on ? "on" : "off"));
    // 门锁图形只认这几档语义；缺失或无法识别时一律当「未知」，绝不默认成「已解锁」。
    // 否则「没绑定锁实体 / 状态 unknown / 设备不可用」的卡片会摆出开锁图，和实际不符。
    const lockVisualState =
      kind === "lock"
        ? LOCK_VISUAL_STATES.has(String(state.lockState))
          ? String(state.lockState)
          : state.locked
            ? "locked"
            : "unknown"
        : "";
    root.classList.toggle("is-on", on);
    root.classList.toggle("is-running", running);
    root.classList.toggle("is-unavailable", !available);
    root.classList.toggle("is-busy", !!state.busy);
    root.classList.toggle("is-playing", !!state.playing);
    root.classList.toggle("is-moving", !!state.moving);
    root.classList.toggle("is-locked", lockVisualState === "locked");
    root.classList.toggle("is-jammed", lockVisualState === "jammed" || !!state.jammed);
    if (kind === "lock") root.dataset.lockState = lockVisualState;
    else delete root.dataset.lockState;
    root.classList.toggle("is-light-on", !!state.lightOn);
    root.classList.toggle("is-decorative", !interactive);
    root.disabled = !!state.disabled || !interactive;
    root.style.setProperty("--i3d-device-accent", accent.trim() || "#c9a26d");
    root.dataset.visualMode = nextVisualMode;
    root.dataset.climateMode = nextVisualMode;
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
      const isDream = !!state.dream && kind === "cover";
      const position = Math.max(0, Math.min(100, Number(state.position ?? (on ? 100 : 0))));
      const openRatio = isDream ? (on ? Math.max(position / 100, 0.08) : 0) : position / 100;
      const tilt = Math.max(
        0,
        Math.min(100, Number(state.tiltPosition ?? (isDream ? 50 : position))),
      );
      const tiltRatio = tilt / 100;
      // 叶片开度：50%（90° 打开）透光最大，两端闭合
      const bladeOpen = isDream ? 1 - Math.min(1, Math.abs(tilt - 50) / 50) : openRatio;
      root.style.setProperty("--i3d-cover-open-position", position + "%");
      root.style.setProperty("--i3d-cover-open", String(openRatio));
      root.style.setProperty("--i3d-cover-tilt", String(tiltRatio));
      root.style.setProperty("--i3d-cover-tilt-position", tilt + "%");
      root.style.setProperty("--i3d-cover-blade-open", String(bladeOpen));
      // 梦幻帘：叶片翻转角度按 1.8°/格线性换算，50% 正好 90°（对齐 0.6.5）。
      root.style.setProperty("--i3d-cover-slat-angle", tilt * 1.8 + "deg");
      // 轨道开合（0–1）驱动叶片往收拢侧聚拢；普通窗帘恒为 0。
      const retractRatio = isDream ? Math.max(0, Math.min(1, position / 100)) : 0;
      root.style.setProperty("--i3d-cover-retract-ratio", String(retractRatio));
      const direction = state.coverDirection || "split";
      // 每片叶片的收拢位移：左收从左起、右收从右起、对开从中间往两边（对齐 0.6.5）。
      const slatElements = root.querySelectorAll(".i3d-device-cover-slat"),
        slatLastIndex = slatElements.length - 1;
      for (let slatIndex = 0; slatIndex <= slatLastIndex; slatIndex += 1) {
        const slatGatherPx =
          direction === "left"
            ? -slatIndex * SLAT_GATHER_STEP_PX
            : direction === "right"
              ? (slatLastIndex - slatIndex) * SLAT_GATHER_STEP_PX
              : slatIndex <= slatLastIndex / 2
                ? -slatIndex * SLAT_GATHER_STEP_PX
                : (slatLastIndex - slatIndex) * SLAT_GATHER_STEP_PX;
        (slatElements[slatIndex] as HTMLElement).style.setProperty(
          "--i3d-cover-slat-gather",
          slatGatherPx + "px",
        );
      }
      root.classList.toggle("is-dream", isDream);
      root.classList.toggle("direction-left", direction === "left");
      root.classList.toggle("direction-right", direction === "right");
      root.classList.toggle(
        "direction-split",
        direction === "split" || !["left", "right"].includes(direction),
      );
      root.classList.toggle("is-cover-open", isDream ? on : openRatio > 0.08);
      root.classList.toggle("is-cover-closed", isDream ? !on : openRatio < 0.08);
      root.classList.toggle("is-tilt-center", isDream && Math.abs(tilt - 50) <= 2);
      root.classList.toggle("is-tilt-reversed", isDream && tilt > 50);
      const drawing = root.querySelector(".i3d-device-drawing--cover");
      drawing?.classList.toggle("is-dream", isDream);
    }

    if (kind === "fridge") {
      const openings = state.fridgeOpenings || {};
      const doorLeftOpen = available && !!openings.left;
      const doorRightOpen = available && !!openings.right;
      const drawerTopOpen = available && !!openings.top;
      const drawerBottomOpen = available && !!openings.bottom;
      (root.classList.toggle("fridge-door-left-open", doorLeftOpen),
        root.classList.toggle("fridge-door-right-open", doorRightOpen),
        root.classList.toggle("fridge-drawer-top-open", drawerTopOpen),
        root.classList.toggle("fridge-drawer-bottom-open", drawerBottomOpen),
        // 任一开口打开 → 内腔亮灯，和实体冰箱开门亮灯一致。
        root.classList.toggle(
          "is-fridge-opening",
          !!(doorLeftOpen || doorRightOpen || drawerTopOpen || drawerBottomOpen),
        ));
    } else {
      (root.classList.remove(
        "fridge-door-left-open",
        "fridge-door-right-open",
        "fridge-drawer-top-open",
        "fridge-drawer-bottom-open",
        "is-fridge-opening",
      ));
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
          ? label + (LOCK_STATE_ARIA[lockVisualState] || "，锁状态未知")
          : kind === "fridge"
            ? label + fridgeOpeningsAria(state.fridgeOpenings, available)
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
