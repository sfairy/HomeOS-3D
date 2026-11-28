#!/usr/bin/env python3
"""环境变量容错自检：一个拼错的数值变量不能让服务起不来。

## 为什么需要它

``config.load_settings`` 与 ``platform.security.auth_context`` 都读过数值环境变量。
历史上这些位置直接写 ``int(os.getenv(...))`` / ``float(os.getenv(...))``，且在**模块导入期**
求值：把 ``HA_REQUEST_TIMEOUT_SECONDS`` 写成 ``10s`` 之类的笔误，得到的是
「进程启动失败 + 一条与变量名无关的 ValueError」，现场只能逐行排查。

本自检钉住三条口径：

1. 合法值照常生效（修复不能把正常配置也一起吃掉）；
2. 非法值回落默认值，不抛异常；
3. 越界值被夹到允许区间内（超时 / 体积上限不允许被配成 0 或天文数字）。
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src import config as app_config


@contextmanager
def env(**values: str) -> Iterator[None]:
    """临时设置环境变量（None 表示删除），退出时恢复原值。"""
    saved = {key: os.environ.get(key) for key in values}
    try:
        for key, value in values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_valid_values_apply() -> None:
    with env(HOMEOS_TEST_TIMEOUT="12.5", HOMEOS_TEST_SIZE="2048"):
        check(
            "合法浮点生效",
            app_config._environment_float("HOMEOS_TEST_TIMEOUT", 10.0, minimum=0.5, maximum=300.0) == 12.5,
        )
        check(
            "合法整数生效",
            app_config._environment_int("HOMEOS_TEST_SIZE", 1, minimum=1, maximum=4096) == 2048,
        )


def test_invalid_values_fall_back() -> None:
    with env(HOMEOS_TEST_TIMEOUT="10s", HOMEOS_TEST_SIZE="2mb"):
        check(
            "非法浮点回落默认值",
            app_config._environment_float("HOMEOS_TEST_TIMEOUT", 10.0, minimum=0.5, maximum=300.0) == 10.0,
        )
        check(
            "非法整数回落默认值",
            app_config._environment_int("HOMEOS_TEST_SIZE", 1, minimum=1, maximum=4096) == 1,
        )


def test_out_of_range_is_clamped() -> None:
    with env(HOMEOS_TEST_TIMEOUT="0", HOMEOS_TEST_SIZE="999999999"):
        check(
            "浮点低于下界被夹到最小值",
            app_config._environment_float("HOMEOS_TEST_TIMEOUT", 10.0, minimum=0.5, maximum=300.0) == 0.5,
        )
        check(
            "整数超过上界被夹到最大值",
            app_config._environment_int("HOMEOS_TEST_SIZE", 1, minimum=1, maximum=4096) == 4096,
        )


def test_missing_values_use_default() -> None:
    with env(HOMEOS_TEST_TIMEOUT=None, HOMEOS_TEST_SIZE=None):
        check(
            "缺失浮点用默认值",
            app_config._environment_float("HOMEOS_TEST_TIMEOUT", 7.0, minimum=0.5, maximum=300.0) == 7.0,
        )
        check(
            "缺失整数用默认值",
            app_config._environment_int("HOMEOS_TEST_SIZE", 3, minimum=1, maximum=4096) == 3,
        )


def test_session_cache_ttl_is_tolerant() -> None:
    """``auth_context`` 的缓存 TTL 在模块导入期求值，读坏值不得抛异常。"""
    from homeos.backend.src.platform.security import auth_context

    with env(HOMEOS_AUTH_CACHE_SECONDS="not-a-number"):
        check("非法 TTL 回落 2 秒", auth_context._session_cache_ttl() == 2.0)
    with env(HOMEOS_AUTH_CACHE_SECONDS="-5"):
        check("负数 TTL 夹到 0", auth_context._session_cache_ttl() == 0.0)
    with env(HOMEOS_AUTH_CACHE_SECONDS="3.5"):
        check("合法 TTL 生效", auth_context._session_cache_ttl() == 3.5)
    with env(HOMEOS_AUTH_CACHE_SECONDS=None):
        check("缺失 TTL 用默认值", auth_context._session_cache_ttl() == 2.0)


def main() -> int:
    test_valid_values_apply()
    test_invalid_values_fall_back()
    test_out_of_range_is_clamped()
    test_missing_values_use_default()
    test_session_cache_ttl_is_tolerant()
    report("环境变量容错")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
