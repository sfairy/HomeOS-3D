/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { clamp } from "../plan/geometry.js";
import { finite } from "../loaders/studio-normalization.js";
import {
  globalWallHeightInput,
  globalWallOpacityInput,
  globalWallThicknessInput,
  renderInspector
} from "./studio-ui-refresh.js";
import { state } from "./studio-state.js";
import { markDocumentDirty } from "./studio-document-save.js";
import { renderPlanView } from "./studio-plan-draw.js";
import { pushHistorySnapshot } from "./studio-camera-mode.js";
import {
  beginExportRender,
  endExportRender
} from "./studio-plan-interaction.js";
import { syncControlValue } from "./ui-controls.js";
import { applySceneRefresh } from "./studio-render-pipeline.js";
import { selectElement } from "./studio-plan-render.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import {
  ITEM_TYPE_DEFINITIONS,
  LIGHT_FIELD_CONFIG
} from "./studio-config-tables.js";
import { maxLightAngleForType } from "./studio-scene-normalize.js";

export const lightPropertyTargetListElement = selectElement("#light-property-target-list");

export const lightPropertySelectionCountElement = selectElement("#light-property-selection-count");

export const lightPropertyToggleAllButton = selectElement("#light-property-toggle-all");

/**
 * 把灯光属性的原始输入夹到合法区间并归一精度。中文界面传入字符串且用户可输任意
 */
export function sanitizeLightFieldValue(lightFieldKey: any, rawValue: any, lightingItemType: any) {
  if (lightFieldKey === "lightTemperature") {
    return Math.round(clamp(finite(rawValue, 3000), 2200, 6500));
  } else if (lightFieldKey === "lightBrightness") {
    return Math.round(clamp(finite(rawValue, 50), 0, 100));
  } else if (lightFieldKey === "lightRange") {
    return Math.round(clamp(finite(rawValue, 3.5), 0.5, 10) * 10) / 10;
  } else if (lightFieldKey === "lightAngle") {
    return Math.round(clamp(finite(rawValue, 90), 15, maxLightAngleForType(lightingItemType)));
  } else if (lightFieldKey === "elevation") {
    return Math.round(clamp(finite(rawValue, 2.7), 0, 6) * 100) / 100;
  } else {
    return finite(rawValue);
  }
}

/**
 * 按字段单位把数值格式化成界面文案。角度与百分比紧贴数字（48% / 48°），米与开尔文
 */
export function formatLightFieldValue(formattedFieldKey: any, value: any) {
  const fieldConfig = (LIGHT_FIELD_CONFIG as any)[formattedFieldKey];
  if (!fieldConfig) {
    return String(value);
  }
  const formattedValue = ["lightRange", "elevation"].includes(formattedFieldKey)
    ? Number(value).toFixed(formattedFieldKey === "elevation" ? 2 : 1)
    : Math.round(value);
  if (["%", "°"].includes(fieldConfig.unit)) {
    return "" + formattedValue + fieldConfig.unit;
  } else {
    return formattedValue + " " + fieldConfig.unit;
  }
}

/**
 * @param {HTMLInputElement} input 触发编辑的墙高 / 墙厚 / 墙不透明度输入框。
 */
export function beginWallSettingEdit(input: any) {
  if (state.activeWallSettingInput && state.activeWallSettingInput !== input) {
    commitWallSettingInput();
  }
  if (!state.activeWallSettingInput) {
    pushHistorySnapshot();
    state.activeWallSettingInput = input;
    beginExportRender();
  }
}

/**
 * @returns {void} 无返回值。
 */
export function scheduleOverlayRedraw() {
  state.overlayRedrawFrame ||= requestAnimationFrame(() => {
    state.overlayRedrawFrame = 0;
    renderPlanView();
  });
}

/**
 * 结束全局墙参数编辑：回填输入框显示值、刷新检查器与整场景，并解除导出渲染挂起。
 * @returns {void} 无返回值。
 */
