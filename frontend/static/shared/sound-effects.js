/**
 * 面板按钮点击音效。
 *
 * 展示页 / 编辑器运行时的交互反馈模块，由页面在需要时构造实例：维护「音效开关」的本地持久化，
 * 并在按钮点击时播放一次点击音。开关存在 localStorage（homeos-dashboard-sound-enabled），默认
 * 开启；播放用 Audio 克隆节点，保证快速连点时每次都能从头出声。
 */
const SOUND_ENABLED_STORAGE_KEY = "homeos-dashboard-sound-enabled",
  BUTTON_CLICK_SOUND_URL = "/static/audio/button-click.mp3?v=2609230040";

// 读取音效开关：存储项缺失视为开启；隐私模式禁读 localStorage 时同样兜底为开启。
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
  // 预先声明 preload 与音量，避免首次点击才加载导致延迟发声。
  return (
    audioTemplate && ((audioTemplate.preload = "auto"), (audioTemplate.volume = 0.42)),
    {
      isEnabled() {
        return enabled;
      },
      setEnabled(enabledValue) {
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
        // 浏览器也可能因自动播放策略拒绝播放，静默吞掉 Promise 拒绝。
        const audioClone = audioTemplate.cloneNode(!0);
        ((audioClone.volume = audioTemplate.volume),
          (audioClone.currentTime = 0),
          // 自动播放策略会挡下第一次 play()：点不到就算了，不该冒出未处理的拒绝。
          audioClone.play().catch(() => {}));
      }
    }
  );
}
