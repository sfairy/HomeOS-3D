"""阶段 5.1 端到端复核：HTTP /ha/services/call 的服务白名单仍生效（导入抽取后回归）。"""

from __future__ import annotations

from _smoke_harness import (
    bootstrap_env,
    check,
    csrf_headers,
    register_local_user,
    report,
    running_app,
)

bootstrap_env(prefix="homeos-p51-")

# 冒烟专用固定口令（非真实凭据）。
SMOKE_ADMIN_PASSWORD = "Passw0rd!234"


def main() -> None:
    with running_app() as (client, app):
        # 首装改为单用户注册：注册成功即建立会话，后续写请求带上 CSRF 头部即可。
        r = register_local_user(
            client,
            app,
            username="smokeadmin",
            email="smokeadmin@example.com",
            password=SMOKE_ADMIN_PASSWORD,
        )
        print("register:", r.status_code, str(r.json())[:120])
        check("本机账号注册成功", r.status_code == 201, f"{r.status_code} {r.text[:160]}")

        headers = csrf_headers(client, app)
        csrf_name = app.state.settings.csrf_cookie_name
        check("CSRF Cookie 已下发", bool(client.cookies.get(csrf_name)), dict(client.cookies))

        # 1) 白名单外服务 → 403
        r = client.post(
            "/api/v1/ha/services/call",
            json={"domain": "light", "service": "reload", "entity_id": "light.x", "data": {}},
            headers=headers,
        )
        check(
            "白名单外服务被拒绝(403)",
            r.status_code == 403 and "不在允许列表" in r.text,
            f"{r.status_code} {r.text[:160]}",
        )

        # 2) 白名单内服务 + 非法参数 → 422
        r = client.post(
            "/api/v1/ha/services/call",
            json={
                "domain": "light",
                "service": "turn_on",
                "entity_id": "light.x",
                "data": {"bad_field": 1},
            },
            headers=headers,
        )
        check(
            "白名单内服务的非法参数被拒绝(422)",
            r.status_code == 422 and "不允许" in r.text,
            f"{r.status_code} {r.text[:160]}",
        )

        # 3) 白名单内服务 + 合法参数 → 门禁放行；HA 未连接时由 api.ha 返回 409
        r = client.post(
            "/api/v1/ha/services/call",
            json={
                "domain": "light",
                "service": "turn_on",
                "entity_id": "light.x",
                "data": {"brightness_pct": 50},
            },
            headers=headers,
        )
        check(
            "白名单内合法调用未被白名单拦下",
            r.status_code in (200, 202, 409),
            f"{r.status_code} {r.text[:160]}",
        )

    report("HA 服务白名单（HTTP 通道）回归通过")


if __name__ == "__main__":
    main()
