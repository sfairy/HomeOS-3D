"""主应用（backend）自检脚本。

和 ``store/tools/smoke.py`` 是同一套做法：一个 ``check()`` 登记表 + 一个显式接线的
:func:`run`，每个 ``check_*`` 只管一条不变量，失败时打印可读的诊断而不是抛栈。

为什么要有它：``store`` 侧从 P1 起就靠自检守住「修过的东西不许回退」，而 backend
侧此前除了 ``start.py`` 的双服务手工回归没有任何可执行断言 —— 于是 P4 这批
主应用高危项（媒体代理跨项目 IDOR、伪造对端、凭据密钥写入死循环……）改完就只能
靠人肉点界面确认，改错了也没有任何东西会变红。

跑法（仓库根目录）::

    .venv/bin/python -m backend.tools.smoke
    # 或者： PYTHONPATH=. .venv/bin/python backend/tools/smoke.py

只覆盖「能在进程内确定性验证」的东西：整应用启动（lifespan 会起 HA 同步、更新检查
等后台服务）不适合放进自检，因此这里按需拼一个最小的 FastAPI 应用，只装被测路由，
把认证依赖与上游 HTTP 客户端替换成桩。
"""
from __future__ import annotations

import asyncio
import ast
import json
import sys
import tempfile
import traceback
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
#: 直跑 ``python backend/tools/smoke.py`` 时 ``backend`` 还不在导入路径上。
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import httpx  # noqa: E402

#: (断言名, 是否通过, 诊断信息)
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    """登记一条断言；返回布尔值便于 ``if not check(...): return`` 短路。"""
    RESULTS.append((name, bool(condition), detail))
    flag = "PASS" if condition else "FAIL"
    line = f"[{flag}] {name}"
    if detail:
        line += f" — {detail}"
    print(line, flush=True)
    return bool(condition)


# --------------------------------------------------------------------------- #
# 被测应用的最小装配
# --------------------------------------------------------------------------- #
class _FakeUpstream:
    """上游响应桩：支持一次性与流式两种读法（代理的两条分支都要走到）。"""

    def __init__(self, status_code: int = 200, content: bytes = b"ok") -> None:
        self.status_code = status_code
        self.content = content
        self.headers = {'content-type': 'image/jpeg'}

    async def aiter_raw(self):
        yield self.content

    async def aclose(self) -> None:
        return None


class FakeAsyncClient:
    """``httpx.AsyncClient`` 的替身：不发任何真实请求，直接回 200。

    用它把「有没有过门禁」与「上游通不通」彻底分开：被门禁拦下是 403，过了门禁
    就是 200（或代理内部的 409/502，视用例而定），两者不会混在一起。
    """

    #: 每次 ``send`` 记录 (method, url)，供断言「确实转发过去了」。
    sent: list[tuple[str, str]] = []

    def __init__(self, **_kwargs) -> None:
        self._client = self

    def build_request(self, method: str, url: str, headers: dict | None = None):
        return SimpleNamespace(method=method, url=url, headers=headers or {})

    async def send(self, request, stream: bool = False):
        FakeAsyncClient.sent.append((request.method, request.url))
        return _FakeUpstream()

    async def aclose(self) -> None:
        return None


class _StubConnector:
    """HA 连接器桩：只要给出 ``client_for`` 需要的几个字段。"""

    def __init__(self, base_url: str = 'http://ha.test:8123') -> None:
        self._config = SimpleNamespace(
            base_url=base_url,
            access_token='stub-token',
            verify_tls=False,
            timeout=5,
        )

    def client_for(self, _connection):
        return self._config


@dataclass
class MediaProxyFixture:
    """一套「两个项目 + 两台中控 + 一个活跃 HA 连接」的固定装置。"""

    database: Any
    app: Any
    display_a_token: Any
    display_b_token: Any


async def _build_media_proxy_fixture(workdir: Path) -> MediaProxyFixture:
    """搭好 B50 需要的库、两台中控与只装媒体代理路由的最小应用。"""
    from fastapi import FastAPI

    from backend.app.api import ha_proxy
    from backend.app.database import Base, Database
    from backend.app.dependencies import ViewerPrincipal, licensed_short_lived_viewer
    from backend.app.models import (
        DisplayDevice,
        HAConnection,
        HAEntity,
        Project,
        ProjectDraft,
        User,
    )

    database = Database(f'sqlite:///{workdir / "app.db"}')
    Base.metadata.create_all(database.engine)

    def insert(*rows):
        with database.session_factory() as session:
            session.add_all(rows)
            session.commit()

    # 两个项目各自绑定一个摄像头与一张图片实体；项目 B 的实体绝不该被项目 A 看到。
    insert(User(id='u1', username='admin', password_hash='x', role='admin'))
    insert(
        Project(id='proj-a', name='甲项目', slug='proj-a', created_by='u1'),
        Project(id='proj-b', name='乙项目', slug='proj-b', created_by='u1'),
    )
    insert(
        ProjectDraft(
            project_id='proj-a',
            updated_by='u1',
            document_json=json.dumps(
                {
                    'pages': [
                        {
                            'panels': [
                                {'type': 'camera', 'bindings': {'camera': {'entityId': 'camera.a'}}},
                                {'type': 'image', 'bindings': {'image': {'entityId': 'image.a'}}},
                                {
                                    'type': 'media_player',
                                    'bindings': {'player': {'entityId': 'media_player.a'}},
                                },
                            ]
                        }
                    ]
                }
            ),
        ),
        ProjectDraft(
            project_id='proj-b',
            updated_by='u1',
            document_json=json.dumps(
                {
                    'pages': [
                        {
                            'panels': [
                                {'type': 'camera', 'bindings': {'camera': {'entityId': 'camera.b'}}},
                            ]
                        }
                    ]
                }
            ),
        ),
    )
    insert(
        DisplayDevice(
            id='disp-a',
            token_hash='hash-a',
            project_id='proj-a',
            name='甲项目中控',
        ),
        DisplayDevice(
            id='disp-b',
            token_hash='hash-b',
            project_id='proj-b',
            name='乙项目中控',
        ),
    )
    insert(HAConnection(id='conn-1', base_url='http://ha.test:8123', encrypted_access_token='x'))
    insert(
        *[
            HAEntity(id=f'ent-{index}', connection_id='conn-1', entity_id=entity_id, domain=entity_id.split('.')[0])
            for index, entity_id in enumerate(
                ('camera.a', 'image.a', 'media_player.a', 'camera.b'), start=1
            )
        ]
    )

    app = FastAPI()
    app.include_router(ha_proxy.router)
    app.state.database = database
    app.state.ha_connector = _StubConnector()

    def display_principal(device_id: str):
        with database.session_factory() as session:
            device = session.get(DisplayDevice, device_id)
            session.expunge(device)
        return ViewerPrincipal(display=device)

    app.state.viewers = {
        'a': display_principal('disp-a'),
        'b': display_principal('disp-b'),
        # 管理员会话：project_id 为 None，实体可见范围不受限。
        'admin': ViewerPrincipal(user=SimpleNamespace(id='u1')),
    }
    app.state.active_viewer = 'a'
    app.dependency_overrides[licensed_short_lived_viewer] = lambda: app.state.viewers[
        app.state.active_viewer
    ]
    return MediaProxyFixture(
        database=database, app=app, display_a_token='disp-a', display_b_token='disp-b'
    )


