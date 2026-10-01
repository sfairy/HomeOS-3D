const o = "ha-bridge-dashboard-sound-enabled",
  u = "/bridge-static/audio/button-click.mp3?v=20260826-button-sound-v1";
function r() {
  try {
    const t = window.localStorage.getItem(o);
    return t === null ? true : t !== "0";
  } catch {
    return true;
  }
}
export function createButtonSound() {
  let t = r();
  const e = typeof Audio == "function" ? new Audio(u) : null;
  return (
    e && ((e.preload = "auto"), (e.volume = 0.42)),
    {
      isEnabled() {
        return t;
      },
      setEnabled(n) {
        t = !!n;
        try {
          window.localStorage.setItem(o, t ? "1" : "0");
        } catch {}
        return t;
      },
      toggle() {
        return this.setEnabled(!t);
      },
      play() {
        if (!t || !e) return;
        const n = e.cloneNode(true);
        ((n.volume = e.volume), (n.currentTime = 0), n.play().catch(() => {}));
      },
    }
  );
}
