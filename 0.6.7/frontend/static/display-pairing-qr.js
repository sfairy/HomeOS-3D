import p from "./vendor/qrcode-generator/qrcode.js";
export function pairingQrPayload(o, e) {
  const t = new URL(String(o).trim());
  if (
    !["http:", "https:"].includes(t.protocol) ||
    t.username ||
    t.password ||
    t.search ||
    t.hash ||
    (t.pathname !== "/" && t.pathname !== "")
  )
    throw new Error("请填写 HA Bridge 服务地址，例如 http://192.168.1.20:18080，不包含页面路径。");
  if (!/^\d{6}$/.test(String(e))) throw new Error("需要有效的 6 位配对码。");
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"].includes(t.hostname) ||
    t.hostname.endsWith(".localhost") ||
    t.hostname.startsWith("127.")
  )
    throw new Error("手机无法连接电脑的本机地址，请改为手机可访问的局域网 IP 或域名。");
  return `${t.origin}/pair?scan=1#type=ha-bridge-pair&version=1&code=${String(e)}`;
}
export function pairingQrSvg(o) {
  p.stringToBytes = p.stringToBytesFuncs["UTF-8"];
  const e = p(0, "M");
  return (
    e.addData(o),
    e.make(),
    e.createSvgTag({
      cellSize: 5,
      margin: 20,
      scalable: true,
    })
  );
}
export function showDisplayPairingQr(o) {
  const e = document.createElement("dialog");
  e.className = "display-pairing-qr-dialog";
  const t = document.createElement("h2");
  t.textContent = "HA Bridge 扫码配对";
  const m = document.createElement("p");
  m.textContent = `\u626B\u63CF\u4E0B\u65B9\u4E8C\u7EF4\u7801\uFF0C\u8FDE\u63A5\u201C${o.name}\u201D\u3002\u5B89\u5353 App \u6216\u624B\u673A\u76F8\u673A\u5747\u53EF\u626B\u7801\u3002`;
  const a = document.createElement("a");
  ((a.className = "display-pairing-qr-download"),
    (a.href = "https://wiki.habridge.cn/downloads/HaBridge.apk"),
    (a.target = "_blank"),
    (a.rel = "noopener noreferrer"),
    (a.textContent = "下载安卓 App（Wiki）"));
  const s = document.createElement("div");
  s.className = "display-pairing-qr-note";
  const u = document.createElement("strong");
  u.textContent = "iPhone / iPad 使用引导";
  const h = document.createElement("ol");
  for (const d of [
    "手机相机扫码，打开页面后点击“连接”。",
    "Chrome 或 Safari：分享 → 添加到主屏幕 → 添加。",
  ]) {
    const w = document.createElement("li");
    ((w.textContent = d), h.append(w));
  }
  const g = document.createElement("p");
  ((g.textContent = "添加后像 App 一样，点击桌面图标全屏打开，面板功能与 App 相同。"),
    s.append(u, h, g));
  const l = document.createElement("label");
  l.textContent = "手机可访问的连接地址";
  const n = document.createElement("input");
  ((n.type = "url"),
    (n.autocomplete = "off"),
    (n.spellcheck = false),
    (n.value = window.location.origin),
    n.setAttribute("aria-label", "手机可访问的连接地址"),
    l.append(n));
  const r = document.createElement("div");
  ((r.className = "display-pairing-qr-graphic"),
    r.setAttribute("role", "img"),
    r.setAttribute("aria-label", "HA Bridge 配对二维码"));
  const i = document.createElement("p");
  i.className = "display-pairing-qr-note";
  const c = document.createElement("button");
  ((c.type = "button"), (c.textContent = "关闭"), c.addEventListener("click", () => e.close()));
  const E = () => {
    try {
      if (!o.enabled) throw new Error("此配对码已停用，请先启用。");
      ((r.innerHTML = pairingQrSvg(pairingQrPayload(n.value, o.code))),
        (r.hidden = false),
        (i.textContent = "请仅将二维码提供给需要配对的设备。"));
    } catch (d) {
      (r.replaceChildren(), (r.hidden = true), (i.textContent = d.message));
    }
  };
  (n.addEventListener("input", E),
    e.append(t, m, l, r, i, a, s, c),
    document.body.append(e),
    e.addEventListener("close", () => e.remove(), {
      once: true,
    }),
    E(),
    e.showModal());
}
