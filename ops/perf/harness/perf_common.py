"""性能基线与优化后复测的公共工具。

只依赖标准库：隔离实例、HTTP 探针、统计与落盘都在这里，便于 CI/本机复用。
"""
from __future__ import annotations

import ctypes
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
# 默认落在系统临时目录下（S108 要求不得写死 `/tmp`）；CI 可用 HOMEOS_PERF_ROOT 覆盖。
PERF_ROOT = Path(os.environ.get("HOMEOS_PERF_ROOT") or Path(tempfile.gettempdir()) / "homeos-perf")
PYTHON = ROOT / ".venv-store" / "bin" / "python"
# `ps` 按 PATH 解析成绝对路径后再调用（S607）；macOS 上还有 libproc 兜底。
PS_EXECUTABLE = shutil.which("ps")


def env_path(label: str) -> Path:
    return PERF_ROOT / "env" / label / "env.json"


def load_env(label: str) -> dict[str, Any]:
    path = env_path(label)
    if not path.is_file():
        raise SystemExit(f"缺少环境描述：{path}；先运行 setup_env.py --label {label}")
    return json.loads(path.read_text("utf-8"))


def result_dir(label: str) -> Path:
    path = PERF_ROOT / "results" / label
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")


def http_get(url: str, *, cookie: str = "", timeout: float = 30.0,
             headers: dict[str, str] | None = None) -> dict[str, Any]:
    # 探针只打本地/内网 dev server：显式挡掉 `file:` 等非 HTTP 方案（S310 的实质风险）。
    scheme = url.split(":", 1)[0].lower() if ":" in url else ""
    if scheme not in {"http", "https"}:
        raise ValueError(f"只支持 http/https 探针：{url}")
    request_headers = dict(headers or {})
    if cookie:
        request_headers["Cookie"] = f"auth_token={cookie}"
    request = urllib.request.Request(url, headers=request_headers, method="GET")  # noqa: S310 - scheme 已按白名单校验
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - 上面的 scheme 白名单已排除 file:/自定义协议
            body = response.read()
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            return {
                "ok": 200 <= response.status < 400,
                "status": response.status,
                "headers": {k.lower(): v for k, v in response.headers.items()},
                "body": body,
                "bytes": len(body),
                "elapsed_ms": elapsed_ms,
                "error": "",
            }
    except urllib.error.HTTPError as error:
        body = error.read() if error.fp else b""
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        return {
            "ok": False,
            "status": error.code,
            "headers": {k.lower(): v for k, v in (error.headers or {}).items()},
            "body": body,
            "bytes": len(body),
            "elapsed_ms": elapsed_ms,
            "error": f"HTTP {error.code}",
        }
    except Exception as error:
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        return {
            "ok": False,
            "status": 0,
            "headers": {},
            "body": b"",
            "bytes": 0,
            "elapsed_ms": elapsed_ms,
            "error": f"{type(error).__name__}: {error}",
        }


def json_get(url: str, *, cookie: str = "", timeout: float = 30.0,
             headers: dict[str, str] | None = None) -> dict[str, Any]:
    result = http_get(url, cookie=cookie, timeout=timeout, headers=headers)
    try:
        result["json"] = json.loads(result["body"].decode("utf-8"))
    except Exception:
        result["json"] = None
    return result


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, round((pct / 100.0) * (len(ordered) - 1))))
    return float(ordered[rank])


def summarize(samples: list[float], *, wall_seconds: float, errors: int,
              bytes_total: int = 0) -> dict[str, Any]:
    if not samples:
        return {
            "count": 0, "errors": errors, "error_rate": 1.0,
            "rps": 0.0, "p50_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0,
            "mean_ms": 0.0, "max_ms": 0.0, "bytes_per_response": 0,
        }
    count = len(samples)
    return {
        "count": count,
        "errors": errors,
        "error_rate": errors / max(1, count),
        "rps": count / wall_seconds if wall_seconds > 0 else 0.0,
        "p50_ms": round(percentile(samples, 50), 3),
        "p95_ms": round(percentile(samples, 95), 3),
        "p99_ms": round(percentile(samples, 99), 3),
        "mean_ms": round(statistics.fmean(samples), 3),
        "max_ms": round(max(samples), 3),
        "bytes_per_response": round(bytes_total / max(1, count)),
    }


_PS_PATTERN = re.compile(r"^\s*(?P<rss>\d+)\s+(?P<cpu>(?:\d+:)?\d+:\d+(?:\.\d+)?)\s*$")


def parse_cpu_time(value: str) -> float:
    """把 ps 的 CPU 时间（[H:]MM:SS[.cc]）转成秒。"""
    parts = value.strip().split(":")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60.0 + float(part)
    return seconds