async def _request(fixture: MediaProxyFixture, viewer: str, path: str) -> httpx.Response:
    """以指定身份发一次请求（异步客户端的身份由 app.state.active_viewer 决定）。"""
    fixture.app.state.active_viewer = viewer
    # 上游客户端换成桩：这里只关心「有没有过门禁」，不关心 HA 通不通。
    from backend.app.api import ha_proxy

    original = ha_proxy.httpx
    ha_proxy.httpx = SimpleNamespace(AsyncClient=FakeAsyncClient, HTTPError=httpx.HTTPError)
    try:
        transport = httpx.ASGITransport(app=fixture.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://store.test') as client:
            return await client.get(path)
    finally:
        ha_proxy.httpx = original


# --------------------------------------------------------------------------- #
# B50：媒体代理的跨项目 IDOR
# --------------------------------------------------------------------------- #
async def check_media_proxy_entity_scope() -> None:
    """B50：五条通配媒体路由必须把实体归属也管起来。

    过去的门禁只有「已认证 + 授权允许 api」，而代理会**注入 HA 令牌**回源。实体 ID
    是可读名字（``camera.front_door``）不是随机串，所以一台绑在项目 A 的中控只要写下
    项目 B 的实体 ID，就能把别人的摄像头画面拉出来 —— 服务端还会带上 HA 的令牌。
    同类 HLS 端点一直在做实体校验，这两条路径漏了。

    判定口径刻意用「不是 403」当通过：403 只可能是门禁给出的，而过了门禁之后
    上游是桩、必定 200，两种情况不会混。
    """
    from backend.app.api import ha_proxy

    with tempfile.TemporaryDirectory(prefix='hb-backend-scope-') as tmp:
        fixture = await _build_media_proxy_fixture(Path(tmp))
        app = fixture.app

        # —— 路径里直接带实体的四条前缀：别人的实体一律 403 ——
        for label, path in (
            ('camera_proxy', '/api/camera_proxy/camera.b'),
            ('camera_proxy_stream', '/api/camera_proxy_stream/camera.b'),
            ('image_proxy', '/api/image_proxy/camera.b'),
            ('media_player_proxy', '/api/media_player_proxy/camera.b'),
        ):
            response = await _request(fixture, 'a', path)
            check(
                f'B50 {label} 拒绝别的项目的实体（跨项目 IDOR）',
                response.status_code == 403,
                f'{path} → {response.status_code} {response.text[:80]}',
            )

        # 百分号编码不能成为绕过口：decode 之后仍要判成同一个实体。
        response = await _request(fixture, 'a', '/api/image_proxy/camera%2Eb')
        check(
            'B50 实体 ID 的百分号编码写法同样被拦（解码后再比对）',
            response.status_code == 403,
            f'{response.status_code} {response.text[:80]}',
        )

        # 自己的实体必须照旧可用，否则这条修复就是把功能一起关掉。
        for label, path in (
            ('camera_proxy', '/api/camera_proxy/camera.a'),
            ('camera_proxy_stream', '/api/camera_proxy_stream/camera.a'),
            ('image_proxy', '/api/image_proxy/image.a'),
            ('media_player_proxy', '/api/media_player_proxy/media_player.a'),
        ):
            response = await _request(fixture, 'a', path)
            check(
                f'B50 本仪表盘里绑定的实体照旧放行（{label}）',
                response.status_code == 200,
                f'{path} → {response.status_code}',
            )

        # 管理员会话不受项目限制。
        response = await _request(fixture, 'admin', '/api/camera_proxy/camera.b')
        check(
            'B50 管理员会话不被项目范围误伤',
            response.status_code == 200,
            f'{response.status_code}',
        )

        # —— HLS：令牌里没有实体，归属只能靠发放时记的账 ——
        response = await _request(fixture, 'a', '/api/hls/never-issued/master.m3u8')
        check(
            'B50 没发放过的 HLS 令牌一律拒绝（fail closed）',
            response.status_code == 403,
            f'{response.status_code} {response.text[:80]}',
        )

        # 甲项目的令牌，甲项目可用。
        ha_proxy.remember_hls_stream('/api/hls/token-a/master.m3u8', 'camera.a')
        response = await _request(fixture, 'a', '/api/hls/token-a/segment/1.m4s')
        check(
            'B50 自己换来的 HLS 播放地址照旧可用（含片段请求）',
            response.status_code == 200,
            f'{response.status_code}',
        )
        scope = ha_proxy.hls_stream_scopes.get('token-a')
        check(
            'B50 HLS 的归属结论按项目缓存（避免每个分片都查库）',
            scope is not None and scope.verified_project == 'proj-a',
            f'verified_project={getattr(scope, "verified_project", None)!r}',
        )

        # 乙项目的令牌，甲项目不可用 —— 这正是「重放别人播放地址」的攻击面。
        ha_proxy.remember_hls_stream('/api/hls/token-b/master.m3u8', 'camera.b')
        response = await _request(fixture, 'a', '/api/hls/token-b/master.m3u8')
        check(
            'B50 别的项目的 HLS 播放地址无法被重放（令牌 → 实体 → 归属）',
            response.status_code == 403,
            f'{response.status_code} {response.text[:80]}',
        )
        response = await _request(fixture, 'b', '/api/hls/token-b/master.m3u8')
        check(
            'B50 令牌的归属方自己仍然可用（不是把 HLS 整体关掉）',
            response.status_code == 200,
            f'{response.status_code}',
        )

        # 记账是滑动的：命中一次就续期，正常播放不会中途失效。
        from time import monotonic as _monotonic

        ha_proxy.hls_stream_scopes['token-a'].expires_at = _monotonic() + 1
        before = ha_proxy.hls_stream_entity_id('/api/hls/token-a/master.m3u8')
        renewed = ha_proxy.hls_stream_scopes['token-a'].expires_at - _monotonic()
        check(
            'B50 HLS 记账命中即续期（长播放不会中途被判成未登记）',
            before == 'camera.a' and renewed > ha_proxy.HLS_STREAM_SCOPE_TTL_SECONDS - 5,
            f'entity={before!r} 续期后剩余={renewed:.0f}s',
        )
        # 伪造一个已过期的登记，必须查不到（过期即失效）。
        ha_proxy.hls_stream_scopes['token-expired'] = ha_proxy.HlsStreamScope(
            entity_id='camera.a', expires_at=0.0001, verified_project='', verified_at=0.0
        )
        check(
            'B50 HLS 记账过期后查不到（不会无限期放行旧令牌）',
            ha_proxy.hls_stream_entity_id('/api/hls/token-expired/x.m3u8') is None,
            '过期登记已清除',
        )
        ha_proxy.hls_stream_scopes.pop('token-expired', None)

        # 路径不给归属时依赖直接放行，交给处理器统一 404（不回答「前缀存不存在」）。
        rogue = SimpleNamespace(
            url=SimpleNamespace(path='/api/hls/../camera_proxy/camera.b'),
            app=app,
        )
        try:
            await ha_proxy.require_media_proxy_scope(rogue, app.state.viewers['a'])
            normalized = True
            rogue_detail = '门禁放行，交给处理器统一 404'
        except Exception as error:  # noqa: BLE001 - 这里只关心「有没有抛异常」
            normalized = False
            rogue_detail = f'门禁抛了 {type(error).__name__}（应放行给处理器）'
        check(
            'B50 含路径归一化写法的请求不由门禁回答（留给处理器统一 404）',
            normalized,
            rogue_detail,
        )


def check_media_routes_carry_scope() -> None:
    """B50 的结构门：注册在媒体前缀上的每条路由都必须挂归属门禁。

    行为断言只能覆盖**当前**这几条路由；这个门保证新增第六种媒体路径忘了写
    ``Depends(require_media_proxy_scope)`` 时，自检会直接点名那条路由。
    """
    from backend.app.api import ha_proxy

    missing: list[str] = []
    checked = 0
    for route in ha_proxy.router.routes:
        path = getattr(route, 'path', '')
        if not path.startswith(ha_proxy.ALLOWED_MEDIA_PROXY_PREFIXES):
            continue
        checked += 1
        dependants = getattr(route, 'dependant', None)
        calls = [dependency.call for dependency in getattr(dependants, 'dependencies', [])]
        if ha_proxy.require_media_proxy_scope not in calls:
            missing.append(path)
    check(
        'B50 每条媒体代理路由都挂了实体归属门禁',
        bool(checked) and not missing,
        f'共检查 {checked} 条；缺门禁：{missing}',
    )
    check(
        'B50 门禁覆盖了全部五条媒体前缀（前缀常量本身没漏）',
        len(ha_proxy.ALLOWED_MEDIA_PROXY_PREFIXES) == 5
        and set(ha_proxy.ALLOWED_MEDIA_PROXY_PREFIXES) == set(ha_proxy.ENTITY_PATH_MEDIA_PREFIXES)
        | {ha_proxy.HLS_MEDIA_PREFIX},
        str(ha_proxy.ALLOWED_MEDIA_PROXY_PREFIXES),
    )


def check_media_proxy_entity_parsing() -> None:
    """B50 的解析层：路径 → 实体 / 令牌的映射必须与 HA 的地址形态一致。"""
    from backend.app.api import ha_proxy

    cases = (
        ('/api/camera_proxy/camera.front_door', 'camera.front_door'),
        ('/api/camera_proxy_stream/camera.x', 'camera.x'),
        ('/api/image_proxy/image.map', 'image.map'),
        ('/api/media_player_proxy/media_player.tv', 'media_player.tv'),
        # 实体后面的尾巴要忽略（HA 的地址可能带子路径）。
        ('/api/camera_proxy/camera.x/extra/segments', 'camera.x'),
        # 编码形态要解码后再给出去。
        ('/api/image_proxy/camera%2Efront_door', 'camera.front_door'),
        # HLS 与其它路径不给实体（HLS 走令牌记账）。
        ('/api/hls/abc/master.m3u8', None),
        ('/api/camera_proxy/', None),
        ('/api/other/camera.x', None),
    )
    wrong = [
        f'{path} → {ha_proxy.media_proxy_entity_id(path)!r}（应为 {expected!r}）'
        for path, expected in cases
        if ha_proxy.media_proxy_entity_id(path) != expected
    ]
    check('B50 媒体路径解析出的实体 ID 正确（含编码与子路径）', not wrong, '；'.join(wrong))

    tokens = (
        ('/api/hls/abc123/master.m3u8', 'abc123'),
        ('/api/hls/abc123', 'abc123'),
        ('/api/hls/abc123/segment/2.m4s', 'abc123'),
        ('/api/camera_proxy/camera.x', ''),
    )
    wrong_tokens = [
        f'{path} → {ha_proxy.hls_stream_token(path)!r}（应为 {expected!r}）'
        for path, expected in tokens
        if ha_proxy.hls_stream_token(path) != expected
    ]
    check('B50 HLS 令牌的取出规则正确', not wrong_tokens, '；'.join(wrong_tokens))

    # 记账上限：不能无限增长（同快照缓存的「淘汰最旧」口径）。
    saved = dict(ha_proxy.hls_stream_scopes)
    try:
        ha_proxy.hls_stream_scopes.clear()
        for index in range(ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES + 10):
            ha_proxy.remember_hls_stream(f'/api/hls/tok{index}/master.m3u8', 'camera.a')
        check(
            'B50 HLS 记账有条数上限（长期运行不会无限增长）',
            len(ha_proxy.hls_stream_scopes) <= ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES,
            f'当前 {len(ha_proxy.hls_stream_scopes)} 条，上限 {ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES}',
        )
    finally:
        ha_proxy.hls_stream_scopes.clear()
        ha_proxy.hls_stream_scopes.update(saved)


def check_hls_stream_registration() -> None:
    """B50：HLS 的归属来源只有一个地方 —— 发放播放地址时必须记账。

    这条是 AST 静态断言而不是行为断言：``camera_hls_stream`` 要真的跑起来需要一台
    活的 HA（还要建 WebSocket），放进自检里既慢又脆。但「忘了登记」的后果很隐蔽 ——
    HLS 全被门禁拒掉，前端**自动回落**到 MJPEG 通道，看板照旧有画面（只是换了协议、
    更费带宽），没有任何报错会提醒这是配置错误。所以这里守住「那句话还在」。
    """
    tree = ast.parse((PROJECT_ROOT / 'backend' / 'app' / 'api' / 'ha_proxy.py').read_text(encoding='utf-8'))
    target = next(
        (
            node
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == 'camera_hls_stream'
        ),
        None,
    )
    if not check(
        'B50 仍能找到 camera_hls_stream（改名要同步这条断言）',
        target is not None,
        '找到函数定义' if target is not None else '找不到函数（改名了？）',
    ):
        return
    calls = [
        child
        for child in ast.walk(target)
        if isinstance(child, ast.Call)
        and isinstance(child.func, ast.Name)
        and child.func.id == 'remember_hls_stream'
    ]
    check(
        'B50 发放 HLS 播放地址时登记了归属（漏了会让 HLS 静默回落成 MJPEG）',
        bool(calls),
        f'remember_hls_stream 调用点 {len(calls)} 处',
    )


# --------------------------------------------------------------------------- #
# B51：转发头的信任范围（对端可伪造）
# --------------------------------------------------------------------------- #
def check_forwarded_allow_ips_defaults() -> None:
    """B51：默认不许「谁的转发头都信」，且通配要能被认出来并告警。

    两道门一起守：``unsafe_forwarded_allow_ips`` 是识别，两个默认值（compose 与
    容器启动器）是实际下发的取值。以前默认是 ``*``，而 compose 又把 18081 发布到
    宿主机上，所以「直连 + 自己写 X-Forwarded-For」根本不需要任何前置条件。
    """
    import re

    from backend.app.http_security import (
        forwarded_allow_ips_warning,
        unsafe_forwarded_allow_ips,
    )

    unsafe_values = ('*', '0.0.0.0/0', '::/0', '127.0.0.1,*', ' *, 10.0.0.1')
    safe_values: tuple[str | None, ...] = (
        '',
        None,
        '127.0.0.1,::1',
        '10.0.0.0/8',
        '172.17.0.1',
    )
    wrong = [value for value in unsafe_values if not unsafe_forwarded_allow_ips(value)]
    wrong += [value for value in safe_values if unsafe_forwarded_allow_ips(value)]
    check(
        'B51 通配取值（含逗号混写）能被识别，正常网段不被误判',
        not wrong,
        f'判错的取值：{wrong}',
    )
    check(
        'B51 通配取值会给出可读告警（不是静默接受）',
        bool(forwarded_allow_ips_warning('*'))
        and not forwarded_allow_ips_warning('127.0.0.1,::1'),
        f'通配告警={forwarded_allow_ips_warning("*")[:40]!r}',
    )

    compose_text = (PROJECT_ROOT / 'docker-compose.yml').read_text(encoding='utf-8')
    matched = re.search(
        r'UVICORN_FORWARDED_ALLOW_IPS:\s*\$\{UVICORN_FORWARDED_ALLOW_IPS:-([^}]*)\}',
        compose_text,
    )
    compose_default = matched.group(1).strip() if matched else ''
    check(
        'B51 compose 的默认转发头信任范围不是通配',
        bool(matched) and not unsafe_forwarded_allow_ips(compose_default),
        f'默认值={compose_default!r}',
    )

    from docker.start_app import DEFAULT_FORWARDED_ALLOW_IPS

    check(
        'B51 容器启动器的默认转发头信任范围不是通配（独立于 compose 生效）',
        bool(DEFAULT_FORWARDED_ALLOW_IPS)
        and not unsafe_forwarded_allow_ips(DEFAULT_FORWARDED_ALLOW_IPS),
        f'默认值={DEFAULT_FORWARDED_ALLOW_IPS!r}',
    )

    main_tree = ast.parse((PROJECT_ROOT / 'backend' / 'app' / 'main.py').read_text(encoding='utf-8'))
    wired = any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == 'forwarded_allow_ips_warning'
        for node in ast.walk(main_tree)
    )
    check(
        'B51 启动时把这条告警写进全局日志（只看管理界面的运维也看得到）',
        wired,
        f'main.py 里的调用点 {1 if wired else 0} 处',
    )


