/**
 * 展示页的配对二维码弹窗。
 *
 * 位置：中控设备展示页上「扫码配对新设备」入口，仅在配对被启用时可用。
 * 职责：把服务地址与 6 位配对码编码成 /pair?scan=1#... 链接并渲染成 QR，
 *   地址可现场修改（家里换网段时无需回后台改配置），并附 iPhone 添加到主屏引导。
 * 约定：二维码内容格式必须与 pairing-link.js 的 parsePairingLink 完全对应
 *   （路径 /pair、查询串 ?scan=1、哈希字段 code/type/version）；
 *   拒绝本机回环地址，因为手机连不上电脑的 localhost。
 */
import qrcode from "./vendor/qrcode-generator/qrcode.js";

/**
 * 校验服务地址与配对码，拼出二维码内容。
 *
 * @throws {Error} 地址不合法（含路径 / 账号 / 查询串）或配对码格式错误。
 */
export function pairingQrPayload(serverUrl, code) {
  const serverUrlObject = new URL(String(serverUrl).trim());
  // 只接受「裸 origin」形式：不允许用户信息、查询串、哈希与非根路径，
  // 否则拼出来的配对链接会被 parsePairingLink 拒绝。
  if (
    !["http:", "https:"].includes(serverUrlObject.protocol) ||
    serverUrlObject.username ||
    serverUrlObject.password ||
    serverUrlObject.search ||
    serverUrlObject.hash ||
    (serverUrlObject.pathname !== "/" && serverUrlObject.pathname !== "")
  )
    throw new Error(
      "请填写 HomeOS 服务地址，例如 http://192.168.1.20:18080，不包含页面路径。"
    );
  if (!/^\d{6}$/.test(String(code)))
    throw new Error("需要有效的 6 位配对码。");
  // 手机扫到 localhost 只会指向手机自己，必须挡掉这类地址。
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"].includes(serverUrlObject.hostname) ||
    serverUrlObject.hostname.endsWith(".localhost") ||
    serverUrlObject.hostname.startsWith("127.")
  )
    throw new Error(
      "手机无法连接电脑的本机地址，请改为手机可访问的局域网 IP 或域名。"
    );
  // origin 已含协议与端口；哈希字段顺序写成 type/version/code，与解析端只做集合比较无关。
  return `${serverUrlObject.origin}/pair?scan=1#type=homeos-pair&version=1&code=${String(code)}`;
}

/**
 * 把配对链接渲染成内联 SVG 二维码。
 */
export function pairingQrSvg(payload) {
  // 默认按 Latin-1 编码，中文域名 / 参数会乱码，必须显式切到 UTF-8。
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  // 纠错等级 "M"（约 15%）兼顾容错与二维码尺寸；scalable 让 SVG 自适应弹窗宽度。
  const qrCode = qrcode(0, "M");
  return (
    qrCode.addData(payload),
    qrCode.make(),
    qrCode.createSvgTag({ cellSize: 5, margin: 20, scalable: !0 })
  );
}

/**
 * 打开配对二维码弹窗。
 */
export function showDisplayPairingQr(pairing) {
  const dialogElement = document.createElement("dialog");
  dialogElement.className = "display-pairing-qr-dialog";
  const titleElement = document.createElement("h2");
  titleElement.textContent = "HomeOS 扫码配对";
  const descriptionElement = document.createElement("p");
  descriptionElement.textContent = `扫描下方二维码，连接“${pairing.name}”。安卓 App 或手机相机均可扫码。`;
  const downloadLink = document.createElement("a");
  // 外链必须带 noopener noreferrer，避免被打开的页面拿到 window.opener。
  ((downloadLink.className = "display-pairing-qr-download"),
    (downloadLink.href = "https://wiki.habridge.cn/downloads/HaBridge.apk"),
    (downloadLink.target = "_blank"),
    (downloadLink.rel = "noopener noreferrer"),
    (downloadLink.textContent = "下载安卓 App（Wiki）"));
  const noteElement = document.createElement("div");
  noteElement.className = "display-pairing-qr-note";
  const noteTitle = document.createElement("strong");
  noteTitle.textContent = "iPhone / iPad 使用引导";
  const stepsList = document.createElement("ol");
  // iOS 不支持安装 PWA 的提示，只能给出添加到主屏的手动步骤。
  for (const stepText of [
    "手机相机扫码，打开页面后点击“连接”。",
    "Chrome 或 Safari：分享 → 添加到主屏幕 → 添加。"
  ]) {
    const stepItem = document.createElement("li");
    ((stepItem.textContent = stepText), stepsList.append(stepItem));
  }
  const footnoteElement = document.createElement("p");
  ((footnoteElement.textContent =
    "添加后像 App 一样，点击桌面图标全屏打开，面板功能与 App 相同。"),
    noteElement.append(noteTitle, stepsList, footnoteElement));
  const addressLabel = document.createElement("label");
  addressLabel.textContent = "手机可访问的连接地址";
  const addressInput = document.createElement("input");
  // 默认填当前 origin，用户改网段时可直接改这里重新生成二维码。
  ((addressInput.type = "url"),
    (addressInput.autocomplete = "off"),
    (addressInput.spellcheck = !1),
    (addressInput.value = window.location.origin),
    addressInput.setAttribute(
      "aria-label",
      "手机可访问的连接地址"
    ),
    addressLabel.append(addressInput));
  const graphicElement = document.createElement("div");
  ((graphicElement.className = "display-pairing-qr-graphic"),
    graphicElement.setAttribute("role", "img"),
    graphicElement.setAttribute("aria-label", "HomeOS 配对二维码"));
  const statusNote = document.createElement("p");
  statusNote.className = "display-pairing-qr-note";
  const closeButton = document.createElement("button");
  ((closeButton.type = "button"),
    (closeButton.textContent = "关闭"),
    closeButton.addEventListener("click", () => dialogElement.close()));
  // 重新生成二维码；地址非法时清空图形并把原因写到提示行。
  const renderQr = () => {
    try {
      if (!pairing.enabled)
        throw new Error(
          "此配对码已停用，请先启用。"
        );
      ((graphicElement.innerHTML = pairingQrSvg(
        pairingQrPayload(addressInput.value, pairing.code)
      )),
        (graphicElement.hidden = !1),
        (statusNote.textContent =
          "请仅将二维码提供给需要配对的设备。"));
    } catch (caughtError) {
      (graphicElement.replaceChildren(),
        (graphicElement.hidden = !0),
        (statusNote.textContent = caughtError.message));
    }
  };
  (addressInput.addEventListener("input", renderQr),
    dialogElement.append(
      titleElement,
      descriptionElement,
      addressLabel,
      graphicElement,
      statusNote,
      downloadLink,
      noteElement,
      closeButton
    ),
    document.body.append(dialogElement),
    // 关闭后立即从 DOM 摘除，避免二维码 SVG 长期占内存；once 保证只解绑一次。
    dialogElement.addEventListener("close", () => dialogElement.remove(), { once: !0 }),
    renderQr(),
    dialogElement.showModal());
}
