export function copyBatchFields(arg1, arg2, arg3) {
  for (const value1 of arg3) {
    if (value1.compatible && !value1.compatible(arg1)) continue;
    const value2 = value1.read ? value1.read(arg2) : (arg2[value1.key] ?? value1.fallback);
    value2 !== undefined &&
      (value1.write
        ? value1.write(arg1, structuredClone(value2))
        : value2 !== undefined && (arg1[value1.key] = structuredClone(value2)));
  }
}
export function openBatchApply({
  title: arg4,
  source: arg5,
  targets: arg6,
  fields: arg7,
  changed: arg9 = [],
  onApply: arg8,
  onClose: arg10 = () => {},
}) {
  const fn1 = (arg11, arg12, arg13) => {
      const value15 = document.createElement(arg11);
      return (
        arg12 && (value15.textContent = arg12),
        arg13 && (value15.className = arg13),
        value15
      );
    },
    value3 = fn1("dialog", "", "settings-dialog navigation-style-apply-dialog i3d-batch-dialog");
  value3.setAttribute("aria-label", arg4);
  let value4 = false;
  const fn2 = () => {
      ((value4 = true), value3.close(), value3.remove(), arg10());
    },
    fn3 = (arg14, arg15) => {
      const value16 = fn1("button", arg14);
      return ((value16.type = "button"), value16.addEventListener("click", arg15), value16);
    },
    value5 = fn1("div", "", "dialog-heading");
  value5.append(fn1("h2", arg4), fn3("关闭", fn2));
  const value6 = fn1("div", "", "navigation-style-apply-body"),
    value7 = fn1("div", "", "navigation-style-apply-columns"),
    value8 = fn1("section"),
    value9 = fn1("section"),
    list1 = [],
    list2 = [],
    fn4 = (arg16, arg17, arg18, arg19, arg20) => {
      const value17 = fn1("label", "", "navigation-style-apply-option"),
        value18 = fn1("input"),
        value19 = fn1("span", arg16);
      return (
        (value18.type = "checkbox"),
        (value18.value = arg20.key || arg20.id),
        (value18.checked = arg18),
        value18.setAttribute("aria-label", arg16),
        value19.append(fn1("small", arg17)),
        value17.append(value18, value19),
        arg19.push({
          input: value18,
          value: arg20,
        }),
        value17
      );
    };
  value8.append(fn1("strong", "选择设置（高度、行为默认不选）"));
  const object1 = {
    focus: "聚焦",
    panel: "仅显示弹窗",
    "focus-panel": "聚焦并显示弹窗",
    "turn-on": "仅开关",
    "turn-on-focus": "聚焦并开启",
    "turn-on-panel": "开启并显示弹窗",
    cloth: "布帘",
    sheer: "纱帘",
    standard: "普通窗帘",
    roller: "卷帘",
    dream: "梦幻帘",
    auto: "继承模型",
    left: "左",
    right: "右",
    split: "双向",
    horizontal: "左右布局",
    vertical: "上下布局",
    hidden: "隐藏",
    always: "常驻显示",
    open: "打开时显示",
    cyan: "青色",
    orange: "橙色",
    traveler: "旅行者",
  };
  for (const value20 of arg7) {
    const value21 = value20.read ? value20.read(arg5) : (arg5[value20.key] ?? value20.fallback),
      value22 = value20.format
        ? value20.format(value21)
        : typeof value21 == "boolean"
          ? value21
            ? "开启"
            : "关闭"
          : (object1[value21] ?? value21 ?? "跟随各自模型");
    value8.append(
      fn4(
        value20.label,
        "" +
          value22 +
          (value20.unit || "") +
          (arg9.includes(value20.key) ? " · 已修改" : "") +
          (value20.compatible ? " · 仅兼容目标" : ""),
        !value20.optional && arg9.includes(value20.key),
        list1,
        value20,
      ),
    );
  }
  const value10 = fn1("span"),
    value11 = fn3("取消全选", () => {
      const value23 = !list2.every((arg21) => arg21.input.checked);
      (list2.forEach((arg22) => {
        arg22.input.checked = value23;
      }),
        fn5());
    }),
    fn5 = () => {
      const value24 = list2.filter((arg23) => arg23.input.checked).length;
      ((value10.textContent = "已选 " + value24 + "/" + arg6.length),
        (value11.textContent = value24 === arg6.length ? "取消全选" : "全选"));
    };
  value9.append(fn1("strong", "同楼层、同类型目标"), value10, value11);
  for (const value25 of arg6)
    value9.append(fn4(value25.label || value25.deviceName || "未命名", "", true, list2, value25));
  (value9.addEventListener("change", fn5), fn5());
  const value12 = fn1(
    "p",
    arg6.length
      ? "只复制勾选的设置；保留实体、模型、名称、X/Y、视角、地图与路线。"
      : "没有其他可应用的目标。",
    "navigation-style-apply-message",
  );
  value12.hidden = false;
  const value13 = fn3("应用所选", async () => {
    if (value4 || !value3.open || !value3.isConnected) return;
    const value26 = list1.filter((arg24) => arg24.input.checked).map((arg25) => arg25.value),
      value27 = list2.filter((arg26) => arg26.input.checked).map((arg27) => arg27.value);
    if (!value26.length || !value27.length) {
      value12.textContent = "请至少选择一项设置和一个目标。";
      return;
    }
    value13.disabled = true;
    try {
      (await arg8(value27, value26), fn2());
    } catch (error1) {
      ((value12.textContent = error1.message), (value13.disabled = false));
    }
  });
  ((value13.className = "primary"), (value13.disabled = !arg6.length));
  const value14 = fn1("div", "", "dialog-actions");
  return (
    value14.append(fn3("取消", fn2), value13),
    value7.append(value8, value9),
    value6.append(value7, value12, value14),
    value3.append(value5, value6),
    value3.addEventListener("cancel", (arg28) => {
      (arg28.preventDefault(), fn2());
    }),
    document.body.append(value3),
    value3.showModal(),
    value3
  );
}