def check_client_ip_spoofing_invariant() -> None:
    """B51：这道修复保护的不变量 —— 对端不可信时，转发头一律不算数。

    之所以要单独钉住它：``http_security.py`` 的全部判断都建立在「``request.client``
    是真实 TCP 对端」之上，而这句话只在 uvicorn 没有放开 ``--forwarded-allow-ips``
    时成立。把这几个用例写下来，将来有人「顺手让 resolve_client_ip 也认转发头」时
    会立刻变红。
    """
    from starlette.requests import Request

    from backend.app.http_security import resolve_client_ip

    def make_request(peer: str, forwarded: str, trusted: tuple[str, ...]) -> Request:
        scope = {
            'type': 'http',
            'method': 'GET',
            'path': '/',
            'query_string': b'',
            'scheme': 'http',
            'server': ('store.test', 80),
            'headers': [(b'x-forwarded-for', forwarded.encode())],
            'client': (peer, 4321),
            'app': SimpleNamespace(
                state=SimpleNamespace(
                    settings=SimpleNamespace(trusted_proxies=trusted),
                )
            ),
        }
        return Request(scope)

    # 1) 没配可信代理：转发头完全不参与判断。
    address = resolve_client_ip(make_request('203.0.113.9', '10.0.0.1', ()))
    check(
        'B51 未配置可信代理时忽略 X-Forwarded-For（伪造换不来新的限流桶）',
        address.ip == '203.0.113.9' and not address.via_proxy,
        f'ip={address.ip!r} via_proxy={address.via_proxy}',
    )

    # 2) 配了可信代理，但这条连接不是来自它：同样忽略。
    address = resolve_client_ip(make_request('203.0.113.9', '10.0.0.1', ('10.0.0.0/8',)))
    check(
        'B51 连接不是来自可信代理时同样忽略转发头',
        address.ip == '203.0.113.9' and not address.via_proxy,
        f'ip={address.ip!r} via_proxy={address.via_proxy}',
    )

    # 3) 连接确实来自可信代理：从右往左跳过可信段，取第一个不可信地址。
    address = resolve_client_ip(
        make_request('10.0.0.5', '203.0.113.9, 10.0.0.5', ('10.0.0.0/8',))
    )
    check(
        'B51 连接确来自可信代理时才采信转发链（取自右往左第一个不可信地址）',
        address.ip == '203.0.113.9' and address.via_proxy,
        f'ip={address.ip!r} via_proxy={address.via_proxy}',
    )

    # 4) 上面三条的前提是「对端地址本身不可伪造」。这条用例把前提写成断言：对端一旦
    #    能被伪造成可信代理网段内的地址，来源 IP 就完全由客户端给的转发头决定 ——
    #    这正是 uvicorn ``--forwarded-allow-ips=*`` 会造成的结果。
    address = resolve_client_ip(
        make_request('10.0.0.5', '192.0.2.7, 10.0.0.5', ('10.0.0.0/8',))
    )
    check(
        'B51 可信代理判定依赖「对端不可伪造」这一前提（uvicorn 放开通配即失效）',
        address.ip == '192.0.2.7',
        f'ip={address.ip!r}（这条断言是在文档化前提，不是漏洞）',
    )


