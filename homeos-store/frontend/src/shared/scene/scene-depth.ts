/** 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 判据（粗指针 / 无 hover / iPad 伪装 Mac）已单点化到
 * `@homeos/shared/scene/touch-profile` —— 与主应用 `index.html` 里那份必须逐条一致，
 * 否则同一台设备在两个前端的档位会不一样。
 */
import { applyTouchProfile } from "@homeos/shared/scene/touch-profile";

applyTouchProfile();
