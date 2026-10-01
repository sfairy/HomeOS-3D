import { PanelRenderer } from "./renderer/renderer.js?v=20260909-curtain-action-v15-20260911-navigation-light-v14-20260911-security-camera-popup-v6-quiet-feedback-v1-stage-retain-v1-20260914-chart-tooltip-scale-v1-warm-popups-v1-access-poll-30s-v1-20260926-scene-mode-v3-dialog-cleanup-v1-apple-native-v1-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { ensureUiPackRuntime } from "./ui-packs/loader.js?v=20260811-water-heater-popup-v44-20260824-light-statistics-v4-20260828-count-statistics-v1-20260824-load-optimization-v1-20260902-camera-popup-ready-v1-20260902-floorplan-auto-diagram-v12-20260908-environment-v1-20260908-lighting-mode-v1-20260926-scene-mode-v3-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
import { createButtonSound } from "./sound-effects.js?v=20260826-button-sound-v2";
import { syncAppleDisplaySurface } from "./display-surface.js?v=20260914-ios-pwa-surface-v1";
const E = document.querySelector("#display-root"),
  C = document.querySelector("#display-shell"),
  q = new URLSearchParams(window.location.search).get("capturePreview") === "1";
document.documentElement.classList.toggle("capture-preview", q);
let m = null,
  R = null,
  N = null,
  d = null;
const x = createButtonSound();
let p = null,
  B = [],
  P = null,
  A = [],
  I = [],
  D = {},
  g = null,
  S = null,
  $ = false,
  U = null,
  y = 0,
  h = null;
