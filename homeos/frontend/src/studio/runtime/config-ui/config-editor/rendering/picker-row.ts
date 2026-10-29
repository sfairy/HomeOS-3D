/**
 * 配置面板「列表型」下拉 → 弹窗触发器（上游 0.8.1 `v516` / `v285`）。
 *
 * 为什么改：设备 / 模型 / 类别这类列表动辄几十项，`<select>` 在 3D 舞台的窄面板里既看不清
 * 户型备注，也没法标「已配置 / 缺失 / 当前关联」。0.8.1 把它们统一换成
 * `openConfigurationPicker` 弹窗，原生 `<select>` 只留给 2-5 项的短枚举
 * （设备类型、开合方向、帘布类型、弹窗布局…），本模块的触发器与上游 `v516` 等价：
 * `<label><span>标签</span><button class="i3d-picker-button" aria-haspopup="dialog">当前值</button></label>`。
 */

import { genericDeviceProfile } from "../../../device/generic-device-catalog";
import {
  configurationProgress,
  type ConfigurationProgress,
} from "../../configuration-progress";
import { openConfigurationPicker } from "../../configuration-picker";
import { deviceCategoryGroups, resolveDeviceCategoryProfile } from "./device-category-choices";

/** 环境类别：保留原生下拉的顺序与文案，改由弹窗选择器渲染。 */
export const ENVIRONMENT_CATEGORY_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["climate", "空调/浴霸"],
  ["cover", "窗帘"],
  ["fan", "风扇 / 吊扇"],
  ["exhaust-fan", "排气扇"],
  ["purifier", "空气净化器"],
  ["temperature-humidity", "环境标签"],
];

/** 面板/泳道里的条目与模型：只声明本模块读到的字段，避免类型退化成宽松记录。 */
interface PickerRecord {
  id?: string | number;
  label?: string;
  icon?: string;
  name?: string;
  modelId?: string;
  floorId?: string;
}

/** `editorHost` 在本模块用到的面（配置编辑器上下文对象）。 */
interface PickerEditorHost {
  createElement: (tagName: string, className?: string, textContent?: string) => HTMLElement;
  deviceKind: string;
  isDisposed: boolean;
  isAccessAllowed: boolean;
  pickerGeneration: number;
  pickerHandle: { close(): void } | null;
  editorDialogElement: { ownerDocument: Document };
  floorSelection: string;
  sceneMetadata?: {
    floors?: ReadonlyArray<Record<string, unknown>>;
    environment?: Record<string, unknown>;
  } | null;
  structuredClone2?: {
    devices?: Record<string, unknown>;
    environment?: Record<string, unknown>;
  } | null;
  getItemList: () => ReadonlyArray<PickerRecord>;
}

export interface PickerRowOptions {
  /** 行容器（`createSettingRow` 会往里 append）。 */
  rowContainer: unknown;
  /** 行标签（也会写进按钮的 `aria-label`）。 */
  rowLabel: string;
  /** 按钮上显示的当前值。 */
  currentLabel: string;
  /** 无可选项时禁用（上游 `v911.disabled = !v910.length`）。 */
  disabled?: boolean;
  /** 点击按钮；入参是按钮本身（定位/焦点恢复用）。 */
  onOpen: (triggerButton: HTMLElement) => void;
}

/** 把 `editorHost` / `createSettingRow` 收进闭包，调用点只留「容器 + 标签 + 当前值 + 回调」。 */
export function bindPickerRow(
  editorHost: { createElement: PickerEditorHost["createElement"] },
  createSettingRow: (rowContainer: unknown, rowLabel: string, rowControl: unknown) => unknown,
): (options: PickerRowOptions) => unknown {
  return ({ rowContainer, rowLabel, currentLabel, disabled = false, onOpen }: PickerRowOptions) => {
    const triggerButton = editorHost.createElement("button") as HTMLButtonElement;
    return (
      (triggerButton.type = "button"),
      (triggerButton.className = "i3d-picker-button"),
      triggerButton.setAttribute("aria-haspopup", "dialog"),
      triggerButton.setAttribute("aria-label", rowLabel),
      (triggerButton.title = currentLabel || ""),
      (triggerButton.disabled = disabled),
      triggerButton.append(editorHost.createElement("span", "", currentLabel)),
      triggerButton.addEventListener("click", () => {
        if (triggerButton.disabled) return;
        onOpen(triggerButton);
      }),
      createSettingRow(rowContainer, rowLabel, triggerButton)
    );
  };
}

