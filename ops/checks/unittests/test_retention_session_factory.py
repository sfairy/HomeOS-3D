"""数据库历史保留清理的会话工厂回归测试。

## 为什么需要这条

``DatabaseRetentionService._factory_for`` 返回的是 **sessionmaker**，调用方必须再调用一次
（``with factory() as session``）。少写这一对括号时 SQLAlchemy 不会在导入期报错，只会在
首次清理时抛 ``'sessionmaker' object does not support the context manager protocol`` ——
而这句恰好被 ``run_cleanup`` 的逐表 ``except`` 吞成一条 warning，于是：

- 四张表一条历史都不删（保留策略看起来配好了，实际从未生效）；
- 面板的「估算行数」永远 0（同样被 ``_estimate_rows`` 的兜底吞掉）。

这类「安静失效」只有回归测试能守住：断言工厂**被调用过**，而不只是被 ``with`` 用过。
"""

from __future__ import annotations

import unittest
from typing import Any

from homeos.backend.src.domains.retention.service import DatabaseRetentionService


class _FakeSession:
    """最小会话：任何查询都失败，用来走 ``_estimate_rows`` 的兜底分支。"""

    def execute(self, *_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("fake session has no tables")

    def __enter__(self) -> _FakeSession:
        return self

    def __exit__(self, *_exc: Any) -> bool:
        return False


class _FakeSessionmaker:
    """记录「被调用次数」的 sessionmaker 替身。"""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self) -> _FakeSession:
        self.calls += 1
        return _FakeSession()

    def __enter__(self) -> _FakeSessionmaker:  # 若调用方漏写 () 就会走到这里
        raise AssertionError("sessionmaker 被直接当作上下文管理器使用（漏了调用括号）")


class RetentionSessionFactoryTest(unittest.TestCase):
    def _service(self, factory: _FakeSessionmaker) -> DatabaseRetentionService:
        service = DatabaseRetentionService(factory, app_config={"ops": {}})
        return service

    def test_estimate_rows_calls_sessionmaker(self) -> None:
        """估算行数必须真正打开会话；漏调用括号时既拿不到数据也会静默返回 0。"""
        factory = _FakeSessionmaker()
        rows = self._service(factory).estimate_table_rows()
        self.assertGreater(factory.calls, 0, "sessionmaker 未被调用：with 少了一对括号")
        self.assertTrue(all(value == 0 for value in rows.values()))

    def test_table_cleanup_calls_sessionmaker(self) -> None:
        """逐表删除同样必须调用工厂；否则每张表的清理都会以 warning 结束。"""
        from homeos.backend.src.platform.core.db.models import EventLog

        factory = _FakeSessionmaker()
        service = self._service(factory)
        with self.assertRaises(RuntimeError):
            service._delete_batched(EventLog, service.get_cutoff_date(), 10)
        self.assertGreater(factory.calls, 0, "sessionmaker 未被调用：with 少了一对括号")


if __name__ == "__main__":
    unittest.main()
