"""LEAD-001 回归：坏 NO_PROXY 不得让主后端启动崩溃。

背景：宿主机 `NO_PROXY` 常写成 `localhost,127.0.0.1,[::1]`。httpx 0.28 解析
no_proxy 时对 `[::1]` 抛 `InvalidURL: Invalid port: ':1]'`；WebPush/WeCom 在
lifespan 启动期构造 AsyncClient，于是整个后端启动失败。回归要求归一化后
httpx 能正常构造客户端，且本地回环仍然绕过代理。
"""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 python -m src.run 的 src 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

import httpx
from src.platform.core.http.proxy_env import normalize_no_proxy, repair_no_proxy_env


class NormalizeNoProxyTests(unittest.TestCase):
    def test_strips_brackets_from_bare_ipv6(self) -> None:
        normalized, notes = normalize_no_proxy("localhost,127.0.0.1,[::1]")
        self.assertEqual(normalized, "localhost,127.0.0.1,::1")
        self.assertEqual(notes, [])

    def test_strips_brackets_and_widens_ipv6_port(self) -> None:
        normalized, notes = normalize_no_proxy("[2001:db8::1]:8080,localhost")
        self.assertEqual(normalized, "2001:db8::1,localhost")
        self.assertEqual(len(notes), 1)

    def test_leaves_regular_entries_untouched(self) -> None:
        value = "localhost,127.0.0.1,::1,.local,*.internal,host:8080"
        self.assertEqual(normalize_no_proxy(value), (value, []))

    def test_does_not_touch_malformed_bracket(self) -> None:
        self.assertEqual(normalize_no_proxy("[::1"), ("[::1", []))


class RepairNoProxyEnvTests(unittest.TestCase):
    def test_bracketed_ipv6_is_rewritten_and_httpx_can_construct(self) -> None:
        with patch.dict(
            os.environ,
            {"NO_PROXY": "localhost,127.0.0.1,[::1]", "no_proxy": "localhost,127.0.0.1,[::1]"},
            clear=False,
        ):
            self.assertTrue(repair_no_proxy_env())
            self.assertEqual(os.environ["NO_PROXY"], "localhost,127.0.0.1,::1")
            self.assertEqual(os.environ["no_proxy"], "localhost,127.0.0.1,::1")
            # 复现原崩溃点的最小探针：归一化前这里抛 httpx.InvalidURL。
            with httpx.Client() as client:
                self.assertIsNotNone(client)

            async def construct_async_client() -> bool:
                async with httpx.AsyncClient() as client:
                    return client is not None

            self.assertTrue(asyncio.run(construct_async_client()))

    def test_second_call_is_idempotent(self) -> None:
        with patch.dict(
            os.environ,
            {"NO_PROXY": "localhost,[::1]", "no_proxy": "localhost,[::1]"},
            clear=False,
        ):
            self.assertTrue(repair_no_proxy_env())
            self.assertFalse(repair_no_proxy_env())

    def test_clean_environment_is_untouched(self) -> None:
        with patch.dict(
            os.environ,
            {"NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"},
            clear=False,
        ):
            self.assertFalse(repair_no_proxy_env())
            self.assertEqual(os.environ["NO_PROXY"], "localhost,127.0.0.1")
