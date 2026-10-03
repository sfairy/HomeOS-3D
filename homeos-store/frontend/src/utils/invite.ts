/** 邀请码的本地留存（移植自 `referrals.ts` 顶部逻辑）。 */

const STORAGE_KEY = "hb_invite_v1";

interface SavedInvite {
  code?: string;
  expires?: number;
}

/** 从 `?invite=` 捕获并留存，返回当前有效的邀请码。 */
export function readInvite(): string {
  try {
    const code = new URL(location.href).searchParams.get("invite");
    if (code && /^[0-9]{6}$/.test(code)) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code, expires: Date.now() + 30 * 86400000 }),
      );
      return code;
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as SavedInvite | null;
    if (saved?.expires && saved.expires > Date.now() && saved.code && /^[0-9]{6}$/.test(saved.code)) {
      return saved.code;
    }
    if (saved) localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 隐私模式下 localStorage 可能不可用。 */
  }
  return "";
}

export function clearInvite() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略。 */
  }
}
