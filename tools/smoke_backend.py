#!/usr/bin/env python3
"""后端冒烟：导入 → 路由清单比对 → 关键路径状态码。

为什么需要它
------------
仓库没有 CI，重构（拆模块、搬路由、改导入）出错时没有任何东西会在合并前报错。
这里只做三件**不依赖业务数据**的事：

1. 导入 ``backend.main`` 与 ``store.app``，捕获导入期断裂；
2. 把两个 app 的路由清单与签入快照 ``tools/routes.snapshot.txt`` 比对 —— 增删路由
   必须显式更新快照，防止重构顺手删掉接口；
3. 用 Starlette ``TestClient`` 打关键路径，**只断言状态码**，不校验响应内容。

数据目录指向临时目录（``APP_DATA_DIR`` / ``STORE_DATA_DIR``），启动时会自动跑迁移
建一个空库；更新检查与 HA 同步关掉，避免联网。跑完即清理，不碰仓库里的 ``data/``。

用法
----
    python tools/smoke_backend.py                     # 校验，失败退出码 1
    python tools/smoke_backend.py --update-snapshot   # 仅在确知路由变化时重写快照
    python tools/smoke_backend.py --no-http           # 只做导入 + 路由比对
"""

from __future__ import annotations

import argparse
import contextlib
import io
import os
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / 'tools' / 'routes.snapshot.txt'
TMP_ROOT = Path(tempfile.mkdtemp(prefix = 'homeos-smoke-'))

# 必须在导入 backend.main 之前落定：该模块在导入期就执行 create_app()。
os.environ.setdefault('APP_DATA_DIR', str(TMP_ROOT / 'app'))
os.environ.setdefault('STORE_DATA_DIR', str(TMP_ROOT / 'store'))
os.environ.setdefault('STORE_LICENSE_KEYS_DIR', str(TMP_ROOT / 'store-keys'))
os.environ.setdefault('APP_UPDATE_CHECKS', '0')
os.environ.setdefault('STORE_UPDATE_CHECKS', '0')
os.environ.setdefault('APP_ENV', 'test')

sys.path.insert(0, str(ROOT))

problems: list[str] = []
notes: list[str] = []


def prepare_license_keys() -> None:
    """在临时目录里生成一副一次性商店密钥，并把公钥指纹指给主应用。

    商店的 ``license_keys_dir`` 取默认目录时「缺钥即 raise」（防「商店一把钥、客户端
    另一把」的静默激活失败），只有自定义目录才允许自动生成。冒烟跑在临时目录里，不先
    生成密钥的话这个脚本就只在「本地跑过 python start.py」的机器上能过 —— 干净检出
    （也就是 CI）里必然红，而红的原因跟被测代码毫无关系。
    """
    from docker.license_keys import apply_client_key_env, ensure_store_license_keys

    client_keys_dir = TMP_ROOT / 'client-keys'
    ensure_store_license_keys(Path(os.environ['STORE_LICENSE_KEYS_DIR']), client_keys_dir)
    os.environ.update(apply_client_key_env({}, client_keys_dir))


def silence_framework_logs() -> None:
    """把框架的 INFO 噪音压掉：迁移日志属于「跑通了才有」的细节，不该盖住结论。"""
    import logging
    import warnings

    warnings.filterwarnings('ignore', category = DeprecationWarning)
    for noisy in ('alembic', 'sqlalchemy.engine', 'httpx', 'httpcore'):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def route_lines(app, label: str) -> list[str]:
    """把 app 的路由表摊平成可签入的稳定文本：``<label>\\t<METHODS> <path>``。

    必须递归：``include_router()`` 在当前 Starlette 上留下的是 ``_IncludedRouter``
    包装（前缀在 ``include_context.prefix``，子路由在 ``original_router.routes``），
    子路由**不在**父 ``app.routes`` 里。不递归就只能看到十几条顶层路由，
    接口被误删时快照照样通过 —— 那就白做了。
    """
    from starlette.routing import Mount, Route, WebSocketRoute

    out: list[str] = []
    seen: set[str] = set()
    visited: set[int] = set()

    def walk(routes, prefix: str) -> None:
        for route in routes:
            if type(route).__name__ == '_IncludedRouter':
                if id(route) in visited:
                    continue
                visited.add(id(route))
                context = getattr(route, 'include_context', None)
                inner = getattr(context, 'included_router', None) or getattr(route, 'original_router', None)
                walk(getattr(inner, 'routes', []) or [], prefix + (getattr(context, 'prefix', '') or ''))
                continue

            path = getattr(route, 'path', None)
            if path is None:
                continue
            full = prefix + path
            if isinstance(route, Mount):
                line = f'{label}\tMOUNT {full}'
            elif isinstance(route, WebSocketRoute):
                line = f'{label}\tWEBSOCKET {full}'
            elif isinstance(route, Route):
                methods = ','.join(sorted(getattr(route, 'methods', None) or []))
                line = f'{label}\t{methods or "-"} {full}'
            else:
                continue
            if line in seen:
                continue
            seen.add(line)
            out.append(line)

    walk(getattr(app, 'router', app).routes, '')
    return out


