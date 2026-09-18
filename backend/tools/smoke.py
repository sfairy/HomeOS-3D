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
import threading
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from urllib.parse import quote

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
# B1 / B2 / B3 / B32：凭据解析的唯一实现、闭包作用域与任务收尾
# --------------------------------------------------------------------------- #
#: 固定装置里用的两种凭据原文（明文只出现在这里，库里存哈希）。
_ADMIN_TOKEN = 'tok-admin'
_DISPLAY_TOKEN = 'tok-display'


def _access_settings(**overrides) -> SimpleNamespace:
    """一份够用的 settings 桩：只带凭据解析真正会读到的字段。"""
    values = {
        'cookie_name': 'ha_bridge_session',
        'display_cookie_name': 'ha_bridge_display',
        'session_max_age_seconds': 28800,
        'session_hard_max_age_seconds': 2592000,
        'display_token_ttl_seconds': 15552000,
        'display_token_hard_ttl_seconds': 0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@dataclass
class AccessFixture:
    """最小应用库：一个管理员账号 + 一个项目 + 一台已配对的中控。"""

    database: Any
    settings: Any
    account: Any


def _build_access_fixture(workdir: Path, **setting_overrides) -> AccessFixture:
    """搭好 B2/B3/B32 需要的库、管理员账号与一台中控设备。"""
    from datetime import datetime, timezone

    from backend.app.database import Base, Database
    from backend.app.models import DisplayDevice, Project, User
    from backend.app.security import session_token_hash

    database = Database(f'sqlite:///{workdir / "access.db"}')
    Base.metadata.create_all(database.engine)
    now = datetime.now(timezone.utc)
    with database.session_factory() as session:
        session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
        # u2 用来构造「会话不属于当前管理员」的情形（同一个表里可能有别人的会话）。
        session.add(User(id='u2', username='other', password_hash='x', role='admin'))
        session.commit()
        session.add(Project(id='proj-a', name='甲项目', slug='proj-a', created_by='u1'))
        session.commit()
        session.add(
            DisplayDevice(
                id='disp-a',
                token_hash=session_token_hash(_DISPLAY_TOKEN),
                project_id='proj-a',
                name='甲项目中控',
                created_at=now,
                last_seen_at=now,
            )
        )
        session.commit()
    return AccessFixture(
        database=database,
        settings=_access_settings(**setting_overrides),
        account=SimpleNamespace(user_id='u1'),
    )


def _insert_admin_session(
    fixture: AccessFixture,
    *,
    token: str = _ADMIN_TOKEN,
    user_id: str = 'u1',
    created_ago: int = 0,
    expires_in: int = 3600,
    last_seen_ago: int = 0,
) -> None:
    """插一条会话行：直接用相对秒数表达「过期 / 刚活跃」，避免测试里算时间。"""
    from datetime import datetime, timedelta, timezone

    from backend.app.models import LoginSession
    from backend.app.security import session_token_hash

    now = datetime.now(timezone.utc)
    with fixture.database.session_factory() as session:
        session.add(
            LoginSession(
                id_hash=session_token_hash(token),
                user_id=user_id,
                created_at=now - timedelta(seconds=created_ago),
                last_seen_at=now - timedelta(seconds=last_seen_ago),
                expires_at=now + timedelta(seconds=expires_in),
            )
        )
        session.commit()


def _session_snapshot(fixture: AccessFixture, token: str = _ADMIN_TOKEN) -> dict | None:
    """会话行的关键字段；行不存在返回 None。

    刻意在 with 块内取好字段：离开会话后 ORM 对象是游离的，读属性可能抛错。
    """
    from backend.app.models import LoginSession
    from backend.app.security import session_token_hash

    with fixture.database.session_factory() as session:
        row = session.get(LoginSession, session_token_hash(token))
        if row is None:
            return None
        return {
            'created_at': row.created_at,
            'last_seen_at': row.last_seen_at,
            'expires_at': row.expires_at,
        }


def _age_display_device(
    fixture: AccessFixture, *, created_ago: int = 0, last_seen_ago: int = 0, revoked: bool = False
) -> None:
    """把中控设备的时间戳推到过去（用来构造「过期」与「硬上限到期」）。"""
    from datetime import datetime, timedelta, timezone

    from backend.app.models import DisplayDevice

    now = datetime.now(timezone.utc)
    with fixture.database.session_factory() as session:
        device = session.get(DisplayDevice, 'disp-a')
        device.created_at = now - timedelta(seconds=created_ago)
        device.last_seen_at = now - timedelta(seconds=last_seen_ago)
        device.revoked_at = now if revoked else None
        session.commit()


def _disable_pairing_code(fixture: AccessFixture) -> None:
    """给设备挂一个**已停用**的配对码（停用即让这一批设备同时失效）。"""
    from backend.app.models import DisplayDevice, DisplayPairingCode

    with fixture.database.session_factory() as session:
        session.add(
            DisplayPairingCode(
                id='code-1',
                code_hash='disabled-code-hash',
                encrypted_code='x',
                name='已停用的配对码',
                project_id='proj-a',
                created_by='u1',
                is_enabled=False,
            )
        )
        session.commit()
        device = session.get(DisplayDevice, 'disp-a')
        device.pairing_code_id = 'code-1'
        session.commit()


def _fake_websocket(fixture: AccessFixture, cookies: dict[str, str]) -> SimpleNamespace:
    """WebSocket 握手阶段被读到的全部东西：cookies + app.state 三件套。"""
    return SimpleNamespace(
        cookies=cookies,
        app=SimpleNamespace(
            state=SimpleNamespace(
                settings=fixture.settings,
                database=fixture.database,
                admin_account=fixture.account,
            )
        ),
    )


def check_admin_session_criteria() -> None:
    """B3：会话校验必须含绝对寿命，且「判断」与「续期」严格分开。

    ``signed_in`` 原先在页面路由里独立实现了一遍校验，少的就是绝对寿命那一条：
    滑动续期会把 expires_at 一直往后推，于是被盗 Cookie 只要还在被使用就一直有效，
    页面、``/static/*``、``/assets/builtin/*`` 全部照旧放行。
    """
    from datetime import datetime, timezone

    from backend.app.access import check_admin_session, discard_expired_session
    from backend.app.models import User

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-b3-') as tmp:
        fixture = _build_access_fixture(Path(tmp))
        _insert_admin_session(fixture, last_seen_ago=10)

        def resolve(account_user_id: str = 'u1', *, refresh: bool = False, token: str = _ADMIN_TOKEN):
            with fixture.database.session_factory() as database:
                return check_admin_session(
                    database,
                    fixture.settings,
                    token,
                    account_user_id=account_user_id,
                    refresh=refresh,
                    now=now,
                )

        session = resolve()
        check(
            'B3 有效会话解析出管理员本人（且不算失效）',
            session.ok and session.user.username == 'admin' and not session.expired,
            f'ok={session.ok} user={getattr(session.user, "username", None)} expired={session.expired}',
        )
        before = _session_snapshot(fixture)
        resolve()
        after = _session_snapshot(fixture)
        check(
            'B3 只读调用不产生任何写（页面与实时连接不该因为"看一眼"就写库）',
            before == after,
            f'last_seen_at 变化={before["last_seen_at"] != after["last_seen_at"]}',
        )

        # 绝对寿命：滑动有效期还有 1 小时，但 created_at 已经超过硬上限。
        _insert_admin_session(fixture, token='tok-hard', created_ago=2592000 + 60, expires_in=3600)
        stale = resolve(token='tok-hard')
        check(
            'B3 超过绝对寿命的会话判为失效（滑动续期不能无限续命）',
            not stale.ok and stale.expired,
            f'ok={stale.ok} expired={stale.expired}（这正是页面路由原先漏掉的一条）',
        )

        # 关掉绝对寿命时不该误伤：硬上限为 0 表示不设限。
        fixture.settings.session_hard_max_age_seconds = 0
        check(
            'B3 绝对寿命关成 0 时不设限（配置仍然是权威）',
            resolve(token='tok-hard').ok,
            'session_hard_max_age_seconds=0',
        )
        fixture.settings.session_hard_max_age_seconds = 2592000

        # 滑动有效期已过：失效，且调用方拿到的记录要能清掉这一行。
        _insert_admin_session(fixture, token='tok-slide', expires_in=-60)
        slipped = resolve(token='tok-slide')
        with fixture.database.session_factory() as database:
            discard_expired_session(database, slipped)
        check(
            'B3 滑动过期的会话行会被清理（过期行不会一直攒着）',
            not slipped.ok and slipped.expired and _session_snapshot(fixture, 'tok-slide') is None,
            f'ok={slipped.ok} expired={slipped.expired} 行还在={_session_snapshot(fixture, "tok-slide") is not None}',
        )

        # 归属校验：不是当前管理员的会话既不通过、也不该被删。
        _insert_admin_session(fixture, token='tok-other', user_id='u2')
        check(
            'B3 会话不属于当前管理员时拒绝，但不动别人的会话行',
            not resolve(account_user_id='u1', token='tok-other').ok
            and _session_snapshot(fixture, 'tok-other') is not None,
            '同一张表里可能存在其它用户的会话，不能被这条入口顺手删掉',
        )

        # 续期只发生在显式要求续期的调用方（HTTP 路径），且真的写库。
        _insert_admin_session(fixture, token='tok-renew', last_seen_ago=10000)
        stale_snapshot = _session_snapshot(fixture, 'tok-renew')
        idle = resolve(token='tok-renew')
        check(
            'B3 未要求续期时不写库（页面/实时连接侧只读）',
            not idle.renewed and _session_snapshot(fixture, 'tok-renew') == stale_snapshot,
            f'renewed={idle.renewed}',
        )
        renewed = resolve(token='tok-renew', refresh=True)
        after_snapshot = _session_snapshot(fixture, 'tok-renew')
        check(
            'B3 显式要求续期时才把滑动有效期推到当前时间，并回报 renewed',
            renewed.renewed
            and renewed.ok
            and after_snapshot['last_seen_at'] > stale_snapshot['last_seen_at']
            and after_snapshot['expires_at'] > stale_snapshot['expires_at'],
            f'renewed={renewed.renewed}',
        )

        # 用户被停用：会话再新也不放行。
        with fixture.database.session_factory() as database:
            database.get(User, 'u1').is_active = False
            database.commit()
        _insert_admin_session(fixture, token='tok-inactive')
        check(
            'B3 账号被停用后会话立即失效',
            not resolve(token='tok-inactive').ok,
            'is_active=False',
        )


def check_display_token_expiry() -> None:
    """B2：中控令牌的有效期判定必须收在 ``active_display_device`` 内部。

    原先它只查「令牌匹配、未吊销、配对码启用」，有效期判定写在 HTTP 依赖里，
    于是另外两处入口（展示页路由、实时连接握手）各自查库时都没查过期 ——
    一条早已过期的令牌仍能打开展示页、建立实时连接并拿到项目数据。
    """
    import inspect
    from datetime import datetime, timezone

    from backend.app.display_access import active_display_device

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-b2-') as tmp:
        fixture = _build_access_fixture(Path(tmp))

        def lookup():
            with fixture.database.session_factory() as database:
                return active_display_device(database, fixture.settings, _DISPLAY_TOKEN, now=now)

        fresh = lookup()
        check(
            'B2 有效中控令牌解析出设备',
            fresh is not None and fresh.id == 'disp-a',
            f'device={getattr(fresh, "id", None)}',
        )

        # 滑动有效期：最近一次活跃已超过 display_token_ttl_seconds。
        _age_display_device(fixture, last_seen_ago=fixture.settings.display_token_ttl_seconds + 60)
        check(
            'B2 滑动有效期已过的中控令牌不再放行（展示页与实时连接同样受限）',
            lookup() is None,
            f'last_seen 超期 {60} 秒',
        )

        # 硬上限：最近还在活跃，但创建时间已超过 display_token_hard_ttl_seconds。
        fixture.settings.display_token_hard_ttl_seconds = 600
        _age_display_device(fixture, created_ago=1200, last_seen_ago=0)
        check(
            'B2 硬上限到期的中控令牌不再放行（即使一直在活跃）',
            lookup() is None,
            'display_token_hard_ttl_seconds=600，created_at 已过 1200 秒',
        )
        fixture.settings.display_token_hard_ttl_seconds = 0

        # 硬上限关成 0（默认）：一直活跃的墙面平板不该被判过期。
        check(
            'B2 硬上限关成 0 时只看滑动有效期（默认配置不打扰长期挂机的平板）',
            lookup() is not None,
            'display_token_hard_ttl_seconds=0',
        )

        # 吊销与配对码停用两道老闸门不能被有效期改动带坏。
        _age_display_device(fixture, revoked=True)
        check('B2 已吊销的设备照旧不放行', lookup() is None, 'revoked_at 已写')
        _age_display_device(fixture)
        _disable_pairing_code(fixture)
        check('B2 配对码停用后设备照旧不放行', lookup() is None, 'pairing_code.is_enabled=False')

        signature = inspect.signature(active_display_device)
        parameter = signature.parameters.get('settings')
        check(
            'B2 settings 在 active_display_device 里是必填参数（新调用方没法"忘了传"而绕过有效期）',
            parameter is not None and parameter.default is inspect.Parameter.empty,
            str(signature),
        )


def check_websocket_viewer_credentials() -> None:
    """B2/B3/B32：实时连接握手必须与 HTTP 侧共用同一套判据。

    WebSocket 不走 FastAPI 依赖注入，当时因此"再写一遍"：那一版不查会话绝对寿命、
    也不查中控令牌有效期 —— 两条限制都能靠一条实时连接绕过去。
    """
    from backend.app.api.ha import websocket_viewer

    with tempfile.TemporaryDirectory(prefix='hb-ws-') as tmp:
        fixture = _build_access_fixture(Path(tmp))
        cookies = {
            fixture.settings.cookie_name: _ADMIN_TOKEN,
            fixture.settings.display_cookie_name: _DISPLAY_TOKEN,
        }

        _insert_admin_session(fixture, last_seen_ago=10)
        viewer = websocket_viewer(_fake_websocket(fixture, cookies))
        check(
            'B32/实时连接：有效管理员会话解析出管理员（管理员优先于中控）',
            viewer is not None and viewer.user is not None and viewer.user.username == 'admin',
            f'user={getattr(getattr(viewer, "user", None), "username", None)}',
        )

        # 绝对寿命（B3）：只有会话、没有中控令牌，超期就必须 4401。
        _insert_admin_session(fixture, token='tok-hard', created_ago=2592000 + 60, expires_in=3600)
        hard_cookies = {fixture.settings.cookie_name: 'tok-hard'}
        check(
            'B3 实时连接不再绕过会话绝对寿命',
            websocket_viewer(_fake_websocket(fixture, hard_cookies)) is None,
            '超期会话 + 无中控令牌 → None（调用方以 4401 关闭）',
        )

        # 会话滑动过期：拒绝并顺手清掉那一行。
        _insert_admin_session(fixture, token='tok-slide', expires_in=-60)
        slide_cookies = {fixture.settings.cookie_name: 'tok-slide'}
        check(
            'B3 实时连接拒绝滑动过期的会话，并清理该行',
            websocket_viewer(_fake_websocket(fixture, slide_cookies)) is None
            and _session_snapshot(fixture, 'tok-slide') is None,
            '过期行应被清理',
        )

        # 中控令牌（B2）：有效 → 通过；过期 → 拒绝。
        display_cookies = {fixture.settings.display_cookie_name: _DISPLAY_TOKEN}
        display_viewer = websocket_viewer(_fake_websocket(fixture, display_cookies))
        check(
            'B32/实时连接：有效中控令牌解析出设备',
            display_viewer is not None
            and display_viewer.display is not None
            and display_viewer.display.id == 'disp-a',
            f'display={getattr(getattr(display_viewer, "display", None), "id", None)}',
        )
        _age_display_device(fixture, last_seen_ago=fixture.settings.display_token_ttl_seconds + 60)
        check(
            'B2 实时连接不再绕过中控令牌有效期',
            websocket_viewer(_fake_websocket(fixture, display_cookies)) is None,
            '过期中控令牌 → None（调用方以 4401 关闭）',
        )
        check('B32/实时连接：没有凭据时返回 None', websocket_viewer(_fake_websocket(fixture, {})) is None)


async def check_page_gates_end_to_end() -> None:
    """B2/B3：把两道门走一遍真实路由（含静态资源中间件）。

    上面几条检查验证的是「判据」本身，这条验证「接线」：页面路由与 ``/static/*``
    的鉴权中间件真的用上了那个判据。B3 的现象正是「API 侧拦住了，页面与静态资源
    照旧放行」，只有真发一次请求才能看出这个差别 —— 所以这里拼的是真应用
    （``create_app``）而不是最小路由，只把数据库与授权服务换成桩。
    """
    from datetime import datetime, timedelta, timezone

    from backend.app.database import Base, Database
    from backend.app.display_access import display_path
    from backend.app.main import create_app
    from backend.app.models import DisplayDevice, LoginSession, Project, User
    from backend.app.security import session_token_hash

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-page-') as tmp:
        # 真应用：页面路由与 /static 的鉴权中间件都在，只换掉状态与授权服务。
        app = create_app()
        database = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        Base.metadata.create_all(database.engine)
        with database.session_factory() as session:
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
            session.add(Project(id='proj-a', name='甲项目', slug='proj-a', created_by='u1'))
            session.commit()
            session.add(
                LoginSession(
                    id_hash=session_token_hash('tok-live'),
                    user_id='u1',
                    created_at=now - timedelta(days=1),
                    last_seen_at=now,
                    expires_at=now + timedelta(hours=1),
                )
            )
            # 滑动有效期还在，但绝对寿命已过：页面侧原先就是从这里漏过去的。
            session.add(
                LoginSession(
                    id_hash=session_token_hash('tok-hard'),
                    user_id='u1',
                    created_at=now - timedelta(days=30, seconds=60),
                    last_seen_at=now,
                    expires_at=now + timedelta(hours=1),
                )
            )
            session.add_all(
                [
                    DisplayDevice(
                        id='disp-live',
                        token_hash=session_token_hash('tok-display-live'),
                        project_id='proj-a',
                        name='在线中控',
                        created_at=now,
                        last_seen_at=now,
                    ),
                    DisplayDevice(
                        id='disp-dead',
                        token_hash=session_token_hash('tok-display-dead'),
                        project_id='proj-a',
                        name='过期中控',
                        created_at=now,
                        last_seen_at=now - timedelta(days=400),
                    ),
                ]
            )
            session.commit()
        app.state.database = database
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        app.state.license_service = SimpleNamespace(
            allows=lambda _code: True, status=lambda: {'status': 'ACTIVE'}
        )
        settings = app.state.settings
        admin_cookie = {settings.cookie_name: 'tok-live'}
        hard_cookie = {settings.cookie_name: 'tok-hard'}
        display_page = display_path('甲项目')

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            live_login = await client.get('/login', cookies=admin_cookie)
            hard_login = await client.get('/login', cookies=hard_cookie)
            hard_asset = await client.get('/static/home.js', cookies=hard_cookie)
            live_asset = await client.get('/static/home.js', cookies=admin_cookie)
            live_display = await client.get(
                display_page, cookies={settings.display_cookie_name: 'tok-display-live'}
            )
            dead_display = await client.get(
                display_page, cookies={settings.display_cookie_name: 'tok-display-dead'}
            )
            admin_display = await client.get(display_page, cookies=admin_cookie)

        check(
            'B3 有效管理员会话在页面路由上照旧放行（跳 /license）',
            live_login.status_code == 303 and live_login.headers.get('location') == '/license',
            f'{live_login.status_code} {live_login.headers.get("location")}',
        )
        check(
            'B3 超过绝对寿命的会话在页面路由上被当成未登录（不再是 303 跳转）',
            hard_login.status_code == 200,
            f'{hard_login.status_code}（修复前这里会因为只查滑动过期而 303）',
        )
        check(
            'B3 超过绝对寿命的会话拿不到 /static 下的受保护资源',
            hard_asset.status_code == 401,
            f'{hard_asset.status_code}（修复前是 200：被盗 Cookie 能一直取静态资源）',
        )
        check(
            'B3 有效会话仍能取受保护静态资源（别把所有人都挡了）',
            live_asset.status_code == 200,
            f'{live_asset.status_code}',
        )
        check(
            'B2 有效中控令牌能打开展示页',
            live_display.status_code == 200,
            f'{live_display.status_code}',
        )
        check(
            'B2 过期中控令牌打不开展示页（跳配对页，且带上 next）',
            dead_display.status_code == 303 and dead_display.headers.get('location', '').startswith('/pair'),
            f'{dead_display.status_code} {dead_display.headers.get("location")}',
        )
        check(
            'B2 管理员会话不受中控令牌限制（展示页仍可打开）',
            admin_display.status_code == 200,
            f'{admin_display.status_code}',
        )


async def check_display_binding_guard() -> None:
    """4.2b：配对复查器的缓存必须真的命中。

    旧写法是路由里的闭包，给外层 ``display_binding_cache`` 赋值却没写
    ``nonlocal`` —— 那个名字在闭包内是局部的，第一次调用读到它就
    ``UnboundLocalError``：异常被上层 ``except Exception`` 收走且不记日志，
    现象是「展示设备推送一会儿就断、日志里什么都没有」。
    """
    from backend.app.access import ViewerPrincipal
    from backend.app.api import ha as ha_api
    from backend.app.api.ha import DisplayBindingGuard
    from backend.app.models import DisplayDevice

    with tempfile.TemporaryDirectory(prefix='hb-guard-') as tmp:
        fixture = _build_access_fixture(Path(tmp))
        with fixture.database.session_factory() as database:
            device = database.get(DisplayDevice, 'disp-a')
            database.expunge(device)
        websocket = _fake_websocket(fixture, {fixture.settings.display_cookie_name: _DISPLAY_TOKEN})

        calls = {'count': 0}
        real_lookup = ha_api.active_display_device

        def counting_lookup(database, settings, token, *, now=None):
            calls['count'] += 1
            return real_lookup(database, settings, token, now=now)

        ha_api.active_display_device = counting_lookup
        try:
            guard = DisplayBindingGuard(websocket, ViewerPrincipal(display=device))
            first = await guard.matches()
            calls_after_first = calls['count']
            # 旧实现在这一行就抛 UnboundLocalError：能让下面两条断言跑完，就已经修好了。
            second = await guard.matches()
        finally:
            ha_api.active_display_device = real_lookup
        check(
            '4.2b 配对复查不再抛 UnboundLocalError（第一次调用就走完整条路径）',
            first is True,
            f'first={first}',
        )
        check(
            '4.2b 复查结果按窗口缓存：连续两次调用只查一次库',
            second is True and calls_after_first == 1 and calls['count'] == 1,
            f'查库次数={calls["count"]}（首次后={calls_after_first}）',
        )

        calls['count'] = 0
        ha_api.active_display_device = counting_lookup
        try:
            admin_viewer = ViewerPrincipal(user=SimpleNamespace(username='admin'))
            admin_match = await DisplayBindingGuard(websocket, admin_viewer).matches()
            stale_viewer = ViewerPrincipal(display=SimpleNamespace(id='disp-a', project_id='proj-b'))
            stale_match = await DisplayBindingGuard(websocket, stale_viewer).matches()
        finally:
            ha_api.active_display_device = real_lookup
        check(
            '4.2b 管理员连接恒为 True 且不查库；改绑到别的项目判为不一致',
            admin_match is True and stale_match is False and calls['count'] == 1,
            f'admin={admin_match} 改绑={stale_match} 查库次数={calls["count"]}（应为 1）',
        )


async def check_runtime_task_relay() -> None:
    """B1：两路任务收尾时必须把真正的异常抛回调用方。

    旧写法在闭包里给外层 ``failure`` 赋值却没声明 ``nonlocal``：赋值只落在闭包
    自己的局部作用域，``raise failure`` 永远等不到东西（还因为读到未绑定的局部名
    抛 UnboundLocalError），于是两路任务里的真实异常被完全丢弃，而
    ``except WebSocketDisconnect`` / ``except TimeoutError`` 两个分支成了死代码。
    """
    from fastapi import WebSocketDisconnect

    from backend.app.api.ha import run_tasks_until_first_completes

    async def forever() -> None:
        await asyncio.sleep(3600)

    async def boom(message: str = '上游炸了') -> None:
        raise ValueError(message)

    async def normal_close() -> None:
        raise WebSocketDisconnect(code=1000)

    async def abnormal_close() -> None:
        raise WebSocketDisconnect(code=1006)

    async def slow_boom() -> None:
        await asyncio.sleep(0.05)
        raise RuntimeError('来晚了')

    async def observe_cancel(flag: dict) -> None:
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            flag['cancelled'] = True
            raise

    async def outcome(*operations: Any) -> str:
        """跑一轮并归纳「抛出了什么」，避免用例里到处 try/except。"""
        try:
            await asyncio.wait_for(run_tasks_until_first_completes(*operations), timeout=5)
            return '没有抛出'
        except WebSocketDisconnect as error:
            return f'WebSocketDisconnect: {error.code}'
        except BaseException as error:  # noqa: BLE001 - 这里要的就是类型名
            if isinstance(error, Exception):
                return f'{type(error).__name__}: {error}'
            return type(error).__name__

    check(
        'B1 一路任务的真实异常原样抛回调用方（不再被吞成 UnboundLocalError）',
        await outcome(boom, forever) == 'ValueError: 上游炸了',
        await outcome(boom, forever),
    )
    check(
        'B1 正常断连原样抛出且关闭码不丢（上层据此决定记不记警告）',
        await outcome(normal_close, forever) == 'WebSocketDisconnect: 1000',
        await outcome(normal_close, forever),
    )
    check(
        'B1 异常关闭码原样抛出（1006 这类要在日志里留下一条）',
        await outcome(abnormal_close, forever) == 'WebSocketDisconnect: 1006',
        await outcome(abnormal_close, forever),
    )
    check(
        'B1 两路都报真实异常时先到的优先（后续报错不覆盖第一个）',
        await outcome(boom, slow_boom) == 'ValueError: 上游炸了',
        await outcome(boom, slow_boom),
    )
    cancelled: dict = {}
    relay_outcome = await outcome(normal_close, lambda: observe_cancel(cancelled))
    check(
        'B1 一路结束后另一路被取消（不会留下悬挂的接收循环）',
        cancelled.get('cancelled') is True,
        f'抛出={relay_outcome} 被取消={cancelled.get("cancelled")}',
    )


def _closure_scope_offenders(root: Path) -> list[str]:
    """找出「函数内先读后写同一个名字」的地方。

    这类写法在闭包里就是漏写 ``nonlocal``：那个名字在闭包内成为局部名，
    闭包内之前的读直接 ``UnboundLocalError``，而外层变量永远不变。
    推导式在 Python 3 有自己的作用域，因此整段剪掉，避免把
    ``[x for x in ...]`` 里的目标名当成外层函数的绑定。
    """
    function_nodes = (ast.FunctionDef, ast.AsyncFunctionDef)
    all_functions = (*function_nodes, ast.Lambda)
    comprehensions = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)

    def pruned(node: ast.AST):
        """子节点，但不进入嵌套函数体与推导式。"""
        return [
            child
            for child in ast.iter_child_nodes(node)
            if not isinstance(child, (*all_functions, *comprehensions))
        ]

    def own_body_nodes(function: ast.AST):
        body = function.body if not isinstance(function, ast.Lambda) else [function.body]
        for statement in body:
            # def / class 只在本作用域绑定名字，它们的体属于另一个作用域。
            if isinstance(statement, (*all_functions, ast.ClassDef)):
                continue
            yield statement
            stack = list(pruned(statement))
            while stack:
                node = stack.pop()
                yield node
                stack.extend(pruned(node))

    def name_positions(function: ast.AST):
        reads: dict[str, tuple[int, int]] = {}
        writes: dict[str, tuple[int, int]] = {}
        for node in own_body_nodes(function):
            if not isinstance(node, ast.Name):
                continue
            where = (node.lineno, node.col_offset)
            bucket = reads if isinstance(node.ctx, ast.Load) else writes
            if node.id not in bucket or where < bucket[node.id]:
                bucket[node.id] = where
        return reads, writes

    def local_names(function: ast.AST) -> set[str]:
        args = function.args
        names = {
            arg.arg
            for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs, args.vararg, args.kwarg]
            if arg is not None
        }
        for node in own_body_nodes(function):
            if isinstance(node, (ast.Nonlocal, ast.Global)):
                names.update(node.names)
        return names

    def nested_functions(function: ast.AST) -> list[ast.AST]:
        found: list[ast.AST] = []

        def walk(node: ast.AST) -> None:
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda):
                    found.append(child)
                else:
                    walk(child)

        walk(function)
        return found

    offenders: list[str] = []
    for path in sorted(root.rglob('*.py')):
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError as error:  # 语法本来就有问题：交给语法检查去报，这里跳过
            offenders.append(f'{path}: 解析失败（{error}）')
            continue
        for top in [node for node in tree.body if isinstance(node, function_nodes)]:
            pending = [top]
            while pending:
                function = pending.pop()
                pending.extend(nested_functions(function))
                reads, writes = name_positions(function)
                declared = local_names(function)
                for name, first_write in writes.items():
                    if name in declared or name not in reads or reads[name] >= first_write:
                        continue
                    offenders.append(
                        f'{path}:{function.lineno} 函数 {getattr(function, "name", "<lambda>")} 里 '
                        f'{name!r} 先读（{reads[name][0]} 行）后写（{first_write[0]} 行）'
                    )
    return offenders


