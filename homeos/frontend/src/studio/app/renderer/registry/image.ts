/**
 * 2D 面板渲染器 · `image` 家族。
 *
 * 从 register-all.ts 拆出：该文件原先是一个 1,898 行的巨型装配函数，
 * 每次改一个控件都要在整份文件里定位；按 registry 家族拆开后每个文件只放
 * 自己那一族的 DOM 构建逻辑，装配函数只负责按顺序调用。
 */
import { staticAssetImageSource } from './asset-state'
import { mountDisplayImage } from '../controls/display-images'

export function registerImageComponent(registerComponent: (type: any, def: any) => void) {
  registerComponent('image', {
    render(imageComponent: any) {
      const imageProperties = imageComponent.properties || {},
        imageSourceUrl = staticAssetImageSource(imageProperties.assetId)
      if (!imageSourceUrl) {
        const missingImageNoticeElement = document.createElement('div')
        return (
          (missingImageNoticeElement.className = 'hb-unknown-component'),
          (missingImageNoticeElement.textContent = '尚未选择图片'),
          missingImageNoticeElement
        )
      }
      const imageElement = document.createElement('img')
      // 按实际显示尺寸取图（0.8.9）：一块 200×120 的控件不该下 4000×3000 的原图。
      // `mountDisplayImage` 内部只在可派生 URL 上生效，外链 / SVG 原样保留。
      mountDisplayImage(imageElement, imageSourceUrl)
      return (
        (imageElement.className = 'hb-image-component'),
        (imageElement.alt = imageProperties.alt || imageProperties.label || '图片'),
        (imageElement.draggable = false),
        (imageElement.style.objectFit = 'contain'),
        (imageElement.style.opacity = String(Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1))))),
        imageElement
      )
    },
  })
}
