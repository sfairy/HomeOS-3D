"""关停期噪音过滤：Ctrl+C 之后那条「ERROR [Web服务器] Traceback ... CancelledError」。

这条 ERROR 看着最像崩溃，实际是三方各做对一件事之后的必然产物：
uvicorn ``capture_signals`` 把 SIGINT 抛回去 → Python 3.15 的 ``asyncio.run`` 把它变成
注入循环的 ``KeyboardInterrupt`` → 仍停在 ``await receive()`` 的 lifespan 任务被取消 →
starlette 把 ``traceback.format_exc()`` 塞进 ``lifespan.shutdown.failed`` →
uvicorn 用 ``logger.error(整段堆栈)`` 原样打出来。

过滤条件必须「宁放过不误杀」，所以这里两侧都钉住：
- 纯取消的堆栈要折叠；
- 带应用帧的、或末尾是业务异常的堆栈必须保留。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.runtime.shutdown_noise import (
    ShutdownNoiseFilter,
    is_shutdown_cancellation,
)

#: 复刻用户日志里那段堆栈：末尾是取消，且没有任何 backend/src 的帧
CANCEL_TRACE = textwrap.dedent(
    """\
    Traceback (most recent call last):
      File "/opt/py/lib/python3.15/asyncio/runners.py", line 167, in _on_sigint
        raise KeyboardInterrupt()
    KeyboardInterrupt

    During handling of the above exception, another exception occurred:

    Traceback (most recent call last):
      File "/opt/py/site-packages/starlette/routing.py", line 661, in lifespan
        await receive()
    asyncio.exceptions.CancelledError
    """
)


def _record(message: str, name: str = "uvicorn.error", level: int = logging.ERROR) -> logging.LogRecord:
    return logging.LogRecord(name, level, __file__, 1, message, None, None)


class ShutdownNoiseRuleTest(unittest.TestCase):
    def test_pure_cancellation_traceback_is_folded(self) -> None:
        self.assertTrue(is_shutdown_cancellation(CANCEL_TRACE))
        self.assertFalse(ShutdownNoiseFilter().filter(_record(CANCEL_TRACE)))

    def test_application_frame_keeps_the_traceback(self) -> None:
        """堆栈里出现 backend/src 的帧 —— 可能是应用自己的关停故障，必须让人看见。"""
        with_app_frame = CANCEL_TRACE.replace(
            'File "/opt/py/site-packages/starlette/routing.py", line 661, in lifespan',
            f'File "{BACKEND_ROOT / "src" / "bootstrap" / "lifespan.py"}", line 1301, in shutdown',
        )
        self.assertFalse(is_shutdown_cancellation(with_app_frame))

    def test_business_exception_keeps_the_traceback(self) -> None:
        self.assertFalse(
            is_shutdown_cancellation(
                "Traceback (most recent call last):\n"
                '  File "/opt/py/site-packages/starlette/routing.py", line 661, in lifespan\n'
                "RuntimeError: 数据库连接池未释放\n"
            )
        )

    def test_other_messages_are_untouched(self) -> None:
        """只有「整段堆栈当正文」的写法会被判定：ASGI 请求异常的标题不能被吃。"""
        self.assertFalse(is_shutdown_cancellation("Exception in ASGI application"))
        self.assertFalse(is_shutdown_cancellation(""))
        self.assertTrue(ShutdownNoiseFilter().filter(_record("Exception in ASGI application")))

    def test_install_is_idempotent(self) -> None:
        from src.platform.core.runtime.shutdown_noise import install_shutdown_noise_filter

        first = install_shutdown_noise_filter()
        second = install_shutdown_noise_filter()
        self.assertEqual(second, 0)
        self.assertGreaterEqual(first, 0)
        for name in ("uvicorn", "uvicorn.error"):
            installed = [item for item in logging.getLogger(name).filters if isinstance(item, ShutdownNoiseFilter)]
            self.assertEqual(len(installed), 1, f"{name} 上重复挂了降噪过滤器")


_E2E_SCRIPT = textwrap.dedent(
    """
    import logging
    import sys

    sys.path.insert(0, {backend!r})
    from src.platform.core.runtime.log import configure_app_logging

    configure_app_logging()

    from fastapi import FastAPI

    app = FastAPI()


    @app.get("/slow")
    async def slow():
        import asyncio

        await asyncio.sleep(30)
        return {{"ok": True}}


    if __name__ == "__main__":
        import uvicorn

        uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_config=None, timeout_graceful_shutdown=1)
    """
)


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class ShutdownNoiseEndToEndTest(unittest.TestCase):
    """真链路：keep-alive 长请求 + 两次 Ctrl+C（第二次强制退出）。"""

    def test_sigint_twice_leaves_no_lifespan_traceback(self) -> None:
        try:
            import uvloop  # noqa: F401
        except ImportError:  # pragma: no cover - dev 环境必装
            self.skipTest("uvloop 未安装：SIGINT 注入路径依赖它")
        if sys.platform == "win32":  # pragma: no cover - send_signal(2) 在 Windows 上不等价
            self.skipTest("Windows 的 SIGINT 语义不同，该竞态只在 POSIX 复现")
        if sys.version_info < (3, 15):  # pragma: no cover - 该竞态依赖 3.15 的 _on_sigint
            self.skipTest("asyncio.run 的 _on_sigint 行为自 Python 3.15 起才如此")

        port = _free_port()
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "app_under_test.py"
            script.write_text(_E2E_SCRIPT.format(backend=str(BACKEND_ROOT)), encoding="utf-8")
            output = self._run_and_interrupt([sys.executable, str(script), str(port)], port)

        self.assertIn("服务进程已退出", output, "服务没有正常退出，用例前提不成立")
        self.assertNotIn("ERROR [Web服务器] Traceback (most recent call last):", output)

    def _run_and_interrupt(self, argv: list[str], port: int) -> str:
        """起服务 → 挂一个不会返回的请求 → 连按两次 SIGINT → 收全部输出。"""
        env = dict(os.environ, LOG_LEVEL="info")
        with tempfile.TemporaryFile("w+", encoding="utf-8") as sink:
            process = subprocess.Popen(argv, stdout=sink, stderr=subprocess.STDOUT, env=env)
            try:
                self.assertTrue(self._wait_ready(process, sink, timeout=45), "服务未在超时内就绪")
                with socket.create_connection(("127.0.0.1", port), timeout=10) as slow_client:
                    slow_client.sendall(b"GET /slow HTTP/1.1\r\nHost: probe\r\n\r\n")
                    time.sleep(0.5)
                    process.send_signal(2)  # SIGINT：开始优雅关闭
                    time.sleep(0.8)
                    process.send_signal(2)  # 再按一次：force_exit，跳过 lifespan.shutdown()
                    self._wait_exit(process, timeout=30)
                sink.seek(0)
                return sink.read()
            finally:
                if process.poll() is None:  # pragma: no cover - 超时兜底
                    process.kill()
                    process.wait(timeout=10)

    @staticmethod
    def _wait_ready(process: subprocess.Popen, sink, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if process.poll() is not None:  # pragma: no cover - 启动即失败
                return False
            sink.seek(0)
            if "服务已就绪" in sink.read():
                return True
            time.sleep(0.2)
        return False

    @staticmethod
    def _wait_exit(process: subprocess.Popen, timeout: float) -> None:
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:  # pragma: no cover - 关停卡死才是真问题
            process.kill()
            process.wait(timeout=10)
            raise AssertionError("两次 Ctrl+C 后服务仍未退出") from None


if __name__ == "__main__":
    unittest.main()