# --------------------------------------------------------------------------- #
# B52：凭据密钥写入不许无界空转
# --------------------------------------------------------------------------- #
def check_credential_key_writes() -> None:
    """B52：密钥文件的创建只对「并发抢占」重试，其它失败立刻报错。

    原来的写法是 ``while True: … except OSError: continue``，且循环里没有 sleep：
    只读挂载（EACCES/EROFS）、磁盘满（ENOSPC）、路径被目录占住（EISDIR）这些**永久
    失败**都会让它原地空转，而调用方是 ``asyncio.to_thread`` —— 表现不是「密钥写
    不进去」这种能查到原因的报错，而是「HA 相关接口陆续全卡死」（线程池被占满）。
    所以这里的断言分两类：行为（永久失败立刻抛、抢占才重试、重试有上限与退避）
    与结构（密钥写入路径上不存在无界循环）。
    """
    import os
    import stat
    import tempfile
    from pathlib import Path
    from types import SimpleNamespace

    from cryptography.fernet import Fernet

    from backend.app import secret_key_file
    from backend.app.ha.crypto import CredentialCipher, CredentialCipherError

    with tempfile.TemporaryDirectory(prefix='hb-b52-') as tmp:
        key_path = Path(tmp) / 'nested' / 'credential.key'
        cipher = CredentialCipher(key_path)
        sealed = cipher.encrypt('token-value')
        check(
            'B52 密钥文件按需生成并能解回原值',
            cipher.decrypt(sealed) == 'token-value',
            f'密文长度={len(sealed)}',
        )
        check(
            'B52 密钥文件权限 0600、目录 0700',
            stat.S_IMODE(key_path.stat().st_mode) == 0o600
            and stat.S_IMODE(key_path.parent.stat().st_mode) == 0o700,
            f'file={oct(stat.S_IMODE(key_path.stat().st_mode))} '
            f'dir={oct(stat.S_IMODE(key_path.parent.stat().st_mode))}',
        )
        check(
            'B52 复用已存在的密钥（不会每次重新生成、把旧密文变成解不开）',
            CredentialCipher(key_path).decrypt(sealed) == 'token-value',
            '同一路径的第二个实例解开了旧密文',
        )

        # 空文件 = 损坏，必须报错而不是静默重新生成。
        empty_path = Path(tmp) / 'empty.key'
        empty_path.write_bytes(b'')
        try:
            CredentialCipher(empty_path).encrypt('x')
            empty_outcome = '没有报错'
        except CredentialCipherError:
            empty_outcome = '报 CredentialCipherError'
        check(
            'B52 空密钥文件视为损坏并显式报错（不静默重建）',
            empty_outcome == '报 CredentialCipherError',
            empty_outcome,
        )

        # 永久失败（EACCES/EROFS/ENOSPC 这一类）：必须只尝试一次就抛。
        calls = {'count': 0}
        real_open = os.open

        def deny(*args, **kwargs):
            calls['count'] += 1
            raise PermissionError(13, 'Permission denied')

        os.open = deny
        try:
            denied_path = Path(tmp) / 'denied.key'
            try:
                CredentialCipher(denied_path).encrypt('x')
                denied_outcome = '没有报错'
            except CredentialCipherError as error:
                denied_outcome = f'报 CredentialCipherError（{error}）'
        finally:
            os.open = real_open
        check(
            'B52 永久性 OSError 立刻报错（不是无界重试）',
            denied_outcome.startswith('报 CredentialCipherError') and calls['count'] == 1,
            f'{denied_outcome}；os.open 尝试 {calls["count"]} 次（应为 1 次）',
        )

        # 并发抢占（FileExistsError）：重试一次后读到赢家写好的密钥。
        race_calls = {'count': 0}
        win_path = Path(tmp) / 'race.key'

        def lose_once(*args, **kwargs):
            race_calls['count'] += 1
            if race_calls['count'] == 1:
                # 模拟「另一个进程刚好先创建成功」。
                win_path.write_bytes(Fernet.generate_key() + b'\n')
                raise FileExistsError(17, 'File exists')
            return real_open(*args, **kwargs)

        os.open = lose_once
        try:
            race_key = secret_key_file.load_or_create_secret_key(
                win_path,
                error_factory=CredentialCipherError,
                empty_message='空。',
            )
        finally:
            os.open = real_open
        check(
            'B52 并发抢占的输家改为读取赢家的密钥（不重复创建、不空转）',
            race_key == win_path.read_bytes().strip() and race_calls['count'] == 1,
            f'拿到赢家的密钥={None if race_key is None else len(race_key)} 字节；'
            f'os.open 尝试 {race_calls["count"]} 次（应为 1 次）',
        )

        # 一直抢占：重试到上限就抛错，不能死循环。
        always_calls = {'count': 0}
        sleeps: list[float] = []

        def always_lose(*args, **kwargs):
            always_calls['count'] += 1
            raise FileExistsError(17, 'File exists')

        real_sleep = secret_key_file.time.sleep
        os.open = always_lose
        # 只替换模块里的 time 引用，别去改全局 time 模块（那会影响整轮自检）。
        secret_key_file.time = SimpleNamespace(sleep=sleeps.append)
        try:
            try:
                secret_key_file.load_or_create_secret_key(
                    Path(tmp) / 'always.key',
                    error_factory=CredentialCipherError,
                    empty_message='空。',
                )
                always_outcome = '没有报错'
            except CredentialCipherError:
                always_outcome = '报 CredentialCipherError'
        finally:
            secret_key_file.time = SimpleNamespace(sleep=real_sleep)
            os.open = real_open
        check(
            'B52 一直抢占会重试到上限后报错（有界，不会挂死）',
            always_outcome == '报 CredentialCipherError'
            and always_calls['count'] == secret_key_file.SECRET_KEY_CREATE_ATTEMPTS,
            f'{always_outcome}；尝试 {always_calls["count"]} 次（上限 '
            f'{secret_key_file.SECRET_KEY_CREATE_ATTEMPTS}）',
        )
        check(
            'B52 每次重试之间有退避（不是无 sleep 空转烧 CPU）',
            len(sleeps) == secret_key_file.SECRET_KEY_CREATE_ATTEMPTS - 1
            and all(delay > 0 for delay in sleeps),
            f'退避 {sleeps}',
        )

    # 结构面：密钥写入路径上不许出现无界循环。
    for relative in (
        'backend/app/secret_key_file.py',
        'backend/app/ha/crypto.py',
        'backend/app/license/crypto.py',
    ):
        module_tree = ast.parse((PROJECT_ROOT / relative).read_text(encoding='utf-8'))
        unbounded = [
            node.lineno
            for node in ast.walk(module_tree)
            if isinstance(node, ast.While)
            and isinstance(node.test, ast.Constant)
            and node.test.value is True
        ]
        check(
            f'B52 密钥写入路径没有无界循环（{relative}）',
            not unbounded,
            f'第 {unbounded} 行有 while True' if unbounded else '没有 while True',
        )


