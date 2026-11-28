#!/usr/bin/env python3
"""校验错误文案自检：**用户看到的必须是中文**。

## 为什么需要它

``RequestValidationError`` 的 ``msg`` 来自 pydantic，天生是英文
（``String should have at least 1 character``）。前端只读信封里的 ``message``，
后端原样透出时中文界面就会弹一句英文 —— 实测登录框填了空密码就出现过
``password: String should have at least 1 character``。

``bootstrap/exception_handlers`` 现在统一走 ``diagnostics.validation_reason`` 收敛文案。
本自检钉住三条口径：

1. 任何 pydantic 校验错误都必须落成中文（不允许整句英文透出）；
2. 字段名用中文标签（``password`` → 密码），不把 ``body`` 这类位置前缀拼进句子；
3. 长度限制要带上具体数字（「至少需要 8 个字符」），别只写「长度不足」。

用法：
    node ops/lib/py.mjs ops/checks/business/http_validation_selftest.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pydantic import BaseModel, Field, field_validator, model_validator

from homeos.backend.src.platform.core.http.diagnostics import validation_reason

CJK = re.compile(r"[\u4e00-\u9fff]")
ASCII_SENTENCE = re.compile(r"[A-Za-z]{4,}(?:\s+[A-Za-z]{4,}){2,}")

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class LoginRequest(BaseModel):
    """与 ``api.schemas.auth.LoginRequest`` 同形（空密码就是这次线上文案的来源）。"""

    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class PasswordChange(BaseModel):
    """带模型级校验的请求：验证「无字段位置」的文案不会被拼成「请求参数…」。"""

    new_password: str = Field(min_length=8)
    confirm: str = Field(min_length=8)

    @model_validator(mode="after")
    def validate_change(self) -> PasswordChange:
        if self.new_password != self.confirm:
            raise ValueError("两次输入的新密码不一致。")
        return self


class PolicyRequest(BaseModel):
    """字段级自定义校验：业务中文不该被字段标签再前缀一次。"""

    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def validate_policy(cls, value: str) -> str:
        if not re.search(r"\d", value):
            raise ValueError("密码至少 8 位，且须同时包含字母和数字")
        return value


def message_of(builder) -> str:
    try:
        builder()
    except ValueError as error:  # pydantic.ValidationError 是 ValueError 子类
        errors = getattr(error, "errors", None)
        if callable(errors):
            return validation_reason(errors())
    raise AssertionError("构造的请求体没有触发校验失败，用例本身失效")


def test_empty_password_is_chinese() -> None:
    """线上复现：空密码必须是中文，且带上具体长度。"""
    message = message_of(lambda: LoginRequest(username="admin", password=""))
    check("空密码错误是中文", bool(CJK.search(message)), message)
    check("不再出现 pydantic 英文原文", "String should have at least" not in message, message)
    check("字段名用中文标签", "密码" in message, message)
    check("不暴露 body 前缀", "body" not in message, message)
    check("带具体长度限制", "1 个字符" in message, message)


def test_multi_field_joined() -> None:
    message = message_of(lambda: LoginRequest(username="", password=""))
    check("多字段各自给中文", message.count("至少需要") == 2, message)
    check("多字段用分号拼接", "；" in message, message)


def test_model_level_message_not_prefixed() -> None:
    message = message_of(lambda: PasswordChange(new_password="a" * 8, confirm="b" * 8))
    check("模型级中文原样透出", message == "两次输入的新密码不一致。", message)
    check("不出现「请求参数」前缀", "请求参数" not in message, message)


def test_field_level_chinese_not_duplicated() -> None:
    weak = "abcdefgh"  # 不含数字：触发口令策略校验
    message = message_of(lambda: PolicyRequest(password=weak))
    check("字段级中文不重复前缀", message.startswith("密码至少 8 位"), message)
    check("不出现「密码密码」", "密码密码" not in message, message)


def test_length_and_type_reasons() -> None:
    long_username = "a" * 300
    short_password = "x"
    long_message = message_of(lambda: LoginRequest(username=long_username, password=short_password))
    check("超长给出上限", "255 个字符" in long_message, long_message)
    check("超长是中文", bool(CJK.search(long_message)), long_message)
    # 英文整句透出是这次回归的根因：任何一条都不能留下连续英文单词
    blank_password = ""
    for message in (long_message, message_of(lambda: LoginRequest(username="a", password=blank_password))):
        check("没有整句英文残留", not ASCII_SENTENCE.search(message), message)


def main() -> int:
    test_empty_password_is_chinese()
    test_multi_field_joined()
    test_model_level_message_not_prefixed()
    test_field_level_chinese_not_duplicated()
    test_length_and_type_reasons()
    print(f"校验文案自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