def check_closure_scope_writes() -> None:
    """4.2b：不许再出现「闭包里给外层变量赋值却没写 nonlocal」。

    两个真实缺陷（配对复查缓存、任务收尾的 ``failure``）都是这个形态：ruff 把它
    报成 F841（赋值后未使用），后果却远超 lint 噪声 —— 闭包内之前的读直接
    ``UnboundLocalError``，而异常又被上层 ``except Exception`` 收走，现象是
    「推送一会儿就断、日志里什么都没有」。所以这里用 AST 把整类写法挡住：
    函数内出现「先读后写同一个名字」就报出来（合法遮蔽都是先写后读）。
    """
    roots = [PROJECT_ROOT / name for name in ('backend', 'store', 'migrations', 'docker', 'tools')]
    offenders = [item for root in roots if root.exists() for item in _closure_scope_offenders(root)]
    check(
        '4.2b 没有「先读后写」的局部名（闭包里漏写 nonlocal 的那一类写法）',
        not offenders,
        '；'.join(offenders[:5]) if offenders else f'扫过 {len(roots)} 棵树，未发现',
    )


def check_access_criteria_single_source() -> None:
    """B32：三处入口必须共用同一套判据，不许再各写一份。

    凭据解析此前在 HTTP 依赖、页面路由、实时连接握手各有一份独立实现，
    而其中两份漏了绝对寿命与中控令牌有效期（B2/B3）。这条静态断言盯住
    「入口只做组装、判据只在 access/display_access 里」这一点：

    - 判据的唯一实现：``access.check_admin_session`` 与
      ``display_access.active_display_device``；
    - 入口只允许调用它们，函数体里不许再出现自己查 `expires_at` / 直接查
      ``LoginSession`` 或 ``session_token_hash`` 的痕迹。
    """
    targets = {
        (PROJECT_ROOT / 'backend' / 'app' / 'main.py'): {
            'signed_in': (['check_admin_session'], ['expires_at', 'LoginSession', 'session_token_hash']),
            'active_display': (['active_display_device'], ['expires_at', 'display_token_expired']),
            'browser_authorized': (['resolve_principal'], ['expires_at', 'LoginSession']),
        },
        (PROJECT_ROOT / 'backend' / 'app' / 'dependencies.py'): {
            '_admin_session': (['check_admin_session'], ['expires_at', 'session_token_hash']),
            '_display_device': (['active_display_device'], ['expires_at', 'display_token_expired']),
        },
        (PROJECT_ROOT / 'backend' / 'app' / 'api' / 'ha.py'): {
            'websocket_viewer': (['resolve_principal'], ['expires_at', 'LoginSession', 'session_token_hash']),
        },
    }
    problems: list[str] = []
    checked = 0
    for path, functions in targets.items():
        tree = ast.parse(path.read_text(encoding='utf-8'))
        found = {
            node.name: node
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        for name, (required, forbidden) in functions.items():
            node = found.get(name)
            if node is None:
                problems.append(f'{path.name} 里找不到 {name}')
                continue
            checked += 1
            used = {
                child.id for child in ast.walk(node)
                if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load)
            }
            used.update(
                getattr(child.func, 'id', getattr(child.func, 'attr', ''))
                for child in ast.walk(node)
                if isinstance(child, ast.Call)
            )
            missing = [item for item in required if item not in used]
            leaked = sorted(item for item in forbidden if item in used)
            if missing:
                problems.append(f'{name} 没有走 {missing}')
            if leaked:
                problems.append(f'{name} 里又出现了自己实现校验的痕迹 {leaked}')
    check(
        'B32 三处凭据入口都只做组装，判据只来自 access / display_access',
        not problems,
        '；'.join(problems) if problems else f'{checked} 个入口全部符合',
    )


