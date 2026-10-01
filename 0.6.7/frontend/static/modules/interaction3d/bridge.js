import { createAccessMonitor } from "./access-monitor.js?v=20260905-interaction3d-v1-20260905-i3d-polish-v1-20260906-access-state-v2-access-poll-30s-v1";
import { createInteraction3dCover } from "./cover.js?v=20260905-interaction3d-cover-v1-20260908-access-lock-v1";
import { createInteraction3dFocusLayout } from "./focus-layout.js?v=20260911-navigation-light-v14";
export async function requestInteraction3dAccess() {
  const abortController1 = new AbortController(),
    value1 = setTimeout(() => abortController1.abort(), 5000);
  try {
    const value2 = await fetch("/api/v1/modules/interaction3d/access", {
      cache: "no-store",
      credentials: "same-origin",
      signal: abortController1.signal,
    });
    if (!value2.ok) {
      const error1 = new Error(
        value2.status === 403
          ? "3D 交互授权不可用，请在授权信息中查看。"
          : value2.status === 401
            ? "登录状态已失效，请重新登录。"
            : "暂时无法验证 3D 交互授权，请稍候重试。",
      );
      throw ((error1.status = value2.status), error1);
    }
    const value3 = await value2.json();
    if (
      value3?.allowed !== true ||
      !Number.isFinite(Number(value3.validForSeconds)) ||
      Number(value3.validForSeconds) <= 0
    ) {
      const error2 = new Error("暂时无法验证 3D 交互授权，请稍候重试。");
      throw ((error2.status = value3?.allowed === false ? 403 : 502), error2);
    }
    return value3;
  } finally {
    clearTimeout(value1);
  }
}
let l;
const g = new Map(),
  c = new Map();
