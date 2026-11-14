import { domElement } from '@app/shared/util/dom-factory'
const COVER_MESSAGES = ['请移步商店购买3D交互包', '购买后请重启本项目']
export function updateInteraction3dCoverMessage(hostElement: any, messages = COVER_MESSAGES) {
  const messageElement = hostElement?.querySelector?.('.interaction3d-cover-message')
  messageElement &&
    messageElement.replaceChildren(
      ...messages.map((lineText) => {
        const textElement = document.createElement('span')
        return ((textElement.textContent = lineText), textElement)
      }),
    )
}
export function createInteraction3dCover({ showTitle = true } = {}) {
  const coverElement = domElement(document, 'span', 'interaction3d-cover')
  const imageElement = document.createElement('img')
  ;(imageElement.src = '/static/component-thumbnails/interaction3d.webp'),
    (imageElement.alt = ''),
    (imageElement.decoding = 'async')
  const titleElement = domElement(document, 'span', 'interaction3d-cover-title')
  const lockElement = document.createElement('span')
  ;(lockElement.className = 'interaction3d-cover-lock'), lockElement.setAttribute('aria-hidden', 'true')
  const coverMessageElement = domElement(document, 'span', 'interaction3d-cover-message')
  for (const messageText of COVER_MESSAGES) {
    const messageTextElement = document.createElement('span')
    ;(messageTextElement.textContent = messageText), coverMessageElement.append(messageTextElement)
  }
  return (
    titleElement.append(lockElement, coverMessageElement),
    (titleElement.hidden = !showTitle),
    coverElement.append(imageElement, titleElement),
    coverElement
  )
}