# --------------------------------------------------------------------------- #
# B17 / B18：登录口令校验的耗时口径与「退出其他设备」的有效会话前提
# --------------------------------------------------------------------------- #
def _auth_settings() -> SimpleNamespace:
    """登录/会话接口会读到的 settings 字段（在凭据解析那份之上补几个）。"""
    values = {
        'trusted_proxies': (),
        'cookie_secure': False,
        'app_base_url': '',
        'version': '0.0.0-test',
    }
    values.update(_access_settings().__dict__)
    return SimpleNamespace(**values)


@dataclass
class LoginFixture:
    """一次登录调用需要的全部上下文：真库 + 最小 app.state + 假 Request。"""

    database: Any
    account: Any
    request: Any
    response: Any
    session: Any
    log: Any


class _Argon2Counter:
    """给 argon2 的校验计数：断言「真的算了一轮」而不是靠读代码猜。"""

    def __init__(self, hasher) -> None:
        self.hasher = hasher
        self.count = 0

    def verify(self, encoded: str, password: str) -> bool:
        self.count += 1
        return self.hasher.verify(encoded, password)


def _build_login_fixture(workdir: Path, credentials, **setting_overrides) -> LoginFixture:
    """搭好登录接口需要的库与 app.state（不装路由，直接调路由函数）。"""
    from starlette.requests import Request
    from starlette.responses import Response

    from backend.app.database import Base, Database
    from backend.app.models import User

    database = Database(f'sqlite:///{workdir / "login.db"}')
    Base.metadata.create_all(database.engine)
    with database.session_factory() as session:
        session.add(User(id='u1', username='admin', password_hash='sentinel', role='admin'))
        session.commit()
    settings = _auth_settings()
    for key, value in setting_overrides.items():
        setattr(settings, key, value)
    log = SimpleNamespace(entries=[], append=lambda *args: log.entries.append(args))
    app = SimpleNamespace(
        state=SimpleNamespace(
            database=database,
            settings=settings,
            admin_account=SimpleNamespace(user_id='u1', initialized=True, credentials=credentials),
            global_log=log,
        )
    )
    scope = {
        'type': 'http',
        'method': 'POST',
        'path': '/api/v1/auth/login',
        'query_string': b'',
        'scheme': 'http',
        'server': ('homeos.test', 80),
        'headers': [(b'host', b'homeos.test')],
        'client': ('203.0.113.9', 4321),
        'app': app,
    }
    return LoginFixture(
        database=database,
        account=app.state.admin_account,
        request=Request(scope),
        response=Response(),
        session=database.session_factory(),
        log=log,
    )