function m(arg1, arg2) {
  for (const value4 of c.get(arg1) || []) value4(arg2);
}
export function getInteraction3dEditorView(arg3) {
  return g.get(arg3);
}
export function waitInteraction3dEditorView(arg4) {
  return new Promise((arg5, arg6) => {
    const fn1 = () => {
        (clearTimeout(value5), c.get(arg4)?.delete(fn2), c.get(arg4)?.size || c.delete(arg4));
      },
      fn2 = (arg7) => {
        const value6 = g.get(arg4);
        arg7 ? (fn1(), arg6(arg7)) : value6?.ready && value6.metadata && (fn1(), arg5(value6));
      },
      value5 = setTimeout(() => {
        (fn1(), arg6(new Error("户型准备较慢，请稍候重试。")));
      }, 25000);
    (c.has(arg4) || c.set(arg4, new Set()), c.get(arg4).add(fn2), fn2());
  });
}
export function cancelOtherInteraction3dViews(arg8) {
  for (const [value7, value8] of g)
    (value7 !== arg8 && value8.viewEditing && value8.setViewEditing(false),
      value7 !== arg8 && value8.closePopupLayoutPreview?.(),
      value7 !== arg8 && value8.rangeEditing && value8.closeRangeEditor?.());
}
function L() {
  return (
    l ||
    ((l = createAccessMonitor({
      requestGrant: requestInteraction3dAccess,
    })),
    document.addEventListener("visibilitychange", () =>
      document.hidden ? l.suspend() : l.resume(),
    ),
    window.addEventListener("pagehide", () => l.suspend()),
    window.addEventListener("pageshow", () => {
      document.hidden || l.resume();
    }),
    document.hidden && l.suspend(),
    l)
  );
}
export function subscribeInteraction3dAccess(arg9) {
  return L().subscribe(arg9);
}
export function renderInteraction3d(arg10, arg11 = {}) {
  const value9 = document.createElement("section");
  ((value9.className = "hb-interaction3d-host"), value9.setAttribute("aria-label", "3D 交互"));
  let value10 = false,
    value11 = false,
    value12 = false,
    value13 = 0,
    value14,
    value15 = arg11.prewarmStage !== true;
  value9.setInteraction3dPageVisible = (arg12) => {
    ((value15 = arg12 !== false), value14?.setPageVisible?.(value15));
  };
  let value16;
  const value17 = createInteraction3dFocusLayout(value9, arg11);
  (value9.classList.toggle("is-background-hidden", arg10.properties?.backgroundVisible === false),
    (value9.updateInteraction3d = (arg13, arg14) => {
      ((arg10 = arg13),
        (arg11.document = arg14),
        value9.classList.toggle(
          "is-background-hidden",
          arg10.properties?.backgroundVisible === false,
        ),
        value14?.update(arg10.properties || {}, undefined, null, arg10),
        value17.refresh());
    }));
  function fn3() {
    (value17.setActive(false),
      (value13 += 1),
      (value11 = false),
      (value12 = false),
      g.get(arg10.id) === value14 && g.delete(arg10.id),
      value10 || m(arg10.id, new Error("3D 户型暂不可用，请检查授权或重新载入。")),
      value14?.(),
      (value14 = null),
      value16?.remove(),
      (value16 = null),
      value9.dataset.access !== "locked" && value9.replaceChildren(createInteraction3dCover()),
      (value9.dataset.access = "locked"),
      value9.setAttribute("aria-busy", "false"));
  }
  const value18 = subscribeInteraction3dAccess(async (arg15) => {
    if (value10) return;
    if (!arg15.allowed) {
      if (arg15.status === "denied") return fn3(arg15.message);
      if ((value14?.setAuthorized(false), value9.dataset.access === "locked")) {
        value9.setAttribute("aria-busy", arg15.status === "checking" ? "true" : "false");
        return;
      }
      if (
        ((value9.dataset.access = "pending"), value9.setAttribute("aria-busy", "true"), !value12)
      ) {
        ((value13 += 1), (value11 = false));
        const value20 = document.createElement("div");
        ((value20.className = "i3d-access-pending"),
          value20.setAttribute("role", "status"),
          value20.setAttribute("aria-label", "正在准备 3D 户型"),
          value9.replaceChildren(value20));
      }
      return;
    }
    if (value12) {
      (value14?.setAuthorized(true),
        (value9.dataset.access = "allowed"),
        value9.setAttribute("aria-busy", "false"),
        arg11.editable && m(arg10.id));
      return;
    }
    if (value11) return;
    value11 = true;
    const value19 = ++value13;
    try {
      const value21 =
        await import("../../../api/v1/modules/interaction3d/runtime.js?v=20260927-follow-ui-v1-20260914-popup-preview-v1-warm-popups-v1-20260923-lazy-stage-v1-20260926-speaker-v1-20260926-fan-v1-20260926-airer-v2-reload-diagnostics-v2");
      if (value10 || value19 !== value13 || document.hidden) return;
      ((value16 = document.createElement("link")),
        (value16.rel = "stylesheet"),
        (value16.href =
          "/api/v1/modules/interaction3d/runtime.css?v=20260923-lock-entity-spacing-v2-20260926-fan-v1"),
        value9.append(value16));
      const value22 = document.createElement("div");
      (value9.replaceChildren(value16, value22),
        (value14 = value21.mountInteraction3d(value22, {
          component: arg10,
          context: arg11,
          onPresented: () => {
            (value17.refresh(), arg11.editable && m(arg10.id));
          },
          onLoadError: (arg16) => {
            arg11.editable && m(arg10.id, arg16);
          },
          onFocusChange: (arg17) => value17.setActive(arg17),
        })),
        value14.setPageVisible?.(value15),
        arg11.editable && g.set(arg10.id, value14),
        (value9.dataset.access = "allowed"),
        value9.setAttribute("aria-busy", "false"),
        (value12 = true));
    } catch {
      if (!value10 && value19 === value13) {
        (value16?.remove(), (value16 = null));
        const value23 = document.createElement("div");
        ((value23.className = "i3d-access-pending"),
          (value23.textContent = "户型暂时无法载入，请稍候重试。"),
          value23.setAttribute("role", "status"),
          value9.replaceChildren(value23),
          (value9.dataset.access = "pending"),
          arg11.editable && m(arg10.id, new Error(value23.textContent)));
      }
    } finally {
      value19 === value13 && (value11 = false);
    }
  });
  return (
    arg11.cleanup?.(() => {
      ((value10 = true), value18(), fn3("3D 交互已停止。"), value17.dispose());
    }),
    value9
  );
}