export function commitWallSettingInput() {
  window.clearTimeout(state.wallSettingCommitTimer);
  state.wallSettingCommitTimer = null;
  if (state.activeWallSettingInput) {
    state.activeWallSettingInput = null;
    syncControlValue(globalWallHeightInput, state.activeScene.settings.wallHeight.toFixed(2));
    syncControlValue(globalWallThicknessInput, state.activeScene.settings.wallThickness.toFixed(2));
    syncControlValue(globalWallOpacityInput, Math.round(state.activeScene.settings.wallOpacity * 100));
    renderInspector();
    applySceneRefresh({
      scope: "all"
    });
    endExportRender();
  }
}

/**
 * 把「全局墙厚」输入框的值写到场景设置与所有墙体，并同步平面视图重绘。
 * @returns {void} 无返回值。
 */
export function applyGlobalWallThickness() {
  const nextWallThickness = clamp(
    finite(globalWallThicknessInput.value, state.activeScene.settings.wallThickness),
    0.01,
    3
  );
  if (
    !(Math.abs(nextWallThickness - state.activeScene.settings.wallThickness) < 1e-8) ||
    !state.activeScene.walls.every(
      (thicknessWall: any) => Math.abs(thicknessWall.thickness - nextWallThickness) < 1e-8
    )
  ) {
    beginWallSettingEdit(globalWallThicknessInput);
    state.activeScene.settings.wallThickness = nextWallThickness;
    for (const thicknessTargetWall of state.activeScene.walls) {
      thicknessTargetWall.thickness = nextWallThickness;
    }
    scheduleOverlayRedraw();
    markDocumentDirty();
  }
}

/**
 * @returns {Array<HTMLInputElement>} 勾选框数组（可能为空）。
 */
export function collectLightTargetItems(lightTargetScopeElement = lightPropertyTargetListElement) {
  return [...lightTargetScopeElement.querySelectorAll("[data-light-target-item-id]")];
}

export function syncLightTargetSelection() {
  const lightTargetItemElements = collectLightTargetItems();
  const checkedLightTargetCount = lightTargetItemElements.filter(
    lightTargetItemElement => lightTargetItemElement.checked
  ).length;
  lightPropertySelectionCountElement.textContent =
    checkedLightTargetCount + "/" + lightTargetItemElements.length + " 灯";
  lightPropertyToggleAllButton.disabled = !lightTargetItemElements.length;
  lightPropertyToggleAllButton.textContent =
    lightTargetItemElements.length && checkedLightTargetCount === lightTargetItemElements.length
      ? "取消全选"
      : "全选";
  for (const lightGroupSectionElement of lightPropertyTargetListElement.querySelectorAll(
    "[data-light-target-group-id]"
  )) {
    const lightGroupItemElements = collectLightTargetItems(lightGroupSectionElement);
    const lightGroupCheckedCount = lightGroupItemElements.filter(
      lightGroupItemElement => lightGroupItemElement.checked
    ).length;
    lightGroupSectionElement.querySelector("[data-light-target-group-count]").textContent =
      lightGroupCheckedCount + "/" + lightGroupItemElements.length + " 灯";
    lightGroupSectionElement.querySelector("[data-light-target-group-toggle]").textContent =
      lightGroupItemElements.length && lightGroupCheckedCount === lightGroupItemElements.length
        ? "取消全选"
        : "全选";
  }
}

