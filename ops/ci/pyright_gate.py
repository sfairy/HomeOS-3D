"""basedpyright 结果的 CI 门禁：只把「必是 bug」的规则当硬失败。

为什么不直接要求 `error == 0`：`pyrightconfig.json` 的 error 级里还有一批**存量**项，
绝大多数是模型标注偏窄导致的 `reportOptionalMemberAccess` / `reportArgumentType` 误报，
以及 `tools/`、`migrations/` 下静态分析看不到运行期 `sys.path` 注入而产生的
`reportMissingImports`。一次全清零并不现实，拿「error == 0」当门禁等于第一天就红，
最后只会被 `continue-on-error` 绕过。

所以口径是：
- ``HARD_RULES`` 命中即失败 —— 它们对应 UnboundLocalError / AttributeError / 无效
  except 这类**一定会炸**的代码，本仓当前为 0 条，所以这个门禁今天就能拦住回归；
- 其余 error 打成按规则 / 按文件的直方图当作可见性输出（不失败），
  让「存量还剩多少」在 CI 日志里一直看得见。

用法：

    basedpyright --outputjson > basedpyright.json
    python ops/ci/pyright_gate.py basedpyright.json
"""

from __future__ import annotations

import collections
import json
import os
import sys
from pathlib import Path

HARD_RULES = frozenset(
    {
        "reportPossiblyUnboundVariable",
        "reportUninitializedInstanceVariable",
        "reportUnusedExcept",
    }
)

REPO_ROOT = Path(__file__).resolve().parents[2]
TOP_LIMIT = 15


def _relative(file_path: str) -> str:
    try:
        return Path(os.path.relpath(file_path, REPO_ROOT)).as_posix()
    except ValueError:
        return file_path


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("用法：pyright_gate.py <basedpyright --outputjson 的输出文件>", file=sys.stderr)
        return 2

    report_path = Path(argv[1])
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"无法读取 basedpyright 报告 {report_path}：{error}", file=sys.stderr)
        return 2

    errors = [item for item in report.get("generalDiagnostics", []) if item.get("severity") == "error"]
    hard_failures = [item for item in errors if item.get("rule") in HARD_RULES]

    rule_counts = collections.Counter(item.get("rule") or "<无规则>" for item in errors)
    file_counts = collections.Counter(_relative(item.get("file", "")) for item in errors)

    print(f"basedpyright error 总数：{len(errors)}")
    print("按规则：")
    for rule, count in rule_counts.most_common(TOP_LIMIT):
        print(f"  {count:4d}  {rule}")
    print(f"按文件（前 {TOP_LIMIT}）：")
    for file_name, count in file_counts.most_common(TOP_LIMIT):
        print(f"  {count:4d}  {file_name}")

    if not hard_failures:
        print("硬门禁规则全部通过：" + "、".join(sorted(HARD_RULES)) + " 0 条")
        print("（其余存量 error 仅作可见性输出，逐条收敛见 pyrightconfig.json 的说明。）")
        return 0

    print(f"::error::basedpyright 命中 {len(hard_failures)} 条必为 bug 的规则，必须修掉：")
    for item in hard_failures:
        location = f"{_relative(item.get('file', ''))}:{item.get('range', {}).get('start', {}).get('line', 0) + 1}"
        print(f"  {location}  [{item.get('rule')}]")
        for line in (item.get("message") or "").splitlines():
            print(f"      {line}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
