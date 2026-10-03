import qrcodeGenerator from "/static/vendor/qrcode-generator/qrcode.js";
function pairingQrPayload(serviceUrl, pairCode) {
  const parsedUrl = new URL(String(serviceUrl).trim());
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")
  )
    throw new Error("请填写 HomeOS 服务地址，例如 http://192.168.1.20:18080，不包含页面路径。");
  if (!/^\d{6}$/.test(String(pairCode))) throw new Error("需要有效的 6 位配对码。");
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"].includes(parsedUrl.hostname) ||
    parsedUrl.hostname.endsWith(".localhost") ||
    parsedUrl.hostname.startsWith("127.")
  )
    throw new Error("手机无法连接电脑的本机地址，请改为手机可访问的局域网 IP 或域名。");
  return `${parsedUrl.origin}/pair?scan=1#type=homeos-pair&version=1&code=${String(pairCode)}`;
}
function pairingQrSvg(payload) {
  qrcodeGenerator.stringToBytes = qrcodeGenerator.stringToBytesFuncs["UTF-8"];
  const qrCode = qrcodeGenerator(0, "M");
  return (
    qrCode.addData(payload),
    qrCode.make(),
    qrCode.createSvgTag({
      cellSize: 5,
      margin: 20,
      scalable: true,
    })
  );
}
export function showDisplayPairingQr(display) {
  const dialogElement = document.createElement("dialog");
  dialogElement.className = "display-pairing-qr-dialog";
  const titleElement = document.createElement("h2");
  titleElement.textContent = "HomeOS 扫码配对";
  const descriptionElement = document.createElement("p");
  descriptionElement.textContent = `\u626B\u63CF\u4E0B\u65B9\u4E8C\u7EF4\u7801\uFF0C\u8FDE\u63A5\u201C${display.name}\u201D\u3002\u5B89\u5353 App \u6216\u624B\u673A\u76F8\u673A\u5747\u53EF\u626B\u7801\u3002`;
  const downloadLinkElement = document.createElement("a");
  ((downloadLinkElement.className = "display-pairing-qr-download"),
    (downloadLinkElement.href = "https://wiki.homeos.cn/downloads/HomeOS.apk"),
    (downloadLinkElement.target = "_blank"),
    (downloadLinkElement.rel = "noopener noreferrer"),
    (downloadLinkElement.textContent = "下载安卓 App（Wiki）"));
  const noteBoxElement = document.createElement("div");
  noteBoxElement.className = "display-pairing-qr-note";
  const noteHeadingElement = document.createElement("strong");
  noteHeadingElement.textContent = "iPhone / iPad 使用引导";
  const stepsListElement = document.createElement("ol");
  for (const stepText of [
    "手机相机扫码，打开页面后点击“连接”。",
    "Chrome 或 Safari：分享 → 添加到主屏幕 → 添加。",
  ]) {
    const stepItemElement = document.createElement("li");
    ((stepItemElement.textContent = stepText), stepsListElement.append(stepItemElement));
  }
  const noteTextElement = document.createElement("p");
  ((noteTextElement.textContent = "添加后像 App 一样，点击桌面图标全屏打开，面板功能与 App 相同。"),
    noteBoxElement.append(noteHeadingElement, stepsListElement, noteTextElement));
  const addressLabelElement = document.createElement("label");
  addressLabelElement.textContent = "手机可访问的连接地址";
  const addressInput = document.createElement("input");
  ((addressInput.type = "url"),
    (addressInput.autocomplete = "off"),
    (addressInput.spellcheck = false),
    (addressInput.value = window.location.origin),
    addressInput.setAttribute("aria-label", "手机可访问的连接地址"),
    addressLabelElement.append(addressInput));
  const qrGraphicElement = document.createElement("div");
  ((qrGraphicElement.className = "display-pairing-qr-graphic"),
    qrGraphicElement.setAttribute("role", "img"),
    qrGraphicElement.setAttribute("aria-label", "HomeOS 配对二维码"));
  const statusNoteElement = document.createElement("p");
  statusNoteElement.className = "display-pairing-qr-note";
  const closeButtonElement = document.createElement("button");
  ((closeButtonElement.type = "button"),
    (closeButtonElement.textContent = "关闭"),
    closeButtonElement.addEventListener("click", () => dialogElement.close()));
  const renderQr = () => {
    try {
      if (!display.enabled) throw new Error("此配对码已停用，请先启用。");
      ((qrGraphicElement.innerHTML = pairingQrSvg(
        pairingQrPayload(addressInput.value, display.code),
      )),
        (qrGraphicElement.hidden = false),
        (statusNoteElement.textContent = "请仅将二维码提供给需要配对的设备。"));
    } catch (renderError) {
      (qrGraphicElement.replaceChildren(),
        (qrGraphicElement.hidden = true),
        (statusNoteElement.textContent = renderError.message));
    }
  };
  (addressInput.addEventListener("input", renderQr),
    dialogElement.append(
      titleElement,
      descriptionElement,
      addressLabelElement,
      qrGraphicElement,
      statusNoteElement,
      downloadLinkElement,
      noteBoxElement,
      closeButtonElement,
    ),
    document.body.append(dialogElement),
    dialogElement.addEventListener("close", () => dialogElement.remove(), {
      once: true,
    }),
    renderQr(),
    dialogElement.showModal());
}
