"""增量模块功能码门禁冒烟：base 租约 vs 全功能码集合。

在临时数据目录上跑 lifespan，注册本机账号后，用 ``license_service.allows`` 替身
模拟「仅 base」与「base + 全部 module.*」两种签发结果，断言：

- ``GET /events/reports/compare?metric=energy`` —— 无 ``module.energy`` 时 403
- ``GET /channels/status`` —— 无 ``module.notifications`` 时 403
- ``ha_proxy._camera_license_allows`` —— 无 ``module.security`` 时 False

商店假发码走 ``_smoke_harness``；不碰真实商店与 HA。
"""

from __future__ import annotations

import asyncio
import types

from _smoke_harness import (
    FAKE_CODE,
    bootstrap_env,
    check,
    csrf_headers,
    register_local_user,
    report,
    running_app,
)

bootstrap_env(prefix="homeos-feature-gate-smoke-")

from datetime import UTC, datetime  # noqa: E402

from src.api import ha_proxy  # noqa: E402
from src.domains.license import features as feature_codes  # noqa: E402

USERNAME = "gateuser"
EMAIL = "gate@example.com"
PASSWORD = "GatePass123!"

BASE_CODES = frozenset(
    feature["code"] for feature in feature_codes.CATALOG["features"] if feature.get("base")
)
FULL_CODES = frozenset(feature["code"] for feature in feature_codes.CATALOG["features"])


def install_allows(app, codes: frozenset[str]):
    """按码集合判定；无参调用（整租约有效）一律放行。"""

    def allows(feature: str | None = None, *, database=None) -> bool:
        if feature is None:
            return True
        return feature_codes.granted(sorted(codes), [], feature, now=datetime.now(UTC))

    app.state.license_service.allows = allows  # type: ignore[method-assign]
    ha_proxy._camera_license_cache.clear()


class _RecordingLicenseService:
    """记录「被问了哪个功能码」的许可替身，供摄像头门禁的行为断言使用。"""

    def __init__(self, verdict: bool) -> None:
        self.verdict = verdict
        self.asked: list[str | None] = []

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        self.asked.append(feature)
        return self.verdict


def _check_camera_gate_asks_for_security_code() -> tuple[bool, str]:
    """摄像头实时流必须问 ``module.security``，不能用基础 ``api`` 码放行。

    行为断言：给 ``_camera_license_allows`` 一个记录「被问了什么」的许可替身，直接调用
    它并断言问到的正是 ``FEATURE_SECURITY``。此前这里比对 ``inspect.getsource`` 的字符串，
    注释里写一行 ``FEATURE_SECURITY`` 就能骗过，且 ``ruff format`` 一改就红。
    """
    recorder = _RecordingLicenseService(verdict=False)
    request = types.SimpleNamespace(app=types.SimpleNamespace(state=types.SimpleNamespace(license_service=recorder)))
    ha_proxy._camera_license_cache.clear()
    allowed = asyncio.run(ha_proxy._camera_license_allows(request))
    asked = list(recorder.asked)
    return (
        asked == [feature_codes.FEATURE_SECURITY] and allowed is recorder.verdict,
        f"问到的功能码 {asked}（期望 [{feature_codes.FEATURE_SECURITY!r}]），返回 {allowed!r}（期望 {recorder.verdict!r}）",
    )


def main() -> None:
    with running_app() as (client, app):
        headers = csrf_headers(client, app)

        print("1) 注册本机账号")
        r = register_local_user(
            client, app, username=USERNAME, email=EMAIL, password=PASSWORD, code=FAKE_CODE
        )
        check(
            "POST /auth/register 201",
            r.status_code in (200, 201),
            f"{r.status_code} {r.text}",
        )

        print("2) 仅 base 功能码 —— 能耗 / 通知通道 / 摄像头应拒")
        install_allows(app, BASE_CODES)

        r = client.get("/api/v1/events/reports/compare", params={"metric": "energy"})
        detail = (
            r.json().get("detail")
            if r.headers.get("content-type", "").startswith("application/json")
            else None
        )
        check(
            "energy compare base → 403 LICENSE_RESTRICTED",
            r.status_code == 403
            and isinstance(detail, dict)
            and detail.get("code") == "LICENSE_RESTRICTED",
            f"{r.status_code} {r.text}",
        )

        r = client.get("/api/v1/channels/status")
        detail = (
            r.json().get("detail")
            if r.headers.get("content-type", "").startswith("application/json")
            else None
        )
        check(
            "channels/status base → 403 LICENSE_RESTRICTED",
            r.status_code == 403
            and isinstance(detail, dict)
            and detail.get("code") == "LICENSE_RESTRICTED",
            f"{r.status_code} {r.text}",
        )

        camera_check = _check_camera_gate_asks_for_security_code()
        check(
            "camera license 询问 FEATURE_SECURITY（而非基础 api 码）",
            camera_check[0],
            camera_check[1],
        )
        check(
            "camera FEATURE_SECURITY base → False",
            app.state.license_service.allows(feature_codes.FEATURE_SECURITY) is False,
        )

        r = client.get("/api/v1/events/reports/compare", params={"metric": "device"})
        check(
            "device compare base → 非 403（非能耗指标）",
            r.status_code != 403 and r.status_code < 500,
            f"{r.status_code} {r.text}",
        )

        print("3) 全功能码 —— 能耗 / 通知通道 / 摄像头应放行门禁层")
        install_allows(app, FULL_CODES)

        r = client.get("/api/v1/events/reports/compare", params={"metric": "energy"})
        check(
            "energy compare full → 非 403",
            r.status_code != 403 and r.status_code < 500,
            f"{r.status_code} {r.text}",
        )

        r = client.get("/api/v1/channels/status")
        check(
            "channels/status full → 非 403",
            r.status_code != 403 and r.status_code < 500,
            f"{r.status_code} {r.text}",
        )

        check(
            "camera FEATURE_SECURITY full → True",
            app.state.license_service.allows(feature_codes.FEATURE_SECURITY) is True,
        )

        print("4) system_config 分区写入：base 拒 energy，full 放行")
        install_allows(app, BASE_CODES)
        r = client.put(
            "/api/v1/system/config",
            json={"energy": {"enabled": True}},
            headers=headers,
        )
        check(
            "PUT energy section base → 403",
            r.status_code == 403,
            f"{r.status_code} {r.text}",
        )

        install_allows(app, FULL_CODES)
        # 全功能下门禁层必须放行：允许业务层 200/409（乐观锁）等，但不得是 403 或 5xx。
        r = client.put(
            "/api/v1/system/config",
            json={"energy": {}},
            headers=headers,
        )
        check(
            "PUT energy section full → 门禁放行（非 403 且非 5xx）",
            r.status_code != 403 and r.status_code < 500,
            f"{r.status_code} {r.text}",
        )

    report("ALL PASSED")


if __name__ == "__main__":
    main()