def compare_snapshot(lines: list[str], update: bool) -> None:
    current = sorted(lines)
    if update:
        SNAPSHOT.write_text('\n'.join(current) + '\n', encoding = 'utf-8')
        notes.append(f'snapshot rewritten: {SNAPSHOT.relative_to(ROOT)} ({len(current)} routes)')
        return
    if not SNAPSHOT.exists():
        problems.append(f'缺少路由快照 {SNAPSHOT.relative_to(ROOT)}，先用 --update-snapshot 生成')
        return
    expected = sorted(line for line in SNAPSHOT.read_text(encoding = 'utf-8').splitlines() if line.strip())
    added = [line for line in current if line not in set(expected)]
    removed = [line for line in expected if line not in set(current)]
    for line in added:
        problems.append(f'新增路由未登记到快照: {line}')
    for line in removed:
        problems.append(f'路由消失（快照里有、当前没有）: {line}')


def check_http() -> None:
    from fastapi.testclient import TestClient

    import backend.main as main_module
    import store.app as store_module

    cases: list[tuple[str, object, str, tuple[int, ...]]] = [
        # 存活 / 就绪：后者会真连一次数据库（空库也算就绪）。
        ('主应用', main_module.app, '/health/live', (200,)),
        ('主应用', main_module.app, '/health/ready', (200,)),
        # 未初始化时 /setup 直接渲染，顺带证明前端目录与模板渲染还在。
        ('主应用', main_module.app, '/setup', (200,)),
        # 未初始化时首页分流到 /setup；只有给 5xx 才算回归。
        ('主应用', main_module.app, '/', (301, 302, 303, 307, 308)),
        # 登录门禁与未知路径分流：接口没登录 401，乱写的路径 404（不是被门禁一律 401 吞掉）。
        ('主应用', main_module.app, '/api/v1/auth/me', (401,)),
        ('主应用', main_module.app, '/__no_such_path__', (404,)),
        # 静态资源受门禁保护：既证明 /static 挂载在，也防止哪天被改成匿名可读。
        ('主应用', main_module.app, '/static/app.css', (401, 403)),
        ('商店', store_module.create_app(), '/healthz', (200,)),
        ('商店', store_module.create_app(), '/store-static/theme.css', (200,)),
        ('商店', store_module.create_app(), '/__no_such_path__', (404,)),
    ]
    for label, app, path, allowed in cases:
        try:
            with TestClient(app) as client:
                response = client.get(path, follow_redirects = False)
        except Exception:  # noqa: BLE001 - 冒烟要的是「哪一步炸了」，不是异常类型
            problems.append(f'{label} {path} 请求抛异常:\n{traceback.format_exc(limit = 6)}')
            continue
        if response.status_code not in allowed:
            problems.append(f'{label} {path} 期望 {allowed}，实际 {response.status_code}')
        else:
            notes.append(f'{label} {path} -> {response.status_code}')


def main() -> int:
    parser = argparse.ArgumentParser(description = '后端冒烟：导入 + 路由比对 + 关键路径状态码')
    parser.add_argument('--update-snapshot', action = 'store_true', help = '重写 tools/routes.snapshot.txt')
    parser.add_argument('--no-http', action = 'store_true', help = '跳过 TestClient 请求')
    parser.add_argument('--verbose', action = 'store_true', help = '保留迁移等框架日志')
    args = parser.parse_args()

    if not args.verbose:
        silence_framework_logs()

    # 两个 app 在导入期与 TestClient 启动期会往 stdout 打整块「首次设置」引导横幅，
    # 一屏接一屏，正好把结论冲掉。默认整段吞掉，只在失败时连同结论一起回放。
    buffer = None if args.verbose else io.StringIO()
    swallow = contextlib.ExitStack()
    if buffer is not None:
        swallow.enter_context(contextlib.redirect_stdout(buffer))
        swallow.enter_context(contextlib.redirect_stderr(buffer))

    try:
        try:
            prepare_license_keys()
        except Exception:  # noqa: BLE001
            problems.append(f'准备一次性授权密钥失败:\n{traceback.format_exc(limit = 8)}')

        try:
            import backend.main as main_module
            notes.append('import backend.main OK')
        except Exception:  # noqa: BLE001
            problems.append(f'import backend.main 失败:\n{traceback.format_exc(limit = 8)}')
            main_module = None

        try:
            import store.app as store_module
            notes.append('import store.app OK')
        except Exception:  # noqa: BLE001
            problems.append(f'import store.app 失败:\n{traceback.format_exc(limit = 8)}')
            store_module = None

        if not args.verbose:
            # 导入期两个 app 都会 basicConfig 一次，所以要在导入之后再压一遍。
            silence_framework_logs()

        lines: list[str] = []
        if main_module is not None:
            lines += route_lines(main_module.app, 'main')
        if store_module is not None:
            lines += route_lines(store_module.create_app(), 'store')
        if lines:
            compare_snapshot(lines, args.update_snapshot)

        if not args.no_http and main_module is not None and store_module is not None:
            check_http()
    finally:
        swallow.close()
        shutil.rmtree(TMP_ROOT, ignore_errors = True)

    for note in notes:
        print(f'  {note}')
    if problems:
        print()
        for problem in problems:
            print(f'FAIL: {problem}')
        if buffer is not None and buffer.getvalue().strip():
            # 导入期崩溃的原因常常只印在启动横幅里，这里原样回放 —— 但只回放尾部：
            # 横幅占大头，真正要看的 traceback 总在最后几行。要看全程请用 --verbose。
            tail = buffer.getvalue().rstrip().splitlines()[-40:]
            print(f'\n--- 被吞掉的启动期输出（末 {len(tail)} 行，--verbose 看全程）---')
            print('\n'.join(tail))
        print(f'\n{len(problems)} 项失败')
        return 1
    print('\nOK: 后端导入、路由快照与关键路径状态码全部通过。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
