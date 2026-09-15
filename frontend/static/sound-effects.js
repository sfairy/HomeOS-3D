const SOUND_ENABLED_STORAGE_KEY = "homeos-dashboard-sound-enabled",
  BUTTON_CLICK_SOUND_URL = "/static/audio/button-click.mp3?v=20260915211726";
function isSoundEnabled() {
  try {
    const storedValue = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    return storedValue === null ? !0 : storedValue !== "0";
  } catch {
    return !0;
  }
}
export function createButtonSound() {
  let enabled = isSoundEnabled();
  const audioTemplate = typeof Audio == "function" ? new Audio(BUTTON_CLICK_SOUND_URL) : null;
  return (
    audioTemplate && ((audioTemplate.preload = "auto"), (audioTemplate.volume = 0.42)),
    {
      isEnabled() {
        return enabled;
      },
      setEnabled(enabledValue) {
        enabled = !!enabledValue;
        try {
          window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
        } catch {}
        return enabled;
      },
      toggle() {
        return this.setEnabled(!enabled);
      },
      play() {
        if (!enabled || !audioTemplate) return;
        const audioClone = audioTemplate.cloneNode(!0);
        ((audioClone.volume = audioTemplate.volume),
          (audioClone.currentTime = 0),
          audioClone.play().catch(() => {}));
      }
    }
  );
}