def _login_outcome(fixture: LoginFixture, username: str, password: str) -> str:
    """直接调登录路由函数，把结果压成一行可读文本。"""
    from fastapi import HTTPException

    from backend.app.api.auth import login
    from backend.app.schemas import LoginRequest

    try:
        result = login(
            payload=LoginRequest(username=username, password=password),
            request=fixture.request,
            response=fixture.response,
            database=fixture.session,
        )
        return f'登录成功:{result.username}'
    except HTTPException as error:
        return f'{error.status_code}'
    finally:
        fixture.session.rollback()


def check_login_password_verification_cost() -> None:
    """B17：口令校验的耗时不能回答「这个用户名存不存在」。

    原先这项校验写在五连 ``and`` 的最后一位，于是「用户名不对」会短路跳过
    argon2：一次失败请求 22ms、另一次 0.1ms，几次请求就能把用户名枚举出来。

    这里不看源码怎么写，而是把 argon2 的校验次数数下来：无论用户名对不对、
    账号文件在不在，都必须恰好 **1 次**（多算一轮同样是可观测的差别）。
    """
    from backend.app import security
    from backend.app.admin_account import EXTERNAL_PASSWORD_SENTINEL

    with tempfile.TemporaryDirectory(prefix='hb-login-') as tmp:
        real = security.password_hasher
        credentials = SimpleNamespace(
            user_id='u1',
            username='admin',
            password_hash=security.hash_password('correct-horse'),
        )
        counts: dict[str, int] = {}
        try:
            security.password_hasher = _Argon2Counter(real)

            fixture = _build_login_fixture(Path(tmp), credentials)
            cases = {
                '用户名对+口令错': ('admin', 'wrong-horse'),
                '用户名错+口令错': ('nobody', 'wrong-horse'),
                '用户名对+口令对（成功路径）': ('admin', 'correct-horse'),
                '账号文件里没有凭据（未初始化）': ('admin', 'correct-horse'),
            }
            outcomes = {}
            for label, (username, password) in cases.items():
                security.password_hasher.count = 0
                if '没有凭据' in label:
                    fixture.account.credentials = None
                outcomes[label] = _login_outcome(fixture, username, password)
                counts[label] = security.password_hasher.count
                fixture.account.credentials = credentials
        finally:
            security.password_hasher = real

    expected = {
        '用户名对+口令错': '401',
        '用户名错+口令错': '401',
        '用户名对+口令对（成功路径）': '登录成功:admin',
        '账号文件里没有凭据（未初始化）': '401',
    }
    check(
        'B17 前置：四种情形都按预期返回（下面的计数才有意义）',
        outcomes == expected,
        f'实际 {outcomes}',
    )
    check(
        'B17 用户名错时也真的算了一轮 argon2（不再靠短路跳过）',
        counts.get('用户名错+口令错', 0) == 1,
        f'argon2 校验次数={counts.get("用户名错+口令错")}（修复前是 0）',
    )
    check(
        'B17 账号文件里没有凭据时同样算一轮（否则「未初始化」一眼可辨）',
        counts.get('账号文件里没有凭据（未初始化）', 0) == 1,
        f'argon2 校验次数={counts.get("账号文件里没有凭据（未初始化）")}',
    )
    check(
        'B17 四种情形的校验次数一致（耗时差不再是可用的判别信号）',
        set(counts.values()) == {1},
        f'各情形次数={counts}',
    )

    # 兜底函数本身：哈希缺失 / 哈希损坏都必须走满一轮，且都返回 False。
    original = security.password_hasher
    counter = _Argon2Counter(original)
    attempts: dict[str, int] = {}
    results: dict[str, bool] = {}
    try:
        security.password_hasher = counter
        for label, stored in [
            ('哈希缺失', None),
            ('哈希格式非法', 'not-a-hash'),
            ('哨兵值（凭据已外置）', EXTERNAL_PASSWORD_SENTINEL),
        ]:
            counter.count = 0
            attempts[label] = 0
            results[label] = security.verify_password(stored, 'x')
            attempts[label] = counter.count
    finally:
        security.password_hasher = original
    check(
        'B17 哈希缺失 / 格式非法 / 哨兵值都恒走一轮以上、且结果恒为 False',
        set(results.values()) == {False} and attempts.get('哈希缺失') == 1 and min(attempts.values()) >= 1,
        f'结果={results} 各情形 argon2 次数={attempts}（缺失应为 1，其余至少 1）',
    )


@dataclass
class RevokeFixture:
    app: Any
    database: Any


def _build_revoke_fixture(workdir: Path, *, sessions: list[tuple[str, int]]) -> RevokeFixture:
    """只装会话管理路由的最小应用；认证依赖用桩顶掉，让路由体真的跑起来。

    ``sessions`` 给出 (令牌原文, 距现在多少秒后过期)；过期用负数表示。
    """
    from datetime import datetime, timedelta, timezone

    from fastapi import FastAPI

    from backend.app.api import auth as auth_api
    from backend.app.database import Base, Database
    from backend.app.dependencies import authenticated_short_lived_user
    from backend.app.models import LoginSession, User
    from backend.app.security import session_token_hash

    database = Database(f'sqlite:///{workdir / "revoke.db"}')
    Base.metadata.create_all(database.engine)
    now = datetime.now(timezone.utc)
    with database.session_factory() as session:
        session.add(User(id='u1', username='admin', password_hash='sentinel', role='admin'))
        session.commit()
        for token, expires_in in sessions:
            session.add(
                LoginSession(
                    id_hash=session_token_hash(token),
                    user_id='u1',
                    created_at=now - timedelta(minutes=5),
                    last_seen_at=now,
                    expires_at=now + timedelta(seconds=expires_in),
                )
            )
        session.commit()
    app = FastAPI()
    log = SimpleNamespace(entries=[], append=lambda *args: log.entries.append(args))
    app.state.database = database
    app.state.settings = _auth_settings()
    app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
    app.state.global_log = log
    app.include_router(auth_api.router, prefix='/api/v1')
    # 认证依赖顶成桩：本检查要验的是「路由体在有/无有效会话时各做什么」，
    # 认证本身另有断言（B2/B3/B32）。桩让「无 Cookie 也进得来」这种情形可测。
    app.dependency_overrides[authenticated_short_lived_user] = lambda: User(
        id='u1', username='admin', password_hash='sentinel', role='admin'
    )
    return RevokeFixture(app=app, database=database)


