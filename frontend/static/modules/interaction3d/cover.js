const DEFAULT_COVER_MESSAGES = [
  "\u8BF7\u79FB\u6B65\u5546\u5E97\u8D2D\u4E703D\u4EA4\u4E92\u5305",
  "\u8D2D\u4E70\u540E\u8BF7\u91CD\u542F\u672C\u9879\u76EE"
];
export function updateInteraction3dCoverMessage(
  coverTitleElement,
  messages = DEFAULT_COVER_MESSAGES
) {
  const messageElement = coverTitleElement?.querySelector?.(".interaction3d-cover-message");
  messageElement &&
    messageElement.replaceChildren(
      ...messages.map(messageText => {
        const messageSpanElement = document.createElement("span");
        return ((messageSpanElement.textContent = messageText), messageSpanElement);
      })
    );
}
export function createInteraction3dCover({ showTitle: isTitleVisible = !0 } = {}) {
  const coverElement = document.createElement("span");
  coverElement.className = "interaction3d-cover";
  const coverImageElement = document.createElement("img");
  ((coverImageElement.src =
    "/static/component-thumbnails/interaction3d.png?v=20260915211726"),
    (coverImageElement.alt = ""),
    (coverImageElement.decoding = "async"));
  const titleElement = document.createElement("span");
  titleElement.className = "interaction3d-cover-title";
  const lockIconElement = document.createElement("span");
  ((lockIconElement.className = "interaction3d-cover-lock"),
    lockIconElement.setAttribute("aria-hidden", "true"));
  const messageContainerElement = document.createElement("span");
  messageContainerElement.className = "interaction3d-cover-message";
  for (const coverMessageText of DEFAULT_COVER_MESSAGES) {
    const textSpanElement = document.createElement("span");
    ((textSpanElement.textContent = coverMessageText),
      messageContainerElement.append(textSpanElement));
  }
  return (
    titleElement.append(lockIconElement, messageContainerElement),
    (titleElement.hidden = !isTitleVisible),
    coverElement.append(coverImageElement, titleElement),
    coverElement
  );
}