export function renderLightPropertyTargets(lightPropertyFieldKey: any) {
  lightPropertyTargetListElement.replaceChildren();
  let renderedLightCount = 0;
  for (const lightTargetGroup of state.activeScene.lightGroups) {
    const lightTargetGroupItems = state.activeScene.items.filter(
      (lightTargetGroupItem: any) =>
        LIGHT_ITEM_TYPES.has(lightTargetGroupItem.type) &&
        lightTargetGroupItem.lightGroupId === lightTargetGroup.id
    );
    if (!lightTargetGroupItems.length) {
      continue;
    }
    renderedLightCount += lightTargetGroupItems.length;
    const createdLightGroupSection = document.createElement("section");
    createdLightGroupSection.className = "light-property-target-group";
    createdLightGroupSection.dataset.lightTargetGroupId = lightTargetGroup.id;
    const lightGroupHeaderElement = document.createElement("header");
    const lightGroupNameElement = document.createElement("strong");
    lightGroupNameElement.textContent = lightTargetGroup.name;
    const lightGroupCountElement = document.createElement("span");
    lightGroupCountElement.dataset.lightTargetGroupCount = "";
    const lightGroupToggleButton = document.createElement("button");
    lightGroupToggleButton.type = "button";
    lightGroupToggleButton.dataset.lightTargetGroupToggle = "";
    lightGroupToggleButton.textContent = "取消全选";
    lightGroupHeaderElement.append(
      lightGroupNameElement,
      lightGroupCountElement,
      lightGroupToggleButton
    );
    const lightTargetGridElement = document.createElement("div");
    lightTargetGridElement.className = "light-property-target-grid";
    const lightCountsByItemType = new Map();
    for (const listedLightItem of lightTargetGroupItems) {
      lightCountsByItemType.set(
        listedLightItem.type,
        (lightCountsByItemType.get(listedLightItem.type) || 0) + 1
      );
    }
    const lightOrdinalsByItemType = new Map();
    for (const listedLightEntry of lightTargetGroupItems) {
      const listedLightDefinition =
        (ITEM_TYPE_DEFINITIONS as any)[listedLightEntry.type] || ITEM_TYPE_DEFINITIONS.downlight;
      // 同一类型内的第几盏灯，用于「筒灯 2」这样的显示名。
      const listedLightOrdinal = (lightOrdinalsByItemType.get(listedLightEntry.type) || 0) + 1;
      lightOrdinalsByItemType.set(listedLightEntry.type, listedLightOrdinal);
      const lightTargetLabelElement = document.createElement("label");
      lightTargetLabelElement.className = "light-property-target-item";
      const lightTargetCheckboxElement = document.createElement("input");
      lightTargetCheckboxElement.type = "checkbox";
      lightTargetCheckboxElement.checked = true;
      lightTargetCheckboxElement.dataset.lightTargetItemId = listedLightEntry.id;
      const lightTargetTextElement = document.createElement("span");
      const lightTargetNameElement = document.createElement("strong");
      lightTargetNameElement.textContent =
        lightCountsByItemType.get(listedLightEntry.type) > 1
          ? listedLightDefinition.name + " " + listedLightOrdinal
          : listedLightDefinition.name;
      const lightTargetValueElement = document.createElement("small");
      const sanitizedLightFieldValue = sanitizeLightFieldValue(
        lightPropertyFieldKey,
        listedLightEntry[lightPropertyFieldKey],
        listedLightEntry.type
      );
      lightTargetValueElement.textContent =
        (listedLightEntry.id === state.primarySelection?.id ? "当前灯 · " : "") +
        "当前 " +
        formatLightFieldValue(lightPropertyFieldKey, sanitizedLightFieldValue);
      lightTargetTextElement.append(lightTargetNameElement, lightTargetValueElement);
      lightTargetLabelElement.append(lightTargetCheckboxElement, lightTargetTextElement);
      lightTargetGridElement.append(lightTargetLabelElement);
    }
    createdLightGroupSection.append(lightGroupHeaderElement, lightTargetGridElement);
    lightPropertyTargetListElement.append(createdLightGroupSection);
  }
  if (!renderedLightCount) {
    const emptyLightTargetsElement = document.createElement("p");
    emptyLightTargetsElement.className = "light-property-target-empty";
    emptyLightTargetsElement.textContent = "当前没有可应用的灯具。";
    lightPropertyTargetListElement.append(emptyLightTargetsElement);
  }
  syncLightTargetSelection();
}

export const wallPropertyTargetListElement = selectElement("#wall-property-target-list");

export const wallPropertySelectionCountElement = selectElement("#wall-property-selection-count");

export const wallPropertyToggleAllButton = selectElement("#wall-property-toggle-all");

/**
 * 收集某个作用域内的墙面勾选框（不传则默认整份列表）。
 * @returns {Array<HTMLInputElement>} 勾选框数组（可能为空）。
 */
export function collectWallTargetCheckboxes(wallTargetScopeElement = wallPropertyTargetListElement) {
  return [...wallTargetScopeElement.querySelectorAll("[data-wall-target-item-id]")];
}

/**
 * @returns {number} 0~100 的整数百分比。
 */
