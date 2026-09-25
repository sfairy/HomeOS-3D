/**
 * `image` 控件：只做资源解析与等比铺放；没有资源时在编辑器里给出「尚未选择图片」提示。
 */
// 同门分片：builtin-assets
import { staticAssetImageSource } from "../builtin-assets.js?v=2609252218";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609252218";

// 图片控件：只做资源解析与等比铺放；没有资源时在编辑器里给出「尚未选择图片」提示。
registerComponent("image", {
  render(imageComponent) {
    const imageProperties = imageComponent.properties || {};
    const imageSource = staticAssetImageSource(imageProperties.assetId);
    if (!imageSource) {
      const imageEmptyElement = document.createElement("div");
      imageEmptyElement.className = "hb-unknown-component";
      imageEmptyElement.textContent = "尚未选择图片";
      return imageEmptyElement;
    }
    const imageElement = document.createElement("img");
    imageElement.className = "hb-image-component";
    imageElement.src = imageSource;
    imageElement.alt = imageProperties.alt || imageProperties.label || "图片";
    imageElement.draggable = false;
    imageElement.style.objectFit = "contain";
    imageElement.style.opacity = String(
      Math.max(0, Math.min(1, Number(imageProperties.opacity ?? 1)))
    );
    return imageElement;
  }
});
