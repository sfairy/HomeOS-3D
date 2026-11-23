"""``check_response_models`` 的自检：证明这条门禁真的抓得住问题。

背景（来自一次真实事故）：``api/schemas/base.StrictModel`` 配的是 ``extra="forbid"``，
它是为**请求体**设计的。把它用到 ``response_model=`` 上时，服务层多返回一个键（比如新加
一个指标）就会在序列化阶段抛 ``ValidationError``，把正常请求打成 500 —— 而且类型检查、
路由基线全都看不见。

这条测试用临时目录造出「违规 / 合规」两种写法，断言检查器分别报错与放行。
没有它，检查器可能因为路径写错或 AST 匹配不到而永远绿。
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# 被检查的脚本以「直接执行」为前提编写（`sys.path[0]` 是脚本所在目录），所以这里也按
# 同样的方式导入，而不是用包路径 —— 否则脚本里的 `sys.path.insert` 前置导入会解析失败。
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from check_guards import scan_response_models

VIOLATION = """
from ..schemas.base import StrictModel

class HealthResponse(StrictModel):
    cpu: int

@router.get("/health", response_model=HealthResponse)
async def get_health():
    return {"cpu": 1, "newMetric": 2}
"""

COMPLIANT = """
from ..schemas.base import ResponseModel

class HealthResponse(ResponseModel):
    cpu: int

@router.get("/health", response_model=HealthResponse)
async def get_health():
    return {"cpu": 1}
"""

#: 继承 StrictModel 但**不**用作 response_model：请求体模型，应当放行。
REQUEST_ONLY = """
from ..schemas.base import StrictModel

class CreateRequest(StrictModel):
    name: str

@router.post("/things")
async def create(payload: CreateRequest):
    return {}
"""


class ResponseModelGuardTest(unittest.TestCase):
    def _scan(self, source: str) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "sample.py").write_text(source, encoding="utf-8")
            problems, files = scan_response_models(roots=[Path(directory)])
        self.assertEqual(files, 1)
        return problems

    def test_flags_strict_model_used_as_response(self) -> None:
        problems = self._scan(VIOLATION)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("StrictModel", problems[0])
        self.assertIn("ResponseModel", problems[0])

    def test_allows_response_model_base(self) -> None:
        self.assertEqual(self._scan(COMPLIANT), [])

    def test_allows_request_body_strict_model(self) -> None:
        self.assertEqual(self._scan(REQUEST_ONLY), [])

    def test_repo_itself_is_clean(self) -> None:
        """真实仓库当前无违规；这条同时防止检查器指向错误目录（扫描数为 0 会立刻暴露）。"""
        problems, files = scan_response_models()
        self.assertGreater(files, 100, "扫描模块数异常偏少，检查器的扫描范围可能坏了")
        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
