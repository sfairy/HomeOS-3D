/**
 * 摄像头弹窗里 go2rtc 播放地址的前端预校验（运行时入口）。
 *
 * 实现在 `platform/go2rtc-url.ts` —— 保存草稿前的整体预校验（app 层）与运行时摄像头挂载
 * 都要用同一份规则，而 app ↛ runtime 是硬边界，所以事实放在 platform。这里保留同名模块
 * 只是为了让 `modules/runtime/camera/go2rtc-url.js` 继续作为构建入口存在
 * （清单白名单按文件生成，路径不能消失）。
 */
export { validateGo2rtcDocument, validateGo2rtcUrl } from "@/studio/platform/go2rtc-url";
