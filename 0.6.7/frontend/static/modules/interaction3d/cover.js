const COVER_MESSAGES = ["请移步商店购买3D交互包", "购买后请重启本项目"];
export function updateInteraction3dCoverMessage(hostElement, messages = COVER_MESSAGES) {
  const messageElement = hostElement?.querySelector?.(".interaction3d-cover-message");
  messageElement &&
    messageElement.replaceChildren(
      ...messages.map((lineText) => {
        const textElement = document.createElement("span");
        return ((textElement.textContent = lineText), textElement);
      }),
    );
}
export function createInteraction3dCover({ showTitle = true } = {}) {
  const coverElement = document.createElement("span");
  coverElement.className = "interaction3d-cover";
  const imageElement = document.createElement("img");
  ((imageElement.src =
    "/bridge-static/component-thumbnails/interaction3d.png?v=20260905-interaction3d-cover-v2-20260908-curtains-v1"),
    (imageElement.alt = ""),
    (imageElement.decoding = "async"));
  const titleElement = document.createElement("span");
  titleElement.className = "interaction3d-cover-title";
  const lockElement = document.createElement("span");
  ((lockElement.className = "interaction3d-cover-lock"),
    lockElement.setAttribute("aria-hidden", "true"));
  const coverMessageElement = document.createElement("span");
  coverMessageElement.className = "interaction3d-cover-message";
  for (const messageText of COVER_MESSAGES) {
    const messageTextElement = document.createElement("span");
    ((messageTextElement.textContent = messageText),
      coverMessageElement.append(messageTextElement));
  }
  return (
    titleElement.append(lockElement, coverMessageElement),
    (titleElement.hidden = !showTitle),
    coverElement.append(imageElement, titleElement),
    coverElement
  );
}
