#!/usr/bin/env python3
"""静默 except 递减棘轮（ratchet）：只准变少，不准变多。

背景：仓库里大量 ``except Exception: pass`` / ``except ...: return None`` 把**真实的
失败路径**吞掉了 —— HA 下发失败、恢复快照失败、写库失败都表现成「什么都没发生」，
排查时只能靠猜。这类分支不可能一次清完（每个都要判断「是否真的可忽略」），因此用
棘轮而不是绝对门禁：

- 基线记录在 ``ops/checks/silent_except_baseline.json``（按文件计数 + 总数）；
- 本次扫描结果 **超过** 基线即失败（新增静默分支必须同时补日志，或显式调低基线）；
- 减少不算失败，但需要跑 ``--update`` 把基线压低 —— 否则棘轮只会保持在旧高度，
  后来的人可以「先加三处、再删三处」把新静默分支洗白。

判定口径：``except`` 处理器体内**没有任何日志/抛出调用**即算静默。
带有 ``logger.*`` / ``print`` / ``raise`` 的分支不算（说明它至少留了线索或向上传播）。

用法：
    python3 ops/checks/check_silent_except.py            # 校验（CI / 本地）
    python3 ops/checks/check_silent_except.py --update   # 重新录制基线
    python3 ops/checks/check_silent_except.py --verbose  # 打印每个超基线分支的位置
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE_PATH = ROOT / 'ops/checks/silent_except_baseline.json'
SCAN_ROOTS = [
    ROOT / 'homeos/backend/src',
    ROOT / 'homeos-store/backend/src',
]
#: 至少留一条日志才不算静默（``handleError`` 属于 logging 体系内的兜底输出）。
LOG_ATTRS = {
    'debug', 'info', 'warning', 'warn', 'error', 'exception', 'critical', 'handleError',
}


def _has_signal(node: ast.ExceptHandler) -> bool:
    """处理器体内是否有日志 / print / raise（任一条即视为「已留线索」）。"""
    for child in ast.walk(ast.Module(body=node.body, type_ignores=[])):
        if isinstance(child, ast.Raise):
            return True
        if not isinstance(child, ast.Call):
            continue
        func = child.func
        if isinstance(func, ast.Attribute) and func.attr in LOG_ATTRS:
            return True
        if isinstance(func, ast.Attribute) and func.attr == 'emit' and isinstance(func.value, ast.Name):
            # 事件总线 emit：领域事件也会落库/推送，等价于留痕。
            if 'event' in func.value.id.lower() or 'bus' in func.value.id.lower():
                return True
        if isinstance(func, ast.Name) and func.id in {'print', 'schedule_security_event'}:
            return True
    return False


def scan_file(path: Path) -> list[int]:
    try:
        tree = ast.parse(path.read_text(encoding='utf-8'))
    except (SyntaxError, UnicodeDecodeError):
        return []
    return [
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.ExceptHandler) and not _has_signal(node)
    ]


def scan() -> tuple[dict[str, list[int]], int]:
    per_file: dict[str, list[int]] = {}
    for scan_root in SCAN_ROOTS:
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob('*.py')):
            lines = scan_file(path)
            if lines:
                per_file[path.relative_to(ROOT).as_posix()] = lines
    return per_file, sum(len(lines) for lines in per_file.values())


def load_baseline() -> dict:
    if not BASELINE_PATH.exists():
        return {'total': 0, 'files': {}, 'scanRoots': []}
    return json.loads(BASELINE_PATH.read_text(encoding='utf-8'))


def write_baseline(per_file: dict[str, list[int]], total: int) -> None:
    payload = {
        'generatedAt': '2026-10-26',
        'scanRoots': [root.relative_to(ROOT).as_posix() for root in SCAN_ROOTS],
        'total': total,
        'files': {name: len(lines) for name, lines in sorted(per_file.items())},
    }
    BASELINE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + '\n',
        encoding='utf-8',
    )


def main(argv: list[str]) -> int:
    per_file, total = scan()
    if '--update' in argv:
        write_baseline(per_file, total)
        print(f'已更新静默 except 基线：{total} 处 / {len(per_file)} 个文件')
        print(f'  {BASELINE_PATH.relative_to(ROOT)}')
        return 0

    baseline = load_baseline()
    baseline_total = int(baseline.get('total') or 0)
    baseline_files: dict[str, int] = baseline.get('files') or {}
    verbose = '--verbose' in argv

    regressions: list[str] = []
    for name, lines in per_file.items():
        allowed = baseline_files.get(name, 0)
        if len(lines) <= allowed:
            continue
        extra = len(lines) - allowed
        regressions.append(f'  {name}: {len(lines)} 处（基线 {allowed}，新增 {extra}）')
        if verbose:
            for lineno in lines:
                regressions.append(f'      {name}:{lineno}')
    for name, allowed in baseline_files.items():
        if int(allowed) > 0 and name not in per_file:
            regressions.append(f'  {name}: 0 处（基线 {allowed}）—— 文件不存在或已无静默分支')

    reduced = max(0, baseline_total - total)
    status = f'静默 except：{total} 处（基线 {baseline_total}'
    status += f'，已减少 {reduced} 处）' if reduced else '）'

    if total > baseline_total or regressions:
        print(f'{status}', file=sys.stderr)
        print('检测到静默 except 增加：', file=sys.stderr)
        for line in regressions:
            print(line, file=sys.stderr)
        print(
            '\n修法（二选一）：\n'
            '  1. 给这条失败路径补 logger.warning(..., exc_info=True)（推荐）；\n'
            '  2. 若确认可忽略，改为收窄后的具体异常类型并加 `_ = exc` 风格注释说明；\n'
            '  3. 少见的「本来就该忽略」场景，在 ops/checks/silent_except_baseline.json 里\n'
            '     调高该文件基线（需在 PR 说明里写明原因）。\n'
            '减少分支后请跑 --update 把基线压低，避免棘轮被「先加后删」绕过。',
            file=sys.stderr,
        )
        return 1

    print(status + '：OK')
    if reduced:
        print(f'提示：比基线少了 {reduced} 处，可跑 --update 把基线压低到 {total}。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