# --------------------------------------------------------------------------- #
# B53：户型快照落盘必须有回收
# --------------------------------------------------------------------------- #
def _scene_id(seed: str) -> str:
    """造一个形态合法的 sceneId（32 位十六进制），便于在断言里指名道姓。"""
    return (seed * 32)[:32]


def check_scene_snapshot_hooks() -> None:
    """B53（结构面）：冻结快照与删除项目都要触发回收，回收不许连累两者。

    ``snapshot_scene`` 是快照的唯一写入方，也是唯一能顺手算清「谁还被引用」的位置；
    ``delete_project`` 是让快照失去引用的主要途径。这两处的接线一旦被后人改掉，
    磁盘就会重新只增不减 —— 而这件事在功能上完全看不出来（舞台页照样能打开），
    所以必须用静态断言钉住。
    """
    api_tree = ast.parse(
        (PROJECT_ROOT / 'backend/app/modules/interaction3d/api.py').read_text(encoding='utf-8')
    )
    projects_tree = ast.parse(
        (PROJECT_ROOT / 'backend/app/api/projects.py').read_text(encoding='utf-8')
    )
    store_tree = ast.parse(
        (PROJECT_ROOT / 'backend/app/modules/interaction3d/scene_store.py').read_text(
            encoding='utf-8'
        )
    )

    def calls(tree: ast.AST, name: str) -> list[int]:
        """找出所有以 ``name`` 结尾的调用所在行号。"""
        return [
            node.lineno
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and (
                (isinstance(node.func, ast.Name) and node.func.id.endswith(name))
                or (isinstance(node.func, ast.Attribute) and node.func.attr.endswith(name))
            )
        ]

    def function(tree: ast.AST, name: str) -> ast.FunctionDef | None:
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == name:
                return node
        return None

    snapshot = function(api_tree, 'snapshot_scene')
    snapshot_sweeps = bool(snapshot) and bool(calls(snapshot, 'sweep_scenes_for_app'))
    check(
        'B53 冻结快照后触发一轮回收（唯一能顺手算清引用关系的位置）',
        snapshot_sweeps,
        'snapshot_scene 里调用了回收' if snapshot_sweeps else 'snapshot_scene 没有触发回收',
    )

    # 回收是附加工作：失败必须记日志而不是把冻结请求带崩。
    guarded = False
    if snapshot is not None:
        for node in ast.walk(snapshot):
            if not isinstance(node, ast.Try):
                continue
            # 回收调用正好在这个 try 的 **body** 里（不是 except/else/finally）。
            if any(
                isinstance(inner, ast.Call) and calls(inner, 'sweep_scenes_for_app')
                for statement in node.body
                for inner in ast.walk(statement)
            ):
                # 且 except 里没有 re-raise（有的话等于没容错）。
                re_raises = any(
                    isinstance(inner, ast.Raise) and inner.exc is None
                    for handler in node.handlers
                    for inner in ast.walk(handler)
                )
                guarded = not re_raises
    check(
        'B53 回收失败只记日志，不让冻结请求失败（清理是附加工作）',
        guarded,
        'try/except 包住了回收且不重新抛出' if guarded else '回收未被容错包住',
    )

    delete_project = function(projects_tree, 'delete_project')
    # 这里必须认「作为参数传进 add_task 的函数名」：删除项目是同步路由，
    # 回收要排进后台任务（自己开短会话），而不是在请求里同步跑完。
    background_task_names = [
        argument.id
        for node in ast.walk(delete_project or ast.Module(body=[], type_ignores=[]))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr.endswith('add_task')
        for argument in node.args
        if isinstance(argument, ast.Name)
    ]
    delete_sweeps = 'sweep_scenes_for_app' in background_task_names
    check(
        'B53 删除项目后回收失效快照（避免磁盘只增不减）',
        delete_sweeps,
        f'delete_project 排了后台任务 {background_task_names}'
        if delete_sweeps
        else f'delete_project 没有触发回收（后台任务只有 {background_task_names}）',
    )

    # 回收的两条硬性约束：被引用的快照绝不能删、没过保留期的不许删。
    # 这里断言的是「删除发生在两道闸门之后」：闸门写在删除之前，才谈得上拦得住。
    sweep = function(store_tree, 'sweep_scenes')
    guard_lines: dict[str, int] = {}
    if sweep is not None:
        for node in ast.walk(sweep):
            if not isinstance(node, ast.If):
                continue
            dumped = ast.dump(node.test)
            # 闸门的形式是「命中条件 → continue」：continue 是保留分支的标记。
            if not any(isinstance(inner, ast.Continue) for inner in node.body):
                continue
            if 'referenced' in dumped and 'reference' not in guard_lines:
                guard_lines['reference'] = node.lineno
            if 'ttl' in dumped and 'ttl' not in guard_lines:
                guard_lines['ttl'] = node.lineno
    delete_lines = calls(sweep, 'delete_scene_files') if sweep is not None else []
    reference_guard = (
        'reference' in guard_lines
        and bool(delete_lines)
        and min(delete_lines) > guard_lines['reference']
    )
    check(
        'B53 被引用的快照一律保留（删掉正在用的 ＝ 看板黑屏）',
        reference_guard,
        f'引用闸门在第 {guard_lines.get("reference")} 行、删除在第 {delete_lines} 行'
        if reference_guard
        else '删除没有被「是否被引用」的闸门挡在后面',
    )
    ttl_guard = (
        'ttl' in guard_lines
        and bool(delete_lines)
        and min(delete_lines) > guard_lines['ttl']
    )
    check(
        'B53 未过保留期的不删（刚冻结、还没保存进仪表盘的快照要留）',
        ttl_guard,
        f'保留期闸门在第 {guard_lines.get("ttl")} 行、删除在第 {delete_lines} 行'
        if ttl_guard
        else '删除没有被保留期闸门挡在后面',
    )


