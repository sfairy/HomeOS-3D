/**
 * 控件注册表与内置控件渲染器。
 *
 * 职责分三块，共用同一个文件：
 * 1. 注册表本身：componentsByType 存「控件类型 → 渲染器」，
 *    registerComponent / renderRegisteredComponent 是唯一的注册与取用入口；
 * 2. 资源解析：把控件里存的资源引用（builtin: / user: / studio3d: / 资源 ID）
 *    解析成可访问的 URL，并处理内置资源版本戳与特效裁剪变体；
 * 3. 内置控件渲染器：图片、图标按钮、设备按钮、灯光统计、人体感应、空调、扫地机、
 *    时间 / 日期 / 天气、折线图、面板框与导航按钮等，逐个用 registerComponent 挂上。
 *
 * 约定（改动前务必确认）：
 * - 版本戳：本文件与 home.js、renderer.js 必须引用同一条 registry.js?v= 版本戳
 *   （由 tools/bump_static_cache_versions.mjs 统一改写）。浏览器按完整 URL 缓存 ES 模块，
 *   两条不同的 ?v= 会被当成两个模块分别求值，于是出现两份互不相认的 componentsByType，
 *   排查起来很像「控件已注册却渲染不出来」；
 * - 同一份注册表同时服务编辑器预览与展示页：编辑器在 iframe / 预览层里用同一批渲染器，
 *   靠 context.editable（是否可编辑）、context.previewState（预览态）与
 *   context.renderNamespace（隔离渐变等 id 前缀）区分两种场景，
 *   所以同一个控件类型只需注册一次，不需要为编辑器另写一套渲染器；
 * - 下面所有 re-export 是为了让页面脚本只 import registry.js 一处，
 *   同时保证各 runtime 模块与注册表用的是同一份实例；
 * - 渲染器只负责产出 DOM，不修改文档数据；编辑器预览通过 context.editable 与
 *   context.previewState 表达，不要另开旁路。
 */
import { randomUuid } from "../utils/random-id.js?v=20260918233037";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../utils/debug-log.js?v=20260918233037";
// 数值夹取统一走 utils/numbers.js（P10 B 类收敛）：本文件原先那份也叫 clampNumber，
// 但它是四参、且会把空串换算成 0 —— 与编辑器那份同名不同义，最容易调用错的形态。
import { clampCoercedNumber } from "../utils/numbers.js?v=20260918233037";
import {
  climateDefaultIcon,
  climateEffectMode,
  climateIsPoweredOn,
  climateModeLabel,
  climatePresentationMode,
  normalizeClimateCapabilities,
  resolveClimateDeviceType
} from "./climate.js?v=20260918233037";
import { entityPowerIsOn } from "./entity-power.js?v=20260918233037";
import { lightRealtimeCapabilities } from "./light-runtime.js?v=20260918233037";
import { renderInteraction3d } from "../modules/interaction3d/bridge.js?v=20260918233037";
// 状态条目归一统一走 utils/state-entry.js。本文件原先自带一份同内容实现，
// 而 vacuum-runtime.js / presence-runtime.js 各有一份同内容但换了名字的副本 —— 现在只有一份。
import { resolveStateEntry } from "../utils/state-entry.js?v=20260918233037";
// 电机方向的两份知识（读控件配置 / 反转时的四态互换）在叶子模块 cover-direction.js：
// 本文件原先各留一份本地实现，只因为 cover-runtime.js 已经 import 本文件、反向 import 会成环。
import {
  coverMotorIsReversedForComponent,
  coverPhysicalStateForReversedMotor
} from "./cover-direction.js?v=20260918233037";
// 控件类型注册表。用 Map 而不是对象字面量：控件类型来自文档数据，
// Map 不受原型链影响，查 "constructor" 之类的键也不会拿到奇怪的结果。
const componentsByType = new Map();
// 3D 交互控件由独立模块（modules/interaction3d/bridge.js）实现，这里先行注册，
// 使页面脚本只需要 import registry.js 就能拿到完整的控件渲染器集合。
registerComponent("interaction3d", {
  render: renderInteraction3d
});
// 内置资源的三个索引：版本戳、显式 URL、特效裁剪变体。
// 版本戳用于给 /assets/builtin/ 的 URL 加 ?v=20260918233037
// 特效变体记录裁剪矩形与原图尺寸，渲染时写进 dataset 供 effect-geometry 使用。
const assetVersionByAssetId = new Map();
const assetUrlByAssetId = new Map();
const effectVariantByAssetId = new Map();
/**
 * 用后端下发的资源清单刷新内置资源的版本与 URL 索引。
 *
 * @param {Array<object>} [assetEntries] 资源条目，每项含 assetId、version、url、
 *   legacyAssetIds（历史 ID 别名）与可选的 effectVariant。
 * @returns {boolean} 索引内容确实变化返回 true，无变化返回 false。
 *
 * 返回布尔值是刻意设计的：调用方只有在 true 时才重建界面，
 * 否则每次轮询资源清单都会引发一次全量重绘。
 * 旧 ID 别名与原 ID 写入同一份索引，保证老文档里记录的旧 ID 仍能取到资源。
 */
export function setBuiltinAssetVersions(assetEntries = []) {
  const nextVersionByAssetId = new Map();
  const nextUrlByAssetId = new Map();
  const nextEffectVariantByAssetId = new Map();
  for (const assetEntry of assetEntries || []) {
    const primaryAssetId = String(assetEntry?.assetId || "");
    if (!primaryAssetId) {
      continue;
    }
    const assetVersion = String(assetEntry.version || "");
    const legacyAssetIds = Array.isArray(assetEntry.legacyAssetIds)
      ? assetEntry.legacyAssetIds
      : [];
    for (const assetIdCandidate of [primaryAssetId, ...legacyAssetIds]) {
      nextVersionByAssetId.set(String(assetIdCandidate), assetVersion);
      if (assetEntry.url) {
        nextUrlByAssetId.set(String(assetIdCandidate), String(assetEntry.url));
      }
      const effectVariant = assetEntry.effectVariant || {};
      const variantOriginalWidth = Number(effectVariant.originalWidth || 0);
      const variantOriginalHeight = Number(effectVariant.originalHeight || 0);
      const variantCropX = Number(effectVariant.cropX);
      const variantCropY = Number(effectVariant.cropY);
      const variantCropWidth = Number(effectVariant.width || 0);
      const variantCropHeight = Number(effectVariant.height || 0);
      if (
        String(effectVariant.url || "").startsWith("/api/v1/assets/effect-variant?") &&
        variantOriginalWidth > 0 &&
        variantOriginalHeight > 0 &&
        Number.isFinite(variantCropX) &&
        Number.isFinite(variantCropY) &&
        variantCropX >= 0 &&
        variantCropY >= 0 &&
        variantCropWidth > 0 &&
        variantCropHeight > 0 &&
        variantCropX + variantCropWidth <= variantOriginalWidth &&
        variantCropY + variantCropHeight <= variantOriginalHeight
      ) {
        // 特效变体只接受服务端 /api/v1/assets/effect-variant 且裁剪矩形完全落在原图内的记录，
        // 任一项越界就整条丢弃——错误的裁剪会让特效图糊成一片空白。
        nextEffectVariantByAssetId.set(String(assetIdCandidate), {
          url: String(effectVariant.url),
          originalWidth: variantOriginalWidth,
          originalHeight: variantOriginalHeight,
          cropX: variantCropX,
          cropY: variantCropY,
          width: variantCropWidth,
          height: variantCropHeight
        });
      }
    }
  }
  if (
    nextVersionByAssetId.size === assetVersionByAssetId.size &&
    ![...nextVersionByAssetId].some(
      ([mappedAssetId, mappedVersion]) => assetVersionByAssetId.get(mappedAssetId) !== mappedVersion
    ) &&
    nextUrlByAssetId.size === assetUrlByAssetId.size &&
    ![...nextUrlByAssetId].some(
      ([mappedUrlAssetId, mappedUrl]) => assetUrlByAssetId.get(mappedUrlAssetId) !== mappedUrl
    ) &&
    nextEffectVariantByAssetId.size === effectVariantByAssetId.size &&
    ![...nextEffectVariantByAssetId].some(
      ([mappedVariantAssetId, mappedEffectVariant]) =>
        JSON.stringify(effectVariantByAssetId.get(mappedVariantAssetId)) !==
        JSON.stringify(mappedEffectVariant)
    )
  ) {
    return false;
  }
    // 走到这里说明内容确实变了，整体替换而不是逐条 diff：清单规模小，重建更省心。
  assetVersionByAssetId.clear();
  for (const [detectedVersionAssetId, detectedVersion] of nextVersionByAssetId) {
    assetVersionByAssetId.set(detectedVersionAssetId, detectedVersion);
  }
  assetUrlByAssetId.clear();
  for (const [detectedUrlAssetId, detectedUrl] of nextUrlByAssetId) {
    assetUrlByAssetId.set(detectedUrlAssetId, detectedUrl);
  }
  effectVariantByAssetId.clear();
  for (const [detectedVariantAssetId, detectedVariant] of nextEffectVariantByAssetId) {
    effectVariantByAssetId.set(detectedVariantAssetId, detectedVariant);
  }
  return true;
}
/**
 * 注册一个控件类型的渲染器。
 *
 * @param {string} componentType 控件类型（与文档里的 component.type 一致）。
 * @param {{render: function(object, object): Node}} componentRenderer 渲染器对象。
 * @returns {void}
 *
 * 重复注册同一类型会直接覆盖（后注册者生效），因此模块重复加载时最后一份生效；
 * 这也意味着版本戳不一致导致的两份模块会各自维护一份表，务必保持版本戳一致。
 */
export function registerComponent(componentType, componentRenderer) {
  componentsByType.set(componentType, componentRenderer);
}
/**
 * 渲染一个控件：查出注册的渲染器并调用，查不到则给出可见的占位。
 *
 * @param {object} component 控件数据。
 * @param {object} renderContext 渲染上下文（states / history / editable / document 等）。
 * @returns {Node} 渲染出的 DOM 节点。
 *
 * 未知控件不抛异常而是画一块「控件尚未实现」的占位：
 * 页面可能只是比运行时新，缺一个控件不应该让整页渲染失败。
 */
export function renderRegisteredComponent(component, renderContext) {
  const registeredRenderer = componentsByType.get(component.type);
  if (registeredRenderer) {
    return registeredRenderer.render(component, renderContext);
  }
  const unknownComponentElement = document.createElement("div");
  unknownComponentElement.className = "hb-unknown-component";
  const unknownTitleElement = document.createElement("strong");
  unknownTitleElement.textContent = "控件尚未实现";
  const unknownTypeElement = document.createElement("span");
  unknownTypeElement.textContent = component.type;
  unknownComponentElement.append(unknownTitleElement, unknownTypeElement);
  return unknownComponentElement;
}
/**
 * 把资源引用解析成可访问的 URL。
 *
 * 支持的引用形式（按匹配顺序）：
 * - 直接命中资源 ID 索引（后端给出的显式 URL）；
 * - studio3d:<导出目录>/<文件名> → /api/v1/assets/studio3d-export/…；
 * - user:<32 位十六进制> → /api/v1/assets/user/…；
 * - builtin:<相对路径> → /assets/builtin/…（并按需附带版本戳）。
 * 认不出的一律返回空串，由调用方渲染占位而不是发出一个必然 404 的请求。
 *
 * @param {string} assetReference 资源引用。
 * @returns {string} URL 或空串。
 */
function resolveAssetUrl(assetReference) {
  const assetReferenceText = String(assetReference || "");
  if (assetUrlByAssetId.has(assetReferenceText)) {
    return assetUrlByAssetId.get(assetReferenceText);
  }
  if (assetReferenceText.startsWith("studio3d:")) {
    // 前缀 "studio3d:" 共 9 个字符，切片后必须是恰好两段，且两段都非空——
    // 多一层少一层都说明引用已损坏，直接判为空。
    const studioExportSegments = assetReferenceText.slice(9).split("/");
    if (studioExportSegments.length !== 2 || !studioExportSegments[0] || !studioExportSegments[1]) {
      return "";
    } else {
      return (
        "/api/v1/assets/studio3d-export/" +
        encodeURIComponent(studioExportSegments[0]) +
        "/" +
        encodeURIComponent(studioExportSegments[1])
      );
    }
  }
  if (assetReferenceText.startsWith("user:")) {
    const userAssetId = assetReferenceText.slice(5);
    // 用户资源 ID 固定为 32 位小写十六进制，顺便当作路径校验，防止拼出跨目录的 URL。
    if (/^[0-9a-f]{32}$/.test(userAssetId)) {
      return "/api/v1/assets/user/" + userAssetId;
    } else {
      return "";
    }
  }
  if (!assetReferenceText.startsWith("builtin:")) {
    return "";
  }
    // 前缀 "builtin:" 共 8 个字符。
  const builtinAssetPath = assetReferenceText.slice(8);
    // v1/2D 与 v1/3D 是历史路径，对应的资源目录已改名为「户型图示例」，
    // 这里做一次映射，让老文档里的引用仍然能用。
  const encodedBuiltinAssetPath = (
    builtinAssetPath.startsWith("v1/2D/") || builtinAssetPath.startsWith("v1/3D/")
      ? builtinAssetPath.replace(/^v1\//, "v1/户型图示例/")
      : builtinAssetPath
  )
    .split("/")
    .filter(Boolean)
    .map(pathSegment => encodeURIComponent(pathSegment))
    .join("/");
  if (!encodedBuiltinAssetPath) {
    return "";
  }
  const builtinAssetVersion = assetVersionByAssetId.get(assetReferenceText) || "";
  return (
    "/assets/builtin/" +
    encodedBuiltinAssetPath +
    (builtinAssetVersion ? "?v=" + encodeURIComponent(builtinAssetVersion) : "")
  );
}
/**
 * 静态图片资源的对外入口（等价于 resolveAssetUrl）。
 *
 * @param {string} imageAssetId 资源 ID。
 * @returns {string} 图片 URL 或空串。
 */
export function staticAssetImageSource(imageAssetId) {
  return resolveAssetUrl(imageAssetId);
}
/**
 * 校验 CSS 颜色字符串，非法时用兜底色。
 *
 * 颜色值来自文档数据并会被写进内联样式，白名单正则只放行十六进制与 rgb / hsl 系列函数，
 * 避免任意字符串（例如带分号的注入）进入 style。
 *
 * @param {string} colorCandidate 待校验颜色。
 * @param {string} fallbackColor 兜底颜色。
 * @returns {string} 可安全写入样式的颜色。
 */
function resolveColor(colorCandidate, fallbackColor) {
  const trimmedColor = String(colorCandidate || "").trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)) {
    return trimmedColor;
  } else {
    return fallbackColor;
  }
}
/**
 * 以「极细字重 + 描边」的方式还原设计稿的字重。
 *
 * 字重属性支持 1~900 与 0~1 两种量纲，这里统一归一化到 0~1，
 * 再用文字描边（0.05 em 的当前色描边）把笔画加粗——纯 font-weight 在部分中文字体上无级差，
 * 描边能得到连续的粗细变化。paint-order 保证描边画在填充之下，字不会糊。
 *
 * @param {HTMLElement} targetElement 目标元素。
 * @param {*} fontWeightValue 字重（1~900 或 0~1）。
 * @param {*} fontSizeValue 字号，决定描边宽度。
 * @returns {void}
 */
function applyFontWeight(targetElement, fontWeightValue, fontSizeValue) {
  const weightNumber = Number(fontWeightValue);
  const normalizedWeight =
    Number.isFinite(weightNumber) && weightNumber > 1
      ? clampCoercedNumber((weightNumber - 1) / 899, 0, 1, 0.4)
      : clampCoercedNumber(weightNumber, 0, 1, 0.4);
  const strokeFontSize = Math.max(1, Number(fontSizeValue || 16));
  const strokeWidthPx = normalizedWeight * strokeFontSize * 0.05;
  targetElement.style.fontWeight = "100";
  targetElement.style.webkitTextStroke = strokeWidthPx.toFixed(3) + "px currentColor";
  targetElement.style.paintOrder = "stroke fill";
}
/**
 * 把 mdi 图标名解析成本地静态资源 URL。
 *
 * 图标名去掉 mdi: 前缀后只允许小写字母、数字与连字符（即正常的图标名），
 * 不合规返回空串，调用方据此不渲染图标而不是请求一个坏地址。
 * 版本号写在 URL 里，升级图标集时同步改这里即可。
 *
 * @param {string} iconName 图标名，形如 mdi:lightbulb。
 * @returns {string} SVG 地址或空串。
 */
function resolveIconUrl(iconName) {
  const normalizedIconName = String(iconName || "")
    .trim()
    .replace(/^mdi:/, "");
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/mdi/7.4.47/svg/" + normalizedIconName + ".svg";
  } else {
    return "";
  }
}
/**
 * 通用「活动态」判定：on / open / true / home 都算活动。
 *
 * @param {object} entityStateEntry 状态对象或变更对象。
 * @returns {boolean} 是否活动。
 */
function isEntityActiveState(entityStateEntry) {
  const entityStateText = String(entityStateEntry?.state ?? entityStateEntry?.newState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(entityStateText);
}
// 窗帘「已打开」的位置阈值（%）：小于等于 1% 视为关闭，避免设备残值导致状态抖动。
const COVER_ACTIVE_POSITION_THRESHOLD = 1;
/**
 * 判断窗帘控件是否应按梦幻帘渲染。
 *
 * 优先级：控件显式配置的 coverKind → 状态里有 current_tilt_position 属性 →
 * supported_features 的第 240 位（官方 0x00F0 中的 tilt 能力）→ 名称含 梦幻 / 竖帘 / 百叶 / novo。
 * 前三者都是「设备确实支持调叶片角度」的证据，比名称更可靠。
 *
 * @param {object} coverDreamComponent 控件对象。
 * @param {string} [coverDreamEntityId] 实体 ID。
 * @param {object} [coverDreamState] 状态对象。
 * @param {Map<string, object>} [coverDreamMetadataByEntityId] 实体元数据索引。
 * @returns {boolean} 是否按梦幻帘处理。
 */
export function coverComponentIsDream(
  coverDreamComponent,
  coverDreamEntityId = "",
  coverDreamState = null,
  coverDreamMetadataByEntityId = new Map()
) {
  const coverKind = coverDreamComponent?.properties?.coverKind;
  if (coverKind === "dream") {
    return true;
  }
  if (["standard", "airer"].includes(coverKind)) {
    return false;
  }
  const dreamResolvedState = resolveStateEntry(coverDreamState) || {};
  const supportedFeatures = Number(dreamResolvedState.attributes?.supported_features || 0);
  const dreamMetadataEntry = coverDreamMetadataByEntityId?.get?.(coverDreamEntityId) || {};
  const dreamSearchText =
    coverDreamEntityId +
    " " +
    (dreamResolvedState.attributes?.friendly_name || "") +
    " " +
    (dreamMetadataEntry.name || "") +
    " " +
    (dreamMetadataEntry.originalName || "");
  return (
    Number.isFinite(Number(dreamResolvedState.attributes?.current_tilt_position)) ||
    !!(supportedFeatures & 240) ||
    /梦幻|竖帘|垂直帘|百叶|(^|[._-])novo([._-]|$)/i.test(dreamSearchText)
  );
}
/**
 * 判断窗帘是否处于「打开」侧（registry 内部的实现）。
 *
 * 判定顺序：先按电机方向还原出有效状态 → opening / closing 直接定论 →
 * 梦幻帘只看状态名 → 有位置属性时用位置（反转时取 100 - 位置）→
 * 最后才回落到状态名判定，反转时状态名也要取反。
 *
 * @param {object} coverComponent 控件对象。
 * @param {string} coverActiveEntityId 实体 ID。
 * @param {object} coverActiveState 状态对象。
 * @param {object} coverActiveContext 渲染上下文。
 * @returns {boolean} 是否视为打开。
 */
function isCoverActive(coverComponent, coverActiveEntityId, coverActiveState, coverActiveContext) {
  const coverResolvedState = resolveStateEntry(coverActiveState) || {};
  const coverStateText = String(coverResolvedState.state || "")
    .trim()
    .toLowerCase();
  const isCoverReversed = coverMotorIsReversedForComponent(coverComponent);
  const coverEffectiveState = isCoverReversed
    ? coverPhysicalStateForReversedMotor(coverStateText)
    : coverStateText;
  if (coverEffectiveState === "opening") {
    return true;
  }
  if (coverEffectiveState === "closing") {
    return false;
  }
  if (
    coverComponentIsDream(
      coverComponent,
      coverActiveEntityId,
      coverResolvedState,
      coverActiveContext.entityMetadata
    )
  ) {
    return coverEffectiveState === "open";
  }
  const coverCurrentPosition = Number(coverResolvedState.attributes?.current_position);
  if (Number.isFinite(coverCurrentPosition)) {
    return (
      (isCoverReversed ? 100 - coverCurrentPosition : coverCurrentPosition) >
      COVER_ACTIVE_POSITION_THRESHOLD
    );
  } else if (isCoverReversed) {
    return !isEntityActiveState(coverResolvedState);
  } else {
    return isEntityActiveState(coverResolvedState);
  }
}
/**
 * 判断窗帘控件是否处于活动（打开）状态，供控件渲染与图标按钮调用。
 *
 * @param {object} activeCoverComponent 控件对象。
 * @param {string} activeCoverEntityId 实体 ID。
 * @param {object} activeCoverState 状态对象。
 * @param {object} [activeCoverContext] 渲染上下文。
 * @returns {boolean} 是否活动。
 */
export function coverComponentIsActive(
  activeCoverComponent,
  activeCoverEntityId,
  activeCoverState,
  activeCoverContext = {}
) {
  return isCoverActive(
    activeCoverComponent,
    activeCoverEntityId,
    activeCoverState,
    activeCoverContext
  );
}
/**
 * 控件「是否为活动态」的统一入口。
 *
 * cover 域单独走窗帘逻辑（它的活动定义与普通开关不同）；
 * 其余域先看 properties.runtimePowerEntityId —— 有些控件（例如浴霸）的开关状态由另一个实体承载，
 * 只有该属性缺失或与自身相同时才使用控件自己绑定的实体与状态。
 *
 * @param {object} powerAwareComponent 控件对象。
 * @param {string} powerAwareEntityId 实体 ID。
 * @param {object} powerAwareState 状态对象。
 * @param {object} [powerAwareContext] 渲染上下文，提供 states。
 * @returns {boolean} 是否活动。
 */
function isComponentEntityActive(
  powerAwareComponent,
  powerAwareEntityId,
  powerAwareState,
  powerAwareContext = {}
) {
  if (String(powerAwareEntityId || "").startsWith("cover.")) {
    return coverComponentIsActive(
      powerAwareComponent,
      powerAwareEntityId,
      powerAwareState,
      powerAwareContext
    );
  }
  const runtimePowerEntityId = String(
    powerAwareComponent?.properties?.runtimePowerEntityId || powerAwareEntityId
  );
  const runtimePowerState =
    runtimePowerEntityId === powerAwareEntityId
      ? powerAwareState
      : powerAwareContext.states?.get(runtimePowerEntityId);
  return entityPowerIsOn(runtimePowerEntityId, runtimePowerState, powerAwareComponent);
}
/**
 * 判断灯光特效是否在「等待实时视觉参数」。
 *
 * 解决的问题：刚开灯时实体的 brightness / color_temp 属性往往要晚一拍才上报，
 * 若立刻按当前（缺失的）属性绘制，效果层会先按默认值闪一下再跳到真实亮度。
 * 因此这里在「灯已开、能力支持、但对应属性还没到」时返回 true，
 * 渲染侧据此打上 awaiting-light-visual 类，让 CSS 先不做过场。
 *
 * 编辑态、非 light 域、两项实时效果都被关掉时一律返回 false；
 * 实体状态缺失 / unknown / unavailable 时返回 true（信息还没到位）；
 * 若刚下发了开机指令（pendingOptimisticState.desiredActive）则以乐观状态为准，不再等待。
 *
 * @param {object} effectAwaitComponent 特效控件。
 * @param {object} [effectAwaitContext] 渲染上下文。
 * @returns {boolean} 是否处于等待状态。
 */
export function iconButtonEffectLightVisualAwaiting(effectAwaitComponent, effectAwaitContext = {}) {
  const effectAwaitProperties = effectAwaitComponent?.properties || {};
  const effectAwaitEntityId = String(effectAwaitComponent?.bindings?.entity?.entityId || "");
  if (
    !!effectAwaitContext.editable ||
    !effectAwaitEntityId.startsWith("light.") ||
    (effectAwaitProperties.effectBrightnessRealtime === false &&
      effectAwaitProperties.effectColorTemperatureRealtime === false)
  ) {
    return false;
  }
  const effectAwaitState = resolveStateEntry(effectAwaitContext.states?.get?.(effectAwaitEntityId));
  const effectAwaitStateText = String(effectAwaitState?.state || "").toLowerCase();
  if (
    !effectAwaitState ||
    effectAwaitStateText === "unknown" ||
    effectAwaitStateText === "unavailable"
  ) {
    return true;
  }
  if (
    effectAwaitContext.pendingOptimisticState?.desiredActive === true ||
    effectAwaitStateText !== "on"
  ) {
    return false;
  }
  const effectAwaitAttributes = effectAwaitState.attributes || {};
  const effectAwaitRealtimeCapabilities = lightRealtimeCapabilities(
    effectAwaitEntityId,
    effectAwaitState
  );
  // 判断某属性是否已带上可用数值：null / undefined / 空串一律算「缺席」（HA 里未上报
  // 的属性正是这几种形态），其余再经 Number 转换并校验有限性 —— 因为 HA 上报的数值
  // 属性可能是字符串。返回 false 表示实时值还没到，调用方据此继续等待视觉。
  const hasNumericAttribute = attributeKey =>
    effectAwaitAttributes[attributeKey] !== null &&
    effectAwaitAttributes[attributeKey] !== undefined &&
    effectAwaitAttributes[attributeKey] !== "" &&
    Number.isFinite(Number(effectAwaitAttributes[attributeKey]));
  if (
    effectAwaitProperties.effectBrightnessRealtime !== false &&
    effectAwaitRealtimeCapabilities.brightness &&
    !hasNumericAttribute("brightness")
  ) {
    return true;
  }
  const effectSupportedColorModes = Array.isArray(effectAwaitAttributes.supported_color_modes)
    ? effectAwaitAttributes.supported_color_modes.map(colorModeName =>
        String(colorModeName || "").toLowerCase()
      )
    : [];
  const effectActiveColorMode = String(effectAwaitAttributes.color_mode || "").toLowerCase();
  const isEffectColorTemperatureMode =
    effectActiveColorMode === "color_temp" ||
    (!effectActiveColorMode &&
      effectSupportedColorModes.length === 1 &&
      effectSupportedColorModes[0] === "color_temp");
  return (
    effectAwaitProperties.effectColorTemperatureRealtime !== false &&
    !!effectAwaitRealtimeCapabilities.colorTemperature &&
    !!isEffectColorTemperatureMode &&
    !hasNumericAttribute("color_temp_kelvin") &&
    !hasNumericAttribute("color_temp")
  );
}
/**
 * 生成扫地机实时地图的图片地址。
 *
 * 走 HA 的 image_proxy；hb 查询参数充当缓存键，取 updatedAt / lastChanged / state，
 * 都取不到时用 initial。地图内容更新时这个值会变，浏览器才会重新取图而不用缓存。
 *
 * @param {string} vacuumImageEntityId 地图实体 ID。
 * @param {object} [vacuumImageState] 状态对象或变更对象。
 * @returns {string} 图片地址。
 */
export function vacuumMapImageSource(vacuumImageEntityId, vacuumImageState = null) {
  const vacuumImageResolvedState = resolveStateEntry(vacuumImageState) || {};
  const vacuumImageCacheKey = String(
    vacuumImageResolvedState.updatedAt ||
      vacuumImageResolvedState.lastChanged ||
      vacuumImageResolvedState.state ||
      "initial"
  );
  return (
    "/api/image_proxy/" +
    encodeURIComponent(String(vacuumImageEntityId || "")) +
    "?hb=" +
    encodeURIComponent(vacuumImageCacheKey)
  );
}
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
  lightStatisticsSummary
} from "./light-statistics-runtime.js?v=20260918233037";
import {
  automaticNumericPrecision,
  formatLineChartValue,
  formatNumericValue,
  lineChartGeometry,
  normalizedStatePrecision
} from "./line-chart-runtime.js?v=20260918233037";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix
} from "./door-window-runtime.js?v=20260918233037";
import {
  automaticThresholds,
  meteoconUrl,
  normalizedThresholds,
  resolvedThresholds,
  smoothChartPath,
  thresholdColor,
  weatherVisual
} from "./weather-chart-runtime.js?v=20260918233037";
import {
  formatLocalDate,
  formatLocalTime,
  formatLunarDate
} from "./date-time-runtime.js?v=20260918233037";
// 统一再导出各 runtime 的纯函数：页面脚本只 import registry.js 一处即可，
// 也保证注册表与这些工具用的是同一份模块实例（版本戳不一致会出现两份）。
export {
  lightStatisticsEntityStateStatus as lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport as lightStatisticsEntitySupport,
  lightStatisticsSummary as lightStatisticsSummary,
  automaticNumericPrecision as automaticNumericPrecision,
  formatLineChartValue as formatLineChartValue,
  formatNumericValue as formatNumericValue,
  lineChartGeometry as lineChartGeometry,
  normalizedStatePrecision as normalizedStatePrecision,
  doorWindowPerspectiveCorners as doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix,
  meteoconUrl as meteoconUrl,
  automaticThresholds as automaticThresholds,
  normalizedThresholds as normalizedThresholds,
  resolvedThresholds as resolvedThresholds,
  smoothChartPath as smoothChartPath,
  thresholdColor as thresholdColor,
  weatherVisual as weatherVisual,
  formatLocalDate as formatLocalDate,
  formatLocalTime as formatLocalTime,
  formatLunarDate as formatLunarDate
};
import {
  formatPresenceDuration,
  presenceAnimationPhase,
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp
} from "./presence-runtime.js?v=20260918233037";
export {
  formatPresenceDuration as formatPresenceDuration,
  presenceAnimationPhase as presenceAnimationPhase,
  presenceHistoryBuckets as presenceHistoryBuckets,
  presenceMotionEventConfig as presenceMotionEventConfig,
  presenceSensorPresentation as presenceSensorPresentation,
  presenceStateTimestamp as presenceStateTimestamp
};
/**
 * 取实体状态的图标名。
 *
 * 优先用实体自身上报的 icon 属性；没有则按域给一个默认 mdi 图标，
 * 认不出的域用 mdi:devices 兜底。
 *
 * @param {string} stateIconEntityId 实体 ID。
 * @param {object} stateIconEntityState 状态对象。
 * @returns {string} mdi 图标名。
 */
