"""家庭模式入参校验与脏数据韧性冒烟。

覆盖的是 P1 里那批「参数不对却报 500 / 脏数据把列表接口整体打挂」的修复点：

1. **HTTP 层**：`config` / `triggers` / `sortOrder` 的类型错误必须被拦成 **400**
   （本项目复刻 Nest 的 ValidationPipe：Pydantic 校验失败即 400，不是 FastAPI 默认 422），
   数组元素不合格 → 400 ``VALIDATION_FAILED``；都不能让 `int()` / `json.dumps` 在服务里
   炸成 500；
2. **领域层**（不经过 Pydantic 的调用路径：`duplicate` / `reorder` / 导入合并）：同样的
   脏值必须走 :func:`bad_request` 变成 400 —— 这条路径以前是裸 `int(...)`，`"abc"` 会以
   `ValueError` 冒到全局处理器，看起来像服务端崩了；
3. **列表韧性**：库里某行的 `config` / `triggers` 被写坏（手工改库 / 老版本残留）时，
   `GET /modes` 必须照常 200 **并保留这一行**（配置按空值兜底 + 记日志），
   而不是整体 500 —— 整体 500 会让用户连删掉这条脏数据的机会都没有。

为什么值得单独立一条冒烟：这批修复点当时**零覆盖** —— `_coerce_int_field` 里漏了一个
`bad_request` 导入（真跑起来是 `NameError`），除 ruff 之外没有任何东西会拦住它。

主应用完整 lifespan + 进程内商店假发码（``_smoke_harness``）；不碰真实商店与 HA。
"""

from __future__ import annotations

import asyncio
from typing import Any

from _smoke_harness import (
    bootstrap_env,
    check,
    check_calls,
    csrf_headers,
    register_local_user,
    report,
    running_app,
)

bootstrap_env(prefix="homeos-home-mode-validation-")

from sqlalchemy import select
from src.platform.core.errors import BusinessException
from src.platform.core.models import HomeMode

USERNAME = "modevaluser"
EMAIL = "modeval@example.com"
PASSWORD = "ModeValPass123!"

API = "/api/v1/modes"


def _install_full_license(app) -> None:
    """整租约放行：本冒烟验的是入参校验，不是功能码门禁（那条另有冒烟）。"""
    app.state.license_service.allows = lambda *_args, **_kwargs: True


def _mode_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "冒烟模式",
        "config": [{"entity_id": "light.kitchen", "action": "on"}],
        "sortOrder": 3,
    }
    payload.update(overrides)
    return payload


def _create(client, app, payload: dict[str, Any]):
    return client.post(API, json=payload, headers=csrf_headers(client, app))


def _put(client, app, mode_id: str, payload: dict[str, Any]):
    return client.put(f"{API}/{mode_id}", json=payload, headers=csrf_headers(client, app))


def _assert_400_not_500(response, *, error_code: str) -> None:
    """统一的「必须 4xx 而不是 500」断言体（细节里带上真实响应，便于定位）。"""
    assert response.status_code == 400, f"期望 400，实际 {response.status_code} {response.text[:200]}"
    body = response.json()
    assert body.get("errorCode") == error_code, f"errorCode 期望 {error_code}，实际 {body}"


def _expect_business_400(action, label: str) -> None:
    """断言领域层抛的是**业务错误 400**（而不是 NameError / ValueError 这类崩）。"""

    def run() -> None:
        try:
            action()
        except BusinessException as error:
            assert error.status_code == 400, (
                f"期望 400，实际 {error.status_code}（{error.error_code}）"
            )
            return
        except Exception as error:
            raise AssertionError(
                f"应抛 BusinessException(400)，实际抛 {type(error).__name__}: {error}"
            ) from error
        raise AssertionError("没有抛错（脏值被静默接受了）")

    check_calls(label, run)