/**
 * 型号 → 场景集合键（`panel-assembly` 里 `editorHost.collectionKey` 的同款映射）。
 * 用来给「设备类别 / 环境类别」每一项算配置进度：进度要按**目标类别**的模型库算，
 * 不能拿当前会话的 `collectionKey` 顶替。
 */
export function deviceKindCollectionKey(deviceKind: string): string {
  if (deviceKind === "airer") return "airers";
  if (deviceKind === "speaker") return "speakers";
  const genericProfile = genericDeviceProfile(deviceKind);
  if (genericProfile) return genericProfile.collection;
  if (deviceKind === "temperature-humidity") return "temperatureHumidity";
  if (deviceKind === "vacuum" || deviceKind === "vacuum-shortcut") return "vacuums";
  if (deviceKind === "television") return "televisions";
  if (deviceKind === "nas") return "nas";
  if (deviceKind === "cover") return "curtains";
  if (deviceKind === "water-heater") return "waterHeaters";
  if (deviceKind === "fan") return "fans";
  if (deviceKind === "exhaust-fan") return "exhaustFans";
  if (deviceKind === "purifier") return "airPurifiers";
  return "airConditioners";
}

/** 环境标签不需要选模型（上游 `requiresModel: kind !== 'temperature-humidity'`）。 */
export function deviceKindRequiresModel(deviceKind: string): boolean {
  return deviceKind !== "temperature-humidity";
}

/** 目标类别的模型库是否落在 `scene.environment` 而不是 `scene.devices`。 */
function deviceKindUsesEnvironment(deviceKind: string): boolean {
  return [
    "climate",
    "fan",
    "exhaust-fan",
    "purifier",
    "cover",
    "temperature-humidity",
  ].includes(deviceKind);
}

function asRecordList(value: unknown): ReadonlyArray<PickerRecord> {
  return Array.isArray(value) ? (value as ReadonlyArray<PickerRecord>) : [];
}

/**
 * 目标类别的配置进度（上游 `v446`）：模型库取当前楼层的对应集合，
 * 已配置取**该类别在草稿里的集合**。灯组 / 环境标签按「已配置数」统计。
 */
export function kindConfigurationProgress(
  editorHost: PickerEditorHost,
  deviceKind: string,
): ConfigurationProgress {
  const floorRecords = editorHost.sceneMetadata?.floors ?? [],
    floorSelection = editorHost.floorSelection,
    targetFloor =
      floorSelection && floorSelection !== "all"
        ? floorRecords.find((floorRecord) => floorRecord.id === floorSelection)
        : floorRecords[0],
    requiresModel = deviceKindRequiresModel(deviceKind),
    collectionKey = deviceKindCollectionKey(deviceKind),
    environmentSide =
      deviceKindUsesEnvironment(deviceKind) || collectionKey === "airConditioners"
        ? editorHost.sceneMetadata?.environment
        : undefined,
    planSide = targetFloor?.plan as Record<string, unknown> | undefined,
    modelList = targetFloor
      ? asRecordList(
          targetFloor[collectionKey] ?? environmentSide?.[collectionKey] ?? planSide?.[collectionKey],
        )
      : [],
    // 进度要按**目标类别自己的集合**统计：拿当前会话的 `getItemList()` 会把别的类别的
    // 条目算成「模型缺失」，进而让所有类别都显示缺失。
    configurationDraft = editorHost.structuredClone2,
    draftBindings = configurationDraft?.environment?.[collectionKey] ?? configurationDraft?.devices?.[collectionKey],
    kindBindings = draftBindings
      ? asRecordList(draftBindings)
      : editorHost.deviceKind === deviceKind
        ? editorHost.getItemList()
        : [];
  return configurationProgress({
    ready: Boolean(targetFloor),
    requiresModel,
    models: requiresModel ? modelList : [],
    bindings: kindBindings,
    modelKey: (model) => model?.id,
    bindingKey: (binding) => (binding?.floorId === targetFloor?.id && requiresModel ? binding?.modelId : ""),
  });
}

