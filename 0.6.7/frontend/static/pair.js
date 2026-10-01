import { parsePairingLink as h, needsAppleInstallGuide as l } from "./pairing-link.js";
import {
  validEmbedUrl as b,
  rememberEmbedSession as w,
  resumeEmbedSession as y,
  embeddedCookieAvailable as f,
} from "./embed-session.js";
const r = document.querySelector("#pair-form"),
  n = document.querySelector("#message"),
  a = r.elements.code,
  S = new URLSearchParams(location.search).get("scan") === "1",
  i = new URLSearchParams(location.search).get("embed") === "1" || window.self !== window.top,
  c = new URLSearchParams(location.search).get("next") || "",
  s =
    new URLSearchParams(location.search).get("projectId") ||
    /^\/display\/([A-Za-z0-9_-]+)(?:\?|$)/.exec(c)?.[1];
(!i && l() && (document.querySelector("#apple-pair-note").hidden = false),
  i &&
    ((document.querySelector("#pair-title").textContent = "连接 HA 仪表盘"),
    (document.querySelector("#pair-description").textContent =
      "输入这个仪表盘的配对码。建议为 HA 单独创建配对码，复用其他设备的码会替换其配对。")));
function m() {
  const o = window.__HA_BRIDGE_PAIRING_HASH__ || location.hash;
  if (
    (delete window.__HA_BRIDGE_PAIRING_HASH__,
    location.hash && history.replaceState(null, "", location.pathname + location.search),
    !(!S || !o))
  ) {
    ((a.value = ""), (n.hidden = true));
    try {
      const t = h(location.origin + location.pathname + location.search + o);
      ((a.value = t.code),
        (a.closest("label").hidden = true),
        (document.querySelector("#pair-title").textContent = "连接 HA Bridge"),
        (document.querySelector("#pair-description").textContent =
          "已识别配对二维码，点击连接即可打开你的面板。"),
        (r.querySelector('button[type="submit"] span').textContent = "连接"));
    } catch (t) {
      ((a.closest("label").hidden = false), (n.textContent = t.message), (n.hidden = false));
    }
  }
}
if ((window.addEventListener("ha-bridge-pairing-link", m), m(), i && c)) {
  const o = r.querySelector('button[type="submit"]');
  ((o.disabled = true),
    y(c, fetch, s)
      .then((t) => {
        t && window.location.replace(t);
      })
      .finally(() => {
        o.disabled = false;
      }));
}
(a.addEventListener("input", () => {
  a.value = a.value.replace(/\D/g, "").slice(0, 6);
}),
  r.addEventListener("submit", async (o) => {
    (o.preventDefault(), (n.hidden = true));
    const t = r.querySelector('button[type="submit"]');
    t.disabled = true;
    try {
      const d = await fetch("/api/v1/displays/pair", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: a.value,
            ...(i
              ? {
                  embedded: true,
                  ...(s
                    ? {
                        projectId: s,
                      }
                    : {}),
                }
              : {}),
          }),
        }),
        e = await d.json().catch(() => ({}));
      if (!d.ok) throw new Error(e.detail || "配对失败，请检查配对码。");
      if (!/^\/display\/[A-Za-z0-9_-]+$/.test(e.targetUrl || ""))
        throw new Error("服务返回的面板地址无效。");
      if (i) {
        if (!b(e.embedUrl, e.device.projectId)) throw new Error("服务返回的嵌入地址无效。");
        w(e.embedUrl, [c, e.targetUrl]);
        const u = await f(e.device.projectId);
        window.location.replace(u ? e.targetUrl + "?embed=1" : e.embedUrl);
        return;
      }
      a.value = "";
      const p = l(navigator, window.matchMedia("(display-mode: standalone)").matches);
      window.location.replace(e.targetUrl + (p ? "?addToHome=1" : ""));
    } catch (d) {
      ((n.textContent = d.message), (n.hidden = false), (t.disabled = false));
    }
  }));
