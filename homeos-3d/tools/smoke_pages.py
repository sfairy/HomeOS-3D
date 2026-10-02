#!/usr/bin/env python3
"""对 HomeOS 后端做端到端冒烟：生命周期 + 页面路由 + 匿名静态资源 + runtime 模块下发。

用法（解释器用仓库根的 .venv-store，见 ops/start.py 的 VENV_DIR）：
    ../.venv-store/bin/python tools/smoke_pages.py                # 进程内起 ASGI 应用（默认）
    ../.venv-store/bin/python tools/smoke_pages.py --base http://127.0.0.1:8799   # 打已运行的实例

为什么默认进程内：后台进程会随启动它的 shell 一起被判死（nohup 也拦不住），
冒烟就得靠"先起后测再杀"三条命令对齐时间，非常脆。直接用 TestClient 跑真实 ASGI
应用，连 lifespan 都是真的（迁移、后台服务、中间件全在），而且一个进程跑完就退出。

顺带一提：这也是唯一能确认「后端真的能起来」的方式 —— 只是 build 通过、
对账全绿，都不能证明 import 链没断。

判定口径：
- 页面路由：200（直接给页面）或 303/307（按登录/授权状态跳转）都算正常。
  未初始化时 `/` 跳 `/setup`、未登录时 `/3d-studio` 跳 `/login`，都是预期行为。
- 匿名静态资源：公开页引用的资源在未登录状态下必须 200。漏一个就是白屏 ——
  本次迁移最容易踩的坑（/bridge-static -> /static、构建产物改名带哈希）。
- 越权防线：白名单外的 /static 资源必须被拦下（不能 200）。
- runtime 模块：未授权时 401/403/404 都算防线正确，5xx 一定是 bug。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

# 未初始化 / 未登录时可访问的页面路由。路径必须与 main.py 的 @app.get 一一对应
# （例如「展示页」是 /display/{project_id}，没有 /display 这个路由；
#   license-recovery.html 由 /license 流程内部下发，也没有独立路由）。
PAGES = (
    "/",
    "/setup",
    "/login",
    "/pair",
    "/license",
    "/3d-studio",
    "/display/demo-project",
    "/projects/demo-project/3d-studio",
    "/health/live",
    "/health/ready",
    "/favicon.ico",
)
PUBLIC_PAGES = ("setup.html", "login.html", "pair.html", "license.html", "license-recovery.html")
# 登录后才拿得到的页面：它们引用构建产物里的 app bundle，而 bundle 会再相对引用
# 带哈希的共享 chunk —— 这一整条 import 链正是「后端白名单 + 清单」最容易漏的地方。
AUTHENTICATED_PAGES = ("index.html", "3d-studio.html")

failures: list[str] = []
checked = 0


def prepare_environment() -> None:
    """在 import 后端之前把数据目录指到临时目录。

    config.load_settings() 在 import 期就会推导路径，晚一步设置就写到真实 /data 了。
    """
    data_dir = Path(tempfile.mkdtemp(prefix="homeos-smoke-"))
    os.environ.setdefault("APP_DATA_DIR", str(data_dir))
    os.environ.setdefault("APP_UPDATE_CHANNEL", "dev")
    # 授权商店不在本地时不要卡在握手超时上。
    os.environ.setdefault("APP_LICENSE_REQUEST_TIMEOUT_SECONDS", "2")
    os.environ.setdefault("APP_HA_REQUEST_TIMEOUT_SECONDS", "2")
    print(f"数据目录：{data_dir}")


def build_app():
    sys.path.insert(0, str(ROOT))
    from backend.src.main import create_app

    return create_app()


class TestClientLazy:
    """延迟到 with 里才 import TestClient。

    fastapi.testclient 在 import 期会打一条 httpx 弃用警告，放在文件顶部会让
    「先打印数据目录」的日志顺序乱掉，也容易让人以为警告来自被测代码。
    """

    def __init__(self, app):
        self.app = app
        self._client = None

    def __enter__(self):
        from fastapi.testclient import TestClient

        # raise_server_exceptions=False：让 500 以响应形式返回，而不是抛进 traceback，
        # 这样"某个页面 500"会被记成一条可读的失败项。
        self._client = TestClient(self.app, raise_server_exceptions=False)
        return self._client.__enter__()

    def __exit__(self, *exc_info):
        return self._client.__exit__(*exc_info)


def check_pages(client) -> None:
    global checked
    print("页面路由：")
    for path in PAGES:
        checked += 1
        response = client.get(path, follow_redirects=False)
        status = response.status_code
        if status in (200, 303, 307):
            location = response.headers.get("location", "")
            print(f"  OK   {path:<20} {status} {location}")
            continue
        failures.append(f"页面 {path} 返回 {status}")
        print(f"  FAIL {path:<20} {status}")

    # 已下线页面必须显式 404：被静态兜底吞成首页内容比 404 更难排查。
    for removed in ("/component-lab", "/template-assets/whatever.js"):
        checked += 1
        response = client.get(removed)
        if response.status_code == 404:
            print(f"  OK   {removed:<30} 404（已下线页面按设计返回 404）")
        else:
            failures.append(f"已下线页面 {removed} 返回 {response.status_code}（应为 404）")
            print(f"  FAIL {removed:<30} {response.status_code}")


def public_page_refs() -> list[str]:
    refs: list[str] = []
    for page in PUBLIC_PAGES:
        html_path = DIST / page
        if not html_path.is_file():
            failures.append(f"构建产物缺少公开页：{page}")
            continue
        html = html_path.read_text(encoding="utf-8")
        for match in re.finditer(r"""(?:src|href)=["'](/static/[^"']+)["']""", html):
            ref = match.group(1).split("?")[0]
            if ref not in refs:
                refs.append(ref)
    return refs


def check_anonymous_assets(client) -> None:
    global checked
    print("匿名静态资源（未登录必须可加载）：")
    refs = public_page_refs()
    broken: list[str] = []
    for ref in refs:
        checked += 1
        response = client.get(ref)
        if response.status_code == 200 and response.content:
            continue
        broken.append(f"{ref} -> {response.status_code}")
        print(f"  FAIL {ref:<54} {response.status_code}")
    if broken:
        failures.append(f"{len(broken)} 条匿名资源不可加载：{broken[:6]}")
    else:
        print(f"  OK   {len(refs)} 条公开页资源全部 200")

    print("越权防线（白名单外的 /static 必须被拦下）：")
    for guarded in ("/static/assets/modules/interaction3d/stage.js", "/static/index.html", "/static/3d-studio/studio-app.js"):
        checked += 1
        response = client.get(guarded)
        if response.status_code == 200:
            failures.append(f"受保护资源 {guarded} 未登录却返回 200（越权）")
            print(f"  FAIL {guarded:<54} 200")
        else:
            print(f"  OK   {guarded:<54} {response.status_code}")


def check_runtime_modules(client) -> None:
    global checked
    print("runtime 模块下发：")
    manifest_path = DIST / "modules" / "runtime" / "manifest.json"
    if not manifest_path.is_file():
        failures.append("dist/modules/runtime/manifest.json 缺失")
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files", [])
    entries = [name for name in files if "/chunks/" not in name]
    server_errors: list[str] = []
    for name in entries:
        checked += 1
        response = client.get(f"/api/v1/modules/interaction3d/{name}")
        if response.status_code >= 500:
            server_errors.append(f"{name} -> {response.status_code}")
    if server_errors:
        failures.append(f"runtime 模块触发服务端错误：{server_errors[:6]}")
        print(f"  FAIL {len(server_errors)} 条 5xx")
    else:
        print(f"  OK   {len(entries)} 条 runtime 入口无 5xx（未授权返回 401/403/404 属预期）")

    # 未登录时白名单外路径必须 404，而不是把清单读穿（路径穿越防线）。
    for probe in ("../../main.py", "../../../../../etc/passwd"):
        checked += 1
        response = client.get(f"/api/v1/modules/interaction3d/{probe}")
        if response.status_code == 200:
            failures.append(f"runtime 路径穿越未拦截：{probe}")
            print(f"  FAIL 路径穿越 {probe} -> 200")


def check_api_surface(client) -> None:
    global checked
    print("核心 API 可达性（未授权按 401/403 返回，不能 404/5xx）：")
    for path in (
        "/api/v1/setup/status",
        "/api/v1/icons",
        "/api/v1/projects",
        "/api/v1/license/status",
        "/api/v1/license/availability",
        "/api/v1/ha/health",
        "/api/v1/ha/connection",
        "/api/v1/ha/sync/status",
        "/api/v1/modules/interaction3d/access",
    ):
        checked += 1
        response = client.get(path)
        status = response.status_code
        if status in (200, 401, 403, 409):
            print(f"  OK   {path:<36} {status}")
            continue
        failures.append(f"API {path} 返回 {status}（应为 200/401/403）")
        print(f"  FAIL {path:<36} {status}")


SPECIFIER_RE = re.compile(
    r"""(?:from|import)\s*\(?\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)"""
)


def is_static_reference(candidate: str) -> bool:
    """排除压缩产物里的"看起来像路径、其实是运行时拼出来的"假引用。

    例如 `"/static/assets/${e.previewUrl}"`、`"/static/vendor/three/0.186.0/"+r.width+"/x"`
    这类模板串与字符串拼接，在浏览器里是动态解析的，正则爬虫却会当成真实 URL 去取，
    一律 404 —— 那是爬虫的噪声，不是产物的缺口。
    """
    if any(marker in candidate for marker in ("${", "`", "+", "\\", "(")):
        return False
    return candidate.endswith(
        (".js", ".css", ".png", ".svg", ".ico", ".webmanifest", ".woff2", ".glb", ".json", ".jpg", ".jpeg", ".webp", ".ktx2", ".bin")
    )


def asset_closure(client, html_name: str, budget: int = 400) -> tuple[list[str], list[str]]:
    """从页面 HTML 出发，像浏览器一样把 /static 资源引用链整个爬一遍。

    只爬 /static/** 与 /api/v1/modules/interaction3d/**（运行时模块走 API 路由），
    每个 URL 只取一次。返回 (检查过的 URL, 失败的 URL)。
    """
    from urllib.parse import urljoin

    html_path = DIST / html_name
    if not html_path.is_file():
        return [], [f"缺少构建产物 {html_name}"]
    html = html_path.read_text(encoding="utf-8")
    queue = [m.group(1).split("?")[0] for m in re.finditer(r"""(?:src|href)=["'](/[^"']+)["']""", html)]
    seen: set[str] = set()
    ok: list[str] = []
    bad: list[str] = []
    while queue and len(seen) < budget:
        url = queue.pop(0)
        url = url.split("?")[0]
        if url in seen:
            continue
        if not (url.startswith("/static/") or url.startswith("/api/v1/modules/interaction3d/")):
            continue
        # vendor/ 下的三方文件是原样 vendored 的，里面的相对引用（three/addons/...）
        # 在 0.6.7 里同样解析不到，不是本次迁移引入的问题，别拿它当门禁噪声。
        if "/vendor/" in url:
            continue
        seen.add(url)
        response = client.get(url)
        if response.status_code == 200:
            ok.append(url)
        else:
            bad.append(f"{url} -> {response.status_code}")
            continue
        if url.endswith((".js", ".css")):
            text = response.text
            for match in SPECIFIER_RE.finditer(text):
                raw = match.group(1) or match.group(2) or ""
                if not raw or raw.startswith(("data:", "http:", "https:", "//", "#")):
                    continue
                resolved = urljoin(url, raw)
                if not resolved.startswith(("/static/", "/api/v1/modules/interaction3d/")):
                    continue
                if not is_static_reference(resolved):
                    continue
                if resolved not in seen:
                    queue.append(resolved)
    return ok, bad


def run_authenticated_flow(client) -> None:
    """初始化管理员 -> 登录 -> 拉取登录后才有的页面，并爬完整条资源链。

    这是整轮冒烟里最有价值的一步：未登录只能证明「公开页没坏」，
    真正验证「构建产物 + 后端白名单 + runtime 清单」对不对，必须让带哈希的
    app bundle 与它的共享 chunk 全部真取一遍。
    """
    global checked
    print("初始化 + 登录：")
    credentials = {"username": "smoke-admin", "password": "Smoke-Test-Password-1!", "passwordConfirmation": "Smoke-Test-Password-1!"}
    checked += 1
    response = client.post("/api/v1/setup/admin", json=credentials)
    if response.status_code not in (200, 201):
        failures.append(f"初始化管理员失败：{response.status_code} {response.text[:200]}")
        print(f"  FAIL /api/v1/setup/admin {response.status_code} {response.text[:160]}")
        return
    print(f"  OK   /api/v1/setup/admin {response.status_code}")

    checked += 1
    response = client.post("/api/v1/auth/login", json={"username": credentials["username"], "password": credentials["password"]})
    if response.status_code != 200:
        failures.append(f"登录失败：{response.status_code} {response.text[:200]}")
        print(f"  FAIL /api/v1/auth/login {response.status_code} {response.text[:160]}")
        return
    print(f"  OK   /api/v1/auth/login {response.status_code}")

    print("登录后页面（无有效授权，预期跳转授权页）：")
    for path in ("/", "/3d-studio"):
        checked += 1
        response = client.get(path, follow_redirects=False)
        location = response.headers.get("location", "")
        if response.status_code == 303:
            print(f"  OK   {path:<20} 303 {location}（授权未满足，符合预期）")
        elif response.status_code == 200:
            print(f"  OK   {path:<20} 200")
        else:
            failures.append(f"登录后 {path} 返回 {response.status_code}")
            print(f"  FAIL {path:<20} {response.status_code}")


def relax_license_checks(app) -> None:
    """只放开能力判定，不替换整个授权服务。

    产品设计上 license_required 恒为 True 且不能用环境变量关掉（README 明确承诺），
    所以未接授权商店时拿不到 editor / assets 能力：登录后的页面与全部静态资源都会跳
    授权页 —— 那样就测不到本轮迁移真正改动的「下发层」（/static 挂载、匿名白名单、
    runtime 清单）。

    注意必须改类方法而不是 app.state.license_service = 替身对象：lifespan 关闭时会调
    service.start()/stop()，换掉整个对象会让关闭阶段直接 AttributeError ——
    那就把「服务能不能干净收尾」这条也一起测没了。
    """
    service = app.state.license_service
    service_type = type(service)

    async def _confirm_binding_noop(self) -> None:
        return None

    # 真实签名是 allows(feature_code, *, database=None)：这里必须收 **kwargs，
    # 否则交互模块门禁传 database=... 时抛 TypeError，看起来像服务端 500，
    # 实际是替身写窄了 —— 这种假故障最耽误事。
    def _allows_everything(self, feature_code: str, **kwargs) -> bool:  # noqa: ARG001
        return True

    service_type.allows = _allows_everything
    service_type.confirm_binding = _confirm_binding_noop


def run_licensed_crawl(app, client) -> None:
    global checked
    print("放开能力码后，爬完整资源链（登录态 + 全部能力码放行）：")
    relax_license_checks(app)
    for path, target in (("/", "index.html"), ("/3d-studio", "3d-studio.html")):
        checked += 1
        response = client.get(path, follow_redirects=False)
        if response.status_code != 200:
            failures.append(f"放行能力码后 {path} 仍返回 {response.status_code}")
            print(f"  FAIL {path:<20} {response.status_code}")
            continue
        print(f"  OK   {path:<20} 200（{target}）")
        ok, bad = asset_closure(client, target)
        checked += len(ok) + len(bad)
        if bad:
            failures.append(f"{target} 资源链有 {len(bad)} 个取不到：{bad[:8]}")
            print(f"  FAIL {target} 资源链：{len(ok)} 成功 / {len(bad)} 失败")
            for item in bad[:10]:
                print(f"        {item}")
        else:
            print(f"  OK   {target} 资源链 {len(ok)} 个 URL 全部 200")

    # runtime 模块在有能力码时应真实下发，而不是继续 401/404 —— 这条覆盖
    # 「清单解析 -> 文件校验 -> 下发」整条链。
    manifest_path = DIST / "modules" / "runtime" / "manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        entries = [name for name in manifest.get("files", []) if "/chunks/" not in name]
        ok, bad = asset_closure(client, "3d-studio.html")
        runtime_ok = 0
        runtime_bad: list[str] = []
        for name in entries:
            checked += 1
            response = client.get(f"/api/v1/modules/interaction3d/{name}")
            if response.status_code == 200 and response.content:
                runtime_ok += 1
            else:
                runtime_bad.append(f"{name} -> {response.status_code}")
        if runtime_bad:
            failures.append(f"runtime 模块下发失败 {len(runtime_bad)} 条：{runtime_bad[:6]}")
            print(f"  FAIL runtime 真实下发：{runtime_ok} 成功 / {len(runtime_bad)} 失败")
            for item in runtime_bad[:10]:
                print(f"        {item}")
        else:
            print(f"  OK   runtime 真实下发 {runtime_ok} 个模块全部 200")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="", help="打已运行的实例；留空则进程内启动")
    args = parser.parse_args()

    if args.base:
        print(f"目标实例：{args.base}（外部模式暂只做连通性检查）")
        import urllib.error
        import urllib.request

        try:
            with urllib.request.urlopen(f"{args.base.rstrip('/')}/setup", timeout=10) as response:
                print(f"  OK   /setup {response.status}")
        except urllib.error.HTTPError as error:
            print(f"  OK   /setup {error.code}")
        except Exception as error:  # noqa: BLE001
            print(f"  FAIL 连不上：{error}")
            return 2
        return 0

    prepare_environment()
    print("启动应用（含 lifespan：目录收紧、密钥迁移、数据库迁移、后台服务）…")
    app = build_app()
    with TestClientLazy(app) as client:
        print("启动完成。\n")
        check_pages(client)
        check_anonymous_assets(client)
        check_runtime_modules(client)
        check_api_surface(client)
        run_authenticated_flow(client)
        run_licensed_crawl(app, client)
        # 退出 with 块会触发 lifespan 关闭：后台服务收不干净也会在这里暴露。
    print("\nlifespan 正常关闭。")

    if failures:
        print(f"\n冒烟失败，共 {len(failures)} 条：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"\n冒烟通过（{checked} 项检查）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
