import qrcode from "./vendor/qrcode-generator/qrcode.js";
export function pairingQrPayload(serverUrl, code) {
  const serverUrlObject = new URL(String(serverUrl).trim());
  if (
    !["http:", "https:"].includes(serverUrlObject.protocol) ||
    serverUrlObject.username ||
    serverUrlObject.password ||
    serverUrlObject.search ||
    serverUrlObject.hash ||
    (serverUrlObject.pathname !== "/" && serverUrlObject.pathname !== "")
  )
    throw new Error(
      "\u8BF7\u586B\u5199 HomeOS \u670D\u52A1\u5730\u5740\uFF0C\u4F8B\u5982 http://192.168.1.20:18080\uFF0C\u4E0D\u5305\u542B\u9875\u9762\u8DEF\u5F84\u3002"
    );
  if (!/^\d{6}$/.test(String(code)))
    throw new Error("\u9700\u8981\u6709\u6548\u7684 6 \u4F4D\u914D\u5BF9\u7801\u3002");
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"].includes(serverUrlObject.hostname) ||
    serverUrlObject.hostname.endsWith(".localhost") ||
    serverUrlObject.hostname.startsWith("127.")
  )
    throw new Error(
      "\u624B\u673A\u65E0\u6CD5\u8FDE\u63A5\u7535\u8111\u7684\u672C\u673A\u5730\u5740\uFF0C\u8BF7\u6539\u4E3A\u624B\u673A\u53EF\u8BBF\u95EE\u7684\u5C40\u57DF\u7F51 IP \u6216\u57DF\u540D\u3002"
    );
  return `${serverUrlObject.origin}/pair?scan=1#type=homeos-pair&version=1&code=${String(code)}`;
}
export function pairingQrSvg(payload) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qrCode = qrcode(0, "M");
  return (
    qrCode.addData(payload),
    qrCode.make(),
    qrCode.createSvgTag({ cellSize: 5, margin: 20, scalable: !0 })
  );
}
export function showDisplayPairingQr(pairing) {
  const dialogElement = document.createElement("dialog");
  dialogElement.className = "display-pairing-qr-dialog";
  const titleElement = document.createElement("h2");
  titleElement.textContent = "HomeOS \u626B\u7801\u914D\u5BF9";
  const descriptionElement = document.createElement("p");
  descriptionElement.textContent = `\u626B\u63CF\u4E0B\u65B9\u4E8C\u7EF4\u7801\uFF0C\u8FDE\u63A5\u201C${pairing.name}\u201D\u3002\u5B89\u5353 App \u6216\u624B\u673A\u76F8\u673A\u5747\u53EF\u626B\u7801\u3002`;
  const downloadLink = document.createElement("a");
  ((downloadLink.className = "display-pairing-qr-download"),
    (downloadLink.href = "https://wiki.habridge.cn/downloads/HaBridge.apk"),
    (downloadLink.target = "_blank"),
    (downloadLink.rel = "noopener noreferrer"),
    (downloadLink.textContent = "\u4E0B\u8F7D\u5B89\u5353 App\uFF08Wiki\uFF09"));
  const noteElement = document.createElement("div");
  noteElement.className = "display-pairing-qr-note";
  const noteTitle = document.createElement("strong");
  noteTitle.textContent = "iPhone / iPad \u4F7F\u7528\u5F15\u5BFC";
  const stepsList = document.createElement("ol");
  for (const stepText of [
    "\u624B\u673A\u76F8\u673A\u626B\u7801\uFF0C\u6253\u5F00\u9875\u9762\u540E\u70B9\u51FB\u201C\u8FDE\u63A5\u201D\u3002",
    "Chrome \u6216 Safari\uFF1A\u5206\u4EAB \u2192 \u6DFB\u52A0\u5230\u4E3B\u5C4F\u5E55 \u2192 \u6DFB\u52A0\u3002"
  ]) {
    const stepItem = document.createElement("li");
    ((stepItem.textContent = stepText), stepsList.append(stepItem));
  }
  const footnoteElement = document.createElement("p");
  ((footnoteElement.textContent =
    "\u6DFB\u52A0\u540E\u50CF App \u4E00\u6837\uFF0C\u70B9\u51FB\u684C\u9762\u56FE\u6807\u5168\u5C4F\u6253\u5F00\uFF0C\u9762\u677F\u529F\u80FD\u4E0E App \u76F8\u540C\u3002"),
    noteElement.append(noteTitle, stepsList, footnoteElement));
  const addressLabel = document.createElement("label");
  addressLabel.textContent = "\u624B\u673A\u53EF\u8BBF\u95EE\u7684\u8FDE\u63A5\u5730\u5740";
  const addressInput = document.createElement("input");
  ((addressInput.type = "url"),
    (addressInput.autocomplete = "off"),
    (addressInput.spellcheck = !1),
    (addressInput.value = window.location.origin),
    addressInput.setAttribute(
      "aria-label",
      "\u624B\u673A\u53EF\u8BBF\u95EE\u7684\u8FDE\u63A5\u5730\u5740"
    ),
    addressLabel.append(addressInput));
  const graphicElement = document.createElement("div");
  ((graphicElement.className = "display-pairing-qr-graphic"),
    graphicElement.setAttribute("role", "img"),
    graphicElement.setAttribute("aria-label", "HomeOS \u914D\u5BF9\u4E8C\u7EF4\u7801"));
  const statusNote = document.createElement("p");
  statusNote.className = "display-pairing-qr-note";
  const closeButton = document.createElement("button");
  ((closeButton.type = "button"),
    (closeButton.textContent = "\u5173\u95ED"),
    closeButton.addEventListener("click", () => dialogElement.close()));
  const renderQr = () => {
    try {
      if (!pairing.enabled)
        throw new Error(
          "\u6B64\u914D\u5BF9\u7801\u5DF2\u505C\u7528\uFF0C\u8BF7\u5148\u542F\u7528\u3002"
        );
      ((graphicElement.innerHTML = pairingQrSvg(
        pairingQrPayload(addressInput.value, pairing.code)
      )),
        (graphicElement.hidden = !1),
        (statusNote.textContent =
          "\u8BF7\u4EC5\u5C06\u4E8C\u7EF4\u7801\u63D0\u4F9B\u7ED9\u9700\u8981\u914D\u5BF9\u7684\u8BBE\u5907\u3002"));
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
    dialogElement.addEventListener("close", () => dialogElement.remove(), { once: !0 }),
    renderQr(),
    dialogElement.showModal());
}