function resolveStateIcon(stateIconEntityId, stateIconEntityState) {
  const stateIconName = String(
    resolveStateEntry(stateIconEntityState)?.attributes?.icon || ""
  ).trim();
  if (stateIconName) {
    return stateIconName;
  }
  const entityDomainName = String(stateIconEntityId || "").split(".")[0];
  return (
    {
      binary_sensor: "mdi:radiobox-marked",
      button: "mdi:gesture-tap-button",
      climate: "mdi:thermostat",
      cover: "mdi:window-shutter",
      fan: "mdi:fan",
      input_boolean: "mdi:toggle-switch",
      light: "mdi:lightbulb-outline",
      lock: "mdi:lock-outline",
      media_player: "mdi:play-circle-outline",
      number: "mdi:numeric",
      remote: "mdi:remote",
      sensor: "mdi:gauge",
      switch: "mdi:toggle-switch-outline",
      water_heater: "mdi:water-boiler"
    }[entityDomainName] || "mdi:devices"
  );
}
/**
 * 把实体状态格式化成展示文案。
 *
 * 文案优先级：数值（纯数字才格式化，精度取 properties.statePrecision）→
 * 窗帘电机反接时的状态互换文案 → HA 翻译（两级键：实体状态键与组件状态键）→
 * 内置中英文对照表 → 原始状态值 → 「未知」。
 * 最后按需拼接单位；状态本身是「不可用 / 未知」时不拼单位。
 *
 * @param {object} rawState 状态对象或变更对象。
 * @param {string} [formattedEntityId] 实体 ID。
 * @param {object} [formatContext] 上下文：entityMetadata、entityTranslations、component。
 * @returns {string} 展示文案；没有状态时返回「等待实体状态」。
 */
export function formatEntityState(rawState, formattedEntityId = "", formatContext = {}) {
  const resolvedStateEntry = resolveStateEntry(rawState);
  if (!resolvedStateEntry) {
    return "等待实体状态";
  }
  const stateValueText = String(resolvedStateEntry.state ?? "").trim();
  const entityMetadataEntry = formatContext.entityMetadata?.get?.(formattedEntityId) || {};
  const integrationPlatform = String(entityMetadataEntry.platform || "").trim();
  const entityDomain = String(
    entityMetadataEntry.domain || formattedEntityId.split(".")[0] || ""
  ).trim();
  const translationKey = String(entityMetadataEntry.translationKey || "").trim();
  const stateTranslationKey =
    integrationPlatform && entityDomain && translationKey && stateValueText
      ? "component." +
        integrationPlatform +
        ".entity." +
        entityDomain +
        "." +
        translationKey +
        ".state." +
        stateValueText
      : "";
  const deviceClass = String(resolvedStateEntry.attributes?.device_class || "").trim();
  const componentTranslationKey =
    entityDomain && deviceClass && stateValueText
      ? "component." +
        entityDomain +
        ".entity_component." +
        deviceClass +
        ".state." +
        stateValueText
      : "";
  const translatedStateText = String(
    (stateTranslationKey ? formatContext.entityTranslations?.[stateTranslationKey] : "") ||
      (componentTranslationKey
        ? formatContext.entityTranslations?.[componentTranslationKey]
        : "") ||
      ""
  ).trim();
  const defaultStateLabels =
    {
      on: "开启",
      off: "关闭",
      open: "打开",
      closed: "关闭",
      locked: "已上锁",
      unlocked: "已解锁",
      home: "在家",
      not_home: "离家",
      unavailable: "不可用",
      unknown: "未知",
      idle: "待机",
      sweeping: "扫地中",
      charging: "充电中",
      docked: "已停靠",
      partlycloudy: "晴间多云",
      "power off": "已关闭",
      playing: "播放中",
      paused: "已暂停"
    }[stateValueText.toLowerCase()] ||
    stateValueText ||
    "未知";
  const coverStateOverride =
    String(formattedEntityId || "").startsWith("cover.") &&
    coverMotorIsReversedForComponent(formatContext.component)
      ? {
          open: "关闭",
          closed: "打开",
          opening: "正在关闭",
          closing: "正在打开"
        }[stateValueText.toLowerCase()]
      : "";
  const numericStateValue = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(stateValueText)
    ? Number(stateValueText)
    : Number.NaN;
  // 只有整串都是数字时才当数值格式化，避免把 on / off 或带单位的字符串当数字处理。
  const displayState = Number.isFinite(numericStateValue)
    ? formatNumericValue(numericStateValue, formatContext.component?.properties?.statePrecision)
    : coverStateOverride || translatedStateText || defaultStateLabels;
  const unitOfMeasurement = String(resolvedStateEntry.attributes?.unit_of_measurement || "").trim();
  if (unitOfMeasurement && !["不可用", "未知"].includes(displayState)) {
    return displayState + " " + unitOfMeasurement;
  } else {
    return displayState;
  }
}
/**
 * 灯光类控件的活动态判定。
 *
 * 编辑器里直接采用预览开关；运行时按绑定实体是否处于开启态判断。
 *
 * @param {object} visualComponent 控件对象。
 * @param {object} visualContext 渲染上下文。
 * @returns {boolean} 是否活动。
 */
function isLightVisualActive(visualComponent, visualContext) {
  if (visualContext.editable && visualContext.previewState === "on") {
    return true;
  }
  if (visualContext.editable && visualContext.previewState === "off") {
    return false;
  }
  const visualEntityId = visualComponent.bindings?.entity?.entityId || "";
  return (
    !!visualEntityId &&
    !!isComponentEntityActive(
      visualComponent,
      visualEntityId,
      visualContext.states?.get(visualEntityId),
      visualContext
    )
  );
}
// 色温视觉基准点：3500K 视为中性（不做饱和调整），偏暖加饱和、偏冷减饱和。
export const ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN = 3500;
/**
 * 把亮度百分比换算成特效层的透明度。
 *
 * 映射到 0.2~1 而不是 0~1：最暗时仍留一点可见度，否则用户完全看不到控件。
 * 亮度缺失或非法时按满亮处理（1）。
 *
 * @param {*} brightnessPercent 亮度百分比。
 * @returns {number} 0.2~1 的透明度（亮度为 0 时返回 0）。
 */
function brightnessPercentToOpacity(brightnessPercent) {
  if (
    brightnessPercent == null ||
    brightnessPercent === "" ||
    !Number.isFinite(Number(brightnessPercent))
  ) {
    return 1;
  }
  const clampedBrightness = Math.max(0, Math.min(1, Number(brightnessPercent) / 100));
  if (clampedBrightness <= 0) {
    return 0;
  } else {
    return 0.2 + clampedBrightness * 0.8;
  }
}
/**
 * 从属性里取色温（开尔文）。
 *
 * 新版 HA 给 color_temp_kelvin，老版只给 mired 单位的 color_temp，
 * 后者用 1000000 / mired 换算。两者都没有则返回 null。
 *
 * @param {object} [kelvinAttributes] 实体属性。
 * @returns {number|null} 开尔文值。
 */
function resolveColorTemperature(kelvinAttributes = {}) {
  const colorTempKelvin = Number(kelvinAttributes.color_temp_kelvin);
  if (Number.isFinite(colorTempKelvin) && colorTempKelvin > 0) {
    return colorTempKelvin;
  }
  const colorTempMired = Number(kelvinAttributes.color_temp);
  if (Number.isFinite(colorTempMired) && colorTempMired > 0) {
    return 1000000 / colorTempMired;
  } else {
    return null;
  }
}
/**
 * 计算灯光特效层的视觉参数。
 *
 * 亮度换算成透明度，色温换算成饱和度滤镜；两项实时效果都可以在控件属性里单独关掉，
 * 关掉的那一项不参与计算（透明度假定为 1、滤镜为 none），
 * 这样用户可以在页面上固定一个理想外观而不随灯的实际状态变化。
 *
 * @param {object} lightVisualComponent 控件对象。
 * @param {object} [lightVisualContext] 渲染上下文，提供 states。
 * @returns {{brightnessPercent: number|null, colorTemperatureKelvin: number|null,
 *   opacity: number, filter: string}} 视觉参数。非 light 域返回中性值。
 */
export function iconButtonEffectLightVisualState(lightVisualComponent, lightVisualContext = {}) {
  const lightVisualEntityId = String(lightVisualComponent?.bindings?.entity?.entityId || "");
  const lightVisualAttributes =
    resolveStateEntry(lightVisualContext.states?.get?.(lightVisualEntityId))?.attributes || {};
  if (!lightVisualEntityId.startsWith("light.")) {
    return {
      brightnessPercent: null,
      colorTemperatureKelvin: null,
      opacity: 1,
      filter: "none"
    };
  }
  const brightnessAttribute = lightVisualAttributes.brightness;
  const brightnessNumber =
    brightnessAttribute == null || brightnessAttribute === ""
      ? Number.NaN
      : Number(brightnessAttribute);
  const brightnessPercentValue = Number.isFinite(brightnessNumber)
    ? Math.max(0, Math.min(100, (brightnessNumber / 255) * 100))
    : null;
  const colorTemperatureKelvin = resolveColorTemperature(lightVisualAttributes);
  const visualProperties = lightVisualComponent?.properties || {};
  const isBrightnessRealtime = visualProperties.effectBrightnessRealtime !== false;
  const isColorTemperatureRealtime = visualProperties.effectColorTemperatureRealtime !== false;
  const brightnessOpacity = isBrightnessRealtime
    ? brightnessPercentToOpacity(brightnessPercentValue)
    : 1;
  if (!isColorTemperatureRealtime || !Number.isFinite(colorTemperatureKelvin)) {
    return {
      brightnessPercent: brightnessPercentValue,
      colorTemperatureKelvin: null,
      opacity: brightnessOpacity,
      filter: "none"
    };
  }
  // 偏暖窗口 1500K、偏冷窗口 3000K（冷端范围更宽，视觉上冷白光的变化本来就比暖光缓）；
  // 饱和度系数按 1 + 暖 * 0.95 - 冷 * 0.55 计算，暖端加得更猛、冷端收得更轻。
  const warmFactor = Math.max(
    0,
    Math.min(1, (ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN - colorTemperatureKelvin) / 1500)
  );
  const coolFactor = Math.max(
    0,
    Math.min(1, (colorTemperatureKelvin - ICON_BUTTON_EFFECT_BASE_TEMPERATURE_KELVIN) / 3000)
  );
  const saturationFactor = 1 + warmFactor * 0.95 - coolFactor * 0.55;
  return {
    brightnessPercent: brightnessPercentValue,
    colorTemperatureKelvin: colorTemperatureKelvin,
    opacity: brightnessOpacity,
    filter: "saturate(" + saturationFactor.toFixed(3) + ")"
  };
}
/**
 * 设备按钮的活动态判定（逻辑与灯光一致，编辑器走预览、运行时看实体）。
 *
 * @param {object} buttonPreviewComponent 控件对象。
 * @param {object} buttonPreviewContext 渲染上下文。
 * @returns {boolean} 是否活动。
 */
function isDeviceButtonVisualActive(buttonPreviewComponent, buttonPreviewContext) {
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "on") {
    return true;
  }
  if (buttonPreviewContext.editable && buttonPreviewContext.previewState === "off") {
    return false;
  }
  const buttonPreviewEntityId = buttonPreviewComponent.bindings?.entity?.entityId || "";
  return (
    !!buttonPreviewEntityId &&
    !!isComponentEntityActive(
      buttonPreviewComponent,
      buttonPreviewEntityId,
      buttonPreviewContext.states?.get(buttonPreviewEntityId),
      buttonPreviewContext
    )
  );
}
/**
 * 取温控控件用于渲染的模式名。
 *
 * 编辑态预览开机时给一个示例模式（浴霸给 heat、空调给 cool），
 * 预览关机直接 off；运行时走 climate.js 的展示模式推导，并统一转小写便于类名拼接。
 *
 * @param {object} climateComponent 控件对象。
 * @param {object} climateContext 渲染上下文。
 * @returns {string} 模式名。
 */
function resolveClimatePresentationMode(climateComponent, climateContext) {
  const climateEntityId = climateComponent.bindings?.entity?.entityId || "";
  const climateState = resolveStateEntry(climateContext.states?.get(climateEntityId));
  const climateDeviceType = resolveClimateDeviceType(
    climateComponent,
    climateState,
    climateEntityId
  );
  if (climateContext.editable && climateContext.previewState === "on") {
    if (climateDeviceType === "bath-heater") {
      return "heat";
    } else {
      return "cool";
    }
  } else if (climateContext.editable && climateContext.previewState === "off") {
    return "off";
  } else {
    return climatePresentationMode(climateState, climateDeviceType).toLowerCase();
  }
}
/**
 * 温控设备的开关态判定。
 *
 * @param {object} poweredComponent 控件对象。
 * @param {object} poweredContext 渲染上下文。
 * @returns {boolean} 是否开机。
 */
function isClimateDeviceActive(poweredComponent, poweredContext) {
  if (poweredContext.editable && poweredContext.previewState === "on") {
    return true;
  }
  if (poweredContext.editable && poweredContext.previewState === "off") {
    return false;
  }
  const poweredEntityId = poweredComponent.bindings?.entity?.entityId || "";
  const poweredState = resolveStateEntry(poweredContext.states?.get(poweredEntityId));
  return climateIsPoweredOn(
    poweredState,
    resolveClimateDeviceType(poweredComponent, poweredState, poweredEntityId)
  );
}
/**
 * 取温控设备出风特效的模式（编辑态预览开机统一按 cool 展示）。
 *
 * @param {object} effectModeComponent 控件对象。
 * @param {object} effectModeContext 渲染上下文。
 * @returns {string} off / cool / heat / other。
 */
function resolveClimateEffectMode(effectModeComponent, effectModeContext) {
  const effectModeEntityId = effectModeComponent.bindings?.entity?.entityId || "";
  const effectModeState = resolveStateEntry(effectModeContext.states?.get(effectModeEntityId));
  const effectModeDeviceType = resolveClimateDeviceType(
    effectModeComponent,
    effectModeState,
    effectModeEntityId
  );
  if (effectModeContext.editable && effectModeContext.previewState === "on") {
    return "cool";
  } else if (effectModeContext.editable && effectModeContext.previewState === "off") {
    return "off";
  } else {
    return climateEffectMode(effectModeState, effectModeDeviceType);
  }
}
/**
 * 取温控控件的模式标签文案。
 *
 * 关机时只显示模式名；开机且有目标温度时追加目标温度，
 * 没有目标温度才退回当前温度，两者都没有就只显示模式名。
 *
 * @param {object} modeLabelComponent 控件对象。
 * @param {object} modeLabelContext 渲染上下文。
 * @returns {string} 标签文案。
 */
function resolveClimateLabel(modeLabelComponent, modeLabelContext) {
  const modeLabelEntityId = modeLabelComponent.bindings?.entity?.entityId || "";
  const modeLabelState = resolveStateEntry(modeLabelContext.states?.get(modeLabelEntityId));
  const climateMode = resolveClimatePresentationMode(modeLabelComponent, modeLabelContext);
  const modeLabelDeviceType = resolveClimateDeviceType(
    modeLabelComponent,
    modeLabelState,
    modeLabelEntityId
  );
  const climateModeText = climateModeLabel(climateMode, modeLabelDeviceType);
  if (!isClimateDeviceActive(modeLabelComponent, modeLabelContext)) {
    return climateModeText;
  }
  const climateCapabilities = normalizeClimateCapabilities(modeLabelState);
  if (climateCapabilities.targetTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.targetTemperature + "°C";
  } else if (climateCapabilities.currentTemperature !== null) {
    return climateModeText + " · " + climateCapabilities.currentTemperature + "°C";
  } else {
    return climateModeText;
  }
}
/**
 * 生成空调 / 浴霸出风动画的 SVG，并以 data URI 形式返回。
 *
 * 用 SVG 而不是 canvas：出风是纯矢量渐变与位移，SVG 交给浏览器合成更省电，
 * 且可以用 SMIL 动画（animateMotion）让光带沿路径流动，不需要 JS 逐帧驱动。
 * 用 data URI 而不是内联 DOM：图片可以享受浏览器的图片缓存与解码优化。
 *
 * 所有外观参数都做了区间夹取，越界值不会画出破图；
 * 颜色随制冷（蓝）/ 制热（橙）/ 其它（白）切换。
 *
 * @param {object} [airflowProperties] 控件属性，含角度、长度、密度、厚度、速度、模糊等。
 * @param {string} [airflowClimateMode] 特效模式：cool / heat / other。
 * @returns {string} data:image/svg+xml 形式的地址。
 */
function buildAirflowSvg(airflowProperties = {}, airflowClimateMode = "other") {
  const airflowMotionMode = airflowProperties.airflowMotion === "static" ? "static" : "dynamic";
  const airflowColor =
    airflowClimateMode === "cool"
      ? resolveColor(airflowProperties.airflowCoolColor, "#73c8ff")
      : airflowClimateMode === "heat"
        ? resolveColor(airflowProperties.airflowHeatColor, "#ff8a65")
        : resolveColor(airflowProperties.airflowOtherColor, "#ffffff");
  const airflowAngleDeg = clampCoercedNumber(airflowProperties.airflowAngle, -360, 360, 7);
  const airflowLengthRatio = clampCoercedNumber(airflowProperties.airflowLength, 10, 300, 200) / 100;
  const airflowFadeRatio = clampCoercedNumber(airflowProperties.airflowFadePosition, 15, 100, 50) / 100;
  const airflowSpreadValue = clampCoercedNumber(airflowProperties.airflowSpread, 10, 300, 100);
  const airflowCurveValue = Math.tanh(
    clampCoercedNumber(airflowProperties.airflowCurve, -200, 200, 20) / 140
  );
  const airflowDensityRatio = clampCoercedNumber(airflowProperties.airflowDensity, 20, 200, 60) / 100;
  const airflowIrregularityRatio =
    clampCoercedNumber(airflowProperties.airflowIrregularity, 0, 200, 50) / 100;
  const airflowThicknessRatio = clampCoercedNumber(airflowProperties.airflowThickness, 5, 300, 40) / 100;
  const airflowStrengthRatio = clampCoercedNumber(airflowProperties.airflowStrength, 0, 500, 200) / 100;
  const airflowBlurPx = clampCoercedNumber(airflowProperties.airflowBlur, 0, 30, 6);
  const airflowSpeedSeconds = clampCoercedNumber(airflowProperties.airflowSpeed, 0.3, 12, 1);
  const airflowTopY = 6;
  const airflowBottomY = airflowTopY + (228 - airflowTopY) * airflowFadeRatio;
  const airflowMidY = airflowTopY + (airflowBottomY - airflowTopY) * 0.63;
  const airflowTailY = airflowMidY + (airflowBottomY - airflowMidY) * 0.56;
  const airflowSpreadPx = Math.min(70, Math.sqrt(airflowSpreadValue / 100) * 44);
  // 确定性伪随机（sin 哈希取小数部分）：形状要有「随机感」，
  // 但同一个控件的每次渲染必须完全一致，否则每次状态更新气流都会跳动。
  const pseudoRandomUnit = randomSeed => {
    const randomSeedProduct = Math.sin(randomSeed * 12.9898) * 43758.5453;
    return randomSeedProduct - Math.floor(randomSeedProduct);
  };
  // 主气流条数 3~12、小光点 2~4 条，都按密度比例推算并设上下限：
  // 太少看不出风，太多则 SVG 节点数暴涨（每个光点两个 rect）。
  const airflowStrandCount = Math.max(3, Math.min(12, Math.round(airflowDensityRatio * 8)));
  const airflowWispCount = Math.max(2, Math.min(4, Math.round(1.5 + airflowDensityRatio * 1.2)));
  const airflowStrandOffsets = Array.from(
    {
      length: airflowStrandCount
    },
    (strandElement, strandIndex) => {
      const strandRatio = airflowStrandCount === 1 ? 0.5 : strandIndex / (airflowStrandCount - 1);
      const strandJitter =
        (pseudoRandomUnit(strandIndex + 3) - 0.5) * 10 * airflowIrregularityRatio;
      return Math.max(
        10,
        Math.min(170, 90 + (strandRatio - 0.5) * airflowSpreadPx * 2 + strandJitter)
      );
    }
  );
  const minStrandOffset = Math.min(...airflowStrandOffsets);
  const maxStrandOffset = Math.max(...airflowStrandOffsets);
  const strandBaseOffset = airflowCurveValue >= 0 ? 168 - maxStrandOffset : minStrandOffset - 12;
  const strandCurveOffset = airflowCurveValue * Math.max(0, strandBaseOffset);
  const airflowStrandPaths = airflowStrandOffsets.map(strandOffset => {
    const strandEndOffset = strandOffset + strandCurveOffset;
    const strandControlOffset = strandOffset + strandCurveOffset * 0.42;
    return (
      "M" +
      strandOffset.toFixed(2) +
      " " +
      airflowTopY +
      "L" +
      strandOffset.toFixed(2) +
      " " +
      airflowMidY.toFixed(2) +
      "C" +
      strandOffset.toFixed(2) +
      " " +
      airflowTailY.toFixed(2) +
      " " +
      strandControlOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2) +
      " " +
      strandEndOffset.toFixed(2) +
      " " +
      airflowBottomY.toFixed(2)
    );
  });
  const airflowWisps = airflowStrandPaths.flatMap((strandPathD, strandPathIndex) =>
    Array.from(
      {
        length: airflowWispCount
      },
      (wispElement, wispIndex) => {
        const wispSeed = strandPathIndex * 41 + wispIndex * 67 + 11;
        const wispLength = Math.max(
          8,
          Math.min(
            112,
            (34 + pseudoRandomUnit(wispSeed) * 42 * (0.7 + airflowIrregularityRatio * 0.3)) *
              airflowLengthRatio
          )
        );
        const wispWidth = Math.max(
          0.2,
          Math.min(14, (1.5 + pseudoRandomUnit(wispSeed + 7) * 2.9) * airflowThicknessRatio)
        );
        const wispDuration =
          airflowSpeedSeconds *
          (0.8 + pseudoRandomUnit(wispSeed + 13) * 0.42 * (0.55 + airflowIrregularityRatio * 0.45));
        const wispPhase =
          (wispIndex / airflowWispCount +
            strandPathIndex * 0.067 +
            (pseudoRandomUnit(wispSeed + 19) - 0.5) * 0.08 * airflowIrregularityRatio +
            1) %
          1;
        const wispOpacity = Math.min(
          1,
          airflowStrengthRatio * (0.62 + pseudoRandomUnit(wispSeed + 29) * 0.5)
        );
        const wispMarkup =
          '<rect x="' +
          (-wispLength / 2).toFixed(2) +
          '" y="' +
          (-wispWidth * 1.3).toFixed(2) +
          '" width="' +
          wispLength.toFixed(2) +
          '" height="' +
          (wispWidth * 2.6).toFixed(2) +
          '" rx="' +
          (wispWidth * 1.3).toFixed(2) +
          '" fill="url(#wisp)" filter="url(#glow)"/><rect x="' +
          (-wispLength * 0.42).toFixed(2) +
          '" y="' +
          (-wispWidth * 0.22).toFixed(2) +
          '" width="' +
          (wispLength * 0.82).toFixed(2) +
          '" height="' +
          (wispWidth * 0.44).toFixed(2) +
          '" rx="' +
          (wispWidth * 0.22).toFixed(2) +
          '" fill="url(#core)"/>';
        // 静态模式：不循环动画，而是用一次 0.001 秒的 animateMotion 加 fill=freeze，
        // 把光点钉在 keyPoints 指定的相位上——等价于「摆好姿势不播放」。
        if (airflowMotionMode === "static") {
          return (
            '<g opacity="' +
            wispOpacity.toFixed(3) +
            '">' +
            wispMarkup +
            '<animateMotion path="' +
            strandPathD +
            '" dur="0.001s" keyPoints="' +
            wispPhase.toFixed(4) +
            ";" +
            wispPhase.toFixed(4) +
            '" keyTimes="0;1" fill="freeze" rotate="auto"/></g>'
          );
        } else {
          return (
            '<g opacity="0">' +
            wispMarkup +
            '<animate attributeName="opacity" values="0;' +
            wispOpacity.toFixed(3) +
            ";" +
            wispOpacity.toFixed(3) +
            ';0" keyTimes="0;.06;.78;1" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" repeatCount="indefinite"/><animateMotion path="' +
            strandPathD +
            '" dur="' +
            wispDuration.toFixed(3) +
            's" begin="' +
            (-wispDuration * wispPhase).toFixed(3) +
            's" rotate="auto" repeatCount="indefinite"/></g>'
          );
        }
      }
    )
  );
  // 外层固定 viewBox 0 0 180 240 并由 preserveAspectRatio=none 拉伸铺满图层，
  // 因此内部坐标是「百分比式」的，与控件实际尺寸无关；
  // 角度用整体 rotate(angle 90 120) 实现，绕画布中心旋转。
  const airflowSvgMarkup =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 240" preserveAspectRatio="none"><defs><linearGradient id="bed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".22" stop-color="' +
    airflowColor +
    '" stop-opacity=".25"/><stop offset=".58" stop-color="' +
    airflowColor +
    '" stop-opacity=".8"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="wisp"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".2" stop-color="' +
    airflowColor +
    '" stop-opacity=".18"/><stop offset=".52" stop-color="' +
    airflowColor +
    '"/><stop offset=".78" stop-color="' +
    airflowColor +
    '" stop-opacity=".52"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><linearGradient id="core"><stop offset="0" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/><stop offset=".34" stop-color="' +
    airflowColor +
    '" stop-opacity=".12"/><stop offset=".58" stop-color="' +
    airflowColor +
    '"/><stop offset=".82" stop-color="' +
    airflowColor +
    '" stop-opacity=".28"/><stop offset="1" stop-color="' +
    airflowColor +
    '" stop-opacity="0"/></linearGradient><filter id="glow" x="-120%" y="-240%" width="340%" height="580%"><feGaussianBlur stdDeviation="' +
    Math.max(0.2, airflowBlurPx * 1.35) +
    '"/><feComponentTransfer><feFuncA type="linear" slope="' +
    (airflowStrengthRatio <= 1 ? 1 : 1 + (airflowStrengthRatio - 1) * 0.9).toFixed(3) +
    '"/></feComponentTransfer></filter></defs><g transform="rotate(' +
    airflowAngleDeg +
    ' 90 120)">' +
    airflowStrandPaths
      .map(
        airflowBedPath =>
          '<path d="' +
          airflowBedPath +
          '" fill="none" stroke="url(#bed)" stroke-width="1.2" stroke-linecap="round" opacity="' +
          Math.min(1, airflowStrengthRatio * 0.075).toFixed(3) +
          '"/>'
      )
      .join("") +
    airflowWisps.join("") +
    "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airflowSvgMarkup);
}
/**
 * 渲染空调 / 浴霸的出风图层。
 *
 * @param {object} airflowLayerComponent 图层控件。
 * @param {object} airflowLayerContext 渲染上下文。
 * @returns {HTMLElement|null} 出风图层；设备未运行或图层被关闭时返回 null（调用方跳过渲染）。
 */
