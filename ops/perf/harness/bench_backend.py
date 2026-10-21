#!/usr/bin/env python3
"""启动隔离后端实例并测量 API 延迟、吞吐、DB 查询数与进程资源。

用法：
  python ops/perf/harness/bench_backend.py --label before --serve-only
  python ops/perf/harness/bench_backend.py --label before
  python ops/perf/harness/bench_backend.py --label before --stop
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import signal
import socket
import subprocess
import time
from pathlib import Path
from typing import Any

from perf_common import (
    ROOT,
    db_count,
    db_total,
    http_get,
    load_env,
    process_snapshot,
    result_dir,
    scrape_metrics,
    summarize,
    tail,
    wait_url,
    write_json,
)

CONCURRENCY = 32
SEQUENTIAL_REQUESTS = 100
CONCURRENT_REQUESTS = 200
WARMUP_REQUESTS = 20
DB_PROBE_REQUESTS = 10
# A/B 时用 PERF_SOURCE_ROOT 指向基线源码树；默认就是当前工作区。
SOURCE_ROOT = Path(os.environ.get("PERF_SOURCE_ROOT", str(ROOT))).resolve()

#: 启动期 import 归因：只 import 应用模块（不跑 lifespan、不建库），用于把
#: ``homeos_boot_import_ms`` 拆到具体模块。生产镜像是 Cython .so，此项只代表源码态口径。
IMPORTTIME_TARGET = "import src.app"
IMPORTTIME_TOP_N = 40


def collect_import_attribution(label: str) -> dict[str, Any]:
    """跑一次 ``python -X importtime``，产出可归因的模块导入耗时表。"""
    env_data = load_env(label)
    python = env_data["python"]
    backend_dir = SOURCE_ROOT / "homeos" / "backend"
    out_dir = result_dir(label)
    log_path = out_dir / "importtime.txt"
    env = os.environ.copy()
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                "http_proxy", "https_proxy", "all_proxy", "no_proxy",
                "PYTHONDONTWRITEBYTECODE"):
        env.pop(key, None)
    env["PYTHONPATH"] = str(backend_dir)
    started = time.perf_counter()
    with log_path.open("wb") as handle:
        subprocess.run(
            [python, "-X", "importtime", "-c", IMPORTTIME_TARGET],
            cwd=str(backend_dir), env=env, stdout=subprocess.DEVNULL, stderr=handle,
            check=False,
        )
    wall_ms = round((time.perf_counter() - started) * 1000.0, 2)
    rows: list[dict[str, Any]] = []
    for line in log_path.read_text("utf-8", errors="replace").splitlines():
        match = re.match(r"import time:\s+(\d+)\s+\|\s+(\d+)\s+\|\s+(.*)", line)
        if not match:
            continue
        rows.append({
            "self_us": int(match.group(1)),
            "cumulative_us": int(match.group(2)),
            "module": match.group(3).strip(),
        })
    total_self_us = sum(row["self_us"] for row in rows)
    payload = {
        "target": IMPORTTIME_TARGET,
        "sourceRoot": str(SOURCE_ROOT),
        "wallMs": wall_ms,
        "moduleCount": len(rows),
        "totalSelfMs": round(total_self_us / 1000.0, 2),
        "note": "源码态口径；生产镜像为 Cython .so，不含 Python 源码导入。",
        "topSelf": [
            {
                "module": row["module"],
                "selfMs": round(row["self_us"] / 1000.0, 2),
                "cumulativeMs": round(row["cumulative_us"] / 1000.0, 2),
            }
            for row in sorted(rows, key=lambda item: -item["self_us"])[:IMPORTTIME_TOP_N]
        ],
        "topCumulative": [
            {
                "module": row["module"],
                "selfMs": round(row["self_us"] / 1000.0, 2),
                "cumulativeMs": round(row["cumulative_us"] / 1000.0, 2),
            }
            for row in sorted(rows, key=lambda item: -item["cumulative_us"])[:IMPORTTIME_TOP_N]
        ],
    }
    write_json(out_dir / "importtime.json", payload)
    print(f"[{label}] import 归因：{out_dir / 'importtime.json'}（self 合计 {payload['totalSelfMs']} ms）")
    return payload


def _servers_path(label: str) -> Path:
    return Path(load_env(label)["perfRoot"]) / "env" / label / "servers.json"


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((host, port)) == 0


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _stop_pid(pid: int, label: str) -> None:
    if not _pid_alive(pid):
        return
    try:
        os.killpg(pid, signal.SIGTERM)
    except OSError:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return
    deadline = time.time() + 20
    while time.time() < deadline and _pid_alive(pid):
        time.sleep(0.1)
    if _pid_alive(pid):
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
    print(f"[{label}] 已停止 pid={pid}")


def stop_servers(label: str) -> None:
    path = _servers_path(label)
    if not path.is_file():
        print(f"[{label}] 没有记录中的服务进程")
        return
    try:
        payload = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return
    for name in ("homeos", "store"):
        record = payload.get(name) or {}
        pid = int(record.get("pid") or 0)
        if pid:
            _stop_pid(pid, f"{label}/{name}")
    path.unlink(missing_ok=True)


def _start_process(label: str, name: str, command: list[str], cwd: Path,
                   env: dict[str, str], health_url: str) -> dict[str, Any]:
    log_dir = Path(load_env(label)["perfRoot"]) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{label}-{name}.log"
    log_file = log_path.open("wb")
    started_at = time.time()
    process = subprocess.Popen(
        command, cwd=str(cwd), env=env, stdout=log_file, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        timeout = float(os.environ.get("PERF_STARTUP_TIMEOUT_SECONDS", "120"))
        deadline = time.time() + timeout
        ok = False
        while time.time() < deadline:
            if process.poll() is not None:
                break
            ok, _ = wait_url(health_url, timeout_seconds=min(2.0, max(0.2, deadline - time.time())))
            if ok:
                break
        if not ok:
            raise RuntimeError(f"{name} 在 {timeout:.0f}s 内未就绪")
    except Exception as exc:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        log_file.close()
        raise RuntimeError(f"{name} 启动失败，日志：{log_path}\n{tail(log_path)}") from exc
    ready_at = time.time()
    wall_ms = (ready_at - started_at) * 1000.0
    print(f"[{label}/{name}] pid={process.pid} 启动 {wall_ms:.1f} ms，日志 {log_path}")
    log_file.close()
    return {
        "pid": process.pid,
        "startedAt": started_at,
        "readyAt": ready_at,
        "wallMs": round(wall_ms, 2),
        "log": str(log_path),
        "healthUrl": health_url,
    }


def start_servers(label: str) -> dict[str, Any]:
    env_data = load_env(label)
    homeos = env_data["homeos"]
    store = env_data["store"]
    for name, port in (("homeos", homeos["port"]), ("store", store["port"])):
        if _port_open("127.0.0.1", int(port)):
            raise SystemExit(f"{name} 端口 {port} 已被占用；先停止旧实例或换端口")
    base_env = os.environ.copy()
    # 本机 DSH 环境带 http(s)_proxy 且 NO_PROXY 含 "[::1]"，httpx 0.28.1 解析会抛
    # InvalidURL: Invalid port ':1]'；隔离实例不需要出网代理，统一剥掉。
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                "http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        base_env.pop(key, None)
    homeos_env = {
        **base_env,
        "HOMEOS_DATA_DIR": homeos["dataDir"],
        "HOMEOS_FRONTEND_DIR": homeos["frontendDir"],
        "HOMEOS_HOST": "127.0.0.1",
        "PORT": str(homeos["port"]),
        "LICENSE_REQUIRED": "0",
        "HOMEOS_RELOAD": "0",
        "HOMEOS_SHUTDOWN_TIMEOUT": "5",
        "LOG_LEVEL": "WARNING",
        "PYTHONPATH": str(SOURCE_ROOT / "homeos" / "backend"),
    }
    store_env = {
        **base_env,
        "STORE_DATA_DIR": store["dataDir"],
        "STORE_SHELL_DIR": store["shellDir"],
        "STORE_STATIC_DIR": store["staticDir"],
        "STORE_HOST": "127.0.0.1",
        "STORE_PORT": str(store["port"]),
        "STORE_MAIL_MODE": "log",
        "STORE_RELOAD": "0",
        "PYTHONPATH": str(SOURCE_ROOT / "homeos-store" / "backend"),
    }
    python = env_data["python"]
    homeos_record = _start_process(
        label, "homeos", [python, "-m", "src.run"], SOURCE_ROOT / "homeos" / "backend",
        homeos_env, f"http://127.0.0.1:{homeos['port']}/health/ready",
    )
    store_record = _start_process(
        label, "store", [python, "-m", "src.run"], SOURCE_ROOT / "homeos-store" / "backend",
        store_env, f"http://127.0.0.1:{store['port']}/healthz",
    )
    payload = {
        "label": label,
        "startedAt": time.time(),
        "homeos": homeos_record,
        "store": store_record,
    }
    write_json(_servers_path(label), payload)
    return payload


def _ensure_servers(label: str, *, serve_only: bool = False) -> dict[str, Any]:
    path = _servers_path(label)
    if path.is_file():
        try:
            payload = json.loads(path.read_text("utf-8"))
        except ValueError:
            payload = {}
        healthy = True
        for name, port in (("homeos", load_env(label)["homeos"]["port"]),
                           ("store", load_env(label)["store"]["port"])):
            record = payload.get(name) or {}
            if not _port_open("127.0.0.1", int(port)):
                healthy = False
                break
            if record.get("pid") and not _pid_alive(int(record["pid"])):
                healthy = False
                break
        if healthy:
            print(f"[{label}] 复用运行中的隔离实例")
            return payload
        stop_servers(label)
    payload = start_servers(label)
    if serve_only:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return payload


def _measure_endpoint(url: str, cookie: str, *, warmup: int, sequential: int,
                      concurrent_requests: int, with_db: bool, metrics_url: str) -> dict[str, Any]:
    for _ in range(warmup):
        http_get(url, cookie=cookie)

    db_before = scrape_metrics(metrics_url) if with_db else {}
    sequential_samples: list[float] = []
    sequential_errors = 0
    sequential_bytes = 0
    sequential_statuses: dict[int, int] = {}
    for _ in range(sequential):
        result = http_get(url, cookie=cookie)
        sequential_samples.append(result["elapsed_ms"])
        sequential_bytes += result["bytes"]
        sequential_statuses[result["status"]] = sequential_statuses.get(result["status"], 0) + 1
        if not result["ok"]:
            sequential_errors += 1
    db_after = scrape_metrics(metrics_url) if with_db else {}
    db_delta = None
    if with_db and db_before.get("ok") and db_after.get("ok"):
        probe_count = max(1, sequential)
        db_delta = {
            "select": round((db_count(db_after, "select") - db_count(db_before, "select")) / probe_count, 4),
            "write": round((db_count(db_after, "write") - db_count(db_before, "write")) / probe_count, 4),
            "other": round((db_count(db_after, "other") - db_count(db_before, "other")) / probe_count, 4),
            "total": round((db_total(db_after) - db_total(db_before)) / probe_count, 4),
        }

    started = time.perf_counter()
    concurrent_samples: list[float] = []
    concurrent_errors = 0
    concurrent_bytes = 0
    concurrent_statuses: dict[int, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(http_get, url, cookie=cookie) for _ in range(concurrent_requests)]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            concurrent_samples.append(result["elapsed_ms"])
            concurrent_bytes += result["bytes"]
            concurrent_statuses[result["status"]] = concurrent_statuses.get(result["status"], 0) + 1
            if not result["ok"]:
                concurrent_errors += 1
    wall = time.perf_counter() - started
    return {
        "sequential": {
            **summarize(sequential_samples, wall_seconds=sum(sequential_samples) / 1000.0,
                        errors=sequential_errors, bytes_total=sequential_bytes),
            "statuses": sequential_statuses,
        },
        "concurrent": {
            **summarize(concurrent_samples, wall_seconds=wall,
                        errors=concurrent_errors, bytes_total=concurrent_bytes),
            "statuses": concurrent_statuses,
            "workers": CONCURRENCY,
        },
        "db_per_request": db_delta,
    }


def measure(label: str, servers: dict[str, Any], *, tag: str = "") -> dict[str, Any]:
    env_data = load_env(label)
    homeos = env_data["homeos"]
    store = env_data["store"]
    cookie = str(homeos["token"])
    homeos_base = f"http://127.0.0.1:{homeos['port']}"
    store_base = f"http://127.0.0.1:{store['port']}"
    project_id = homeos["projectId"]
    homeos_endpoints = [
        ("health_ready", "/health/ready", False),
        ("public_config", "/api/v1/public/config", False),
        ("index", "/", False),
        ("projects", "/api/v1/projects", True),
        ("project_draft", f"/api/v1/projects/{project_id}/draft", True),
        ("project_revision", f"/api/v1/projects/{project_id}/revision", True),
        ("assets_version", "/api/v1/assets/version", True),
        ("assets_builtin", "/api/v1/assets/builtin", True),
        ("assets_user", "/api/v1/assets/user", True),
        ("ha_entities", "/api/v1/ha/entities?limit=500", True),
    ]
    store_endpoints = [
        ("healthz", "/healthz", False),
        ("index", "/", False),
        ("products", "/store/v1/products", False),
        ("features", "/store/v1/features", False),
    ]
    metrics_url = f"{homeos_base}/metrics"
    measure_started = time.time()
    before_process = {
        "homeos": process_snapshot(int(servers["homeos"]["pid"])),
        "store": process_snapshot(int(servers["store"]["pid"])),
    }
    metrics_before = scrape_metrics(metrics_url)

    endpoints: dict[str, Any] = {"homeos": [], "store": []}
    for name, path, auth in homeos_endpoints:
        print(f"[{label}] homeos {name} ...", flush=True)
        endpoints["homeos"].append({
            "name": name,
            "path": path,
            "auth": auth,
            **_measure_endpoint(
                homeos_base + path, cookie if auth else "",
                warmup=WARMUP_REQUESTS, sequential=SEQUENTIAL_REQUESTS,
                concurrent_requests=CONCURRENT_REQUESTS, with_db=True, metrics_url=metrics_url,
            ),
        })
    for name, path, auth in store_endpoints:
        print(f"[{label}] store {name} ...", flush=True)
        endpoints["store"].append({
            "name": name,
            "path": path,
            "auth": auth,
            **_measure_endpoint(
                store_base + path, cookie if auth else "",
                warmup=WARMUP_REQUESTS, sequential=SEQUENTIAL_REQUESTS,
                concurrent_requests=CONCURRENT_REQUESTS, with_db=False, metrics_url="",
            ),
        })

    after_process = {
        "homeos": process_snapshot(int(servers["homeos"]["pid"])),
        "store": process_snapshot(int(servers["store"]["pid"])),
    }
    metrics_after = scrape_metrics(metrics_url)

    def resource_delta(name: str) -> dict[str, Any]:
        before = before_process[name]
        after = after_process[name]
        elapsed = max(0.001, time.time() - measure_started)
        cpu = max(0.0, float(after.get("cpu_seconds", 0)) - float(before.get("cpu_seconds", 0)))
        return {
            "before": before,
            "after": after,
            "cpu_seconds_delta": round(cpu, 3),
            "rss_kb_delta": int(after.get("rss_kb", 0)) - int(before.get("rss_kb", 0)),
            "cpu_utilization_pct": round(cpu / elapsed * 100.0, 2) if elapsed > 0 else 0.0,
        }

    result = {
        "label": label,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "environment": {
            "homeos": {"port": homeos["port"], "dataDir": homeos["dataDir"],
                        "frontendDir": homeos["frontendDir"], "projectId": project_id,
                        "sceneId": homeos["sceneId"]},
            "store": {"port": store["port"], "dataDir": store["dataDir"],
                       "shellDir": store["shellDir"]},
            "concurrency": CONCURRENCY,
            "sequentialRequests": SEQUENTIAL_REQUESTS,
            "concurrentRequests": CONCURRENT_REQUESTS,
        },
        "startup": {
            "homeos_wall_ms": servers["homeos"]["wallMs"],
            "store_wall_ms": servers["store"]["wallMs"],
            "homeos_reported_ms": metrics_before.get("values", {}).get("homeos_startup_duration_ms"),
            "boot_import_ms": metrics_before.get("values", {}).get("homeos_boot_import_ms"),
            "phases_ms": {
                key.split('phase="')[-1].rstrip('"}').rstrip('"'): value
                for key, value in metrics_before.get("values", {}).items()
                if key.startswith("homeos_startup_phase_duration_ms")
            },
        },
        "endpoints": endpoints,
        "resources": {
            "homeos": resource_delta("homeos"),
            "store": resource_delta("store"),
            "elapsed_s": round(time.time() - float(servers["startedAt"]), 2),
        },
        "app_metrics": {
            "before": {k: v for k, v in metrics_before.items() if k != "values"},
            "after": {k: v for k, v in metrics_after.items() if k != "values"},
            "loop_lag": {
                "p50": metrics_after.get("values", {}).get('homeos_event_loop_lag_ms{quantile="p50"}'),
                "p99": metrics_after.get("values", {}).get('homeos_event_loop_lag_ms{quantile="p99"}'),
                "max": metrics_after.get("values", {}).get('homeos_event_loop_lag_ms{quantile="max"}'),
                "samples": metrics_after.get("values", {}).get("homeos_event_loop_lag_samples"),
            },
            "db_before": {k: v for k, v in metrics_before.get("values", {}).items()
                          if k.startswith("homeos_db_queries_total")},
            "db_after": {k: v for k, v in metrics_after.get("values", {}).items()
                         if k.startswith("homeos_db_queries_total")},
            "http": {k: v for k, v in metrics_after.get("values", {}).items()
                     if k.startswith("homeos_http_request_duration_seconds")},
        },
    }
    output = result_dir(label) / ("backend.json" if not tag else f"backend-{tag}.json")
    # import 归因放在所有延迟测量之后：它要额外 spawn 一个 Python 进程，不应污染 p50/p95。
    try:
        result["import_attribution"] = collect_import_attribution(label)
    except Exception as error:  # noqa: BLE001 - 归因失败不应让整轮测量作废
        result["import_attribution"] = {"error": str(error)[:500]}
        print(f"[{label}] import 归因失败：{error}")
    write_json(output, result)
    print(f"[{label}] 后端结果：{output}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--serve-only", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--no-start", action="store_true")
    parser.add_argument("--tag", default="", help="结果文件名后缀：backend-<tag>.json")
    args = parser.parse_args()
    if args.stop:
        stop_servers(args.label)
        return
    servers = _ensure_servers(args.label, serve_only=args.serve_only)
    if args.serve_only:
        return
    if args.no_start:
        for name in ("homeos", "store"):
            if not _port_open("127.0.0.1", int(load_env(args.label)[name]["port"])):
                raise SystemExit(f"{name} 未运行")
    measure(args.label, servers, tag=args.tag)


if __name__ == "__main__":
    main()
