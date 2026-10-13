/**
 * 摄像机的「来源是否配置完整」判定：go2rtc 看地址填没填，否则看有没有绑 HA 实体。
 *
 * 为什么放在 platform 而不是 `runtime/camera/camera-status.ts`：2D 弹窗挂载
 * （`app/renderer/registry/register-all.ts`）与 3D 舞台状态球
 * （`runtime/camera/camera-status.ts`）都要用它，而 app ↛ runtime 是硬边界
 * （见 `scripts/check-studio-deps.mjs`，白名单只减不增）。判定是纯函数，
 * 放平台层共用一份，避免同一份绑定在两处得出不同结论。
 *
 * go2rtc 来源本来就不需要 HA 实体，所以这里不能只看 `entityId`，否则它会永远
 * 被判成「没配好」而既不显示图标也不挂载传输。
 */
export function cameraSourceConfigured(cameraBinding: any) {
  return !!(
    cameraBinding?.cameraSource === "go2rtc"
      ? String(cameraBinding.go2rtcUrl || "").trim()
      : cameraBinding?.entityId
  );
}