export function renderAirConditionerAirflowLayer(airflowLayerComponent, airflowLayerContext) {
  const airflowLayerProperties = airflowLayerComponent.properties || {};
  if (
    airflowLayerProperties.airflowVisible === false ||
    !isClimateDeviceActive(airflowLayerComponent, airflowLayerContext)
  ) {
    return null;
  }
  const airflowLayerElement = document.createElement("div");
  airflowLayerElement.className = "hb-air-conditioner-airflow-layer";
  const airflowImageElement = document.createElement("img");
  airflowImageElement.src = buildAirflowSvg(
    airflowLayerProperties,
    resolveClimateEffectMode(airflowLayerComponent, airflowLayerContext)
  );
  airflowImageElement.alt = "";
  airflowImageElement.draggable = false;
  airflowLayerElement.append(airflowImageElement);
  return airflowLayerElement;
}
/**
 * 创建 SVG 元素并挂到父节点。
 *
 * 必须用 createElementNS：用 createElement 创建的 svg 子元素不会被当作 SVG 渲染。
 *
 * @param {Element} svgParentElement 父节点。
 * @param {string} svgTagName 标签名。
 * @param {object} [svgAttributes] 属性表。
 * @returns {Element} 创建的元素。
 */
function appendSvgElement(svgParentElement, svgTagName, svgAttributes = {}) {
  const createdSvgElement = document.createElementNS("http://www.w3.org/2000/svg", svgTagName);
  for (const [svgAttributeName, svgAttributeValue] of Object.entries(svgAttributes)) {
    createdSvgElement.setAttribute(svgAttributeName, String(svgAttributeValue));
  }
  svgParentElement.append(createdSvgElement);
  return createdSvgElement;
}
/**
 * 把历史点整理成等间隔的折线序列。
 *
 * 处理要点：
 * - 丢掉时间戳或数值非法的点；
 * - 追加当前值作为最新一点，避免曲线停在最后一次历史采样上；
 * - 相邻重复（同一时间戳同一值）先去重，减少无意义的锯齿；
 * - 按「每小时一个桶」前向填充：桶内取该时刻之前最近的一条记录，
 *   这样空档期会自然延续上一个值，与仪表盘的读数语义一致。
 *
 * @param {object} historyContext 渲染上下文，提供 history（实体 ID → {points}）。
 * @param {string} historyEntityId 实体 ID。
 * @param {number} currentStateValue 当前值，非法时不追加。
 * @param {number} [historyHours] 时间窗口（小时）。
 * @returns {Array<{timestamp: number, value: number}>} 等间隔的序列点；无数据时为空数组。
 */
function buildHistorySeries(historyContext, historyEntityId, currentStateValue, historyHours = 24) {
  // 先把原始点归一成「毫秒时间戳 + Number 数值」，后面统一按这两个字段比较与排序；
  // 解析失败的点会得到 NaN，交给紧随其后的 filter 丢掉，避免脏数据把曲线拉平。
  const historySamples = (
    Array.isArray(historyContext.history?.get(historyEntityId)?.points)
      ? historyContext.history.get(historyEntityId).points
      : []
  )
    .map(historyPoint => ({
      timestamp: Date.parse(historyPoint.timestamp),
      value: Number(historyPoint.value)
    }))
    .filter(
      historySample =>
        Number.isFinite(historySample.timestamp) && Number.isFinite(historySample.value)
    );
  const nowTimestamp = Date.now();
  if (Number.isFinite(currentStateValue)) {
    historySamples.push({
      timestamp: nowTimestamp,
      value: currentStateValue
    });
  }
  historySamples.sort(
    (firstSample, secondSample) => firstSample.timestamp - secondSample.timestamp
  );
  const dedupedSamples = historySamples.filter(
    (dedupSample, dedupIndex) =>
      dedupIndex === 0 ||
      dedupSample.timestamp !== historySamples[dedupIndex - 1].timestamp ||
      dedupSample.value !== historySamples[dedupIndex - 1].value
  );
  if (!dedupedSamples.length) {
    return [];
  }
  // 窗口夹在 1 小时到 168 小时（一周）：再长的话每小时一个桶的曲线已经没有信息量。
  const sampleBucketCount = Math.round(clampCoercedNumber(historyHours, 1, 168, 24));
  const MILLISECONDS_PER_HOUR = 3600000;
  const windowStartTimestamp = nowTimestamp - sampleBucketCount * MILLISECONDS_PER_HOUR;
  const bucketedSamples = [];
  let sampleCursor = 0;
  let lastSample = null;
  for (let bucketIndex = 0; bucketIndex <= sampleBucketCount; bucketIndex += 1) {
    const bucketTimestamp =
      bucketIndex === sampleBucketCount
        ? nowTimestamp
        : windowStartTimestamp + bucketIndex * MILLISECONDS_PER_HOUR;
    while (
      sampleCursor < dedupedSamples.length &&
      dedupedSamples[sampleCursor].timestamp <= bucketTimestamp
    ) {
      lastSample = dedupedSamples[sampleCursor];
      sampleCursor += 1;
    }
    const bucketSample = lastSample || dedupedSamples[sampleCursor] || dedupedSamples[0];
    if (bucketSample) {
      bucketedSamples.push({
        timestamp: bucketTimestamp,
        value: bucketSample.value
      });
    }
  }
  return bucketedSamples;
}
/**
 * 把时间戳格式化成图表提示用的 `MM-DD HH:mm` 或 `HH:mm`。
 *
 * Intl 的中文格式用斜杠分隔，这里统一替换成短横线。
 *
 * @param {number} timestampValue 毫秒时间戳。
 * @param {boolean} [includeDate] 是否带上日期。
 * @returns {string} 格式化结果。
 */
function formatHistoryTimestamp(timestampValue, includeDate = true) {
  const dateTimeFormatOptions = includeDate
    ? {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    : {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      };
  return new Intl.DateTimeFormat("zh-CN", dateTimeFormatOptions)
    .format(new Date(timestampValue))
    .replace(/\//g, "-");
}
/**
 * 给折线图挂上指针提示：竖线、光点与跟随的数值气泡。
 *
 * 定位策略分三种，跟着气泡挂载的父元素走：
 * - 挂在图表容器内：用 absolute 定位，并按容器自身的缩放比反算，避免被父级 transform 放大；
 * - 挂在运行时弹窗层内：同样用 absolute 但要先减去弹窗层相对视口的偏移；
 * - 挂在 document.body：用 fixed 直接按视口坐标定位。
 * 另外气泡会按缩放比反向缩放，并在靠近容器左右边缘时改用右 / 左对齐，防止溢出被裁掉。
 *
 * @param {Element} chartRootElement 图表根元素（接收指针事件、提供 viewBox）。
 * @param {Element} chartContainerElement 图表容器（挂引导线与光点）。
 * @param {object} tooltipGeometry 由 lineChartGeometry 得到的几何数据，含 points / firstTime / lastTime。
 * @param {string} valueSuffix 数值单位后缀。
 * @param {function(object): {x: number, y: number}} positionMapper 把数据点映射到图表内百分比坐标。
 * @param {string} [valuePrecision] 数值精度设置。
 * @param {{start: number, end: number}} [valueRange] 指针横向位置对应的数据区间（0~1）。
 * @param {Element} [tooltipParentElement] 气泡挂载的父元素。
 * @returns {function(): void} 清理函数：解绑监听并移除气泡。
 */
function attachChartTooltip(
  chartRootElement,
  chartContainerElement,
  tooltipGeometry,
  valueSuffix,
  positionMapper,
  valuePrecision = "auto",
  valueRange = {
    start: 0,
    end: 1
  },
  tooltipParentElement = document.body
) {
  const tooltipElement = document.createElement("span");
  tooltipElement.className = "hb-line-chart-tooltip";
  if (tooltipParentElement === chartContainerElement) {
    tooltipElement.classList.add("hb-line-chart-details-tooltip");
  }
  tooltipElement.hidden = true;
  const hoverGuideElement = document.createElement("i");
  hoverGuideElement.className = "hb-line-chart-hover-guide";
  hoverGuideElement.hidden = true;
  const hoverDotElement = document.createElement("i");
  hoverDotElement.className = "hb-line-chart-hover-dot";
  hoverDotElement.hidden = true;
  chartContainerElement.append(hoverGuideElement, hoverDotElement);
  tooltipParentElement.append(tooltipElement);
  // 图表气泡的 pointermove 处理器：把指针横坐标折算成时间（先取容器内比例，再用
  // valueRange 收窄到数据区间），线性扫描最近样本，再按容器 / 弹层的实际缩放摆放
  // 气泡、引导线与光点。元素一律用百分比定位，容器尺寸变化时无需重算像素。
  const handlePointerMove = pointerEvent => {
    const dialogLayerElement =
      tooltipParentElement === chartContainerElement
        ? chartContainerElement.closest(".hb-renderer-runtime-dialog-layer")
        : null;
    if (dialogLayerElement && tooltipElement.parentElement !== dialogLayerElement) {
      dialogLayerElement.append(tooltipElement);
    }
    const rootRect = chartRootElement.getBoundingClientRect();
    if (!rootRect.width) {
      return;
    }
    // 指针落在根元素内的横向比例（0~1）；先取屏幕比例，再用 valueRange 折算到数据区间。
    const relativePointerX = (pointerEvent.clientX - rootRect.left) / rootRect.width;
    const rangeRatio = clampCoercedNumber(
      (relativePointerX - valueRange.start) / Math.max(0.001, valueRange.end - valueRange.start),
      0,
      1,
      0
    );
    const targetTime =
      tooltipGeometry.firstTime +
      rangeRatio * (tooltipGeometry.lastTime - tooltipGeometry.firstTime);
    // 线性扫描找时间上最近的点：点数受窗口限制（最多百来个），
    // 线性扫描比二分更好写，也更省一次排序假设。
    const closestSample = tooltipGeometry.points.reduce((nearestSample, candidateSample) =>
      Math.abs(candidateSample.timestamp - targetTime) <
      Math.abs(nearestSample.timestamp - targetTime)
        ? candidateSample
        : nearestSample
    );
    const mappedPosition = positionMapper(closestSample);
    const containerRect = chartContainerElement.getBoundingClientRect();
    const offsetX =
      chartRootElement.getBoundingClientRect().left -
      containerRect.left +
      (mappedPosition.x / 100) * rootRect.width;
    const offsetY =
      chartRootElement.getBoundingClientRect().top -
      containerRect.top +
      (mappedPosition.y / 100) * rootRect.height;
    const pageX = containerRect.left + offsetX;
    const pageY = containerRect.top + offsetY;
    // 引导线与光点用百分比定位：容器尺寸随缩放变化，百分比不必跟着重算像素值。
    const percentX = (offsetX / Math.max(1, containerRect.width)) * 100;
    // 纵向同理；CSS 定位百分比以容器左上角为原点，与 offsetX / offsetY 的口径一致。
    const percentY = (offsetY / Math.max(1, containerRect.height)) * 100;
    const isInsideContainer = tooltipElement.parentElement === chartContainerElement;
    const isInsideDialogLayer =
      dialogLayerElement && tooltipElement.parentElement === dialogLayerElement;
    const dialogRect = isInsideDialogLayer ? dialogLayerElement.getBoundingClientRect() : null;
    const chartScale =
      tooltipParentElement === chartContainerElement
        ? rootRect.width /
          Math.max(1, chartRootElement.viewBox?.baseVal?.width || chartRootElement.clientWidth)
        : containerRect.width / Math.max(1, chartContainerElement.offsetWidth);
    const scaleParentElement = isInsideContainer
      ? chartContainerElement
      : isInsideDialogLayer
        ? dialogLayerElement
        : null;
    const scaleParentRect = isInsideContainer ? containerRect : dialogRect;
    const parentScaleX = scaleParentElement
      ? scaleParentRect.width / Math.max(1, scaleParentElement.offsetWidth)
      : 1;
    const parentScaleY = scaleParentElement
      ? scaleParentRect.height / Math.max(1, scaleParentElement.offsetHeight)
      : 1;
    const dialogOffsetX = isInsideDialogLayer ? (pageX - dialogRect.left) / parentScaleX : pageX;
    const dialogOffsetY = isInsideDialogLayer ? (pageY - dialogRect.top) / parentScaleY : pageY;
    tooltipElement.textContent =
      formatHistoryTimestamp(closestSample.timestamp) +
      "  " +
      formatLineChartValue(closestSample.value, valuePrecision) +
      valueSuffix;
    tooltipElement.style.position = isInsideContainer || isInsideDialogLayer ? "absolute" : "fixed";
    tooltipElement.style.left =
      (isInsideContainer ? offsetX / parentScaleX : dialogOffsetX) + "px";
    tooltipElement.style.top =
      (isInsideContainer ? offsetY / parentScaleY : dialogOffsetY) + "px";
    tooltipElement.style.transformOrigin = "0 0";
    tooltipElement.hidden = false;
    const scaledTooltipWidth = tooltipElement.offsetWidth * chartScale;
    const boundLeft = scaleParentRect?.left ?? 0;
    const boundRight = scaleParentRect?.right ?? window.innerWidth;
    const translateX =
      pageX - scaledTooltipWidth / 2 < boundLeft
        ? "0"
        : pageX + scaledTooltipWidth / 2 > boundRight
          ? "-100%"
          : "-50%";
    tooltipElement.style.transform =
      `scale(${chartScale / parentScaleX}, ${chartScale / parentScaleY}) ` +
      `translate(${translateX}, calc(-100% - 9px))`;
    hoverGuideElement.style.left = percentX + "%";
    hoverDotElement.style.left = percentX + "%";
    hoverDotElement.style.top = percentY + "%";
    hoverGuideElement.hidden = false;
    hoverDotElement.hidden = false;
  };
  // 移出图表时只隐藏三个浮层元素，不销毁：指针在图表内反复进出时避免反复重建 DOM。
  const handlePointerLeave = () => {
    tooltipElement.hidden = true;
    hoverGuideElement.hidden = true;
    hoverDotElement.hidden = true;
  };
  chartRootElement.addEventListener("pointermove", handlePointerMove);
  chartRootElement.addEventListener("pointerleave", handlePointerLeave);
  return () => {
    chartRootElement.removeEventListener("pointermove", handlePointerMove);
    chartRootElement.removeEventListener("pointerleave", handlePointerLeave);
    tooltipElement.remove();
  };
}
/**
 * 生成导航按钮的边框与光晕 SVG。
 *
 * viewBox 宽度固定 236，高度按控件实际宽高比换算，配合 preserveAspectRatio=none 拉伸，
 * 于是内部只需按 236 宽的坐标系计算边距、圆角与描边宽度。
 * 渐变 id 用随机 UUID 加后缀：同一页面上可能有多个导航按钮，
 * id 冲突会让后来的按钮引用到前一个的渐变。
 *
 * @param {object} navFrameComponent 控件对象。
 * @param {object} navFrameProperties 控件属性。
 * @param {boolean} isNavFrameActive 是否活动，决定整体透明度档位。
 * @param {number} navFrameOpacity 透明度系数。
 * @param {number} navGlowStrength 光晕强度。
 * @param {number} navGlowSize 光晕范围。
 * @returns {SVGElement} 可直接挂载的 SVG 元素。
 */
function buildNavigationEffects(
  navFrameComponent,
  navFrameProperties,
  isNavFrameActive,
  navFrameOpacity,
  navGlowStrength,
  navGlowSize
) {
  const navFramePanelWidth = Math.max(1, Number(navFrameComponent.position?.width || 236));
  const navFramePanelHeight = Math.max(1, Number(navFrameComponent.position?.height || 100));
  const navFrameViewBoxHeight = Math.max(8, (navFramePanelHeight * 236) / navFramePanelWidth);
  const navFrameWidth = clampCoercedNumber(navFrameProperties.frameWidth, 0, 20, 2);
  const navFrameInset = Math.max(0.5, navFrameWidth / 2 + 0.5);
  const navFrameInnerWidth = Math.max(1, 236 - navFrameInset * 2);
  const navFrameInnerHeight = Math.max(1, navFrameViewBoxHeight - navFrameInset * 2);
  const navFrameCornerRadius =
    Math.min(navFrameInnerWidth, navFrameInnerHeight) *
    clampCoercedNumber(navFrameProperties.radius, 0, 0.5, 0.5);
  const navGlowOpacity = Math.min(1, navGlowStrength * 0.38);
  const navGlowStrokeWidth = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.42 * navGlowSize
  );
  const navGlowBlurStdDeviation = Math.max(
    0,
    Math.min(navFrameInnerWidth, navFrameInnerHeight) * 0.095 * navGlowSize
  );
  const navGradientCenterX = 118;
  const navGradientCenterY = navFrameViewBoxHeight / 2;
  const navFrameColorValue = resolveColor(navFrameProperties.frameColor, "#d9e0e6");
  const navGlowColorValue = resolveColor(navFrameProperties.glowColor, "#f2f6fa");
  const navFrameAngleValue = clampCoercedNumber(navFrameProperties.frameAngle, 0, 360, 45);
  const navGlowAngleValue = clampCoercedNumber(navFrameProperties.glowAngle, 0, 360, 45);
  const navOpacityDivisor = isNavFrameActive ? 0.98 : 0.48;
  // 把设计稿的透明度档位折算到当前控件的透明度：先乘 navFrameOpacity，再除以档位
  // 上限 navOpacityDivisor（活动 0.98 / 非活动 0.48），让最亮的 stop 恰好落在控件
  // 设定值上；末尾夹到 0~1，防止系数放大后溢出。
  const scaleNavOpacity = navOpacityInput =>
    Math.max(0, Math.min(1, (navOpacityInput * navFrameOpacity) / navOpacityDivisor));
  const navGradientIdSuffix = "navigation-" + randomUuid();
  const navigationFrameElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  navigationFrameElement.classList.add("hb-navigation-effects");
  navigationFrameElement.setAttribute("viewBox", "0 0 236 " + navFrameViewBoxHeight);
  navigationFrameElement.setAttribute("preserveAspectRatio", "none");
  navigationFrameElement.setAttribute("aria-hidden", "true");
  navigationFrameElement.innerHTML =
    '\n    <defs>\n      <linearGradient id="navigation-edge-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navFrameAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.98 : 0.48) +
    '"/>\n        <stop offset=".48" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.58 : 0.22) +
    '"/>\n        <stop offset="1" stop-color="' +
    navFrameColorValue +
    '" stop-opacity="' +
    scaleNavOpacity(isNavFrameActive ? 0.82 : 0.36) +
    '"/>\n      </linearGradient>\n      <linearGradient id="navigation-light-' +
    navGradientIdSuffix +
    '" gradientUnits="userSpaceOnUse" x1="0" y1="' +
    navGradientCenterY +
    '" x2="236" y2="' +
    navGradientCenterY +
    '" gradientTransform="rotate(' +
    navGlowAngleValue +
    " " +
    navGradientCenterX +
    " " +
    navGradientCenterY +
    ')">\n        <stop offset="0" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity +
    '"/>\n        <stop offset=".45" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.35 +
    '"/>\n        <stop offset="1" stop-color="' +
    navGlowColorValue +
    '" stop-opacity="' +
    navGlowOpacity * 0.72 +
    '"/>\n      </linearGradient>\n      <clipPath id="navigation-shape-' +
    navGradientIdSuffix +
    '"><rect x="' +
    navFrameInset +
    '" y="' +
    navFrameInset +
    '" width="' +
    navFrameInnerWidth +
    '" height="' +
    navFrameInnerHeight +
    '" rx="' +
    navFrameCornerRadius +
    '"/></clipPath>\n      <filter id="navigation-soft-light-' +
    navGradientIdSuffix +
    '" x="-35%" y="-75%" width="170%" height="250%"><feGaussianBlur stdDeviation="' +
    navGlowBlurStdDeviation +
    '"/></filter>\n    </defs>\n    ' +
    (navFrameProperties.glowVisible !== false && navGlowStrokeWidth > 0 && navGlowOpacity > 0
      ? '<g clip-path="url(#navigation-shape-' +
        navGradientIdSuffix +
        ')"><rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-light-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navGlowStrokeWidth +
        '" filter="url(#navigation-soft-light-' +
        navGradientIdSuffix +
        ')"/></g>'
      : "") +
    "\n    " +
    (navFrameProperties.frameVisible !== false
      ? '<rect x="' +
        navFrameInset +
        '" y="' +
        navFrameInset +
        '" width="' +
        navFrameInnerWidth +
        '" height="' +
        navFrameInnerHeight +
        '" rx="' +
        navFrameCornerRadius +
        '" fill="none" stroke="url(#navigation-edge-' +
        navGradientIdSuffix +
        ')" stroke-width="' +
        navFrameWidth +
        '"/>'
      : "") +
    "\n  ";
  return navigationFrameElement;
}
/**
 * 判断导航按钮是否高亮。
 *
 * 优先级：编辑态预览 → 目标页等于当前页 → 绑定实体的活动态。
 * 两者都没有时按不高亮处理。
 *
 * @param {object} [options] 选项。
 * @param {string} [options.targetPage] 目标页路径。
 * @param {string} [options.currentPagePath] 当前页路径。
 * @param {string} [options.entityId] 绑定实体 ID。
 * @param {boolean} [options.entityActive] 绑定实体是否活动。
 * @param {string} [options.previewState] 编辑态预览：on / off / auto。
 * @returns {boolean} 是否高亮。
 */
export function navigationButtonIsActive({
  targetPage: navigationTargetPage = "",
  currentPagePath: activePagePath = "",
  entityId: navigationStateEntityId = "",
  entityActive: isNavigationEntityActive = false,
  previewState: navigationPreviewState = "auto"
} = {}) {
  if (navigationPreviewState === "on") {
    return true;
  } else if (navigationPreviewState === "off") {
    return false;
  } else if (navigationTargetPage) {
    return navigationTargetPage === activePagePath;
  } else {
    return !!navigationStateEntityId && !!isNavigationEntityActive;
  }
}
// 图片控件：只做资源解析与等比铺放；没有资源时在编辑器里给出「尚未选择图片」提示。
registerComponent("image", {
  render(imageComponent) {
    const imageProperties = imageComponent.properties || {};
    const imageSource = staticAssetImageSource(imageProperties.assetId);
    if (!imageSource) {
      const imageEmptyElement = document.createElement("div");
      imageEmptyElement.className = "hb-unknown-component";
      imageEmptyElement.textContent = "尚未选择图片";
      return imageEmptyElement;
    }
    const imageElement = document.createElement("img");
    imageElement.className = "hb-image-component";
    imageElement.src = imageSource;
    imageElement.alt = imageProperties.alt || imageProperties.label || "图片";
    imageElement.draggable = false;
    imageElement.style.objectFit = "contain";
    imageElement.style.opacity = String(
      Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1)))
    );
    return imageElement;
  }
});
/**
 * 判断户型图的某个图层是否应点亮。
 *
 * 比通用活动态更宽：opening / active / playing 也算，
 * 因为图层绑定的可能是窗帘、媒体播放器这类语义不同的实体。
 *
 * @param {string} diagramLayerEntityId 图层实体 ID。
 * @param {object} layerContext 渲染上下文。
 * @returns {boolean} 是否点亮。
 */
function isLayerEntityActive(diagramLayerEntityId, layerContext) {
  if (!diagramLayerEntityId) {
    return false;
  }
  const layerState = layerContext?.states?.get?.(String(diagramLayerEntityId));
  const layerStateText = String(
    layerState?.newState?.state ?? layerState?.state ?? ""
  ).toLowerCase();
  return ["on", "true", "1", "open", "opening", "active", "playing"].includes(layerStateText);
}
// 户型图自动导图控件：编辑器里嵌 iframe 实时预览 3D 构图，运行时用底图 + 图层叠加渲染。
registerComponent("floorplan-auto-diagram", {
  render(diagramComponent, diagramContext = {}) {
    const diagramProperties = diagramComponent.properties || {};
    const diagramElement = document.createElement("div");
    diagramElement.className = "hb-floorplan-auto-diagram";
    diagramElement.setAttribute(
      "aria-label",
      diagramProperties.label || diagramProperties.instanceName || "户型图自动导图"
    );
    if (
      diagramContext.editable &&
      diagramProperties.previewReady === true &&
      (diagramProperties.generated !== true || diagramProperties.previewing === true)
    ) {
      const diagramPreviewFrameElement = document.createElement("iframe");
      diagramPreviewFrameElement.className =
        "hb-floorplan-auto-diagram-preview is-" +
        (diagramProperties.interactionMode === "view" ? "view" : "position") +
        "-mode";
      diagramPreviewFrameElement.title = "3D户型图构图预览";
      const diagramCanvasMetrics = diagramContext.document?.canvas || {};
      const diagramPosition = diagramComponent.position || {};
      const diagramExportFolder =
        diagramProperties.exportFolder || "自动导图-" + diagramComponent.id;
      const diagramQueryParams = new URLSearchParams({
        "auto-diagram-component": diagramComponent.id,
        "auto-diagram-embed": "1",
        "dashboard-width": String(Number(diagramCanvasMetrics.width || 2778)),
        "dashboard-height": String(Number(diagramCanvasMetrics.height || 1940)),
        "component-width": String(Math.max(1, Math.round(Number(diagramPosition.width || 100)))),
        "component-height": String(Math.max(1, Math.round(Number(diagramPosition.height || 100)))),
        "export-folder": diagramExportFolder
      });
      if (diagramProperties.floorSelection) {
        diagramQueryParams.set("floor-selection", String(diagramProperties.floorSelection));
      }
      diagramPreviewFrameElement.src = "/3d-studio?" + diagramQueryParams;
      diagramPreviewFrameElement.setAttribute("allow", "fullscreen");
      diagramElement.append(diagramPreviewFrameElement);
      const diagramLoadingElement = document.createElement("div");
      diagramLoadingElement.className = "hb-floorplan-auto-diagram-loading";
      diagramLoadingElement.innerHTML =
        '<i aria-hidden="true"></i><strong>正在加载3D户型…</strong>';
      diagramElement.append(diagramLoadingElement);
      const diagramHintElement = document.createElement("div");
      diagramHintElement.className = "hb-floorplan-auto-diagram-preview-hint";
      diagramHintElement.textContent =
        diagramProperties.interactionMode === "view"
          ? "拖动旋转 · 右键平移 · 滚轮缩放"
          : "拖动控件调整位置，右下角调整大小";
      diagramElement.append(diagramHintElement);
      return diagramElement;
    }
    const diagramBaseImageElement = document.createElement("img");
    diagramBaseImageElement.className = "hb-floorplan-auto-diagram-base";
    diagramBaseImageElement.alt = "户型图";
    diagramBaseImageElement.draggable = false;
    const diagramBaseImageSource = resolveAssetUrl(
      diagramProperties.baseAssetId || diagramProperties.floorPlanAssetId || ""
    );
    if (diagramBaseImageSource) {
      diagramBaseImageElement.src = diagramBaseImageSource;
    } else {
      diagramBaseImageElement.className += " is-empty";
      diagramBaseImageElement.alt = "";
    }
    diagramElement.append(diagramBaseImageElement);
    const diagramLayerEntries = [];
    const diagramLayerButtons = [];
    // 按实体状态刷新灯组图层的点亮态；同时挂在 diagramElement 上并注册为运行时状态回调，
    // 这样实体状态变化时只需重跑这个函数，不必整块重建户型图 DOM。
    const syncDiagramLayerState = () => {
      for (const diagramLayerEntry of diagramLayerEntries) {
        const isDiagramLayerActive = isLayerEntityActive(
          diagramLayerEntry.entityId,
          diagramContext
        );
        diagramLayerEntry.image.classList.toggle(
          "is-active",
          isDiagramLayerActive || diagramContext.editable
        );
        diagramLayerEntry.button.classList.toggle("is-active", isDiagramLayerActive);
        diagramLayerEntry.button.setAttribute("aria-pressed", String(isDiagramLayerActive));
      }
    };
    const diagramLightLayers = Array.isArray(diagramProperties.lightLayers)
      ? diagramProperties.lightLayers
      : [];
    for (const diagramLightLayer of diagramLightLayers) {
      const layerImageElement = document.createElement("img");
      layerImageElement.className = "hb-floorplan-auto-diagram-layer";
      layerImageElement.alt = "";
      layerImageElement.draggable = false;
      const layerImageSource = resolveAssetUrl(diagramLightLayer.assetId || "");
      if (layerImageSource) {
        layerImageElement.src = layerImageSource;
      }
      const layerBinding = diagramComponent.bindings?.["lightGroup:" + diagramLightLayer.id] || {};
      const layerEntityId = String(layerBinding.entityId || diagramLightLayer.entityId || "");
      const layerButtonElement = document.createElement("button");
      layerButtonElement.type = "button";
      layerButtonElement.className = "hb-floorplan-auto-diagram-button";
      layerButtonElement.textContent = diagramLightLayer.name || diagramLightLayer.note || "灯组";
      if (diagramLightLayer.note) {
        layerButtonElement.title = diagramLightLayer.note;
      }
      layerButtonElement.addEventListener("click", async layerClickEvent => {
        layerClickEvent.preventDefault();
        layerClickEvent.stopPropagation();
        if (
          !!layerEntityId &&
          !diagramContext.editable &&
          typeof diagramContext.callEntityService == "function"
        ) {
          layerButtonElement.disabled = true;
          try {
            await diagramContext.callEntityService("homeassistant", "toggle", layerEntityId);
          } catch (toggleError) {
            diagramContext.onError?.(toggleError);
          } finally {
            layerButtonElement.disabled = false;
          }
        }
      });
      diagramElement.append(layerImageElement, layerButtonElement);
      const layerEntryRecord = {
        image: layerImageElement,
        button: layerButtonElement,
        entityId: layerEntityId
      };
      diagramLayerEntries.push(layerEntryRecord);
      diagramLayerButtons.push(layerButtonElement);
      if (layerEntityId && typeof diagramContext.registerRuntimeStateHandler == "function") {
        diagramContext.registerRuntimeStateHandler(layerEntityId, syncDiagramLayerState);
      }
    }
    if (!diagramBaseImageSource) {
      const diagramEmptyHintElement = document.createElement("div");
      diagramEmptyHintElement.className = "hb-floorplan-auto-diagram-empty";
      diagramEmptyHintElement.textContent = "请先完成户型和灯组，再生成导图";
      diagramElement.append(diagramEmptyHintElement);
    }
    diagramElement.syncFloorplanAutoDiagramState = syncDiagramLayerState;
    syncDiagramLayerState();
    return diagramElement;
  }
});
/**
 * 渲染图标按钮的光效图层。
 *
 * 资源优先用服务端生成的特效裁剪变体（只取需要的一小块，省带宽也省显存），
 * 没有变体时退回原图。用变体时会先把裁剪参数写进 dataset 而暂不设置 src，
 * 交给 effect-geometry / 图片加载器在拿到原图尺寸后再决定最终地址与裁剪。
 *
 * @param {object} effectLayerComponent 图层控件。
 * @param {object} effectLayerContext 渲染上下文。
 * @returns {HTMLElement|null} 图层元素；未配置资源或图层关闭时返回 null。
 */