async def check_revoke_other_sessions_requires_valid_session() -> None:
    """B18：「退出其他设备」必须先确认当前这条会话真的有效。

    删除条件是 ``id_hash != current_hash``，所以一旦当前会话认不出来
    （Cookie 缺失、或哈希对不上任何行），「不等于」就退化成「删光该用户的全部
    会话」—— 包括操作者自己这条，等于凭空登出。这里把认证依赖换成桩，让路由体
    在没有有效 Cookie 的情况下真的跑起来，断言它拒绝而不是照删。
    """
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from backend.app.models import LoginSession
    from backend.app.security import session_token_hash

    tokens = ['tok-current', 'tok-old-a', 'tok-old-b']

    with tempfile.TemporaryDirectory(prefix='hb-revoke-') as tmp:
        fixture = _build_revoke_fixture(Path(tmp), sessions=[(token, 3600) for token in tokens])
        transport = httpx.ASGITransport(app=fixture.app)

        def hashes() -> list[str]:
            """当前库里的会话哈希集合（用于断言「一条都没少」）。"""
            with fixture.database.session_factory() as session:
                return sorted(session.scalars(select(LoginSession.id_hash)).all())

        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            # 1) 完全没有 Cookie：必须拒绝，且一条会话都不许少。
            before = hashes()
            empty = await client.delete('/api/v1/auth/sessions')
            check(
                'B18 没有 Cookie 时拒绝而不是删光（否则等于凭空登出所有设备）',
                empty.status_code == 401 and hashes() == before,
                f'{empty.status_code}，剩余会话 {len(hashes())}/{len(before)} 条',
            )

            # 2) Cookie 存在但对不上任何会话行：同样拒绝。
            ghost = await client.delete(
                '/api/v1/auth/sessions',
                cookies={fixture.app.state.settings.cookie_name: 'tok-ghost'},
            )
            check(
                'B18 Cookie 认不出会话行时同样拒绝，且不动任何行',
                ghost.status_code == 401 and hashes() == before,
                f'{ghost.status_code}，剩余 {len(hashes())} 条',
            )

            # 3) 会话行存在但已过期：认证依赖会拦住，这里桩掉了依赖，路由要自己拒绝。
            expired_token = 'tok-expired'
            now = datetime.now(timezone.utc)
            with fixture.database.session_factory() as session:
                session.add(
                    LoginSession(
                        id_hash=session_token_hash(expired_token),
                        user_id='u1',
                        created_at=now - timedelta(hours=9),
                        last_seen_at=now - timedelta(hours=9),
                        expires_at=now - timedelta(minutes=1),
                    )
                )
                session.commit()
            before_expired = hashes()
            stale = await client.delete(
                '/api/v1/auth/sessions',
                cookies={fixture.app.state.settings.cookie_name: expired_token},
            )
            check(
                'B18 已过期的会话不被当作「当前会话」（不能拿它当护身符批量删）',
                stale.status_code == 401 and hashes() == before_expired,
                f'{stale.status_code}，剩余 {len(hashes())} 条',
            )

            # 4) 有效会话：真的只删「其他」那些，当前这条留着。
            live = await client.delete(
                '/api/v1/auth/sessions',
                cookies={fixture.app.state.settings.cookie_name: 'tok-current'},
            )
            remaining = hashes()
            check(
                'B18 有效会话下只删其他设备（当前这条留着，否则操作者自己掉线）',
                live.status_code == 204
                and session_token_hash('tok-current') in remaining
                and len(remaining) == 1,
                f'{live.status_code}，剩余 {len(remaining)} 条（应为 1）',
            )


# --------------------------------------------------------------------------- #
# B28 / 4.3 C 类：同源闸门的 scheme 必须由部署形态钉死
# --------------------------------------------------------------------------- #
def _security_request(
    *,
    scheme: str = 'https',
    host: str = 'homeos.test',
    peer: str = '203.0.113.9',
    origin: str | None = None,
    referer: str | None = None,
    forwarded_proto: str | None = None,
    base_url: str = '',
    trusted: tuple[str, ...] = (),
    base_url_attr: str = 'app_base_url',
    cookie_secure: bool = False,
    app: Any = None,
):
    """造一个只带安全判定所需字段的请求（不装应用）。"""
    from starlette.requests import Request

    headers = [(b'host', host.encode())]
    if origin is not None:
        headers.append((b'origin', origin.encode()))
    if referer is not None:
        headers.append((b'referer', referer.encode()))
    if forwarded_proto is not None:
        headers.append((b'x-forwarded-proto', forwarded_proto.encode()))
    settings = SimpleNamespace(
        trusted_proxies=trusted, cookie_secure=cookie_secure, **{base_url_attr: base_url}
    )
    scope = {
        'type': 'http',
        'method': 'POST',
        'path': '/api/v1/whatever',
        'query_string': b'',
        'scheme': scheme,
        'server': (host, 443),
        'headers': headers,
        'client': (peer, 4321),
        'app': SimpleNamespace(state=SimpleNamespace(settings=settings)),
    }
    return Request(scope)


def _load_store_request_security():
    """按路径加载商店那份实现。

    两份实现是**刻意**互不 import 的（两个服务独立部署、独立配置），所以要把它们
    放在一起对照，只能在自检里按路径加载，而不是让生产代码互相依赖。
    """
    import importlib.util

    path = PROJECT_ROOT / 'store' / 'request_security.py'
    spec = importlib.util.spec_from_file_location('store_request_security_probe', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


#: 同源判定的对照矩阵：(说明, 请求参数, 期望放行)。
#:
#: 第三条尤其重要：它保证这次修复没有把纯 http 部署（局域网里的常见形态）一起挡掉。
SAME_ORIGIN_CASES: list[tuple[str, dict, bool]] = [
    ('https 站点上的 http 同主机来源（B28 的攻击形态）', {'scheme': 'https', 'origin': 'http://homeos.test'}, False),
    ('https 站点上的 https 同主机来源', {'scheme': 'https', 'origin': 'https://homeos.test'}, True),
    ('纯 http 部署上的 http 同主机来源（局域网照旧可用）', {'scheme': 'http', 'origin': 'http://homeos.test'}, True),
    ('纯 http 部署上的 https 同主机来源（降级声明同样不认）', {'scheme': 'http', 'origin': 'https://homeos.test'}, False),
    (
        '按 APP_BASE_URL 钉死对外 https（反代没转发 proto）',
        {'scheme': 'http', 'host': 'homeos.local', 'base_url': 'https://home.example', 'origin': 'http://homeos.local'},
        False,
    ),
    (
        '同上，来源是配置里的公开地址',
        {'scheme': 'http', 'host': 'homeos.local', 'base_url': 'https://home.example', 'origin': 'https://home.example'},
        True,
    ),
    (
        '可信代理转发的 https 优先于本连接（反代终止 TLS）',
        {
            'scheme': 'http',
            'peer': '10.0.0.5',
            'trusted': ('10.0.0.0/8',),
            'forwarded_proto': 'https',
            'origin': 'http://homeos.test',
        },
        False,
    ),
    (
        '同上，https 来源放行',
        {
            'scheme': 'http',
            'peer': '10.0.0.5',
            'trusted': ('10.0.0.0/8',),
            'forwarded_proto': 'https',
            'origin': 'https://homeos.test',
        },
        True,
    ),
    (
        '对端不可信时不信 X-Forwarded-Proto（伪造降级无效）',
        {
            'scheme': 'http',
            'trusted': ('10.0.0.0/8',),
            'forwarded_proto': 'https',
            'origin': 'http://homeos.test',
        },
        True,
    ),
    ('带 userinfo 的伪装来源照旧拒绝', {'scheme': 'https', 'origin': 'http://evil@homeos.test/'}, False),
    ('只有 Referer 时按同一口径比（老浏览器表单）', {'scheme': 'https', 'referer': 'http://homeos.test/login'}, False),
    ('两个头都没有时放行（脚本与回调不是浏览器）', {'scheme': 'https'}, True),
]


def check_same_origin_scheme_pinning() -> None:
    """B28：同源白名单里的 scheme 不能取自 Origin 自己。

    原先 ``allowed`` 里放的是 ``f'{parsed.scheme}://{host}'`` —— 校验的是「来源
    自称同源」，于是同主机的明文页面能驱动 HTTPS 站点的带 Cookie 写请求。
    scheme 改由部署形态给出（APP_BASE_URL → 可信代理转发 → 本连接），
    Host 仍然取自浏览器改不掉的请求头。
    """
    from backend.app.http_security import same_origin_request

    mismatches = []
    for label, kwargs, expected in SAME_ORIGIN_CASES:
        actual = bool(same_origin_request(_security_request(**kwargs)))
        if actual != expected:
            mismatches.append(f'{label}：期望 {expected} 实际 {actual}')
    check(
        'B28 同源判定按部署形态钉死 scheme（12 种来源逐条对照）',
        not mismatches,
        '；'.join(mismatches) if mismatches else f'{len(SAME_ORIGIN_CASES)} 条全部符合',
    )

    source = (PROJECT_ROOT / 'backend' / 'app' / 'http_security.py').read_text(encoding='utf-8')
    body = source.split('def _origin_allowed', 1)[1].split('\ndef ', 1)[0]
    check(
        'B28 _origin_allowed 里不再出现「用 Origin 的 scheme 拼白名单」的写法',
        'expected_request_scheme(request)' in body and '{parsed.scheme}://{host}' not in body,
        '命中点已改为 expected_request_scheme(request)',
    )


def check_request_security_parity() -> None:
    """4.3 C 类：``http_security.py`` 与 ``request_security.py`` 必须同口径。

    两份实现刻意重复（两个服务独立部署、互不 import），但「改这里时同步改那边」
    此前只是一句注释、没有测试兜底 —— 而 B51（转发头信任）与 B28（同源 scheme）
    恰好都落在这两个文件里，修一处漏一处就是一个安全缺口。

    因此这里把两份实现按同一批请求跑一遍，逐条比对结论。不为消除重复而强行抽象，
    只把「必须一致」这件事变成可执行的断言。
    """
    from backend.app import http_security as backend_mod

    store_mod = _load_store_request_security()

    mismatches: list[str] = []
    for label, kwargs, expected in SAME_ORIGIN_CASES:
        store_kwargs = dict(kwargs)
        if 'base_url' in store_kwargs:
            store_kwargs['base_url_attr'] = 'public_base_url'
        backend_verdict = bool(backend_mod.same_origin_request(_security_request(**kwargs)))
        store_verdict = bool(store_mod.same_origin_request(_security_request(**store_kwargs)))
        if backend_verdict != store_verdict:
            mismatches.append(f'{label}：backend={backend_verdict} store={store_verdict}')
        if store_verdict != expected:
            mismatches.append(f'{label}：store 期望 {expected} 实际 {store_verdict}')

    # 来源 IP 解析：两侧同样必须一致（这段是 B51 的直接判据）。
    for label, kwargs in [
        ('未配置可信代理', {'peer': '203.0.113.9', 'forwarded_proto': None}),
        ('对端是可信代理', {'peer': '10.0.0.5', 'trusted': ('10.0.0.0/8',)}),
    ]:
        backend_address = backend_mod.resolve_client_ip(_security_request(**kwargs))
        store_address = store_mod.resolve_client_ip(_security_request(**kwargs))
        if (backend_address.ip, backend_address.per_client, backend_address.via_proxy) != (
            store_address.ip,
            store_address.per_client,
            store_address.via_proxy,
        ):
            mismatches.append(f'来源 IP（{label}）：backend={backend_address} store={store_address}')

    # Cookie 的 Secure 判定：两个服务各自的名字不同（app_base_url / public_base_url），
    # 正是相似度口径才能发现的那种漂移。
    for label, kwargs in [
        ('明文部署', {}),
        ('https 基址', {'base_url': 'https://home.example', 'scheme': 'http'}),
        ('强制开关', {'cookie_secure': True, 'scheme': 'http'}),
    ]:
        backend_secure = bool(backend_mod.secure_cookies_enabled(_security_request(**kwargs)))
        store_kwargs = dict(kwargs)
        if 'base_url' in store_kwargs:
            store_kwargs['base_url_attr'] = 'public_base_url'
        store_secure = bool(store_mod.secure_cookies_required(_security_request(**store_kwargs)))
        if backend_secure != store_secure:
            mismatches.append(f'Secure Cookie（{label}）：backend={backend_secure} store={store_secure}')

    check(
        '4.3-C 两服务刻意重复的来源判定逐条一致（改一处漏一处会立刻变红）',
        not mismatches,
        '；'.join(mismatches)
        if mismatches
        else f'同源 {len(SAME_ORIGIN_CASES)} 条 + 来源 IP 2 条 + Secure Cookie 3 条全部一致',
    )


# --------------------------------------------------------------------------- #
# 自检自身
# --------------------------------------------------------------------------- #
# --------------------------------------------------------------------------- #
# P5 第二批：同步重活不许占着事件循环（B4 / B5 / B6 / B55）+ 导出回滚的异常链（B39）
# --------------------------------------------------------------------------- #
#: 事件循环的线程 id：所有「这段同步工作必须离事件循环」的断言都比对它。
LOOP_THREAD = threading.get_ident()


class _RecordingDatabase:
    """把 ``Database`` 包一层，记录每次开会话时的线程。

    断言用的就是它：修复前 ``async def`` 路由与授权服务直接
    ``with database.session_factory()``，记下来的线程必然等于事件循环线程；
    转线程池之后必然是别的线程。
    """

    def __init__(self, database: Any) -> None:
        self.inner = database
        self.threads: list[int] = []

    def session_factory(self):
        self.threads.append(threading.get_ident())
        return self.inner.session_factory()

    def __getattr__(self, name: str) -> Any:
        # engine / dispose 等其余成员照旧代理：这层包装不该改变被包对象的语义。
        return getattr(self.inner, name)

    def all_off_loop(self) -> bool:
        """是否至少开过一次会话，且每一次都不在事件循环线程上。"""
        return bool(self.threads) and all(thread != LOOP_THREAD for thread in self.threads)


class _LoopTicker:
    """后台计时器：观测事件循环有没有被同步工作掐住。

    每 5 毫秒自增一次。跑一段同步睡 250 毫秒的桩时：计时器还在涨（≥5 次）说明
    那段同步工作在工作线程里；留在事件循环里则整段睡眠期间一次都涨不了。
    """

    def __init__(self) -> None:
        self.ticks = 0
        self._task: asyncio.Task | None = None

    async def _run(self) -> None:
        while True:
            self.ticks += 1
            await asyncio.sleep(0.005)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None


def _request_with_chunks(app: Any, path: str, headers: dict[str, str], chunks: list[bytes]):
    """拼一个真的 ``Request``（含可迭代的请求体），用来直接调路由函数。

    不经过 ASGI 应用是刻意的：这几条检查要观测「同步工作跑在哪个线程」，
    起一个完整的应用只会多出无关的中间件与生命周期，反而看不清。
    """
    from starlette.requests import Request

    pending = list(chunks)

    async def receive() -> dict[str, Any]:
        if pending:
            body = pending.pop(0)
            return {'type': 'http.request', 'body': body, 'more_body': bool(pending)}
        return {'type': 'http.request', 'body': b'', 'more_body': False}

    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': 'POST',
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode(),
        'query_string': b'',
        'root_path': '',
        'headers': [(key.lower().encode(), value.encode()) for (key, value) in headers.items()],
        'client': ('127.0.0.1', 40000),
        'server': ('app.test', 80),
        'app': app,
    }
    return Request(scope, receive)


