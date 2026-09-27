import { renderInteraction3d } from "../../../../bridge/bridge.js?v=2609271508";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609271508";

// 3D 交互控件由独立模块（bridge/bridge.js）实现，这里先行注册，
registerComponent("interaction3d", {
  render: renderInteraction3d
});
