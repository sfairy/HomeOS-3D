import { lockState } from "./lock-state.js?v=20260923-lock-event-source-v2";
export function createLockPanel({ onControl: arg1 }) {
  const fn1 = (arg2, arg3 = "") => {
      const value16 = document.createElement(arg2);
      return ((value16.textContent = arg3), value16);
    },
    value1 = fn1("section"),
    value2 = fn1("div"),
    value3 = fn1("h3"),
    value4 = fn1("p"),
    value5 = fn1("p"),
    value6 = fn1("div"),
    value7 = fn1("div"),
    value8 = fn1("input"),
    value9 = fn1("p");
  ((value1.className = "i3d-lock-panel i3d-nas-panel"),
    (value2.className = "i3d-nas-heading"),
    (value4.className = "i3d-nas-meta"),
    (value5.className = "i3d-nas-status"),
    (value6.className = "i3d-lock-details"),
    (value7.className = "i3d-focus-actions"),
    value9.setAttribute("role", "status"),
    (value8.type = "password"),
    (value8.autocomplete = "off"),
    (value8.maxLength = 128),
    (value8.placeholder = "门密码（仅本次操作）"),
    value8.setAttribute("aria-label", "门密码"));
  let value10 = null,
    value11 = true,
    value12 = false,
    value13 = false,
    text1 = "",
    value14 = 0;
  const map1 = new Map();
  for (const [value17, value18] of [
    ["lock", "上锁"],
    ["unlock", "解锁"],
    ["open", "释放锁舌"],
  ]) {
    const value19 = fn1("button", value18);
    ((value19.type = "button"),
      map1.set(value17, value19),
      value7.append(value19),
      value19.addEventListener("click", async () => {
        if (value11 || value12 || !value10) return;
        if (value17 !== "lock" && text1 !== value17) {
          ((text1 = value17), (value9.textContent = "确认要" + value18 + "吗？再次点击执行。"));
          return;
        }
        ((text1 = ""), (value12 = true));
        const value20 = value14,
          value21 = value10;
        fn2();
        const value22 = value8.value
          ? {
              code: value8.value,
            }
          : {};
        value8.value = "";
        try {
          (await arg1({
            deviceKind: "lock",
            domain: "lock",
            service: value17,
            entityId: value21.entityId,
            data: value22,
          }),
            !value13 &&
              value20 === value14 &&
              (value9.textContent = "指令已提交，状态以门反馈为准。"));
        } catch (error1) {
          !value13 && value20 === value14 && (value9.textContent = error1.message || "操作失败。");
        } finally {
          !value13 && value20 === value14 && ((value12 = false), fn2());
        }
      }));
  }
  let value15 = lockState({});
  function fn2() {
    ((value5.textContent = value10?.entityId
      ? value15.label + " · " + value15.doorLabel
      : value15.label),
      value6.replaceChildren(
        ...[value10?.batteryEntityId ? "电量 " + value15.battery : ""]
          .filter(Boolean)
          .map((arg4) => {
            const value23 = fn1("span", arg4);
            return ((value23.className = "i3d-lock-detail"), value23);
          }),
      ),
      (value4.textContent = value15.available
        ? value15.busy
          ? "设备正在动作"
          : "状态实时更新"
        : "设备不可用"),
      (value8.hidden = !value15.codeRequired));
    for (const [value24, value25] of map1)
      ((value25.hidden = !value10?.entityId || (value24 === "open" && !value15.canOpen)),
        (value25.disabled =
          value11 ||
          value12 ||
          !value15.available ||
          value15.busy ||
          (value24 === "lock" && value15.state === "locked")));
  }
  return (
    value2.append(value3, value4),
    value1.append(value2, value5, value6, value8, value7, value9),
    {
      root: value1,
      update({ item: arg5, states: arg6, editing: arg7 }) {
        (value10?.id !== arg5.id &&
          (value14++,
          (value12 = false),
          (text1 = ""),
          (value8.value = ""),
          (value9.textContent = "")),
          (value10 = arg5),
          (value11 = arg7),
          (value15 = lockState(arg5, arg6)),
          (value3.textContent = arg5.label || "门"),
          fn2());
      },
      hide() {
        (value14++,
          (value12 = false),
          (text1 = ""),
          (value8.value = ""),
          (value9.textContent = ""),
          (value1.hidden = true));
      },
      dispose() {
        ((value13 = true), (value8.value = ""), value1.remove());
      },
    }
  );
}
