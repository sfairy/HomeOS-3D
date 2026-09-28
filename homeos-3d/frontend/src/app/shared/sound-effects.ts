/**
 * 面板按钮点击音效。
 */

const SOUND_ENABLED_STORAGE_KEY = "homeos-dashboard-sound-enabled",
  BUTTON_CLICK_SOUND_URL = "/static/audio/button-click.mp3";

function isSoundEnabled() {
  try {
    const storedValue = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    return storedValue === null ? !0 : storedValue !== "0";
  } catch {
    return !0;
  }
}

/**
 * 创建按钮音效控制器。
 */
export function createButtonSound() {
  let enabled = isSoundEnabled();
  // 无 Audio 构造器（老环境 / SSR）时置 null，后续调用自动降级为静默。
  const audioTemplate = typeof Audio == "function" ? new Audio(BUTTON_CLICK_SOUND_URL) : null;
  return (
    audioTemplate && ((audioTemplate.preload = "auto"), (audioTemplate.volume = 0.42)),
    {
      isEnabled() {
        return enabled;
      },
      setEnabled(enabledValue: any) {
        enabled = !!enabledValue;
        try {
          // 写失败（无痕模式）不影响内存中的开关状态。
          window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
        } catch {}
        return enabled;
      },
      toggle() {
        return this.setEnabled(!enabled);
      },
      play() {
        if (!enabled || !audioTemplate) return;
        // 克隆节点而非复用同一个 Audio：并发点击时各自的 currentTime 互不干扰；
        const audioClone = audioTemplate.cloneNode(!0) as HTMLAudioElement;
        ((audioClone.volume = audioTemplate.volume),
          (audioClone.currentTime = 0),
          // 自动播放策略会挡下第一次 play()：点不到就算了，不该冒出未处理的拒绝。
          audioClone.play().catch(() => {}));
      }
    }
  );
}
