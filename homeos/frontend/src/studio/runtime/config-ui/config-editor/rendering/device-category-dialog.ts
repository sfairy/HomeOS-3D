import {
  GENERIC_DEVICE_KINDS,
  genericDeviceProfile,
} from "../../../device/generic-device-catalog";

/**
 * 设备类别弹窗（0.7.8）：
 * - 分组展示「常用设备 / 家用电器 / 其他设备」，每项带 MDI 图标；
 * - 触发控件是按钮（`aria-haspopup=dialog`），不再用原生 `<select>`；
 * - 由 `GENERIC_DEVICE_KINDS` 兜底，未列出的型号自动归入「其他设备」。
 */

interface CategoryProfile {
  label: string;
  icon: string;
}

const FIXED_DEVICE_CATEGORIES: Readonly<Record<string, CategoryProfile>> = Object.freeze({
  nas: Object.freeze({ label: "NAS", icon: "mdi:nas" }),
  television: Object.freeze({ label: "电视", icon: "mdi:television" }),
  speaker: Object.freeze({ label: "智能音响", icon: "mdi:speaker" }),
  "water-heater": Object.freeze({ label: "热水器", icon: "mdi:water-boiler" }),
  airer: Object.freeze({ label: "晾衣架", icon: "mdi:hanger" }),
});

/** 兜底分组名；静态分组与未分组型号都必须落回同一个分组，避免弹窗里出现两个同名分区。 */
const OTHER_DEVICE_GROUP_LABEL = "其他设备";

const DEVICE_CATEGORY_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = Object.freeze([
  ["常用设备", ["nas", "television", "speaker", "router", "home-network-cabinet", "smart-socket-86"]],
  [
    "家用电器",
    [
      "water-heater",
      "airer",
      "fridge",
      "dishwasher",
      "washer",
      "dryer",
      "rangehood",
      "water-purifier",
      "ricecooker",
      "steamoven",
      "air-fryer",
      "humidifier",
      "aroma-diffuser",
      "pressure-cooker",
      "disinfection-cabinet",
      "tea_bar_machine",
      "pipelinewaterpurifier",
      "juicer",
      "bread-maker",
      "power-blender",
      "microwave",
      "coffee-machine",
      "toilet",
    ],
  ],
  [
    OTHER_DEVICE_GROUP_LABEL,
    [
      "smallcar",
      "plant",
      "bed",
      "sofa",
      "computer",
      "printer",
      "3d-printer",
      "pet-feeder",
      "pet-fountain",
      "pet-dryer",
    ],
  ],
] as ReadonlyArray<readonly [string, readonly string[]]>);

const MDI_SVG_ROOT = "/static/vendor/mdi/7.4.47/svg/";

function resolveDeviceCategoryProfile(deviceKind: any): CategoryProfile {
  const fixedProfile = FIXED_DEVICE_CATEGORIES[deviceKind];
  if (fixedProfile) return fixedProfile;
  const genericProfile = genericDeviceProfile(deviceKind);
  return genericProfile
    ? { label: genericProfile.label, icon: genericProfile.icon }
    : { label: String(deviceKind ?? ""), icon: "" };
}

/** 返回 `[分组名, 型号列表]`；过滤掉不存在的型号，未分组型号补进「其他设备」。 */
function deviceCategoryGroups(): Array<[string, string[]]> {
  const groupedKinds = new Set<string>(),
    groups = DEVICE_CATEGORY_GROUPS.map(
      ([groupLabel, groupKinds]) =>
        [
          groupLabel,
          groupKinds.filter((deviceKind) => {
            if (!FIXED_DEVICE_CATEGORIES[deviceKind] && !genericDeviceProfile(deviceKind))
              return false;
            groupedKinds.add(deviceKind);
            return true;
          }),
        ] as [string, string[]],
    ).filter(([, groupKinds]) => groupKinds.length),
    leftoverKinds = ["nas", "television", "speaker", "water-heater", "airer", ...GENERIC_DEVICE_KINDS].filter(
      (deviceKind) => !groupedKinds.has(deviceKind),
    );
  if (leftoverKinds.length) {
    // 合并进静态的「其他设备」分组，而不是再 push 一个同名分组——
    // 否则弹窗里会出现两个「其他设备」标题（未分组型号如 sofa 会被单独成组）。
    const otherDeviceGroup = groups.find(([groupLabel]) => groupLabel === OTHER_DEVICE_GROUP_LABEL);
    if (otherDeviceGroup) otherDeviceGroup[1].push(...new Set(leftoverKinds));
    else groups.push([OTHER_DEVICE_GROUP_LABEL, [...new Set(leftoverKinds)]]);
  }
  return groups;
}

const categoryDialogByEditor = new WeakMap<object, any>();