def check_scene_snapshot_sweep() -> None:
    """B53（行为面）：回收只删「没人引用 + 过了保留期」的快照，且底图副本一起走。

    B53 的原始问题是快照目录**只有写入方、没有删除方**：studio 里每点一次「冻结」
    就多一份 scene JSON 与几 MB 底图副本，项目删掉也不会带走它们。这里的断言覆盖
    四种情形（有人引用 / 没人引用且新鲜 / 没人引用且过期 / 过期但删不掉），
    确保补上的回收不会顺手删掉别人正在用的户型。
    """
    import os
    from time import time

    from backend.app.modules.interaction3d.scene_store import (
        SCENE_TTL_SECONDS,
        delete_scene_files,
        existing_scene_ids,
        orphan_scene_copies,
        scene_bytes,
        scene_files,
        scene_folder_bytes,
        scene_ids_in_documents,
        sweep_scenes,
    )

    with tempfile.TemporaryDirectory(prefix='hb-b53-') as tmp:
        folder = Path(tmp) / 'scenes'
        folder.mkdir()

        referenced = _scene_id('a')      # 有人引用：绝不删
        fresh_unused = _scene_id('b')    # 没人引用但刚冻结：留
        stale_unused = _scene_id('c')    # 没人引用且过期：删
        locked_stale = _scene_id('d')    # 过期但删不掉：留着并如实统计

        for scene_id in (referenced, fresh_unused, stale_unused, locked_stale):
            (folder / f'{scene_id}.json').write_text(json.dumps({'scene': {}}), encoding='utf-8')
        # 过期的那两个再各自带一份底图副本（几 MB 的那类文件）。
        (folder / f'{stale_unused}-{_scene_id("e")}.png').write_bytes(b'p' * 4096)
        (folder / f'{locked_stale}-{_scene_id("f")}.jpeg').write_bytes(b'p' * 2048)
        # 目录里混进非快照文件（残渣、说明文件）：既不能被算成快照，也不该被删。
        (folder / 'README.txt').write_text('说明', encoding='utf-8')
        (folder / 'notes.json').write_text('{}', encoding='utf-8')

        check(
            'B53 目录扫描只认 sceneId 形态的文件名（不会把别的文件当快照删掉）',
            existing_scene_ids(folder) == sorted(
                (referenced, fresh_unused, stale_unused, locked_stale)
            ),
            f'扫到 {existing_scene_ids(folder)}',
        )
        check(
            'B53 一个快照的体积把随它冻结的底图副本算进去',
            scene_bytes(folder, stale_unused) == len(
                (folder / f'{stale_unused}.json').read_bytes() + b'p' * 4096
            ),
            f'{stale_unused} 计得 {scene_bytes(folder, stale_unused)} 字节',
        )
        check(
            'B53 快照文件集合覆盖 JSON 与全部底图副本',
            [path.name for path in scene_files(folder, stale_unused)]
            == [f'{stale_unused}.json', f'{stale_unused}-{_scene_id("e")}.png'],
            f'{[path.name for path in scene_files(folder, stale_unused)]}',
        )

        before = scene_folder_bytes(folder)
        # 时间线：两个「过期」的设成 TTL 之外，两个「新鲜」的设成刚刚冻结。
        now = time()
        for scene_id, age in (
            (referenced, SCENE_TTL_SECONDS * 10),
            (fresh_unused, 60),
            (stale_unused, SCENE_TTL_SECONDS + 3600),
            (locked_stale, SCENE_TTL_SECONDS + 3600),
        ):
            stamp = now - age
            os.utime(folder / f'{scene_id}.json', (stamp, stamp))
            for copy in folder.glob(f'{scene_id}-*'):
                os.utime(copy, (stamp, stamp))

        # 「删不掉」用权限模拟：把 scene JSON 所在目录设成只读在 macOS/Linux 上都
        # 不可靠（root 会无视），所以这里直接猴补 unlink 一次，断言统计口径。
        real_unlink = Path.unlink
        blocked = {'count': 0}

        def sometimes_blocked(self, *args, **kwargs):
            if self.name.startswith(locked_stale):
                blocked['count'] += 1
                raise PermissionError(13, 'Operation not permitted')
            return real_unlink(self, *args, **kwargs)

        Path.unlink = sometimes_blocked
        try:
            stats = sweep_scenes(folder, {referenced}, now=now)
        finally:
            Path.unlink = real_unlink

        check(
            'B53 回收只删「没人引用 + 过了保留期」的快照',
            stats['deleted'] == 1
            and not (folder / f'{stale_unused}.json').exists()
            and not (folder / f'{stale_unused}-{_scene_id("e")}.png').exists(),
            f'统计 {stats}；被删的是 {stale_unused}',
        )
        check(
            'B53 目录里的非快照文件不受回收影响（不误删不相干的东西）',
            (folder / 'README.txt').is_file() and (folder / 'notes.json').is_file(),
            'README.txt 与 notes.json 都还在',
        )
        check(
            'B53 被引用的快照不论多老都保留（正在用的户型不能被回收）',
            (folder / f'{referenced}.json').is_file() and stats['kept'] >= 2,
            f'引用中的 {referenced} 仍在；kept={stats["kept"]}',
        )
        check(
            'B53 未过保留期的快照保留（刚冻结、还没保存进仪表盘的不能删）',
            (folder / f'{fresh_unused}.json').is_file(),
            f'{fresh_unused} 仍在',
        )
        check(
            'B53 删不掉的文件如实计入「保留」，不当成已回收（统计不骗人）',
            (folder / f'{locked_stale}.json').is_file()
            and blocked['count'] > 0
            and stats['deleted'] == 1,
            f'阻止 {blocked["count"]} 次删除；deleted={stats["deleted"]}',
        )
        check(
            'B53 释放量等于被删快照（JSON 与底图副本）的实测体积',
            stats['released'] == before - scene_folder_bytes(folder),
            f'released={stats["released"]}，目录 {before} → {scene_folder_bytes(folder)}；'
            f'被删的 JSON 自身 {len(json.dumps({"scene": {}}).encode())} 字节 + 底图副本 4096 字节',
        )

        check(
            'B53 引用判定同时认 sceneId 与 sceneIds 列表（前端两种写法都要算数）',
            scene_ids_in_documents(
                [
                    json.dumps({'pages': [{'panels': [{'properties': {'sceneId': referenced}}]}]}),
                    json.dumps({'widgets': [{'properties': {'sceneIds': [fresh_unused, stale_unused]}}]}),
                    # 坏文档不能让整轮判定失败：宁可多留一轮，也不能误删。
                    '{ not json',
                ]
            )
            == {referenced, fresh_unused, stale_unused},
            '两种写法都收到了引用',
        )

        # 删除接口本身：单个文件删不掉不影响其余文件，也不抛异常。
        unmovable = _scene_id('9')
        (folder / f'{unmovable}.json').write_text('{}', encoding='utf-8')
        (folder / f'{unmovable}-{_scene_id("8")}.png').write_bytes(b'p' * 1024)

        def block_new_copy(self, *args, **kwargs):
            """只挡住刚新建的那份底图副本，模拟「被占用/权限不足」。"""
            if self.name.endswith(f'-{_scene_id("8")}.png'):
                raise PermissionError(13, 'Operation not permitted')
            return real_unlink(self, *args, **kwargs)

        Path.unlink = block_new_copy
        try:
            released = delete_scene_files(folder, unmovable)
        finally:
            Path.unlink = real_unlink
        check(
            'B53 单个文件删不掉时跳过其余文件继续删，并且不抛异常',
            released == len(b'{}')
            and not (folder / f'{unmovable}.json').exists()
            and (folder / f'{unmovable}-{_scene_id("8")}.png').is_file(),
            f'released={released}（只算删掉的 JSON，删不掉的 1024 字节副本不计）',
        )
        # 收尾清掉这份故意留下副本，避免影响后面的目录统计（临时目录本会整棵删掉）。
        real_unlink(folder / f'{unmovable}-{_scene_id("8")}.png')

        # 残渣：JSON 已经不在了、只剩底图副本（delete_scene_files 部分失败留下的中间态）。
        # 只按 *.json 巡检的话它谁也看不见，会一直躺在目录里。
        orphan_old = _scene_id('3')
        orphan_fresh = _scene_id('4')
        (folder / f'{orphan_old}-{_scene_id("0")}.png').write_bytes(b'p' * 512)
        (folder / f'{orphan_fresh}-{_scene_id("0")}.png').write_bytes(b'p' * 512)
        # now 是本函数上面按「TTL 之外」定好的时间戳，拿它把残渣也设成过期。
        old_stamp = now - SCENE_TTL_SECONDS * 2
        os.utime(folder / f'{orphan_old}-{_scene_id("0")}.png', (old_stamp, old_stamp))
        # 有引用但 JSON 缺失的场景，其副本必须原样留着（先让人看清楚，别顺手清证据）。
        referenced_missing = _scene_id('6')
        (folder / f'{referenced_missing}-{_scene_id("0")}.png').write_bytes(b'p' * 256)
        os.utime(folder / f'{referenced_missing}-{_scene_id("0")}.png', (old_stamp, old_stamp))
        check(
            'B53 只按 *.json 巡检看不见的副本残渣会被单独认出（否则它永远躺在目录里）',
            [path.name for path in orphan_scene_copies(folder)]
            == sorted(
                [
                    f'{orphan_fresh}-{_scene_id("0")}.png',
                    f'{orphan_old}-{_scene_id("0")}.png',
                    f'{referenced_missing}-{_scene_id("0")}.png',
                ]
            ),
            f'{sorted(path.name for path in orphan_scene_copies(folder))}',
        )

        residue = sweep_scenes(folder, {referenced, referenced_missing}, now=time())
        check(
            'B53 过期的副本残渣被清掉、新鲜的不动',
            not (folder / f'{orphan_old}-{_scene_id("0")}.png').exists()
            and (folder / f'{orphan_fresh}-{_scene_id("0")}.png').is_file(),
            f'统计 {residue}',
        )
        check(
            'B53 有引用的场景即使 JSON 缺失也不动它的副本（先看清原因，不顺手清证据）',
            (folder / f'{referenced_missing}-{_scene_id("0")}.png').is_file(),
            f'{referenced_missing} 的副本仍在',
        )


