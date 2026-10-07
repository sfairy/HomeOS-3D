const ENABLED_STORAGE_KEY = "homeos-dashboard-sound-enabled",
  CLICK_SOUND_URL = "/static/audio/button-click.mp3";
function readEnabledSetting() {
  try {
    const storedValue = window.localStorage.getItem(ENABLED_STORAGE_KEY);

    return storedValue !== "0";
  } catch {
    return true;
  }
}
export function createButtonSound() {
  let soundEnabled = readEnabledSetting();
  const audioElement = typeof Audio == "function" ? new Audio(CLICK_SOUND_URL) : null;
  return (
    audioElement && ((audioElement.preload = "auto"), (audioElement.volume = 0.42)),
    {
      isEnabled() {
        return soundEnabled;
      },
      setEnabled(nextEnabledValue: any) {
        soundEnabled = !!nextEnabledValue;
        try {
          window.localStorage.setItem(ENABLED_STORAGE_KEY, soundEnabled ? "1" : "0");
        } catch {}
        return soundEnabled;
      },
      toggle() {
        return this.setEnabled(!soundEnabled);
      },
      play() {
        if (!soundEnabled || !audioElement) return;
        const audioClip = audioElement.cloneNode(true) as HTMLAudioElement;
        ((audioClip.volume = audioElement.volume),
          (audioClip.currentTime = 0),
          audioClip.play().catch(() => {}));
      },
      /**
       * 释放底层 Audio 元素。
       *
       * 展示页现在是 shell 内的可重入路由，每次挂载都会新建一份按钮音；不释放的话，
       * 预加载的 mp3 会随视图反复进出累积（`preload="auto"` 会一直持有已解码缓冲）。
       */
      dispose() {
        if (!audioElement) return;
        audioElement.pause();
        audioElement.removeAttribute("src");
        audioElement.load();
      },
    }
  );
}