function closeDeviceCategoryDialog(editor: any) {
  const categoryDialog = categoryDialogByEditor.get(editor);
  if (!categoryDialog) return;
  categoryDialog.close?.();
  categoryDialog.remove?.();
  categoryDialogByEditor.delete(editor);
}

/** 打开设备类别弹窗；`onPick` 在选中后回调（不含「取消」）。 */
function openDeviceCategoryDialog(editor: any, currentKind: any, onPick?: (kind: any) => void) {
  if (categoryDialogByEditor.get(editor)) return;
  const categoryDialogElement = editor.createElement(
    "dialog",
    "settings-dialog i3d-device-category-dialog",
  );
  categoryDialogByEditor.set(editor, categoryDialogElement);
  categoryDialogElement.setAttribute("aria-label", "选择设备类别");

  const headingElement = editor.createElement("div", "dialog-heading"),
    headingTitleElement = editor.createElement("div");
  headingTitleElement.append(
    editor.createElement("span", "", "DEVICE CATEGORY"),
    editor.createElement("h2", "", "选择设备类别"),
  );
  const closeButton = editor.createButton("×", closeDeviceCategoryDialog.bind(null, editor));
  (closeButton.className = "icon-button"),
    closeButton.setAttribute("aria-label", "关闭设备类别选择"),
    headingElement.append(headingTitleElement, closeButton);

  const dialogBodyElement = editor.createElement("div", "i3d-device-category-dialog-body"),
    groupsElement = editor.createElement("div", "i3d-device-category-groups");
  dialogBodyElement.append(groupsElement);
  categoryDialogElement.append(headingElement, dialogBodyElement);
  // 与同目录其他弹窗一致：节点由 `editor.createElement`（= 当前模块 document）创建，
  // 所以必须挂回同一份 document。`editor.documentApi` 是宿主传入的页面文档句柄，
  // 不是模块内的 document，直接取其 `.body` 会得到 undefined。
  document.body.append(categoryDialogElement);
  categoryDialogElement.addEventListener("cancel", (categoryDialogEvent: any) => {
    (categoryDialogEvent.preventDefault(), closeDeviceCategoryDialog(editor));
  });
  categoryDialogElement.showModal();

  for (const [groupLabel, groupKinds] of deviceCategoryGroups()) {
    const groupElement = editor.createElement("section", "i3d-device-category-group");
    groupElement.append(editor.createElement("h3", "", groupLabel));
    const optionsElement = editor.createElement("div", "i3d-device-category-options");
    for (const deviceKind of groupKinds) {
      const categoryProfile = resolveDeviceCategoryProfile(deviceKind),
        optionButton = editor.createButton("", () => {
          if (categoryDialogByEditor.get(editor) !== categoryDialogElement) return;
          (closeDeviceCategoryDialog(editor), onPick?.(deviceKind));
        });
      optionButton.className =
        "i3d-device-category-option" + (deviceKind === currentKind ? " is-selected" : "");
      optionButton.setAttribute("data-device-category", deviceKind);
      optionButton.setAttribute("aria-pressed", String(deviceKind === currentKind));
      optionButton.setAttribute("aria-label", categoryProfile.label);
      const iconElement = editor.createElement("i", "i3d-device-category-icon");
      iconElement.setAttribute("aria-hidden", "true");
      if (categoryProfile.icon?.startsWith("mdi:")) {
        const maskUrl = "url('" + MDI_SVG_ROOT + categoryProfile.icon.slice(4) + ".svg')";
        iconElement.style.maskImage = maskUrl;
        iconElement.style.webkitMaskImage = maskUrl;
      }
      optionButton.append(
        iconElement,
        editor.createElement("span", "i3d-device-category-option-label", categoryProfile.label),
      );
      deviceKind === currentKind &&
        optionButton.append(editor.createElement("span", "i3d-device-category-option-current", "当前"));
      optionsElement.append(optionButton);
    }
    (groupElement.append(optionsElement), groupsElement.append(groupElement));
  }
}

/** 配置行：显示当前类别名称的按钮，点击打开类别弹窗。 */
export function createDeviceCategoryRow(
  editor: any,
  rowContainer: any,
  rowLabel: any,
  currentKind: any,
  onPick: (kind: any) => void,
  createSettingRow: (container: any, label: any, control: any) => any,
) {
  const categoryLabel = resolveDeviceCategoryProfile(currentKind).label,
    categoryButton = editor.createButton("", () =>
      openDeviceCategoryDialog(editor, currentKind, onPick),
    );
  return (
    (categoryButton.className = "i3d-picker-button"),
    categoryButton.append(editor.createElement("span", "", categoryLabel)),
    (categoryButton.title = categoryLabel || ""),
    categoryButton.setAttribute("aria-haspopup", "dialog"),
    categoryButton.setAttribute("aria-label", rowLabel),
    createSettingRow(rowContainer, rowLabel, categoryButton)
  );
}
