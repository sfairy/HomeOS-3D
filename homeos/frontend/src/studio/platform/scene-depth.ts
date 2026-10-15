/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 必须在首帧前跑完：登录 / 注册 / 授权场景的样式里有整组 ``html.hos-touch …`` 规则
 * （触摸设备上关掉重动画），而这些规则只能靠这个 class 生效。所以它是
 * ``index.html`` 里的普通阻塞脚本（不导出、不 defer），由 ``vite-studio.ts``
 * 以 ``app/auth/scene/scene-depth`` 为入口产出 ``/static/auth/scene/scene-depth.js``。
 *
 * 判据本身（粗指针 / 无 hover / iPad 伪装 Mac）已单点化到
 * ``@homeos/shared/scene/touch-profile`` —— 与商店 ``main.ts`` 里那份必须逐条一致，
 * 否则同一台设备在两个前端的档位会不一样。
 *
 * 唯一的手抄件是 ``public/static/auth/scene/scene-depth.js``：它是构建缺口时的兜底资源，
 * 由后端直接伺服、不经过打包，无法 import，改动判据时须与 ``@homeos/shared/scene/touch-profile`` 同步。
 */
import { applyTouchProfile } from '@homeos/shared/scene/touch-profile'

applyTouchProfile()