class _MacTaskInfo(ctypes.Structure):
    _fields_ = [
        ("virtual_size", ctypes.c_uint64), ("resident_size", ctypes.c_uint64),
        ("total_user", ctypes.c_uint64), ("total_system", ctypes.c_uint64),
        ("threads_user", ctypes.c_uint64), ("threads_system", ctypes.c_uint64),
        ("policy", ctypes.c_int32), ("faults", ctypes.c_int32), ("pageins", ctypes.c_int32),
        ("cow_faults", ctypes.c_int32), ("messages_sent", ctypes.c_int32),
        ("messages_received", ctypes.c_int32), ("syscalls_mach", ctypes.c_int32),
        ("syscalls_unix", ctypes.c_int32), ("csw", ctypes.c_int32),
        ("threadnum", ctypes.c_int32), ("numrunning", ctypes.c_int32), ("priority", ctypes.c_int32),
    ]


class _MachTimebase(ctypes.Structure):
    _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]


_MACOS_PROBE: tuple[Any, Any, float] | None = None


def _macos_probe():
    """ps 在受限沙箱里会被拒绝执行；用 libproc 直接读 rss/CPU。"""
    global _MACOS_PROBE
    if _MACOS_PROBE is not None:
        return _MACOS_PROBE
    libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    libproc.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64,
                                     ctypes.c_void_p, ctypes.c_int]
    libproc.proc_pidinfo.restype = ctypes.c_int
    libsystem = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    timebase = _MachTimebase()
    libsystem.mach_timebase_info(ctypes.byref(timebase))
    scale = (timebase.numer / timebase.denom) / 1e9 if timebase.denom else 1e-9
    _MACOS_PROBE = (libproc, _MacTaskInfo(), scale)
    return _MACOS_PROBE


def _macos_process_snapshot(pid: int) -> dict[str, Any] | None:
    try:
        libproc, info, scale = _macos_probe()
        size = ctypes.sizeof(info)
        written = libproc.proc_pidinfo(pid, 4, 0, ctypes.byref(info), size)
        if written != size:
            return None
        cpu_seconds = (info.total_user + info.total_system) * scale
        return {
            "pid": pid,
            "rss_kb": int(info.resident_size / 1024),
            "cpu_seconds": round(cpu_seconds, 4),
            "threads": int(info.threadnum),
            "error": "",
        }
    except Exception:
        return None


def process_snapshot(pid: int) -> dict[str, Any]:
    error = ""
    try:
        if PS_EXECUTABLE is None:
            raise FileNotFoundError("未在 PATH 中找到 ps")
        completed = subprocess.run(
            [PS_EXECUTABLE, "-o", "rss=", "-o", "time=", "-p", str(pid)],
            check=False, capture_output=True, text=True, timeout=10,
        )
        text = completed.stdout.strip()
        match = _PS_PATTERN.match(text)
        if match:
            return {
                "pid": pid,
                "rss_kb": int(match.group("rss")),
                "cpu_seconds": parse_cpu_time(match.group("cpu")),
                "error": "",
            }
        error = text or completed.stderr.strip()
    except Exception as caught:
        error = str(caught)
    if sys.platform == "darwin":
        fallback = _macos_process_snapshot(pid)
        if fallback is not None:
            return fallback
    return {"pid": pid, "rss_kb": 0, "cpu_seconds": 0.0, "error": error}


_METRIC_LINE = re.compile(r"^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(?P<labels>[^}]*)\})?\s+(?P<value>[-+0-9.eE]+)$")


def scrape_metrics(url: str) -> dict[str, Any]:
    result = http_get(url, timeout=10)
    if not result["ok"]:
        return {"ok": False, "error": result["error"], "values": {}}
    values: dict[str, float] = {}
    raw: dict[str, float] = {}
    for line in result["body"].decode("utf-8", "replace").splitlines():
        match = _METRIC_LINE.match(line.strip())
        if not match:
            continue
        key = match.group("name")
        labels = match.group("labels") or ""
        if labels:
            key = f"{key}{{{labels}}}"
        try:
            value = float(match.group("value"))
        except ValueError:
            continue
        values[key] = value
        raw[match.group("name")] = raw.get(match.group("name"), 0.0) + value
    return {"ok": True, "error": "", "values": values, "totals": raw}


def db_count(metrics: dict[str, Any], kind: str) -> float:
    return float(metrics.get("values", {}).get(f'homeos_db_queries_total{{kind="{kind}"}}', 0.0))


def db_total(metrics: dict[str, Any]) -> float:
    return sum(db_count(metrics, kind) for kind in ("select", "write", "other"))


def wait_url(url: str, *, timeout_seconds: float = 90.0, cookie: str = "") -> tuple[bool, float]:
    started = time.perf_counter()
    deadline = started + timeout_seconds
    last_error = ""
    while time.perf_counter() < deadline:
        result = http_get(url, cookie=cookie, timeout=3)
        if result["ok"]:
            return True, (time.perf_counter() - started) * 1000.0
        last_error = result["error"] or str(result["status"])
        time.sleep(0.1)
    raise RuntimeError(f"等待 {url} 超时（{timeout_seconds}s）：{last_error}")


def tail(path: Path, limit: int = 3000) -> str:
    try:
        text = path.read_text("utf-8", "replace")
    except OSError:
        return ""
    return text[-limit:]