export function renderIconButtonEffectLayer(effectLayerComponent, effectLayerContext) {
  const effectLayerProperties = effectLayerComponent.properties || {};
  const effectVariantRecord = effectLayerContext.editable
    ? null
    : effectVariantByAssetId.get(String(effectLayerProperties.effectAssetId || ""));
  const effectImageSource =
    effectVariantRecord?.url || resolveAssetUrl(effectLayerProperties.effectAssetId);
  if (!effectImageSource || effectLayerProperties.effectVisible === false) {
    return null;
  }
  const isEffectActive = isLightVisualActive(effectLayerComponent, effectLayerContext);
  const effectVisualState = iconButtonEffectLightVisualState(
    effectLayerComponent,
    effectLayerContext
  );
  const isEffectAwaiting = iconButtonEffectLightVisualAwaiting(
    effectLayerComponent,
    effectLayerContext
  );
  const effectLayerElement = document.createElement("div");
  effectLayerElement.className =
    "hb-icon-button-effect-layer" +
    (isEffectActive ? " active" : "") +
    (isEffectAwaiting ? " awaiting-light-visual" : "");
  effectLayerElement.style.setProperty(
    "--hb-effect-image-opacity",
    String(clampCoercedNumber(effectLayerProperties.effectOpacity, 0, 1, 1) * effectVisualState.opacity)
  );
  // 视觉参数（透明度 / 滤镜）的变化过渡至少 0.45 秒：低于这个时长会看出跳变。
  const effectFadeDuration = clampCoercedNumber(effectLayerProperties.effectFadeDuration, 0, 3, 0.52);
  effectLayerElement.style.setProperty("--hb-effect-fade-duration", effectFadeDuration + "s");
  effectLayerElement.style.setProperty(
    "--hb-effect-visual-transition-duration",
    Math.max(0.45, effectFadeDuration) + "s"
  );
  const effectImageElement = document.createElement("img");
  if (effectVariantRecord) {
    effectImageElement.dataset.effectSource = effectImageSource;
  } else {
    effectImageElement.src = effectImageSource;
  }
  effectImageElement.alt = "";
  effectImageElement.draggable = false;
  effectImageElement.decoding = "async";
  effectImageElement.style.objectFit = "contain";
  effectImageElement.style.mixBlendMode = "normal";
  effectImageElement.style.filter = effectVisualState.filter;
  if (effectVariantRecord) {
    effectImageElement.dataset.effectOriginalWidth = String(effectVariantRecord.originalWidth);
    effectImageElement.dataset.effectOriginalHeight = String(effectVariantRecord.originalHeight);
    effectImageElement.dataset.effectCropX = String(effectVariantRecord.cropX);
    effectImageElement.dataset.effectCropY = String(effectVariantRecord.cropY);
    effectImageElement.dataset.effectCropWidth = String(effectVariantRecord.width);
    effectImageElement.dataset.effectCropHeight = String(effectVariantRecord.height);
  }
  effectLayerElement.append(effectImageElement);
  return effectLayerElement;
}
// 图标按钮光效控件：把状态色、辉光强度换算成 CSS 变量交给样式表，
// 图标用 mask-image 着色，因此可以跟随开 / 关态换色而不需要两张图。
registerComponent("icon-button-effect", {
  render(effectButtonComponent, effectButtonContext) {
    const effectButtonProperties = effectButtonComponent.properties || {};
    const isEffectButtonActive = isLightVisualActive(effectButtonComponent, effectButtonContext);
    const isEffectIconVisible =
      effectButtonContext?.isIconVisible?.(effectButtonComponent.id) !== false;
    const effectButtonElement = document.createElement("div");
    effectButtonElement.className =
      "hb-icon-button-effect" + (isEffectButtonActive ? " active" : "");
    effectButtonElement.hidden = effectButtonProperties.buttonVisible === false;
    effectButtonElement.style.opacity = isEffectIconVisible ? "1" : "0";
    effectButtonElement.style.transition = "opacity .24s ease";
    effectButtonElement.style.setProperty(
      "--effect-button-color",
      resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.buttonOnColor
          : effectButtonProperties.buttonOffColor,
        isEffectButtonActive ? "#1f91b8" : "#17242d"
      )
    );
    effectButtonElement.style.setProperty(
      "--effect-button-opacity",
      clampCoercedNumber(effectButtonProperties.buttonOpacity, 0, 1, 0.92) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-color",
      resolveColor(effectButtonProperties.frameColor, "#dcebf2")
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-width",
      clampCoercedNumber(effectButtonProperties.frameWidth, 0, 20, 1.5) + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-frame-opacity",
      clampCoercedNumber(effectButtonProperties.frameOpacity, 0, 1, 0.72) * 100 + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-radius",
      clampCoercedNumber(effectButtonProperties.radius, 0, 50, 50) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-color",
      resolveColor(effectButtonProperties.glowColor, "#43c8f0")
    );
    const effectGlowStrength = clampCoercedNumber(
      isEffectButtonActive
        ? effectButtonProperties.glowOnStrength
        : effectButtonProperties.glowOffStrength,
      0,
      3,
      isEffectButtonActive ? 1 : 0
    );
    effectButtonElement.style.setProperty("--effect-glow-size", effectGlowStrength * 18 + "px");
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-size",
      effectGlowStrength * 13 + "px"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-opacity",
      Math.min(100, effectGlowStrength * 38) + "%"
    );
    effectButtonElement.style.setProperty(
      "--effect-glow-inset-opacity",
      Math.min(100, effectGlowStrength * 30) + "%"
    );
    const effectIconSource = resolveIconUrl(effectButtonProperties.icon || "mdi:lightbulb-outline");
    if (effectIconSource) {
      const effectIconElement = document.createElement("i");
      effectIconElement.className = "hb-icon-button-effect-icon";
      effectIconElement.style.transition = "opacity .24s ease";
      effectIconElement.style.opacity = isEffectIconVisible ? "1" : "0";
      effectIconElement.style.backgroundColor = resolveColor(
        isEffectButtonActive
          ? effectButtonProperties.iconOnColor
          : effectButtonProperties.iconOffColor,
        isEffectButtonActive ? "#ffffff" : "#9aa5ad"
      );
      effectIconElement.style.width =
        clampCoercedNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.height =
        clampCoercedNumber(effectButtonProperties.iconSize, 1, 100, 44) + "%";
      effectIconElement.style.maskImage = 'url("' + effectIconSource + '")';
      effectIconElement.style.webkitMaskImage = 'url("' + effectIconSource + '")';
      effectButtonElement.append(effectIconElement);
    }
    return effectButtonElement;
  }
});
// 标题按钮控件：纯展示 + 外框装饰，尺寸单位统一由 componentContentUnitsPx 换算。
registerComponent("title-button", {
  render(titleComponent, titleContext) {
    const titleProperties = titleComponent.properties || {};
    const isHiddenContentClickable = titleProperties.hiddenContentClickable === true;
    const titleWidth = Math.max(20, Number(titleComponent.position?.width || 500));
    const titleHeight = Math.max(20, Number(titleComponent.position?.height || 122));
    const { height: titleUnitPx } = componentContentUnitsPx(titleComponent, titleContext);
    const titleElement = document.createElement("div");
    titleElement.className = "hb-title-button";
    titleElement.style.setProperty(
      "--title-frame-color",
      resolveColor(titleProperties.frameColor, "#60636a")
    );
    titleElement.style.setProperty(
      "--title-frame-width",
      clampCoercedNumber(titleProperties.frameWidth, 0, 12, 1.5) + "px"
    );
    titleElement.style.setProperty(
      "--title-frame-offset-x",
      clampCoercedNumber(titleProperties.frameOffsetX, -100, 100, 0) + "%"
    );
    titleElement.style.setProperty(
      "--title-frame-offset-y",
      clampCoercedNumber(titleProperties.frameOffsetY, -100, 100, 0) + "%"
    );
    titleElement.style.setProperty(
      "--title-main-size",
      clampCoercedNumber(titleProperties.mainSize, 8, 200, 34) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-size",
      clampCoercedNumber(titleProperties.secondarySize, 6, 100, 12) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-spacing",
      clampCoercedNumber(titleProperties.mainSpacing, -20, 100, 1) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-spacing",
      clampCoercedNumber(titleProperties.secondarySpacing, -20, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-secondary-line-gap",
      clampCoercedNumber(titleProperties.secondaryLineGap, 0, 100, 2) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-main-left",
      clampCoercedNumber(titleProperties.mainTextLeft, -100, 200, 5.5) + "%"
    );
    titleElement.style.setProperty(
      "--title-main-top",
      clampCoercedNumber(titleProperties.mainTextTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-left",
      clampCoercedNumber(titleProperties.secondaryTextLeft, -100, 200, 54) + "%"
    );
    titleElement.style.setProperty(
      "--title-secondary-top",
      clampCoercedNumber(titleProperties.secondaryTextTop, -100, 200, 43) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-size",
      clampCoercedNumber(titleProperties.iconSize, 1, 100, 30) * titleUnitPx + "px"
    );
    titleElement.style.setProperty(
      "--title-icon-left",
      clampCoercedNumber(titleProperties.iconLeft, -100, 200, 50) + "%"
    );
    titleElement.style.setProperty(
      "--title-icon-top",
      clampCoercedNumber(titleProperties.iconTop, -100, 200, 45) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-left",
      clampCoercedNumber(titleProperties.markerLeft, -100, 200, 1.8) + "%"
    );
    titleElement.style.setProperty(
      "--title-marker-top",
      clampCoercedNumber(titleProperties.markerTop, -100, 200, 84) + "%"
    );
    if (titleProperties.frameVisible !== false || isHiddenContentClickable) {
      const titleFrameSizeRatio = clampCoercedNumber(titleProperties.frameSize, 10, 300, 100) / 100;
      const titleFrameHalfHeight = titleHeight * 0.45 * titleFrameSizeRatio;
      const titleFrameOffsetXPx =
        (titleWidth * clampCoercedNumber(titleProperties.frameOffsetX, -100, 100, 0)) / 100;
      const titleFrameOffsetYPx =
        (titleHeight * clampCoercedNumber(titleProperties.frameOffsetY, -100, 100, 0)) / 100;
      const titleFrameHalfSpacing =
        (titleWidth * clampCoercedNumber(titleProperties.frameSpacing, 0, 300, 100)) / 200;
      const titleFrameCenterX = titleWidth / 2 + titleFrameOffsetXPx;
      const titleFrameCenterY = titleHeight / 2 + titleFrameOffsetYPx;
      const titleFrameTop = titleFrameCenterY - titleFrameHalfHeight / 2;
      const titleFrameBottom = titleFrameCenterY + titleFrameHalfHeight / 2;
      const titleBracketLength = titleHeight * 0.12;
      const titleFrameHalfWidth = clampCoercedNumber(titleProperties.frameWidth, 0, 12, 1.5) / 2;
      const titleLeftBracketX = titleFrameCenterX - titleFrameHalfSpacing + titleFrameHalfWidth;
      const titleRightBracketX = titleFrameCenterX + titleFrameHalfSpacing - titleFrameHalfWidth;
      const titleBracketsElement = appendSvgElement(titleElement, "svg", {
        viewBox: "0 0 " + titleWidth + " " + titleHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      titleBracketsElement.setAttribute("class", "hb-title-button-brackets");
      if (titleProperties.frameVisible === false) {
        titleBracketsElement.style.visibility = "hidden";
      }
      const titleBracketAttributes = {
        fill: "none",
        stroke: resolveColor(titleProperties.frameColor, "#60636a"),
        "stroke-width": clampCoercedNumber(titleProperties.frameWidth, 0, 12, 1.5),
        "stroke-opacity": 1,
        "stroke-linecap": "butt",
        "stroke-linejoin": "miter",
        "vector-effect": "non-scaling-stroke"
      };
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleLeftBracketX + titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleLeftBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleLeftBracketX + titleBracketLength)
      });
      appendSvgElement(titleBracketsElement, "path", {
        ...titleBracketAttributes,
        d:
          "M " +
          (titleRightBracketX - titleBracketLength) +
          " " +
          titleFrameTop +
          " H " +
          titleRightBracketX +
          " V " +
          titleFrameBottom +
          " H " +
          (titleRightBracketX - titleBracketLength)
      });
    }
    if (titleProperties.mainTextVisible !== false || isHiddenContentClickable) {
      const titleMainTextElement = document.createElement("strong");
      titleMainTextElement.className = "hb-title-button-main";
      titleMainTextElement.textContent = String(titleProperties.mainText || "客厅");
      titleMainTextElement.style.color = resolveColor(titleProperties.mainColor, "#b9bbc0");
      if (titleProperties.mainTextVisible === false) {
        titleMainTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleMainTextElement,
        titleProperties.mainWeight,
        clampCoercedNumber(titleProperties.mainSize, 8, 200, 34)
      );
      titleElement.append(titleMainTextElement);
    }
    if (titleProperties.secondaryTextVisible !== false || isHiddenContentClickable) {
      const titleSecondaryTextElement = document.createElement("small");
      titleSecondaryTextElement.className = "hb-title-button-secondary";
      String(titleProperties.secondaryText || "LIVING ROOM\nLIGHTING")
        .split(/\r?\n/)
        .slice(0, 2)
        .forEach(titleTextLine => {
          const titleTextLineElement = document.createElement("span");
          titleTextLineElement.textContent = titleTextLine;
          titleSecondaryTextElement.append(titleTextLineElement);
        });
      titleSecondaryTextElement.style.color = resolveColor(
        titleProperties.secondaryColor,
        "#70737b"
      );
      if (titleProperties.secondaryTextVisible === false) {
        titleSecondaryTextElement.style.visibility = "hidden";
      }
      applyFontWeight(
        titleSecondaryTextElement,
        titleProperties.secondaryWeight,
        clampCoercedNumber(titleProperties.secondarySize, 6, 100, 12)
      );
      titleElement.append(titleSecondaryTextElement);
    }
    if (titleProperties.iconVisible !== false || isHiddenContentClickable) {
      const titleIconSource = resolveIconUrl(titleProperties.icon || "");
      if (titleIconSource) {
        const titleIconElement = document.createElement("i");
        titleIconElement.className = "hb-title-button-icon";
        if (titleProperties.iconVisible === false) {
          titleIconElement.style.visibility = "hidden";
        }
        titleIconElement.style.backgroundColor = resolveColor(titleProperties.iconColor, "#b9bbc0");
        titleIconElement.style.maskImage = 'url("' + titleIconSource + '")';
        titleIconElement.style.webkitMaskImage = 'url("' + titleIconSource + '")';
        titleElement.append(titleIconElement);
      }
    }
    if (titleProperties.markerVisible !== false || isHiddenContentClickable) {
      const titleMarkerElement = document.createElement("i");
      titleMarkerElement.className = "hb-title-button-marker";
      if (titleProperties.markerVisible === false) {
        titleMarkerElement.style.visibility = "hidden";
      }
      titleMarkerElement.style.color = resolveColor(titleProperties.markerColor, "#f2a20d");
      titleMarkerElement.style.borderTopColor = resolveColor(
        titleProperties.markerColor,
        "#f2a20d"
      );
      titleMarkerElement.style.setProperty(
        "--title-marker-size",
        clampCoercedNumber(titleProperties.markerSize, 2, 60, 10) * titleUnitPx + "px"
      );
      titleElement.append(titleMarkerElement);
    }
    return titleElement;
  }
});
// 灯光统计控件：把实体列表交给 lightStatisticsSummary 汇总后渲染，
// 统计口径（哪些实体能统计、异常怎么算）全部在 light-statistics-runtime.js 里。
registerComponent("light-statistics", {
  render(statisticsComponent, statisticsContext) {
    const statisticsProperties = statisticsComponent.properties || {};
    const lightSummary = lightStatisticsSummary(
      statisticsProperties.entityIds,
      statisticsContext.states,
      statisticsContext.entityMetadata
    );
    const { width: statisticsWidth, height: statisticsHeight } = componentContentUnitsPx(
      statisticsComponent,
      statisticsContext
    );
    const statisticsElement = document.createElement("div");
    statisticsElement.className = "hb-light-statistics";
    statisticsElement.classList.toggle("active", lightSummary.on > 0);
    statisticsElement.dataset.total = String(lightSummary.total);
    statisticsElement.dataset.on = String(lightSummary.on);
    statisticsElement.dataset.off = String(lightSummary.off);
    statisticsElement.dataset.abnormal = String(lightSummary.abnormal);
    statisticsElement.style.setProperty(
      "--light-statistics-icon-size",
      clampCoercedNumber(statisticsProperties.iconSize, 1, 100, 42) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-size",
      clampCoercedNumber(statisticsProperties.titleSize, 8, 200, 32) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-spacing",
      clampCoercedNumber(statisticsProperties.titleSpacing, -20, 100, 1.2) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-size",
      clampCoercedNumber(statisticsProperties.countSize, 8, 200, 34) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-spacing",
      clampCoercedNumber(statisticsProperties.countSpacing, -20, 100, 0) * statisticsHeight + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-gap",
      clampCoercedNumber(statisticsProperties.iconGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-gap",
      clampCoercedNumber(statisticsProperties.countGap, 0, 40, 4.5) * statisticsWidth + "px"
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-color",
      resolveColor(statisticsProperties.iconColor, "#8b9298")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-icon-active-color",
      resolveColor(statisticsProperties.iconActiveColor, "#f2a20d")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-title-color",
      resolveColor(statisticsProperties.titleColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-color",
      resolveColor(statisticsProperties.countColor, "#b9bbc0")
    );
    statisticsElement.style.setProperty(
      "--light-statistics-count-active-color",
      resolveColor(statisticsProperties.countActiveColor, "#f2a20d")
    );
    const statisticsIconName = Object.prototype.hasOwnProperty.call(statisticsProperties, "icon")
      ? String(statisticsProperties.icon || "")
      : "mdi:lightbulb-group-outline";
    const statisticsIconSource = resolveIconUrl(statisticsIconName);
    const hasStatisticsIcon = statisticsProperties.iconVisible !== false && !!statisticsIconSource;
    const hasStatisticsTitle = statisticsProperties.titleVisible !== false;
    const hasStatisticsCount = statisticsProperties.countVisible !== false;
    statisticsElement.classList.toggle("has-icon", hasStatisticsIcon);
    statisticsElement.classList.toggle("has-title", hasStatisticsTitle);
    statisticsElement.classList.toggle("has-count", hasStatisticsCount);
    if (hasStatisticsIcon) {
      const statisticsIconElement = document.createElement("i");
      statisticsIconElement.className = "hb-light-statistics-icon";
      statisticsIconElement.style.maskImage = 'url("' + statisticsIconSource + '")';
      statisticsIconElement.style.webkitMaskImage = 'url("' + statisticsIconSource + '")';
      statisticsElement.append(statisticsIconElement);
    }
    if (hasStatisticsTitle) {
      const statisticsTitleElement = document.createElement("strong");
      statisticsTitleElement.className = "hb-light-statistics-title";
      statisticsTitleElement.textContent = String(statisticsProperties.title || "数量");
      applyFontWeight(
        statisticsTitleElement,
        statisticsProperties.titleWeight,
        clampCoercedNumber(statisticsProperties.titleSize, 8, 200, 32)
      );
      statisticsElement.append(statisticsTitleElement);
    }
    if (hasStatisticsCount) {
      const statisticsCountElement = document.createElement("span");
      statisticsCountElement.className = "hb-light-statistics-count";
      const statisticsCountValueElement = document.createElement("b");
      statisticsCountValueElement.textContent = lightSummary.total ? String(lightSummary.on) : "--";
      applyFontWeight(
        statisticsCountValueElement,
        statisticsProperties.countWeight,
        clampCoercedNumber(statisticsProperties.countSize, 8, 200, 34)
      );
      statisticsCountElement.append(statisticsCountValueElement);
      if (lightSummary.total) {
        const statisticsCountTotalElement = document.createElement("em");
        statisticsCountTotalElement.textContent = " / " + lightSummary.total;
        statisticsCountElement.append(statisticsCountTotalElement);
      }
      statisticsElement.append(statisticsCountElement);
    }
    return statisticsElement;
  }
});
// 图标按钮与设备按钮共用同一份渲染器：两者结构一致，差异只在 data 里带的类型，
// 渲染时用 component.type 区分（见下面的 isDeviceButton）。
const buttonRenderer = {
  render(deviceButtonComponent, deviceButtonContext) {
    const deviceButtonProperties = deviceButtonComponent.properties || {};
    const isDeviceButton = deviceButtonComponent.type === "device-button";
    const deviceButtonEntityId = deviceButtonComponent.bindings?.entity?.entityId || "";
    const deviceButtonState = deviceButtonContext.states?.get(deviceButtonEntityId);
    const deviceButtonResolvedState = resolveStateEntry(deviceButtonState);
    const isDeviceButtonActive = isDeviceButtonVisualActive(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonWidth = Math.max(20, Number(deviceButtonComponent.position?.width || 144));
    const deviceButtonHeight = Math.max(20, Number(deviceButtonComponent.position?.height || 150));
    const { height: deviceButtonUnitPx } = componentContentUnitsPx(
      deviceButtonComponent,
      deviceButtonContext
    );
    const deviceButtonCutCorner =
      (Math.min(deviceButtonWidth, deviceButtonHeight) *
        clampCoercedNumber(deviceButtonProperties.cutCorner, 0, 50, 20)) /
      100;
    const deviceButtonFrameWidth = clampCoercedNumber(deviceButtonProperties.frameWidth, 0, 12, 1);
    const deviceButtonFrameAngle = clampCoercedNumber(deviceButtonProperties.frameAngle, 0, 360, 45);
    const deviceButtonFrameOpacity = clampCoercedNumber(
      isDeviceButtonActive
        ? deviceButtonProperties.frameOnOpacity
        : deviceButtonProperties.frameOffOpacity,
      0,
      1,
      isDeviceButtonActive ? 1 : 0.8
    );
    const deviceButtonSoftLightColor = resolveColor(
      deviceButtonProperties.softLightColor,
      "#ffffff"
    );
    const deviceButtonSoftLightStrength = clampCoercedNumber(
      deviceButtonProperties.softLightStrength,
      0,
      5,
      1
    );
    const deviceButtonSoftLightSize = clampCoercedNumber(deviceButtonProperties.softLightSize, 0, 3, 1);
    const deviceButtonSoftLightAngle = clampCoercedNumber(
      deviceButtonProperties.softLightAngle,
      0,
      360,
      45
    );
    const deviceButtonGlowColor = resolveColor(deviceButtonProperties.glowColor, "#ffffff");
    const deviceButtonGlowStrength = clampCoercedNumber(deviceButtonProperties.glowStrength, 0, 5, 1);
    const deviceButtonGlowSize = clampCoercedNumber(deviceButtonProperties.glowSize, 0, 3, 1);
    const deviceButtonGlowAngle = clampCoercedNumber(deviceButtonProperties.glowAngle, 0, 360, 220);
    const deviceButtonCenterX = deviceButtonWidth / 2;
    const deviceButtonCenterY = deviceButtonHeight / 2;
    // 光晕按角度定位到控件一侧：先换成弧度，再沿该方向按宽高的固定比例（16% / 18%）偏移，
    // 比例取宽高各自的百分比而不是统一半径，控件被拉扁时光晕才不会跑出边缘。
    const deviceButtonGlowAngleRad = (deviceButtonGlowAngle * Math.PI) / 180;
    const deviceButtonGlowX =
      deviceButtonCenterX + Math.cos(deviceButtonGlowAngleRad) * deviceButtonWidth * 0.16;
    const deviceButtonGlowY =
      deviceButtonCenterY + Math.sin(deviceButtonGlowAngleRad) * deviceButtonHeight * 0.18;
    const deviceButtonNamespace =
      (deviceButtonContext.renderNamespace || "renderer") +
      "-icon-button-" +
      String(deviceButtonComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const deviceButtonElement = document.createElement("div");
    deviceButtonElement.className = "hb-icon-button" + (isDeviceButtonActive ? " active" : "");
    deviceButtonElement.style.setProperty(
      "--icon-button-main-left",
      clampCoercedNumber(deviceButtonProperties.mainTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-main-top",
      clampCoercedNumber(deviceButtonProperties.mainTextTop, -100, 200, 78) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-left",
      clampCoercedNumber(deviceButtonProperties.secondaryTextLeft, -100, 200, 9) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-secondary-top",
      clampCoercedNumber(deviceButtonProperties.secondaryTextTop, -100, 200, 91) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-left",
      clampCoercedNumber(deviceButtonProperties.iconLeft, -100, 200, 50) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-top",
      clampCoercedNumber(deviceButtonProperties.iconTop, -100, 200, 34) + "%"
    );
    deviceButtonElement.style.setProperty(
      "--icon-button-icon-glow-size",
      deviceButtonUnitPx * 9 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-glow-size",
      deviceButtonUnitPx * 5 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--device-button-icon-active-glow-size",
      deviceButtonUnitPx * 7 + "px"
    );
    deviceButtonElement.style.setProperty(
      "--hb-on-fill-fade-duration",
      clampCoercedNumber(deviceButtonProperties.onFillFadeDuration, 0, 3, 0.3) + "s"
    );
    if (!isDeviceButton) {
      const deviceButtonFrameSvg = appendSvgElement(deviceButtonElement, "svg", {
        viewBox: "0 0 " + deviceButtonWidth + " " + deviceButtonHeight,
        preserveAspectRatio: "none",
        "aria-hidden": "true"
      });
      const deviceButtonDefsElement = appendSvgElement(deviceButtonFrameSvg, "defs");
      const deviceButtonPolygonPoints =
        "0,0 " +
        (deviceButtonWidth - deviceButtonCutCorner) +
        ",0 " +
        deviceButtonWidth +
        "," +
        deviceButtonCutCorner +
        " " +
        deviceButtonWidth +
        "," +
        deviceButtonHeight +
        " 0," +
        deviceButtonHeight;
      const deviceButtonClipPath = appendSvgElement(deviceButtonDefsElement, "clipPath", {
        id: deviceButtonNamespace + "-clip"
      });
      appendSvgElement(deviceButtonClipPath, "polygon", {
        points: deviceButtonPolygonPoints
      });
      const deviceButtonSoftLightHalfWidth = deviceButtonWidth * 0.5 * deviceButtonSoftLightSize;
      const deviceButtonSoftLightGradient = appendSvgElement(
        deviceButtonDefsElement,
        "linearGradient",
        {
          id: deviceButtonNamespace + "-soft-light",
          gradientUnits: "userSpaceOnUse",
          x1: deviceButtonCenterX - deviceButtonSoftLightHalfWidth,
          y1: deviceButtonCenterY,
          x2: deviceButtonCenterX + deviceButtonSoftLightHalfWidth,
          y2: deviceButtonCenterY,
          gradientTransform:
            "rotate(" +
            deviceButtonSoftLightAngle +
            " " +
            deviceButtonCenterX +
            " " +
            deviceButtonCenterY +
            ")"
        }
      );
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.055)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 0.55,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.018)
      });
      appendSvgElement(deviceButtonSoftLightGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonSoftLightColor,
        "stop-opacity": Math.min(1, deviceButtonSoftLightStrength * 0.085)
      });
      const deviceButtonEdgeGradient = appendSvgElement(deviceButtonDefsElement, "linearGradient", {
        id: deviceButtonNamespace + "-edge",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: deviceButtonCenterY,
        x2: deviceButtonWidth,
        y2: deviceButtonCenterY,
        gradientTransform:
          "rotate(" +
          deviceButtonFrameAngle +
          " " +
          deviceButtonCenterX +
          " " +
          deviceButtonCenterY +
          ")"
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 0.48,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.49
      });
      appendSvgElement(deviceButtonEdgeGradient, "stop", {
        offset: 1,
        "stop-color": "#ffffff",
        "stop-opacity": deviceButtonFrameOpacity * 0.66
      });
      const deviceButtonGlowGradient = appendSvgElement(deviceButtonDefsElement, "radialGradient", {
        id: deviceButtonNamespace + "-glow",
        gradientUnits: "userSpaceOnUse",
        cx: deviceButtonGlowX,
        cy: deviceButtonGlowY,
        r: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.42 * deviceButtonGlowSize
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.12)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 0.52,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": Math.min(1, deviceButtonGlowStrength * 0.025)
      });
      appendSvgElement(deviceButtonGlowGradient, "stop", {
        offset: 1,
        "stop-color": deviceButtonGlowColor,
        "stop-opacity": 0
      });
      const deviceButtonGlowFilter = appendSvgElement(deviceButtonDefsElement, "filter", {
        id: deviceButtonNamespace + "-glow-blur",
        x: "-40%",
        y: "-40%",
        width: "180%",
        height: "180%"
      });
      appendSvgElement(deviceButtonGlowFilter, "feGaussianBlur", {
        stdDeviation: Math.min(deviceButtonWidth, deviceButtonHeight) * 0.03
      });
      const deviceButtonClippedGroup = appendSvgElement(deviceButtonFrameSvg, "g", {
        "clip-path": "url(#" + deviceButtonNamespace + "-clip)"
      });
      if (deviceButtonProperties.onFillVisible !== false) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          class: "hb-icon-button-on-fill",
          points: deviceButtonPolygonPoints,
          fill: resolveColor(deviceButtonProperties.onFillColor, "#dfb64f"),
          "fill-opacity": clampCoercedNumber(deviceButtonProperties.onFillStrength, 0, 1, 1)
        });
      }
      if (deviceButtonProperties.softLightVisible !== false && deviceButtonSoftLightSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "url(#" + deviceButtonNamespace + "-soft-light)"
        });
      }
      if (deviceButtonProperties.glowVisible !== false && deviceButtonGlowSize > 0) {
        appendSvgElement(deviceButtonClippedGroup, "ellipse", {
          cx: deviceButtonGlowX,
          cy: deviceButtonGlowY,
          rx: deviceButtonWidth * 0.42 * deviceButtonGlowSize,
          ry: deviceButtonHeight * 0.42 * deviceButtonGlowSize,
          fill: "url(#" + deviceButtonNamespace + "-glow)",
          filter: "url(#" + deviceButtonNamespace + "-glow-blur)"
        });
      }
      if (deviceButtonProperties.frameVisible !== false && deviceButtonFrameWidth > 0) {
        appendSvgElement(deviceButtonClippedGroup, "polygon", {
          points: deviceButtonPolygonPoints,
          fill: "none",
          stroke: "url(#" + deviceButtonNamespace + "-edge)",
          "stroke-width": deviceButtonFrameWidth,
          "vector-effect": "non-scaling-stroke"
        });
      }
    }
    const deviceButtonIconName =
      String(deviceButtonProperties.icon || "").trim() ||
      (isDeviceButton
        ? resolveStateIcon(deviceButtonEntityId, deviceButtonState)
        : "mdi:ceiling-light");
    const deviceButtonIconSource = resolveIconUrl(deviceButtonIconName);
    if (
      deviceButtonIconSource &&
      (!isDeviceButton ||
        deviceButtonProperties.iconVisible !== false ||
        deviceButtonProperties.hiddenContentClickable === true)
    ) {
      const deviceButtonIconElement = document.createElement("i");
      deviceButtonIconElement.className = isDeviceButton
        ? "hb-device-button-icon"
        : "hb-icon-button-icon";
      if (!isDeviceButton) {
        deviceButtonIconElement.style.width =
          clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
        deviceButtonIconElement.style.height =
          clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 42) + "%";
      }
      deviceButtonIconElement.style.backgroundColor =
        isDeviceButton && isDeviceButtonActive
          ? resolveColor(deviceButtonProperties.iconOnColor, "#379bff")
          : resolveColor(
              deviceButtonProperties.iconColor ||
                deviceButtonProperties.iconOffColor ||
                deviceButtonProperties.iconOnColor,
              "#d7d8da"
            );
      deviceButtonIconElement.style.opacity = isDeviceButton
        ? "1"
        : String(
            clampCoercedNumber(
              isDeviceButtonActive
                ? deviceButtonProperties.iconOnOpacity
                : deviceButtonProperties.iconOffOpacity,
              0,
              1,
              1
            )
          );
      deviceButtonIconElement.style.maskImage = 'url("' + deviceButtonIconSource + '")';
      deviceButtonIconElement.style.webkitMaskImage = 'url("' + deviceButtonIconSource + '")';
      if (isDeviceButton) {
        const deviceButtonIconSize = clampCoercedNumber(deviceButtonProperties.iconSize, 1, 100, 28);
        const deviceButtonBadgeSize = clampCoercedNumber(
          deviceButtonProperties.badgeSize ?? deviceButtonIconSize,
          1,
          100,
          deviceButtonIconSize
        );
        const deviceButtonSymbolSize = clampCoercedNumber(
          deviceButtonProperties.symbolSize ?? deviceButtonIconSize * 0.5,
          1,
          100,
          deviceButtonIconSize * 0.5
        );
        const deviceButtonSymbolPercent = clampCoercedNumber(
          (deviceButtonSymbolSize / deviceButtonBadgeSize) * 100,
          1,
          100,
          50
        );
        deviceButtonIconElement.style.width = deviceButtonSymbolPercent + "%";
        deviceButtonIconElement.style.height = deviceButtonSymbolPercent + "%";
        const deviceButtonBadgeElement = document.createElement("span");
        deviceButtonBadgeElement.className =
          "hb-device-button-icon-badge" + (isDeviceButtonActive ? " active" : "");
        if (deviceButtonProperties.iconVisible === false) {
          deviceButtonBadgeElement.style.visibility = "hidden";
        }
        deviceButtonBadgeElement.style.width = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.height = deviceButtonBadgeSize * deviceButtonUnitPx + "px";
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-color",
          resolveColor(deviceButtonProperties.badgeColor, "#5b5e66")
        );
        deviceButtonBadgeElement.style.setProperty(
          "--device-badge-opacity",
          clampCoercedNumber(deviceButtonProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
        );
        deviceButtonBadgeElement.append(deviceButtonIconElement);
        deviceButtonElement.append(deviceButtonBadgeElement);
      } else {
        deviceButtonElement.append(deviceButtonIconElement);
      }
    }
    const deviceButtonTextElement = document.createElement("span");
    deviceButtonTextElement.className = "hb-icon-button-text";
    const deviceButtonMainTextSize = clampCoercedNumber(deviceButtonProperties.mainSize, 6, 120, 25);
    const deviceButtonMainTextElement = document.createElement("strong");
    deviceButtonMainTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.mainText || "").trim() ||
        String(
          deviceButtonResolvedState?.attributes?.friendly_name ||
            deviceButtonEntityId ||
            "未选择实体"
        )
      : String(deviceButtonProperties.mainText || "主灯");
    deviceButtonMainTextElement.style.color = resolveColor(
      deviceButtonProperties.mainColor ||
        deviceButtonProperties.mainOffColor ||
        deviceButtonProperties.mainOnColor,
      "#c7c8cb"
    );
    deviceButtonMainTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampCoercedNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.mainOnOpacity
              : deviceButtonProperties.mainOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonMainTextElement.style.fontSize =
      deviceButtonMainTextSize * deviceButtonUnitPx + "px";
    deviceButtonMainTextElement.style.letterSpacing =
      clampCoercedNumber(deviceButtonProperties.mainSpacing, -20, 100, 1) * deviceButtonUnitPx + "px";
    applyFontWeight(
      deviceButtonMainTextElement,
      deviceButtonProperties.mainWeight,
      deviceButtonMainTextSize
    );
    deviceButtonMainTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.mainTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonMainTextElement.style.visibility = "hidden";
    }
    const deviceButtonSecondaryTextSize = clampCoercedNumber(
      deviceButtonProperties.secondarySize,
      5,
      80,
      10
    );
    const deviceButtonSecondaryTextElement = document.createElement("small");
    deviceButtonSecondaryTextElement.textContent = isDeviceButton
      ? String(deviceButtonProperties.secondaryText || "").trim() ||
        (deviceButtonEntityId
          ? formatEntityState(deviceButtonState, deviceButtonEntityId, {
              ...deviceButtonContext,
              component: deviceButtonComponent
            })
          : "未选择实体")
      : String(deviceButtonProperties.secondaryText || "MAIN LIGHT");
    deviceButtonSecondaryTextElement.style.color = resolveColor(
      deviceButtonProperties.secondaryColor ||
        deviceButtonProperties.secondaryOffColor ||
        deviceButtonProperties.secondaryOnColor,
      "#75777d"
    );
    deviceButtonSecondaryTextElement.style.opacity = isDeviceButton
      ? "1"
      : String(
          clampCoercedNumber(
            isDeviceButtonActive
              ? deviceButtonProperties.secondaryOnOpacity
              : deviceButtonProperties.secondaryOffOpacity,
            0,
            1,
            1
          )
        );
    deviceButtonSecondaryTextElement.style.fontSize =
      deviceButtonSecondaryTextSize * deviceButtonUnitPx + "px";
    deviceButtonSecondaryTextElement.style.letterSpacing =
      clampCoercedNumber(deviceButtonProperties.secondarySpacing, -20, 100, 0.7) * deviceButtonUnitPx +
      "px";
    applyFontWeight(
      deviceButtonSecondaryTextElement,
      deviceButtonProperties.secondaryWeight,
      deviceButtonSecondaryTextSize
    );
    deviceButtonSecondaryTextElement.hidden =
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable !== true;
    if (
      isDeviceButton &&
      deviceButtonProperties.secondaryTextVisible === false &&
      deviceButtonProperties.hiddenContentClickable === true
    ) {
      deviceButtonSecondaryTextElement.style.visibility = "hidden";
    }
    deviceButtonTextElement.append(deviceButtonMainTextElement, deviceButtonSecondaryTextElement);
    deviceButtonElement.append(deviceButtonTextElement);
    return deviceButtonElement;
  }
};
// 两个类型名注册到同一份渲染器实例上，改一处即同时生效。
registerComponent("icon-button", buttonRenderer);
registerComponent("device-button", buttonRenderer);
/**
 * 渲染门窗传感器。
 *
 * @param {object} sensorComponent 控件对象。
 * @param {object} sensorProperties 控件属性。
 * @param {object} sensorPresentation 由 presenceSensorPresentation 得到的状态四态。
 * @param {object} sensorContext 渲染上下文。
 * @returns {HTMLElement} 传感器元素。
 */
