/**
 * 入口场景的「动效档位」开关：给 `<html>` 挂 `.hos-touch` / 写 `data-hos-motion`。
 *
 * 必须在首帧前跑完：登录 / 注册 / 授权场景的样式里有整组 ``html[data-hos-motion=…] …``
 * 规则（手持档关重动效 / 平板只放行纯 transform·opacity 的环境动效），而这些规则只能靠
 * 这个属性生效。所以它是 ``index.html`` 里的普通阻塞脚本（不导出、不 defer），由
 * ``vite-studio.ts`` 以 ``app/auth/scene/scene-depth`` 为入口产出
 * ``/static/auth/scene/scene-depth.js``。
 *
 * 判据本身（粗指针 / 无 hover / iPad 伪装 Mac / 视口宽度）已单点化到
 * ``@homeos/shared/scene/touch-profile`` —— 与商店 ``main.ts`` 里那份必须逐条一致，
 * 否则同一台设备在两个前端的档位会不一样。
 *
 * 唯一的手抄件是 ``public/static/auth/scene/scene-depth.js``：它是构建缺口时的兜底资源，
 * 由后端直接伺服、不经过打包，无法 import，改动判据时须与 ``@homeos/shared/scene/touch-profile`` 同步。
 */
import { applyTouchProfile, watchTouchMotion } from '@homeos/shared/scene/touch-profile'

applyTouchProfile()
// 设备工具栏开关 / iPad 插拔妙控键盘 / 系统切换「减少动态效果」都会让媒体查询在页面存活期间
// 改口。重算只往更省的一档走（见 touch-profile.ts 的「单调降级」）：双向切换会让同一批动画
// 半路开又关，那本身就是闪烁。
watchTouchMotion()
