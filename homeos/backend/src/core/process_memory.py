"""进程内存健康指标（对齐 ``common/observability/process-memory.util.ts``）。

Node 侧读 V8 堆统计；CPython 无同等概念，这里以进程常驻内存（RSS）为口径：
- ``memory``：RSS 占可用内存上限的百分比（0~100，用于告警阈值判断）；
- ``memoryMb`` / ``heapUsedMb``：RSS（MB，人类可读）；
- ``memoryLimitMb``：内存上限（cgroup 限额优先，否则物理内存总量）；
- ``heapTotalMb``：RSS（Python 无独立堆分配器口径，与 heapUsed 同源）；
- ``rssMb``：进程常驻物理内存（MB）。
"""

from __future__ import annotations

import os
from pathlib import Path

_MB = 1024 * 1024


def _rss_bytes() -> int:
    """当前进程 RSS 字节数（Linux 读 /proc，macOS/其他回退 ru_maxrss）。"""
    try:
        status = Path("/proc/self/status").read_text(encoding="utf-8")
        for line in status.splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    try:
        import resource  # noqa: PLC0415 - 平台相关，按需导入

        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # Linux 单位为 KB，macOS 为字节
        return int(usage) * 1024 if os.uname().sysname == "Linux" else int(usage)
    except Exception:  # noqa: BLE001 - 采集失败回退 0
        return 0


def _memory_limit_bytes() -> int:
    """内存上限：cgroup v2/v1 限额优先，否则物理内存总量；无法读取时回退 1GB。"""
    for candidate in (
        "/sys/fs/cgroup/memory.max",
        "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    ):
        try:
            raw = Path(candidate).read_text(encoding="utf-8").strip()
            if raw and raw != "max" and int(raw) > 0:
                return int(raw)
        except (OSError, ValueError):
            continue
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        if pages > 0 and page_size > 0:
            return int(pages) * int(page_size)
    except (ValueError, OSError, AttributeError):
        pass
    return 1024 * _MB


def get_process_memory_health() -> dict[str, int]:
    rss_bytes = _rss_bytes()
    limit_bytes = _memory_limit_bytes()
    rss_mb = round(rss_bytes / _MB)
    limit_mb = round(limit_bytes / _MB) if limit_bytes else 0
    memory = min(100, round(rss_bytes / limit_bytes * 100)) if limit_bytes else 0
    return {
        "memory": memory,
        "memoryMb": rss_mb,
        "memoryLimitMb": limit_mb,
        "rssMb": rss_mb,
        "heapUsedMb": rss_mb,
        "heapTotalMb": rss_mb,
    }


__all__ = ["get_process_memory_health"]