async def check_stream_writes_offloaded() -> None:
    """B5/B6 共用件：请求体落盘必须批量、且写盘不在事件循环线程上。

    这是两个上传端点共同依赖的那段逻辑，坏掉会同时影响导出包与素材上传，
    因此单独测它：批量（写入调用数远少于分块数）、逐块转线程、超限在落盘前拦下、
    写出的字节与收到的完全一致。
    """
    from backend.app.streaming import BATCH_BYTES, write_stream_in_batches

    chunk = b'x' * 65536
    chunks = [chunk] * 24  # 1.5 MiB：足以触发一次批量落盘，又远小于任何上限。
    writes: list[int] = []

    class _RecordingFile:
        """记录每次 write 的线程与字节数；真实内容落到临时文件里。"""

        def __init__(self, handle: Any) -> None:
            self.handle = handle
            self.bytes = 0

        def write(self, data: bytes) -> int:
            writes.append(threading.get_ident())
            self.bytes += len(data)
            return self.handle.write(data)

    async def stream():
        for item in chunks:
            yield item

    with tempfile.TemporaryDirectory(prefix='hb-stream-') as tmp:
        path = Path(tmp) / 'upload.bin'
        with path.open('xb') as handle:
            recording = _RecordingFile(handle)
            received = await write_stream_in_batches(stream(), recording)
        written = path.read_bytes()

    check(
        'B5/B6 请求体字节数与写出的文件完全一致',
        received == len(chunk) * len(chunks) and written == chunk * len(chunks),
        f'收到 {received}，文件 {len(written)}',
    )
    check(
        'B5/B6 每批写盘都在工作线程里（不在事件循环线程上）',
        bool(writes) and all(thread != LOOP_THREAD for thread in writes),
        f'写入线程 {sorted(set(writes))[:3]}（事件循环线程 {LOOP_THREAD}）',
    )
    check(
        'B5/B6 攒批生效：1.5 MiB 至少合并成远少于分块数的 write',
        len(writes) <= 3,
        f'{len(chunks)} 块 → {len(writes)} 次 write（BATCH_BYTES={BATCH_BYTES}）',
    )

    # 超限判定必须在落盘之前：否则「限 128 KiB」的上传会先把整批 1 MiB 写进磁盘再报错。
    # 这一条刻意只给一块、且刚好攒够一批：判定若挪到落盘之后，盘上就会留下 1 MiB。
    async def one_full_batch():
        yield chunk * (BATCH_BYTES // len(chunk))

    limit = 2 * len(chunk)
    with tempfile.TemporaryDirectory(prefix='hb-stream-') as tmp:
        path = Path(tmp) / 'too-big.bin'
        over_limit = False
        try:
            with path.open('xb') as handle:
                def _reject_first_batch(received_total: int) -> None:
                    if received_total > limit:
                        raise ValueError('超限')

                await write_stream_in_batches(one_full_batch(), handle, before_write=_reject_first_batch)
        except ValueError:
            over_limit = True
        on_disk = path.stat().st_size

    check(
        'B5/B6 超限时抛错且一个字节都没落盘（判定在写盘之前）',
        over_limit and on_disk == 0,
        f'抛错={over_limit}，落盘 {on_disk} 字节（上限 {limit}；判在写盘之后会留下 {BATCH_BYTES} 字节）',
    )

    # 限内已落盘的数据要留着（不是「一超限就整份丢弃」）：限 2 MiB、收 2.5 MiB → 盘上 2 MiB。
    async def many_chunks():
        for _ in range(40):
            yield chunk

    with tempfile.TemporaryDirectory(prefix='hb-stream-') as tmp:
        path = Path(tmp) / 'partial.bin'
        caught = False
        try:
            with path.open('xb') as handle:
                def _reject_inner(received_total: int) -> None:
                    if received_total > 32 * len(chunk):
                        raise ValueError('超限')

                await write_stream_in_batches(many_chunks(), handle, before_write=_reject_inner)
        except ValueError:
            caught = True
        kept = path.stat().st_size

    check(
        'B5/B6 超限前已收下的数据保留在盘上，且不超过上限',
        caught and kept == 32 * len(chunk),
        f'抛错={caught}，落盘 {kept} 字节（期望 {32 * len(chunk)}）',
    )


async def check_export_route_offloads_work() -> None:
    """B5：导出上传的校验、解压、登记都必须在工作线程里跑。

    实测而不是读源码：把 _validate_archive / _install_export / 素材登记换成
    「记下线程 + 同步睡 250 毫秒」的桩，然后真的走一遍路由体，同时用计时器观测
    事件循环。修复前这三段直接写在 ``async def`` 里，睡的这一下会把循环掐住
    （计时器一次都涨不了），现象就是一次大导出冻结整个应用。
    """
    from backend.app.api import studio3d

    payload = b'PK\x03\x04' + b'y' * 70000
    calls: list[tuple[str, int]] = []
    captured: list[bytes] = []

    with tempfile.TemporaryDirectory(prefix='hb-export-') as tmp:
        exports_dir = Path(tmp)
        app = SimpleNamespace(state=SimpleNamespace(
            settings=SimpleNamespace(studio3d_exports_dir=exports_dir),
            global_log=SimpleNamespace(append=lambda *_args, **_kwargs: None),
            # 素材目录缺省不存在：这条检查只关心三段重活各自跑在哪个线程。
            asset_catalog=SimpleNamespace(
                register_studio3d_export=lambda *_args: calls.append(('register', threading.get_ident())),
            ),
        ))

        original_validate = studio3d._validate_archive
        original_install = studio3d._install_export
        try:
            def fake_validate(archive_path: Path):
                calls.append(('validate', threading.get_ident()))
                captured.append(archive_path.read_bytes())
                time.sleep(0.25)
                # 真返回一份条目清单（形状与 _validate_archive 一致）：解压与素材
                # 登记都靠它驱动，返回空清单就等于那两段重活根本没被走到。
                return [
                    SimpleNamespace(filename='scene.json'),
                    SimpleNamespace(filename='沙发.png'),
                ]

            def fake_install(_settings, _folder, _archive, entries, _overwrite):
                calls.append(('install', threading.get_ident()))
                time.sleep(0.25)
                return False

            studio3d._validate_archive = fake_validate
            studio3d._install_export = fake_install
            request = _request_with_chunks(
                # 请求头按前端约定传 URL 编码值：裸中文会按 latin-1 解出乱码。
                app, '/api/v1/studio3d/exports', {'x-export-folder': quote('户型图')}, [payload]
            )
            ticker = _LoopTicker()
            ticker.start()
            result = await studio3d.save_studio3d_export(request, None)
            await ticker.stop()
        finally:
            studio3d._validate_archive = original_validate
            studio3d._install_export = original_install

        leftovers = [item.name for item in exports_dir.glob('.upload-*.zip')]

        # 空请求体仍要 422（重构后「空 ZIP」的判定不能丢）。
        empty_request = _request_with_chunks(
            app, '/api/v1/studio3d/exports', {'x-export-folder': quote('空包')}, []
        )
        empty_status = None
        try:
            await studio3d.save_studio3d_export(empty_request, None)
        except Exception as error:  # noqa: BLE001 - 这里就是要看路由抛出的那个 4xx
            empty_status = getattr(error, 'status_code', None)

    check(
        'B5 导出上传的校验 / 解压 / 登记全部跑在工作线程（不在事件循环线程上）',
        {name for (name, _thread) in calls} == {'validate', 'install', 'register'}
        and all(thread != LOOP_THREAD for (_name, thread) in calls),
        f'调用点 {calls}（事件循环线程 {LOOP_THREAD}）',
    )
    check(
        'B5 三段同步重活期间事件循环照常转（计时器仍在自增）',
        ticker.ticks >= 5,
        f'500 毫秒的同步桩里计时器涨了 {ticker.ticks} 次（被掐住时为 0～1）',
    )
    check(
        'B5 上传的字节经批量落盘后与请求体一致',
        captured == [payload],
        f'校验时读到的字节数 {[len(item) for item in captured]}，期望 {len(payload)}',
    )
    check(
        'B5 上传临时文件无论成败都不留在导出目录里',
        not leftovers,
        f'遗留 {leftovers}',
    )
    check(
        'B5 空 ZIP 仍然 422（重构没把「空包」判定丢掉）',
        empty_status == 422,
        f'status={empty_status}',
    )
    check(
        'B5 返回体把原 ZIP 一并列进导出结果',
        result.get('files') == ['scene.json', '沙发.png', '户型图.zip']
        and result.get('overwritten') is False,
        f'{result.get("files")}',
    )


async def check_upload_route_offloads_work() -> None:
    """B6：素材上传的解码校验与登记必须在工作线程里跑。

    用的是**真的** ``validate_uploaded_image``（真 Pillow 解码）：桩只在外面套一层
    「记线程 + 睡 250 毫秒」把耗时放大到可观测，解码本身照常执行 —— 这样断言的是
    「真实的解码路径被搬到了工作线程」，而不是「某个桩被调用了」。
    """
    from PIL import Image
    from backend.app.api import assets

    body = bytearray()
    with tempfile.TemporaryDirectory(prefix='hb-upload-') as tmp:
        png_path = Path(tmp) / 'source.png'
        Image.new('RGB', (8, 8), (12, 34, 56)).save(png_path, format='PNG')
        body = png_path.read_bytes()

    calls: list[tuple[str, int]] = []
    returns: list[dict] = []

    def register_user(asset_id: str, path: Path, dimensions: tuple[int, int]) -> dict:
        calls.append(('register', threading.get_ident()))
        returns.append({'assetId': f'user:{asset_id}', 'name': path.name, 'dimensions': list(dimensions)})
        return returns[-1]

    with tempfile.TemporaryDirectory(prefix='hb-upload-') as tmp:
        root = Path(tmp) / 'user-assets'
        root.mkdir()
        app = SimpleNamespace(state=SimpleNamespace(
            settings=SimpleNamespace(user_assets_dir=root),
            asset_catalog=SimpleNamespace(register_user=register_user),
        ))

        original_validate = assets.validate_uploaded_image
        try:
            def recording_validate(suffix: str, path: Path):
                calls.append(('validate', threading.get_ident()))
                time.sleep(0.25)
                return original_validate(suffix, path)

            assets.validate_uploaded_image = recording_validate
            request = _request_with_chunks(
                app, '/api/v1/assets/user', {'x-file-name': quote('图.png')}, [body[: 100], body[100:]]
            )
            ticker = _LoopTicker()
            ticker.start()
            uploaded = await assets.upload_user_asset(request, None)
            await ticker.stop()

            # 校验失败时的清理路径：目录与半截文件都不能留下。
            def rejecting_validate(_suffix: str, _path: Path):
                calls.append(('validate-reject', threading.get_ident()))
                raise ValueError('图片文件已损坏或无法完整解码。')

            assets.validate_uploaded_image = rejecting_validate
            bad_request = _request_with_chunks(
                app, '/api/v1/assets/user', {'x-file-name': quote('坏图.png')}, [b'not-an-image']
            )
            reject_status = None
            try:
                await assets.upload_user_asset(bad_request, None)
            except Exception as error:  # noqa: BLE001 - 这里就是要看路由抛出的那个 4xx
                reject_status = getattr(error, 'status_code', None)
        finally:
            assets.validate_uploaded_image = original_validate

        stored = sorted(item.name for item in root.iterdir())
        stored_bytes = (root / stored[0] / '图.png').read_bytes() if stored else b''

    check(
        'B6 素材解码校验与登记都跑在工作线程（不在事件循环线程上）',
        {name for (name, _thread) in calls} >= {'validate', 'register'}
        and all(thread != LOOP_THREAD for (_name, thread) in calls),
        f'调用点 {calls}（事件循环线程 {LOOP_THREAD}）',
    )
    check(
        'B6 解码期间事件循环照常转（计时器仍在自增）',
        ticker.ticks >= 5,
        f'250 毫秒的同步桩里计时器涨了 {ticker.ticks} 次（被掐住时为 0～1）',
    )
    check(
        'B6 上传的字节分批落盘后与请求体一致',
        stored_bytes == bytes(body),
        f'落盘 {len(stored_bytes)} 字节，期望 {len(body)}',
    )
    check(
        'B6 上传成功返回登记后的素材条目（含真实解码出的尺寸）',
        uploaded.get('dimensions') == [8, 8],
        f'{uploaded}',
    )
    check(
        'B6 校验失败仍是 422，且不留下空目录或半截文件',
        reject_status == 422 and len(stored) == 1,
        f'status={reject_status}，素材目录里只剩 {stored}',
    )


def _bare_license_service(database: Any, instance_id: str) -> Any:
    """拼一个只装了必要字段的 ``LicenseService``（绕开构造器的信任锚校验）。

    这条检查只关心「同步查库跑在哪个线程」，不需要真密钥与验签器，而构造器会的
    读 PEM、算指纹、校验配置，与本检查无关且会挡住它（自检环境没有那些密钥文件）。
    因此直接 ``__new__`` 再注入最小属性 —— 注入的属性与构造器会设的是同一套。

    验签器与密文器换成桩（真实现要真密钥），但 ``_apply_response`` 用的是**真**方法：
    它才是「心跳成功后把租约写进库」的那段同步落库，用桩替代就等于这条断言没覆盖它。
    """
    from datetime import datetime, timedelta, timezone

    from backend.app.license.service import LicenseService

    now = datetime.now(timezone.utc)
    payload = {
        'expiresAt': (now + timedelta(hours=1)).isoformat(),
        'issuedAt': now.isoformat(),
        'leaseSequence': 4,
        'activationCodeId': 'lic-1',
        'leaseId': 'lease-1',
        'sessionId': 'sess-1',
        'features': ['all'],
    }
    service = object.__new__(LicenseService)
    service.settings = SimpleNamespace(
        license_required=True, license_clock_skew_seconds=30, version='smoke'
    )
    service.database = database
    service.event_log = None
    service._event_lock = threading.RLock()
    service._observed_status = None
    service._event_failures = {}
    service._startup_validation_pending = False
    service._last_binding_confirm_at = 0.0
    service._heartbeat_lock = asyncio.Lock()
    service._stop = asyncio.Event()
    service._schedule_changed = asyncio.Event()
    service._endpoint_pool = SimpleNamespace(
        configured=True, candidates=lambda: [], mark_failed=lambda *_args: None
    )
    service.verifier = SimpleNamespace(verify=lambda _lease, _instance: dict(payload))
    service.cipher = SimpleNamespace(
        decrypt=lambda _value: 'token', encrypt=lambda _value: 'encrypted'
    )
    service._transport = None
    service._task = None
    # 实例 ID 直接给缓存值：真实取值要读硬件指纹，与「在哪个线程查库」无关。
    service._cached_instance_id = instance_id
    return service


def _license_fixture(tmp: Path) -> tuple[Any, str]:
    """建一个只含单行 LicenseState 的库，返回 (记录线程的 Database, 实例 ID)。"""
    from backend.app.database import Base, Database
    from backend.app.models import LicenseState

    instance_id = 'a' * 64
    inner = Database(f'sqlite:///{tmp / "license.db"}')
    Base.metadata.create_all(inner.engine)
    with inner.session_factory() as session:
        session.add(
            LicenseState(
                id=1,
                instance_id=instance_id,
                license_id='lic-1',
                lease_id='lease-1',
                session_id='sess-1',
                signed_lease='signed-lease',
                lease_sequence=3,
                status='ACTIVE',
                encrypted_session_token='enc-session',
                encrypted_recovery_token='enc-recovery',
                feature_set='[]',
                heartbeat_interval_seconds=300,
            )
        )
        session.commit()
    return (_RecordingDatabase(inner), instance_id)


async def check_license_database_offloaded() -> None:
    """B4：授权服务的同步查库必须都在工作线程里。

    心跳、恢复、吊销清理、确认绑定这几条路径都会被请求 ``await``，其中任何一次
    ``session_factory()`` 留在事件循环线程上，就是「一次 WAL 提交拖住所有请求」。
    这里真的走一遍成功、失败（降级）、被吊销三条路径，把每一次开会话的线程记下来。
    """
    from backend.app.license.service import LicenseClientError

    with tempfile.TemporaryDirectory(prefix='hb-license-') as tmp:
        (database, instance_id) = _license_fixture(Path(tmp))
        service = _bare_license_service(database, instance_id)

        async def ok_post(_path: str, _payload: dict) -> dict:
            # 形状与真响应一致：_apply_response 是**真**方法，会真的验签（桩）、
            # 真的把租约写进 LicenseState 那一行。
            return {'signedLease': 'signed-lease-2', 'sessionToken': 'session-token', 'recoveryToken': 'recovery-token'}

        service._post = ok_post

        result = await service.heartbeat()
        check(
            'B4 心跳成功路径真的执行了并落库（不是提前返回）',
            bool(result.get('status')) and result.get('status') == 'ACTIVE',
            f'status={result.get("status")}',
        )
        def read_stored() -> tuple[int, str]:
            # 自检自己也要守规矩：这段读库放线程池，否则记录里会多一个事件循环线程的
            # 开会话，把「授权服务的写库都不在事件循环上」这条断言自己搞红。
            from backend.app.models import LicenseState
            from sqlalchemy import select

            with database.session_factory() as session:
                stored = session.scalar(select(LicenseState).limit(1))
                return (stored.lease_sequence, stored.status)

        (stored_sequence, stored_status) = await asyncio.to_thread(read_stored)
        check(
            'B4 心跳把新租约真的写进了库（序号推进、状态转 ACTIVE）',
            stored_sequence == 4 and stored_status == 'ACTIVE',
            f'序号={stored_sequence}，状态={stored_status}',
        )

        async def failing_post(_path: str, _payload: dict) -> dict:
            raise LicenseClientError('无法连接授权服务器。')

        service._post = failing_post
        try:
            await service.heartbeat()
        except LicenseClientError:
            pass

        async def revoked_post(_path: str, _payload: dict) -> dict:
            raise LicenseClientError('设备绑定已解除。', status_code=403, code='REVOKED')

        service._post = revoked_post
        try:
            await service.heartbeat()
        except LicenseClientError:
            pass
        # 被吊销后本地凭证已清空，恢复路径会走到「没有可用的恢复凭证」这一步。
        try:
            await service.recover()
        except LicenseClientError:
            pass
        # 确认绑定：读一次本地状态，再看要不要联网（节流窗口已过）。
        service._last_binding_confirm_at = 0.0
        await service.confirm_binding(force=True)

        threads = list(database.threads)

    check(
        'B4 授权路径的每一次同步查库都不在事件循环线程上（心跳成功/失败/吊销/恢复/确认绑定）',
        database.all_off_loop() and len(threads) >= 6,
        f'{len(threads)} 次开会话，线程 {sorted(set(threads))}（事件循环线程 {LOOP_THREAD}）',
    )


async def check_binding_confirm_single_flight() -> None:
    """B55：确认绑定的节流窗口必须「先占位再联网」，并发调用只发一次请求。

    修复前时间戳是在 ``finally`` 里补记的，因此十个并发调用会全部通过节流判定，
    一起排在 ``_heartbeat_lock`` 后面 —— 等待时间随标签页数量增长，这就是
    「多刷几下页面就卡住」的成因。这里用十个并发调用把差别测出来。
    """
    with tempfile.TemporaryDirectory(prefix='hb-confirm-') as tmp:
        (database, instance_id) = _license_fixture(Path(tmp))
        service = _bare_license_service(database, instance_id)
        calls: list[float] = []

        async def counting_heartbeat() -> dict:
            calls.append(time.monotonic())
            await asyncio.sleep(0.05)
            return {'status': 'ACTIVE'}

        service.heartbeat = counting_heartbeat

        # 窗口在联网之前就占住：任务跑到第一个 await 时时间戳已经更新。
        task = asyncio.create_task(service.confirm_binding())
        await asyncio.sleep(0)
        claimed_early = service._last_binding_confirm_at > 0
        await task

        await asyncio.gather(*[service.confirm_binding() for _ in range(9)])
        after_burst = len(calls)

        # 窗口推远一点后应当重新联网：证明节流不是「一次之后就再也不确认」。
        service._last_binding_confirm_at = 0.0
        await service.confirm_binding()
        after_window = len(calls)

        # 不需要联网时（未激活）不能白白占掉窗口。
        service._binding_needs_confirm = lambda: False
        service._last_binding_confirm_at = 0.0
        await service.confirm_binding()
        no_license_calls = len(calls)

    check(
        'B55 节流窗口在发起联网之前就被占住（并发调用不会一起排队）',
        claimed_early,
        f'联网前时间戳={service._last_binding_confirm_at:.3f}',
    )
    check(
        'B55 10 个并发确认只发一次联网请求',
        after_burst == 1,
        f'10 个并发调用发了 {after_burst} 次网络请求（修复前是 10 次）',
    )
    check(
        'B55 过了节流窗口后重新联网（节流不是「只确认这一次」）',
        after_window == 2,
        f'窗口推远后累计 {after_window} 次',
    )
    check(
        'B55 无需联网时（未激活）不占用后续窗口',
        no_license_calls == 2,
        f'累计 {no_license_calls} 次（不应新增）',
    )


async def check_page_routes_throttled_confirm() -> None:
    """B55：页面路由不得索要免节流的强制确认，同步查库也不许留在事件循环上。

    拼的是真应用（``create_app``），只把数据库与授权服务换成记录桩：三个页面各
    发一次请求，看授权服务是被怎么调的（有没有 force），以及会话校验开在哪个线程。
    """
    from datetime import datetime, timedelta, timezone

    from backend.app.database import Base, Database
    from backend.app.main import create_app
    from backend.app.models import LoginSession, User
    from backend.app.security import session_token_hash

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-page-confirm-') as tmp:
        inner = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        Base.metadata.create_all(inner.engine)
        with inner.session_factory() as session:
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
            session.add(
                LoginSession(
                    id_hash=session_token_hash('tok-live'),
                    user_id='u1',
                    created_at=now - timedelta(hours=1),
                    last_seen_at=now,
                    expires_at=now + timedelta(hours=1),
                )
            )
            session.commit()
        recording = _RecordingDatabase(inner)

        app = create_app()
        app.state.database = recording
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        confirms: list[dict] = []

        async def fake_confirm(**kwargs) -> None:
            confirms.append(kwargs)

        def make_status(recording_db: _RecordingDatabase):
            """造一个像真实现那样「要开一次同步会话」的 status 桩。

            真 ``LicenseService.status()`` 会开一个短会话读 LicenseState 那一行；
            桩若只返回一个常量，路由即使把它留在事件循环上也无从观测。
            """
            from sqlalchemy import select

            from backend.app.models import LicenseState

            def status() -> dict:
                with recording_db.session_factory() as session:
                    session.scalar(select(LicenseState).limit(1))
                return {'status': 'ACTIVE', 'editorAllowed': True}

            return status

        app.state.license_service = SimpleNamespace(
            confirm_binding=fake_confirm,
            # status 照着真实现的样子读一次 LicenseState：它本身是同步查库，
            # 路由若在原地调用，记录里就会多出一个「事件循环线程」的开会话。
            status=make_status(recording),
        )
        cookie = {app.state.settings.cookie_name: 'tok-live'}

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            home = await client.get('/', cookies=cookie)
            license_page = await client.get('/license', cookies=cookie)
            studio = await client.get('/3d-studio', cookies=cookie)

        forced = [item for item in confirms if item.get('force')]

    check(
        'B55 三个页面路由各确认一次，且都不要免节流的强制确认',
        len(confirms) == 3 and not forced,
        f'{len(confirms)} 次调用，其中带 force 的 {forced}',
    )
    check(
        'B55 页面路由照常放行（修好后不该把页面挡掉）',
        (home.status_code, license_page.status_code, studio.status_code) == (200, 303, 200),
        f'/{home.status_code} /license={license_page.status_code} /3d-studio={studio.status_code}',
    )
    check(
        'B55 页面路由的会话校验与状态读取都不在事件循环线程上',
        recording.all_off_loop(),
        f'开会话线程 {sorted(set(recording.threads))}（事件循环线程 {LOOP_THREAD}）',
    )


def check_export_rollback_error_chain() -> None:
    """B39：覆盖导出时「回滚也失败」，原始异常不能被顶掉。

    真的调 ``_install_export``（真目录、真 ZIP），把 ``_atomic_swap`` 换成
    「本目录内第 2、3 次替换失败」的桩：第 1 次是旧目录改名成 backup（成功），
    第 2 次是新目录就位（失败），第 3 次是回滚（也失败）。修复前抛出去的是回滚
    的 OSError，真正的原因与备份位置都查不到。
    """
    import zipfile

    from backend.app.api import studio3d

    with tempfile.TemporaryDirectory(prefix='hb-rollback-') as tmp:
        exports_dir = Path(tmp)
        settings = SimpleNamespace(studio3d_exports_dir=exports_dir)
        target = exports_dir / '户型图'
        target.mkdir()
        (target / 'old.png').write_bytes(b'old')

        archive = exports_dir / '.upload-test.zip'
        png_bytes = b'\x89PNG\r\n\x1a\n' + b'png-body'
        with zipfile.ZipFile(archive, 'w') as handle:
            handle.writestr('scene.json', '{}')
            handle.writestr('new.png', png_bytes)
        entries = list(studio3d._validate_archive(archive))
        if entries:
            # 先跑一次成功路径：证明这套装置本身是通的（不然失败断言没意义）。
            ok_dir = exports_dir / 'ok'
            ok_dir.mkdir()
            installed = studio3d._install_export(
                SimpleNamespace(studio3d_exports_dir=ok_dir), '户型图', archive, entries, False
            )
            check(
                'B39 正常覆盖导出照旧成功（装置本身可用）',
                installed is False and (ok_dir / '户型图' / 'new.png').read_bytes() == png_bytes,
                f'installed={installed}',
            )

        real_swap = studio3d._atomic_swap
        swaps: list[str] = []

        def flaky_swap(source: Path, destination: Path) -> None:
            if Path(destination).parent == exports_dir and Path(source).parent == exports_dir:
                swaps.append(Path(destination).name)
                if len(swaps) == 2:
                    raise OSError('模拟：新目录就位失败')
                if len(swaps) == 3:
                    raise OSError('模拟：回滚也失败')
            real_swap(source, destination)

        try:
            studio3d._atomic_swap = flaky_swap
            raised = None
            try:
                studio3d._install_export(settings, '户型图', archive, entries, True)
            except Exception as error:  # noqa: BLE001 - 这里就是要看抛出的那个异常
                raised = error
        finally:
            studio3d._atomic_swap = real_swap

        backups = [item for item in exports_dir.iterdir() if item.name.startswith('.previous-')]
        backup_kept = bool(backups) and (backups[0] / 'old.png').read_bytes() == b'old'
        message = str(raised)
        cause_ok = isinstance(getattr(raised, '__cause__', None), OSError) and '新目录就位失败' in str(raised.__cause__)

    check(
        'B39 回滚失败时抛出的是「替换失败 + 回滚失败」的合并错误（原始原因没被顶掉）',
        isinstance(raised, RuntimeError)
        and '新目录就位失败' in message
        and '回滚也失败' in message,
        f'{type(raised).__name__}: {message[:120]}',
    )
    check(
        'B39 异常链上保留原始异常（__cause__ 是那个 OSError）',
        cause_ok,
        f'cause={getattr(raised, "__cause__", None)!r}',
    )
    check(
        'B39 回滚失败时旧目录仍在隐藏备份里（数据没丢，提示里给出备份名）',
        backup_kept and '请手工恢复' in message,
        f'备份 {[item.name for item in backups]}，提示里带备份名={".previous-" in message}',
    )


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
    check_admin_session_criteria()
    check_display_token_expiry()
    check_websocket_viewer_credentials()
    await check_page_gates_end_to_end()
    await check_display_binding_guard()
    await check_runtime_task_relay()
    check_closure_scope_writes()
    check_access_criteria_single_source()
    check_login_password_verification_cost()
    await check_revoke_other_sessions_requires_valid_session()
    check_same_origin_scheme_pinning()
    check_request_security_parity()
    await check_stream_writes_offloaded()
    await check_export_route_offloads_work()
    await check_upload_route_offloads_work()
    await check_license_database_offloaded()
    await check_binding_confirm_single_flight()
    await check_page_routes_throttled_confirm()
    check_export_rollback_error_chain()
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