/**
 * 设备类别 / 环境类别选择器（上游 `v386`）。每一项带该类别在当前楼层的配置进度，
 * 没有模型也没有条目的类别直接禁用，避免点进空配置。
 */
export function openDeviceCategoryPicker(
  editorHost: PickerEditorHost,
  {
    environmentCategory,
    onPicked,
  }: {
    environmentCategory: boolean;
    onPicked: (deviceKind: string) => void;
  },
): void {
  const categorySections = environmentCategory
    ? [
        {
          label: undefined,
          options: ENVIRONMENT_CATEGORY_LABELS.map(([kind, label]) => ({ kind, label, icon: "" })),
        },
      ]
    : deviceCategoryGroups().map(([groupLabel, groupKinds]) => ({
        label: groupLabel,
        options: groupKinds.map((kind) => {
          const categoryProfile = resolveDeviceCategoryProfile(kind);
          return { kind, label: categoryProfile.label, icon: categoryProfile.icon };
        }),
      })),
    pickerGeneration = ++editorHost.pickerGeneration;
  editorHost.pickerHandle?.close();
  const pickerHandle = openConfigurationPicker({
    document: editorHost.editorDialogElement.ownerDocument,
    title: environmentCategory ? "选择环境类别" : "选择设备类别",
    kicker: environmentCategory ? "ENVIRONMENT CATEGORY" : "DEVICE CATEGORY",
    unit: "模型",
    // 上游 `v386`：类别页要说明「已配置/未配置」的含义，否则用户不知道点进去会怎样。
    description:
      "当前楼层：" +
      (String(
        (
          (editorHost.sceneMetadata?.floors || []) as ReadonlyArray<Record<string, unknown>>
        ).find((floorProbe) => floorProbe.id === editorHost.floorSelection)?.name ?? "",
      ).trim() || "未知楼层") +
      "。已配置表示已添加到 3D 交互，未配置表示尚未添加。",
    selectedId: editorHost.deviceKind,
    emptyMessage: "当前楼层没有可选类别。",
    sections: categorySections.map((categorySection) => ({
      label: categorySection.label,
      options: categorySection.options.map((categoryChoice) => {
        const categoryProgress = kindConfigurationProgress(editorHost, categoryChoice.kind);
        return {
          id: categoryChoice.kind,
          label: categoryChoice.label,
          icon: categoryChoice.icon,
          wrapLabel: true,
          progress: categoryProgress,
          disabled: categoryProgress.disabled,
        };
      }),
    })),
    async onSelect(pickedDeviceCategory: string) {
      if (
        editorHost.isDisposed ||
        !editorHost.isAccessAllowed ||
        pickerGeneration !== editorHost.pickerGeneration
      )
        throw new Error("该配置已变更，请重新选择。");
      pickedDeviceCategory !== editorHost.deviceKind && onPicked(pickedDeviceCategory);
    },
    onClose() {
      editorHost.pickerHandle === pickerHandle && (editorHost.pickerHandle = null);
    },
  });
  editorHost.isDisposed || !editorHost.isAccessAllowed || pickerGeneration !== editorHost.pickerGeneration
    ? pickerHandle.close()
    : (editorHost.pickerHandle = pickerHandle);
}
