"""家庭模式联动仲裁器（对齐 home-mode/linkage-arbiter.util.ts）。

多源激活（manual / voice / agent / security / weather / calendar / presence / energy /
trigger）之间仲裁优先级，避免低优先级联动无声覆盖用户手动模式。
"""

from __future__ import annotations

import time
from typing import Any

HOME_MODE_LINKAGE_PRIORITY: dict[str, int] = {
    "manual": 100,
    "voice": 95,
    "agent": 90,
    "security": 80,
    "weather_linkage": 70,
    "calendar": 60,
    "presence": 55,
    "everyone_left": 55,
    "energy_linkage": 40,
    "advisor": 30,
    "trigger": 25,
    "time": 20,
    "automation": 20,
    "entity": 20,
    "deactivate": 10,
}

DEFAULT_CLAIM_TTL_MS = 15 * 60_000
DEFAULT_MANUAL_LOCK_MS = 30 * 60_000


def _is_user_driven_source(source: str) -> bool:
    return source in ("manual", "voice", "agent")


def _now_ms() -> int:
    return int(time.time() * 1000)


class HomeModeLinkageArbiter:
    def __init__(self) -> None:
        self._claim: dict[str, Any] | None = None

    def get_claim(self) -> dict[str, Any] | None:
        self._prune()
        return self._claim

    def release(self) -> None:
        self._claim = None

    def try_acquire(
        self,
        source: str | None,
        claim_ttl_ms: int | None = None,
        manual_lock_ms: int | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        timestamp = now if now is not None else _now_ms()
        self._prune(timestamp)
        src = str(source or "trigger").strip() or "trigger"
        priority = HOME_MODE_LINKAGE_PRIORITY.get(src, 15)

        claim = self._claim
        if claim and claim.get("userLocked") and not _is_user_driven_source(src):
            return {"ok": False, "reason": f"用户手动锁定中（来源 {claim['source']}）"}
        if claim and priority < claim["priority"]:
            return {"ok": False, "reason": f"联动优先级不足（{src}<{claim['source']}）"}

        manual_lock = manual_lock_ms if manual_lock_ms is not None else DEFAULT_MANUAL_LOCK_MS
        claim_ttl = claim_ttl_ms if claim_ttl_ms is not None else DEFAULT_CLAIM_TTL_MS
        user_locked = _is_user_driven_source(src)
        ttl = max(claim_ttl, manual_lock) if user_locked else claim_ttl
        self._claim = {
            "source": src,
            "priority": priority,
            "until": timestamp + ttl,
            "userLocked": user_locked,
        }
        return {"ok": True}

    def _prune(self, now: int | None = None) -> None:
        timestamp = now if now is not None else _now_ms()
        if self._claim and self._claim["until"] <= timestamp:
            self._claim = None
