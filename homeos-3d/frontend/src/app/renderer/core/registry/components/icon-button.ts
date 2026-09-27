
type AnyObj = Record<string, any>;
// 同门分片：button-renderer
import { buttonRenderer } from "../button-renderer.js";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js";

// 两个类型名注册到同一份渲染器实例上，改一处即同时生效。
registerComponent("icon-button", buttonRenderer);

registerComponent("device-button", buttonRenderer);