async def check_scene_snapshot_route() -> None:
    """B53（端到端）：真的调一次冻结接口，验证「冻结顺手回收」整条链路是通的。

    前面两条断言分别只看结构与纯函数；这条把真正装配起来的路由跑一遍，钉住三件
    只有在真实请求里才会暴露的事：

    1. ``sweep_scenes_for_app`` 自己开短会话算引用关系（不是复用请求会话）；
    2. 冻结出来的快照连同底图副本都落了盘（回收将来要能一起删掉）；
    3. 顺带那轮回收确实生效：老的、没人引用的被删，老的、有引用的留下。
    """
    import os
    from datetime import datetime, timedelta, timezone

    from fastapi import FastAPI

    from backend.app.database import Base, Database
    from backend.app.dependencies import licensed_user
    from backend.app.models import Project, ProjectDraft, User
    from backend.app.modules.interaction3d import api as scene_api

    class RecordingLog:
        """global_log 桩：只记下有没有出现过 warning，用来断言回收没炸。"""

        def __init__(self) -> None:
            self.entries: list[tuple[str, str, str, str]] = []

        def append(self, level, source, category, message, **_kwargs) -> None:
            self.entries.append((level, source, category, message))

    async def freeze(app) -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://homeos.test') as client:
            return await client.post('/modules/interaction3d/scenes')

    with tempfile.TemporaryDirectory(prefix='hb-b53-route-') as tmp:
        root = Path(tmp)
        data_dir = root / 'data'
        assets = data_dir / 'user-assets'
        asset_id = _scene_id('1')
        asset_dir = assets / asset_id
        asset_dir.mkdir(parents=True)
        # user_asset_file 要求一个素材目录里恰好一个图片文件。
        (asset_dir / 'floor-plan.png').write_bytes(b'\x89PNG\r\n\x1a\n' + b'p' * 64)

        draft_path = data_dir / 'studio3d' / 'draft.json'
        draft_path.parent.mkdir(parents=True, exist_ok=True)
        draft_path.write_text(
            json.dumps(
                {
                    'scene': {
                        'floors': [
                            {'scene': {'background': {'assetId': f'user:{asset_id}'}}},
                        ]
                    }
                }
            ),
            encoding='utf-8',
        )

        settings = SimpleNamespace(
            data_dir=data_dir,
            user_assets_dir=assets,
            studio3d_draft_path=draft_path,
            license_required=False,
        )
        database = Database(f'sqlite:///{root / "app.db"}')
        Base.metadata.create_all(database.engine)

        # 老的、仍被仪表盘引用的快照：冻结时那轮回收绝不能碰它。
        referenced_old = _scene_id('7')
        referenced_doc = {
            'pages': [
                {
                    'panels': [
                        {'type': 'interaction3d', 'properties': {'sceneId': referenced_old}}
                    ]
                }
            ]
        }
        with database.session_factory() as session:
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
        # 分两次提交：模型之间没有 relationship，同一个 unit of work 里不保证先插 User。
        with database.session_factory() as session:
            session.add(Project(id='proj-1', name='示例', slug='proj-1', created_by='u1'))
            session.add(
                ProjectDraft(
                    project_id='proj-1',
                    updated_by='u1',
                    document_json=json.dumps(referenced_doc),
                )
            )
            session.commit()

        app = FastAPI()
        app.include_router(scene_api.router)
        app.state.settings = settings
        app.state.database = database
        # 授权门禁只管「买没买」，与本次断言无关：一律放行。
        app.state.license_service = SimpleNamespace(
            allows=lambda code, database=None: True
        )
        app.state.global_log = RecordingLog()
        # LicensedUser 是 Annotated[User, Depends(licensed_user)]，覆盖要落在底层函数上。
        app.dependency_overrides[licensed_user] = lambda: SimpleNamespace(id='u1')

        folder = data_dir / 'modules' / 'interaction3d' / 'scenes'
        # 先铺两个「很久以前冻结」的快照：一个没人引用（该被回收），一个有引用（必须留）。
        stale_unused = _scene_id('5')
        old_stamp = (datetime.now(timezone.utc) - timedelta(days=40)).timestamp()
        for scene_id in (stale_unused, referenced_old):
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f'{scene_id}.json').write_text(json.dumps({'scene': {}}), encoding='utf-8')
            (folder / f'{scene_id}-{_scene_id("2")}.png').write_bytes(b'p' * 2048)
            for path in folder.glob(f'{scene_id}*'):
                os.utime(path, (old_stamp, old_stamp))

        response = await freeze(app)
        payload = response.json() if response.status_code == 201 else {}
        scene_id = payload.get('sceneId', '')
        check(
            'B53 冻结接口把快照与底图副本一起落盘',
            response.status_code == 201
            and (folder / f'{scene_id}.json').is_file()
            and (folder / f'{scene_id}-{asset_id}.png').is_file(),
            f'{response.status_code}；sceneId={scene_id}；'
            f'目录={sorted(path.name for path in folder.iterdir())}',
        )
        check(
            'B53 冻结时顺带回收了过期的无引用快照（端到端接线生效）',
            not (folder / f'{stale_unused}.json').exists()
            and not (folder / f'{stale_unused}-{_scene_id("2")}.png').exists(),
            f'过期的 {stale_unused} 已被回收',
        )
        check(
            'B53 端到端回收没有误伤仍被仪表盘引用的老快照',
            (folder / f'{referenced_old}.json').is_file()
            and (folder / f'{referenced_old}-{_scene_id("2")}.png').is_file(),
            f'引用中的 {referenced_old} 仍在',
        )
        check(
            'B53 端到端回收成功时不写「回收失败」告警（只在真失败时可见）',
            not [entry for entry in app.state.global_log.entries if entry[0] == 'warning'],
            f'日志 {app.state.global_log.entries}',
        )