function renderDoorWindowSensor(
  sensorComponent,
  sensorProperties,
  sensorPresentation,
  sensorContext
) {
  const sensorAccentColor = resolveColor(
    sensorProperties.iconOnColor || sensorProperties.occupiedColor,
    "#ffffff"
  );
  const isSensorOccupied = sensorPresentation.key === "occupied";
  const sensorStateLabel = isSensorOccupied
    ? "打开"
    : sensorPresentation.key === "clear"
      ? "关闭"
      : sensorPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const sensorElement = document.createElement("div");
  sensorElement.className =
    "hb-door-window-sensor is-" + (isSensorOccupied ? "open" : sensorPresentation.key);
  sensorElement.dataset.sensorState = isSensorOccupied ? "open" : sensorPresentation.key;
  sensorElement.style.setProperty("--hb-door-window-accent", sensorAccentColor);
  sensorElement.setAttribute("role", "img");
  sensorElement.setAttribute("aria-label", "门窗传感器：" + sensorStateLabel);
  const sensorVisualElement = document.createElement("div");
  sensorVisualElement.className = "hb-door-window-visual";
  const sensorComponentScale = Math.max(
    0.01,
    Number(sensorContext.document?.canvas?.componentScale || 1)
  );
  const sensorWidth = Math.max(
    1,
    Number(sensorComponent.position?.width || 100) / sensorComponentScale
  );
  const sensorHeight = Math.max(
    1,
    Number(sensorComponent.position?.height || 100) / sensorComponentScale
  );
  sensorVisualElement.style.transform = doorWindowPerspectiveMatrix(
    sensorWidth,
    sensorHeight,
    sensorProperties.perspectiveCorners
  );
  const sensorFrameElement = document.createElement("span");
  sensorFrameElement.className = "hb-door-window-frame";
  const sensorLeftPanelElement = document.createElement("span");
  sensorLeftPanelElement.className = "hb-door-window-panel left";
  const sensorRightPanelElement = document.createElement("span");
  sensorRightPanelElement.className = "hb-door-window-panel right";
  sensorLeftPanelElement.append(document.createElement("i"));
  sensorRightPanelElement.append(document.createElement("i"));
  sensorFrameElement.append(sensorLeftPanelElement, sensorRightPanelElement);
  const sensorAirflowElement = document.createElement("span");
  sensorAirflowElement.className = "hb-door-window-airflow";
  for (let airflowSlatIndex = 0; airflowSlatIndex < 3; airflowSlatIndex += 1) {
    sensorAirflowElement.append(document.createElement("i"));
  }
  sensorVisualElement.append(sensorFrameElement, sensorAirflowElement);
  sensorElement.append(sensorVisualElement);
  return sensorElement;
}
/**
 * 渲染水浸传感器。
 *
 * @param {object} waterLeakProperties 控件属性。
 * @param {object} waterLeakPresentation 状态四态。
 * @returns {HTMLElement} 传感器元素。
 */
function renderWaterLeakSensor(waterLeakProperties, waterLeakPresentation) {
  const waterLeakAccentColor = resolveColor(waterLeakProperties.waterLeakColor, "#42c8ff");
  const isWaterLeakOccupied = waterLeakPresentation.key === "occupied";
  const waterLeakStateLabel = isWaterLeakOccupied
    ? "检测到水浸"
    : waterLeakPresentation.key === "clear"
      ? "正常"
      : waterLeakPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const waterLeakElement = document.createElement("div");
  waterLeakElement.className =
    "hb-water-leak-sensor is-" + (isWaterLeakOccupied ? "wet" : waterLeakPresentation.key);
  waterLeakElement.dataset.sensorState = isWaterLeakOccupied ? "wet" : waterLeakPresentation.key;
  waterLeakElement.style.setProperty("--hb-water-leak-accent", waterLeakAccentColor);
  waterLeakElement.setAttribute("role", "img");
  waterLeakElement.setAttribute("aria-label", "水浸传感器：" + waterLeakStateLabel);
  const waterLeakVisualElement = document.createElement("div");
  waterLeakVisualElement.className = "hb-water-leak-visual";
  const waterLeakPuddleElement = document.createElement("span");
  waterLeakPuddleElement.className = "hb-water-leak-puddle";
  const waterLeakRipplesElement = document.createElement("span");
  waterLeakRipplesElement.className = "hb-water-leak-ripples";
  for (let rippleIndex = 0; rippleIndex < 3; rippleIndex += 1) {
    waterLeakRipplesElement.append(document.createElement("i"));
  }
  const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const waterLeakDropletElement = document.createElementNS(SVG_NAMESPACE_URI, "svg");
  waterLeakDropletElement.setAttribute("class", "hb-water-leak-droplet");
  waterLeakDropletElement.setAttribute("viewBox", "0 0 48 64");
  waterLeakDropletElement.setAttribute("aria-hidden", "true");
  const dropletBodyElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletBodyElement.setAttribute("class", "body");
  dropletBodyElement.setAttribute(
    "d",
    "M24 3C20 10 6 27 6 40c0 11 8 20 18 20s18-9 18-20C42 27 28 10 24 3Z"
  );
  const dropletHighlightElement = document.createElementNS(SVG_NAMESPACE_URI, "path");
  dropletHighlightElement.setAttribute("class", "highlight");
  dropletHighlightElement.setAttribute("d", "M15 40c0-6 3-12 8-18");
  waterLeakDropletElement.append(dropletBodyElement, dropletHighlightElement);
  waterLeakVisualElement.append(
    waterLeakPuddleElement,
    waterLeakRipplesElement,
    waterLeakDropletElement
  );
  waterLeakElement.append(waterLeakVisualElement);
  return waterLeakElement;
}
/**
 * 渲染烟雾传感器。
 *
 * @param {object} smokeProperties 控件属性。
 * @param {object} smokePresentation 状态四态。
 * @returns {HTMLElement} 传感器元素。
 */
function renderSmokeSensor(smokeProperties, smokePresentation) {
  const smokeAccentColor = resolveColor(smokeProperties.smokeColor, "#ffffff");
  const isSmokeOccupied = smokePresentation.key === "occupied";
  const smokeStateLabel = isSmokeOccupied
    ? "检测到烟雾"
    : smokePresentation.key === "clear"
      ? "正常"
      : smokePresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const smokeElement = document.createElement("div");
  smokeElement.className =
    "hb-smoke-sensor is-" + (isSmokeOccupied ? "alert" : smokePresentation.key);
  smokeElement.dataset.sensorState = isSmokeOccupied ? "alert" : smokePresentation.key;
  smokeElement.style.setProperty("--hb-smoke-accent", smokeAccentColor);
  smokeElement.setAttribute("role", "img");
  smokeElement.setAttribute("aria-label", "烟雾传感器：" + smokeStateLabel);
  const smokeVisualElement = document.createElement("span");
  smokeVisualElement.className = "hb-smoke-visual";
  const smokeGroundElement = document.createElement("span");
  smokeGroundElement.className = "hb-smoke-ground";
  const SMOKE_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const smokeWispsElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "svg");
  smokeWispsElement.setAttribute("class", "hb-smoke-wisps");
  smokeWispsElement.setAttribute("viewBox", "0 0 100 100");
  smokeWispsElement.setAttribute("aria-hidden", "true");
  for (const smokeWispPath of [
    "M27 94C12 76 41 67 27 49C13 32 38 22 30 7",
    "M50 97C34 79 65 69 49 50C35 33 61 21 52 3",
    "M73 93C60 77 86 66 72 48C59 32 83 22 75 8"
  ]) {
    const smokeWispElement = document.createElementNS(SMOKE_SVG_NAMESPACE_URI, "path");
    smokeWispElement.setAttribute("d", smokeWispPath);
    smokeWispsElement.append(smokeWispElement);
  }
  smokeVisualElement.append(smokeGroundElement, smokeWispsElement);
  smokeElement.append(smokeVisualElement);
  return smokeElement;
}
/**
 * 渲染天然气传感器。
 *
 * @param {object} gasProperties 控件属性。
 * @param {object} gasPresentation 状态四态。
 * @returns {HTMLElement} 传感器元素。
 */
