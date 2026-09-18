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
from dataclasses import dataclass, replace
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


def _write_user_asset(assets: Path, asset_id: str) -> bytes:
    """造一份「只有一个图片文件」的用户素材（user_asset_file 认这个形状）。"""
    folder = assets / asset_id
    folder.mkdir(parents=True, exist_ok=True)
    content = b'\x89PNG\r\n\x1a\n' + b'a' * 32
    (folder / 'plan.png').write_bytes(content)
    return content


async def check_interaction3d_scoping() -> None:
    """B24/B25/B64：3D 舞台的两条兜底分支与设备改绑，都不能信「全局」那份状态。

    B24（背景图回退）：过去只问「全局 studio 草稿引用过这个 assetId 吗」。那份草稿是
    全机共用的一份，此刻编辑的可能是**别的项目**的户型 —— 绑项目 A 的展示页只要猜中或
    枚举 assetId 就能把别的项目的底图取走。现在只认本场景（快照 JSON 自己引用的，
    或随快照冻结的副本）；管理员额外保留草稿这条（它本来就不受素材可见范围限制）。

    B25（灯光/开关控制）：过去直接转发 HA，不校验实体是否真配在该控件上 —— 凡是这块屏
    可见的实体（同一设备上的兄弟实体、别的控件配的灯）都能被控制。现在与电视/空调/
    窗帘同一口径：中控设备必须给出项目与控件，且实体在该控件的灯光表里；管理员不受
    这道限制（编辑器预览未必带这两个字段，而它本来就是全权主体）。

    B64（改绑设备）：POST /pair 校验 display 能力，PATCH 不校验 —— 授权收回 display 后
    仍能把一台在用设备改绑到别的仪表盘（它的令牌还有效）。现在两边同一口径；但**吊销
    不受限**，那是回收动作，卡住只会让人没法收拾。
    """
    from fastapi import HTTPException

    from backend.app.access import ViewerPrincipal
    from backend.app.api import displays as displays_api
    from backend.app.database import Base, Database
    from backend.app.models import DisplayDevice, DisplayPairingCode, Project, ProjectDraft, User
    from backend.app.modules.interaction3d import api as scene_api
    from backend.app.modules.interaction3d.api import Interaction3dControlRequest
    from backend.app.schemas import DisplayDeviceUpdateRequest

    #: 设备名与项目 ID 都按真实约束来（projectId 在 schema 里是定长 36）。
    project_id = 'p' * 36
    other_project_id = 'q' * 36
    #: 草稿文档是脏数据的项目（B9 的同一类输入落到控制路径上）。
    dirty_project_id = 'r' * 36
    scene_id = _scene_id('1')
    component_id = 'c' * 36
    bound_entity = 'light.kitchen'
    sibling_entity = 'light.kitchen_2'
    own_asset = _scene_id('b')
    other_asset = _scene_id('c')
    frozen_asset = _scene_id('d')
    orphan_asset = _scene_id('e')

    class FlipFlopLicense:
        """可开关的授权桩：只对 display 这一档可拨，其余一律放行。"""

        def __init__(self) -> None:
            self.display_allowed = True

        def allows(self, code, database=None) -> bool:
            return self.display_allowed if code == 'display' else True

    with tempfile.TemporaryDirectory(prefix='hb-i3d-scope-') as tmp:
        root = Path(tmp)
        data_dir = root / 'data'
        assets = data_dir / 'user-assets'
        (data_dir / 'modules' / 'interaction3d' / 'scenes').mkdir(parents=True, exist_ok=True)
        _write_user_asset(assets, own_asset)
        _write_user_asset(assets, other_asset)
        _write_user_asset(assets, frozen_asset)
        _write_user_asset(assets, orphan_asset)

        # 场景快照：引用 A（自己的底图），其中一份另有一个「随快照冻结的副本」C。
        scene_path = data_dir / 'modules' / 'interaction3d' / 'scenes' / f'{scene_id}.json'
        scene_path.write_text(
            json.dumps({'scene': {'floors': [{'scene': {'background': {'assetId': f'user:{own_asset}'}}}]}}),
            encoding='utf-8',
        )
        scene_path.with_name(f'{scene_id}-{frozen_asset}.png').write_bytes(b'\x89PNG\r\n\x1a\n' + b'c' * 32)
        # 老格式快照（没有 floors，整份 scene 就是唯一一层）：helper 必须兼容它，
        # 否则老快照的底图会被判成「没被引用」而 404。
        legacy_scene_id = _scene_id('2')
        (scene_path.parent / f'{legacy_scene_id}.json').write_text(
            json.dumps({'scene': {'background': {'assetId': f'user:{own_asset}'}}}),
            encoding='utf-8',
        )
        # 全局草稿：引用的是**别的项目**的底图（B24 的攻击面）。
        draft_path = data_dir / 'studio3d' / 'draft.json'
        draft_path.parent.mkdir(parents=True, exist_ok=True)
        draft_path.write_text(
            json.dumps({'scene': {'floors': [{'scene': {'background': {'assetId': f'user:{other_asset}'}}}]}}),
            encoding='utf-8',
        )

        database = Database(f'sqlite:///{root / "app.db"}')
        Base.metadata.create_all(database.engine)
        component = {
            'id': component_id,
            'type': 'interaction3d',
            'properties': {
                'sceneId': scene_id,
                'lights': [
                    {'id': 'lamp-1', 'entityId': bound_entity},
                    # 纯装饰的灯：entityId 为空，不该因此放行任何实体。
                    {'id': 'lamp-2', 'entityId': ''},
                ],
            },
        }
        document = {
            'projectId': project_id,
            'pages': [
                {
                    'panels': [
                        component,
                        # 老格式快照同样要挂在这个项目的文档里，否则连归属校验都过不了
                        # （那条门禁与背景来源无关，这里只是把读取路径摆出来）。
                        {
                            'id': 'legacy-panel',
                            'type': 'interaction3d',
                            'properties': {'sceneId': legacy_scene_id, 'lights': []},
                        },
                    ]
                }
            ],
        }
        with database.session_factory() as session:
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
        with database.session_factory() as session:
            session.add(Project(id=project_id, name='示例', slug='proj-a', created_by='u1'))
            session.add(Project(id=other_project_id, name='别的', slug='proj-b', created_by='u1'))
            session.add(Project(id=dirty_project_id, name='坏了', slug='proj-c', created_by='u1'))
            session.commit()
        with database.session_factory() as session:
            session.add(ProjectDraft(project_id=project_id, updated_by='u1', document_json=json.dumps(document)))
            session.add(
                ProjectDraft(
                    project_id=other_project_id,
                    updated_by='u1',
                    document_json=json.dumps({'projectId': other_project_id, 'pages': []}),
                )
            )
            # 脏草稿：不是合法 JSON。控制路径不该因此回 500（B9 的同一类问题）。
            session.add(ProjectDraft(project_id=dirty_project_id, updated_by='u1', document_json='{"projectId": '))
            session.add(
                DisplayPairingCode(
                    id='pairing-1',
                    code_hash='h',
                    encrypted_code='e',
                    name='客厅中控',
                    project_id=project_id,
                    created_by='u1',
                    is_enabled=True,
                )
            )
            session.add(
                DisplayDevice(
                    id='device-1',
                    pairing_code_id='pairing-1',
                    token_hash='t',
                    name='客厅中控',
                    project_id=project_id,
                )
            )
            session.commit()

        license_stub = FlipFlopLicense()
        settings = SimpleNamespace(
            data_dir=data_dir,
            user_assets_dir=assets,
            studio3d_draft_path=draft_path,
            license_required=False,
            # 配对码密文要用到这把钥匙；给个临时路径，创建路径才走得完 ——
            # 否则「能力码没接上」的变异只会把路由炸成异常，观测不到断言变红。
            display_pairing_key_path=root / 'pairing.key',
        )
        app_state = SimpleNamespace(
            database=database,
            license_service=license_stub,
            settings=settings,
            # 创建配对码成功路径会往全局日志里写一条；能力码变异时也要能走完整条路，
            # 这样断言才会以「通过了」变红，而不是被属性错误炸成崩栈。
            global_log=SimpleNamespace(append=lambda *args, **kwargs: None),
        )
        request = SimpleNamespace(app=SimpleNamespace(state=app_state))
        display_viewer = ViewerPrincipal(display=SimpleNamespace(project_id=project_id))
        admin_viewer = ViewerPrincipal(user=SimpleNamespace(id='u1'))
        dirty_viewer = ViewerPrincipal(display=SimpleNamespace(project_id=dirty_project_id))

        def fetch(asset_id: str, viewer, scene: str = scene_id) -> str:
            """调一次背景路由，返回「取到了什么」（HTTPException 折成状态码）。"""
            try:
                response = scene_api.get_background(
                    scene_id=scene, asset_id=asset_id, request=request, viewer=viewer, projectId=project_id
                )
                return Path(response.path).name
            except HTTPException as error:
                return f'{error.status_code}'

        # ① 本场景自己引用的底图：副本缺失时从素材库回源，照旧可取。
        own_result = fetch(own_asset, display_viewer)
        # ② 随快照冻结的副本：与草稿/引用无关，仍然直接给（它是这个场景自己的文件）。
        frozen_result = fetch(frozen_asset, display_viewer)
        # ③ 老格式快照（无 floors）：同样认本场景引用的底图。
        legacy_result = fetch(own_asset, display_viewer, scene=legacy_scene_id)
        # ④ 只在**全局草稿**里出现的底图：中控设备拿不到（修复前会拿到）。
        other_result = fetch(other_asset, display_viewer)
        # ⑤ 管理员保留草稿这条：编辑器刚换、还没冻结的底图照旧能显示。
        other_admin_result = fetch(other_asset, admin_viewer)
        # ⑥ 谁都没引用的素材：两个身份都不给。
        orphan_result = fetch(orphan_asset, display_viewer)
        orphan_admin_result = fetch(orphan_asset, admin_viewer)

        real_call_service = scene_api.call_service
        ha_calls: list[str] = []

        async def fake_call_service(payload, request, database, viewer) -> dict:
            ha_calls.append(payload.entity_id)
            return {'ok': True, 'entity': payload.entity_id}

        scene_api.call_service = fake_call_service
        try:

            async def control(entity_id: str, viewer, target_project: str, target_component: str) -> str:
                """调一次控制路由，把结果折成「通过」或状态码。"""
                payload = Interaction3dControlRequest(
                    domain='light',
                    service='turn_on',
                    entityId=entity_id,
                    projectId=target_project,
                    componentId=target_component,
                )
                with database.session_factory() as session:
                    try:
                        await scene_api.control_light(
                            payload=payload, request=request, database=session, viewer=viewer
                        )
                        return '通过'
                    except HTTPException as error:
                        return f'{error.status_code}'
                    # 兜底：把意外异常也折成观测值。否则「本该 403 的那条路崩了」只会
                    # 以崩栈收场，牙齿测试看不到断言变红（崩栈只说明路径炸了）。
                    except Exception as error:  # noqa: BLE001
                        return f'崩:{type(error).__name__}'

            bound_result = await control(bound_entity, display_viewer, project_id, component_id)
            sibling_result = await control(sibling_entity, display_viewer, project_id, component_id)
            cross_project_result = await control(bound_entity, display_viewer, other_project_id, component_id)
            missing_location_result = await control(bound_entity, display_viewer, '', '')
            unknown_component_result = await control(bound_entity, display_viewer, project_id, 'z' * 36)
            admin_preview_result = await control(bound_entity, admin_viewer, '', '')
            dirty_draft_result = await control(bound_entity, dirty_viewer, dirty_project_id, component_id)
        finally:
            scene_api.call_service = real_call_service

        def patch_device(allowed: bool, target_project: str) -> str:
            """调一次改绑路由，返回结果状态。"""
            license_stub.display_allowed = allowed
            payload = DisplayDeviceUpdateRequest(projectId=target_project)
            with database.session_factory() as session:
                user = session.get(User, 'u1')
                try:
                    displays_api.update_display_device(
                        device_id='device-1',
                        payload=payload,
                        request=request,
                        database=session,
                        user=user,
                    )
                    return '通过'
                except HTTPException as error:
                    return f'{error.status_code}'

        rebind_without_license = patch_device(False, other_project_id)
        with database.session_factory() as session:
            project_after_blocked = session.get(DisplayDevice, 'device-1').project_id
        rebind_with_license = patch_device(True, other_project_id)
        with database.session_factory() as session:
            project_after_allowed = session.get(DisplayDevice, 'device-1').project_id
        # 吊销动作不受能力码限制：授权收回后仍要能清掉一台设备。
        license_stub.display_allowed = False
        with database.session_factory() as session:
            displays_api.revoke_display_device('device-1', database=session, user=session.get(User, 'u1'))
            revoked_at = session.get(DisplayDevice, 'device-1').revoked_at

        # 创建配对码那一处（同一档能力码）也钉一下：三处「把中控链路往外开」的动作
        # 必须同一口径，否则牙齿测试里那条变异替换的是哪一处都分不清。
        license_stub.display_allowed = False
        with database.session_factory() as session:
            try:
                displays_api.create_pairing_code(
                    payload=displays_api.DisplayPairingCodeRequest(projectId=project_id, name='测试码'),
                    request=request,
                    database=session,
                    user=session.get(User, 'u1'),
                )
                create_pairing_result = '通过'
            except HTTPException as error:
                create_pairing_result = f'{error.status_code}'
        license_stub.display_allowed = True
        check(
            'B64 创建配对码同样要求 display 能力（创建/改绑/配对三处一条口径）',
            create_pairing_result == '403',
            f'结果 {create_pairing_result}',
        )
        check(
            'B24 本场景自己引用的底图（副本缺失）仍从素材库回源',
            own_result == 'plan.png',
            f'取到 {own_result}',
        )
        check(
            'B24 随快照冻结的副本照旧直接给（它属于这个场景）',
            frozen_result == f'{scene_id}-{frozen_asset}.png',
            f'取到 {frozen_result}',
        )
        check(
            'B24 老格式快照（无 floors）的底图也认（读取端两代结构都兼容）',
            legacy_result == 'plan.png',
            f'取到 {legacy_result}',
        )
        check(
            'B24 只在全局草稿里出现的底图，中控设备拿不到（跨项目的那条路被堵上）',
            other_result == '404',
            f'取到 {other_result}（修复前会拿到别的项目的底图）',
        )
        check(
            'B24 管理员仍可取草稿里引用过的底图（编辑器刚换、还没冻结时不误伤）',
            other_admin_result == 'plan.png',
            f'取到 {other_admin_result}',
        )
        check(
            'B24 谁都没引用的素材两个身份都不给',
            orphan_result == '404' and orphan_admin_result == '404',
            f'中控={orphan_result} 管理员={orphan_admin_result}',
        )
        check(
            'B25 配在这个控件上的灯照旧可以控制',
            bound_result == '通过',
            f'结果 {bound_result}',
        )
        check(
            'B25 同一设备上的兄弟实体（没配到这个控件）被拒 403',
            sibling_result == '403',
            f'结果 {sibling_result}（修复前会直接转发给 HA）',
        )
        check(
            'B25 声明别的仪表盘直接被拒 403（改不掉项目就换不到别的屏）',
            cross_project_result == '403',
            f'结果 {cross_project_result}',
        )
        check(
            'B25 中控设备不带项目/控件信息回 422（不是悄悄退回「只看可见范围」）',
            missing_location_result == '422',
            f'结果 {missing_location_result}',
        )
        check(
            'B25 控件 ID 不存在时同样按「没配到这个控件」拒绝',
            unknown_component_result == '403',
            f'结果 {unknown_component_result}',
        )
        check(
            'B25 管理员预览不带定位字段照旧放行（不误伤编辑器）',
            admin_preview_result == '通过',
            f'结果 {admin_preview_result}',
        )
        check(
            'B25 脏草稿（document_json 不是合法 JSON）下回 403 而不是 500',
            dirty_draft_result == '403',
            f'结果 {dirty_draft_result}',
        )
        check(
            'B25 只有灯光表里真正绑定的那一条实体进了 HA（空 entityId 的装饰灯没被当成通配）',
            ha_calls == [bound_entity, bound_entity],
            f'HA 调用 {ha_calls}',
        )
        check(
            'B64 授权收回 display 后改绑被拒 403，且设备绑定没被改动',
            rebind_without_license == '403' and project_after_blocked == project_id,
            f'结果 {rebind_without_license}，绑定={project_after_blocked}',
        )
        check(
            'B64 授权正常时改绑照旧成功（不是一刀切拒绝）',
            rebind_with_license == '通过' and project_after_allowed == other_project_id,
            f'结果 {rebind_with_license}，绑定={project_after_allowed}',
        )
        check(
            'B64 吊销不受能力码限制（回收动作不该被卡住）',
            revoked_at is not None,
            f'revoked_at={revoked_at}',
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


def _request_with_chunks(
    app: Any,
    path: str,
    headers: dict[str, str],
    chunks: list[bytes],
    *,
    method: str = 'POST',
    query_string: str = '',
):
    """拼一个真的 ``Request``（含可迭代的请求体），用来直接调路由函数。

    不经过 ASGI 应用是刻意的：这几条检查要观测「同步工作跑在哪个线程」，
    起一个完整的应用只会多出无关的中间件与生命周期，反而看不清。

    ``method`` / ``query_string`` 是给媒体代理那几条检查用的：它们走 GET，
    且要看查询串（``hb_live``）对缓存分支的影响。
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
        'method': method,
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode(),
        'query_string': query_string.encode(),
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


def _license_service_with_lease(tmp: Path, **overrides) -> tuple[Any, Any]:
    """建一个「租约载荷可定制」的授权服务（真判定逻辑，只换验签器）。

    验签器换成桩是必须的（真实现要真密钥），但被判定的那段代码全是真的；
    载荷里的时间与序号由调用方给，这样「时钟偏移」「序号更新」这类边界才能被
    精确摆出来，而不是靠等真实时间流过。
    """
    from datetime import datetime, timedelta, timezone

    # 调用方会在同一个临时根目录下开多个子目录（每个用例一份库），先建好 ——
    # sqlite 不会替我们创建父目录。
    tmp.mkdir(parents=True, exist_ok=True)
    (database, instance_id) = _license_fixture(tmp)
    service = _bare_license_service(database, instance_id)
    now = datetime.now(timezone.utc)
    payload = {
        'expiresAt': (now + timedelta(hours=1)).isoformat(),
        'issuedAt': now.isoformat(),
        # 与 _license_fixture 里那一行的备忘（3）刻意不同：B30 那条检查要的就是这个差异。
        'leaseSequence': 4,
        'activationCodeId': 'lic-1',
        'leaseId': 'lease-1',
        'sessionId': 'sess-1',
        'features': ['all'],
    }
    payload.update(overrides)
    service.verifier = SimpleNamespace(verify=lambda _lease, _instance: dict(payload))
    return (database, service)


def _stored_lease_sequence(database: Any) -> int:
    """读一下库里记着的租约序号（自检自己的读库无所谓线程，直接读）。"""
    from sqlalchemy import select

    from backend.app.models import LicenseState

    with database.session_factory() as session:
        return int(session.scalar(select(LicenseState.lease_sequence)))


def check_lease_expiry_clock_skew() -> None:
    """B29：租约到期判定必须与签发时间判定用同一个时钟偏移容差。

    只在到期这一半硬比 ``now``，会让本机时钟快几秒的安装提前把租约判成过期：
    心跳间隔是分钟级（默认 300 秒），于是出现「服务端认为有效、本机把自己关成
    完全受限」的窗口，期间所有门禁一口回绝（这正是「完全受限」最常见的成因）。

    判据按「偏移量」摆：租约刚过期 10 秒（容差 30 秒内）必须放行，过期 60 秒
    （超出容差）必须拦下 —— 只放开容差而不封口的话，第二条会红。
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-lease-skew-') as tmp:
        (database, service) = _license_service_with_lease(
            Path(tmp), expiresAt=(now - timedelta(seconds=10)).isoformat()
        )
        allowed_within_skew = service.allows()
        reason_within_skew = (service._event_failures.get('本地校验') or {}).get('reason')

        (database_late, service_late) = _license_service_with_lease(
            Path(tmp) / 'late', expiresAt=(now - timedelta(seconds=60)).isoformat()
        )
        allowed_beyond_skew = service_late.allows()
        reason_beyond_skew = (service_late._event_failures.get('本地校验') or {}).get('reason')

    check(
        'B29 租约刚过期几秒（时钟偏移容差内）照旧放行，不再直接「完全受限」',
        allowed_within_skew is True and reason_within_skew is None,
        f'allowed={allowed_within_skew} 失败原因={reason_within_skew}',
    )
    check(
        'B29 过期明显超出容差时照旧拦下（容差不是「永不过期」）',
        allowed_beyond_skew is False and '已到期' in str(reason_beyond_skew),
        f'allowed={allowed_beyond_skew} 失败原因={reason_beyond_skew}',
    )


def check_lease_sequence_selfheal() -> None:
    """B30：序号判据是「不比备忘更旧」，更大要回写自愈，更旧才拒绝。

    过去要求与库里的序号**完全相等**。它想守的是「不能拿一份更旧的租约顶替」
    （防重放），而写成相等之后，任何让两处不同步的状态 —— 库被回滚/恢复、行被
    外部修过 —— 都变成终局 INVALID：界面上没有任何恢复入口。

    这里把三种关系都摆出来：更新（放行 + 回写）、相等（放行）、更旧（拒绝）。
    """
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-lease-seq-') as tmp:
        # ① 签名序号（4）比库里的备忘（3）新：放行，并把备忘对齐（请求级会话收尾提交）。
        (database, service) = _license_service_with_lease(Path(tmp) / 'newer')
        with database.session_factory() as session:
            allowed_newer = service.allows(database=session)
            session.commit()
        sequence_after = _stored_lease_sequence(database)

        # ② 启动校验这条路径自己会提交，同样要把备忘对齐。
        (database_start, service_start) = _license_service_with_lease(
            Path(tmp) / 'startup', leaseSequence=9
        )
        with database_start.session_factory() as session:
            from sqlalchemy import select

            from backend.app.models import LicenseState

            state = session.scalar(select(LicenseState).limit(1))
            service_start._validate_saved_state(state, session)
        sequence_after_startup = _stored_lease_sequence(database_start)

        # ③ 签名序号比备忘更旧：拒绝（手上这份租约是被换下来的旧货）。
        (database_old, service_old) = _license_service_with_lease(
            Path(tmp) / 'older', expiresAt=(now + timedelta(hours=1)).isoformat()
        )
        with database_old.session_factory() as session:
            from sqlalchemy import select

            from backend.app.models import LicenseState

            state = session.scalar(select(LicenseState).limit(1))
            state.lease_sequence = 9
            session.commit()
            allowed_older = service_old.allows(database=session)
        reason_older = (service_old._event_failures.get('本地校验') or {}).get('reason')

    check(
        'B30 签名序号比备忘更新时照旧放行（不再要求完全相等）',
        allowed_newer is True,
        f'allowed={allowed_newer}',
    )
    check(
        'B30 更大的序号会回写成新备忘（请求路径靠会话收尾提交）',
        sequence_after == 4,
        f'库里序号={sequence_after}（期望 4）',
    )
    check(
        'B30 启动校验同样回写备忘（下一次校验就直接相等了）',
        sequence_after_startup == 9,
        f'库里序号={sequence_after_startup}（期望 9）',
    )
    check(
        'B30 签名序号比备忘更旧时照旧拒绝（防重放这一半没被放宽掉）',
        allowed_older is False and '更旧' in str(reason_older),
        f'allowed={allowed_older} 失败原因={reason_older}',
    )


def check_retry_after_counts_down() -> None:
    """B63：429 回的 ``Retry-After`` 必须是「还要等多久」，不是整段封禁时长。

    ``block_seconds`` 从被封那一刻起就固定了，而调用方是在封禁**中途**某刻被拦下的：
    回总时长等于让客户端把已经等过的那一段再等一遍（封 10 分钟、已经等了 9 分钟，
    还被告知「再等 10 分钟」）。这里用可拨的时钟把三个时刻摆出来：刚封上、封了
    9 分钟、越过封禁 —— 剩余时间必须分别是满额、1 分钟左右、0。
    """
    from backend.app import auth_limiter
    from backend.app.auth_limiter import BoundedAttemptLimiter, LoginAttemptLimiter

    clock = {'now': 1000.0}
    real_monotonic = auth_limiter.monotonic
    auth_limiter.monotonic = lambda: clock['now']
    try:
        limiter = LoginAttemptLimiter(1, 300, 600)
        limiter.record_failure('key')
        at_block = limiter.retry_after('key')
        clock['now'] += 540
        near_release = limiter.retry_after('key')
        clock['now'] += 61
        after_release = limiter.retry_after('key')
        block_seconds = limiter.block_seconds
        untouched = limiter.retry_after('never-seen')

        bounded = BoundedAttemptLimiter(1, 300, 600, max_keys=4)
        bounded.record_failure('code')
        bounded_at_block = bounded.retry_after('code')
        clock['now'] += 540
        bounded_near_release = bounded.retry_after('code')

        # 真路由：登录被拦时回带的必须是剩余时间，而不是 600。
        fixture = _build_login_fixture(
            Path(tempfile.mkdtemp(prefix='hb-retry-after-')),
            SimpleNamespace(user_id='u1', username='admin', password_hash='sentinel-hash'),
        )
        fixture.request.app.state.login_limiter = LoginAttemptLimiter(1, 300, 600)
        clock['now'] = 5000.0

        def attempt() -> str:
            from fastapi import HTTPException

            from backend.app.api.auth import login as login_route
            from backend.app.schemas import LoginRequest

            try:
                login_route(
                    payload=LoginRequest(username='admin', password='wrong-horse'),
                    request=fixture.request,
                    response=fixture.response,
                    database=fixture.session,
                )
                return '通过'
            except HTTPException as error:
                return f'{error.status_code}:{(error.headers or {}).get("Retry-After")}'

        first = attempt()
        second = attempt()
        clock['now'] += 540
        third = attempt()
        clock['now'] += 61
        fourth = attempt()

        # 同一个判据的其它调用点：配对路由（三处）与初始化守卫。它们此前各自
        # 也在回 block_seconds，因此一并断言 —— 只改一处的话，这三条会红。
        from backend.app.api.displays import (
            PAIRING_SHARED_ADDRESS_LIMIT,
            enforce_pair_rate_limit,
            note_pair_failure,
        )
        from backend.app.setup_guard import SetupGuard
        from starlette.requests import Request

        clock['now'] = 9000.0
        pairing_app = SimpleNamespace(
            state=SimpleNamespace(
                login_limiter=LoginAttemptLimiter(5, 900, 900),
                pairing_shared_limiter=LoginAttemptLimiter(*PAIRING_SHARED_ADDRESS_LIMIT),
                pairing_limiter=LoginAttemptLimiter(1000, 60, 60),
                pairing_code_limiter=LoginAttemptLimiter(5, 900, 900),
            )
        )
        pairing_request = SimpleNamespace(app=pairing_app)
        (pairing_limiter, pairing_key) = enforce_pair_rate_limit(
            pairing_request, '203.0.113.9', per_client=False
        )
        for _ in range(PAIRING_SHARED_ADDRESS_LIMIT[0]):
            note_pair_failure(pairing_request, pairing_limiter, pairing_key, 'code-hash')
        clock['now'] += PAIRING_SHARED_ADDRESS_LIMIT[2] - 20

        def pairing_retry_after() -> str:
            from fastapi import HTTPException

            try:
                enforce_pair_rate_limit(pairing_request, '203.0.113.9', per_client=False)
                return '通过'
            except HTTPException as error:
                return str((error.headers or {}).get('Retry-After'))

        pairing_blocked = pairing_retry_after()

        setup_app = SimpleNamespace(
            state=SimpleNamespace(login_limiter=LoginAttemptLimiter(1, 300, 600))
        )
        setup_request = Request(
            {
                'type': 'http',
                'method': 'POST',
                'path': '/api/v1/setup',
                'query_string': b'',
                'scheme': 'http',
                'server': ('homeos.test', 80),
                'headers': [(b'host', b'homeos.test')],
                # 非回环对端：本机直连那条放行分支不生效，才会走到限流。
                'client': ('203.0.113.9', 4444),
                'app': setup_app,
            }
        )
        guard = SetupGuard(Path(tempfile.mkdtemp(prefix='hb-setup-guard-')))
        clock['now'] = 20000.0

        def setup_attempt() -> str:
            from fastapi import HTTPException

            try:
                guard.authorize(setup_request, setup_token='not-the-token')
                return '通过'
            except HTTPException as error:
                return f'{error.status_code}:{(error.headers or {}).get("Retry-After")}'

        setup_first = setup_attempt()
        setup_second = setup_attempt()
        clock['now'] += 540
        setup_third = setup_attempt()
    finally:
        auth_limiter.monotonic = real_monotonic

    check(
        'B63 刚封上时剩余时间等于整段时长（此时两者确实一样）',
        at_block == 600 and block_seconds == 600,
        f'剩余={at_block} block_seconds={block_seconds}',
    )
    check(
        'B63 封禁中途回的是一分钟左右的剩余时间，不是整段 600 秒',
        near_release == 60,
        f'封了 540 秒后剩余={near_release}（旧实现回的是 {block_seconds}）',
    )
    check(
        'B63 越过封禁时刻后剩余时间归零（调用方据此判断「不用再等」）',
        after_release == 0 and untouched == 0,
        f'越过封禁={after_release} 从未失败的键={untouched}',
    )
    check(
        'B63 带键上限的那一层（配对码用的就是它）也透传剩余时间',
        bounded_at_block == 600 and bounded_near_release == 60,
        f'{bounded_at_block} → {bounded_near_release}',
    )
    check(
        'B63 登录被拦时回带的 Retry-After 是剩余时间（第二次拦下时仍是满额，因为刚封上）',
        first == '401:None' and second == '429:600',
        f'第一次={first} 第二次={second}',
    )
    check(
        'B63 客户端按 Retry-After 等满就能过（不是被要求再等一整段）',
        third == '429:60' and fourth == '401:None',
        f'封了 540 秒后={third} 再等到期后={fourth}',
    )
    check(
        'B63 配对路由回带的也是剩余时间（共享桶封 120 秒、已过 100 秒 → 20）',
        pairing_blocked == '20',
        f'Retry-After={pairing_blocked}（整段是 {PAIRING_SHARED_ADDRESS_LIMIT[2]}）',
    )
    check(
        'B63 初始化守卫回带的也是剩余时间（封 600 秒、已过 540 秒 → 60）',
        setup_first == '403:None' and setup_second == '429:600' and setup_third == '429:60',
        f'首次={setup_first} 刚封上={setup_second} 封了 540 秒后={setup_third}',
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


def _app_with_recording_log(tmp: Path, *, tally_keys: int | None = None):
    """拼一个真应用，把全局日志换成内存记录器（B62 的两条路径都要看它写没写）。

    参数:
        tmp: 临时目录（数据库落在这里）。
        tally_keys: 覆盖 ``RepeatedErrorTally.MAX_KEYS``，好在几个请求内看到键上限生效。

    返回:
        (app, 记录器)。记录器有 ``entries``（按写入顺序）与 ``_lock``（限流器要用）。
    """
    from backend.app.global_log import RepeatedErrorTally
    from backend.app.main import create_app

    class _RecordingLog:
        """只记不落盘的 global_log 替身：断言「写了什么」比断言磁盘更直接。"""

        def __init__(self) -> None:
            self.entries: list[dict] = []
            self._lock = threading.Lock()
            self.retention_days = 7

        def append(self, level, source, category, message, **kwargs):
            """记一条事件；返回形状与真实现一致（调用方会读 id/timestamp）。"""
            event = {
                'level': level,
                'source': source,
                'category': category,
                'message': message,
                **kwargs,
            }
            self.entries.append(event)
            return event

        def list_events(self, **kwargs) -> list:
            """读回记录（真实现支持筛选，这里只需要全量）。"""
            return list(self.entries)

        def storage_status(self) -> dict:
            """存储状态桩。"""
            return {}

        def stop(self) -> None:
            """无需收尾。"""

    app = create_app()
    log = _RecordingLog()
    app.state.global_log = log
    app.state.error_tally = RepeatedErrorTally()
    if tally_keys is not None:
        app.state.error_tally.MAX_KEYS = tally_keys
    # 免得「检测到转发头但没配可信代理」那条一次性告警混进断言。
    app.state.proxy_warning_logged = True
    if not hasattr(app.state, 'database'):
        from backend.app.database import Base, Database

        database = Database(f'sqlite:///{tmp / "app.db"}')
        Base.metadata.create_all(database.engine)
        app.state.database = database
    return (app, log)


async def check_anonymous_4xx_merged() -> None:
    """B62：匿名 4xx 与 5xx 的写入量必须分开对待。

    这两条路径原先都被写成「一次请求一行，说明里带完整路径」，而 4xx 恰恰是外部
    能随手编路径的场景：一次目录扫描就把日志文件（上限 5 MB）写满，把真正的业务
    错误挤掉。修复后 4xx 按「路径形态」合并计数，5xx 仍逐条记（那是我们自己的
    bug，要按 requestId 定位）。这条检查真的发请求，因此同时验证了接线。
    """
    from fastapi import HTTPException

    from backend.app.global_log import RepeatedErrorTally

    # 1) 形态归一：纯数字段与长十六进制段（uuid / 哈希）整段折成占位符，别的不动；
    #    段数超上限（5 段）后截断，让「一路编更深的路径」也归到同一个形态。
    shapes = {
        '/api/v1/hls/abc123def456': '/api/v1/hls/{id}',
        '/api/v1/projects/42': '/api/v1/projects/{id}',
        '/api/v1/v2/things': '/api/v1/v2/things',
        '/': '/',
        '/api/v1/a/b/c/d/e/f': '/api/v1/a/b/c',
    }
    wrong = {
        path: RepeatedErrorTally.shape_path(path)
        for path, expected in shapes.items()
        if RepeatedErrorTally.shape_path(path) != expected
    }
    check(
        'B62 路径形态归一：数字与长十六进制段折叠，版本号一类短段不受影响',
        not wrong,
        f'不符 {wrong}' if wrong else f'{len(shapes)} 条样例全部符合',
    )

    # 2) 窗口语义：首次写一条，窗口内只计数，窗口滚动时把累计次数补写出来。
    now = [1000.0]
    tally = RepeatedErrorTally(clock=lambda: now[0])
    first = tally.note('GET', 404, '/api/v1/scan/1')
    merged = [tally.note('GET', 404, f'/api/v1/scan/{index}') for index in range(2, 20)]
    now[0] += RepeatedErrorTally.WINDOW_SECONDS
    rollover = tally.note('GET', 404, '/api/v1/scan/20')
    check(
        'B62 同形态首次立刻写一条（运维要马上看见，不是攒到最后）',
        isinstance(first, str) and '后续只计数' in first,
        f'{first!r}',
    )
    check(
        'B62 同窗口内的重复只计数、不再落盘（这就是「降级为计数」）',
        18 <= len(merged) <= 19 and all(item is None for item in merged),
        f'19 次重复里写了 {sum(1 for item in merged if item is not None)} 条',
    )
    check(
        'B62 窗口滚动时补写累计次数（计数不会随窗口一起丢掉）',
        bool(rollover) and '累计 19 次' in str(rollover),
        f'{rollover!r}',
    )

    # 3) 键上限：形态再多也只留「每个形态一条 + 一条其他」。
    limited = RepeatedErrorTally(clock=lambda: now[0])
    limited.MAX_KEYS = 3
    written = [
        limited.note('GET', 404, f'/api/v1/{name}')
        for name in ('alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta')
    ]
    check(
        'B62 形态数不随请求量增长：超出上限后并进「其他形态」一条',
        sum(1 for item in written if item is not None) == 4
        and sum(1 for item in written if item is not None and '其他形态' in item) == 1,
        f'6 种形态写了 {sum(1 for item in written if item is not None)} 条：{[item for item in written if item]}',
    )

    # 4) 端到端：真应用 + 真中间件，20 次扫描只落一条、5xx 仍是逐条。
    with tempfile.TemporaryDirectory(prefix='hb-tally-') as tmp:
        (app, log) = _app_with_recording_log(Path(tmp), tally_keys=3)

        class _BrokenDatabase:
            """一碰就炸的数据库替身：用来制造真实的 500（而不是伪造一个 500 响应）。

            抛的是 ``HTTPException(500)``：它会被应用交给异常处理器变成**响应**，
            因此走的是「诊断中间件看到 5xx 响应」那条路径 —— 与「异常直接穿过中间件」
            那条路不同，这里要验证的正是前者不被合并计数。
            """

            def __getattr__(self, name):
                """依赖取任何属性（会话工厂 / 引擎）都抛 500 → 中间件记成一条 5xx。"""
                raise HTTPException(status_code = 500, detail = f'自检用的假故障（取 {name}）')

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            for index in range(20):
                await client.get(f'/api/v1/scan/{index}')
            for name in ('alpha', 'beta', 'gamma', 'delta', 'epsilon'):
                await client.get(f'/api/v1/{name}')
            # 5xx：把依赖弄炸，让服务端真的自己出错三次。
            # 用配对接口（匿名可访问、又不是日志端点本身 —— 日志端点不写自己的日志）。
            app.state.database = _BrokenDatabase()
            boom_status = [
                (
                    await client.post(
                        '/api/v1/displays/pair',
                        headers={'origin': 'http://app.test'},
                        json={'code': '123456'},
                    )
                ).status_code
                for _ in range(3)
            ]

    warnings = [entry for entry in log.entries if entry['level'] == 'warning' and '接口返回错误' in entry['message']]
    # 5xx 走的是「未捕获异常」分支：一条一条记，且带堆栈（与 4xx 的合并计数相对）。
    errors = [entry for entry in log.entries if entry['level'] == 'error' and 'displays/pair' in entry['message']]
    scan_warnings = [entry for entry in warnings if 'scan/{id}' in entry['message']]
    check(
        'B62 20 次同形态扫描只落一条日志（修复前是 20 条）',
        len(scan_warnings) == 1 and any('其他形态' in entry['message'] for entry in warnings),
        f'{len(scan_warnings)} 条扫描形态 / 共 {len(warnings)} 条：{[entry["message"][:40] for entry in warnings]}',
    )
    check(
        'B62 5xx 仍逐条记且带堆栈（合并只针对 4xx，服务端自己的错不许被折叠成计数）',
        boom_status == [500, 500, 500]
        and len(errors) == 3
        and all('自检用的假故障' in str(entry.get('details') or '') for entry in errors),
        f'{boom_status}，{len(errors)} 条 5xx 日志，带堆栈 {sum(1 for entry in errors if entry.get("details"))} 条',
    )


async def check_public_events_marked_and_capped() -> None:
    """B62：无需登录的日志通道要能一眼认出「这条是外部上报的」。

    ``/logs/public-events`` 收的是未登录页面写的文本，却进的是后台审计日志。
    修复后统一加来源标记、把长度上限收紧到「够定位异常」的量级，并把匿名配额压到
    10 条/分钟。这条检查跑真路由 + 真日志存储，避免只验证常量。
    """
    from fastapi import FastAPI

    from backend.app.api.global_logs import (
        ANONYMOUS_CLIENT_LOG_PER_MINUTE,
        PUBLIC_EVENT_DETAILS_LIMIT,
        PUBLIC_EVENT_MARKER,
        PUBLIC_EVENT_MESSAGE_LIMIT,
    )
    from backend.app.api.global_logs import router as global_logs_router
    from backend.app.config import load_settings
    from backend.app.database import Base, Database
    from backend.app.global_log import GlobalLogStore

    with tempfile.TemporaryDirectory(prefix='hb-public-log-') as tmp:
        root = Path(tmp)
        database = Database(f'sqlite:///{root / "app.db"}')
        Base.metadata.create_all(database.engine)
        store = GlobalLogStore(root / 'data')
        app = FastAPI()
        app.include_router(global_logs_router, prefix='/api/v1')
        app.state.database = database
        app.state.global_log = store
        # 身份解析要读管理员账号文件的状态（这里只要「已初始化」）。
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        # 真 settings（要 cookie_name / display_cookie_name 这类字段判身份），
        # 只把可信代理清空，让来源解析按 TCP 对端计数。Settings 是 frozen 的，
        # 因此用 replace 造一份改了字段的副本。
        app.state.settings = replace(load_settings(), trusted_proxies=())
        transport = httpx.ASGITransport(app=app)
        headers = {'origin': 'http://app.test'}
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            posted = await client.post(
                '/api/v1/logs/public-events',
                headers=headers,
                json={
                    'level': 'error',
                    'source': '登录页',
                    'category': '界面',
                    'message': '伪造的中文说明' * 60,
                    'details': '堆栈细节' * 400,
                    'context': {'page': '/login'},
                },
            )
            anonymous_events = await client.post(
                '/api/v1/logs/public-events', headers=headers, json={'level': 'info', 'message': '不该被记录'}
            )
            # 另一条通道必须仍然要登录：加标记不是「放宽」，别把两条通道混成一档。
            authed = await client.post('/api/v1/logs/events', headers=headers, json={'level': 'error', 'message': 'x'})
        all_events = store.list_events(limit=None)
        events = [event for event in all_events if event.get('message', '').startswith(PUBLIC_EVENT_MARKER)]
        store.stop()

    check(
        'B62 公开通道的条目带来源标记（后台一眼能认出是外部上报）',
        posted.status_code == 204
        and len(events) == 1
        # 关键性质是「没有漏标的」：只要写了日志就必须带标记。
        and len(all_events) == len(events),
        f'status={posted.status_code}，带标记 {len(events)} 条 / 全部 {len(all_events)} 条',
    )
    if events:
        entry = events[0]
        check(
            'B62 公开通道的正文与细节按更紧的上限截断',
            len(entry['message']) <= len(PUBLIC_EVENT_MARKER) + PUBLIC_EVENT_MESSAGE_LIMIT
            and len(entry.get('details') or '') <= PUBLIC_EVENT_DETAILS_LIMIT,
            f'正文 {len(entry["message"])} 字符（上限 {len(PUBLIC_EVENT_MARKER) + PUBLIC_EVENT_MESSAGE_LIMIT}）、'
            f'细节 {len(entry.get("details") or "")} 字符（上限 {PUBLIC_EVENT_DETAILS_LIMIT}）',
        )
        check(
            'B62 公开通道的身份标注仍是「未登录页面 / 未登录」',
            entry['source'] == '未登录页面' and (entry.get('context') or {}).get('actor') == '未登录',
            f'source={entry["source"]}，actor={(entry.get("context") or {}).get("actor")}',
        )
    check(
        'B62 非 warning/error 的公开上报照旧直接 204 丢掉（不写日志）',
        anonymous_events.status_code == 204,
        f'status={anonymous_events.status_code}',
    )
    # 匿名配额单独起一个实例：上面对标记/截断的调用也算进这个限流器，混在一起就数不准。
    with tempfile.TemporaryDirectory(prefix='hb-public-quota-') as tmp:
        quota_root = Path(tmp)
        quota_database = Database(f'sqlite:///{quota_root / "app.db"}')
        Base.metadata.create_all(quota_database.engine)
        quota_store = GlobalLogStore(quota_root / 'data')
        quota_app = FastAPI()
        quota_app.include_router(global_logs_router, prefix='/api/v1')
        quota_app.state.database = quota_database
        quota_app.state.global_log = quota_store
        quota_app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        quota_app.state.settings = replace(load_settings(), trusted_proxies=())
        quota_transport = httpx.ASGITransport(app=quota_app)
        async with httpx.AsyncClient(transport=quota_transport, base_url='http://app.test') as client:
            statuses = [
                (
                    await client.post(
                        '/api/v1/logs/public-events',
                        headers=headers,
                        json={'level': 'error', 'message': f'第 {index} 次匿名上报'},
                    )
                ).status_code
                for index in range(ANONYMOUS_CLIENT_LOG_PER_MINUTE + 2)
            ]
        quota_store.stop()
    check(
        'B62 匿名配额压到 10 条/分钟（第 11 条起 429）',
        # 断言里写死 10，不去比 ANONYMOUS_CLIENT_LOG_PER_MINUTE：拿常量当期望值等于
        # 自己证明自己（把常量改回 30，这条会跟着「通过」）。
        statuses[:10] == [204] * 10 and statuses[10:] == [429, 429],
        f'{statuses}（常量={ANONYMOUS_CLIENT_LOG_PER_MINUTE}）',
    )
    check(
        'B62 已认证通道仍然要求登录（收紧公开通道不等于放宽另一条）',
        authed.status_code == 401,
        f'status={authed.status_code}',
    )


async def check_health_probe_details_local_only() -> None:
    """B61：健康探针的细节只给本机直连，外部来访者只拿到一个 2xx。

    ``/health/ready`` 原先匿名返回 ``initialized`` 与精确版本号：前者正好把
    ``setup_guard`` 那个「还没建管理员」的窗口标出来，后者是选靶子的第一手情报。
    编排器的探测从容器内回环发起（见 Dockerfile / docker-compose），因此不损功能。
    """
    from backend.app.database import Base, Database
    from backend.app.main import create_app

    with tempfile.TemporaryDirectory(prefix='hb-health-') as tmp:
        app = create_app()
        database = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        Base.metadata.create_all(database.engine)
        app.state.database = database
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        version = app.state.settings.version

        local = httpx.ASGITransport(app=app, client=('127.0.0.1', 41234))
        remote = httpx.ASGITransport(app=app, client=('203.0.113.9', 51234))
        async with httpx.AsyncClient(transport=local, base_url='http://app.test') as client:
            ready_local = (await client.get('/health/ready')).json()
            live_local = (await client.get('/health/live')).json()
            proxied = (await client.get('/health/ready', headers={'x-forwarded-for': '203.0.113.9'})).json()
        async with httpx.AsyncClient(transport=remote, base_url='http://app.test') as client:
            ready_remote = (await client.get('/health/ready')).json()
            live_remote = (await client.get('/health/live')).json()

    check(
        'B61 本机直连照旧拿得到 initialized 与版本（容器内探针不受影响）',
        ready_local.get('initialized') is True and ready_local.get('version') == version and live_local.get('version') == version,
        f'ready={ready_local}，live={live_local}',
    )
    check(
        'B61 外部来访者只拿到 status，没有 initialized 与版本',
        ready_remote == {'status': 'ready'} and live_remote == {'status': 'ok'},
        f'ready={ready_remote}，live={live_remote}',
    )
    check(
        'B61 带了转发头的回环请求也不算本机直连（反代同机部署时不能误放详情）',
        proxied == {'status': 'ready'},
        f'{proxied}',
    )


def check_update_checks_opt_in() -> None:
    """B31：更新检查必须是显式开启的外发行为，且端点可换成自建。

    原先加载器把开关**硬编码成 True**（dataclass 默认却是 False，形成不可达分支），
    于是自托管部署默认每 6 小时向厂商端点上报版本与渠道，与「可选」的文档相反。
    这条检查同时盯住三件事：默认关闭、开关真的能开、端点能换（并让界面看得出
    「本部署关掉了外发检查」）。
    """
    import os

    from backend.app.config import load_settings
    from backend.app.updates import RELEASE_ENDPOINTS, UpdateChecker, endpoint_hosts

    saved = {
        name: os.environ.get(name)
        for name in ('APP_UPDATE_CHECKS', 'APP_UPDATE_ENDPOINTS', 'APP_UPDATE_WIKI_URL', 'APP_UPDATE_CHANNEL')
    }
    try:
        for name in saved:
            os.environ.pop(name, None)
        default = load_settings()
        os.environ['APP_UPDATE_CHECKS'] = '1'
        os.environ['APP_UPDATE_ENDPOINTS'] = 'https://updates.internal/api/latest, https://mirror.internal/api/latest'
        os.environ['APP_UPDATE_WIKI_URL'] = 'https://docs.internal/updates.html'
        os.environ['APP_UPDATE_CHANNEL'] = 'docker'
        opted_in = load_settings()
    finally:
        for (name, value) in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    with tempfile.TemporaryDirectory(prefix='hb-updates-') as tmp:
        disabled = UpdateChecker(Path(tmp), '1.0.0', 'docker', enabled=default.update_checks_enabled, endpoints=default.update_endpoints)
        disabled.start()
        enabled = UpdateChecker(
            Path(tmp),
            '1.0.0',
            'docker',
            enabled=opted_in.update_checks_enabled,
            endpoints=opted_in.update_endpoints,
            wiki_url=opted_in.update_wiki_url,
        )
        fallback = UpdateChecker(Path(tmp), '1.0.0', 'docker', endpoints=())
        stopped = disabled.task is None
        status = disabled.status()
        enabled_status = enabled.status()
        enabled_task = enabled.task
        if enabled_task is not None:
            enabled_task.cancel()

    check(
        'B31 更新检查默认关闭（加载器不再硬编码 True）',
        default.update_checks_enabled is False and disabled.endpoints == RELEASE_ENDPOINTS,
        f'enabled={default.update_checks_enabled}，端点={disabled.endpoints[0]}',
    )
    check(
        'B31 关闭时不起后台任务（也就不会有任何外发请求）',
        stopped,
        f'task={disabled.task}',
    )
    check(
        'B31 APP_UPDATE_CHECKS=1 才开启，且端点与说明页可指向自建',
        opted_in.update_checks_enabled is True
        and enabled.endpoints == ('https://updates.internal/api/latest', 'https://mirror.internal/api/latest')
        and enabled_status['logUrl'].startswith('https://docs.internal/updates.html'),
        f'端点={enabled.endpoints}，logUrl={enabled_status["logUrl"]}',
    )
    check(
        'B31 未配置端点时回落到内置厂商端点（而不是空列表空转）',
        fallback.endpoints == RELEASE_ENDPOINTS and bool(endpoint_hosts(fallback.endpoints)),
        f'端点={fallback.endpoints}，主机={endpoint_hosts(fallback.endpoints)}',
    )
    check(
        'B31 状态里回传 enabled，界面能区分「没查到」与「本部署关掉了」',
        # 用 .get：缺键时要「变红」，而不是抛 KeyError 把整轮自检打断（那样连红项都看不到）。
        status.get('enabled') is False and enabled_status.get('enabled') is True,
        f'关闭时 {status.get("enabled")}、开启时 {enabled_status.get("enabled")}',
    )
    # 写法门：上面证明了「UpdateChecker 拿到端点会用」，这里证明「应用真的把配置传进去了」。
    # 只测类的话，main.py 里写成 endpoints=() 也照样全绿 —— 开关就成了摆设。
    from backend.app.main import create_app  # noqa: F401 —— 确保被检查的模块可导入

    keywords = _update_checker_keywords()
    check(
        'B31 开关 / 端点 / 说明页确实从配置接到 UpdateChecker（写法门）',
        keywords.get('enabled') == 'app_settings.update_checks_enabled'
        and keywords.get('endpoints') == 'app_settings.update_endpoints'
        and keywords.get('wiki_url') == 'app_settings.update_wiki_url',
        f'{keywords}',
    )


def _update_checker_keywords() -> dict[str, str]:
    """把 ``create_app`` 里构造 ``UpdateChecker`` 时传的关键字参数取出来（源码级的写法门）。

    只做一件事：确认这三个参数接的是 ``app_settings`` 上的对应字段。运行期的结果门
    （``UpdateChecker(endpoints=...)`` 真的生效）由 :func:`check_update_checks_opt_in`
    里的类级断言负责；两者缺一，都可能出现「配置改了但没人读」或「读了但改错了」。
    """
    source = (Path(__file__).resolve().parents[1] / 'app' / 'main.py').read_text(encoding = 'utf-8')
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'UpdateChecker':
            return {keyword.arg: ast.unparse(keyword.value) for keyword in node.keywords if keyword.arg}
    return {}


def check_bounded_attempt_limiter() -> None:
    """B48：按码计数器的键空间必须有上限，且淘汰要连失败记录一起清掉。

    键是「被尝试的配对码」的哈希 —— 外部可以随便造，不封顶就是一条内存放大路径。
    这条检查盯住淘汰语义本身：键上限生效、最久未用的那个被淘汰、被淘汰的键不再是
    封禁状态（少清一步就等于「记住了但不清」，淘汰只是把内存让出来而已）。
    """
    from backend.app.auth_limiter import BoundedAttemptLimiter

    limiter = BoundedAttemptLimiter(5, 900, 900, max_keys=2)
    for _ in range(5):
        limiter.record_failure('code-a')
    blocked_before = limiter.blocked('code-a')
    limiter.record_failure('code-b')
    limiter.record_failure('code-c')
    tracked = limiter.tracked_keys()
    blocked_after = limiter.blocked('code-a')
    check(
        'B48 同一码错满阈值即封禁（这一档要做的事）',
        blocked_before is True and limiter.block_seconds == 900,
        f'blocked={blocked_before}，block_seconds={limiter.block_seconds}',
    )
    check(
        'B48 键空间有上限：超出后淘汰最久未用的键',
        tracked == 2,
        f'记住 {tracked} 个键（上限 2）',
    )
    check(
        'B48 被淘汰的键连封禁记录一起清掉（不是只把内存让出来）',
        blocked_after is False,
        f'淘汰后 code-a blocked={blocked_after}',
    )
    for _index in range(4):
        limiter.record_failure('code-a')
    check(
        'B48 淘汰会重置该键的计数：重新开始记，而不是一进来就立刻再封',
        limiter.blocked('code-a') is False,
        f'被淘汰的键重新错 4 次后 blocked={limiter.blocked("code-a")}（旧计数没清的话这里就已经被封）',
    )
    limiter.record_failure('code-a')
    check(
        'B48 重置后照旧要错满 5 次才封（不是「再也不封」）',
        limiter.blocked('code-a') is True,
        f'第 5 次后 blocked={limiter.blocked("code-a")}',
    )


async def check_pairing_code_attempt_budget() -> None:
    """B48：按码的那一档限流必须真的挂在配对路由上（且是按码，不是按全局）。

    前两档（按 IP、跨来源）管的是「谁来试」，盯不住「拿着一个码反复磨」：共享预算
    是大家平摊的，而按 IP 那档换个网络就重置。这条检查在真应用里发真请求：同一个码
    错满预算后该码被锁，而**另一个码照样会被受理** —— 后者是「按码」与「全局」的
    分界线，也防止把这一档写成又一个全局开关。

    来源地址构造成「可信代理但没传转发头」（``per_client=False``）：这样按 IP 那一档
    会被跳过，才看得到按码那一档自己的 429。这在真实部署里对应「反代没配转发头」，
    恰恰是按 IP 限流最弱、最需要按码兜底的形态。
    """
    from backend.app.auth_limiter import BoundedAttemptLimiter, LoginAttemptLimiter
    from backend.app.global_log import RepeatedErrorTally
    from backend.app.database import Base, Database
    from backend.app.main import create_app
    from backend.app.api.displays import PAIRING_SHARED_ADDRESS_LIMIT
    from backend.app.models import DisplayPairingCode, Project, User
    from backend.app.security import session_token_hash

    with tempfile.TemporaryDirectory(prefix='hb-pair-limit-') as tmp:
        app = create_app()
        database = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        Base.metadata.create_all(database.engine)
        with database.session_factory() as session:
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
            # 分两次提交：projects.created_by 有外键，同一个 commit 里的插入顺序不保证。
            session.add(Project(id='proj-a', name='甲项目', slug='proj-a', created_by='u1'))
            session.commit()
            session.add(
                DisplayPairingCode(
                    id='pair-a',
                    project_id='proj-a',
                    created_by='u1',
                    code_hash=session_token_hash('654321'),
                    encrypted_code='encrypted',
                    name='走廊平板',
                )
            )
            session.commit()
        app.state.database = database
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        app.state.license_service = SimpleNamespace(allows=lambda _code: True)
        # 配对成功要写审计日志；这条检查只看限流，日志收下丢掉即可。
        app.state.global_log = SimpleNamespace(append=lambda *_args, **_kwargs: None)
        # 被拒的配对请求会走诊断中间件的 4xx 合并计数（B62），同样给个真实例。
        app.state.error_tally = RepeatedErrorTally()
        app.state.pairing_code_limiter = BoundedAttemptLimiter(5, 900, 900, max_keys=64)
        app.state.pairing_limiter = LoginAttemptLimiter(30, 60, 60)
        # per_client=False 时按共享地址记的那一档（B16）：与生产同参数，
        # 好让「连错 5 次不会误伤」与真实阈值一致。
        app.state.pairing_shared_limiter = LoginAttemptLimiter(*PAIRING_SHARED_ADDRESS_LIMIT)
        app.state.login_limiter = LoginAttemptLimiter()
        # 让 resolve_client_ip 认定「对端是可信代理但没带转发头」→ per_client=False。
        # Settings 是 frozen 的，用 replace 造副本。
        app.state.settings = replace(app.state.settings, trusted_proxies=('127.0.0.1',))

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            wrong_code = [
                (await client.post('/api/v1/displays/pair', json={'code': '111111'})).status_code
                for _ in range(5)
            ]
            blocked = await client.post('/api/v1/displays/pair', json={'code': '111111'})
            other_code = await client.post('/api/v1/displays/pair', json={'code': '222222'})
            paired = await client.post('/api/v1/displays/pair', json={'code': '654321'})

    check(
        'B48 同一码连错 5 次仍是 422（预算没用完之前不误伤）',
        wrong_code == [422] * 5,
        f'{wrong_code}',
    )
    check(
        'B48 第 6 次同一个码被按码那一档拦下（429 + Retry-After）',
        blocked.status_code == 429
        and '该配对码尝试次数过多' in blocked.json().get('detail', '')
        and blocked.headers.get('retry-after') == '900',
        f'{blocked.status_code} {blocked.json().get("detail")} retry-after={blocked.headers.get("retry-after")}',
    )
    check(
        'B48 另一个码照旧受理（按码记账，不是又一个全局开关）',
        other_code.status_code == 422,
        f'{other_code.status_code} {other_code.json().get("detail")}',
    )
    check(
        'B48 正确的码照旧能配对成功（修好之后别把正常配对挡了）',
        paired.status_code in (200, 201) and bool(paired.json().get('targetUrl')),
        f'{paired.status_code} {paired.json().get("targetUrl")}',
    )


def check_pair_shared_address_bucket() -> None:
    """B16：拿不到真实客户端地址时，按来源地址那一档必须「换桶」而不是「跳过」。

    两条错误的路都得堵住：
    - 过去是**整个跳过** —— 剩下只有跨来源那一档（所有人平摊同一份额度），
      一个从共享地址来的攻击者几分钟就能把它烧光，把所有人一起挡在外面；
    - 「仍然按共享地址记进真实 IP 那一档」也不行 —— 代理后面是一整栋楼，
      别人手滑几次就把普通用户的登录预算吃掉一块，还会互相误伤。

    这条检查不看日志、不看文案，直接看函数交出来的是**哪个限流器、哪个键**：
    换错桶的话，后面两段（共享桶灌满不影响真实 IP、也不影响登录桶）会立刻报红。
    """
    from backend.app.api.displays import (
        PAIRING_GLOBAL_KEY,
        PAIRING_SHARED_ADDRESS_LIMIT,
        enforce_pair_rate_limit,
        note_pair_failure,
    )
    from backend.app.auth_limiter import LoginAttemptLimiter

    from fastapi import HTTPException
    app = SimpleNamespace(
        state=SimpleNamespace(
            login_limiter=LoginAttemptLimiter(5, 900, 900),
            pairing_shared_limiter=LoginAttemptLimiter(*PAIRING_SHARED_ADDRESS_LIMIT),
            # 跨来源那一档给足额度：这条检查只看「换不换桶」。跨来源本身该不该拦、
            # 什么时候拦，由 B48 那条走真路由的检查盯。
            pairing_limiter=LoginAttemptLimiter(1000, 60, 60),
            pairing_code_limiter=LoginAttemptLimiter(5, 900, 900),
        )
    )
    request = SimpleNamespace(app=app)
    shared_address = '203.0.113.9'

    (shared_limiter, shared_key) = enforce_pair_rate_limit(request, shared_address, per_client=False)
    check(
        'B16 per_client=False 时用共享地址那一档，键单独命名（不与真实 IP 桶混用）',
        shared_limiter is app.state.pairing_shared_limiter
        and shared_key == f'display-pair-shared:{shared_address}',
        f'limiter={"共享桶" if shared_limiter is app.state.pairing_shared_limiter else "非共享桶"} key={shared_key}',
    )

    for _ in range(PAIRING_SHARED_ADDRESS_LIMIT[0]):
        note_pair_failure(request, shared_limiter, shared_key, 'code-hash')
    blocked_status = None
    blocked_retry_after = None
    try:
        enforce_pair_rate_limit(request, shared_address, per_client=False)
    except HTTPException as error:
        blocked_status = error.status_code
        blocked_retry_after = (error.headers or {}).get('Retry-After')
    check(
        'B16 共享地址连续失败后会被拦下（不再是一档形同虚设的限额）',
        blocked_status == 429 and blocked_retry_after == str(PAIRING_SHARED_ADDRESS_LIMIT[2]),
        f'状态={blocked_status} Retry-After={blocked_retry_after} 配额={PAIRING_SHARED_ADDRESS_LIMIT}',
    )
    check(
        'B16 真实 IP 那一档不受影响（共享地址被锁，不代表所有人都被锁）',
        enforce_pair_rate_limit(request, '198.51.100.7', per_client=True)[1]
        == 'display-pair:198.51.100.7',
        '真实 IP 仍按自己的键计数',
    )
    check(
        'B16 共享地址的失败没记进登录桶（不挤占正常用户的登录预算）',
        not app.state.login_limiter.blocked(f'display-pair:{shared_address}')
        and not app.state.login_limiter._failures,
        f'登录桶键={sorted(app.state.login_limiter._failures)}',
    )
    check(
        'B16 跨来源那一档照旧记账（换桶不等于少记一档）',
        app.state.pairing_limiter._failures.get(PAIRING_GLOBAL_KEY)
        or app.state.pairing_limiter._blocked_until.get(PAIRING_GLOBAL_KEY),
        f'跨来源键={sorted(app.state.pairing_limiter._failures)}',
    )


def _detail_of(response) -> str:
    """取响应里的 ``detail`` 文案；取不到就退回响应体原文。

    诊断信息是**无条件求值**的：回归一旦发生（比如又变回 500），响应体是纯文本，
    直接 ``.json()`` 会在这里抛异常，断言本身还没判、整份自检就先中断了 ——
    那样后续所有检查都不会跑，一个回归会伪装成「整个自检崩了」。
    """
    try:
        payload = response.json()
    except ValueError:
        return response.text.replace('\n', ' ')[:120]
    if isinstance(payload, dict):
        return str(payload.get('detail'))[:120]
    return str(payload)[:120]


def _field_of(response, key: str):
    """取响应 JSON 里的某个字段；响应不是 JSON 时回 None。"""
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload.get(key) if isinstance(payload, dict) else None


def check_unique_violation_predicate() -> None:
    """``is_unique_violation`` 必须两个条件都看：UNIQUE 与「带表名的列名」。

    这个判据本身错一次，上层的两套退让就全错：太宽 → 把「name 恒为 NULL」这种缺陷
    当成「重名」报给用户（听起来很合理，于是没人去查真原因）；太窄 → 真正的并发
    重名漏回 500，等于 B10/B11 没修。

    这里直接喂 SQLAlchemy 真实会产出的那几句消息（``str(orig)``），不经过数据库 ——
    判断逻辑只依赖那句文本，单独测它最省事也最准。
    """
    from sqlalchemy.exc import IntegrityError

    from backend.app.conflicts import is_unique_violation

    def error(message: str) -> IntegrityError:
        """造一个 ``orig`` 为 sqlite3 异常的 IntegrityError，与真实形状一致。"""

        class _Origin(Exception):
            pass

        return IntegrityError('INSERT INTO projects ...', {}, _Origin(message))

    cases = [
        (
            'UNIQUE constraint failed: projects.name',
            'projects.name',
            True,
            '唯一约束命中',
        ),
        (
            'NOT NULL constraint failed: projects.name',
            'projects.name',
            False,
            '非空约束里也有列名，但绝不能当成重名（那会把真正的缺陷藏起来）',
        ),
        (
            'UNIQUE constraint failed: display_pairing_codes.name',
            'projects.name',
            False,
            '别的表上的同名列不算（所以必须带表名）',
        ),
        (
            'UNIQUE constraint failed: projects.slug',
            'projects.name',
            False,
            '同表上的另一列不算（name 与 slug 的退让方式不同）',
        ),
        (
            'UNIQUE constraint failed: projects.slug',
            'projects.slug',
            True,
            'slug 命中',
        ),
    ]
    wrong = [
        (message, column, wanted, why)
        for (message, column, wanted, why) in cases
        if is_unique_violation(error(message), column) is not wanted
    ]
    check(
        'B10/B11 冲突判据同时看 UNIQUE 与带表名的列名（喂进真实的约束消息）',
        not wrong,
        f'判错的用例={wrong}' if wrong else f'{len(cases)} 个用例全部判对',
    )


class RivalWriteSession:
    """在「已经查过一遍」与「真正写下去」之间，让竞争对手抢先提交。

    B10/B11/B12 是同一个形状的缺陷 —— **先查后写**：

        SELECT（没人占用） → …… → INSERT / UPDATE

    两个请求都能查到「没人占用」，于是唯一约束成了真正的裁决者。要在进程内确定性地
    复现它，不必真的开两条线程赛跑（那种测试会随机飘，红了也不知道是真缺陷还是调度），
    只需要把「对手提交」这件事精确地插在那两步之间：**调度顺序是模拟的，而冲突本身
    全是真的** —— 真的唯一索引、真的 ``IntegrityError``、真的重试与 409。

    做法是包一层会话：在被测请求**写下第一个字节之前**，先让 ``rival`` 用另一条连接
    写完并提交。这个时点选得有讲究：

    - 必须晚于请求里那些「先查」的 SELECT ── 否则对手会被那道「尽早给中文提示」的
      检查先一步拦下，真正要验证的并发处理（唯一约束 + 409）根本走不到；
    - 又必须早于请求自己第一次写 ── SQLite 的写锁是排他的，等我们开始写之后对手就
      再也提交不进来了，「两个请求同时写」在测试里会退化成「一个先一个后」。

    为什么对手的提交在一条已经查过的会话里看得见：pysqlite 默认隔离级别下 SELECT
    不显式开事务（DML 才开），因此这里没有「读到旧快照」的问题 —— 与真实并发一致。

    ``fired`` 用来断言「这个对手确实在窗口里出现过」：没出现的话，测试其实什么都没测到。
    """

    def __init__(self, session, rival) -> None:
        """包装一个真会话，并记下「对手怎么提交」这段动作。"""
        self._session = session
        self._rival = rival
        self._fired = False

    @property
    def fired(self) -> bool:
        """对手是否已经在窗口里提交过。"""
        return self._fired

    def _fire(self) -> None:
        """跑一次对手写入（只跑一次）。"""
        if self._fired:
            return
        self._fired = True
        self._rival()

    def flush(self, *args, **kwargs):
        """真正的 flush 之前先让对手提交。"""
        self._fire()
        return self._session.flush(*args, **kwargs)

    def execute(self, statement, *args, **kwargs):
        """第一条写语句之前先让对手提交（INSERT / UPDATE / DELETE 都算）。"""
        from sqlalchemy.sql.dml import Delete, Insert, Update

        if isinstance(statement, (Insert, Update, Delete)):
            self._fire()
        return self._session.execute(statement, *args, **kwargs)

    def __getattr__(self, name):
        """其余属性一律透传给真会话。"""
        return getattr(self._session, name)


def _projects_app(workdir: Path):
    """拼一个真应用：真路由 + 真通知，只换掉数据库、授权服务与素材目录。

    返回 (app, database, admin_cookie)。真实路由是这几个缺陷的关键 ——
    「409 还是 500」的差别只存在于路由的错误处理里，直接调底层函数测不到。
    """
    from datetime import datetime, timedelta, timezone

    from backend.app.database import Base, Database
    from backend.app.global_log import RepeatedErrorTally
    from backend.app.main import create_app
    from backend.app.models import LoginSession, User
    from backend.app.security import session_token_hash

    app = create_app()
    database = Database(f'sqlite:///{workdir / "app.db"}')
    Base.metadata.create_all(database.engine)
    now = datetime.now(timezone.utc)
    with database.session_factory() as session:
        session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
        session.commit()
        session.add(
            LoginSession(
                id_hash=session_token_hash('tok-admin'),
                user_id='u1',
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(hours=1),
            )
        )
        session.commit()
    app.state.database = database
    app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
    app.state.license_service = SimpleNamespace(allows=lambda _code: True, status=lambda: {'status': 'ACTIVE'})
    app.state.asset_catalog = SimpleNamespace(asset_exists=lambda _asset_id: True, mutation_lock=threading.Lock())
    app.state.global_log = SimpleNamespace(append=lambda *_args, **_kwargs: None)
    # 诊断中间件在 4xx 上会调它（B62）；不跑 lifespan 的话这些状态得自己补上。
    app.state.error_tally = RepeatedErrorTally()
    cookie = {app.state.settings.cookie_name: 'tok-admin'}
    return (app, database, cookie)


def _seed_project(database, project_id: str, name: str, *, document_json: str) -> None:
    """插一个项目与它的草稿；``document_json`` 由调用方给（可以故意给坏内容）。

    顺带把全局弹窗状态那一行也建好：不建的话，保存路径里 ``global_popup_state``
    会在名称校验**之前**顺手插一行并 flush，那条 DML 会先一步拿走 SQLite 的写锁 ——
    于是 ``RivalWriteSession`` 的对手再也提交不进来，「并发改名」根本复现不出来。
    真实部署里这一行早就存在（第一次保存就建了），所以这不是为测试而造的假状态。
    """
    from backend.app.models import GlobalCustomPopupState, Project, ProjectDraft

    with database.session_factory() as session:
        session.add(Project(id=project_id, name=name, slug=project_id, created_by='u1'))
        session.commit()
        session.add(
            ProjectDraft(
                project_id=project_id,
                schema_version=1,
                revision=1,
                document_json=document_json,
                updated_by='u1',
            )
        )
        session.commit()
        if session.get(GlobalCustomPopupState, 1) is None:
            session.add(GlobalCustomPopupState(id=1, revision=1, popups_json='[]'))
            session.commit()


async def check_duplicate_dirty_document_is_422() -> None:
    """B9：源文档脏掉的项目要能「报错」，而不是「永远复制不出来」。

    ``duplicate_project`` 里的 ``json.loads`` 与 ``validate_panel_document`` 都没接住
    ``ValueError``：一份被截断或结构不合规的源文档会让复制接口 500，而用户看到的只是
    「服务器内部错误」—— 这个项目从此再也复制不出来，也没有任何提示告诉他为什么。
    修复后两条路径都按 422 回一句能读懂的话。
    """
    from backend.app.api.projects import serialize_document
    from backend.app.models import Project
    from backend.app.panel.documents import create_blank_project

    with tempfile.TemporaryDirectory(prefix='hb-dup-') as tmp:
        (app, database, cookie) = _projects_app(Path(tmp))
        valid = serialize_document(create_blank_project('proj-ok', '正常项目'))
        _seed_project(database, 'proj-ok', '正常项目', document_json=valid)
        # 写盘时被截断的 JSON。
        _seed_project(database, 'proj-cut', '截断项目', document_json=valid[: len(valid) // 2])
        # 合法 JSON，但字段类型不合文档结构。
        _seed_project(database, 'proj-bad', '脏字段项目', document_json='{"schemaVersion": "一", "name": "脏字段项目"}')

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            cut = await client.post('/api/v1/projects/proj-cut/duplicate', cookies=cookie, json={'name': '截断副本'})
            bad = await client.post('/api/v1/projects/proj-bad/duplicate', cookies=cookie, json={'name': '脏字段副本'})
            good = await client.post('/api/v1/projects/proj-ok/duplicate', cookies=cookie, json={'name': '正常副本'})

        with database.session_factory() as session:
            names = sorted(row.name for row in session.query(Project).all())

    check(
        'B9 截断的源文档回 422 并说明原因（修复前是 500）',
        cut.status_code == 422 and _field_of(cut, 'detail') == '源仪表盘的草稿内容已损坏，无法复制。',
        f'{cut.status_code} {_detail_of(cut)}',
    )
    check(
        'B9 结构不合规的源文档回 422（复用保存路径那套校验文案）',
        bad.status_code == 422 and isinstance(_field_of(bad, 'detail'), str) and _field_of(bad, 'detail'),
        f'{bad.status_code} {_detail_of(bad)}',
    )
    check(
        'B9 失败时不会留下半个副本（只有成功的那个新项目）',
        names == sorted(['正常项目', '截断项目', '脏字段项目', '正常副本']),
        f'{names}',
    )
    check(
        'B9 正常的源文档照旧能复制（修好之后别把复制功能整个挡了）',
        good.status_code == 201 and _field_of(good, 'name') == '正常副本' and _field_of(good, 'slug') == 'dashboard',
        f'{good.status_code} {_field_of(good, "name")} slug={_field_of(good, "slug")}',
    )


async def check_project_conflicts_resolve_to_409() -> None:
    """B10/B11：项目名与 slug 的唯一约束在并发下要变成 409 / 重试，而不是 500。

    名称与 slug 都是「先查后写」：查询与插入之间的窗口里，另一个请求可以抢先提交。
    修复前那个 ``IntegrityError`` 一路冒到接口层变成 500，而用户只是又点了一次
    「新建」，或者另一个标签页刚建过同名项目。

    两条约束的退让方式不同，因此断言也分开：

    - 同名 → 409（名称是用户区分仪表盘的唯一依据，也是展示地址的路径段，不能悄悄改名）；
    - 同 slug → 换一个后缀重试成功（slug 只是内部形式，随便加后缀）。
    """
    from backend.app.models import Project
    from backend.app.dependencies import get_database_session

    with tempfile.TemporaryDirectory(prefix='hb-conflict-') as tmp:
        (app, database, cookie) = _projects_app(Path(tmp))
        ok_cookie = cookie
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            # 1) 不带并发：重名走「尽早给中文提示」那一档（先查后写的第一道）。
            first = await client.post('/api/v1/projects', cookies=ok_cookie, json={'name': '客厅'})
            sequential = await client.post('/api/v1/projects', cookies=ok_cookie, json={'name': '客厅'})

            # 2) 并发下重名：查询时还没人用，插入前对手提交了同名项目。
            def insert_rival_project(name: str, slug: str) -> None:
                with database.session_factory() as rival_session:
                    rival_session.add(Project(id=f'rival-{slug}', name=name, slug=slug, created_by='u1'))
                    rival_session.commit()

            name_rival = RivalWriteSession(
                database.session_factory(),
                lambda: insert_rival_project('书房', 'rival-study'),
            )
            app.dependency_overrides[get_database_session] = lambda: name_rival
            try:
                raced_name = await client.post('/api/v1/projects', cookies=ok_cookie, json={'name': '书房'})
                fired_name = name_rival.fired
            finally:
                app.dependency_overrides.pop(get_database_session, None)
                name_rival.close()

            # 3) 并发下同 slug：对手的名字不同（不撞名称），但 slug 与我们要生成的一样。
            #    请求名 'study 房间' 折出来的 base slug 是 'study'（全中文以外的部分保留），
            #    对手先占掉这个 slug。注意这一步必须在对手那一行真的建起来之后再看结果 ——
            #    对手自己撞了唯一约束的话，那条 IntegrityError 会被当成我们的冲突，
            #    断言就会因为错误的理由变绿。
            slug_rival = RivalWriteSession(
                database.session_factory(),
                lambda: insert_rival_project('另一个房间', 'study'),
            )
            app.dependency_overrides[get_database_session] = lambda: slug_rival
            try:
                raced_slug = await client.post('/api/v1/projects', cookies=ok_cookie, json={'name': 'study 房间'})
                fired_slug = slug_rival.fired
            finally:
                app.dependency_overrides.pop(get_database_session, None)
                slug_rival.close()

        with database.session_factory() as session:
            rows = {row.name: row.slug for row in session.query(Project).all()}

    check(
        'B10 顺序提交的重名仍然是 409「仪表盘名称已存在。」（第一道没被绕过）',
        first.status_code == 201 and sequential.status_code == 409 and _field_of(sequential, 'detail') == '仪表盘名称已存在。',
        f'{first.status_code}/{sequential.status_code} {_detail_of(sequential)}',
    )
    check(
        'B10 并发下撞名称唯一约束回 409 而不是 500（对手确实在窗口里提交过）',
        fired_name and raced_name.status_code == 409 and _field_of(raced_name, 'detail') == '仪表盘名称已存在。',
        f'对手提交={fired_name}，{raced_name.status_code} {_detail_of(raced_name)}',
    )
    check(
        'B10 失败的创建没有留下行（同名项目只有一个）',
        list(rows).count('书房') == 1 and rows.get('书房') == 'rival-study',
        f'{rows}',
    )
    check(
        'B11 并发下撞 slug 唯一约束自动换后缀重试（对手确实在窗口里提交过）',
        fired_slug and raced_slug.status_code == 201 and _field_of(raced_slug, 'slug') == 'study-2',
        f'对手提交={fired_slug}，{raced_slug.status_code} slug={_field_of(raced_slug, "slug")}',
    )
    check(
        'B11 重试成功的那一行真的落了库，对手那一行没被动',
        rows.get('study 房间') == 'study-2' and rows.get('另一个房间') == 'study',
        f'{rows}',
    )


async def check_rename_conflict_is_409_atomic() -> None:
    """B10（保存路径）：改名撞上并发创建的同名项目时回 409，且整笔保存一起回滚。

    保存接口会把「文档名」同步写进项目表，所以改名的唯一性也落在同一条事务里。
    这里要断言两件事：状态码不能是 500（那正是修复前的样子），以及**原子性** ——
    名字没改成的时候文档也不能已经写进去。否则用户看到「保存失败」，刷新后内容却变了，
    下一次保存又会撞上 revision 冲突，比直接报错更难查。
    """
    from backend.app.api.projects import NAME_CONFLICT_DETAIL, serialize_document
    from backend.app.dependencies import get_database_session
    from backend.app.models import Project, ProjectDraft
    from backend.app.panel.documents import create_blank_project

    with tempfile.TemporaryDirectory(prefix='hb-rename-') as tmp:
        (app, database, cookie) = _projects_app(Path(tmp))
        _seed_project(database, 'proj-a', '甲项目', document_json=serialize_document(create_blank_project('proj-a', '甲项目')))
        # 保存成功后会把新绑定的实体丢给 HA 连接器刷新；这里只记下它被叫过。
        refreshed: list[dict] = []
        app.state.ha_connector = SimpleNamespace(refresh_persistent_entity_ids=lambda **kwargs: refreshed.append(kwargs))

        def insert_rival_project() -> None:
            with database.session_factory() as rival_session:
                rival_session.add(Project(id='rival-living', name='客厅', slug='rival-living', created_by='u1'))
                rival_session.commit()

        rival = RivalWriteSession(database.session_factory(), insert_rival_project)
        app.dependency_overrides[get_database_session] = lambda: rival
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        try:
            async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
                renamed = await client.put(
                    '/api/v1/projects/proj-a/draft',
                    cookies=cookie,
                    json={
                        'revision': 1,
                        'globalPopupsDirty': False,
                        'document': create_blank_project('proj-a', '客厅'),
                    },
                )
            fired = rival.fired
        finally:
            app.dependency_overrides.pop(get_database_session, None)
            rival.close()

        with database.session_factory() as session:
            stored = session.get(ProjectDraft, 'proj-a')
            project_name = session.get(Project, 'proj-a').name
            revision_after = stored.revision
            document_name = json.loads(stored.document_json)['name']

    check(
        'B10 保存时改名撞上唯一约束回 409（对手确实在窗口里提交过）',
        fired and renamed.status_code == 409 and _field_of(renamed, 'detail') == NAME_CONFLICT_DETAIL,
        f'对手提交={fired}，{renamed.status_code} {_detail_of(renamed)}',
    )
    check(
        'B10 改名失败时整笔保存回滚：文档没写进去，revision 没推进',
        revision_after == 1 and document_name == '甲项目' and project_name == '甲项目',
        f'revision={revision_after} 文档名={document_name} 项目名={project_name}',
    )
    check(
        'B10 保存失败时不会去扰动 HA 连接（后台任务不该被排上）',
        refreshed == [],
        f'刷新调用={refreshed}',
    )


async def check_pairing_race_returns_409() -> None:
    """B12：同一个配对码被两个平板同时扫，输的那个要拿到 409，且不能顶掉先配好的那台。

    配对是免登录接口，门禁全靠「同一配对码只发一个令牌」这条。修复前「查有没有在用设备」
    与「插入/更新设备行」不是一个原子动作，因此存在两种坏结局：

    1. 两个请求都读到「没有设备」，都去插 → 撞 ``display_devices.pairing_code_id``
       唯一约束 → 500（用户看到「服务器内部错误」，而不是「这码已经被绑了」）；
    2. 两个请求都读到同一行**已解绑**的设备，都去复用 → 后提交的那个静默把令牌换掉，
       先配对成功的那台设备立刻失效（现象是「配对了但打不开」）。

    修复后用唯一约束裁决第 1 种，用「读到的 token_hash 做条件更新」裁决第 2 种：
    两种情况都回 409，且失败方不留下任何痕迹（不下发 Cookie、不改库）。
    """
    from datetime import datetime, timezone

    from sqlalchemy import update as sa_update

    from backend.app.api.displays import DEVICE_ALREADY_BOUND_DETAIL, PAIRING_SHARED_ADDRESS_LIMIT
    from backend.app.auth_limiter import BoundedAttemptLimiter, LoginAttemptLimiter
    from backend.app.dependencies import get_database_session
    from backend.app.global_log import RepeatedErrorTally
    from backend.app.models import DisplayDevice, DisplayPairingCode, Project
    from backend.app.security import session_token_hash

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-pair-race-') as tmp:
        (app, database, _cookie) = _projects_app(Path(tmp))
        with database.session_factory() as session:
            session.add(Project(id='proj-a', name='甲项目', slug='proj-a', created_by='u1'))
            session.commit()
            session.add(
                DisplayPairingCode(
                    id='pair-a',
                    code_hash=session_token_hash('654321'),
                    encrypted_code='encrypted',
                    name='走廊平板',
                    project_id='proj-a',
                    created_by='u1',
                )
            )
            session.commit()
        # 免登录接口的三档限流器都要在（这条检查只看并发裁决，但缺了状态会直接报错）。
        app.state.pairing_limiter = LoginAttemptLimiter(30, 60, 60)
        app.state.pairing_code_limiter = BoundedAttemptLimiter(5, 900, 900, max_keys=64)
        app.state.pairing_shared_limiter = LoginAttemptLimiter(*PAIRING_SHARED_ADDRESS_LIMIT)
        app.state.login_limiter = LoginAttemptLimiter()
        app.state.error_tally = RepeatedErrorTally()
        app.state.settings = replace(app.state.settings, trusted_proxies=())

        def rival_device(token: str):
            """对手「配对成功」：把设备行绑到这个码上（令牌与赢家不同）。"""

            def write() -> None:
                with database.session_factory() as rival_session:
                    rival_session.add(
                        DisplayDevice(
                            id='rival-device',
                            token_hash=session_token_hash(token),
                            pairing_code_id='pair-a',
                            project_id='proj-a',
                            name='对手平板',
                            created_at=now,
                            last_seen_at=now,
                        )
                    )
                    rival_session.commit()

            return write

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            # 1) 两边都读到「没有设备」，都去插：唯一约束裁决，输的那个拿 409。
            insert_rival = RivalWriteSession(database.session_factory(), rival_device('tok-rival'))
            app.dependency_overrides[get_database_session] = lambda: insert_rival
            try:
                lost = await client.post('/api/v1/displays/pair', json={'code': '654321'})
                fired_insert = insert_rival.fired
            finally:
                app.dependency_overrides.pop(get_database_session, None)
                insert_rival.close()

            with database.session_factory() as session:
                bound_after_insert = session.get(DisplayDevice, 'rival-device').token_hash
                device_rows = session.query(DisplayDevice).count()

            # 2) 两边都读到「同一行已解绑的设备」，都去复用：条件更新裁决，输的那个拿 409。
            with database.session_factory() as session:
                device = session.get(DisplayDevice, 'rival-device')
                device.revoked_at = now
                session.commit()
                stale_hash = device.token_hash

            def rebind_rival() -> None:
                """对手把那一行重新绑到自己的令牌上（模拟「同时解绑后又同时配对」）。"""
                with database.session_factory() as rival_session:
                    rival_session.execute(
                        sa_update(DisplayDevice)
                        .where(DisplayDevice.id == 'rival-device')
                        .values(token_hash=session_token_hash('tok-rival-2'), revoked_at=None)
                    )
                    rival_session.commit()

            cas_rival = RivalWriteSession(database.session_factory(), rebind_rival)
            app.dependency_overrides[get_database_session] = lambda: cas_rival
            try:
                lost_cas = await client.post('/api/v1/displays/pair', json={'code': '654321'})
                fired_cas = cas_rival.fired
            finally:
                app.dependency_overrides.pop(get_database_session, None)
                cas_rival.close()

            with database.session_factory() as session:
                final_hash = session.get(DisplayDevice, 'rival-device').token_hash
                final_revoked = session.get(DisplayDevice, 'rival-device').revoked_at

        cookie_name = app.state.settings.display_cookie_name

    check(
        'B12 两个平板同时插同一配对码：输的那个回 409 而不是 500（对手确实在窗口里提交过）',
        fired_insert
        and lost.status_code == 409
        and _field_of(lost, 'detail') == DEVICE_ALREADY_BOUND_DETAIL,
        f'对手提交={fired_insert}，{lost.status_code} {_detail_of(lost)[:40]}',
    )
    check(
        'B12 输的那个没有下发中控 Cookie（没配对成功就不该拿到令牌）',
        not lost.cookies.get(cookie_name) and not lost.headers.get('set-cookie'),
        f'cookies={dict(lost.cookies)} header={lost.headers.get("set-cookie")}',
    )
    check(
        'B12 库里的令牌仍是赢家那一枚（输的那个没顶掉先配好的设备）',
        bound_after_insert == session_token_hash('tok-rival') and device_rows == 1,
        f'落库令牌={bound_after_insert[:16]}… 设备行数={device_rows}',
    )
    check(
        'B12 复用已解绑那一行时用条件更新裁决：输的那个同样回 409',
        fired_cas and lost_cas.status_code == 409 and _field_of(lost_cas, 'detail') == DEVICE_ALREADY_BOUND_DETAIL,
        f'对手提交={fired_cas}，{lost_cas.status_code} {_detail_of(lost_cas)[:40]}',
    )
    check(
        'B12 条件更新失败后没有把令牌改回去（静默顶掉正是要避免的那件事）',
        final_hash == session_token_hash('tok-rival-2') and final_revoked is None and stale_hash != final_hash,
        f'最终令牌={final_hash[:16]}… 读到的旧令牌={stale_hash[:16]}… revoked={final_revoked}（应等于对手那一枚）',
    )


# --------------------------------------------------------------------------- #
# B7：草稿类请求体的字节上限与嵌套深度上限
# --------------------------------------------------------------------------- #
class _StubAsgiApp:
    """ASGI 桩：记下自己被调用了几次、读到的请求体是什么。

    中间件那一层要观测的正是「请求有没有进到应用里」，因此桩只需要把收到的
    体重读出来并回一个 200；重复调用 ``receive`` 的第二次结果也记下来，
    用来验证重放是幂等的（下游多读一次不该拿到空体）。
    """

    def __init__(self) -> None:
        self.calls = 0
        self.bodies: list[bytes] = []
        self.second_reads: list[bytes] = []

    async def __call__(self, scope, receive, send) -> None:
        self.calls += 1
        chunks: list[bytes] = []
        while True:
            message = await receive()
            if message['type'] != 'http.request':
                break
            chunks.append(message.get('body') or b'')
            if not message.get('more_body'):
                break
        self.bodies.append(b''.join(chunks))
        # 再读一次：ASGI 允许应用多次调用 receive，中间件的重放必须是幂等的。
        again = await receive()
        self.second_reads.append(again.get('body') or b'')
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        await send({'type': 'http.response.body', 'body': b'ok'})


async def _drive_guard(guard, path: str, method: str, chunks: list[bytes]):
    """直接跑一次 ASGI 调用，返回 (响应状态码, 桩应用, 还没被取走的请求体分块)。

    不经过 httpx：这条检查要数「哪些分块真的被中间件读掉了」，
    而 HTTP 客户端会把这件事藏起来。
    """
    pending = list(chunks)
    consumed: list[bytes] = []

    async def receive() -> dict[str, Any]:
        if pending:
            body = pending.pop(0)
            consumed.append(body)
            return {'type': 'http.request', 'body': body, 'more_body': bool(pending)}
        return {'type': 'http.request', 'body': b'', 'more_body': False}

    sent: list[dict[str, Any]] = []

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    scope = {'type': 'http', 'method': method, 'path': path, 'headers': [], 'query_string': b''}
    await guard(scope, receive, send)
    status_code = next((item['status'] for item in sent if item['type'] == 'http.response.start'), None)
    return (status_code, sent, pending)


async def check_draft_body_limits() -> None:
    """B7：草稿写接口的两道上限都必须在「读进内存 / 解析」之前生效。

    这两件事必须分开测，因为它们是两种完全不同的输入：

    1. 几百 MB 的请求体 —— 修好之前它会被整个读进内存并落进草稿列；
    2. 只有几 KB 但嵌套几千层 —— 字节上限完全拦不住，``json.loads`` 会先抛
       ``RecursionError``（未捕获 → 500，堆栈进全局日志）。深度上限必须在解析
       之前判，因此判据只能是「扫原始字节」，不能是「解析完再遍历」。

    中间件那一层用最直接的观测：请求有没有进到下游应用里（桩的 ``calls``）。
    进不去就说明拦在了该拦的位置；只断言状态码是不够的 —— 一个「先读全、再回 413」
    的实现同样能回 413，而内存峰值照样发生。
    """
    from backend.app.body_guard import (
        MAX_JSON_DEPTH,
        DraftBodyGuard,
        json_nesting_depth,
    )

    # —— 深度扫描器本身：括号在字符串里时必须不算深度 ——
    bracketed_in_string = json.dumps({'a': '[[[[[[[[[[', 'b': [1, [2]]}).encode()
    escaped_quote = b'{"a": "\\"[[[["}'
    check(
        'B7 深度扫描器数的是结构层级，字符串里的括号不算数',
        json_nesting_depth(bracketed_in_string) == 3
        and json_nesting_depth(b'[[[]]]') == 3
        and json_nesting_depth(escaped_quote) == 1,
        f'含括号字符串={json_nesting_depth(bracketed_in_string)}，'
        f'转义引号={json_nesting_depth(escaped_quote)}',
    )

    stub = _StubAsgiApp()
    guard = DraftBodyGuard(stub)
    draft_path = '/api/v1/projects/proj-a/draft'
    body = json.dumps({'revision': 1, 'document': {'a': [1, 2, 3]}}).encode()

    # —— 正常请求：照旧进路由，且请求体被完整重放（可重复读） ——
    (status, _sent, _left) = await _drive_guard(guard, draft_path, 'PUT', [body])
    check(
        'B7 正常草稿照旧放行，且请求体被完整重放给下游',
        status == 200 and stub.calls == 1 and stub.bodies == [body] and stub.second_reads == [body],
        f'状态={status} 调用={stub.calls} 重放={len(stub.bodies[0]) if stub.bodies else 0} 字节',
    )

    # —— 字节上限：分批送来也要拦住（分块传输没有 Content-Length 可看） ——
    stub_big = _StubAsgiApp()
    guard_big = DraftBodyGuard(stub_big)
    oversized = [b'x' * (3 * 1024 * 1024), b'y' * (3 * 1024 * 1024), b'z' * (3 * 1024 * 1024)]
    (status_big, sent_big, left_big) = await _drive_guard(guard_big, draft_path, 'PUT', oversized)
    check(
        'B7 超字节上限的请求回 413，且请求体没进到路由里',
        status_big == 413 and stub_big.calls == 0,
        f'状态={status_big} 路由调用={stub_big.calls}',
    )
    check(
        'B7 回 413 之前把剩余分块读完（否则连接上会残留半个请求体）',
        left_big == [] and '过大' in _detail_of_text(sent_big),
        f'剩余分块={len(left_big)} {_detail_of_text(sent_big)[:24]}',
    )

    # —— 深度上限：几 KB 就能打爆解析器，字节上限对此无能为力 ——
    stub_deep = _StubAsgiApp()
    guard_deep = DraftBodyGuard(stub_deep)
    deep = (b'[' * 2000) + (b']' * 2000)
    (status_deep, sent_deep, _left_deep) = await _drive_guard(guard_deep, draft_path, 'PUT', [deep])
    check(
        'B7 深到能打爆解析器的请求回 422（而不是 500 + RecursionError）',
        status_deep == 422 and stub_deep.calls == 0 and '嵌套' in _detail_of_text(sent_deep),
        f'状态={status_deep} 路由调用={stub_deep.calls} {_detail_of_text(sent_deep)[:40]}',
    )
    check(
        'B7 深度边界是按常量判的（正好等于上限放行，多一层才拒）',
        json_nesting_depth(b'[' * MAX_JSON_DEPTH + b']' * MAX_JSON_DEPTH) == MAX_JSON_DEPTH
        and json_nesting_depth(b'[' * (MAX_JSON_DEPTH + 1) + b']' * (MAX_JSON_DEPTH + 1)) == MAX_JSON_DEPTH + 1,
        f'上限={MAX_JSON_DEPTH}',
    )

    # —— 不在清单里的路径不该被缓冲（上传素材、导出 ZIP 要自己按块读） ——
    stub_other = _StubAsgiApp()
    guard_other = DraftBodyGuard(stub_other)
    (status_other, _sent_other, _left_other) = await _drive_guard(
        guard_other, '/api/v1/assets/user', 'POST', [b'first', b'second']
    )
    check(
        'B7 非草稿路径完全不碰请求体（原样交给调用方自己流式读）',
        status_other == 200 and stub_other.calls == 1 and stub_other.bodies == [b'firstsecond'],
        f'状态={status_other} 体={stub_other.bodies}',
    )

    # —— 接线：真应用里这条中间件真的挂着（在认证之前就拦得住） ——
    from backend.app.api.projects import serialize_document
    from backend.app.panel.documents import create_blank_project

    with tempfile.TemporaryDirectory(prefix='hb-body-guard-') as tmp:
        (app, database, cookie) = _projects_app(Path(tmp))
        document = create_blank_project('proj-a', '甲项目')
        _seed_project(database, 'proj-a', '甲项目', document_json=serialize_document(document))
        app.state.ha_connector = SimpleNamespace(refresh_persistent_entity_ids=lambda **_kwargs: None)
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            # 不带 Cookie：413 照样先出来，说明拦在认证之前（否则会是 401）。
            anonymous_big = await client.put(draft_path, content=b'x' * (9 * 1024 * 1024))
            anonymous_deep = await client.put(
                '/api/v1/studio3d', content=(b'[' * 2000) + (b']' * 2000)
            )
            normal = await client.put(
                draft_path,
                cookies=cookie,
                json={'revision': 1, 'globalPopupsDirty': False, 'document': document},
            )
    check(
        'B7 真应用里匿名超大请求回 413（拦在认证与读全请求体之前）',
        anonymous_big.status_code == 413 and '过大' in _detail_of(anonymous_big),
        f'{anonymous_big.status_code} {_detail_of(anonymous_big)[:40]}',
    )
    check(
        'B7 3D 草稿同样受深度上限约束（两个入口共用一套判据）',
        anonymous_deep.status_code == 422 and '嵌套' in _detail_of(anonymous_deep),
        f'{anonymous_deep.status_code} {_detail_of(anonymous_deep)[:40]}',
    )
    check(
        'B7 正常大小的草稿照旧保存成功（上限没把正常路径挡掉）',
        normal.status_code == 200 and _field_of(normal, 'revision') == 2,
        f'{normal.status_code} {_detail_of(normal)[:60]}',
    )


# --------------------------------------------------------------------------- #
# B14/B15：媒体代理的内存占用（快照缓存预算 + 非流式分支的透传）
# --------------------------------------------------------------------------- #
class _ChunkedUpstream:
    """上游桩：分块吐出内容，并记录「整包是否已经被读完」。

    断言靠的就是这个记录：旧实现先 ``upstream.content`` 读全再回响应，
    因此在客户端拿到第一个字节之前就已经是「读完」状态；逐块透传则相反。
    它不是「读源码猜实现」——两条路径在**可观测的时间点**上确实不同。
    """

    def __init__(self, chunks: list[bytes], status_code: int = 200) -> None:
        self.chunks = chunks
        self.status_code = status_code
        self.headers = {'content-type': 'image/jpeg'}
        self.finished = False

    async def aiter_raw(self):
        for chunk in self.chunks:
            yield chunk
        self.finished = True

    @property
    def content(self) -> bytes:
        """旧实现读的正是这个属性：一次拿到全部（因此这里标记已完成）。"""
        self.finished = True
        return b''.join(self.chunks)

    async def aclose(self) -> None:
        return None


class _FixedUpstreamClient(FakeAsyncClient):
    """``httpx.AsyncClient`` 替身：每次 ``send`` 都回同一个（分块的）上游响应。"""

    def __init__(self, upstream: _ChunkedUpstream, **_kwargs) -> None:
        super().__init__()
        self._upstream = upstream

    async def send(self, request, stream: bool = False):
        FakeAsyncClient.sent.append((request.method, request.url))
        return self._upstream


async def check_media_body_bounded() -> None:
    """B14/B15：媒体代理占用的内存必须由上限封住，而不是由上游给多大决定。

    两件事：
    - ``非流式分支``（B15）过去是 ``content = upstream.content``，一张几十 MB 的图
      或一个被指向大文件的 image_proxy 路径就能让一次请求把整包内容钉在内存里；
    - 快照缓存（B14）只有条数上限，64 张 4K 快照 ≈ 200 MB 常驻。

    判据刻意用「第一个字节交到客户端时，上游是否已经读完」：这比断言「有没有调
    aiter_raw」更结实 —— 一个「先读全、再分块 yield」的实现同样调了 aiter_raw，
    但内存峰值照样发生，而这里会照旧报红。
    """
    from backend.app.api import ha_proxy
    from backend.app.api.ha_proxy import _camera_snapshot_cache_bytes, _remember_camera_snapshot, camera_snapshot_cache

    fixture = await _build_media_proxy_fixture(Path(tempfile.mkdtemp(prefix='hb-media-bounded-')))
    fixture.app.state.active_viewer = 'a'
    original_httpx = ha_proxy.httpx
    saved_cache_bytes = ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES
    saved_cacheable = ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES
    camera_snapshot_cache.clear()
    try:
        # —— B15：分块透传，不在回响应之前读全 ——
        chunks = [b'a' * 1000, b'b' * 1000, b'c' * 1000]
        upstream = _ChunkedUpstream(chunks)
        ha_proxy.httpx = SimpleNamespace(
            AsyncClient=lambda **_kwargs: _FixedUpstreamClient(upstream), HTTPError=httpx.HTTPError
        )
        request = _request_with_chunks(
            fixture.app, '/api/camera_proxy/camera.a', {}, [], method='GET'
        )
        response = await ha_proxy.proxy_http(request)
        finished_before_first_read = upstream.finished
        iterator = response.body_iterator
        first = await iterator.__anext__()
        finished_when_first_byte_arrived = upstream.finished
        rest = b''
        async for chunk in iterator:
            rest += chunk
        body = first + rest
        check(
            'B15 非流式分支逐块透传（第一个字节到达客户端时上游还没读完）',
            not finished_before_first_read and not finished_when_first_byte_arrived,
            f'取第一块前已读完={finished_before_first_read} 第一块时已读完={finished_when_first_byte_arrived}',
        )
        check(
            'B15 透传的内容与上游完全一致，且读完才写缓存',
            body == b''.join(chunks) and upstream.finished,
            f'收到={len(body)} 字节（应为 {sum(len(item) for item in chunks)}）',
        )
        snapshot_key = ha_proxy.camera_snapshot_cache_key(
            'http://ha.test:8123', '/api/camera_proxy/camera.a'
        )
        check(
            'B15 完整读完的小图照旧写进快照缓存（第二次请求不再回源）',
            camera_snapshot_cache.get(snapshot_key) is not None
            and len(camera_snapshot_cache[snapshot_key].content) == len(body),
            f'缓存条目={len(camera_snapshot_cache)}',
        )

        # —— B14：单张可缓存上限（只能在 _remember_camera_snapshot 这一层观察） ——
        # 透传路径自己也会因为「攒不下」而放弃缓存，两处防守会互相掩盖：
        # 只改这里的话端到端看不出差别，所以直接调这一层。
        camera_snapshot_cache.clear()
        ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES = 1024
        _remember_camera_snapshot('huge', b'x' * 4096, 'image/jpeg')
        check(
            'B14 单张超过可缓存上限的图不进缓存（一条大图不会顶掉几十张小图）',
            camera_snapshot_cache == {},
            f'条目={sorted(camera_snapshot_cache)}',
        )
        _remember_camera_snapshot('exact', b'x' * 1024, 'image/jpeg')
        check(
            'B14 单张正好等于上限的图照旧进缓存（判据是「超过」，不是「达到」）',
            list(camera_snapshot_cache) == ['exact'],
            f'条目={sorted(camera_snapshot_cache)}',
        )

        # —— B14：端到端 —— 超限的快照照旧完整送到浏览器，只是不进缓存 ——
        upstream_big = _ChunkedUpstream([b'z' * 3000, b'y' * 3000])
        ha_proxy.httpx = SimpleNamespace(
            AsyncClient=lambda **_kwargs: _FixedUpstreamClient(upstream_big), HTTPError=httpx.HTTPError
        )
        camera_snapshot_cache.clear()
        big_request = _request_with_chunks(
            fixture.app, '/api/camera_proxy/camera.a', {}, [], method='GET'
        )
        big_response = await ha_proxy.proxy_http(big_request)
        big_body = b''.join([chunk async for chunk in big_response.body_iterator])
        check(
            'B14 超过单张可缓存上限的响应照旧完整透传，但不进缓存',
            big_body == b'z' * 3000 + b'y' * 3000 and camera_snapshot_cache == {},
            f'收到={len(big_body)} 字节 缓存条目={len(camera_snapshot_cache)}',
        )

        # —— B14：总字节预算 ——
        camera_snapshot_cache.clear()
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = 2048
        for index in range(3):
            _remember_camera_snapshot(f'key-{index}', b'x' * 1024, 'image/jpeg')
        check(
            'B14 总字节预算封住缓存：超预算时淘汰最旧的一条（不是只按条数算）',
            camera_snapshot_cache.get('key-0') is None
            and len(camera_snapshot_cache) == 2
            and _camera_snapshot_cache_bytes() <= 2048,
            f'条目={sorted(camera_snapshot_cache)} 占用={_camera_snapshot_cache_bytes()} 字节（预算 2048）',
        )
        _remember_camera_snapshot('only', b'x' * 1024, 'image/jpeg')
        check(
            'B14 预算小于单张上限时至少留一条（不会空转成什么都存不下）',
            len(camera_snapshot_cache) >= 1,
            f'条目={sorted(camera_snapshot_cache)}',
        )

        # —— B14：覆盖已有键不该把别人挤掉 ——
        # 缓存满时刷新同一张图是常态（TTL 8 秒，看板一直开着），把它算成「新增」
        # 的话，每次刷新都会顺手淘汰一条别的活跃图，缓存会自己把自己抖空。
        camera_snapshot_cache.clear()
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = 3072
        for index in range(3):
            _remember_camera_snapshot(f'live-{index}', b'x' * 1024, 'image/jpeg')
        _remember_camera_snapshot('live-2', b'x' * 1024, 'image/jpeg')
        check(
            'B14 预算刚好用满时刷新同一张图：只更新它自己，不淘汰别的活跃条目',
            sorted(camera_snapshot_cache) == ['live-0', 'live-1', 'live-2'],
            f'条目={sorted(camera_snapshot_cache)} 占用={_camera_snapshot_cache_bytes()} 字节',
        )
    finally:
        ha_proxy.httpx = original_httpx
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = saved_cache_bytes
        ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES = saved_cacheable
        camera_snapshot_cache.clear()


# --------------------------------------------------------------------------- #
# B13：日志接口的「一次快照 + 失效缓存」
# --------------------------------------------------------------------------- #
def _log_event(index: int, *, level: str = 'info') -> dict:
    """造一条形状合法的日志事件（字段与 append 写出的一致）。

    时间用「刚刚减几分钟」而不是写死日期：日志有保留期，写死的日期在别的日子跑
    自检时会被裁掉，断言就会莫名其妙地变红。
    """
    from datetime import datetime, timedelta, timezone

    return {
        'id': f'ev-{index}',
        'timestamp': (datetime.now(timezone.utc) - timedelta(minutes=index)).isoformat(),
        'level': level,
        'source': '系统后台',
        'category': '配置' if index % 2 else '接口',
        'message': f'第 {index} 条',
        'repeatCount': 1,
    }


def _write_log_file(store, events: list[dict]) -> None:
    """直接把事件写进日志文件：绕开写入线程，断言才不会受刷盘时机影响。"""
    store.path.write_text(
        '\n'.join(json.dumps(event, ensure_ascii=False) for event in events) + '\n',
        encoding='utf-8',
    )


async def check_log_events_snapshot_cached() -> None:
    """B13：日志列表一次请求只解析一遍文件，且解析结果带失效缓存。

    修好之前 ``/api/v1/logs`` 一次请求要调三次 ``list_events``（筛选后的全量、
    未筛选的全量、分类清单），每一次都把整个 JSONL 重解析并物化一遍 —— 日志文件
    越大，一次翻页的开销就越是随「整个文件」而不是「这一页」增长。

    观测量用 store 自带的 ``_parse_count``（与 ``_flush_count`` 同类的统计量）：
    它数的正是「文件真的被解析了几次」，命中缓存不算。断言「只有 1 次」比断言
    「响应内容对」更贴近这条缺陷 —— 内容一直是对的，只是代价随文件大小线性增长。
    """
    from backend.app.global_log import GlobalLogStore

    with tempfile.TemporaryDirectory(prefix='hb-log-snapshot-') as tmp:
        store = GlobalLogStore(Path(tmp))
        try:
            _write_log_file(store, [_log_event(index, level='warning' if index == 2 else 'info') for index in (1, 2, 3)])
            # 手动触发一次裁剪：它的首次调用会全量重写文件（mtime/代数都变），
            # 先让它跑掉，300 秒的节流窗口就从此开始计时，后台写线程不会再动文件。
            store.prune_now()
            baseline = store._parse_count

            snapshot = store.events_snapshot()
            parsed = store._parse_count - baseline
            # 同一个请求里的第二、三处查询复用同一份快照：不该再解析文件。
            filtered = store.list_events(level='warning', limit=None, events=snapshot)
            check(
                'B13 一次快照能同时喂给「筛选后的」与「未筛选的」两份结果（不再各解析一遍）',
                parsed == 1 and len(snapshot) == 3 and [item['id'] for item in filtered] == ['ev-2'],
                f'解析次数=+{parsed} 快照={len(snapshot)} 条 筛出={[item["id"] for item in filtered]}',
            )
            cached = store.events_snapshot()
            check(
                'B13 文件没变时重复取快照命中缓存（解析次数不涨）',
                store._parse_count - baseline == parsed and len(cached) == 3,
                f'解析次数=+{store._parse_count - baseline} 条数={len(cached)}',
            )

            with store.path.open('a', encoding='utf-8') as output:
                output.write(json.dumps(_log_event(4), ensure_ascii=False) + '\n')
            grown = store.events_snapshot()
            check(
                'B13 文件变了（写入线程追加）缓存立刻失效，新事件看得到',
                store._parse_count - baseline == parsed + 1 and len(grown) == 4,
                f'解析次数=+{store._parse_count - baseline} 条数={len(grown)}',
            )

            # 全量重写：mtime 与代数都会变，且缓存必须被丢掉。
            revision_before = store._file_revision
            store.clear()
            cleared = store.events_snapshot()
            check(
                'B13 全量重写（clear / 裁剪）后不会读到重写前的旧内容',
                store._file_revision == revision_before + 1 and cleared == [],
                f'代数 {revision_before}→{store._file_revision} 条数={len(cleared)}',
            )
        finally:
            store.stop()

        # —— 接线：真路由一次请求只调一次「读全部事件」（而不是三次） ——
        #
        # 这里数的是 ``_read_events`` 而不是文件解析次数：文件解析另有 mtime 缓存，
        # 只数解析次数的话，「不传快照、又调了两遍 list_events」会被缓存掩盖掉
        # —— 缺陷（同一请求重复干重活）就测不着了。
        (Path(tmp) / 'app').mkdir()
        (app, _database, cookie) = _projects_app(Path(tmp) / 'app')
        route_store = GlobalLogStore(Path(tmp) / 'route')
        try:
            _write_log_file(route_store, [_log_event(index) for index in (1, 2, 3)])
            route_store.prune_now()
            baseline = route_store._parse_count
            original_read_events = route_store._read_events
            reads: list[None] = []

            def counting_read(*, strict: bool = False):
                reads.append(None)
                return original_read_events(strict=strict)

            route_store._read_events = counting_read
            app.state.global_log = route_store
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
                page = await client.get('/api/v1/logs?limit=2', cookies=cookie)
                reads_in_first = len(reads)
                parsed = route_store._parse_count - baseline
                again = await client.get('/api/v1/logs?limit=2', cookies=cookie)
            check(
                'B13 列表接口一次请求只读一遍全部事件（筛选、总数、分类同源）',
                page.status_code == 200
                and reads_in_first == 1
                and _field_of(page, 'total') == 3
                and len(_field_of(page, 'items') or []) == 2
                and sorted(_field_of(page, 'categories') or []) == ['接口', '配置'],
                f'{page.status_code} 读全量={reads_in_first} 次 total={_field_of(page, "total")} '
                f'分类={_field_of(page, "categories")}',
            )
            check(
                'B13 第二次请求走缓存（文件不再重解析），内容照旧',
                again.status_code == 200 and route_store._parse_count - baseline == parsed,
                f'{again.status_code} 解析=+{route_store._parse_count - baseline}',
            )
        finally:
            route_store.stop()


def _detail_of_text(messages: list[dict[str, Any]]) -> str:
    """从一组 ASGI 发送消息里取出 JSON 错误体的 detail（非 JSON 时返回空串）。"""
    for item in messages:
        if item['type'] != 'http.response.body':
            continue
        try:
            payload = json.loads(item.get('body') or b'')
        except (TypeError, ValueError):
            continue
        if isinstance(payload, dict):
            return str(payload.get('detail') or '')
    return ''


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
    await check_interaction3d_scoping()
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
    check_lease_expiry_clock_skew()
    check_lease_sequence_selfheal()
    check_retry_after_counts_down()
    await check_binding_confirm_single_flight()
    await check_page_routes_throttled_confirm()
    check_export_rollback_error_chain()
    await check_anonymous_4xx_merged()
    await check_public_events_marked_and_capped()
    await check_health_probe_details_local_only()
    check_update_checks_opt_in()
    check_bounded_attempt_limiter()
    await check_pairing_code_attempt_budget()
    check_pair_shared_address_bucket()
    check_unique_violation_predicate()
    await check_duplicate_dirty_document_is_422()
    await check_project_conflicts_resolve_to_409()
    await check_rename_conflict_is_409_atomic()
    await check_pairing_race_returns_409()
    await check_draft_body_limits()
    await check_media_body_bounded()
    await check_log_events_snapshot_cached()
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