# --------------------------------------------------------------------------- #
# 自检自身
# --------------------------------------------------------------------------- #
def check_every_check_is_wired() -> None:
    """每个 ``check_*`` 都必须被调用过（忘了接线的话，全绿是没有意义的）。

    与 ``store/tools/smoke.py`` 的同名检查同一理由：写完一条断言却忘了接进
    :func:`run`，输出照旧全绿，而那条从未执行过。

    必须同时认 ``AsyncFunctionDef``：媒体代理那条检查是 ``async def``，
    只看 ``FunctionDef`` 的话它根本不在清单里 —— 一条「从未执行过也没人发现」的
    检查，恰好会从这个检查自己的漏洞里溜过去。
    """
    tree = ast.parse(Path(__file__).read_text(encoding='utf-8'))
    definitions = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name.startswith('check_')
        and node.col_offset == 0
    }
    referenced = {
        child.id
        for node in tree.body
        if not (
            isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name in definitions
        )
        for child in ast.walk(node)
        if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load)
    }
    dead = sorted(definitions - referenced)
    check(
        '每个 check_* 自检项都被调用过（忘了接线的话，全绿是没有意义的）',
        not dead,
        f'没人调用：{dead}' if dead else f'{len(definitions)} 个自检项全部接线',
    )


async def run() -> int:
    """跑完所有自检，返回进程退出码。"""
    await check_media_proxy_entity_scope()
    check_media_proxy_entity_parsing()
    check_media_routes_carry_scope()
    check_hls_stream_registration()
    check_forwarded_allow_ips_defaults()
    check_client_ip_spoofing_invariant()
    check_credential_key_writes()
    check_scene_snapshot_hooks()
    check_scene_snapshot_sweep()
    await check_scene_snapshot_route()
    check_every_check_is_wired()

    failures = [name for name, ok, _ in RESULTS if not ok]
    print()
    print('=' * 72)
    print(f'主应用自检完成：{len(RESULTS) - len(failures)} 通过 / {len(failures)} 失败（共 {len(RESULTS)} 项）')
    print('=' * 72)
    if failures:
        print('失败项：')
        for name in failures:
            detail = next(item for item in RESULTS if item[0] == name)[2]
            print(f'  - {name}：{detail}')
        return 1
    return 0


def main() -> None:
    with asyncio.Runner() as runner:
        try:
            code = runner.run(run())
        except Exception:  # noqa: BLE001 - 自检脚本要把栈打出来，而不是静默失败
            traceback.print_exc()
            code = 1
    raise SystemExit(code)


if __name__ == '__main__':
    main()
