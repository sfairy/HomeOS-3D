/**
 * `icon-button` 与 `device-button` 控件：同一个 `buttonRenderer` 注册两次。
 *
 * 两者外观与交互一致，差异只在默认图标与尺寸，因此共用一个渲染器；
 * 拆成两份会立刻产生两套需要同步的图标 / 状态逻辑。渲染器本体在 `registry/button-renderer.js`。
 */
// 同门分片：button-renderer
import { buttonRenderer } from "../button-renderer.js?v=2609220052";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609220052";

// 两个类型名注册到同一份渲染器实例上，改一处即同时生效。
registerComponent("icon-button", buttonRenderer);

registerComponent("device-button", buttonRenderer);
