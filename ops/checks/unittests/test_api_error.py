"""后端错误码契约的单元测试。

``api_error`` / ``resolve_api_error_code`` 是前端拿稳定错误码的唯一通道：
键与文案脱钩、文案改一行不该换一次接口语义。
"""

from __future__ import annotations

import unittest

from homeos.backend.src.platform.core.http.errors import (
    API_ERROR,
    BusinessException,
    ErrorCode,
    api_error,
    resolve_api_error_code,
)


class ApiErrorTest(unittest.TestCase):
    def test_static_message(self) -> None:
        self.assertEqual(api_error("HA_CONNECTION_REQUIRED"), "请先配置 Home Assistant 连接。")

    def test_callable_message_receives_args(self) -> None:
        self.assertEqual(api_error("UI_CONFIG_PROFILE_NOT_FOUND", "p1"), '配置方案 "p1" 不存在')

    def test_unknown_key_returns_key_itself(self) -> None:
        """未知键返回键名而不是空串：面板会显示 ``SOME_KEY`` 而不是一片空白。"""
        self.assertEqual(api_error("NOT_A_REGISTERED_KEY"), "NOT_A_REGISTERED_KEY")

    def test_reverse_lookup_recovers_code_from_message(self) -> None:
        message = API_ERROR["HA_CONNECTION_REQUIRED"]
        self.assertEqual(resolve_api_error_code(message), "HA_CONNECTION_REQUIRED")

    def test_reverse_lookup_tolerates_whitespace_only(self) -> None:
        self.assertIsNone(resolve_api_error_code(""))
        self.assertIsNone(resolve_api_error_code("   "))
        self.assertIsNone(resolve_api_error_code(None))

    def test_business_exception_status_from_error_code(self) -> None:
        error = BusinessException(ErrorCode.CONFLICT, "冲突")
        self.assertEqual(error.status_code, 409)
        self.assertEqual(str(error.error_code), "CONFLICT")

    def test_explicit_status_and_headers_win(self) -> None:
        error = BusinessException(ErrorCode.VALIDATION_FAILED, "x", http_status=429, headers={"retry-after": "5"})
        self.assertEqual((error.status_code, error.headers), (429, {"retry-after": "5"}))


if __name__ == "__main__":
    unittest.main()
