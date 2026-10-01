const ENABLED_STORAGE_KEY = "ha-bridge-dashboard-sound-enabled",
  CLICK_SOUND_URL = "/bridge-static/audio/button-click.mp3?v=20260826-button-sound-v1";
function readEnabledSetting() {
  try {
    const storedValue = window.localStorage.getItem(ENABLED_STORAGE_KEY);
    return storedValue === null ? true : storedValue !== "0";
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
      setEnabled(nextEnabledValue) {
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
        const audioClip = audioElement.cloneNode(true);
        ((audioClip.volume = audioElement.volume),
          (audioClip.currentTime = 0),
          audioClip.play().catch(() => {}));
      },
    }
  );
}
