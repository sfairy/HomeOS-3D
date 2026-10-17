/** 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 判据（粗指针 / 无 hover / iPad 伪装 Mac）已单点化到
 * `@homeos/shared/scene/touch-profile` —— 与主应用 `index.html` 里那份必须逐条一致，
 * 否则同一台设备在两个前端的档位会不一样。
 */
import { applyTouchProfile, watchTouchProfile } from "@homeos/shared/scene/touch-profile";

applyTouchProfile();
// 设备工具栏开关 / iPad 插拔妙控键盘会让媒体查询在页面存活期间改口，必须跟着重算，
// 否则 html.hos-touch 那一组规则失效：坞体保留实时 backdrop-filter，DPR 3 下每帧重模糊。
watchTouchProfile();
