#!/usr/bin/env python3
"""镜像冒烟：把「镜像里真的能起来」纳入门禁（原来只做一次 `import`）。

## 为什么原来的冒烟不够

`.github/workflows/docker.yml` 之前的冒烟只有一行 ——
`docker run --entrypoint python <image> -c "import app.app"`。它挡得住「构建期少 COPY 了东西 /
版本模块没烘进去」，但下面这些**只在进程真跑起来时才暴露**的问题它一条也看不见：

1. **版本模块**：`pip`/Cython 编译的是 `_version.py` 的副本，构建期 `ARG HOMEOS_VERSION` 传错时
   `import` 照样成功（模块在），但 `/system/info` 会报出与镜像 tag 不符的版本；
2. **lifespan 与启动期迁移**：`app` 的 lifespan 负责建库/迁移/后台任务，异常在 `import` 阶段不触发，
   只有真跑一次 `TestClient(app)`（会执行 startup/shutdown）才会暴露；
3. **内置反代（Caddy）**：镜像自带 `ops/caddy/*.Caddyfile` 与守护进程（`ops/docker/proxy.py`），
   `import` 完全碰不到它 —— 配置语法错、上游端口错、守护重启失效，都要真起容器才看得见；
4. **`container_entrypoint.py` 的密钥同步安全契约**：商店容器启动时生成密钥对，并把**公钥**
   同步给主应用目录（同机部署的信任锚）。同步逻辑走错（把私钥也拷过去）不会有任何报错，
   而那是「授权私钥随主应用镜像分发」级别的泄漏。

## 本脚本怎么验

| 步骤 | 手段 | 覆盖 |
| --- | --- | --- |
| `version` | 容器内 `python -c "from app import _version"` 与期望版本比对 | 构建期版本号真的烘进去了 |
| `caddy-config` | 容器内 `caddy validate --config /etc/caddy/Caddyfile` | 反代配置语法 / 指令合法 |
| `store-liveness` | 真起容器（真 entrypoint + 真启动器），等 HEALTHCHECK 变 `healthy` | lifespan、启动期建库、Caddy 起来并反代成功 |
| `key-sync-contract` | 起容器后读 `/data/license-keys` 与 `/data/client-keys` | 私钥**绝不**进主应用目录；公钥必须到 |
| `caddy-restart` | 容器内把 caddy 进程 SIGTERM 掉，等守护重启并由 `curl -k https://…` 复验 | `proxy.py` 的重启状态机真的能自愈 |

**为什么 `app` 镜像只跑前两步**：`ops/docker/start_app.py` 起容器时要求 `APP_LICENSE_SERVER_URL`
可达（否则阻塞在公钥获取并退出），所以 app 侧「真启动」属于**同机 compose 形态**的冒烟
（`verify:smoke:license` 的 `_license_activation_e2e_smoke.py` 已经在跑那条链路）。这里不重复造，
也不假装覆盖 —— app 的 lifespan 由那条 e2e 覆盖，本脚本对 app 只做不依赖商店的静态校验。

## 用法

```bash
python3 ops/docker/image_smoke.py --image ghcr.io/x/homeos-store:0.7.6 --project store --version 0.7.6
python3 ops/docker/image_smoke.py --image ghcr.io/x/homeos:0.7.6       --project app   --version 0.7.6
python3 ops/docker/image_smoke.py --image <ref> --project store --list      # 只列步骤
```

docker 不可用时打框状 `SKIP` 并以 0 退出（本机常见），CI 里 docker 一定在 —— 用 `--require-docker`
让「本机想确认却真的没跑」也红，避免把跳过读成通过。
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import time

#: 容器内健康检查用的探针端口（与 Dockerfile 的 HEALTHCHECK 一致）。
APP_HTTP_PORT = 8801
STORE_HTTP_PORT = 8802
#: 内置反代的探针端口与路径（HTTPS 自签，故 curl 要 `-k`）。
PROXY_PORT = {"app": 8803, "store": 8804}
HEALTH_PATH = {"app": "/health/ready", "store": "/healthz"}

#: 商店容器里密钥目录（与 `ops/docker/start_store.py` 的默认值一致）。
STORE_KEYS_DIR = "/data/license-keys"
CLIENT_KEYS_DIR = "/data/client-keys"
PRIVATE_KEY_NAMES = ("license-private.pem", "transport-private.pem")

HEALTH_TIMEOUT_SECONDS = 180
RESTART_TIMEOUT_SECONDS = 45

failures: list[str] = []
checked = 0


def check(label: str, condition: bool, detail: object = "") -> None:
    global checked
    checked += 1
    if not condition:
        failures.append(f"{label}{f'（{detail}）' if detail else ''}")
        print(f"  [FAIL] {label} {detail}")
    else:
        print(f"  [PASS] {label}")


def run(cmd: list[str], *, timeout: int = 600, check_rc: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    if check_rc and result.returncode != 0:
        raise AssertionError(
            f"命令失败（退出码 {result.returncode}）：{' '.join(cmd)}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def docker_available() -> bool:
    # 用 `which` 拿到的**完整路径**去探活（而不是裸 `docker`）：`S607` 禁的是相对/部分路径启动进程
    # —— PATH 被污染时，`docker` 会解析到谁都说不准的那个可执行文件。
    binary = shutil.which("docker")
    if binary is None:
        return False
    probe = subprocess.run([binary, "info"], capture_output=True, text=True, check=False)
    return probe.returncode == 0


def in_container(image: str, code: str, *, python: bool = True) -> subprocess.CompletedProcess[str]:
    """在容器里跑一段 python（或直接给 `caddy` 之类用 `python=False`）。"""
    entry = ["--entrypoint", "python", image, "-c", code] if python else [image]
    return run(["docker", "run", "--rm", *entry])


# ── 步骤实现 ──────────────────────────────────────────────────────────────


def step_version(image: str, expected: str) -> None:
    code = "import app._version as v; print(v.__version__)"
    result = in_container(image, code)
    actual = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
    check("镜像内版本号与构建 tag 一致", actual == expected, f"镜像内 {actual!r} ≠ 期望 {expected!r}")


def step_caddy_config(image: str) -> None:
    result = run(
        ["docker", "run", "--rm", "--entrypoint", "caddy", image, "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"],
    )
    check("镜像内 Caddyfile 语法/指令合法", result.returncode == 0, result.stderr.strip()[:300])


def step_store_liveness(image: str) -> str | None:
    """真起容器并等 HEALTHCHECK 变健康；返回容器名（失败/不允许时返回 None）。"""
    data_dir = tempfile.mkdtemp(prefix="homeos-image-smoke-")
    name = f"homeos-smoke-{int(time.time())}"
    run(["docker", "rm", "-f", name], check_rc=False)
    run(["docker", "run", "-d", "--name", name, "-v", f"{data_dir}:/data", image])

    deadline = time.time() + HEALTH_TIMEOUT_SECONDS
    status = "starting"
    while time.time() < deadline:
        probe = run(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}", name],
            check_rc=False,
        )
        if probe.returncode != 0:
            status = "容器已退出"
            break
        status = probe.stdout.strip()
        if status in {"healthy", "unhealthy"}:
            break
        time.sleep(2)

    if status != "healthy":
        logs = run(["docker", "logs", "--tail", "40", name], check_rc=False).stdout
        print(f"  ---- 容器日志（tail 40，状态 {status}）----\n{logs}")
    check("商店镜像真启动并健康（HTTP + 内置反代都在）", status == "healthy", f"状态 {status}")
    return name


def step_key_sync_contract(name: str) -> None:
    code = (
        "import json,pathlib;"
        f"priv=sorted(p.name for p in pathlib.Path('{STORE_KEYS_DIR}').glob('*'));"
        f"client=sorted(p.name for p in pathlib.Path('{CLIENT_KEYS_DIR}').glob('*'));"
        "print(json.dumps({'priv': priv, 'client': client}))"
    )
    result = run(["docker", "exec", name, "python", "-c", code], check_rc=False)
    listing = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "{}"
    try:
        payload = json.loads(listing)
    except json.JSONDecodeError:
        check("密钥目录可读", False, f"输出 {listing!r}；stderr {result.stderr.strip()[:200]}")
        return

    private_names = payload.get("priv", [])
    client_names = payload.get("client", [])
    check(
        "商店侧确实生成了私钥（否则这条契约测了个空目录）",
        any(name in private_names for name in PRIVATE_KEY_NAMES),
        private_names,
    )
    leaked = [name for name in client_names if "private" in name]
    check("私钥**没有**被同步进主应用公钥目录", not leaked, f"泄漏 {leaked}")
    check(
        "公钥确实同步到位（签名 + 传输）",
        "license-public.pem" in client_names and "transport-public.pem" in client_names,
        client_names,
    )


def step_caddy_restart(name: str, proxy_port: int, health_path: str) -> None:
    """杀掉容器内的 caddy，验证守护会把它拉起来（`ops/docker/proxy.py` 的重启状态机）。"""
    kill = (
        "import os,signal\n"
        "killed=[]\n"
        "for entry in os.listdir('/proc'):\n"
        "    if not entry.isdigit():\n"
        "        continue\n"
        "    try:\n"
        "        with open(f'/proc/{entry}/comm') as fh:\n"
        "            comm=fh.read().strip()\n"
        "    except OSError:\n"
        "        continue\n"
        "    if comm=='caddy':\n"
        "        os.kill(int(entry), signal.SIGTERM)\n"
        "        killed.append(int(entry))\n"
        # 只打印数量：让断言能直接 `int()` 解析，不必在宿主侧解析 python 的列表repr。
        "print(len(killed))\n"
    )
    killed = run(["docker", "exec", name, "python", "-c", kill], check_rc=False)
    last_line = killed.stdout.strip().splitlines()[-1] if killed.stdout.strip() else ""
    count = int(last_line) if last_line.isdigit() else 0
    check("容器内定位到 caddy 进程并已发 SIGTERM", count > 0, f"命中 {count} 个；stderr {killed.stderr.strip()[:200]}")

    probe = [
        "docker",
        "exec",
        name,
        "curl",
        "-fsSk",
        f"https://localhost:{proxy_port}{health_path}",
    ]
    deadline = time.time() + RESTART_TIMEOUT_SECONDS
    recovered = False
    log_seen = False
    while time.time() < deadline:
        if run(probe, check_rc=False).returncode == 0:
            recovered = True
        logs = run(["docker", "logs", name], check_rc=False)
        log_seen = "内置反代退出" in f"{logs.stdout}{logs.stderr}"
        if recovered and log_seen:
            break
        time.sleep(2)

    check("守护记录了反代退出并重启（proxy.py 状态机生效）", log_seen)
    check("重启后内置反代重新可用（HTTPS 复验通过）", recovered)


# ── 入口 ──────────────────────────────────────────────────────────────────


def steps_for(project: str) -> list[str]:
    return ["version", "caddy-config"] if project == "app" else [
        "version",
        "caddy-config",
        "store-liveness",
        "key-sync-contract",
        "caddy-restart",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="镜像冒烟（版本 / lifespan / 反代 / 密钥同步契约）")
    parser.add_argument("--image", help="镜像引用（含 tag）")
    parser.add_argument("--project", choices=("app", "store"), default="app")
    parser.add_argument("--version", default="", help="期望的版本号（仓库 package.json 的 version）")
    parser.add_argument("--list", action="store_true", help="只列步骤")
    parser.add_argument("--require-docker", action="store_true", help="docker 不可用时失败而非 SKIP")
    args = parser.parse_args()

    steps = steps_for(args.project)
    if args.list:
        for step in steps:
            print(step)
        return 0

    if not args.image:
        parser.error("--image 必填（或配合 --list 使用）")

    if not docker_available():
        banner = "SKIP：本机 docker 不可用，未验证任何断言"
        line = "═" * 58
        print(f"{line}\n  {banner}\n  （CI 里 docker 一定在；本机想强制则加 --require-docker）\n{line}")
        return 1 if args.require_docker else 0

    print(f"镜像冒烟：{args.image}（project={args.project}，{len(steps)} 步）")
    container: str | None = None
    try:
        if "version" in steps:
            step_version(args.image, args.version)
        if "caddy-config" in steps:
            step_caddy_config(args.image)
        if "store-liveness" in steps:
            container = step_store_liveness(args.image)
        if container and "key-sync-contract" in steps:
            step_key_sync_contract(container)
        if container and "caddy-restart" in steps:
            step_caddy_restart(container, PROXY_PORT[args.project], HEALTH_PATH[args.project])
    except AssertionError as error:
        check("镜像冒烟步骤执行", False, str(error)[:400])
    finally:
        if container:
            run(["docker", "rm", "-f", container], check_rc=False)

    if failures:
        print(f"\n镜像冒烟失败（{len(failures)} 项 / 共 {checked} 项断言）：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"\n✓ 镜像冒烟通过（{checked} 项断言）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
