/**
 * `interaction3d` 控件：3D 交互舞台由独立模块 `bridge/bridge.js` 实现，这里只做注册。
 *
 * 历史上这条注册写在 `registry.js` 顶部、先于其它控件，改成 `components/*.js` 后顺序不再有意义：
 * 注册只往 Map 里写键，`renderRegisteredComponent` 在页面渲染时才会读。
 */
import { renderInteraction3d } from "../../../../bridge/bridge.js?v=20260921152526";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=20260921152526";

// 3D 交互控件由独立模块（bridge/bridge.js）实现，这里先行注册，
// 使页面脚本只需要 import registry.js 就能拿到完整的控件渲染器集合。
registerComponent("interaction3d", {
  render: renderInteraction3d
});