export function wallEffectiveOpacityPercent(wallRecord: any) {
  const globalOpacity = finite(state.activeScene.settings.wallOpacity, 0.24);
  const customOpacity =
    wallRecord.opacity === null || wallRecord.opacity === undefined
      ? null
      : clamp(finite(wallRecord.opacity, globalOpacity), 0, 1);
  return Math.round((customOpacity === null ? globalOpacity : customOpacity) * 100);
}

/**
 * @returns {string} 展示用文案。
 */
export function wallPropertyCurrentText(wallRecord: any, wallPropertyKey: any) {
  if (wallPropertyKey === "height") {
    return finite(wallRecord.height, 2.8).toFixed(2) + " m";
  }
  if (wallPropertyKey === "thickness") {
    return finite(wallRecord.thickness, 0.12).toFixed(2) + " m";
  }
  const hasCustomOpacity =
    wallRecord.opacity !== null &&
    wallRecord.opacity !== undefined &&
    Number.isFinite(wallRecord.opacity);
  if (wallPropertyKey === "opacityMode") {
    return hasCustomOpacity
      ? "单独设置 " + wallEffectiveOpacityPercent(wallRecord) + "%"
      : "跟随通用";
  }
  return (hasCustomOpacity ? "" : "跟随通用 ") + wallEffectiveOpacityPercent(wallRecord) + "%";
}

/**
 * 同步墙面批量对话框的选择计数与全选按钮文案。
 * @returns {void}
 */
export function syncWallTargetSelection() {
  const wallTargetCheckboxes = collectWallTargetCheckboxes();
  const checkedWallTargetCount = wallTargetCheckboxes.filter(
    wallTargetCheckbox => wallTargetCheckbox.checked
  ).length;
  wallPropertySelectionCountElement.textContent =
    checkedWallTargetCount + "/" + wallTargetCheckboxes.length + " 面墙";
  wallPropertyToggleAllButton.disabled = !wallTargetCheckboxes.length;
  wallPropertyToggleAllButton.textContent =
    wallTargetCheckboxes.length && checkedWallTargetCount === wallTargetCheckboxes.length
      ? "取消全选"
      : "全选";
}

export function renderWallPropertyTargets(wallPropertyKey: any) {
  wallPropertyTargetListElement.replaceChildren();
  const listedWalls = state.activeScene.walls || [];
  if (!listedWalls.length) {
    const emptyWallTargetsElement = document.createElement("p");
    emptyWallTargetsElement.className = "light-property-target-empty";
    emptyWallTargetsElement.textContent = "当前楼层没有可应用的墙体。";
    wallPropertyTargetListElement.append(emptyWallTargetsElement);
    syncWallTargetSelection();
    return;
  }
  const wallTargetSectionElement = document.createElement("section");
  wallTargetSectionElement.className = "light-property-target-group";
  const wallTargetGridElement = document.createElement("div");
  wallTargetGridElement.className = "light-property-target-grid";
  listedWalls.forEach((listedWall: any, listedWallOrdinal: any) => {
    const wallTargetLabelElement = document.createElement("label");
    wallTargetLabelElement.className = "light-property-target-item";
    const wallTargetCheckboxElement = document.createElement("input");
    wallTargetCheckboxElement.type = "checkbox";
    wallTargetCheckboxElement.checked = true;
    wallTargetCheckboxElement.dataset.wallTargetItemId = listedWall.id;
    const wallTargetTextElement = document.createElement("span");
    const wallTargetNameElement = document.createElement("strong");
    wallTargetNameElement.textContent = "墙体 " + (listedWallOrdinal + 1);
    const wallTargetValueElement = document.createElement("small");
    wallTargetValueElement.textContent =
      (state.primarySelection?.kind === "wall" && state.primarySelection.id === listedWall.id
        ? "当前墙 · "
        : "") +
      "当前 " +
      wallPropertyCurrentText(listedWall, wallPropertyKey);
    wallTargetTextElement.append(wallTargetNameElement, wallTargetValueElement);
    wallTargetLabelElement.append(wallTargetCheckboxElement, wallTargetTextElement);
    wallTargetGridElement.append(wallTargetLabelElement);
  });
  wallTargetSectionElement.append(wallTargetGridElement);
  wallPropertyTargetListElement.append(wallTargetSectionElement);
  syncWallTargetSelection();
}