def _run(client, app) -> None:
    _install_full_license(app)
    register_local_user(client, app, username=USERNAME, email=EMAIL, password=PASSWORD)

    service = app.state.home_mode
    created: dict[str, Any] = {}

    # ── 1. HTTP 层：类型错误拦成 400（不是 500）────────────────────────────
    print("1) HTTP 层：DTO 类型错误与数组内容不合格都拦成 400（不是 500）")

    def _create_ok() -> None:
        response = _create(client, app, _mode_payload())
        assert response.status_code in (200, 201), f"{response.status_code} {response.text[:200]}"
        payload = response.json()
        created.update(payload)
        assert payload.get("sortOrder") == 3, payload
        assert isinstance(payload.get("sortOrder"), int), payload

    check_calls("合法入参 → 建模式成功且 sortOrder 是整数", _create_ok)
    check("拿得到新建模式的 id", bool(created.get("id")), created)

    def _bad_sort_order() -> None:
        _assert_400_not_500(
            _create(client, app, _mode_payload(name="坏排序", sortOrder="abc")),
            error_code="UNKNOWN",  # Nest ValidationPipe 形状：400 + errorCode=UNKNOWN
        )

    check_calls("sortOrder 传字符串 → 400（不是 500）", _bad_sort_order)

    def _bad_config_type() -> None:
        _assert_400_not_500(
            _create(client, app, _mode_payload(name="坏配置", config="not-a-list")),
            error_code="UNKNOWN",
        )

    check_calls("config 传字符串 → 400（不是 500）", _bad_config_type)

    def _bad_entity_id() -> None:
        # 这一层在 DTO 之后：数组元素的内容由领域校验器判，给的是稳定错误码。
        _assert_400_not_500(
            _create(client, app, _mode_payload(name="空实体", config=[{"entity_id": "  "}])),
            error_code="VALIDATION_FAILED",
        )

    check_calls("config 项缺 entity_id → 400 VALIDATION_FAILED", _bad_entity_id)

    def _bad_trigger_item() -> None:
        _assert_400_not_500(
            _create(client, app, _mode_payload(name="空触发器", triggers=[{}])),
            error_code="VALIDATION_FAILED",
        )

    check_calls("triggers 项缺 type → 400 VALIDATION_FAILED", _bad_trigger_item)

    def _bad_priority_on_update() -> None:
        _assert_400_not_500(
            _put(client, app, created["id"], {"priority": {"nested": 1}}),
            error_code="UNKNOWN",
        )

    check_calls("PUT priority 传对象 → 400（不是 500）", _bad_priority_on_update)

    def _reorder_bad_sort_order() -> None:
        response = client.post(
            f"{API}/reorder",
            json={"items": [{"id": created["id"], "sortOrder": "first"}]},
            headers=csrf_headers(client, app),
        )
        _assert_400_not_500(response, error_code="UNKNOWN")

    check_calls("reorder 的 sortOrder 传字符串 → 400（不是 500）", _reorder_bad_sort_order)

    # ── 2. 领域层：不经过 Pydantic 的路径也必须给 400 ────────────────────────
    print("2) 领域层（复制 / 排序 / 导入路径）：脏整数给 400，不给 NameError / ValueError")

    test = _mode_payload(name="领域层脏值", config=[])

    _expect_business_400(
        lambda: asyncio.run(service.create({**test, "sortOrder": "abc"})),
        "service.create(sortOrder='abc') → 400（不是 NameError）",
    )

    # 布尔是 int 的子类：`int(True) == 1` 会静默把 true 当成 1 存下来，必须显式拒绝。
    _expect_business_400(
        lambda: asyncio.run(service.create({**test, "sortOrder": True})),
        "service.create(sortOrder=True) → 400（布尔不当 1 用）",
    )

    _expect_business_400(
        lambda: asyncio.run(service.update(created["id"], {"priority": {}})),
        "service.update(priority={}) → 400",
    )

    _expect_business_400(
        lambda: asyncio.run(service.reorder([{"id": created["id"], "sortOrder": "abc"}])),
        "service.reorder(sortOrder='abc') → 400",
    )

    def _numeric_string_domain() -> None:
        result = asyncio.run(service.create({**test, "sortOrder": "7", "priority": "12"}))
        assert result.get("sortOrder") == 7, result
        assert result.get("priority") == 12, result
        assert isinstance(result.get("sortOrder"), int), result

    check_calls("数字字符串仍按数字收（表单常这么传）", _numeric_string_domain)

    def _valid_reorder() -> None:
        rows = asyncio.run(service.reorder([{"id": created["id"], "sortOrder": "9"}]))
        target = next((item for item in rows if item.get("id") == created["id"]), None)
        assert target is not None, "reorder 没返回这条模式"
        assert target.get("sortOrder") == 9, target

    check_calls("合法 reorder 生效（'9' → 9）", _valid_reorder)

    # ── 3. 列表韧性：一行脏 JSON 不该把整张列表打挂 ─────────────────────────
    print("3) 列表韧性：库里某行配置被写坏 → 列表照常 200 且保留该行")

    dirty_id = asyncio.run(service.create(_mode_payload(name="脏数据模式", config=[])))["id"]
    with app.state.database.session_factory() as session:
        row = session.scalars(select(HomeMode).where(HomeMode.id == dirty_id)).one()
        row.config = "{ 这不是 JSON"
        session.commit()

    def _list_survives_with_dirty_config() -> None:
        response = client.get(API)
        assert response.status_code == 200, f"{response.status_code} {response.text[:200]}"
        rows = response.json()
        target = next((item for item in rows if item.get("id") == dirty_id), None)
        assert target is not None, "脏数据那一行被整体吞掉了（用户连删都删不掉）"
        assert target.get("config") == [], target.get("config")

    check_calls("脏 config 行按空数组兜底且仍可见", _list_survives_with_dirty_config)

    def _list_survives_with_dirty_triggers() -> None:
        with app.state.database.session_factory() as session:
            row = session.scalars(select(HomeMode).where(HomeMode.id == dirty_id)).one()
            row.triggers = "]["
            session.commit()
        response = client.get(API)
        assert response.status_code == 200, f"{response.status_code} {response.text[:200]}"
        rows = response.json()
        target = next((item for item in rows if item.get("id") == dirty_id), None)
        assert target is not None, "脏 triggers 那一行被整体吞掉了"
        assert target.get("triggers") is None, target.get("triggers")

    check_calls("脏 triggers 行兜底为 null 且仍可见", _list_survives_with_dirty_triggers)

    def _dirty_row_still_readable() -> None:
        response = client.get(f"{API}/{dirty_id}")
        assert response.status_code == 200, f"{response.status_code} {response.text[:200]}"
        assert response.json().get("id") == dirty_id, response.json()

    check_calls("脏数据行仍能单独读取", _dirty_row_still_readable)

    def _dirty_row_deletable() -> None:
        response = client.delete(f"{API}/{dirty_id}", headers=csrf_headers(client, app))
        assert response.status_code in (200, 204), f"{response.status_code} {response.text[:200]}"

    check_calls("脏数据行仍可删除（可自愈）", _dirty_row_deletable)

    def _missing_mode_reads_as_null() -> None:
        # Nest 契约：查不到返回 null（不是 404）。这里把现行为钉住 —— 前端按 null 判空。
        response = client.get(f"{API}/nonexistent-mode-id")
        assert response.status_code == 200, f"{response.status_code} {response.text[:200]}"
        assert response.json() is None, response.json()

    check_calls("GET 不存在的模式 → 200 + null（Nest 契约）", _missing_mode_reads_as_null)

    def _missing_mode_delete_is_404() -> None:
        response = client.delete(f"{API}/nonexistent-mode-id", headers=csrf_headers(client, app))
        assert response.status_code == 404, f"{response.status_code} {response.text[:200]}"

    check_calls("DELETE 不存在的模式 → 404（不是 500）", _missing_mode_delete_is_404)


def main() -> None:
    with running_app() as (client, app):
        _run(client, app)
    report("SMOKE OK — 家庭模式入参校验：4xx 而非 500，脏数据不炸列表")


if __name__ == "__main__":
    main()
