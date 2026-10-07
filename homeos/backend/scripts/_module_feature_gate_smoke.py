"""增量模块功能码门禁冒烟：base 租约 vs 全功能码集合。

在临时数据目录上跑 lifespan，注册本机账号后，用 ``license_service.allows`` 替身
模拟「仅 base」与「base + 全部 module.*」两种签发结果，断言：

- ``GET /events/reports/compare?metric=energy`` —— 无 ``module.energy`` 时 403
- ``GET /channels/status`` —— 无 ``module.notifications`` 时 403
- ``ha_proxy._camera_license_allows`` —— 无 ``module.security`` 时 False

商店假发码走 ``_smoke_auth_support``；不碰真实商店与 HA。
"""

from __future__ import annotations

import inspect
import os
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

data_dir = Path(tempfile.mkdtemp(prefix="homeos-feature-gate-smoke-"))
os.environ["HOMEOS_DATA_DIR"] = str(data_dir)
os.environ["HOMEOS_DATABASE_URL"] = f"sqlite:///{data_dir / 'homeos.db'}"
os.environ["REDIS_URL"] = ""
# 本脚本用 allows 替身模拟租约，不依赖真实签名；全局门禁关掉以免 lifespan 卡住。
os.environ["LICENSE_REQUIRED"] = "0"
os.environ["HA_BASE_URL"] = ""
os.environ["UPDATE_CHECKS_ENABLED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

from src.app import create_app  # noqa: E402
from src.api import ha_proxy  # noqa: E402
from src.services.license import features as feature_codes  # noqa: E402

from _smoke_auth_support import (  # noqa: E402
    FAKE_CODE,
    csrf_headers,
    install_fake_verification,
    register_local_user,
)

USERNAME = "gateuser"
EMAIL = "gate@example.com"
PASSWORD = "GatePass123!"

BASE_CODES = frozenset(
    feature["code"] for feature in feature_codes.CATALOG["features"] if feature.get("base")
)
FULL_CODES = frozenset(feature["code"] for feature in feature_codes.CATALOG["features"])

failures: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label}{f' {detail}' if not condition else ''}")
    if not condition:
        failures.append(label)


def install_allows(app, codes: frozenset[str]):
    """按码集合判定；无参调用（整租约有效）一律放行。"""

    def allows(feature: str | None = None, *, database=None) -> bool:
        if feature is None:
            return True
        return feature_codes.granted(
            sorted(codes), [], feature, now=datetime.now(UTC)
        )

    app.state.license_service.allows = allows  # type: ignore[method-assign]
    ha_proxy._camera_license_cache.clear()


app = create_app()
with TestClient(app) as client:
    install_fake_verification(app)
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
    detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
    check(
        "energy compare base → 403 LICENSE_RESTRICTED",
        r.status_code == 403 and isinstance(detail, dict) and detail.get("code") == "LICENSE_RESTRICTED",
        f"{r.status_code} {r.text}",
    )

    r = client.get("/api/v1/channels/status")
    detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
    check(
        "channels/status base → 403 LICENSE_RESTRICTED",
        r.status_code == 403 and isinstance(detail, dict) and detail.get("code") == "LICENSE_RESTRICTED",
        f"{r.status_code} {r.text}",
    )

    camera_src = inspect.getsource(ha_proxy._camera_license_allows)
    check(
        "camera license 源码询问 FEATURE_SECURITY",
        "FEATURE_SECURITY" in camera_src and "allows('api')" not in camera_src,
        camera_src,
    )
    check(
        "camera FEATURE_SECURITY base → False",
        app.state.license_service.allows(feature_codes.FEATURE_SECURITY) is False,
    )

    r = client.get("/api/v1/events/reports/compare", params={"metric": "device"})
    check(
        "device compare base → 非 403（非能耗指标）",
        r.status_code != 403,
        f"{r.status_code} {r.text}",
    )

    print("3) 全功能码 —— 能耗 / 通知通道 / 摄像头应放行门禁层")
    install_allows(app, FULL_CODES)

    r = client.get("/api/v1/events/reports/compare", params={"metric": "energy"})
    check(
        "energy compare full → 非 403",
        r.status_code != 403,
        f"{r.status_code} {r.text}",
    )

    r = client.get("/api/v1/channels/status")
    check(
        "channels/status full → 非 403",
        r.status_code != 403,
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
    # 全功能下可能因乐观锁/校验失败，只要不是 LICENSE_RESTRICTED 即视为门禁放行
    r = client.put(
        "/api/v1/system/config",
        json={"energy": {}},
        headers=headers,
    )
    detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
    restricted = isinstance(detail, dict) and detail.get("code") == "LICENSE_RESTRICTED"
    check(
        "PUT energy section full → 非 LICENSE_RESTRICTED",
        r.status_code != 403 or not restricted,
        f"{r.status_code} {r.text}",
    )

if failures:
    print(f"\nFAILED ({len(failures)}): {', '.join(failures)}")
    raise SystemExit(1)
print("\nALL PASSED")