const H = window.self !== window.top;
let f = null;
function K() {
  const value1 = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(value1) ||
    (/Macintosh/i.test(value1) && Number(navigator.maxTouchPoints || 0) > 1)
  );
}
function b() {
  const value2 = !H && K();
  let value3 = Math.round(
      Number(value2 ? window.screen?.width : window.visualViewport?.width) ||
        Number(window.innerWidth) ||
        Number(document.documentElement.clientWidth),
    ),
    value4 = Math.round(
      Number(value2 ? window.screen?.height : window.visualViewport?.height) ||
        Number(window.innerHeight) ||
        Number(document.documentElement.clientHeight),
    );
  (value2 &&
    window.innerWidth >= window.innerHeight !== value3 >= value4 &&
    ([value3, value4] = [value4, value3]),
    !(!value3 || !value4) &&
      (H &&
        f &&
        ((value3 = Math.min(value3, f.width)),
        (value4 = Math.min(value4, f.height)),
        (C.style.left = f.left + "px"),
        (C.style.top = f.top + "px")),
      (C.style.width = value3 + "px"),
      (C.style.height = value4 + "px"),
      d?.resize(),
      value2 &&
        ((document.documentElement.style.width = value3 + "px"),
        (document.documentElement.style.height = value4 + "px"),
        (document.body.style.width = value3 + "px"),
        (document.body.style.height = value4 + "px"))));
}
function z() {
  return (
    "/pair?" +
    (window.HABridgeEmbed ||
    window.self !== window.top ||
    new URLSearchParams(location.search).get("embed") === "1"
      ? "embed=1&"
      : "") +
    "next=" +
    encodeURIComponent(
      "" + (window.HABridgeEmbed?.path || window.location.pathname) + window.location.search,
    )
  );
}
async function a(arg1) {
  const value5 = arg1.includes("?") ? "&" : "?",
    value6 = window.HABridgeDisplayStartup?.take(arg1),
    value7 = value6?.controller || new AbortController(),
    value8 = value6 ? null : window.setTimeout(() => value7.abort(), 20000);
  try {
    const value9 = value6
        ? (await value6.result).response
        : await fetch("/api/v1" + arg1 + value5 + "_=" + Date.now(), {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
            signal: value7.signal,
          }),
      value10 = value6
        ? (await value6.result).payload
        : value9.status === 204
          ? null
          : await value9.json().catch((arg2) => {
              if (value7.signal.aborted) throw arg2;
              return {};
            });
    if (
      value9.status === 401 ||
      (value9.status === 403 && value10?.detail?.code === "DISPLAY_PROJECT_UNPAIRED")
    )
      return (window.location.assign(z()), null);
    if (value9.status === 403 && value10?.detail?.code === "LICENSE_RESTRICTED") {
      window.location.reload();
      const error1 = new Error(value10.detail.message || "授权后台正在验证，请稍后重试。");
      throw ((error1.code = "LICENSE_RESTRICTED"), error1);
    }
    if (!value9.ok) {
      const value11 = value10?.detail,
        error2 = new Error(typeof value11 == "string" ? value11 : value11?.message || "请求失败。");
      throw (
        (error2.code = value11?.code || ""),
        window.HABridgeLog?.linkError(error2, value9) || error2
      );
    }
    return value10;
  } catch (error3) {
    throw value7.signal.aborted ? new Error("仪表盘更新请求超时，请检查网络连接。") : error3;
  } finally {
    window.clearTimeout(value8);
  }
}
async function J(arg3) {
  const value12 = arg3?.uiPack?.id || "ui.base";
  let value13 = B.find((arg4) => arg4.id === value12);
  if (!value13) {
    const value14 = await a("/ui-packs?_=" + Date.now());
    if (!value14) return null;
    ((B = value14.items || []), (value13 = B.find((arg5) => arg5.id === value12)));
  }
  if (!value13?.allowed) {
    const error4 = new Error("当前授权尚未解锁该 UI 方案。");
    throw ((error4.code = "UI_PACK_RESTRICTED"), error4);
  }
  return (await ensureUiPackRuntime(value13), value13);
}
async function F() {
  return (
    g ||
    ((g = (async () => {
      const value15 = await a("/ha/sync/status");
      if (!value15) return;
      const value16 = value15.configured
          ? JSON.stringify([
              Number.isFinite(Number(value15.catalogRevision))
                ? Number(value15.catalogRevision)
                : value15.lastFullSyncAt || "",
              Number(value15.counts?.entities || 0),
              Number(value15.counts?.devices || 0),
              Number(value15.counts?.areas || 0),
            ])
          : "not-configured",
        value17 = value16 !== S,
        value18 = !!(value15.configured && value15.connected && (!$ || value17));
      if (!(!value17 && !value18)) {
        if (!value15.configured) {
          ((A = []), (I = []), (D = {}), (S = value16), ($ = true), T());
          return;
        }
        if (value17) {
          const list1 = [];
          let value19 = 0,
            value20 = 0;
          do {
            const value22 = await a("/ha/entities?limit=500&offset=" + value19);
            if (!value22) return;
            (list1.push(...(value22.items || [])),
              (value20 = Number(value22.total || 0)),
              (value19 += Number(value22.limit || 500)));
          } while (list1.length < value20);
          A = list1;
          const value21 = await a("/ha/devices").catch(() => null);
          (value21 && (I = value21.items || []), (S = value16));
        }
        if (value18) {
          const value23 = await a("/ha/translations").catch(() => null);
          value23 ? ((D = value23.resources || {}), ($ = true)) : ($ = false);
        }
        T();
      }
    })().finally(() => {
      g = null;
    })),
    g)
  );
}
function G() {
  const value24 = A.map((arg6) => [
      arg6.entityId || "",
      arg6.domain || "",
      arg6.name || "",
      arg6.icon || "",
      arg6.deviceId || "",
      arg6.platform || "",
      arg6.translationKey || "",
      arg6.uniqueId || "",
      arg6.originalName || "",
      arg6.status || "",
      arg6.disabledBy || "",
    ]),
    value25 = I.map((arg7) => [
      arg7.deviceId || "",
      arg7.name || "",
      arg7.manufacturer || "",
      arg7.model || "",
      arg7.status || "",
    ]),
    value26 = Object.entries(D).sort(([arg8], [arg9]) => arg8.localeCompare(arg9));
  return JSON.stringify([value24, value25, value26]);
}
function T() {
  if (!d) return;
  const value27 = G();
  value27 !== U && ((U = value27), d.setEntityCatalog(A, D, I));
}
async function Y() {
  const value28 = window.HABridgeEmbed?.path || window.location.pathname;
  if (value28.startsWith("/display/"))
    return {
      id: decodeURIComponent(value28.slice(9)),
      name: "",
    };
  if (!value28.startsWith("/habridge/")) throw new Error("仪表盘地址无效。");
  const value29 = decodeURIComponent(value28.slice(10)).trim();
  if (!value29) throw new Error("仪表盘名称不能为空。");
  const value30 = await a("/projects");
  if (!value30) return null;
  const value31 = (value30.items || []).filter((arg10) => arg10.name === value29);
  if (!value31.length) throw new Error("找不到仪表盘“" + value29 + "”。");
  if (value31.length > 1) throw new Error("仪表盘名称“" + value29 + "”重复，请先在编辑器中改名。");
  return value31[0];
}
async function _() {
  if (m)
    return (
      p ||
      ((p = (async () => {
        F().catch(() => null);
        const value32 = d
          ? null
          : Promise.all([a("/assets/version"), a("/assets/builtin"), a("/assets/user")])
              .then(([arg11, arg12, arg13]) => ({
                versions: arg11,
                builtin: arg12,
                user: arg13,
              }))
              .catch((arg14) => ({
                error: arg14,
              }));
        let value33 = null,
          value34 = P !== h;
        if (d) {
          if (
            ((value33 = await a("/projects/" + encodeURIComponent(m.id) + "/revision")), !value33)
          )
            return;
          const value41 = Date.now();
          if (value41 - y >= 30000) {
            const value42 = await a("/assets/version");
            if (!value42) return;
            const value43 = (value42.builtin || "") + ":" + (value42.user || "");
            ((value34 = P !== value43), (h = value43), (y = value41));
          }
          if (!value34 && value33.revision === R && value33.globalPopupRevision === N) return;
        }
        const value35 = await a("/projects/" + encodeURIComponent(m.id) + "/draft");
        if (!value35) return;
        (window.HABridgeDisplayBoot?.setDocument(value35.document),
          syncAppleDisplaySurface(value35.document),
          x.setEnabled(value35.document?.soundEnabled !== false),
          await J(value35.document));
        let value36 = h,
          value37 = null,
          value38 = null;
        if (!d && value32) {
          const value44 = await value32;
          if (value44.error) throw value44.error;
          const value45 = value44.versions;
          ((value36 = (value45?.builtin || "") + ":" + (value45?.user || "")),
            (h = value36),
            (y = Date.now()),
            (value37 = value44.builtin),
            (value38 = value44.user));
        } else {
          if (value34 || P !== value36) {
            const value46 = h ? null : await a("/assets/version");
            if (
              ((value36 = value46 ? (value46.builtin || "") + ":" + (value46.user || "") : value36),
              (h = value36),
              (y = Date.now()),
              ([value37, value38] = await Promise.all([a("/assets/builtin"), a("/assets/user")])),
              !value37 || !value38)
            )
              return;
          }
        }
        const value39 = m.name || value35.document?.name || "HA Bridge";
        if (
          ((document.title = value39 + " · HA Bridge"),
          d ||
            ((d = new PanelRenderer(E, {
              scaleMode: "contain",
              onRuntimeButtonPress() {
                x.play();
              },
            })),
            T()),
          value37 &&
            value38 &&
            (d.refreshBuiltinAssets([...(value37.items || []), ...(value38.items || [])]),
            (P = value36)),
          R === value35.revision && N === value35.globalPopupRevision)
        )
          return;
        const value40 = d.page?.path || null;
        (d.setDocument(value35.document, value40),
          window.HABridgeDisplayBoot?.ready(E),
          (R = value35.revision),
          (N = value35.globalPopupRevision));
      })().finally(() => {
        p = null;
      })),
      p)
    );
}
async function Q() {
  (b(),
    (m = await Y()),
    window.HABridgeLog?.setContext({
      projectId: m?.id || "",
    }),
    m && (await _()));
}
function k() {
  document.visibilityState === "visible" && (window.HABridgeDisplayBoot?.failed || _().catch(V));
}
function L() {
  document.visibilityState === "visible" && ((y = 0), k());
}
function V(arg15) {
  if (
    (window.HABridgeLog?.error(arg15, {
      phase: "display-refresh",
    }),
    window.HABridgeDisplayBoot?.fail(arg15),
    arg15?.code !== "UI_PACK_RESTRICTED")
  )
    return;
  (d?.destroy(), (d = null), (R = null));
  const value47 = document.createElement("p");
  ((value47.className = "display-error"),
    (value47.textContent = arg15.message),
    E.replaceChildren(value47));
}
if (
  (window.addEventListener("pageshow", L),
  document.addEventListener("visibilitychange", L),
  window.addEventListener("online", L),
  window.addEventListener("resize", b),
  window.visualViewport?.addEventListener("resize", b),
  window.addEventListener("orientationchange", () => window.setTimeout(b, 100)),
  H && typeof IntersectionObserver == "function")
) {
  const t = new IntersectionObserver(
    (arg16) => {
      const value48 = arg16[arg16.length - 1];
      if (
        !value48?.isIntersecting ||
        value48.intersectionRect.width < 1 ||
        value48.intersectionRect.height < 1
      )
        return;
      const value49 = value48.intersectionRect;
      ((f = {
        width: value49.width,
        height: value49.height,
        left: value49.left,
        top: value49.top,
      }),
        b());
    },
    {
      threshold: Array.from(
        {
          length: 101,
        },
        (arg17, arg18) => arg18 / 100,
      ),
    },
  );
  (t.observe(document.documentElement),
    window.addEventListener("pagehide", () => t.disconnect(), {
      once: true,
    }),
    window.addEventListener("pageshow", () => t.observe(document.documentElement)));
}
(window.setInterval(k, 10000),
  Q().catch((arg19) => {
    if ((V(arg19), arg19?.code === "UI_PACK_RESTRICTED")) return;
    const value50 = document.createElement("p");
    ((value50.className = "display-error"),
      (value50.textContent = arg19.message),
      E.replaceChildren(value50));
  }));
