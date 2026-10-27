/** 入口场景的「动效档位」开关：给 <html> 挂 `.hos-touch` / 写 `data-hos-motion`。
 *
 * 判据（粗指针 / 无 hover / iPad 伪装 Mac / 视口宽度）已单点化到
 * `@homeos/shared/scene/touch-profile` —— 与主应用 `index.html` 里那份必须逐条一致，
 * 否则同一台设备在两个前端的档位会不一样。
 */
import { applyTouchProfile, watchTouchMotion } from "@homeos/shared/scene/touch-profile";

applyTouchProfile();
// 设备工具栏开关 / iPad 插拔妙控键盘 / 系统切换「减少动态效果」会让媒体查询在页面存活期间改口。
// 重算只往更省的一档走：双向切换会让同一批动画半路开又关，那本身就是闪烁。
watchTouchMotion();
