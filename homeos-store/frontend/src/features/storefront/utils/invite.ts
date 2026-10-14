/** 邀请码的本地留存。 */

import { reportBestEffort } from "@store/shared/utils/best-effort";

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
  } catch (error) {
    // 隐私模式 / 存储被禁时 localStorage 会抛：丢掉邀请码是可接受的降级
    //（没邀请码也能正常下单，只是拿不到返利），但要留痕。
    reportBestEffort("邀请码本地留存（隐私模式或存储被禁）", error);
  }
  return "";
}

export function clearInvite() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    reportBestEffort("清除本地邀请码", error);
  }
}
