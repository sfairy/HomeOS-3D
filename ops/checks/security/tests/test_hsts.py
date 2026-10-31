"""HSTS 回归：仅 HTTPS 链路下发，且认可信代理的 X-Forwarded-Proto。"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.bootstrap.middleware import SecurityHeadersMiddleware


def _scope() -> dict[str, Any]:
    return {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/health",
        "scheme": "http",
        "headers": [(b"x-forwarded-proto", b"https")],
        "client": ("127.0.0.1", 54321),
        "server": ("testserver", 80),
        "query_string": b"",
    }


async def _call() -> dict[str, list[bytes]]:
    messages: list[dict[str, Any]] = []

    async def app(scope: Any, receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    await SecurityHeadersMiddleware(app)(_scope(), receive, send)
    return {k.decode(): [v] for k, v in messages[0]["headers"]}


class HstsTest(unittest.TestCase):
    def test_plain_http_does_not_emit_hsts(self) -> None:
        with (
            patch("src.bootstrap.middleware.is_https_deploy_mode", return_value=False),
            patch("src.bootstrap.middleware.is_request_secure", return_value=False),
        ):
            headers = asyncio.run(_call())
        self.assertNotIn("strict-transport-security", headers)

    def test_trusted_proxy_https_emits_hsts(self) -> None:
        with (
            patch("src.bootstrap.middleware.is_https_deploy_mode", return_value=False),
            patch("src.bootstrap.middleware.is_request_secure", return_value=True),
        ):
            headers = asyncio.run(_call())
        self.assertIn("strict-transport-security", headers)

    def test_explicit_https_deploy_mode_emits_hsts(self) -> None:
        with (
            patch("src.bootstrap.middleware.is_https_deploy_mode", return_value=True),
            patch("src.bootstrap.middleware.is_request_secure", return_value=False),
        ):
            headers = asyncio.run(_call())
        self.assertIn("strict-transport-security", headers)


if __name__ == "__main__":
    unittest.main()
