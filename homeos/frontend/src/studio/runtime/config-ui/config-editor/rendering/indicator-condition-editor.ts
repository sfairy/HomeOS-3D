/**
 * 指示灯条件编辑器（0.7.9 F3）：
 * - `indicatorEntitySupport`：判断实体能否作为指示灯依据、是否支持数值比较；
 * - `indicatorConditionFields`：在「设置指示灯条件」对话框里渲染判断方式 + 条件控件，
 *   并通过 `readRule()` 产出最终写入 `statusRules` 的规则对象。
 *
 * 规则有两形态：
 * - 状态匹配：`{entityId, active, inactive}`，值可以是单个状态字符串或字符串数组；
 * - 数值比较：`{entityId, kind: "numeric", active: {operator, value}, inactive: {...}}`。
 *
 * 文字与后端 `validate_device_status_rules` 一一对应，改文案时请同步后端校验。
 */

import {
  INVERSE_OPERATOR,
  NUMERIC_OPERATORS,
  deviceIndicatorChoices,
  indicatorNumber,
  numericIndicatorRuleError,
} from "../../../device/device-status";

type IndicatorFieldFactory = (rowContainer: any, rowLabel: any, rowControl: any) => any;
type IndicatorNodeFactory = (tagName: string, className?: string, text?: string) => any;

export type IndicatorEntitySupport =
  | { supported: false; reason: string; numeric?: undefined }
  | { supported: true; reason?: undefined; numeric: boolean };

/**
 * 实体是否可作为指示灯依据。
 *
 * - `button` / `input_button` / `scene` / `event` 只有瞬时动作，没有可持续读取的状态，直接拒绝；
 * - `numeric` 仅在「没有 on/off 式选项」且能拿到数值线索时才成立：当前状态可解析为数字、
 *   域本身是数值域（sensor/input_number/counter），或带 `state_class` / 单位元信息。
 */
export function indicatorEntitySupport(
  entityDescriptor: any = {},
  rawState: any,
): IndicatorEntitySupport {
  const entityDomain = String(
    entityDescriptor?.entityId || entityDescriptor?.entity_id || "",
  ).split(".")[0];
  if (["button", "input_button", "scene", "event"].includes(entityDomain))
    return {
      supported: false,
      reason:
        "此实体仅提供动作或瞬时事件，没有可用于指示灯的持续状态。请选择开关、状态或数值传感器。",
    };
  const newState = rawState?.newState || rawState,
    attributes = { ...entityDescriptor?.attributes, ...newState?.attributes };
  return {
    supported: true,
    numeric:
      !deviceIndicatorChoices(entityDescriptor, rawState) &&
      (indicatorNumber(newState?.state) !== null ||
        ["number", "input_number", "counter"].includes(entityDomain) ||
        !!(
          newState?.attributes?.state_class ||
          entityDescriptor?.attributes?.state_class ||
          newState?.attributes?.unit_of_measurement ||
          entityDescriptor?.attributes?.unit_of_measurement
        )),
  };
}

const readStateLines = (statusValue: any) =>
  typeof statusValue == "string" ? statusValue : Array.isArray(statusValue) ? statusValue.join("\n") : "";

/**
 * 渲染指示灯条件字段。
 *
 * @returns `{ readRule }`，`readRule()` 校验失败时 `throw Error(文案)`，由对话框错误行展示。
 */