function renderGasSensor(gasProperties, gasPresentation) {
  const gasAccentColor = resolveColor(gasProperties.naturalGasColor, "#ffb347");
  const isGasOccupied = gasPresentation.key === "occupied";
  const gasStateLabel = isGasOccupied
    ? "检测到天然气"
    : gasPresentation.key === "clear"
      ? "正常"
      : gasPresentation.key === "unavailable"
        ? "离线"
        : "未知";
  const gasElement = document.createElement("div");
  gasElement.className =
    "hb-natural-gas-sensor is-" + (isGasOccupied ? "alert" : gasPresentation.key);
  gasElement.dataset.sensorState = isGasOccupied ? "alert" : gasPresentation.key;
  gasElement.style.setProperty("--hb-natural-gas-accent", gasAccentColor);
  gasElement.setAttribute("role", "img");
  gasElement.setAttribute("aria-label", "天然气传感器：" + gasStateLabel);
  const gasVisualElement = document.createElement("span");
  gasVisualElement.className = "hb-natural-gas-visual";
  const gasHazeElement = document.createElement("span");
  gasHazeElement.className = "hb-natural-gas-haze";
  const GAS_SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const gasCurrentsElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "svg");
  gasCurrentsElement.setAttribute("class", "hb-natural-gas-currents");
  gasCurrentsElement.setAttribute("viewBox", "0 0 120 80");
  gasCurrentsElement.setAttribute("aria-hidden", "true");
  for (const gasCurrentPath of [
    "M3 19C23 5 38 32 58 18C78 4 94 29 117 13",
    "M0 40C20 26 35 53 55 39C76 24 94 54 120 35",
    "M5 62C26 47 42 74 64 58C85 43 101 67 117 54"
  ]) {
    const gasCurrentElement = document.createElementNS(GAS_SVG_NAMESPACE_URI, "path");
    gasCurrentElement.setAttribute("d", gasCurrentPath);
    gasCurrentsElement.append(gasCurrentElement);
  }
  gasVisualElement.append(gasHazeElement, gasCurrentsElement);
  gasElement.append(gasVisualElement);
  return gasElement;
}
// 人体感应控件：把四种传感器外观（人体 / 门窗 / 水浸 / 烟雾 / 天然气）合成一个控件，
// 具体外观由 properties.sensorKind 决定，状态统一走 presence-runtime 的四态映射。
registerComponent("presence-sensor", {
  render(presenceComponent, presenceContext) {
    const presenceProperties = presenceComponent.properties || {};
    const presenceEntityId = presenceComponent.bindings?.entity?.entityId || "";
    const presenceState = presenceContext.states?.get(presenceEntityId);
    const motionEventConfig = presenceMotionEventConfig(
      presenceEntityId,
      presenceState,
      presenceContext.entityMetadata,
      presenceContext.states,
      presenceProperties
    );
    const sensorPresentationData = presenceSensorPresentation(
      presenceState,
      presenceContext.editable ? presenceContext.previewState : "auto",
      motionEventConfig
    );
    if (presenceProperties.sensorKind === "door-window") {
      return renderDoorWindowSensor(
        presenceComponent,
        presenceProperties,
        sensorPresentationData,
        presenceContext
      );
    }
    if (presenceProperties.sensorKind === "water-leak") {
      return renderWaterLeakSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "smoke") {
      return renderSmokeSensor(presenceProperties, sensorPresentationData);
    }
    if (presenceProperties.sensorKind === "natural-gas") {
      return renderGasSensor(presenceProperties, sensorPresentationData);
    }
    const presenceAccentColor = resolveColor(
      presenceProperties.iconOnColor || presenceProperties.occupiedColor,
      "#ffffff"
    );
    const presenceIdleColor = resolveColor(
      presenceProperties.iconColor || presenceProperties.clearColor,
      "#758189"
    );
    const presenceUnit = componentContentUnitsPx(presenceComponent, presenceContext);
    const presenceElement = document.createElement("div");
    presenceElement.className = "hb-presence-sensor is-" + sensorPresentationData.key;
    presenceElement.classList.toggle("is-halo-hidden", presenceProperties.haloVisible === false);
    presenceElement.classList.toggle(
      "is-person-hidden",
      presenceProperties.personVisible === false
    );
    presenceElement.dataset.presenceState = sensorPresentationData.key;
    presenceElement.style.setProperty("--hb-presence-occupied", presenceAccentColor);
    presenceElement.style.setProperty("--hb-presence-clear", presenceIdleColor);
    const animationStrength = clampCoercedNumber(presenceProperties.animationStrength, 0, 1, 0.72);
    const haloScale = clampCoercedNumber(presenceProperties.haloScale, 0.2, 3, 1);
    const haloScaleX = clampCoercedNumber(presenceProperties.haloScaleX, 0.2, 3, haloScale);
    const haloScaleY = clampCoercedNumber(presenceProperties.haloScaleY, 0.2, 3, haloScale);
    const haloRotation = clampCoercedNumber(presenceProperties.haloRotation, -360, 360, 0);
    const haloOpacity = clampCoercedNumber(presenceProperties.haloOpacity, 0, 1, 1);
    const personScale = clampCoercedNumber(presenceProperties.personScale, 0.2, 3, 1);
    const personRotation = clampCoercedNumber(presenceProperties.personRotation, -360, 360, 0);
    const personOpacity = clampCoercedNumber(presenceProperties.personOpacity, 0, 1, 1);
    const orbitDuration = clampCoercedNumber(presenceProperties.orbitDuration, 2, 60, 8);
    presenceElement.style.setProperty("--hb-presence-motion", String(animationStrength));
    const waveDuration = Number((3.2 - animationStrength * 0.8).toFixed(2));
    presenceElement.style.setProperty("--hb-presence-wave-duration", waveDuration + "s");
    presenceElement.style.setProperty("--hb-presence-halo-scale-x", String(haloScaleX));
    presenceElement.style.setProperty("--hb-presence-halo-scale-y", String(haloScaleY));
    presenceElement.style.setProperty("--hb-presence-halo-rotation", haloRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-halo-opacity", String(haloOpacity));
    presenceElement.style.setProperty("--hb-presence-person-scale", String(personScale));
    presenceElement.style.setProperty("--hb-presence-person-rotation", personRotation + "deg");
    presenceElement.style.setProperty("--hb-presence-person-opacity", String(personOpacity));
    presenceElement.style.setProperty("--hb-presence-orbit-duration", orbitDuration + "s");
    if (sensorPresentationData.key === "occupied") {
      const presencePhase = presenceAnimationPhase(presenceState, {
        orbit: orbitDuration,
        wave: waveDuration
      });
      presenceElement.style.setProperty("--hb-presence-orbit-delay", presencePhase.orbitDelay);
      presenceElement.style.setProperty("--hb-presence-wave-delay", presencePhase.waveDelay);
      presenceElement.style.setProperty("--hb-presence-floor-delay", presencePhase.floorDelay);
      presenceElement.style.setProperty("--hb-presence-step-delay", presencePhase.stepDelay);
    }
    const orbitOffsetX = haloScaleX * 32 * presenceUnit.width;
    const orbitOffsetY = haloScaleY * 13 * presenceUnit.height;
    presenceElement.style.setProperty("--hb-presence-orbit-x", orbitOffsetX.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-negative",
      (-orbitOffsetX).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-orbit-y", orbitOffsetY.toFixed(4) + "px");
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-negative",
      (-orbitOffsetY).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal",
      (orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-diagonal-negative",
      (-orbitOffsetX * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal",
      (orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-diagonal-negative",
      (-orbitOffsetY * 0.707).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow",
      (orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-shallow-negative",
      (-orbitOffsetX * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep",
      (orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-x-steep-negative",
      (-orbitOffsetX * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow",
      (orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-shallow-negative",
      (-orbitOffsetY * 0.382683).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep",
      (orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-orbit-y-steep-negative",
      (-orbitOffsetY * 0.92388).toFixed(4) + "px"
    );
    presenceElement.style.setProperty("--hb-presence-person-width", presenceUnit.width * 22 + "px");
    presenceElement.style.setProperty(
      "--hb-presence-person-height",
      presenceUnit.height * 62 + "px"
    );
    presenceElement.style.setProperty("--hb-presence-copy-gap", presenceUnit.height * 7 + "px");
    presenceElement.style.setProperty(
      "--hb-presence-copy-main-size",
      presenceUnit.height * 20 + "px"
    );
    presenceElement.style.setProperty(
      "--hb-presence-copy-secondary-size",
      presenceUnit.height * 10 + "px"
    );
    presenceElement.setAttribute("role", "img");
    presenceElement.setAttribute("aria-label", "人在传感器：" + sensorPresentationData.label);
    const presenceVisualElement = document.createElement("div");
    presenceVisualElement.className = "hb-presence-sensor-visual";
    const presenceHaloElement = document.createElement("span");
    presenceHaloElement.className = "hb-presence-sensor-halo";
    const presenceSpaceElement = document.createElement("span");
    presenceSpaceElement.className = "hb-presence-sensor-space";
    for (let haloSpanIndex = 0; haloSpanIndex < 3; haloSpanIndex += 1) {
      presenceSpaceElement.append(document.createElement("i"));
    }
    const presencePersonElement = document.createElement("span");
    presencePersonElement.className = "hb-presence-sensor-person";
    const personHeadElement = document.createElement("i");
    const personBodyElement = document.createElement("b");
    const personLeftArmElement = document.createElement("span");
    personLeftArmElement.className = "arm left";
    const personRightArmElement = document.createElement("span");
    personRightArmElement.className = "arm right";
    const personLeftLegElement = document.createElement("span");
    personLeftLegElement.className = "leg left";
    const personRightLegElement = document.createElement("span");
    personRightLegElement.className = "leg right";
    presencePersonElement.append(
      personHeadElement,
      personBodyElement,
      personLeftArmElement,
      personRightArmElement,
      personLeftLegElement,
      personRightLegElement
    );
    const presenceFloorElement = document.createElement("span");
    presenceFloorElement.className = "hb-presence-sensor-floor";
    presenceHaloElement.append(presenceSpaceElement, presenceFloorElement);
    const presenceOrbitElement = document.createElement("span");
    presenceOrbitElement.className = "hb-presence-sensor-orbit";
    const presenceTravelerElement = document.createElement("span");
    presenceTravelerElement.className = "hb-presence-sensor-traveler";
    presenceTravelerElement.append(presencePersonElement);
    presenceOrbitElement.append(presenceTravelerElement);
    presenceVisualElement.append(presenceHaloElement, presenceOrbitElement);
    presenceElement.append(presenceVisualElement);
    if (
      !presenceContext.editable &&
      motionEventConfig.motionEvent &&
      sensorPresentationData.key === "occupied"
    ) {
      const presenceTimestamp = presenceStateTimestamp(presenceState);
      const motionRemainingMs = Number.isFinite(presenceTimestamp)
        ? motionEventConfig.motionTimeoutSeconds * 1000 - (Date.now() - presenceTimestamp)
        : 0;
      if (motionRemainingMs > 0) {
        const motionTimeoutId = window.setTimeout(
          () => presenceContext.invalidate?.(),
          motionRemainingMs + 80
        );
        presenceContext.cleanup(() => window.clearTimeout(motionTimeoutId));
      }
    }
    return presenceElement;
  }
});
// 空调 / 浴霸控件：本体内绘制出风图层，弹窗里再展开完整控制面板。
registerComponent("air-conditioner", {
  render(airConditionerComponent, airConditionerContext) {
    const airConditionerProperties = airConditionerComponent.properties || {};
    const airConditionerEntityId = airConditionerComponent.bindings?.entity?.entityId || "";
    const airConditionerState = resolveStateEntry(
      airConditionerContext.states?.get(airConditionerEntityId)
    );
    const airConditionerDeviceType = resolveClimateDeviceType(
      airConditionerComponent,
      airConditionerState,
      airConditionerEntityId
    );
    const isAirConditionerActive = isClimateDeviceActive(
      airConditionerComponent,
      airConditionerContext
    );
    const { height: airConditionerUnitPx } = componentContentUnitsPx(
      airConditionerComponent,
      airConditionerContext
    );
    const airConditionerElement = document.createElement("div");
    airConditionerElement.className =
      "hb-air-conditioner" + (isAirConditionerActive ? " active" : "");
    airConditionerElement.style.setProperty(
      "--climate-icon-left",
      clampCoercedNumber(airConditionerProperties.iconLeft, -100, 200, 20) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-icon-top",
      clampCoercedNumber(airConditionerProperties.iconTop, -100, 200, 50) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-left",
      clampCoercedNumber(airConditionerProperties.mainTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-main-top",
      clampCoercedNumber(airConditionerProperties.mainTextTop, -100, 200, 40) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-left",
      clampCoercedNumber(airConditionerProperties.secondaryTextLeft, -100, 200, 39) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-secondary-top",
      clampCoercedNumber(airConditionerProperties.secondaryTextTop, -100, 200, 67) + "%"
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-color",
      resolveColor(airConditionerProperties.badgeColor, "#5b5e66")
    );
    airConditionerElement.style.setProperty(
      "--climate-badge-opacity",
      clampCoercedNumber(airConditionerProperties.badgeOpacity, 0, 1, 0.58) * 100 + "%"
    );
    const airConditionerIconColor = resolveColor(
      isAirConditionerActive
        ? airConditionerProperties.iconOnColor
        : airConditionerProperties.iconOffColor,
      isAirConditionerActive ? "#73c8ff" : "#9aa5ad"
    );
    airConditionerElement.style.setProperty("--climate-icon-color", airConditionerIconColor);
    airConditionerElement.style.setProperty(
      "--climate-icon-glow-size",
      airConditionerUnitPx * 7 + "px"
    );
    const airConditionerBadgeSize = clampCoercedNumber(airConditionerProperties.badgeSize, 1, 100, 28);
    const airConditionerSymbolSize = clampCoercedNumber(airConditionerProperties.symbolSize, 1, 100, 14);
    if (airConditionerProperties.iconVisible !== false) {
      const airConditionerBadgeElement = document.createElement("span");
      airConditionerBadgeElement.className = "hb-air-conditioner-icon-badge";
      airConditionerBadgeElement.style.width =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      airConditionerBadgeElement.style.height =
        airConditionerBadgeSize * airConditionerUnitPx + "px";
      const airConditionerIconName = String(airConditionerProperties.icon || "");
      const airConditionerResolvedIconName =
        airConditionerDeviceType === "bath-heater" &&
        (!airConditionerIconName || airConditionerIconName === "mdi:air-conditioner")
          ? climateDefaultIcon(airConditionerDeviceType)
          : airConditionerIconName || climateDefaultIcon(airConditionerDeviceType);
      const airConditionerIconSource = resolveIconUrl(airConditionerResolvedIconName);
      if (airConditionerIconSource) {
        const airConditionerIconElement = document.createElement("i");
        airConditionerIconElement.className = "hb-air-conditioner-icon";
        const airConditionerSymbolPercent = clampCoercedNumber(
          (airConditionerSymbolSize / airConditionerBadgeSize) * 100,
          1,
          100,
          50
        );
        airConditionerIconElement.style.width = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.height = airConditionerSymbolPercent + "%";
        airConditionerIconElement.style.backgroundColor = airConditionerIconColor;
        airConditionerIconElement.style.maskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerIconElement.style.webkitMaskImage = 'url("' + airConditionerIconSource + '")';
        airConditionerBadgeElement.append(airConditionerIconElement);
      }
      airConditionerElement.append(airConditionerBadgeElement);
    }
    const airConditionerTextElement = document.createElement("span");
    airConditionerTextElement.className = "hb-air-conditioner-text";
    const airConditionerMainTextSize = clampCoercedNumber(airConditionerProperties.mainSize, 6, 120, 21);
    const airConditionerMainTextElement = document.createElement("strong");
    airConditionerMainTextElement.textContent =
      String(airConditionerProperties.mainText || "").trim() ||
      String(
        airConditionerState?.attributes?.friendly_name ||
          airConditionerEntityId ||
          (airConditionerDeviceType === "bath-heater" ? "未选择浴霸实体" : "未选择空调实体")
      );
    airConditionerMainTextElement.style.color = resolveColor(
      airConditionerProperties.mainColor,
      "#c7c8cb"
    );
    airConditionerMainTextElement.style.fontSize =
      airConditionerMainTextSize * airConditionerUnitPx + "px";
    airConditionerMainTextElement.style.letterSpacing =
      clampCoercedNumber(airConditionerProperties.mainSpacing, -20, 100, 0.5) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerMainTextElement,
      airConditionerProperties.mainWeight,
      airConditionerMainTextSize
    );
    const airConditionerSecondaryTextSize = clampCoercedNumber(
      airConditionerProperties.secondarySize,
      5,
      80,
      12
    );
    const airConditionerSecondaryTextElement = document.createElement("small");
    airConditionerSecondaryTextElement.textContent = airConditionerEntityId
      ? resolveClimateLabel(airConditionerComponent, airConditionerContext)
      : "未选择实体";
    airConditionerSecondaryTextElement.style.color = resolveColor(
      airConditionerProperties.secondaryColor,
      "#75777d"
    );
    airConditionerSecondaryTextElement.style.fontSize =
      airConditionerSecondaryTextSize * airConditionerUnitPx + "px";
    airConditionerSecondaryTextElement.style.letterSpacing =
      clampCoercedNumber(airConditionerProperties.secondarySpacing, -20, 100, 0.3) * airConditionerUnitPx +
      "px";
    applyFontWeight(
      airConditionerSecondaryTextElement,
      airConditionerProperties.secondaryWeight,
      airConditionerSecondaryTextSize
    );
    if (airConditionerProperties.mainTextVisible !== false) {
      airConditionerTextElement.append(airConditionerMainTextElement);
    }
    if (airConditionerProperties.secondaryTextVisible !== false) {
      airConditionerTextElement.append(airConditionerSecondaryTextElement);
    }
    if (airConditionerTextElement.childElementCount) {
      airConditionerElement.append(airConditionerTextElement);
    }
    return airConditionerElement;
  }
});
/**
 * 取摄像头圆形裁剪的半径比例。
 *
 * 入参可能是 0~1 的比例，也可能是 0~100 的百分比，用「是否大于 0.5」区分：
 * 两种量纲在这里的分界明显，不需要额外配置项。
 *
 * @param {*} radiusValue 半径值。
 * @param {number} [fallbackRadiusRatio] 非法时的兜底比例。
 * @returns {number} 0~0.5 的半径比例。
 */
export function cameraRadiusRatio(radiusValue, fallbackRadiusRatio = 0.04) {
  const parsedRadius = Number(radiusValue);
  if (Number.isFinite(parsedRadius)) {
    return clampCoercedNumber(
      parsedRadius > 0.5 ? parsedRadius / 100 : parsedRadius,
      0,
      0.5,
      fallbackRadiusRatio
    );
  } else {
    return fallbackRadiusRatio;
  }
}
/**
 * 给摄像头容器补一层边框。
 *
 * 只画边框不含内容，因此宽高优先取控件尺寸，取不到才退回容器的客户端尺寸；
 * 边框宽度为 0 或显式关闭时返回 null，调用方不必再判断。
 *
 * @param {Element} frameContainerElement 容器元素。
 * @param {object} frameComponent 控件对象。
 * @param {object} [frameProperties] 控件属性。
 * @param {string} [frameNamespace] 渐变 / 滤镜 id 的命名空间，避免同页多实例冲突。
 * @returns {Element|null} 边框元素。
 */
export function appendCameraFrame(
  frameContainerElement,
  frameComponent,
  frameProperties = {},
  frameNamespace = "renderer"
) {
  if (!frameContainerElement || frameProperties.frameVisible === false) {
    return null;
  }
  const cameraFrameWidth = Math.max(
    20,
    Number(frameComponent?.position?.width || frameContainerElement.clientWidth || 320)
  );
  const cameraFrameHeight = Math.max(
    20,
    Number(frameComponent?.position?.height || frameContainerElement.clientHeight || 180)
  );
  const cameraFrameBorderWidth = clampCoercedNumber(frameProperties.frameWidth, 0, 20, 1);
  if (cameraFrameBorderWidth <= 0) {
    return null;
  }
  const cameraFrameInset = Math.max(0.5, cameraFrameBorderWidth / 2 + 0.5);
  const cameraFrameInnerWidth = Math.max(1, cameraFrameWidth - cameraFrameInset * 2);
  const cameraFrameInnerHeight = Math.max(1, cameraFrameHeight - cameraFrameInset * 2);
  const cameraFrameRadiusRatio = cameraRadiusRatio(frameProperties.radius);
  const cameraFrameCornerRadius =
    Math.min(cameraFrameInnerWidth, cameraFrameInnerHeight) * cameraFrameRadiusRatio;
  const cameraFrameOpacity = clampCoercedNumber(frameProperties.frameOpacity, 0, 1, 0.9);
  const cameraFrameColor = resolveColor(frameProperties.frameColor, "#d4d4d4");
  const cameraFrameId =
    frameNamespace +
    "-camera-frame-" +
    String(frameComponent?.id || "").replace(/[^a-z0-9_-]/gi, "");
  const cameraFrameSvg = appendSvgElement(frameContainerElement, "svg", {
    class: "hb-camera-frame",
    viewBox: "0 0 " + cameraFrameWidth + " " + cameraFrameHeight,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  const cameraFrameDefs = appendSvgElement(cameraFrameSvg, "defs");
  const cameraFrameEdgeGradient = appendSvgElement(cameraFrameDefs, "linearGradient", {
    id: cameraFrameId + "-edge",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: cameraFrameHeight / 2,
    x2: cameraFrameWidth,
    y2: cameraFrameHeight / 2,
    gradientTransform:
      "rotate(" +
      clampCoercedNumber(frameProperties.frameAngle, 0, 360, 45) +
      " " +
      cameraFrameWidth / 2 +
      " " +
      cameraFrameHeight / 2 +
      ")"
  });
  for (const [cameraFrameStopOffset, cameraFrameStopOpacity] of [
    [0, 0.96],
    [0.22, 0.72],
    [0.52, 0.3],
    [0.78, 0.66],
    [1, 0.42]
  ]) {
    appendSvgElement(cameraFrameEdgeGradient, "stop", {
      offset: cameraFrameStopOffset,
      "stop-color": cameraFrameColor,
      "stop-opacity": cameraFrameStopOpacity * cameraFrameOpacity
    });
  }
  appendSvgElement(cameraFrameSvg, "rect", {
    x: cameraFrameInset,
    y: cameraFrameInset,
    width: cameraFrameInnerWidth,
    height: cameraFrameInnerHeight,
    rx: cameraFrameCornerRadius,
    fill: "none",
    stroke: "url(#" + cameraFrameId + "-edge)",
    "stroke-width": cameraFrameBorderWidth,
    "vector-effect": "non-scaling-stroke"
  });
  return cameraFrameSvg;
}
// HLS 播放地址的缓存有效期：30 秒。太短会频繁请求后端换取地址，太长会让过期的会话继续使用。
const CAMERA_HLS_CACHE_TTL_MS = 30000;
const CAMERA_PREWARM_LIMIT = 4;
const cameraSourceCache = new Map();
const cameraSourceInflight = new Map();
/**
 * 取摄像头的 HLS 播放地址（带缓存与并发合并）。
 *
 * 同一实体在有效期内的请求直接命中缓存；未完成的请求按实体合并，
 * 多个控件同时挂载同一路摄像头时只会真正请求一次。
 *
 * @param {string} cameraEntityId 摄像头实体 ID。
 * @returns {Promise<string>} HLS 地址。
 * @throws {Error} 实体 ID 为空或后端返回失败时抛出。
 */
async function fetchCameraHlsSource(cameraEntityId) {
  const normalizedCameraEntityId = String(cameraEntityId || "").trim();
  if (!normalizedCameraEntityId) {
    throw new Error("Camera entity is required");
  }
  const requestStartTimestamp = Date.now();
  const cachedSourceEntry = cameraSourceCache.get(normalizedCameraEntityId);
  if (
    cachedSourceEntry &&
    requestStartTimestamp - cachedSourceEntry.createdAt < CAMERA_HLS_CACHE_TTL_MS
  ) {
    return cachedSourceEntry.source;
  }
  const inflightSourcePromise = cameraSourceInflight.get(normalizedCameraEntityId);
  if (inflightSourcePromise) {
    return inflightSourcePromise;
  }
    // 把「请求 → 解析 → 写缓存」包成一个 Promise 并立刻登记进 cameraSourceInflight：
    // 后到的同实体请求直接复用这个 Promise，实现并发合并。
    const pendingSourcePromise = (async () => {
    const hlsFetchResponse = await fetch(
      "/api/camera_hls/" + encodeURIComponent(normalizedCameraEntityId)
    );
    const hlsPayload = await hlsFetchResponse.json().catch(() => ({}));
    if (!hlsFetchResponse.ok) {
      throw new Error(
        hlsPayload?.detail || "Camera HLS request failed: " + hlsFetchResponse.status
      );
    }
    const hlsProxyUrl = typeof hlsPayload?.url == "string" ? hlsPayload.url.trim() : "";
    if (!hlsProxyUrl.startsWith("/")) {
      cameraSourceCache.set(normalizedCameraEntityId, {
        source: "",
        createdAt: Date.now()
      });
      return "";
    }
    cameraSourceCache.set(normalizedCameraEntityId, {
      source: hlsProxyUrl,
      createdAt: Date.now()
    });
    return hlsProxyUrl;
  })();
  cameraSourceInflight.set(normalizedCameraEntityId, pendingSourcePromise);
  try {
    return await pendingSourcePromise;
  } finally {
    if (cameraSourceInflight.get(normalizedCameraEntityId) === pendingSourcePromise) {
      cameraSourceInflight.delete(normalizedCameraEntityId);
    }
  }
}
/**
 * 预热摄像头播放地址。
 *
 * 页面隐藏时不预热（用户看不到，白白占带宽）；数量截到 CAMERA_PREWARM_LIMIT，
 * 失败用 allSettled 吞掉：预热本来就是可选优化，不该影响页面。
 *
 * @param {string[]} [prewarmEntityIds] 待预热的实体 ID。
 * @returns {Promise<void>}
 */
export async function prewarmCameraMedia(prewarmEntityIds = []) {
  if (document.visibilityState === "hidden") {
    return;
  }
  const prewarmTargetEntityIds = [
    ...new Set(
      (prewarmEntityIds || [])
        .map(prewarmEntityId => String(prewarmEntityId || "").trim())
        .filter(Boolean)
    )
  ].slice(0, CAMERA_PREWARM_LIMIT);
  await Promise.allSettled(
    prewarmTargetEntityIds.map(prewarmRequestEntityId =>
      fetchCameraHlsSource(prewarmRequestEntityId)
    )
  );
}
/**
 * 在容器里挂一张定时刷新的摄像头快照。
 *
 * 刷新间隔下限 6 秒（再短对后端与浏览器都不划算），并夹在 setTimeout 的最大值之内；
 * 页面隐藏时挂起定时器，回到前台立刻补一次，避免后台空转。
 *
 * @param {object} options 挂载参数。
 * @param {Element} options.container 容器。
 * @param {string} options.entityId 摄像头实体 ID。
 * @param {string} [options.label] 无障碍标签。
 * @param {string} [options.objectFit] 填充方式。
 * @param {number} [options.refreshInterval] 刷新间隔（秒）。
 * @param {Element} [options.placeholder] 占位元素。
 * @param {function} [options.cleanup] 卸载时的回调。
 * @returns {function(): void} 卸载函数。
 */
export function mountCameraSnapshot({
  container: snapshotContainer,
  entityId: snapshotEntityId,
  label: snapshotLabel,
  objectFit: snapshotObjectFit = "cover",
  refreshInterval: snapshotRefreshSeconds = 10,
  placeholder: snapshotPlaceholderElement,
  cleanup: snapshotCleanup = () => {}
}) {
  const snapshotImageElement = document.createElement("img");
  snapshotImageElement.className = "hb-camera-image";
  snapshotImageElement.alt = snapshotLabel || snapshotEntityId;
  snapshotImageElement.draggable = false;
  snapshotImageElement.style.objectFit = snapshotObjectFit;
  const snapshotRefreshValue = Number(snapshotRefreshSeconds);
  const snapshotRefreshSecondsClamped = Number.isFinite(snapshotRefreshValue)
    ? Math.max(6, Math.round(snapshotRefreshValue))
    : 10;
  const snapshotRefreshMs = Math.min(2147483000, snapshotRefreshSecondsClamped * 1000);
  let isSnapshotDisposed = false;
  let isSnapshotSuspended = document.visibilityState === "hidden";
  let snapshotRefreshTimeoutId = 0;
  let hasSnapshotLoaded = false;
  let snapshotRequestId = 0;
  // 统一的清表入口：顺手把 id 归零，于是「有没有定时器」只用 0 一个哨兵判断。
  const clearSnapshotRefreshTimer = () => {
    window.clearTimeout(snapshotRefreshTimeoutId);
    snapshotRefreshTimeoutId = 0;
  };
  // 排下一次刷新：先清旧表再排新表，保证同一时刻只有一个定时器；
  // 已销毁或处于后台挂起时不排，避免无人观看时空转请求。
  const scheduleSnapshotRefresh = () => {
    clearSnapshotRefreshTimer();
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotRefreshTimeoutId = window.setTimeout(loadCameraSnapshot, snapshotRefreshMs);
    }
  };
  // 取一张新快照：首张直接把地址交给可见的 img 并显示加载文案；
  // 之后改用离屏 img 预载，等 load 成功才替换可见图，刷新时不会闪白。
  const loadCameraSnapshot = () => {
    if (isSnapshotDisposed || isSnapshotSuspended) {
      return;
    }
    clearSnapshotRefreshTimer();
    const snapshotProxyUrl =
      "/api/camera_proxy/" + encodeURIComponent(snapshotEntityId) + "?hb=" + Date.now();
    if (!hasSnapshotLoaded) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "正在载入摄像头快照";
      snapshotContainer.dataset.cameraState = "snapshot-loading";
      snapshotImageElement.src = snapshotProxyUrl;
      return;
    }
    snapshotContainer.dataset.cameraState = "snapshot-loading";
    const currentSnapshotRequestId = ++snapshotRequestId;
    const preloadSnapshotImage = document.createElement("img");
    preloadSnapshotImage.addEventListener("load", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotImageElement.src = snapshotProxyUrl;
      }
    });
    preloadSnapshotImage.addEventListener("error", () => {
      if (
        !isSnapshotDisposed &&
        !isSnapshotSuspended &&
        currentSnapshotRequestId === snapshotRequestId
      ) {
        snapshotContainer.dataset.cameraState = "snapshot-stale";
        scheduleSnapshotRefresh();
      }
    });
    preloadSnapshotImage.src = snapshotProxyUrl;
  };
  snapshotImageElement.addEventListener("load", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      hasSnapshotLoaded = true;
      snapshotPlaceholderElement.hidden = true;
      snapshotContainer.dataset.cameraState = "snapshot-ready";
      scheduleSnapshotRefresh();
    }
  });
  snapshotImageElement.addEventListener("error", () => {
    if (!isSnapshotDisposed && !isSnapshotSuspended) {
      snapshotPlaceholderElement.hidden = false;
      snapshotPlaceholderElement.textContent = "摄像头快照不可用";
      snapshotContainer.dataset.cameraState = "snapshot-unavailable";
      scheduleSnapshotRefresh();
    }
  });
  // 页面显隐切换：隐藏时停表并标记挂起；回到前台立刻补一次刷新，
  // 免得用户看到的是离开页面之前的那张旧图。
  const handleSnapshotVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      isSnapshotSuspended = true;
      clearSnapshotRefreshTimer();
      snapshotContainer.dataset.cameraState = "snapshot-suspended";
      return;
    }
    if (isSnapshotSuspended) {
      isSnapshotSuspended = false;
      loadCameraSnapshot();
    }
  };
  snapshotContainer.dataset.cameraTransport = "snapshot";
  snapshotContainer.prepend(snapshotImageElement);
  document.addEventListener("visibilitychange", handleSnapshotVisibilityChange);
  if (isSnapshotSuspended) {
    snapshotContainer.dataset.cameraState = "snapshot-suspended";
  } else {
    loadCameraSnapshot();
  }
  snapshotCleanup(() => {
    isSnapshotDisposed = true;
    clearSnapshotRefreshTimer();
    document.removeEventListener("visibilitychange", handleSnapshotVisibilityChange);
    snapshotImageElement.removeAttribute("src");
  });
  return {
    image: snapshotImageElement
  };
}
/**
 * 在容器里挂载实时视频，失败时自动退回定时快照。
 *
 * 视频元素必须 muted + playsInline：浏览器只允许静音自动播放，
 * 不静音会直接被拒绝播放，表现为黑屏。
 *
 * @param {object} options 挂载参数。
 * @param {Element} options.container 容器。
 * @param {string} options.entityId 摄像头实体 ID。
 * @param {string} [options.label] 无障碍标签。
 * @param {string} [options.objectFit] 填充方式。
 * @param {Element} [options.placeholder] 占位元素。
 * @param {function} [options.onReady] 播放就绪回调。
 * @param {function} [options.onUnavailable] 不可用回调。
 * @param {function} [options.cleanup] 卸载时的回调。
 * @returns {function(): void} 卸载函数。
 */
export function mountCameraMedia({
  container: mediaContainer,
  entityId: mediaEntityId,
  label: mediaLabel,
  objectFit: mediaObjectFit = "cover",
  placeholder: mediaPlaceholderElement,
  onReady: onMediaReady = () => {},
  onUnavailable: onMediaUnavailable = () => {},
  cleanup: mediaCleanup = () => {}
}) {
  const cameraVideoElement = document.createElement("video");
  cameraVideoElement.className = "hb-camera-video";
  cameraVideoElement.setAttribute("aria-label", mediaLabel || mediaEntityId);
  cameraVideoElement.autoplay = true;
  cameraVideoElement.muted = true;
  cameraVideoElement.playsInline = true;
  cameraVideoElement.disablePictureInPicture = true;
  cameraVideoElement.style.objectFit = mediaObjectFit;
  const cameraSnapshotImageElement = document.createElement("img");
  cameraSnapshotImageElement.className = "hb-camera-image";
  cameraSnapshotImageElement.alt = mediaLabel || mediaEntityId;
  cameraSnapshotImageElement.draggable = false;
  cameraSnapshotImageElement.style.objectFit = mediaObjectFit;
  let isMediaDisposed = false;
  let hasLegacyFallbackStarted = false;
  let hasSnapshotFallbackStarted = false;
  let connectTimeoutId = 0;
  let hlsTimeoutId = 0;
  let snapshotProbeTimeoutId = 0;
  let hlsInstance = null;
  let hasVideoReady = false;
  let mediaGeneration = 0;
  let isMediaSuspended = document.visibilityState === "hidden";
  // 拆掉当前播放链路。先自增 mediaGeneration，让在途的 HLS 拉流、各超时回调全部失效；
  // 再清定时器、销毁 Hls 实例、摘掉 video 与快照的 src 并复位所有降级标记，
  // 这样下一轮 beginCameraPlayback 才能从干净状态重新走一遍。
  const teardownCameraMedia = () => {
    mediaGeneration += 1;
    window.clearTimeout(connectTimeoutId);
    window.clearTimeout(hlsTimeoutId);
    window.clearTimeout(snapshotProbeTimeoutId);
    connectTimeoutId = 0;
    hlsTimeoutId = 0;
    snapshotProbeTimeoutId = 0;
    hlsInstance?.destroy();
    hlsInstance = null;
    cameraVideoElement.pause();
    cameraVideoElement.removeAttribute("src");
    cameraVideoElement.load();
    cameraSnapshotImageElement.removeAttribute("src");
    hasLegacyFallbackStarted = false;
    hasSnapshotFallbackStarted = false;
    hasVideoReady = false;
  };
  // 切到视频模式：移除降级用的快照 img，并把 video 挂回容器；
  // isConnected 判断是为了在重复调用时不把 video 反复插入造成重排。
  const showCameraVideo = () => {
    cameraSnapshotImageElement.remove();
    if (!cameraVideoElement.isConnected) {
      mediaContainer.prepend(cameraVideoElement);
    }
  };
  // loadeddata / playing / 快照 load 三个事件共用：只认第一次成功，
  // 之后重复事件直接忽略，避免 onMediaReady 被回调多次。
  const handleVideoReady = () => {
    if (!isMediaDisposed && !isMediaSuspended && !hasVideoReady) {
      hasVideoReady = true;
      window.clearTimeout(hlsTimeoutId);
      window.clearTimeout(snapshotProbeTimeoutId);
      mediaPlaceholderElement.hidden = true;
      onMediaReady();
    }
  };
  // 彻底不可用：恢复占位文案并通知调用方；这里是所有降级路径的终点，不再继续重试。
  const handleVideoUnavailable = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      hasVideoReady = false;
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头实时预览不可用";
      onMediaUnavailable();
    }
  };
  // 老式静态快照通道：直接打 /api/camera_proxy，带时间戳参数绕过浏览器与后端的缓存。
  const loadLegacySnapshotImage = () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      cameraSnapshotImageElement.src =
        "/api/camera_proxy/" + encodeURIComponent(mediaEntityId) + "?hb=" + Date.now();
    }
  };
  // 降级到定时快照，整轮播放只允许降级一次（hasSnapshotFallbackStarted 把关）；
  // expectedGeneration 用于丢弃上一轮播放遗留的过期回调。
  const fallbackToSnapshotImage = (expectedGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      expectedGeneration === mediaGeneration &&
      !hasSnapshotFallbackStarted
    ) {
      hasSnapshotFallbackStarted = true;
      window.clearTimeout(snapshotProbeTimeoutId);
      loadLegacySnapshotImage();
    }
  };
  // 降级到 /api/camera_proxy_stream（MJPEG 长连）：同样受 mediaGeneration 与一次性标记约束，
  // 并把 video 换成 img；7 秒内拿不到 naturalWidth 就再退一级到静态快照。
  const useLegacyCameraStream = (fallbackGeneration = mediaGeneration) => {
    if (
      !isMediaDisposed &&
      !isMediaSuspended &&
      fallbackGeneration === mediaGeneration &&
      !hasLegacyFallbackStarted
    ) {
      hasLegacyFallbackStarted = true;
      mediaContainer.dataset.cameraTransport = "legacy";
      window.clearTimeout(hlsTimeoutId);
      hlsInstance?.destroy();
      hlsInstance = null;
      cameraVideoElement.pause();
      cameraVideoElement.removeAttribute("src");
      cameraVideoElement.load();
      cameraVideoElement.remove();
      mediaContainer.prepend(cameraSnapshotImageElement);
      cameraSnapshotImageElement.src =
        "/api/camera_proxy_stream/" + encodeURIComponent(mediaEntityId);
      snapshotProbeTimeoutId = window.setTimeout(() => {
        if (!cameraSnapshotImageElement.naturalWidth) {
          fallbackToSnapshotImage(fallbackGeneration);
        }
      }, 7000);
    }
  };
  cameraVideoElement.addEventListener("loadeddata", handleVideoReady);
  cameraVideoElement.addEventListener("playing", handleVideoReady);
  cameraVideoElement.addEventListener(
    "error",
    () => {
      if (!hlsInstance) {
        useLegacyCameraStream();
      }
    },
    {
      once: true
    }
  );
  cameraSnapshotImageElement.addEventListener("load", handleVideoReady);
  cameraSnapshotImageElement.addEventListener("error", () => {
    if (!isMediaDisposed && !isMediaSuspended) {
      if (hasSnapshotFallbackStarted) {
        handleVideoUnavailable();
      } else {
        fallbackToSnapshotImage();
      }
    }
  });
  mediaContainer.prepend(cameraVideoElement);
  // 启动 HLS 播放：向后端取 HLS 源地址，能用 hls.js 就用它，否则退回原生 src。
  // 取源是异步的，期间可能已切换实体或控件被卸载 / 暂停，所以每个回调都拿
  // playbackGeneration 与 mediaGeneration 比对，过期就直接放弃；isMediaDisposed /
  // isMediaSuspended 分别对应销毁与暂停。致命错误会删掉 cameraSourceCache 并回落旧版流，
  // 避免下次仍复用坏地址。缓冲区前后各 15s 配 lowLatencyMode，是延迟与卡顿的折中。
  const startHlsPlayback = async playbackGeneration => {
    try {
      const hlsSourceUrl = await fetchCameraHlsSource(mediaEntityId);
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      if (!hlsSourceUrl) {
        useLegacyCameraStream(playbackGeneration);
        return;
      }
      mediaContainer.dataset.cameraHlsSource = hlsSourceUrl;
      mediaContainer.dataset.cameraTransport = "hls";
      if (window.Hls?.isSupported?.()) {
        hlsInstance = new window.Hls({
          lowLatencyMode: true,
          backBufferLength: 15,
          maxBufferLength: 15
        });
        hlsInstance.on(window.Hls.Events.MEDIA_ATTACHED, () =>
          hlsInstance?.loadSource(hlsSourceUrl)
        );
        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          mediaContainer.dataset.cameraState = "manifest-parsed";
          cameraVideoElement.play().catch(() => {});
        });
        hlsInstance.on(window.Hls.Events.ERROR, (hlsEventName, hlsEventData) => {
          if (!isMediaDisposed && !isMediaSuspended && playbackGeneration === mediaGeneration) {
            if (hlsEventData?.fatal) {
              cameraSourceCache.delete(String(mediaEntityId || "").trim());
              mediaContainer.dataset.cameraState = "hls-failed";
              mediaContainer.dataset.cameraError = [
                hlsEventData.type,
                hlsEventData.details,
                hlsEventData.url || hlsEventData.response?.url || "",
                hlsEventData.response?.code || 0,
                hlsEventData.reason || hlsEventData.error?.message || ""
              ].join(" | ");
              window.HABridgeLog?.report(
                "error",
                "摄像头",
                "摄像头播放失败：" +
                  (hlsEventData.type || "") +
                  " / " +
                  (hlsEventData.details || ""),
                {
                  entityId: mediaEntityId,
                  phase: "hls-playback",
                  status: hlsEventData.response?.code || 0,
                  path: hlsEventData.url || hlsEventData.response?.url || ""
                }
              );
              // HABridgeLog 已经把「会话历史」那份错误上报过了（含 entityId / type / details）；
              // 控制台这份只在 ?debug=1 时输出，避免生产里同一次失败响两份。
              debugLog("warn", "[HomeOS camera] HLS playback failed", {
                entityId: mediaEntityId,
                type: hlsEventData.type,
                details: hlsEventData.details,
                url: hlsEventData.url || hlsEventData.response?.url || "",
                status: hlsEventData.response?.code || 0,
                reason: hlsEventData.reason || hlsEventData.error?.message || ""
              });
              useLegacyCameraStream(playbackGeneration);
            }
          }
        });
        hlsInstance.attachMedia(cameraVideoElement);
      } else {
        cameraVideoElement.src = hlsSourceUrl;
        cameraVideoElement.play().catch(() => {});
      }
    } catch (hlsError) {
      if (isMediaDisposed || isMediaSuspended || playbackGeneration !== mediaGeneration) {
        return;
      }
      mediaContainer.dataset.cameraState = "setup-fallback";
      mediaContainer.dataset.cameraError = String(hlsError);
      useLegacyCameraStream(playbackGeneration);
    }
  };
  // 开始一轮播放：复位就绪标记、写「正在连接」占位，先走 HLS；
  // 12 秒未就绪由 hlsTimeoutId 统一降级到 MJPEG 通道。
  const beginCameraPlayback = () => {
    if (isMediaDisposed || isMediaSuspended) {
      return;
    }
    showCameraVideo();
    hasVideoReady = false;
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头正在连接";
    const playbackStartGeneration = mediaGeneration;
    mediaContainer.dataset.cameraState = "starting";
    startHlsPlayback(playbackStartGeneration);
    hlsTimeoutId = window.setTimeout(() => useLegacyCameraStream(playbackStartGeneration), 12000);
  };
  // 页面显隐：隐藏时主动拆链路（后台不该继续占带宽与解码资源），
  // 回到前台重新完整走一遍播放流程，而不是只把 video 恢复播放。
  const handleMediaVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (isMediaSuspended) {
        return;
      }
      isMediaSuspended = true;
      teardownCameraMedia();
      mediaContainer.dataset.cameraState = "suspended";
      mediaPlaceholderElement.hidden = false;
      mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
      return;
    }
    if (isMediaSuspended) {
      isMediaSuspended = false;
      beginCameraPlayback();
    }
  };
  document.addEventListener("visibilitychange", handleMediaVisibilityChange);
  if (isMediaSuspended) {
    mediaContainer.dataset.cameraState = "suspended";
    mediaPlaceholderElement.hidden = false;
    mediaPlaceholderElement.textContent = "摄像头已在后台暂停";
  } else {
    mediaContainer.dataset.cameraState = "deferred";
    connectTimeoutId = window.setTimeout(beginCameraPlayback, 0);
  }
  mediaCleanup(() => {
    isMediaDisposed = true;
    document.removeEventListener("visibilitychange", handleMediaVisibilityChange);
    teardownCameraMedia();
  });
  return {
    video: cameraVideoElement,
    image: cameraSnapshotImageElement
  };
}
// 摄像头控件：运行时优先播放实时视频，不可用时退回定时刷新的快照。
registerComponent("camera", {
  render(cameraComponent, cameraContext) {
    const cameraProperties = cameraComponent.properties || {};
    const cameraBindingEntityId = cameraComponent.bindings?.entity?.entityId || "";
    const cameraElement = document.createElement("div");
    cameraElement.className = "hb-camera-component";
    const cameraWidth = Math.max(1, Number(cameraComponent.position?.width || 320));
    const cameraHeight = Math.max(1, Number(cameraComponent.position?.height || 180));
    const cameraScopeScale = Math.max(
      0.01,
      Number(cameraContext.document?.canvas?.componentScale || 1)
    );
    const cameraBorderRadius =
      (Math.min(cameraWidth, cameraHeight) * cameraRadiusRatio(cameraProperties.radius)) /
      cameraScopeScale;
    cameraElement.style.borderRadius = cameraBorderRadius + "px";
    if (cameraContext.editable) {
      const cameraPlaceholderElement = document.createElement("div");
      cameraPlaceholderElement.className = "hb-camera-placeholder";
      cameraPlaceholderElement.textContent =
        cameraProperties.mediaVisible === false ? "摄像头画面已隐藏" : "编辑模式不加载实时画面";
      cameraElement.append(cameraPlaceholderElement);
    } else if (cameraContext.liveMedia !== false && cameraProperties.mediaVisible !== false) {
      const cameraStatusElement = document.createElement("div");
      cameraStatusElement.className = "hb-camera-placeholder";
      const isSnapshotDisplayMode = cameraProperties.displayMode === "snapshot";
      cameraStatusElement.textContent = cameraBindingEntityId
        ? isSnapshotDisplayMode
          ? "正在载入摄像头快照"
          : "正在载入摄像头实时预览"
        : "未选择摄像头实体";
      cameraElement.append(cameraStatusElement);
      if (cameraBindingEntityId) {
        const cameraMountOptions = {
          container: cameraElement,
          entityId: cameraBindingEntityId,
          label:
            resolveStateEntry(cameraContext.states?.get(cameraBindingEntityId))?.attributes
              ?.friendly_name || cameraBindingEntityId,
          objectFit: cameraProperties.fit === "contain" ? "contain" : "fill",
          placeholder: cameraStatusElement,
          cleanup: cleanupRegistration => cameraContext.cleanup(cleanupRegistration)
        };
        if (isSnapshotDisplayMode) {
          mountCameraSnapshot({
            ...cameraMountOptions,
            refreshInterval: cameraProperties.refreshInterval
          });
        } else {
          mountCameraMedia(cameraMountOptions);
        }
      }
    }
    appendCameraFrame(
      cameraElement,
      cameraComponent,
      cameraProperties,
      cameraContext.renderNamespace
    );
    return cameraElement;
  }
});
// 扫地机地图控件：图片地址由 vacuumMapImageSource 生成，并交给预加载器提前取图。
registerComponent("vacuum-map", {
  render(vacuumComponent, vacuumContext) {
    const vacuumProperties = vacuumComponent.properties || {};
    const vacuumBindingEntityId = vacuumComponent.bindings?.entity?.entityId || "";
    const vacuumElement = document.createElement("div");
    vacuumElement.className = "hb-vacuum-map-component";
    vacuumElement.style.opacity = String(clampCoercedNumber(vacuumProperties.opacity, 0, 1, 0.5));
    vacuumElement.setAttribute("aria-label", vacuumProperties.label || "扫地机器人实时地图");
    if (!vacuumBindingEntityId) {
      if (vacuumContext.editable) {
        const vacuumEmptyPlaceholderElement = document.createElement("span");
        vacuumEmptyPlaceholderElement.className = "hb-vacuum-map-placeholder";
        vacuumEmptyPlaceholderElement.textContent = "请选择实时地图实体";
        vacuumElement.append(vacuumEmptyPlaceholderElement);
      }
      return vacuumElement;
    }
    const vacuumImageElement = document.createElement("img");
    vacuumImageElement.className = "hb-vacuum-map-image";
    vacuumImageElement.alt =
      vacuumProperties.label ||
      resolveStateEntry(vacuumContext.states?.get(vacuumBindingEntityId))?.attributes
        ?.friendly_name ||
      vacuumBindingEntityId;
    vacuumImageElement.draggable = false;
    const vacuumEncodedEntityId = encodeURIComponent(vacuumBindingEntityId);
    const isImageEntityId = vacuumBindingEntityId.startsWith("image.");
    const isVacuumLiveMediaEnabled = vacuumContext.liveMedia !== false;
    const isVacuumLiveMediaActive = vacuumContext.liveMedia !== false && !vacuumContext.editable;
    if (isVacuumLiveMediaActive && document.visibilityState === "hidden") {
      vacuumImageElement.dataset.vacuumMapSuspended = "true";
    }
    // 地图地址随场景变化：image.* 实体走 vacuumMapImageSource 生成带 token 的地址，
    // 其余实体在编辑器里用一次性快照、运行时用 MJPEG 长连。
    const resolveVacuumMapSource = () =>
      isImageEntityId
        ? vacuumMapImageSource(
            vacuumBindingEntityId,
            vacuumContext.states?.get(vacuumBindingEntityId)
          )
        : vacuumContext.editable
          ? "/api/camera_proxy/" + vacuumEncodedEntityId + "?hb=" + Date.now()
          : "/api/camera_proxy_stream/" + vacuumEncodedEntityId;
    let vacuumRetryTimeoutId = 0;
    let vacuumRetryCount = 0;
    const MAX_VACUUM_RETRY_COUNT = 4;
    // 清重试定时器；守卫 if 是为了避免对 0 调用 clearTimeout（并无副作用，只是少一次无谓调用）。
    const clearVacuumRetryTimer = () => {
      if (vacuumRetryTimeoutId) {
        window.clearTimeout(vacuumRetryTimeoutId);
        vacuumRetryTimeoutId = 0;
      }
    };
    // 把当前该用的地址写给 img；后台挂起状态下刻意不赋 src，
    // 否则浏览器仍会去取图，白占带宽。
    const applyVacuumMapSource = () => {
      const vacuumMapSource = resolveVacuumMapSource();
      if (isImageEntityId) {
        vacuumImageElement.dataset.vacuumMapSource = vacuumMapSource;
      }
      if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        vacuumImageElement.removeAttribute("src");
        return;
      }
      vacuumImageElement.src = vacuumMapSource;
    };
    // 加载成功：清零重试计数，让下一次失败可以重新获得完整次数的指数退避额度。
    const handleVacuumImageLoad = () => {
      vacuumRetryCount = 0;
      clearVacuumRetryTimer();
    };
    // 重试耗尽后把图替换成文案占位。只在编辑器里做：运行时替换会丢掉后续状态更新的挂载点。
    const showVacuumUnavailablePlaceholder = () => {
      if (!vacuumContext.editable || !vacuumImageElement.isConnected) {
        return;
      }
      const vacuumUnavailableElement = document.createElement("span");
      vacuumUnavailableElement.className = "hb-vacuum-map-placeholder";
      vacuumUnavailableElement.textContent = "实时地图暂时不可用";
      vacuumImageElement.replaceWith(vacuumUnavailableElement);
    };
    // 加载失败：指数退避重试，延迟 = 700ms × 2^(次数-1)，封顶 4 秒、最多试 4 次；
    // 非 image.* 实体的重试地址额外拼 hb 时间戳，因为 MJPEG 长连的失败很可能是缓存了坏响应。
    const handleVacuumImageError = () => {
      if (!isVacuumLiveMediaEnabled || vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        return;
      }
      if (vacuumRetryCount >= MAX_VACUUM_RETRY_COUNT) {
        showVacuumUnavailablePlaceholder();
        return;
      }
      vacuumRetryCount += 1;
      clearVacuumRetryTimer();
      const vacuumRetryDelayMs = Math.min(4000, 2 ** (vacuumRetryCount - 1) * 700);
      vacuumRetryTimeoutId = window.setTimeout(() => {
        vacuumRetryTimeoutId = 0;
        if (
          vacuumImageElement.dataset.vacuumMapSuspended === "true" ||
          !vacuumImageElement.isConnected
        ) {
          return;
        }
        const vacuumRetrySource = resolveVacuumMapSource();
        const vacuumRetrySourceBusted = isImageEntityId
          ? vacuumRetrySource
          : "" +
            vacuumRetrySource +
            (vacuumRetrySource.includes("?") ? "&" : "?") +
            "hb=" +
            Date.now();
        if (isImageEntityId) {
          vacuumImageElement.dataset.vacuumMapSource = vacuumRetrySourceBusted;
        }
        vacuumImageElement.src = vacuumRetrySourceBusted;
      }, vacuumRetryDelayMs);
    };
    vacuumImageElement.addEventListener("load", handleVacuumImageLoad);
    if (isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", handleVacuumImageError);
    }
    if (vacuumContext.liveMedia !== false) {
      applyVacuumMapSource();
    }
    if (isVacuumLiveMediaActive) {
      // 页面显隐：隐藏时用 dataset 标记挂起并摘掉 src（长连才算真正断开），
      // 回前台清标记并重新取图，避免在后台持续吃流量。
      const handleVacuumVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
            return;
          }
          vacuumImageElement.dataset.vacuumMapSuspended = "true";
          vacuumImageElement.removeAttribute("src");
          return;
        }
        if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
          delete vacuumImageElement.dataset.vacuumMapSuspended;
          applyVacuumMapSource();
        }
      };
      document.addEventListener("visibilitychange", handleVacuumVisibilityChange);
      vacuumContext.cleanup(() =>
        document.removeEventListener("visibilitychange", handleVacuumVisibilityChange)
      );
    }
    if (!isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", showVacuumUnavailablePlaceholder, {
        once: true
      });
    }
    vacuumElement.append(vacuumImageElement);
    vacuumContext.cleanup(() => {
      clearVacuumRetryTimer();
      vacuumImageElement.removeEventListener?.("load", handleVacuumImageLoad);
      if (isVacuumLiveMediaEnabled) {
        vacuumImageElement.removeEventListener?.("error", handleVacuumImageError);
      }
      vacuumImageElement.removeAttribute("src");
    });
    return vacuumElement;
  }
});
// 时间控件：文案由 date-time-runtime 格式化，运行时由 home.js 定时触发重绘。
registerComponent("time", {
  render(timeComponent, timeContext) {
    const timeProperties = timeComponent.properties || {};
    const timeFontSize = clampCoercedNumber(timeProperties.fontSize, 12, 500, 96);
    const timeElement = document.createElement("time");
    timeElement.className = "hb-time-component";
    timeElement.style.color = resolveColor(timeProperties.color, "#248eb2");
    timeElement.style.fontSize = timeFontSize + "px";
    timeElement.style.letterSpacing =
      clampCoercedNumber(timeProperties.letterSpacing, -20, 100, 2.2) + "px";
    timeElement.style.opacity = String(clampCoercedNumber(timeProperties.opacity, 0, 1, 1));
    const timeValueElement = document.createElement("span");
    timeValueElement.className = "hb-time-value";
    applyFontWeight(timeValueElement, timeProperties.fontWeight, timeFontSize);
    const timePeriodElement = document.createElement("small");
    timePeriodElement.className = "hb-time-period";
    applyFontWeight(timePeriodElement, timeProperties.fontWeight, timeFontSize * 0.5);
    timeElement.append(timeValueElement, timePeriodElement);
    // 刷新显示的时钟文案。这里自己起定时器而不依赖外层重绘：
    // 秒级显示用 250ms 轮询，是为了让「跳秒」看起来更接近整秒切换而不是漂移。
    const updateTimeDisplay = () => {
      const nowDate = new Date();
      const formattedLocalTime = formatLocalTime(timeProperties, nowDate);
      timeElement.dateTime = nowDate.toISOString();
      timeValueElement.textContent = formattedLocalTime.value;
      timePeriodElement.textContent = formattedLocalTime.suffix;
      timePeriodElement.hidden = !formattedLocalTime.suffix;
    };
    updateTimeDisplay();
    const timeIntervalId = window.setInterval(
      updateTimeDisplay,
      timeProperties.showSeconds === true ? 250 : 1000
    );
    timeContext.cleanup(() => window.clearInterval(timeIntervalId));
    return timeElement;
  }
});
// 日期控件：主行日期 + 可选星期 / 农历，同样由运行时定时刷新。
registerComponent("date", {
  render(dateComponent, dateContext) {
    const dateProperties = dateComponent.properties || {};
    const dateElement = document.createElement("div");
    dateElement.className = "hb-date-component";
    dateElement.style.opacity = String(clampCoercedNumber(dateProperties.opacity, 0, 1, 1));
    dateElement.style.gap = clampCoercedNumber(dateProperties.lineGap, 0, 200, 8) + "px";
    const datePrimaryElement = document.createElement("strong");
    datePrimaryElement.className = "hb-date-primary";
    datePrimaryElement.style.color = resolveColor(dateProperties.primaryColor, "#8d9296");
    const datePrimarySize = clampCoercedNumber(dateProperties.primarySize, 12, 500, 36);
    datePrimaryElement.style.fontSize = datePrimarySize + "px";
    applyFontWeight(datePrimaryElement, dateProperties.primaryWeight, datePrimarySize);
    datePrimaryElement.style.letterSpacing =
      clampCoercedNumber(dateProperties.primarySpacing, -20, 100, 1) + "px";
    dateElement.append(datePrimaryElement);
    let lunarElement = null;
    if (dateProperties.showLunar === true) {
      lunarElement = document.createElement("small");
      lunarElement.className = "hb-date-lunar";
      lunarElement.style.color = resolveColor(dateProperties.lunarColor, "#7f878c");
      const dateLunarSize = clampCoercedNumber(dateProperties.lunarSize, 10, 500, 24);
      lunarElement.style.fontSize = dateLunarSize + "px";
      applyFontWeight(lunarElement, dateProperties.lunarWeight, dateLunarSize);
      lunarElement.style.letterSpacing =
        clampCoercedNumber(dateProperties.lunarSpacing, -20, 100, 1) + "px";
      dateElement.append(lunarElement);
    }
    // 刷新日期文案。30 秒一次足够：日期与农历都以「天」为最小变化单位，
    // 轮询只是为了让跨零点时能在半分钟内自动翻页，无需按秒刷新。
    const updateDateDisplay = () => {
      const todayDate = new Date();
      datePrimaryElement.textContent = formatLocalDate(dateProperties, todayDate);
      if (lunarElement) {
        lunarElement.textContent = formatLunarDate(todayDate);
      }
    };
    updateDateDisplay();
    const dateIntervalId = window.setInterval(updateDateDisplay, 30000);
    dateContext.cleanup(() => window.clearInterval(dateIntervalId));
    return dateElement;
  }
});
// 天气控件：图标与文案由 weatherVisual 映射，并结合太阳实体判断昼夜切换夜间图标。
registerComponent("weather", {
  render(weatherComponent, weatherContext) {
    const weatherProperties = weatherComponent.properties || {};
    const weatherEntityId = weatherComponent.bindings?.entity?.entityId || "";
    const sunEntityId = weatherComponent.bindings?.sun?.entityId || "sun.sun";
    const weatherState = weatherContext.states.get(weatherEntityId);
    const sunStateText = weatherContext.states.get(sunEntityId)?.state || "";
    const weatherAttributes = weatherState?.attributes || {};
    const [weatherIconName, weatherConditionLabel] = weatherVisual(
      weatherState?.state,
      sunStateText
    );
    const weatherElement = document.createElement("div");
    weatherElement.className = "hb-weather-component";
    weatherElement.style.gap = clampCoercedNumber(weatherProperties.iconGap, 0, 300, 22) + "px";
    weatherElement.style.opacity = String(clampCoercedNumber(weatherProperties.opacity, 0, 1, 1));
    if (weatherProperties.iconVisible !== false) {
      const weatherIconElement = document.createElement("img");
      weatherIconElement.className = "hb-weather-icon";
      weatherIconElement.src = meteoconUrl(weatherIconName);
      weatherIconElement.alt = weatherConditionLabel;
      weatherIconElement.draggable = false;
      weatherIconElement.style.width = clampCoercedNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherIconElement.style.height = clampCoercedNumber(weatherProperties.iconSize, 12, 500, 64) + "px";
      weatherElement.append(weatherIconElement);
    }
    const weatherContentElement = document.createElement("span");
    weatherContentElement.className = "hb-weather-content";
    weatherContentElement.style.gap = clampCoercedNumber(weatherProperties.lineGap, 0, 200, 7) + "px";
    if (weatherProperties.temperatureVisible !== false) {
      const weatherTemperatureElement = document.createElement("strong");
      const temperatureValue = Number(weatherAttributes.temperature);
      const temperatureUnit = String(
        weatherAttributes.temperature_unit || weatherAttributes.unit_of_measurement || "°C"
      );
      weatherTemperatureElement.textContent = Number.isFinite(temperatureValue)
        ? "" + temperatureValue + temperatureUnit
        : "--" + temperatureUnit;
      weatherTemperatureElement.style.color = resolveColor(
        weatherProperties.temperatureColor,
        "#aeb3b7"
      );
      const temperatureFontSize = clampCoercedNumber(weatherProperties.temperatureSize, 12, 500, 32);
      weatherTemperatureElement.style.fontSize = temperatureFontSize + "px";
      applyFontWeight(
        weatherTemperatureElement,
        weatherProperties.temperatureWeight,
        temperatureFontSize
      );
      weatherTemperatureElement.style.letterSpacing =
        clampCoercedNumber(weatherProperties.temperatureSpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherTemperatureElement);
    }
    if (
      weatherProperties.conditionVisible !== false ||
      weatherProperties.humidityVisible !== false
    ) {
      const weatherSecondaryElement = document.createElement("small");
      const weatherSecondaryParts = [];
      if (weatherProperties.conditionVisible !== false) {
        weatherSecondaryParts.push(weatherConditionLabel);
      }
      const humidityValue = Number(weatherAttributes.humidity);
      if (weatherProperties.humidityVisible !== false) {
        weatherSecondaryParts.push(
          Number.isFinite(humidityValue) ? "湿度 " + humidityValue + "%" : "湿度 --"
        );
      }
      weatherSecondaryElement.textContent = weatherSecondaryParts.join(" · ");
      weatherSecondaryElement.style.color = resolveColor(
        weatherProperties.secondaryColor,
        "#8d9296"
      );
      const weatherSecondaryFontSize = clampCoercedNumber(weatherProperties.secondarySize, 10, 500, 18);
      weatherSecondaryElement.style.fontSize = weatherSecondaryFontSize + "px";
      applyFontWeight(
        weatherSecondaryElement,
        weatherProperties.secondaryWeight,
        weatherSecondaryFontSize
      );
      weatherSecondaryElement.style.letterSpacing =
        clampCoercedNumber(weatherProperties.secondarySpacing, -20, 100, 1) + "px";
      weatherContentElement.append(weatherSecondaryElement);
    }
    if (weatherContentElement.childElementCount) {
      weatherElement.append(weatherContentElement);
    }
    return weatherElement;
  }
});
// 折线图控件：序列由 buildHistorySeries 整理，几何与路径由 line-chart-runtime 计算。
registerComponent("line-chart", {
  render(chartComponent, chartContext) {
    const chartProperties = chartComponent.properties || {};
    const chartEntityId = chartComponent.bindings?.entity?.entityId || "";
    const chartState = chartContext.states.get(chartEntityId);
    const chartUnit = String(chartState?.attributes?.unit_of_measurement || "");
    const chartCurrentValue = Number.parseFloat(chartState?.state);
    const chartSamples = buildHistorySeries(
      chartContext,
      chartEntityId,
      chartCurrentValue,
      chartProperties.hours
    );
    const chartThresholds = resolvedThresholds(
      chartProperties.thresholds,
      chartSamples,
      chartProperties.thresholdMode
    );
    const chartElement = document.createElement("div");
    chartElement.className = "hb-line-chart-component";
    chartElement.style.borderRadius = clampCoercedNumber(chartProperties.cornerRadius, 0, 50, 10) + "%";
    const chartValueElement = document.createElement("span");
    chartValueElement.className = "hb-line-chart-value";
    chartValueElement.hidden = chartProperties.valueVisible === false;
    chartValueElement.style.color = resolveColor(chartProperties.valueColor, "#dce1e5");
    chartValueElement.style.fontSize =
      Math.max(
        10,
        (Number(chartComponent.position?.height || 300) *
          0.12 *
          clampCoercedNumber(chartProperties.valueScale, 10, 500, 100)) /
          100
      ) + "px";
    chartValueElement.style.left =
      95 + clampCoercedNumber(chartProperties.valueOffsetX, -100, 100, 0) + "%";
    chartValueElement.style.top = 8 + clampCoercedNumber(chartProperties.valueOffsetY, -100, 100, 0) + "%";
    const chartValueTextElement = document.createElement("strong");
    chartValueTextElement.textContent = formatLineChartValue(
      chartCurrentValue,
      chartProperties.statePrecision
    );
    const chartUnitElement = document.createElement("small");
    chartUnitElement.textContent = chartUnit;
    chartValueElement.append(chartValueTextElement, chartUnitElement);
    chartElement.append(chartValueElement);
    chartElement.syncLineChartState = runtimeStateUpdate => {
      const runtimeStateValue = Number.parseFloat(runtimeStateUpdate?.state);
      chartValueTextElement.textContent = formatLineChartValue(
        runtimeStateValue,
        chartProperties.statePrecision
      );
      chartUnitElement.textContent = String(
        runtimeStateUpdate?.attributes?.unit_of_measurement || ""
      );
      chartElement.style.setProperty(
        "--hb-chart-current-color",
        Number.isFinite(runtimeStateValue)
          ? thresholdColor(chartThresholds, runtimeStateValue)
          : "#68cc3e"
      );
    };
    const chartSvg = appendSvgElement(chartElement, "svg", {
      viewBox: "0 0 100 70",
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    chartSvg.classList.add("hb-line-chart-graph");
    if (chartSamples.length) {
      const chartGeometry = lineChartGeometry(chartSamples);
      const {
        minimum: chartMinimum,
        maximum: chartMaximum,
        span: chartSpan,
        points: chartPoints
      } = chartGeometry;
      const chartPath = smoothChartPath(chartPoints);
      const chartGradientId =
        (chartContext.renderNamespace || "renderer") +
        "-chart-" +
        String(chartComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
      const chartDefs = appendSvgElement(chartSvg, "defs");
      const chartLineGradient = appendSvgElement(chartDefs, "linearGradient", {
        id: chartGradientId + "-line",
        gradientUnits: "userSpaceOnUse",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 70
      });
      const chartThresholdStops = chartThresholds.length
        ? chartThresholds
        : [
            {
              value: chartMinimum,
              color: "#68cc3e"
            }
          ];
      for (const chartThresholdStop of [...chartThresholdStops].sort(
        (firstThresholdStop, secondThresholdStop) =>
          secondThresholdStop.value - firstThresholdStop.value
      )) {
        appendSvgElement(chartLineGradient, "stop", {
          offset:
            clampCoercedNumber(((chartMaximum - chartThresholdStop.value) / chartSpan) * 100, 0, 100, 0) +
            "%",
          "stop-color": chartThresholdStop.color
        });
      }
      appendSvgElement(chartSvg, "path", {
        d: chartPath + " L100 70 L0 70 Z",
        fill: "url(#" + chartGradientId + "-line)",
        opacity: 0.18
      });
      appendSvgElement(chartSvg, "path", {
        d: chartPath,
        fill: "none",
        stroke: "url(#" + chartGradientId + "-line)",
        "stroke-width": 1.6,
        "vector-effect": "non-scaling-stroke"
      });
      if (!chartContext.editable) {
        const chartHoverLayerElement = document.createElement("span");
        chartHoverLayerElement.className = "hb-line-chart-hover-layer";
        chartElement.append(chartHoverLayerElement);
        const chartHoverCleanup = attachChartTooltip(
          chartHoverLayerElement,
          chartElement,
          chartGeometry,
          chartUnit,
          chartMappedPoint => ({
            x: chartMappedPoint.x,
            y: (chartMappedPoint.y / 70) * 100
          }),
          chartProperties.statePrecision
        );
        chartContext.cleanup?.(chartHoverCleanup);
      }
    } else {
      chartElement.classList.add("history-loading");
    }
    chartElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(chartCurrentValue)
        ? thresholdColor(chartThresholds, chartCurrentValue)
        : "#68cc3e"
    );
    return chartElement;
  }
});
/**
 * 渲染折线图弹窗里的详情视图（大图 + 阈值色带 + 当前值）。
 *
 * 与控件本体共用同一套数据整理与几何计算；返回值上挂了 syncLineChartState，
 * 运行时状态更新时直接调用它做增量刷新，不必整块重建 DOM。
 *
 * @param {object} detailsComponent 控件数据。
 * @param {object} detailsContext 渲染上下文。
 * @returns {HTMLElement} 详情区块。
 */
export function renderLineChartDetails(detailsComponent, detailsContext) {
  const detailsEntityId = detailsComponent.bindings?.entity?.entityId || "";
  const detailsState = detailsContext.states.get(detailsEntityId);
  const detailsUnit = String(detailsState?.attributes?.unit_of_measurement || "");
  const detailsValue = Number.parseFloat(detailsState?.state);
  const detailsSamples = buildHistorySeries(
    detailsContext,
    detailsEntityId,
    detailsValue,
    detailsComponent.properties?.hours
  );
  const detailsElement = document.createElement("section");
  detailsElement.className = "hb-line-chart-details";
  const detailsThresholds = resolvedThresholds(
    detailsComponent.properties?.thresholds,
    detailsSamples,
    detailsComponent.properties?.thresholdMode
  );
  detailsElement.style.setProperty(
    "--hb-chart-current-color",
    Number.isFinite(detailsValue) ? thresholdColor(detailsThresholds, detailsValue) : "#68cc3e"
  );
  detailsElement.syncLineChartState = detailsRuntimeUpdate => {
    const detailsRuntimeValue = Number.parseFloat(detailsRuntimeUpdate?.state);
    detailsElement.style.setProperty(
      "--hb-chart-current-color",
      Number.isFinite(detailsRuntimeValue)
        ? thresholdColor(detailsThresholds, detailsRuntimeValue)
        : "#68cc3e"
    );
  };
  if (!detailsSamples.length) {
    const detailsEmptyElement = document.createElement("p");
    detailsEmptyElement.textContent = "暂无历史数据。";
    detailsElement.append(detailsEmptyElement);
    return detailsElement;
  }
  const isCompactHorizontal = detailsComponent.properties?.compactDetailsHorizontal === true;
  const detailsViewBoxWidth = isCompactHorizontal ? 790 : 720;
  const detailsTopOffset = isCompactHorizontal ? 0 : 56;
  const detailsViewBoxHeight = 340 + detailsTopOffset;
  const detailsLeftMargin = isCompactHorizontal ? 44 : 66;
  const detailsRightMargin = isCompactHorizontal ? 44 : 26;
  const detailsPlotRect = {
    left: detailsLeftMargin,
    top: 24,
    width: detailsViewBoxWidth - detailsLeftMargin - detailsRightMargin,
    height: 258 + detailsTopOffset
  };
  const detailsGeometry = lineChartGeometry(
    detailsSamples,
    detailsPlotRect.left,
    detailsPlotRect.top,
    detailsPlotRect.width,
    detailsPlotRect.height
  );
  const detailsSvg = appendSvgElement(detailsElement, "svg", {
    viewBox: "0 0 " + detailsViewBoxWidth + " " + detailsViewBoxHeight,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "带时间轴和数值轴的历史折线图"
  });
  const detailsGradientId =
    (detailsContext.renderNamespace || "renderer") +
    "-chart-details-" +
    String(detailsComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
  const detailsDefs = appendSvgElement(detailsSvg, "defs");
  const detailsLineGradient = appendSvgElement(detailsDefs, "linearGradient", {
    id: detailsGradientId + "-line",
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: detailsPlotRect.top,
    x2: 0,
    y2: detailsPlotRect.top + detailsPlotRect.height
  });
  const detailsThresholdStops = detailsThresholds.length
    ? detailsThresholds
    : [
        {
          value: detailsGeometry.minimum,
          color: "#68cc3e"
        }
      ];
  for (const detailsThresholdStop of [...detailsThresholdStops].sort(
    (lowerThresholdStop, higherThresholdStop) =>
      higherThresholdStop.value - lowerThresholdStop.value
  )) {
    appendSvgElement(detailsLineGradient, "stop", {
      offset:
        clampCoercedNumber(
          ((detailsGeometry.maximum - detailsThresholdStop.value) / detailsGeometry.span) * 100,
          0,
          100,
          0
        ) + "%",
      "stop-color": detailsThresholdStop.color
    });
  }
  for (let horizontalGridIndex = 0; horizontalGridIndex <= 4; horizontalGridIndex += 1) {
    const horizontalRatio = horizontalGridIndex / 4;
    const horizontalY = detailsPlotRect.top + horizontalRatio * detailsPlotRect.height;
    const horizontalValue = detailsGeometry.maximum - horizontalRatio * detailsGeometry.span;
    appendSvgElement(detailsSvg, "line", {
      x1: detailsPlotRect.left,
      y1: horizontalY,
      x2: detailsPlotRect.left + detailsPlotRect.width,
      y2: horizontalY,
      class: "hb-line-chart-details-grid"
    });
    const horizontalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: detailsPlotRect.left - (isCompactHorizontal ? 8 : 12),
      y: horizontalY + 4,
      "text-anchor": "end",
      class: "hb-line-chart-details-axis-label"
    });
    horizontalLabelElement.textContent = formatLineChartValue(
      horizontalValue,
      detailsComponent.properties?.statePrecision
    );
  }
  const hasMultiDayRange = Number(detailsComponent.properties?.hours || 24) > 24;
  for (let verticalGridIndex = 0; verticalGridIndex <= 5; verticalGridIndex += 1) {
    const verticalRatio = verticalGridIndex / 5;
    const verticalX = detailsPlotRect.left + verticalRatio * detailsPlotRect.width;
    const verticalTime =
      detailsGeometry.firstTime +
      verticalRatio * (detailsGeometry.lastTime - detailsGeometry.firstTime);
    appendSvgElement(detailsSvg, "line", {
      x1: verticalX,
      y1: detailsPlotRect.top,
      x2: verticalX,
      y2: detailsPlotRect.top + detailsPlotRect.height,
      class: "hb-line-chart-details-grid vertical"
    });
    const verticalLabelElement = appendSvgElement(detailsSvg, "text", {
      x: verticalX,
      y: detailsPlotRect.top + detailsPlotRect.height + 25,
      "text-anchor": "middle",
      class: "hb-line-chart-details-axis-label"
    });
    verticalLabelElement.textContent = formatHistoryTimestamp(verticalTime, hasMultiDayRange);
  }
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top,
    x2: detailsPlotRect.left,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  appendSvgElement(detailsSvg, "line", {
    x1: detailsPlotRect.left,
    y1: detailsPlotRect.top + detailsPlotRect.height,
    x2: detailsPlotRect.left + detailsPlotRect.width,
    y2: detailsPlotRect.top + detailsPlotRect.height,
    class: "hb-line-chart-details-axis"
  });
  const axisTitleElement = appendSvgElement(detailsSvg, "text", {
    x: detailsPlotRect.left,
    y: 20,
    class: "hb-line-chart-details-axis-title"
  });
  axisTitleElement.textContent = detailsUnit || "数值";
  const detailsPath = smoothChartPath(detailsGeometry.points);
  appendSvgElement(detailsSvg, "path", {
    d:
      detailsPath +
      " L" +
      (detailsPlotRect.left + detailsPlotRect.width) +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " L" +
      detailsPlotRect.left +
      " " +
      (detailsPlotRect.top + detailsPlotRect.height) +
      " Z",
    fill: "url(#" + detailsGradientId + "-line)",
    opacity: 0.12,
    class: "hb-line-chart-details-fill"
  });
  appendSvgElement(detailsSvg, "path", {
    d: detailsPath,
    fill: "none",
    stroke: "url(#" + detailsGradientId + "-line)",
    "stroke-width": 2.4,
    pathLength: 100,
    "vector-effect": "non-scaling-stroke",
    class: "hb-line-chart-details-line"
  });
  const leadDotElement = appendSvgElement(detailsSvg, "circle", {
    cx: 0,
    cy: 0,
    r: 4.2,
    class: "hb-line-chart-details-lead-dot"
  });
  if (detailsContext.animate !== false) {
    appendSvgElement(leadDotElement, "animateMotion", {
      path: detailsPath,
      dur: "1.1s",
      begin: ".28s",
      fill: "freeze"
    });
  }
  detailsElement.cleanupLineChartHover = () => {};
  if (detailsContext.interactive !== false) {
    detailsElement.cleanupLineChartHover = attachChartTooltip(
      detailsSvg,
      detailsElement,
      detailsGeometry,
      detailsUnit,
      detailsMappedPoint => ({
        x: (detailsMappedPoint.x / detailsViewBoxWidth) * 100,
        y: (detailsMappedPoint.y / detailsViewBoxHeight) * 100
      }),
      detailsComponent.properties?.statePrecision,
      {
        start: detailsPlotRect.left / detailsViewBoxWidth,
        end: (detailsPlotRect.left + detailsPlotRect.width) / detailsViewBoxWidth
      },
      detailsElement
    );
  }
  return detailsElement;
}
// 面板框控件：纯装饰性外框（描边 + 光晕），内部内容由子组件承载。
registerComponent("panel-frame", {
  render(panelFrameComponent, panelFrameContext) {
    const panelFrameProperties = panelFrameComponent.properties || {};
    const panelFrameWidth = Math.max(20, Number(panelFrameComponent.position?.width || 528));
    const panelFrameHeight = Math.max(20, Number(panelFrameComponent.position?.height || 300));
    const panelEdgeWidth = clampCoercedNumber(panelFrameProperties.edgeWidth, 0, 20, 0.9);
    const panelInset = Math.max(0.5, panelEdgeWidth / 2 + 0.5);
    const panelInnerWidth = Math.max(1, panelFrameWidth - panelInset * 2);
    const panelInnerHeight = Math.max(1, panelFrameHeight - panelInset * 2);
    const panelCornerRadius =
      Math.min(panelInnerWidth, panelInnerHeight) *
      clampCoercedNumber(panelFrameProperties.radius, 0, 0.5, 0.195);
    const panelEdgeOpacity = clampCoercedNumber(panelFrameProperties.edgeOpacity, 0, 1, 1);
    const panelGlowStrength = clampCoercedNumber(panelFrameProperties.glowStrength, 0, 5, 0.5);
    const panelGlowSize = clampCoercedNumber(panelFrameProperties.glowSize, 0, 3, 1.5);
    const panelGlowStrokeWidth = Math.min(panelInnerWidth, panelInnerHeight) * 0.22 * panelGlowSize;
    const panelGlowBlur = Math.min(panelInnerWidth, panelInnerHeight) * 0.06 * panelGlowSize;
    const panelEdgeColor = resolveColor(panelFrameProperties.edgeColor, "#d4d4d4");
    const panelGlowColor = resolveColor(panelFrameProperties.glowColor, "#ffffff");
    const panelFrameId =
      (panelFrameContext.renderNamespace || "renderer") +
      "-frame-" +
      String(panelFrameComponent.id || "").replace(/[^a-z0-9_-]/gi, "");
    const panelFrameElement = document.createElement("div");
    panelFrameElement.className = "hb-panel-frame-component";
    const panelFrameSvg = appendSvgElement(panelFrameElement, "svg", {
      viewBox: "0 0 " + panelFrameWidth + " " + panelFrameHeight,
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    const panelFrameDefs = appendSvgElement(panelFrameSvg, "defs");
    const panelGlassGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glass",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.35, panelGlowStrength * 0.035)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 0.52,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.12, panelGlowStrength * 0.01)
    });
    appendSvgElement(panelGlassGradient, "stop", {
      offset: 1,
      "stop-color": panelGlowColor,
      "stop-opacity": Math.min(0.25, panelGlowStrength * 0.025)
    });
    const panelEdgeGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-edge",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampCoercedNumber(panelFrameProperties.edgeAngle, 0, 360, 45) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelEdgeStopOffset, panelEdgeStopOpacity] of [
      [0, 0.96],
      [0.22, 0.72],
      [0.52, 0.3],
      [0.78, 0.66],
      [1, 0.42]
    ]) {
      appendSvgElement(panelEdgeGradient, "stop", {
        offset: panelEdgeStopOffset,
        "stop-color": panelEdgeColor,
        "stop-opacity": panelEdgeStopOpacity * panelEdgeOpacity
      });
    }
    const panelGlowGradient = appendSvgElement(panelFrameDefs, "linearGradient", {
      id: panelFrameId + "-glow",
      gradientUnits: "userSpaceOnUse",
      x1: 0,
      y1: panelFrameHeight / 2,
      x2: panelFrameWidth,
      y2: panelFrameHeight / 2,
      gradientTransform:
        "rotate(" +
        clampCoercedNumber(panelFrameProperties.glowAngle, 0, 360, 242) +
        " " +
        panelFrameWidth / 2 +
        " " +
        panelFrameHeight / 2 +
        ")"
    });
    for (const [panelGlowStopOffset, panelGlowStopOpacity] of [
      [0, 0.32],
      [0.42, 0.09],
      [0.72, 0.05],
      [1, 0.22]
    ]) {
      appendSvgElement(panelGlowGradient, "stop", {
        offset: panelGlowStopOffset,
        "stop-color": panelGlowColor,
        "stop-opacity": Math.min(1, panelGlowStopOpacity * panelGlowStrength)
      });
    }
    const panelClipPath = appendSvgElement(panelFrameDefs, "clipPath", {
      id: panelFrameId + "-clip"
    });
    appendSvgElement(panelClipPath, "rect", {
      x: panelInset,
      y: panelInset,
      width: panelInnerWidth,
      height: panelInnerHeight,
      rx: panelCornerRadius
    });
    const panelBlurFilter = appendSvgElement(panelFrameDefs, "filter", {
      id: panelFrameId + "-blur",
      x: "-35%",
      y: "-55%",
      width: "170%",
      height: "210%"
    });
    appendSvgElement(panelBlurFilter, "feGaussianBlur", {
      stdDeviation: panelGlowBlur
    });
    if (panelFrameProperties.glowVisible !== false) {
      const panelGlowGroup = appendSvgElement(panelFrameSvg, "g", {
        "clip-path": "url(#" + panelFrameId + "-clip)"
      });
      appendSvgElement(panelGlowGroup, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "url(#" + panelFrameId + "-glass)"
      });
      if (panelGlowStrokeWidth > 0 && panelGlowStrength > 0) {
        appendSvgElement(panelGlowGroup, "rect", {
          x: panelInset,
          y: panelInset,
          width: panelInnerWidth,
          height: panelInnerHeight,
          rx: panelCornerRadius,
          fill: "none",
          stroke: "url(#" + panelFrameId + "-glow)",
          "stroke-width": panelGlowStrokeWidth,
          filter: "url(#" + panelFrameId + "-blur)"
        });
      }
    }
    if (panelFrameProperties.edgeVisible !== false) {
      appendSvgElement(panelFrameSvg, "rect", {
        x: panelInset,
        y: panelInset,
        width: panelInnerWidth,
        height: panelInnerHeight,
        rx: panelCornerRadius,
        fill: "none",
        stroke: "url(#" + panelFrameId + "-edge)",
        "stroke-width": panelEdgeWidth
      });
    }
    const panelTextLeft = clampCoercedNumber(panelFrameProperties.textLeft, -100, 200, 5.2);
    const panelTextTop = clampCoercedNumber(panelFrameProperties.textTop, -100, 200, 28);
    const panelMainTextX =
      (panelFrameWidth * clampCoercedNumber(panelFrameProperties.mainTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelMainTextY =
      (panelFrameHeight *
        clampCoercedNumber(
          panelFrameProperties.mainTextTop,
          -100,
          200,
          panelTextTop -
            (clampCoercedNumber(panelFrameProperties.lineGap, 0, 500, 24) / panelFrameHeight) * 100
        )) /
      100;
    const panelSecondaryTextX =
      (panelFrameWidth *
        clampCoercedNumber(panelFrameProperties.secondaryTextLeft, -100, 200, panelTextLeft)) /
      100;
    const panelSecondaryTextY =
      (panelFrameHeight *
        clampCoercedNumber(panelFrameProperties.secondaryTextTop, -100, 200, panelTextTop)) /
      100;
    const panelMainTextOpacity = clampCoercedNumber(panelFrameProperties.mainOpacity, 0, 1, 0.72);
    const panelSecondaryTextOpacity = clampCoercedNumber(
      panelFrameProperties.secondaryOpacity,
      0,
      1,
      0.36
    );
    if (panelFrameProperties.mainTextVisible !== false) {
      const panelMainTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelMainTextX,
        y: panelMainTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
        "fill-opacity": panelMainTextOpacity,
        "font-family": "PingFang SC,Noto Sans SC,Microsoft YaHei,sans-serif",
        "font-size": clampCoercedNumber(panelFrameProperties.mainSize, 8, 500, 30),
        "font-weight": 300,
        "letter-spacing": clampCoercedNumber(panelFrameProperties.mainSpacing, -20, 100, 2)
      });
      const panelMainTextStrokeWidth = clampCoercedNumber(panelFrameProperties.mainWeight, 0, 3, 0);
      if (panelMainTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.mainColor, "#ffffff"),
          "stroke-opacity": panelMainTextOpacity,
          "stroke-width": panelMainTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([mainTextAttributeName, mainTextAttributeValue]) =>
          panelMainTextElement.setAttribute(mainTextAttributeName, mainTextAttributeValue)
        );
      }
      panelMainTextElement.textContent = String(panelFrameProperties.mainText || "");
    }
    if (panelFrameProperties.secondaryTextVisible !== false) {
      const panelSecondaryTextElement = appendSvgElement(panelFrameSvg, "text", {
        x: panelSecondaryTextX,
        y: panelSecondaryTextY,
        "text-anchor": "start",
        fill: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
        "fill-opacity": panelSecondaryTextOpacity,
        "font-family": "Helvetica Neue,Arial,sans-serif",
        "font-size": clampCoercedNumber(panelFrameProperties.secondarySize, 6, 500, 15),
        "font-weight": 300,
        "letter-spacing": clampCoercedNumber(panelFrameProperties.secondarySpacing, -20, 100, 2.1)
      });
      const panelSecondaryTextStrokeWidth = clampCoercedNumber(
        panelFrameProperties.secondaryWeight,
        0,
        3,
        0
      );
      if (panelSecondaryTextStrokeWidth > 0) {
        Object.entries({
          stroke: resolveColor(panelFrameProperties.secondaryColor, "#ffffff"),
          "stroke-opacity": panelSecondaryTextOpacity,
          "stroke-width": panelSecondaryTextStrokeWidth,
          "paint-order": "stroke fill"
        }).forEach(([secondaryTextAttributeName, secondaryTextAttributeValue]) =>
          panelSecondaryTextElement.setAttribute(
            secondaryTextAttributeName,
            secondaryTextAttributeValue
          )
        );
      }
      panelSecondaryTextElement.textContent = String(panelFrameProperties.secondaryText || "");
    }
    return panelFrameElement;
  }
});
/**
 * 把控件尺寸换算成「内容单位」。
 *
 * 画布存在整体缩放（componentScale），同一份文档在不同屏幕上控件像素尺寸不同；
 * 内容单位是「除以缩放、再除以 100」后的相对值，控件内部按它定字号与间距，
 * 这样缩放画布时内容的相对比例保持不变。
 *
 * @param {object} unitComponent 控件对象。
 * @param {object} unitContext 渲染上下文，提供 document.canvas.componentScale。
 * @returns {{width: number, height: number}} 内容单位下的宽高。
 */
