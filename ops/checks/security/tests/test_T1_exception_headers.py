"""T1 回归：统一异常信封必须保留异常自带的响应头（Retry-After / WWW-Authenticate）。

背景（审计发现 T1-002）：`bootstrap/exception_handlers.py` 的 `StarletteHTTPException`
处理器手工拼 `JSONResponse`，没有透传 `exc.headers`。于是登录限流分支里已经写好的
`Retry-After`（`platform/security/login_limiter.py:retry_after_headers`）在 429 响应上
根本发不出去 —— 客户端只能盲等或立刻重试（又撞一次 429）。

这里用最小 FastAPI 应用把该语义钉住：信封字段不变，异常自带的头必须出现在响应里。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 `python -m src.run` 的 `src` 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from src.bootstrap.exception_handlers import register_exception_handlers


def build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app, SimpleNamespace(is_production=False))

    @app.get("/limited")
    def limited() -> None:
        raise HTTPException(
            status_code=429,
            detail="登录失败次数过多，请稍后再试。",
            headers={"Retry-After": "600"},
        )

    @app.get("/unauthenticated")
    def unauthenticated() -> None:
        raise HTTPException(
            status_code=401,
            detail="登录状态已失效，请重新登录。",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return app


class HttpExceptionHeaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(build_app())

    def test_retry_after_survives_error_envelope(self) -> None:
        response = self.client.get("/limited")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers.get("retry-after"), "600")
        payload = response.json()
        self.assertEqual(payload["statusCode"], 429)
        self.assertEqual(payload["message"], "登录失败次数过多，请稍后再试。")

    def test_www_authenticate_survives_error_envelope(self) -> None:
        response = self.client.get("/unauthenticated")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("www-authenticate"), "Bearer")

    def test_error_without_headers_keeps_default_envelope(self) -> None:
        @self.client.app.get("/plain")
        def plain() -> None:
            raise HTTPException(status_code=404, detail="不存在")

        response = self.client.get("/plain")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["statusCode"], 404)
        self.assertNotIn("retry-after", response.headers)


if __name__ == "__main__":
    unittest.main()