export function indicatorConditionFields({
  body,
  node,
  field,
  entity,
  raw,
  rule,
  role,
}: {
  body: any;
  node: IndicatorNodeFactory;
  field: IndicatorFieldFactory;
  entity: any;
  raw: any;
  rule: any;
  role: "power" | "health";
}) {
  const newState = raw?.newState || raw,
    support = indicatorEntitySupport(entity, raw),
    unit = newState?.attributes?.unit_of_measurement || entity?.attributes?.unit_of_measurement || "",
    statusChoices = deviceIndicatorChoices(entity, raw),
    isNumericRule = rule?.kind === "numeric",
    modeSelect = node("select");
  modeSelect.setAttribute("aria-label", "判断方式");
  for (const [modeValue, modeLabel] of [
    ["state", "文字／状态匹配"],
    ["numeric", "数值比较"],
  ]) {
    const modeOption = node("option", "", modeLabel);
    ((modeOption.value = modeValue),
      (modeOption.disabled = modeValue === "numeric" && !support.numeric && !isNumericRule),
      modeSelect.append(modeOption));
  }
  ((modeSelect.value =
    isNumericRule || (!rule?.active && support.numeric) ? "numeric" : "state"),
    field(body, "判断方式", modeSelect));
  const supportNoteElement = node("p", "i3d-note");
  body.append(supportNoteElement);
  if (support.supported) {
    if (!support.numeric && !isNumericRule)
      supportNoteElement.textContent = "此实体使用文字／状态匹配；当前没有可用于数值比较的数值状态或元信息。";
    else if (newState?.available === false || indicatorNumber(newState?.state) === null)
      supportNoteElement.textContent =
        "当前未取得有效数值；数值规则收到有效回报后才参与判断，期间显示未知。";
  } else supportNoteElement.textContent = support.reason;
  supportNoteElement.hidden = !supportNoteElement.textContent;

  const stateFieldsElement = node("div", "i3d-indicator-fields"),
    numericFieldsElement = node("div", "i3d-indicator-fields");
  body.append(stateFieldsElement, numericFieldsElement);
  stateFieldsElement.append(
    node(
      "p",
      "i3d-note",
      "按 HA 原始状态完整匹配，每行一个，可填写多个。未列出的状态显示未知；不支持包含、通配符或在此填写 >60。",
    ),
  );
  statusChoices?.options?.length &&
    stateFieldsElement.append(
      node(
        "p",
        "i3d-note",
        "可用状态：" +
          statusChoices.options
            .map((choiceOption: any) => choiceOption.label + "（" + choiceOption.value + "）")
            .join("、"),
      ),
    );
  const activeStateInputElement = node("textarea"),
    inactiveStateInputElement = node("textarea");
  ((activeStateInputElement.value = readStateLines(rule?.active)),
    (inactiveStateInputElement.value = readStateLines(rule?.inactive)),
    (activeStateInputElement.maxLength = inactiveStateInputElement.maxLength = 7800),
    activeStateInputElement.setAttribute(
      "aria-label",
      role === "health" ? "提醒状态值" : "亮灯状态值",
    ),
    inactiveStateInputElement.setAttribute(
      "aria-label",
      role === "health" ? "恢复状态值" : "灭灯状态值",
    ),
    field(
      stateFieldsElement,
      role === "health" ? "提醒时匹配的状态" : "亮灯时匹配的状态",
      activeStateInputElement,
    ),
    field(
      stateFieldsElement,
      role === "health" ? "恢复时匹配的状态" : "灭灯时匹配的状态",
      inactiveStateInputElement,
    ));

  const buildComparison = (comparisonLabel: string, condition: any) => {
    const comparisonGroupElement = node("div", "i3d-indicator-comparison"),
      operatorSelectElement = node("select"),
      valueInputElement = node("input");
    operatorSelectElement.setAttribute("aria-label", comparisonLabel + "比较方式");
    valueInputElement.setAttribute("aria-label", comparisonLabel + "数值");
    for (const [operatorValue, operatorLabel] of Object.entries(NUMERIC_OPERATORS)) {
      const operatorOptionElement = node("option", "", operatorLabel);
      ((operatorOptionElement.value = operatorValue), operatorSelectElement.append(operatorOptionElement));
    }
    ((operatorSelectElement.value = condition?.operator || "gte"),
      (valueInputElement.type = "number"),
      (valueInputElement.step = "any"),
      (valueInputElement.placeholder = "填写数值"),
      (valueInputElement.value = condition ? String(condition.value) : ""),
      comparisonGroupElement.append(operatorSelectElement, valueInputElement));
    unit && comparisonGroupElement.append(node("span", "i3d-indicator-unit", unit));
    field(numericFieldsElement, comparisonLabel, comparisonGroupElement);
    return {
      operator: operatorSelectElement,
      input: valueInputElement,
      group: comparisonGroupElement,
    };
  };
  const activeComparison = buildComparison(
      role === "health" ? "提醒条件" : "亮灯条件",
      isNumericRule ? rule.active : null,
    ),
    separateCheckboxElement = node("input");
  ((separateCheckboxElement.type = "checkbox"),
    separateCheckboxElement.setAttribute("aria-label", "单独设置恢复条件"),
    (separateCheckboxElement.checked =
      isNumericRule &&
      !(
        rule.inactive.operator === INVERSE_OPERATOR[rule.active.operator] &&
        rule.inactive.value === rule.active.value
      )),
    field(
      numericFieldsElement,
      "单独设置恢复条件（避免临界值反复切换）",
      separateCheckboxElement,
    ));
  const inactiveComparison = buildComparison(
      role === "health" ? "恢复条件" : "灭灯条件",
      isNumericRule ? rule.inactive : null,
    ),
    numericNoteElement = node("p", "i3d-note");
  numericFieldsElement.append(numericNoteElement);

  const syncComparisonState = () => {
    stateFieldsElement.hidden = modeSelect.value !== "state";
    numericFieldsElement.hidden = modeSelect.value !== "numeric";
    separateCheckboxElement.checked ||
      ((inactiveComparison.operator.value = INVERSE_OPERATOR[activeComparison.operator.value]),
      (inactiveComparison.input.value = activeComparison.input.value));
    inactiveComparison.operator.disabled = inactiveComparison.input.disabled =
      !separateCheckboxElement.checked;
    numericNoteElement.textContent = separateCheckboxElement.checked
      ? "两组条件之间保持上次判断结果。首次加载、规则修改或状态不可用后，中间区间显示未知，直到命中任一条件。两组条件不能重叠。"
      : "恢复／灭灯条件自动取相反条件，所有有效数值都有明确结果。45 与 45.0 按同一个数字判断。";
  };
  (modeSelect.addEventListener("change", syncComparisonState),
    separateCheckboxElement.addEventListener("change", syncComparisonState),
    activeComparison.operator.addEventListener("change", syncComparisonState),
    activeComparison.input.addEventListener("input", syncComparisonState),
    syncComparisonState());

  return {
    readRule() {
      if (!support.supported) throw Error(support.reason);
      if (modeSelect.value === "numeric") {
        if (!support.numeric && !isNumericRule)
          throw Error("此实体不支持数值比较，请选择文字／状态匹配。");
        const activeValue = indicatorNumber(activeComparison.input.value),
          inactiveValue = indicatorNumber(inactiveComparison.input.value);
        if (activeValue === null || inactiveValue === null)
          throw Error("请填写有效数值，不能留空或附带单位。");
        const numericRule = {
            entityId: rule?.entityId,
            kind: "numeric",
            active: {
              operator: activeComparison.operator.value,
              value: activeValue,
            },
            inactive: {
              operator: separateCheckboxElement.checked
                ? inactiveComparison.operator.value
                : INVERSE_OPERATOR[activeComparison.operator.value],
              value: separateCheckboxElement.checked ? inactiveValue : activeValue,
            },
          },
          ruleError = numericIndicatorRuleError(numericRule);
        if (ruleError) throw Error(ruleError);
        return numericRule;
      }
      const statusValueGroups = [
        activeStateInputElement.value,
        inactiveStateInputElement.value,
      ].map((statusValueText: string) => [
        ...new Set(
          statusValueText
            .split("\n")
            .map((statusLine: string) => statusLine.trim())
            .filter(Boolean),
        ),
      ]);
      if (
        statusValueGroups.some(
          (statusGroup: string[]) =>
            !statusGroup.length ||
            statusGroup.length > 64 ||
            statusGroup.some(
              (statusValueProbe: string) =>
                statusValueProbe.length > 120 ||
                ["unknown", "unavailable"].includes(statusValueProbe),
            ),
        ) ||
        statusValueGroups[0].some((statusValueProbe: string) =>
          statusValueGroups[1].includes(statusValueProbe),
        )
      )
        throw Error("请填写两组不重叠的有效状态值；未知或不可用不能作为匹配条件。");
      if (
        statusValueGroups.some((statusGroup: string[]) =>
          statusGroup.some((statusValueProbe: string) =>
            /^(?:[<>]=?|[≥≤])\s*[+-]?[\d.]/.test(statusValueProbe),
          ),
        )
      )
        throw Error("大小比较请切换到“数值比较”，这里仅支持完整状态匹配。");
      return {
        entityId: rule?.entityId,
        active:
          statusValueGroups[0].length === 1 ? statusValueGroups[0][0] : statusValueGroups[0],
        inactive:
          statusValueGroups[1].length === 1 ? statusValueGroups[1][0] : statusValueGroups[1],
      };
    },
  };
}