export function componentContentUnitsPx(unitComponent, unitContext) {
  const componentScale = Math.max(0.01, Number(unitContext?.document?.canvas?.componentScale || 1));
  return {
    width: Math.max(1, Number(unitComponent?.position?.width || 100)) / componentScale / 100,
    height: Math.max(1, Number(unitComponent?.position?.height || 100)) / componentScale / 100
  };
}
/**
 * 导航按钮专用内容单位：以 64.36 的设计基准高度换算，
 * 使按钮内的字号与图标在不同高度下按同一比例缩放。
 *
 * @param {object} navigationUnitComponent 控件对象。
 * @param {object} navigationUnitContext 渲染上下文。
 * @returns {number} 导航内容单位（像素）。
 */
export function navigationContentUnitPx(navigationUnitComponent, navigationUnitContext) {
  return (
    (componentContentUnitsPx(navigationUnitComponent, navigationUnitContext).height * 100) / 64.36
  );
}
// 导航按钮控件：目标页取自三个点击动作里的 navigate，其次才是 properties.targetPage；
// 高亮状态由 navigationButtonIsActive 统一判定。
registerComponent("navigation-button", {
  render(navigationComponent, navigationContext) {
    const navigationProperties = navigationComponent.properties || {};
    const navigationButtonTargetPage =
      ["tap", "doubleTap", "hold"]
        .map(navigationActionName => navigationComponent.actions?.[navigationActionName])
        .find(navigationAction => navigationAction?.type === "navigate" && navigationAction.target)
        ?.target ||
      navigationProperties.targetPage ||
      "";
    const navigationBindingEntityId = navigationComponent.bindings?.entity?.entityId || "";
    const navigationButtonPreviewState =
      navigationContext.editable && ["off", "on"].includes(navigationContext.previewState)
        ? navigationContext.previewState
        : "auto";
    const isNavigationTargetEntityActive =
      !!navigationBindingEntityId &&
      !!isComponentEntityActive(
        navigationComponent,
        navigationBindingEntityId,
        navigationContext.states?.get(navigationBindingEntityId),
        navigationContext
      );
    const isNavigationButtonActive = navigationButtonIsActive({
      targetPage: navigationButtonTargetPage,
      currentPagePath: navigationContext.page?.path || "",
      entityId: navigationBindingEntityId,
      entityActive: isNavigationTargetEntityActive,
      previewState: navigationButtonPreviewState
    });
    const navigationTextOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? (navigationProperties.textActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.textIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationIconOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? (navigationProperties.iconActiveOpacity ?? navigationProperties.activeOpacity)
        : (navigationProperties.iconIdleOpacity ?? navigationProperties.idleOpacity),
      0,
      1,
      isNavigationButtonActive ? 0.96 : 0.3
    );
    const navigationButtonFrameOpacity = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.frameActiveOpacity
        : navigationProperties.frameIdleOpacity,
      0,
      1,
      isNavigationButtonActive ? 0.98 : 0.48
    );
    const navigationButtonGlowStrength = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveStrength
        : navigationProperties.glowIdleStrength,
      0,
      5,
      isNavigationButtonActive ? 2.2 : 0.5
    );
    const navigationButtonGlowSize = clampCoercedNumber(
      isNavigationButtonActive
        ? navigationProperties.glowActiveSize
        : navigationProperties.glowIdleSize,
      0,
      3,
      isNavigationButtonActive ? 3 : 1.5
    );
    const navigationMainColor = resolveColor(navigationProperties.mainColor, "#e9edf0");
    const navigationSecondaryColor = resolveColor(navigationProperties.secondaryColor, "#e9edf0");
    const navigationLineHeightRatio = 100 / 64.36;
    const navigationUnitPx = navigationContentUnitPx(navigationComponent, navigationContext);
    const navigationTextLeft = clampCoercedNumber(navigationProperties.textLeft, -100, 200, 27.5);
    const navigationTextTop = clampCoercedNumber(navigationProperties.textTop, -100, 200, 81.5);
    const navigationMainLeft = clampCoercedNumber(
      navigationProperties.mainTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationMainTop = clampCoercedNumber(
      navigationProperties.mainTextTop,
      -100,
      200,
      navigationTextTop - navigationLineHeightRatio * 18
    );
    const navigationSecondaryLeft = clampCoercedNumber(
      navigationProperties.secondaryTextLeft,
      -100,
      200,
      navigationTextLeft
    );
    const navigationSecondaryTop = clampCoercedNumber(
      navigationProperties.secondaryTextTop,
      -100,
      200,
      navigationTextTop
    );
    const navigationElement = document.createElement("div");
    navigationElement.className =
      "hb-navigation-button" + (isNavigationButtonActive ? " active" : "");
    navigationElement.dataset.targetPage = navigationButtonTargetPage;
    navigationElement.style.setProperty("--navigation-text-opacity", String(navigationTextOpacity));
    navigationElement.style.setProperty("--navigation-icon-opacity", String(navigationIconOpacity));
    navigationElement.style.setProperty(
      "--navigation-icon-size",
      clampCoercedNumber(navigationProperties.iconSize, 1, 500, 50) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-left",
      clampCoercedNumber(navigationProperties.iconLeft, -100, 200, 14) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-icon-top",
      clampCoercedNumber(navigationProperties.iconTop, -100, 200, 50) + "%"
    );
    navigationElement.style.setProperty(
      "--navigation-main-size",
      clampCoercedNumber(navigationProperties.mainSize, 1, 500, 30) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-size",
      clampCoercedNumber(navigationProperties.secondarySize, 1, 500, 11) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-main-spacing",
      clampCoercedNumber(navigationProperties.mainSpacing, -20, 100, 8) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty(
      "--navigation-secondary-spacing",
      clampCoercedNumber(navigationProperties.secondarySpacing, -20, 100, 3) * navigationUnitPx + "px"
    );
    navigationElement.style.setProperty("--navigation-main-left", navigationMainLeft + "%");
    navigationElement.style.setProperty(
      "--navigation-secondary-left",
      navigationSecondaryLeft + "%"
    );
    navigationElement.style.setProperty("--navigation-main-top", navigationMainTop + "%");
    navigationElement.style.setProperty("--navigation-secondary-top", navigationSecondaryTop + "%");
    if (navigationProperties.glowVisible !== false || navigationProperties.frameVisible !== false) {
      navigationElement.append(
        buildNavigationEffects(
          navigationComponent,
          navigationProperties,
          isNavigationButtonActive,
          navigationButtonFrameOpacity,
          navigationButtonGlowStrength,
          navigationButtonGlowSize
        )
      );
    }
    if (navigationProperties.iconVisible !== false) {
      const navigationIconSource = resolveIconUrl(
        navigationProperties.icon || "mdi:home-lightbulb-outline"
      );
      if (navigationIconSource) {
        const navigationIconElement = document.createElement("i");
        navigationIconElement.className = "hb-navigation-icon";
        navigationIconElement.setAttribute("aria-hidden", "true");
        navigationIconElement.style.backgroundColor = resolveColor(
          navigationProperties.iconColor,
          "#e9edf0"
        );
        navigationIconElement.style.maskImage = 'url("' + navigationIconSource + '")';
        navigationIconElement.style.webkitMaskImage = 'url("' + navigationIconSource + '")';
        navigationElement.append(navigationIconElement);
      }
    }
    const navigationTextElement = document.createElement("span");
    navigationTextElement.className = "hb-navigation-text";
    if (navigationProperties.mainTextVisible !== false) {
      const navigationMainTextElement = document.createElement("strong");
      navigationMainTextElement.textContent = navigationProperties.mainText || "页面导航";
      navigationMainTextElement.style.color = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeColor = navigationMainColor;
      navigationMainTextElement.style.webkitTextStrokeWidth =
        clampCoercedNumber(navigationProperties.mainWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationMainTextElement);
    }
    if (navigationProperties.secondaryTextVisible !== false) {
      const navigationSecondaryTextElement = document.createElement("small");
      navigationSecondaryTextElement.textContent =
        navigationProperties.secondaryText || "NAVIGATION";
      navigationSecondaryTextElement.style.color = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeColor = navigationSecondaryColor;
      navigationSecondaryTextElement.style.webkitTextStrokeWidth =
        clampCoercedNumber(navigationProperties.secondaryWeight, 0, 3, 0) * navigationUnitPx + "px";
      navigationTextElement.append(navigationSecondaryTextElement);
    }
    if (navigationTextElement.childElementCount) {
      navigationElement.append(navigationTextElement);
    }
    return navigationElement;
  }
});
