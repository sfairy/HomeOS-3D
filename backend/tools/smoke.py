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
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
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
    # 媒体代理的记账挂在应用上（B57）：最小装置也必须自己建一份，否则路由会
    # AttributeError —— 这本身就是「它不再是模块级全局」的一个侧面证据。
    app.state.media_proxy = ha_proxy.MediaProxyCaches()

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
        app.state.media_proxy.remember_hls_stream('/api/hls/token-a/master.m3u8', 'camera.a')
        response = await _request(fixture, 'a', '/api/hls/token-a/segment/1.m4s')
        check(
            'B50 自己换来的 HLS 播放地址照旧可用（含片段请求）',
            response.status_code == 200,
            f'{response.status_code}',
        )
        scope = app.state.media_proxy.hls_scopes.get('token-a')
        check(
            'B50 HLS 的归属结论按项目缓存（避免每个分片都查库）',
            scope is not None and scope.verified_project == 'proj-a',
            f'verified_project={getattr(scope, "verified_project", None)!r}',
        )

        # 乙项目的令牌，甲项目不可用 —— 这正是「重放别人播放地址」的攻击面。
        app.state.media_proxy.remember_hls_stream('/api/hls/token-b/master.m3u8', 'camera.b')
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

        app.state.media_proxy.hls_scopes['token-a'].expires_at = _monotonic() + 1
        before = app.state.media_proxy.hls_entity_id('/api/hls/token-a/master.m3u8')
        renewed = app.state.media_proxy.hls_scopes['token-a'].expires_at - _monotonic()
        check(
            'B50 HLS 记账命中即续期（长播放不会中途被判成未登记）',
            before == 'camera.a' and renewed > ha_proxy.HLS_STREAM_SCOPE_TTL_SECONDS - 5,
            f'entity={before!r} 续期后剩余={renewed:.0f}s',
        )
        # 伪造一个已过期的登记，必须查不到（过期即失效）。
        app.state.media_proxy.hls_scopes['token-expired'] = ha_proxy.HlsStreamScope(
            entity_id='camera.a', expires_at=0.0001, verified_project='', verified_at=0.0
        )
        check(
            'B50 HLS 记账过期后查不到（不会无限期放行旧令牌）',
            app.state.media_proxy.hls_entity_id('/api/hls/token-expired/x.m3u8') is None,
            '过期登记已清除',
        )
        app.state.media_proxy.hls_scopes.pop('token-expired', None)

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
    caches = ha_proxy.MediaProxyCaches()
    saved = dict(caches.hls_scopes)
    try:
        caches.hls_scopes.clear()
        for index in range(ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES + 10):
            caches.remember_hls_stream(f'/api/hls/tok{index}/master.m3u8', 'camera.a')
        check(
            'B50 HLS 记账有条数上限（长期运行不会无限增长）',
            len(caches.hls_scopes) <= ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES,
            f'当前 {len(caches.hls_scopes)} 条，上限 {ha_proxy.HLS_STREAM_SCOPE_MAX_ENTRIES}',
        )
    finally:
        caches.hls_scopes.clear()
        caches.hls_scopes.update(saved)


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
        # 记账方法挂在应用自己的记账实例上（B57：``app.state.media_proxy.remember_hls_stream``），
        # 所以这里认属性调用；只认 Name 会在记账搬家之后变成一条永远为真的空断言。
        and isinstance(child.func, ast.Attribute)
        and child.func.attr == 'remember_hls_stream'
    ]
    check(
        'B50 发放 HLS 播放地址时登记了归属（漏了会让 HLS 静默回落成 MJPEG）',
        bool(calls),
        f'remember_hls_stream 调用点 {len(calls)} 处',
    )


# --------------------------------------------------------------------------- #
# B56 / B57：HA 请求级状态到底挂在谁身上
# --------------------------------------------------------------------------- #
async def check_media_proxy_state_ownership() -> None:
    """B57：媒体代理的两份记账必须跟着**应用实例**走，并在换连接时作废。

    模块级字典建立在「一个进程只有一个应用实例」这个假设上，而它在自检里就不成立
    —— ``create_app()`` 调两次（本文件好几处都这么干）会共享同一份缓存：第二个应用
    直接读到第一个应用缓存的画面。另外两处后果（刷新任务表里存的是绑在**另一个**事件
    循环上的 ``asyncio.Task``；换了一台 HA 之后仍发上一台的画面）没法在进程内直接
    观测，只能靠三件事的组合排除：记账挂在应用上、键里带连接身份、换连接时清空。
    因此这里逐条钉住，并在最后用真实路由观测「清空之后不再命中」。

    判定刻度用「上游被回源几次」而不是「有没有缓存对象」：用户看得见的现象是
    「换了一台 HA，看板还显示上一台的画面」，而不是某个 dict 存不存在。
    """
    from backend.app.api import ha_proxy
    from backend.app.main import create_app

    # —— 1) 模块级不能再留着那三份字典：它们存在本身就代表那个假设还在 ——
    leftovers = sorted(
        name
        for name in ('camera_snapshot_cache', 'camera_snapshot_refreshes', 'hls_stream_scopes')
        if hasattr(ha_proxy, name)
    )
    check(
        'B57 媒体代理记账不再是模块级字典（否则两个应用实例共享同一份缓存）',
        not leftovers,
        '只剩应用级记账' if not leftovers else f'仍是模块级：{leftovers}',
    )

    # —— 2) 两个应用实例各自持有一份，互不可见 ——
    first = create_app()
    second = create_app()
    check(
        'B57 两个应用实例各自持有一份媒体代理记账',
        first.state.media_proxy is not second.state.media_proxy,
        '两份独立记账' if first.state.media_proxy is not second.state.media_proxy else '共享同一份',
    )
    key = ha_proxy.camera_snapshot_cache_key(
        'conn-1', 'http://ha.test:8123', '/api/camera_proxy/camera.a'
    )
    first.state.media_proxy.remember_snapshot(key, b'\xff\xd8first', 'image/jpeg')
    first.state.media_proxy.remember_hls_stream('/api/hls/tok-first/master.m3u8', 'camera.a')
    leaked = (
        second.state.media_proxy.snapshot(key) is not None
        or second.state.media_proxy.hls_scope('tok-first') is not None
    )
    check(
        'B57 一个应用写入的快照与 HLS 归属不会被另一个应用读到',
        not leaked,
        '互不可见' if not leaked else '另一个应用读到了别人的画面 / 令牌归属',
    )

    # —— 3) 快照键带连接身份：换了一台 HA（地址可以不变）旧条目不可能被命中 ——
    same_address_other_instance = ha_proxy.camera_snapshot_cache_key(
        'conn-2', 'http://ha.test:8123', '/api/camera_proxy/camera.a'
    )
    check(
        'B57 换连接后旧快照条目不可能被命中（键里带连接身份）',
        same_address_other_instance != key,
        '键不同' if same_address_other_instance != key else '地址相同 + 键相同 = 会发上一台的画面',
    )

    # —— 4) 换连接时三份记账一起作废 ——
    caches = first.state.media_proxy
    caches.refreshes['k'] = SimpleNamespace(done=lambda: False)  # type: ignore[assignment]
    caches.remember_snapshot(key, b'\xff\xd8first', 'image/jpeg')
    caches.remember_hls_stream('/api/hls/tok-first/master.m3u8', 'camera.a')
    caches.clear()
    empty = not caches.snapshots and not caches.hls_scopes and not caches.refreshes
    check(
        'B57 连接被重建时清空快照、HLS 归属与刷新任务表',
        empty,
        '三份记账都空了' if empty else f'残留 {len(caches.snapshots)}/{len(caches.hls_scopes)}/{len(caches.refreshes)}',
    )

    # —— 5) 换连接真的会作废记账：调一次真实的 restart() ——
    # start()/stop() 换成桩：真跑会拉起常驻主循环（连 HA、轮询），自检里既慢又会留下
    # 孤儿任务；要观测的是「重建连接这条路径有没有碰到记账」，与主循环无关。
    invalidated = await _restart_invalidates_caches(first)
    check(
        'B57 连接器重建连接时作废记账（换了一台 HA 之后不再发上一台的画面）',
        invalidated,
        '重建后三份记账都空了' if invalidated else '重建后记账还在',
    )

    # —— 6) 接线：应用必须把「作废记账」这件事交给连接器 ——
    # 这条只能静态断言：连接器是在 lifespan 里造的，而整套 lifespan（HA 同步、更新
    # 检查）刻意不跑。守住的是「main.py 传了 on_reconnect = 记账的 clear」这个事实。
    problems = _reconnect_wiring_problems()
    check(
        'B57 main.py 把记账的 clear 接到了连接器的重建回调上',
        not problems,
        '接线完整' if not problems else '；'.join(problems),
    )


async def _restart_invalidates_caches(app: Any) -> bool:
    """调一次真实的 ``HAConnectorService.restart()``，看记账是否被清空。

    只把 ``start`` / ``stop`` 换掉（它们负责常驻主循环），``restart`` 本身按原样执行
    ——包括它调用回调的那一段。这样「重建连接 → 作废记账」是一条真实的执行路径，
    而不是「源码里还写着那句话」：写在死分支里的调用同样能通过静态断言。
    """
    from backend.app.database import Database
    from backend.app.ha.service import HAConnectorService

    caches = app.state.media_proxy
    caches.remember_snapshot(
        'conn-1|http://ha.test:8123/api/camera_proxy/camera.a', b'\xff\xd8old', 'image/jpeg'
    )
    caches.remember_hls_stream('/api/hls/tok-old/master.m3u8', 'camera.a')
    caches.refreshes['conn-1|pending'] = SimpleNamespace(done=lambda: False)  # type: ignore[assignment]
    # 连接器要一个数据库句柄，但 start/stop 被换掉之后它连一次都不会用到；
    # app.state.database 是 lifespan 才建的，这里自己开一个空库即可。
    with tempfile.TemporaryDirectory(prefix='hb-b57-reconnect-') as tmp:
        database = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        connector = HAConnectorService(app.state.settings, database, on_reconnect=caches.clear)
        connector.start = lambda: None  # type: ignore[method-assign]
        stopped: list[bool] = []

        async def stop() -> None:
            stopped.append(True)

        connector.stop = stop  # type: ignore[method-assign]
        await connector.restart()
    return bool(stopped) and not caches.snapshots and not caches.hls_scopes and not caches.refreshes


def _reconnect_wiring_problems() -> list[str]:
    """检查 B57 的接线：``main.py`` 传给连接器的是**记账的** ``clear``。"""
    problems: list[str] = []
    for path in sorted((PROJECT_ROOT / 'backend' / 'app').rglob('*.py')):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not (isinstance(node.func, ast.Name) and node.func.id == 'HAConnectorService'):
                continue
            for keyword in node.keywords:
                if keyword.arg != 'on_reconnect':
                    continue
                if (
                    isinstance(keyword.value, ast.Attribute)
                    and keyword.value.attr == 'clear'
                    and isinstance(keyword.value.value, ast.Attribute)
                    and keyword.value.value.attr == 'media_proxy'
                ):
                    return problems
    problems.append('没有任何地方把 media_proxy.clear 作为 on_reconnect 传给连接器')
    return problems


async def check_media_cache_invalidated_on_reconnect() -> None:
    """B57（用户看得见的那一半）：记账被清掉之后，下一次请求必须真的回源。

    前一条断言只说「字典空了」。这里走真实路由：同一张快照在 TTL 内必须命中缓存
    （上游只被回源一次），清空之后必须再回源一次 —— 「换了一台 HA 却继续发上一台的
    画面」在用户侧就是这一步没发生。
    """
    with tempfile.TemporaryDirectory(prefix='hb-media-reconnect-') as tmp:
        fixture = await _build_media_proxy_fixture(Path(tmp))
        path = '/api/camera_proxy/camera.a'
        before = len(FakeAsyncClient.sent)
        first = await _request(fixture, 'a', path)
        after_first = len(FakeAsyncClient.sent)
        second = await _request(fixture, 'a', path)
        after_second = len(FakeAsyncClient.sent)
        check(
            'B57 快照在 TTL 内命中缓存（同一次播放不会反复回源 HA）',
            first.status_code == 200 and second.status_code == 200 and after_second == after_first,
            f'{first.status_code}/{second.status_code}，回源 {after_first - before} → {after_second - before} 次',
        )
        # 连接被重建（换了一台 HA）之后：缓存必须不再命中，下次请求回源。
        fixture.app.state.media_proxy.clear()
        third = await _request(fixture, 'a', path)
        after_third = len(FakeAsyncClient.sent)
        check(
            'B57 连接被重建后旧画面不再被命中（清空记账 → 重新回源）',
            third.status_code == 200 and after_third == after_second + 1,
            f'{third.status_code}，清空前 {after_second - before} 次 → 清空后 {after_third - before} 次',
        )


def check_request_sessions_are_used() -> None:
    """B56：请求级 ``DatabaseSession`` 参数必须真的被用到。

    这个参数不是「顺便注入的句柄」：FastAPI 为它在每次请求上开一个会话并开启事务，
    请求结束再提交 —— 一个从不碰它的路由，等于给每个请求（含被前端高频轮询的
    ``/setup/status``，以及 media 代理这种长连接路由）白加一次事务、一条连接与一份
    写锁竞争；下游换了连接池上限之后，症状会是「什么都没做也把池占满」。

    用 AST 而不是逐个改：这类参数以 ``_`` 开头时语法上完全正常，评审也看不出问题，
    只有「它有没有被读过」这个事实能判定，而这件事机器比人可靠。
    """
    problems: list[str] = []
    for path in sorted((PROJECT_ROOT / 'backend' / 'app').rglob('*.py')):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            arguments = list(node.args.posonlyargs) + list(node.args.args) + list(node.args.kwonlyargs)
            sessions = [
                argument.arg
                for argument in arguments
                if argument.annotation is not None
                and 'DatabaseSession' in ast.unparse(argument.annotation)
            ]
            if not sessions:
                continue
            read = {
                inner.id
                for inner in ast.walk(node)
                if isinstance(inner, ast.Name) and isinstance(inner.ctx, ast.Load)
            }
            problems.extend(
                f'{path.relative_to(PROJECT_ROOT)}:{node.lineno} {node.name}() 的 {name} 从未被使用'
                for name in sessions
                if name not in read
            )
    check(
        'B56 没有「声明了请求级数据库会话却从不使用」的路由',
        not problems,
        '全部被使用' if not problems else '；'.join(problems[:6]),
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


def _module_level_definition_names(tree: ast.Module) -> list[str]:
    """列出模块最外层「绑定了一个名字」的定义：函数、类、常量赋值。

    带装饰器的定义跳过：``@router.get`` / ``@pytest.fixture`` 是把函数对象交给框架，
    名字不会再在代码里出现第二次，那是正常写法而不是死代码。
    只取 ``tree.body``（不再往 ``if`` / ``try`` 里递归）：块内定义各有各的条件，
    按「模块级」一刀切会把条件定义误判成死的。
    """
    names: list[str] = []
    for node in tree.body:
        if getattr(node, 'decorator_list', None):
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.Assign):
            names.extend(target.id for target in node.targets if isinstance(target, ast.Name))
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.append(node.target.id)
    return names


def check_no_dead_module_level_symbols() -> None:
    """P9：模块级不许再有「定义了却零引用」的名字（4.2 那一类的回归闸）。

    为什么不能交给 ruff：``F841`` 只管函数内的赋值、``F401`` 只管 import；一个没人
    调用的模块级函数或没人读的常量，ruff 默认**不报** —— 这正是 4.2 要人工清点的原因。
    而人工清单本身会过时：P9 复查时发现清单里的 ``require_document_changes``（早被
    ``projects.py`` 以别名导入）与 ``ORDER_ATTENTION_STATUSES`` 其实活着、``SESSION_COOKIE``
    与 4 处未使用导入早已不存在；反倒是清单外的 ``ACTION_TYPES``、``_ORDER_STATUS_LABELS``、
    ``floor_centi``、``CLIENT_VERSION_FALLBACK`` 是死的。清单会漂，这条断言不会。

    判据：把每个模块级名字拿去全仓 AST 里找引用。要同时认三种形态，少一种就会误杀：

    - ``ast.Name``（``Load``）—— 普通的名字使用；
    - ``ast.Attribute.attr`` —— ``money.to_centi(...)`` 里名字是**字符串**而不是 Name 节点；
    - ``ast.alias`` —— ``from x import y as z`` 同样只有字符串（``require_document_changes``
      正是靠这一条才算活的，否则会被误判成死代码）。

    注释与 docstring 里的同名文字不算引用，于是「唯一引用是自身 docstring」这种假活代码
    会当场现形。口径偏保守：同名**局部变量**的读也会被算成引用，宁可漏报也不误报。

    刻意的豁免（都在下面 ``exempt`` 里逐条写明理由）。
    """
    roots = [PROJECT_ROOT / name for name in ('backend', 'store', 'migrations', 'tools', 'docker')]
    paths = [path for root in roots if root.exists() for path in sorted(root.rglob('*.py'))]

    references: dict[str, int] = {}

    def count_reference(name: str) -> None:
        references[name] = references.get(name, 0) + 1

    definitions: list[tuple[str, str]] = []
    for path in paths:
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except (SyntaxError, UnicodeDecodeError):  # 语法问题交给语法检查去报
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                count_reference(node.id)
            elif isinstance(node, ast.Attribute):
                count_reference(node.attr)
            elif isinstance(node, ast.alias):
                count_reference(node.name.split('.')[-1])
                if node.asname:
                    count_reference(node.asname)
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                for name in node.names:
                    count_reference(name)
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        definitions.extend((relative, name) for name in _module_level_definition_names(tree))

    exempt = {
        # alembic：upgrade / downgrade 由迁移框架按名字取，revision 那几个是它的元数据。
        'revision', 'down_revision', 'branch_labels', 'depends_on', 'upgrade', 'downgrade',
        # 各脚本的命令行入口（`python -m ...` / 直接执行时按名字取）。
        'main',
        # studio3d.py 里有注释说明的**有意保留**：空清单等将来要校验固定文件时再用，
        # 现在删掉反而要改接口契约。不是漏删。
        'REQUIRED_EXPORT_FILES',
    }
    offenders = [
        f'{path}:{name}'
        for path, name in definitions
        if name not in exempt
        and not (name.startswith('__') and name.endswith('__'))
        and not references.get(name)
    ]
    check(
        'P9 模块级没有「定义了却零引用」的名字（注释 / docstring 里的同名文字不算引用）',
        not offenders,
        '；'.join(offenders[:6])
        if offenders
        else f'扫过 {len(paths)} 份 Python，{len(definitions)} 个模块级名字都有真实引用',
    )


def _is_overload_stub(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """``@overload`` 声明只有签名、没有实现，不算「又抄了一份」。

    它是给类型检查器看的重载表（``ensure_aware`` 就有两条：``datetime`` 进
    ``datetime`` 出、``None`` 进 ``None`` 出）。按「有几处 def」机械计数会把它
    当成三份实现，于是闸自己先红 —— 所以只数**有实现**的那一份。
    """
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        name = target.attr if isinstance(target, ast.Attribute) else getattr(target, 'id', '')
        if name == 'overload':
            return True
    return False


def _function_body_statements(source: str, node: ast.FunctionDef | ast.AsyncFunctionDef) -> str | None:
    """函数体（去掉 docstring）的源码文本；语句不足 3 条时返回 None。

    为什么要去掉 docstring：两侧对**同一件事**的解释常常写得不一样，而 P10 关心的是
    「行为是不是同一份实现」。docstring 参与比对会让真重复漏网 —— 实测
    ``http_security._is_trusted`` 与商店那份的说明文字就不同，只有去掉它才认得出来。

    阈值取 3 条语句，是为了放过**收敛完成后的正常形态**：合并过的校验器与
    ``@property`` 都只剩「docstring + 一行 return」，它们同名或不同名都不该再被点名。
    """
    body = list(node.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
            and isinstance(body[0].value.value, str):
        body = body[1:]
    if len(body) < 3:
        return None
    segments = [ast.get_source_segment(source, statement) for statement in body]
    if any(segment is None for segment in segments):
        return None
    return '\n'.join(segment.strip() for segment in segments)


#: P10 合并后必须**全仓只定义一次**的名字，以及它替代了哪几份。
DEDUPLICATED_SYMBOLS = {
    'ensure_aware': 'B58/A2：原 dependencies / api/auth / display_access / license.service 各一份，'
                    '另有 global_log 两处与 license.crypto 一处的内联同形判断',
    'load_active_connection_snapshot': 'A1：原 api/ha.py 与 api/ha_proxy.py 两份逐字节相同',
    'order_or_404': 'A3：原 store/api/admin.py 与 store/api/pages.py 两份逐字节相同',
    '_validated_device_name': 'A5：原 schemas.py 内四份（方法名 trim_pairing_name ×2 / '
                              'trim_device_name / trim_display_name），逐字节相同',
    '_validated_project_name': 'A5：原 schemas.py 内两份（ProjectCreateRequest / ProjectDuplicateRequest）',
}

#: P10 删掉的旧定义名。它们各自对应上面某个新名字，不许再加回来 ——
#: 换个文件抄一份纯文本搜不一定抓到，按名字查 AST 一定能。
REMOVED_DUPLICATE_SYMBOLS = ('_aware', '_order_or_404', 'load_active_connection')

#: 「函数体逐字节相同」口径下**允许**存在的重复：跨项目刻意重复（C 类）。
#: 两个服务独立部署、互不 import，合并才是错的；它们另有一致性测试兜底
#: （``check_request_security_parity``）。
EXACT_BODY_DUPLICATE_EXEMPT = (
    frozenset({'backend/app/http_security.py', 'store/request_security.py'}),
)


def _duplicate_locations_are_exempt(locations: list[str]) -> bool:
    """这组同体函数的定义点是否全部落在某个「刻意重复」的文件对里。"""
    files = {location.rsplit(':', 1)[0] for location in locations}
    return any(files <= pair for pair in EXACT_BODY_DUPLICATE_EXEMPT)


def check_no_duplicated_helper_implementations() -> None:
    """P10：合并过的助手全仓只此一份，且生产代码里不再有「函数体逐字节相同」的两份。

    为什么需要这条闸：4.3 的 A 类清单是人工按**名字**搜出来的，因此有两类会漏 ——
    不同名但同体（``trim_device_name`` / ``trim_display_name`` 就是，清单里完全没记），
    以及名字被别名绕开。更重要的是清单会漂：P10 复核时 A 类八项里，
    两项根本不是重复（``_product_or_404`` 两侧一个判 ``active`` 一个不判，
    ``number()`` 一个是 bool 校验器一个是 float 解析器）、一项是缺陷遗留而非重复
    （``_configure_sqlite``）、一项的前提已过期（``requestJson`` 的「两份都没超时」
    在 W1 之后不再成立）。清单会漂，这条断言不会。

    两个口径各管一段：

    * **点名**：``DEDUPLICATED_SYMBOLS`` 里的名字必须恰好一个 ``def``。抓住
      「把合并掉的实现又抄回来」，包括换个文件抄。
    * **通扫**：``backend`` / ``store`` 生产代码里，任意两个函数去掉 docstring 后
      函数体逐字节相同且至少 3 条语句，就算重复。这正是 4.4 给 A 类定的口径，
      也是唯一能发现上面那对**不同名**重复的办法。

    豁免只有 ``EXACT_BODY_DUPLICATE_EXEMPT`` 一处（C 类跨项目刻意重复，逐条写了理由）。
    ``tools/`` 目录不参与通扫：那里的桩与辅助函数天然长得像，且不进生产。
    """
    roots = [PROJECT_ROOT / name for name in ('backend', 'store')]
    paths = [
        path
        for root in roots
        if root.exists()
        for path in sorted(root.rglob('*.py'))
        if '/tools/' not in path.as_posix()
    ]

    definitions: dict[str, list[str]] = {}
    bodies: dict[str, list[str]] = {}
    for path in paths:
        source = path.read_text(encoding='utf-8')
        try:
            tree = ast.parse(source)
        except (SyntaxError, UnicodeDecodeError):  # 语法问题交给语法检查去报
            continue
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if _is_overload_stub(node):
                continue
            definitions.setdefault(node.name, []).append(f'{relative}:{node.lineno}')
            text = _function_body_statements(source, node)
            if text is not None:
                bodies.setdefault(hashlib.sha256(text.encode('utf-8')).hexdigest(), []).append(
                    f'{relative}:{node.lineno}'
                )

    # 1) 点名闸：合并过的名字必须还在，且只有一份。
    missing = [
        name for name in DEDUPLICATED_SYMBOLS
        if len(definitions.get(name, [])) != 1
    ]
    check(
        'P10 合并过的助手全仓只有一份实现（换个文件抄回来也会被发现）',
        not missing,
        '；'.join(f'{name} → {definitions.get(name) or "未找到"}' for name in missing)
        if missing
        else f'{len(DEDUPLICATED_SYMBOLS)} 个名字各只有一处定义',
    )

    # 2) 旧名字不许复活。
    resurrected = sorted(
        f'{name} → {definitions[name]}' for name in REMOVED_DUPLICATE_SYMBOLS if definitions.get(name)
    )
    check(
        'P10 被合并掉的旧定义名没有再加回来',
        not resurrected,
        '；'.join(resurrected) if resurrected else '；'.join(REMOVED_DUPLICATE_SYMBOLS),
    )

    # 3) 通扫：同体函数（去掉 docstring、≥3 条语句）不许有两份。
    duplicated = [
        locations
        for locations in bodies.values()
        if len(locations) > 1 and not _duplicate_locations_are_exempt(locations)
    ]
    check(
        'P10 生产代码里没有「去掉 docstring 后函数体逐字节相同」的两份实现',
        not duplicated,
        '；'.join('/'.join(locations) for locations in duplicated[:4])
        if duplicated
        else f'扫过 {len(paths)} 份 Python，{len(bodies)} 组函数体互不相同',
    )


#: P10 B 类（同名但语义不同）：全前端只允许在这些文件里**定义**这些助手。
#: 键是唯一实现所在的文件，值是它拥有的名字 —— 契约对照表写在各自的模块头里，
#: 这里只钉「定义点唯一」。
FRONTEND_HELPER_SINGLE_SOURCE = {
    'frontend/static/utils/numbers.js': (
        'clampNumber',
        'clampCoercedNumber',
        'clampOptionalNumber',
        'clampTypedNumber',
    ),
    'frontend/static/utils/colors.js': (
        'hexColorOrEmpty',
        'strictHexColorOrEmpty',
        'expandHexColorOrNull',
    ),
    'frontend/static/utils/entities.js': (
        'entitySearchText',
        'entitySearchTextOf',
        'entityDomainOf',
    ),
    'frontend/static/utils/apple-device.js': ('isAppleMobile',),
}

#: 被收敛掉的旧名字：**定义**不许再出现（注释里提它们是可以的 —— 注释不会被复制去调用）。
#: `clampNumber` 不在这个名单里：它作为「纯夹取」的唯一契约仍然存在，只是只准定义在
#: `utils/numbers.js`（见上面那张表）。
#: `flattenComponents` 同理不在名单里：`home.js` 那份仍然叫这个名字（展平控件树的
#: children），被改名的是 `dashboard-resize.js` 那份（展平文档顶层清单）——
#: 两份是**不同的知识**，改名的目的是让名字不再互相冒充，不是消掉其中一个。
FRONTEND_RETIRED_HELPER_NAMES = ('clampNumberOr', 'normalizeHexColor', 'normalizedHexColor')

#: 4.3 B 类里**改判为「两份不同的知识」**的同名族：各自只许在这些文件里定义。
#: 它们不是供 import 的助手，所以不参与上表的 import 规则 —— 这里钉的是「名字不再互相冒充」：
#: `home.js` 的 `flattenComponents` 展平的是**控件树的 children**（输入是控件数组），
#: `dashboard-resize.js` 的 `flattenDocumentComponents` 展平的是**文档顶层清单**（输入是
#: 整个文档、不下钻 children）。复核结论是两者不能互换，所以只把后者按实际语义改了名；
#: 谁把其中一个抄到别处、或按另一个的语义改写，这条就红。
FRONTEND_DISTINCT_HELPER_SITES = {
    'flattenComponents': 'frontend/static/home.js',
    'flattenDocumentComponents': 'frontend/static/dashboard-resize.js',
}

#: 定义点的四种写法：`function name(`、`const name =`、行首赋值 `name = (`、
#: 对象属性 `{ name: (`（把助手塞进对象字面量也是一份新实现）。
#: 只认这四种，是为了不被注释、字符串与调用点误伤（`clampNumber(1, 2, 3)` 不会命中）。
_FRONTEND_DEFINITION_PATTERNS = (
    r'(?:^|[^.\w])function\s+{name}\s*\(',
    r'(?:^|[^.\w])(?:const|let|var)\s+{name}\s*=',
    r'^\s*{name}\s*=\s*(?:async\s*)?(?:\(|function)',
    r'(?:^|[,{]\s*){name}\s*:\s*(?:async\s*)?(?:\(|function)',
)


def _frontend_helper_definitions(source: str, name: str) -> bool:
    """这段前端源码里有没有对 ``name`` 的定义（不是调用、不是注释里的提及）。"""
    # 用 replace 而不是 format：模式里带 `[,{]` 这类正则字符，format 会把它们当占位符。
    return any(
        re.search(pattern.replace('{name}', re.escape(name)), source, re.MULTILINE)
        for pattern in _FRONTEND_DEFINITION_PATTERNS
    )


def check_frontend_helper_contract_single_source() -> None:
    """P10-B：契约型助手的实现全前端只有一份，调用方只能 import。

    为什么需要这条闸：4.3 B 类记的是「同名但语义不同」—— ``clampNumber`` 原先在前端有
    五份（编辑器、3D 工作室两份、渲染器、导出预设）、``normalizeHexColor`` 有两份、
    ``entitySearchText`` 有三份、苹果移动端判定有三份，名字一样而参数顺序与非法值口径不同。
    这类重复的危害不在「代码多」，而在**照名字换一份去调用不会报错**：
    `clampNumber(v, 0, 100)` 落到四参那份上就是把下限当兜底；`entitySearchText` 换一份
    就漏掉小写化（调用方正则写着 `/i` 的那些不受影响，所以谁都没坏，直到有人照着名字
    换到不带 `i` 的调用点上）。收敛之后，两点必须长期成立：

    * **定义点唯一**：手册里的助手各自只在 ``utils/`` 下对应的那份文件里定义一次，
      别处再抄一份就红（点名，能发现「换个文件抄回来」）；
    * **只能 import**：任何文件要用手册里的名字，import 路径必须指向那份唯一实现 ——
      挡住「在 editor-utils 里转一手再导出」这种绕法（那是把定义点又拉回两份的常见形态）。

    另外还跑四条活体探针（``number-helpers`` / ``color-helpers`` / ``entity-helpers`` /
    ``apple-device``）：静态闸只能证明「只有一份」，「这一份的语义还是不是契约里写的那样」
    要靠把输入矩阵摆出来跑一遍 —— 把两份合并成一份、或者把参数顺序改回去，探针会红。

    边界如实写在这里：这条闸只认**登记在册的名字**。同名但以局部变量形态出现的知识
    （例如 ``renderer/*.js`` 里六处 ``const entityDomain = ...``）不在覆盖范围内 ——
    定义模式匹配分不出「局部变量」与「助手定义」，把它们登记进来会直接产生六条假红。
    那一族要不要合并是单独一项（见审计文档 4.3 B 类末尾）。
    """
    frontend_root = PROJECT_ROOT / 'frontend'
    expected = {
        name: relative
        for relative, names in FRONTEND_HELPER_SINGLE_SOURCE.items()
        for name in names
    }
    locations: dict[str, list[str]] = {name: [] for name in expected}
    distinct_sites: dict[str, list[str]] = {}
    retired: list[str] = []
    import_paths: list[str] = []
    dangling: list[str] = []
    owners = set(FRONTEND_HELPER_SINGLE_SOURCE)
    scanned = 0

    for path in sorted(frontend_root.rglob('*.js')):
        if '/vendor/' in path.as_posix():
            continue
        try:
            source = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:  # 前端资源里的二进制伪装交给语法门去报
            continue
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        scanned += 1
        for name in expected:
            if _frontend_helper_definitions(source, name):
                locations[name].append(relative)
        for name in FRONTEND_DISTINCT_HELPER_SITES:
            if _frontend_helper_definitions(source, name):
                distinct_sites.setdefault(name, []).append(relative)
        for name in FRONTEND_RETIRED_HELPER_NAMES:
            if _frontend_helper_definitions(source, name):
                retired.append(f'{name} → {relative}')
        imported_here: set[str] = set()
        # import { a, b } from "../../utils/numbers.js?v=..."：只查手册里的名字。
        # 连 `export { ... } from ...`（转手再导出）一起管 —— 那是把定义点拉回两份的常见形态。
        for imported_names, specifier in re.findall(
            r'(?:import|export)\s*\{([^}]*)\}\s*from\s*["\']([^"\']+)["\']', source, re.DOTALL
        ):
            for imported_name in imported_names.split(','):
                imported_name = imported_name.strip()
                if imported_name not in expected:
                    continue
                imported_here.add(imported_name)
                owner = expected[imported_name].rsplit('/', 1)[-1]
                if owner not in specifier:
                    import_paths.append(f'{relative}：{imported_name} ← {specifier}')
        # 调用点必须自己 import：删掉定义时最容易漏的就是调用方的 import 行，
        # 而那种代码在浏览器里是一句 ReferenceError（静态闸不查就一路静默到页面上）。
        if relative not in owners:
            for name in expected:
                if name in imported_here:
                    continue
                if re.search(rf'(?<![\w.]){re.escape(name)}\s*\(', source):
                    dangling.append(f'{relative}：调用 {name}() 但没有 import 它')

    # 1) 定义点唯一且落在手册指定的文件里。
    misplaced = [
        f'{name} → {sorted(set(places))}（应为 {expected[name]}）'
        for name, places in locations.items()
        if sorted(set(places)) != [expected[name]]
    ]
    check(
        'P10-B 契约型助手各只有一份实现，且只在 utils/ 下登记的那份文件里（夹取 / 颜色归一 / 实体文本与域 / 苹果设备判定）',
        not misplaced,
        '；'.join(misplaced) if misplaced else f'{len(expected)} 个契约助手各一处定义（扫过 {scanned} 份前端脚本）',
    )

    # 2) 旧名字的定义不许复活。
    check(
        'P10-B 被收敛掉的旧定义名（clampNumberOr / normalizeHexColor / normalizedHexColor）没有再加回来',
        not retired,
        '；'.join(retired) if retired else '；'.join(FRONTEND_RETIRED_HELPER_NAMES),
    )

    # 3) 调用方只能从唯一实现所在的模块 import，不许转手导出。
    check(
        'P10-B 这些助手的 import 只能指向唯一实现所在的 utils/ 模块（不许在别处转手导出）',
        not import_paths,
        '；'.join(import_paths[:6]) if import_paths else '所有 import 都指向唯一实现',
    )

    # 4) 调用点必须自己 import（删定义时最容易漏的那一行，漏了就是页面上的 ReferenceError）。
    check(
        'P10-B 每个调用点都 import 了它调用的契约助手（删定义时漏改调用方 = 页面 ReferenceError）',
        not dangling,
        '；'.join(dangling[:6]) if dangling else '所有调用点都有对应的 import',
    )

    # 5) 活体探针：语义是否仍是契约里那一套。
    _run_frontend_probe('number-helpers')
    _run_frontend_probe('color-helpers')
    _run_frontend_probe('entity-helpers')
    _run_frontend_probe('apple-device')

    # 6) 改判登记：这两份是**不同的知识**（不是同一份知识的两份副本），所以只改名、不合并。
    #    这条钉住「名字不再互相冒充」：任一名字被抄到别处、或有人把一份改成另一份的语义
    #    （例如给 dashboard 那份补上递归下钻 children），就会在这里现形。
    drifted_sites = [
        f'{name} → {sorted(set(distinct_sites.get(name, [])))}（应为 {[site]}）'
        for name, site in FRONTEND_DISTINCT_HELPER_SITES.items()
        if sorted(set(distinct_sites.get(name, []))) != [site]
    ]
    check(
        'P10-B 改判为「两份不同知识」的同名族各守自己的文件（flattenComponents 展平 children、flattenDocumentComponents 展平文档顶层）',
        not drifted_sites,
        '；'.join(drifted_sites)
        if drifted_sites
        else '；'.join(f'{name} → {site}' for name, site in FRONTEND_DISTINCT_HELPER_SITES.items()),
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


def _setup_privilege_request(peer: str | None, headers: dict[str, str] | None = None):
    """造一个只带「本机直连」判定所需字段的请求。

    ``peer=None`` 表示 ASGI scope 里**根本没有 client**（unix socket 部署、
    进程内调用）；``peer=''`` 表示有 client 对象但拿不到主机名。两者都要能摆出来，
    因为「拿不到对端」与「对端是本机」是两件事，而把前者当后者放行就是一个洞。
    """
    from starlette.requests import Request

    header_list = [(b'host', b'homeos.test')]
    for name, value in (headers or {}).items():
        header_list.append((name.encode('latin-1'), value.encode('latin-1')))
    scope = {
        'type': 'http',
        'method': 'POST',
        'path': '/api/v1/setup/admin',
        'query_string': b'',
        'scheme': 'http',
        'server': ('homeos.test', 80),
        'headers': header_list,
        'client': None if peer is None else (peer, 4321),
        'app': SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace())),
    }
    return Request(scope)


#: 「本机直连」判定的对照矩阵：(说明, 对端, 转发头, 期望放行)。
#:
#: 这一列是**安全承重**的：两个服务的首次初始化窗口（``SetupGuard.authorize``）都靠它
#: 决定「要不要引导密钥」，而它是「先到先得」窗口里唯一挡住匿名管理员创建的闸门。
#: 两侧各写一份实现（刻意互不 import），所以这里既比对两侧是否一致，也比对绝对期望 ——
#: 只比「双方一样」不够：两份一起错成同一个样子时，互比是绿的。
SETUP_PRIVILEGE_CASES: list[tuple[str, str | None, dict[str, str] | None, bool]] = [
    ('回环 IPv4 直连', '127.0.0.1', None, True),
    ('回环 IPv6 直连', '::1', None, True),
    ('字面 localhost 直连', 'localhost', None, True),
    ('回环但带 X-Forwarded-For（同机反代）', '127.0.0.1', {'x-forwarded-for': '203.0.113.9'}, False),
    ('回环但带 Forwarded', '127.0.0.1', {'forwarded': 'for=203.0.113.9'}, False),
    ('回环但带 X-Real-IP', '127.0.0.1', {'x-real-ip': '203.0.113.9'}, False),
    ('回环但带 X-Forwarded-Proto', '127.0.0.1', {'x-forwarded-proto': 'https'}, False),
    ('局域网对端', '192.168.1.50', None, False),
    ('公网对端', '203.0.113.9', None, False),
    ('公网对端自称转发头', '203.0.113.9', {'x-forwarded-for': '127.0.0.1'}, False),
    ('拿得到 client 但没有主机名', '', None, False),
    ('根本没有 client（unix socket / 进程内调用）', None, None, False),
    ('非 IP 的对端名（TestClient 的默认值）', 'testclient', None, False),
]


def check_setup_guard_privilege_parity() -> None:
    """4.3 C 类（``setup_guard``）：两套「本机直连」判定必须同口径。

    ``backend/app/http_security.is_direct_local`` 与 ``store/setup_guard.is_direct_local``
    是同一套规则的两份实现（两个服务独立部署、互不 import）。规则本身只有两句话
    ——「对端在回环表里，且没有任何转发头」—— 但它的**每一处出入都等于把匿名管理员
    创建重新开放给某类来源**，所以这里逐条比对，而不是靠「两份看起来一样」。

    ``store.setup_guard`` 的模块 docstring 早就写了「会用同步测试钉住两侧的行为一致」，
    B34（标记文件与指纹的出处判定）钉的是另一半；这一条补上承重的那半。

    顺带钉住两处**常量**：回环主机表与转发头清单。两份表若不一致，上面那条矩阵会在
    某一行变红，但红的是「行为」；这里让「表本身」也有一条独立的、说明更直白的断言。
    """
    from backend.app import http_security as backend_mod
    from store import request_security as store_security_mod
    from store import setup_guard as store_mod

    mismatches: list[str] = []
    for label, peer, headers, expected in SETUP_PRIVILEGE_CASES:
        request = _setup_privilege_request(peer, headers)
        backend_verdict = bool(backend_mod.is_direct_local(request))
        store_verdict = bool(store_mod.is_direct_local(_setup_privilege_request(peer, headers)))
        if backend_verdict != store_verdict:
            mismatches.append(f'{label}：backend={backend_verdict} store={store_verdict}')
        elif backend_verdict != expected:
            mismatches.append(f'{label}：两侧一致但都是 {backend_verdict}，期望 {expected}')

    check(
        '4.3-C 两服务的「本机直连」判定逐条一致，且都不把「拿不到对端」当本机',
        not mismatches,
        '；'.join(mismatches) if mismatches else f'{len(SETUP_PRIVILEGE_CASES)} 条来源矩阵全部一致',
    )

    check(
        '4.3-C 两服务的回环主机表与转发头清单是同一份知识',
        set(backend_mod.LOOPBACK_HOSTS) == set(store_mod.LOOPBACK_HOSTS)
        and tuple(backend_mod.FORWARDED_HEADERS) == tuple(store_security_mod.FORWARDED_HEADERS),
        f'回环 backend={sorted(backend_mod.LOOPBACK_HOSTS)} store={sorted(store_mod.LOOPBACK_HOSTS)}；'
        f'转发头 backend={backend_mod.FORWARDED_HEADERS} store={store_security_mod.FORWARDED_HEADERS}',
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


def _migration_head_revision() -> str:
    """从 ``migrations/versions`` 现算迁移链尾（head revision）。

    解析每个脚本自己声明的那两行 ``revision`` / ``down_revision``，取「没有任何脚本把它
    当上家」的那一个。刻意不写死字面量：那样每新增一个迁移，检查就会因为版本号过时而
    假红一次，而它真正要守的是「迁移跑到了链尾」。链尾不唯一（分支 / 多 head）时直接
    抛错 —— 含糊状态下给一个「通过」比红掉更糟。
    """
    import re

    versions_dir = PROJECT_ROOT / 'migrations' / 'versions'
    revisions: dict[str, str | None] = {}
    for path in sorted(versions_dir.glob('*.py')):
        text = path.read_text(encoding = 'utf-8')
        revision = re.search(r"^revision = '([^']+)'", text, re.MULTILINE)
        down_revision = re.search(r"^down_revision = (?:'([^']+)'|None)", text, re.MULTILINE)
        if revision is None or down_revision is None:
            continue
        revisions[revision.group(1)] = down_revision.group(1)
    parents = {value for value in revisions.values() if value is not None}
    heads = sorted(item for item in revisions if item not in parents)
    if len(heads) != 1:
        raise AssertionError(f'迁移链尾不唯一：{heads}')
    return heads[0]


def _background_tasks():
    """构造一个 ``BackgroundTasks`` 容器，给需要它的路由调用用。

    直接调路由函数时 FastAPI 不会替我们注入它（B42 的素材水位巡检就挂在它上面），
    因此这里显式给一个；容器本身是空的，不跑任何任务。
    """
    from fastapi import BackgroundTasks
    return BackgroundTasks()


def _request_with_chunks(
    app: Any,
    path: str,
    headers: dict[str, str],
    chunks: list[bytes],
    *,
    method: str = 'POST',
    query_string: str = '',
    no_content_length: bool = False,
):
    """拼一个真的 ``Request``（含可迭代的请求体），用来直接调路由函数。

    不经过 ASGI 应用是刻意的：这几条检查要观测「同步工作跑在哪个线程」，
    起一个完整的应用只会多出无关的中间件与生命周期，反而看不清。

    ``method`` / ``query_string`` 是给媒体代理那几条检查用的：它们走 GET，
    且要看查询串（``hb_live``）对缓存分支的影响。

    ``no_content_length=True`` 用来模拟分块传输（或长度头撒谎）的请求：这类请求上
    「按声明长度预判」的那道闸看不到任何长度，只能靠逐块累计兜住（B42 的总量配额）。
    """
    from starlette.requests import Request

    pending = list(chunks)
    if no_content_length:
        headers = {key: value for (key, value) in headers.items() if key.lower() != 'content-length'}

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
            # user_asset_bytes 是 B42 的总量配额要用的：桩目录永远是空的，返回 0。
            asset_catalog=SimpleNamespace(register_user=register_user, user_asset_bytes=lambda: 0),
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
            uploaded = await assets.upload_user_asset(request, _background_tasks(), None)
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
                await assets.upload_user_asset(bad_request, _background_tasks(), None)
            except Exception as error:  # noqa: BLE001 - 这里就是要看路由抛出的那个 4xx
                reject_status = getattr(error, 'status_code', None)
        finally:
            assets.validate_uploaded_image = original_validate

        stored = sorted(item.name for item in root.iterdir())
        # 从返回的 assetId 反推目录名：按名字排序取第一个会踩到 uuid 的随机顺序
        # （失败路径的目录若没被清掉，就可能排在前面）。
        stored_bytes = (root / uploaded['assetId'].removeprefix('user:') / '图.png').read_bytes()

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


async def check_anonymous_log_limit_before_filter() -> None:
    """B19：匿名日志的限流必须排在两个「直接 204 丢掉」的过滤之前。

    过滤是外部可控输入上的一道判断，而过滤之后的 204 意味着这条请求不消耗任何配额：
    只要把 level 填成 info（或把 page 填成白名单外的值），同一个来源就能无限次地调这个
    接口，限流器连一次都不会看到 —— 匿名通道的 10 条/分钟对这条路径等于不存在。

    两个出口各测一遍（level 被过滤 / page 被过滤）：前 10 次仍是 204（契约不变），
    第 11 次必须是 429；同时两个案例都不得写下任何一条日志 —— 先限流不等于放行。
    """
    from fastapi import FastAPI

    from backend.app.api.global_logs import router as global_logs_router
    from backend.app.config import load_settings
    from backend.app.database import Base, Database
    from backend.app.global_log import GlobalLogStore

    def build(root: Path):
        """拼一个只装日志路由的最小应用，返回 (app, store)。"""
        database = Database(f'sqlite:///{root / "app.db"}')
        Base.metadata.create_all(database.engine)
        store = GlobalLogStore(root / 'data')
        app = FastAPI()
        app.include_router(global_logs_router, prefix='/api/v1')
        app.state.database = database
        app.state.global_log = store
        app.state.admin_account = SimpleNamespace(user_id='u1', initialized=True)
        # 真 settings（判身份要用 cookie_name 这类字段），只清空可信代理让来源按 TCP 对端计。
        app.state.settings = replace(load_settings(), trusted_proxies=())
        return app, store

    async def post_eleven(app, payload: dict[str, Any]) -> tuple[list[int], list[dict[str, Any]]]:
        """同一来源连发 11 次，返回状态码序列与最终写下的日志条目。"""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            statuses = [
                (
                    await client.post(
                        '/api/v1/logs/public-events',
                        headers={'origin': 'http://app.test'},
                        json=payload,
                    )
                ).status_code
                for _ in range(11)
            ]
        return statuses, list(app.state.global_log.list_events(limit=None))

    with tempfile.TemporaryDirectory(prefix='hb-log-level-') as tmp:
        level_app, level_store = build(Path(tmp))
        # 案例一：level 过得了 schema（info）却不在公开通道允许的 error/warning 内。
        level_statuses, level_events = await post_eleven(
            level_app, {'level': 'info', 'message': '不该被记录的公开上报'}
        )
        level_store.stop()
    with tempfile.TemporaryDirectory(prefix='hb-log-page-') as tmp:
        page_app, page_store = build(Path(tmp))
        # 案例二：level 合规，但 page 不在白名单里 —— 同一个漏洞的第二个出口。
        page_statuses, page_events = await post_eleven(
            page_app, {'level': 'error', 'message': '页面不在白名单', 'context': {'page': '/admin'}}
        )
        page_store.stop()
    # 断言里写死 10 而不是引常量：拿常量当期望值等于自己证明自己。
    check(
        'B19 被 level 过滤掉的匿名上报照样消耗配额（第 11 次 429，而不是永远 204）',
        level_statuses == [204] * 10 + [429],
        f'{level_statuses}',
    )
    check(
        'B19 被 page 白名单过滤掉的匿名上报照样消耗配额（同一漏洞的第二个出口）',
        page_statuses == [204] * 10 + [429],
        f'{page_statuses}',
    )
    check(
        'B19 先限流不等于放行：被过滤的两种上报一条日志都没写',
        not level_events and not page_events,
        f'level 案例 {len(level_events)} 条、page 案例 {len(page_events)} 条',
    )


def check_empty_log_store_health() -> None:
    """空日志（一条都没写过）不是存储故障。

    写线程每次醒来都会进裁剪，而裁剪走的是 `_read_events(strict=True)` —— 日志文件还
    不存在时它会抛 FileNotFoundError，落到写线程的兜底 except 里被记成一次存储故障：
    `storage_status()['healthy']` 变 false、stderr 每 30 秒告警一次，直到第一条事件落盘
    （`/api/v1/logs` 的运维视图会一直显示「存储不可用」，而实际上一切正常）。

    观测：真起一个存储，等到写线程至少跑过一轮裁剪，再看健康状态 —— 修复前 healthy 是
    false 且 writeFailures 为 1。
    """
    from backend.app.global_log import GlobalLogStore

    failure = ''
    ran_prune = False
    healthy: dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix='hb-log-empty-') as tmp:
        # 整段生命周期都包起来：这类缺陷的症状就是「某个环节抛出来」，崩栈不该中断自检
        # （崩栈只说明路径炸了，变成一条红断言才说明这条不变量被观察着）。
        try:
            store = GlobalLogStore(Path(tmp) / 'data')
            # 写线程每 0.5 秒醒一次（空队列时只是空转，之后仍会进裁剪）。
            deadline = time.monotonic() + 2.0
            while store._last_pruned_at is None and time.monotonic() < deadline:
                time.sleep(0.01)
            ran_prune = store._last_pruned_at is not None
            healthy = store.storage_status()
            store.stop()
        except Exception as error:  # noqa: BLE001 —— 见上：异常要变成断言，不要中断自检
            failure = f'{type(error).__name__}: {error}'
    check(
        '空日志的裁剪只是空转，不是存储故障（healthy 为 true、告警计数为 0）',
        not failure
        and ran_prune
        and healthy.get('healthy') is True
        and healthy.get('writeFailures') == 0
        and healthy.get('lastError') is None,
        f'跑过裁剪 {ran_prune}，状态 {healthy}，异常 [{failure}]',
    )


def check_log_context_default_is_not_shared() -> None:
    """B44：``event_context`` 的默认值不能是可变对象。

    ContextVar 的默认值是**同一个对象**，`.get()` 会把它直接交到调用方手里。默认写成
    `{}` 时，任何一处「拿到就原地改」（`event_context.get()['phase'] = ...`）都会改掉这份
    共享字典 —— 而它正是所有没 set 过的上下文（别的请求、后台线程、后台任务）看到的那一份，
    症状是某次请求的字段出现在另一条无关日志上，且全程没有任何报错。默认改成 None 之后，
    那种写法会当场 TypeError（声音大、位置准），读处统一 ``or {}``。

    观测：全空上下文里取到的是 None、顺手原地改会抛而不是悄悄生效、改完别的上下文依旧干净；
    再跑真 append 确认「没有请求上下文」与「有请求上下文」两条读路径都正常。
    """
    import contextvars

    from backend.app import global_log as global_log_module
    from backend.app.global_log import GlobalLogStore

    # 用全新空 Context 而不是 copy_context()：要观察的正是「从没 set 过的上下文看到什么」。
    view = contextvars.Context().run(global_log_module.event_context.get)
    mutation = ''
    try:
        view['phase'] = 'boot'  # type: ignore[index] —— 这正是要拦住的写法
        mutation = '写入成功'
    except TypeError as error:
        mutation = type(error).__name__
    still_clean = contextvars.Context().run(global_log_module.event_context.get) is None
    check(
        'B44 没有共享的可变默认值：空上下文取到 None，顺手原地改会当场抛错',
        view is None and mutation == 'TypeError' and still_clean,
        f'取到 {view!r}，原地改的结果 {mutation}，另一个上下文仍然干净 {still_clean}',
    )

    with tempfile.TemporaryDirectory(prefix='hb-log-context-') as tmp:
        store = GlobalLogStore(Path(tmp) / 'data')
        bare = store.append('error', '自检', '并发', '没有请求上下文也要能写')
        token = global_log_module.event_context.set({'phase': 'boot', 'actor': '自检'})
        try:
            wrapped = store.append('error', '自检', '并发', '带上请求上下文')
        finally:
            global_log_module.event_context.reset(token)
        store.stop()
    check(
        'B44 读处统一 or {}：没上下文与有上下文两条路径都照常写入',
        bare.get('message') == '没有请求上下文也要能写'
        and 'phase' not in (bare.get('context') or {})
        and (wrapped.get('context') or {}).get('phase') == 'boot',
        f'无上下文 {bare.get("context")}，有上下文 {wrapped.get("context")}',
    )


def check_folded_snapshot_reuses_queue_slot() -> None:
    """B45：折叠窗口收尾时的最终快照要「原地替换」队列里同 id 的那条。

    待写队列是带 maxlen 的 deque，追加会挤掉最旧一条。而折叠出来的最终快照与队列里那条
    是**同一个 id**（折叠沿用首次的 id），追加进去等于用一格位置换一份同 id 的旧快照：
    刷盘按 id 去重取最新，多出来的那份根本不会写进文件，却把一条**别的**真实事件永久挤掉，
    同时 `_dropped_events` 还把这次丢弃记成「这条折叠事件被丢」，与事实相反 —— 磁盘上的
    repeatCount 偏低就是这么来的（该写的那份没占到位，别的先走了）。

    观测：把队列缩到 2 格并停掉写线程，塞进 A、B 两条（B 再折叠一次使同 id 的快照变新），
    再按「窗口已过期」交给收尾逻辑。修复后队列仍是 {A, B}、A 的消息真的落到文件里、
    B 的计数是最终值、丢弃计数为 0；修复前 A 会消失且丢弃计数为 1。
    """
    from collections import deque
    from datetime import timedelta

    from backend.app.global_log import GlobalLogStore

    with tempfile.TemporaryDirectory(prefix='hb-log-queue-') as tmp:
        store = GlobalLogStore(Path(tmp) / 'data')
        # 停掉后台写线程：否则它每 0.5 秒就把队列刷空，观察不到队列本身。
        store.stop()
        store._pending = deque(maxlen=2)
        store._dropped_events = 0
        store.append('error', '自检队列', '并发', 'A 的消息')
        folded = store.append('error', '自检队列', '并发', 'B 的消息')
        # 同签名 5 秒内再来一次：折叠沿用首次 id，且节流让它不再入队（队列里是旧快照）。
        again = store.append('error', '自检队列', '并发', 'B 的消息')
        same_id = folded['id'] == again['id'] and again.get('repeatCount') == 2
        with store._lock:
            # 把折叠表整体按「窗口已过期」交给收尾逻辑（真流程里由写线程按 5 秒窗口调用）。
            store._recent_events = {
                signature: (seen_at - timedelta(seconds=store.FOLD_WINDOW_SECONDS + 1), event)
                for signature, (seen_at, event) in store._recent_events.items()
            }
            store._expire_recent_locked()
            store._flush_locked()
        on_disk = {str(item.get('message')): item for item in store.list_events(limit=None)}
        dropped = store._dropped_events
        store.stop()
    check(
        'B45 折叠收尾是替换同 id 那条，不是追加（不挤掉别的真实事件）',
        set(on_disk) == {'A 的消息', 'B 的消息'} and dropped == 0,
        f'磁盘上的消息 {sorted(on_disk)}，丢弃计数 {dropped}，折叠沿用了同一 id {same_id}',
    )
    check(
        'B45 最终快照进了队列：磁盘上的 repeatCount 就是窗口内的真实次数',
        (on_disk.get('B 的消息') or {}).get('repeatCount') == 2,
        f"B 的 repeatCount={(on_disk.get('B 的消息') or {}).get('repeatCount')}",
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


# --------------------------------------------------------------------------- #
# B33：限流器的键空间必须有上限
# --------------------------------------------------------------------------- #
def check_limiter_key_bound() -> None:
    """B33：限流器内部的键空间必须封顶，键就是外部输入时尤其如此。

    键常常直接来自外部（被猜的用户名、被磨的配对码、请求对端地址），而清理原先只
    发生在「同一个键被再次查询」的时候：攻击者一直换新键，这些记录就再也不会被
    访问、也就永远不会被清掉，内存只涨不落。这里用可拨的时钟盯四件事：数量封顶、
    封禁中的键优先保留、过期记录会被扫掉、以及**最新的封禁不会被更早的封禁挤掉**
    （丢的是最快解封的那个，保护损失最小）。
    """
    from backend.app import auth_limiter
    from backend.app.auth_limiter import (
        MAX_TRACKED_KEYS,
        TRIM_STEP_RATIO,
        LoginAttemptLimiter,
    )

    # 允许临时多攒一个步长才会再扫一次，因此上限是 max_keys + 一个步长。
    bound = 8 + max(1, 8 // TRIM_STEP_RATIO)
    clock = {'now': 1000.0}
    real_monotonic = auth_limiter.monotonic
    auth_limiter.monotonic = lambda: clock['now']
    try:
        flood = LoginAttemptLimiter(3, 900, 900, max_keys=8)
        for index in range(400):
            flood.record_failure(f'user-{index}')
        flooded = flood.tracked_keys()

        # 「只错一次」的键（未封禁）不该挤掉封禁中的键。
        victim = LoginAttemptLimiter(5, 900, 900, max_keys=8)
        for _ in range(5):
            victim.record_failure('victim')
        for index in range(200):
            victim.record_failure(f'single-{index}')
        victim_blocked = victim.blocked('victim')

        # 窗口过了的记录等于不存在，清扫时应当被丢掉。
        expired = LoginAttemptLimiter(5, 60, 60, max_keys=8)
        for index in range(40):
            expired.record_failure(f'old-{index}')
        clock['now'] += 600
        for index in range(40, 60):
            expired.record_failure(f'old-{index}')
        expired_tracked = expired.tracked_keys()

        # 全是封禁中的键时：按「最快解封」丢，刚封上的那个因此留得住。
        all_blocked = LoginAttemptLimiter(1, 900, 900, max_keys=4)
        for index in range(30):
            all_blocked.record_failure(f'blocked-{index}')
        latest_blocked = all_blocked.blocked('blocked-29')
        all_blocked_tracked = all_blocked.tracked_keys()
        default_keys = LoginAttemptLimiter().max_keys
    finally:
        auth_limiter.monotonic = real_monotonic

    check(
        'B33 限流器键数量封顶（一直换新键不再是无界增长）',
        flooded <= bound,
        f'记了 400 个键后仍只留 {flooded} 个（上限 {bound}）',
    )
    check(
        'B33 封禁中的键不会被「只错一次」的新键挤掉（淘汰优先丢没封禁的）',
        victim_blocked is True,
        f'200 个新键之后 victim blocked={victim_blocked}',
    )
    check(
        'B33 窗口外的记录在清扫时被丢掉（过期即不存在）',
        expired_tracked <= bound,
        f'40 个键过了 10 倍窗口后剩 {expired_tracked} 个（上限 {bound}）',
    )
    check(
        'B33 全是封禁键时丢最快解封的：刚封上的那个留得住',
        latest_blocked is True and all_blocked_tracked <= 4 + max(1, 4 // TRIM_STEP_RATIO),
        f'最新封禁 blocked={latest_blocked}，留了 {all_blocked_tracked} 个键',
    )
    check(
        'B33 默认上限取自模块常量（默认构造出的限流器同样有界）',
        default_keys == MAX_TRACKED_KEYS,
        f'默认 max_keys={default_keys}，常量={MAX_TRACKED_KEYS}',
    )


# --------------------------------------------------------------------------- #
# B8：信任锚与加密身份每进程只读一次
# --------------------------------------------------------------------------- #
def check_trust_anchor_memory() -> None:
    """B8：公钥与 Fernet 密钥只允许在进程内读一次。

    原先每个请求都要重读并重新解析签名公钥 PEM（验签落在每个带会话 Cookie 的请求
    上），每个加解密还要走一遍「mkdir + chmod + exists + read」。缓存本身不好直接
    断言，于是用行为来观测：**把磁盘上的公钥换掉**，已加载的锚必须照旧有效 ——
    反过来说，用新钥签的租约必须验不过（运行期换钥不生效，换钥要重启）。
    """

    import base64
    import re

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from backend.app import secret_key_file
    from backend.app.ha.crypto import CredentialCipher
    from backend.app.license.crypto import LeaseVerifier, LicenseCryptoError, SecretCipher

    def public_pem(private_key: Ed25519PrivateKey) -> bytes:
        return private_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )

    def signed_lease(private_key: Ed25519PrivateKey, body: dict) -> str:
        payload_bytes = json.dumps(body).encode('utf-8')
        encoded = base64.urlsafe_b64encode(payload_bytes).rstrip(b'=').decode('ascii')
        signature = base64.urlsafe_b64encode(private_key.sign(payload_bytes)).rstrip(b'=').decode('ascii')
        return f'{encoded}.{signature}'

    def outcome(verifier: LeaseVerifier, lease: str) -> str:
        try:
            verifier.verify(lease, 'instance-1')
        except LicenseCryptoError as error:
            return f'拒绝（{error}）'
        return '通过'

    body = {
        'keyId': 'test-key',
        'product': 'homeos',
        'instanceId': 'instance-1',
        'leaseId': 'lease-1',
        'features': ['api'],
        'products': [],
        'issuedAt': '2026-09-18T00:00:00Z',
        'expiresAt': '2030-09-18T00:00:00Z',
        'sessionId': 'session-1',
        'leaseSequence': 3,
        'activationCodeId': 'code-1',
    }

    with tempfile.TemporaryDirectory(prefix='hb-b8-') as tmp:
        root = Path(tmp)
        anchor = root / 'anchor.pem'
        original = Ed25519PrivateKey.generate()
        anchor.write_bytes(public_pem(original))
        verifier = LeaseVerifier(trusted_keys={'test-key': (anchor, None)}, product='homeos')
        lease = signed_lease(original, body)
        first = outcome(verifier, lease)

        # 换掉磁盘上的公钥文件：内存里那把锚不受影响，新钥签的租约也不该被接受。
        replacement = Ed25519PrivateKey.generate()
        anchor.write_bytes(public_pem(replacement))
        after_swap = outcome(verifier, lease)
        forged = outcome(verifier, signed_lease(replacement, body))

        # Fernet 密钥：两个不同实例、两种用途，每个路径只允许碰一次盘。
        seen: dict[str, int] = {}
        real_read = secret_key_file._read_or_create_secret_key

        def counted(path, *, error_factory, empty_message):
            seen[str(path)] = seen.get(str(path), 0) + 1
            return real_read(path, error_factory=error_factory, empty_message=empty_message)

        credential_path = root / 'ha' / 'credential.key'
        secret_path = root / 'license.key'
        secret_key_file._read_or_create_secret_key = counted
        try:
            secret = SecretCipher(secret_path)
            sealed = secret.encrypt('session-token')
            for _ in range(5):
                secret.decrypt(sealed)
            reopened = SecretCipher(secret_path).decrypt(sealed)
            credential = CredentialCipher(credential_path)
            credential_sealed = credential.encrypt('ha-token')
            credential_reopened = CredentialCipher(credential_path).decrypt(credential_sealed)
        finally:
            secret_key_file._read_or_create_secret_key = real_read
        secret_reads = seen.get(str(secret_path), 0)
        credential_reads = seen.get(str(credential_path), 0)

    check(
        'B8 信任锚首次验签照常通过（缓存不改变验签结果）',
        first == '通过',
        f'结果 {first}',
    )
    check(
        'B8 公钥按 keyId 缓存在内存里：磁盘上的文件被换掉后，原租约照旧验过',
        after_swap == '通过',
        f'换文件之后结果 {after_swap}',
    )
    check(
        'B8 缓存同时挡住「运行期换钥」：换钥必须重启才生效（否则换得掉 keys/ 里的文件就能伪造租约）',
        forged.startswith('拒绝'),
        f'用新公钥签的租约结果 {forged}',
    )
    check(
        'B8 落库凭证密钥每进程只读一次（第二个 cipher 实例也不再碰盘）',
        secret_reads == 1 and reopened == 'session-token',
        f'碰盘 {secret_reads} 次；跨实例解密结果 {reopened!r}',
    )
    check(
        'B8 HA 凭据密钥路径同样只读一次',
        credential_reads == 1 and credential_reopened == 'ha-token',
        f'碰盘 {credential_reads} 次；跨实例解密结果 {credential_reopened!r}',
    )

    # 结构面：两个 cipher 都必须走共享的带缓存入口，密钥文件本身不再被直接读。
    # 用负向后顾排除 public_key_path（那是公钥，读法不同、也不该被这条断言管）。
    for relative in ('backend/app/ha/crypto.py', 'backend/app/license/crypto.py'):
        source = (PROJECT_ROOT / relative).read_text(encoding='utf-8')
        direct_read = re.search(r'(?<![\w.])key_path\.read_bytes', source)
        check(
            f'B8 加解密走共享的带缓存加载入口，密钥文件不再被直接读（{relative}）',
            'load_or_create_secret_key(' in source and direct_read is None,
            f'第 {direct_read.start() if direct_read else "?"} 行仍在直接读 key_path',
        )


# --------------------------------------------------------------------------- #
# B20：图标库元数据缓存要跟着文件走
# --------------------------------------------------------------------------- #
def check_icon_metadata_refresh() -> None:
    """B20：图标库元数据的缓存必须跟着文件内容走，原地更新要能立刻生效。

    缓存键原先只有路径，于是「换掉 meta.json」这件事永远看不见 —— 症状是
    「新图标搜不到、旧图标搜得到」，而磁盘上明明已经是新文件。这里盯三件事：内容
    不变时命中缓存（不重复解析）、文件变了必须重新解析（大小变了、以及**大小相同
    只有内容变**）、缓存表按路径只有一格（更新是替换而不是不断累积）。
    """
    import os

    from backend.app.api import icons as icons_module

    def write_meta(path: Path, names: list[str]) -> None:
        path.write_text(
            json.dumps([{'name': name, 'aliases': [], 'tags': []} for name in names]),
            encoding='utf-8',
        )

    with tempfile.TemporaryDirectory(prefix='hb-icons-') as tmp:
        meta = Path(tmp) / 'meta.json'
        write_meta(meta, ['home', 'home-outline'])
        first = icons_module._mdi_metadata(meta)
        again = icons_module._mdi_metadata(meta)
        slots_when_cached = len(icons_module._mdi_metadata_cache)

        # 原地更新，名字更长 → 字节数也变。
        write_meta(meta, ['home', 'home-outline', 'home-plus'])
        grown = [item['name'] for item in icons_module._mdi_metadata(meta)]

        # 大小完全相同、只有内容不同（home-plus → home-minus）：只能靠 mtime 看出来。
        write_meta(meta, ['home', 'home-outline', 'home-minus'])
        stamp = time.time() + 5
        os.utime(meta, ns=(int(stamp * 10**9), int(stamp * 10**9)))
        replaced = [item['name'] for item in icons_module._mdi_metadata(meta)]
        slots_after_updates = len(icons_module._mdi_metadata_cache)

    check(
        'B20 内容不变时命中缓存（同一个对象，没有重复解析）',
        first is again and slots_when_cached == 1,
        f'两次取到同一对象={first is again}，缓存格数={slots_when_cached}',
    )
    check(
        'B20 文件被原地更新（字节数变化）后重新解析',
        grown == ['home', 'home-outline', 'home-plus'],
        f'结果 {grown}',
    )
    check(
        'B20 字节数相同、只有内容与 mtime 变了也要重新解析',
        replaced == ['home', 'home-outline', 'home-minus'],
        f'结果 {replaced}',
    )
    check(
        'B20 缓存按路径只留一格（原地更新是替换，不随更新次数累积）',
        slots_after_updates == 1,
        f'更新两次之后缓存格数={slots_after_updates}',
    )


# --------------------------------------------------------------------------- #
# B26 / B59：渲染缓存读路径不加排他锁、淘汰排序在任何并列下都成立
# --------------------------------------------------------------------------- #
def check_render_cache_read_lock() -> None:
    """B26/B59：渲染缓存的读路径与淘汰排序。

    读缓存原先也抢整目录**排他**锁，而且顺手做了一次全量 glob + stat：任何一张缓存
    图命中都要把它之后的读与写排成一队，写路径的淘汰（O(n) 扫目录）也让读者陪等。
    这里盯两件事：锁的类型（写排他、读共享）与读路径的动作（只 stat + 读一个文件，
    不扫全目录、不删文件）；另外盯淘汰排序在**并列条目**（同 mtime 同 size）下的
    行为 —— 原先那种情况会拿 Path 对象比大小，抛 TypeError，让触发淘汰的那次写入
    变成 500（B59）。
    """
    import os
    import re
    from PIL import Image

    from backend.app import file_lock as file_lock_module
    from backend.app.modules.interaction3d import render_cache

    def path_of(data_dir: Path, seed: str) -> Path:
        """造一条形态合法的缓存路径（键必须是 64 位十六进制）。"""
        return render_cache.cache_path(data_dir, _scene_id(seed), 'project-1', (seed * 64)[:64])

    with tempfile.TemporaryDirectory(prefix='hb-render-cache-') as tmp:
        data_dir = Path(tmp) / 'data'
        source = Path(tmp) / 'layer.png'
        Image.new('RGB', (8, 8), (12, 34, 56)).save(source, format='PNG')
        png = source.read_bytes()

        first = path_of(data_dir, 'a1')
        render_cache.write_cache(first, png)

        # —— 锁的类型：写排他、读共享 ——
        # 平台分支现在只有一份（file_lock 模块），因此 spy 挂在它引用的 fcntl 上。
        flags: list[str] = []
        fcntl_module = getattr(file_lock_module, 'fcntl', None)
        if fcntl_module is not None:
            real_flock = fcntl_module.flock

            def spy(handle, operation):
                if operation == fcntl_module.LOCK_SH:
                    flags.append('SH')
                elif operation == fcntl_module.LOCK_EX:
                    flags.append('EX')
                # 解锁（LOCK_UN）不计入：这里要观测的是「谁用哪种锁」。
                return real_flock(handle, operation)

            fcntl_module.flock = spy
            try:
                render_cache.write_cache(path_of(data_dir, 'a2'), png)
                render_cache.read_cache(first)
            finally:
                fcntl_module.flock = real_flock

        # —— 读路径不许扫全目录 ——
        glob_calls = {'count': 0}
        real_glob = Path.glob

        def counting_glob(self, *args, **kwargs):
            glob_calls['count'] += 1
            return real_glob(self, *args, **kwargs)

        Path.glob = counting_glob
        try:
            hit = render_cache.read_cache(first)
        finally:
            Path.glob = real_glob

        # —— 过期条目：按未命中返回，且读路径不删它（删除交给写路径的淘汰） ——
        stale = path_of(data_dir, 'b1')
        render_cache.write_cache(stale, png)
        long_ago = time.time() - render_cache.MAX_AGE_SECONDS - 10
        os.utime(stale, (long_ago, long_ago))
        stale_miss = render_cache.read_cache(stale)
        stale_kept = stale.exists()
        render_cache.write_cache(path_of(data_dir, 'b2'), png)
        stale_reclaimed = not stale.exists()

        # —— B59：并列条目（同 mtime、同 size）触发淘汰 ——
        # 单独用一个干净的缓存目录，好让淘汰顺序完全由并列怎么比决定：三条并列
        # （c1/c2/c3，mtime 与字节数完全相同）+ 一条更旧（c0），上限压到 3，再写入
        # 一条触发淘汰 —— 要淘汰两条：先淘汰最旧的 c0，再淘汰并列里的第一条。
        # 旧写法在第二步就会拿 Path 对象比大小、抛 TypeError（B59），新写法按
        # 完整路径字符串收尾，留下并列里路径较大的那两条。
        tie_dir = Path(tmp) / 'data-ties'
        tied = []
        for seed in ('c1', 'c2', 'c3'):
            candidate = path_of(tie_dir, seed)
            render_cache.write_cache(candidate, png)
            tied.append(candidate)
        oldest = path_of(tie_dir, 'c0')
        render_cache.write_cache(oldest, png)
        pinned = int(time.time()) - 100
        for candidate in [*tied, oldest]:
            os.utime(candidate, ns=(pinned * 10**9, pinned * 10**9))
        trigger = path_of(tie_dir, 'c9')
        real_entries, real_bytes = render_cache.MAX_ENTRIES, render_cache.MAX_CACHE_BYTES
        render_cache.MAX_ENTRIES, render_cache.MAX_CACHE_BYTES = 3, 1024**3
        evicted = '通过'
        try:
            render_cache.write_cache(trigger, png)
        except Exception as error:  # noqa: BLE001 - 崩栈也折成观测量，否则牙齿测试看不见 [FAIL]
            evicted = f'崩：{type(error).__name__}'
        finally:
            render_cache.MAX_ENTRIES, render_cache.MAX_CACHE_BYTES = real_entries, real_bytes
        survivors = sorted(item.name for item in trigger.parent.parent.glob('*/*.png'))
        # 期望：最旧的 c0 先走，再走并列里按**完整路径字符串**排最小的那条；
        # 并列里路径较大的两条留下（第三键就是完整路径，见 render_cache 里的注释）。
        expected_survivors = sorted([trigger.name, *(item.name for item in sorted(tied, key=str)[1:])])

    if fcntl_module is not None:
        check(
            'B26 写缓存持排他锁、读缓存只持共享锁（读不再与读互斥）',
            flags == ['EX', 'SH'],
            f'加锁依次为 {flags}（期望写 EX、读 SH）',
        )
    check(
        'B26 读路径命中时只 stat + 读一个文件：不扫全目录、不删文件',
        hit == png and glob_calls['count'] == 0 and stale_kept,
        f'命中={hit == png}，glob 调用 {glob_calls["count"]} 次，过期文件还在={stale_kept}',
    )
    check(
        'B26 过期条目按未命中返回，并交给下一次写入的淘汰收走（不在盘上赖着）',
        stale_miss is None and stale_reclaimed,
        f'读结果={stale_miss}，随后的写入把它清掉了={stale_reclaimed}',
    )
    check(
        'B59 并列条目（同 mtime 同 size）触发淘汰时，留下的是最新的那几条（顺序确定）',
        evicted == '通过' and survivors == expected_survivors,
        f'{evicted}；幸存 {survivors}（期望 {expected_survivors}）',
    )
    # 结构面：并列时的判据必须写在明面上。审计原文说旧写法会抛 TypeError —— 实测
    # 不成立（CPython 给 PurePath 定义了全序），所以这条断言的可观测内容是「显式
    # key」这件事本身：把判据退回隐式的元组比较就报红（牙齿测试以此为据）。
    render_source = (PROJECT_ROOT / 'backend/app/modules/interaction3d/render_cache.py').read_text(
        encoding='utf-8'
    )
    explicit_key = re.search(
        r'sorted\(\s*entries,\s*key=lambda item: \(item\[0\], item\[1\], str\(item\[2\]\)\)\s*\)',
        render_source,
    )
    check(
        'B59 淘汰排序显式给出第三键（完整路径字符串唯一，并列时不会掉进目录顺序）',
        explicit_key is not None,
        f'第 {explicit_key.start() if explicit_key else "?"} 行的淘汰排序没有显式 key',
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

    async def confirm_binding() -> None:
        """读草稿前的那次联网确认：测试里直接放行（B4 起的节流窗口不在这里测）。"""
        return None

    app.state.license_service = SimpleNamespace(
        allows=lambda _code: True,
        status=lambda: {'status': 'ACTIVE'},
        confirm_binding=confirm_binding,
    )
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


def _alias_rows(database) -> list[tuple[str, str]]:
    """读出旧地址别名表（按写入顺序），供 B38 的断言直接比对。"""
    from backend.app.models import ProjectPathAlias

    with database.session_factory() as session:
        return [
            (row.name, row.project_id)
            for row in session.query(ProjectPathAlias).order_by(ProjectPathAlias.id)
        ]


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
            # B54：读路径也走同一个解析入口 —— 损坏草稿要报错而不是回一份空文档
            # （空文档会让编辑器照着空白项目继续编辑，下一次保存就把坏数据盖掉了）。
            cut_draft = await client.get('/api/v1/projects/proj-cut/draft', cookies=cookie)
            ok_draft = await client.get('/api/v1/projects/proj-ok/draft', cookies=cookie)

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
        'B54 读草稿也走同一个入口：损坏时回 422 而不是一份空文档',
        cut_draft.status_code == 422
        and _field_of(cut_draft, 'detail') == '当前草稿内容已损坏，请从备份恢复。'
        and ok_draft.status_code == 200,
        f'坏草稿={cut_draft.status_code} {_detail_of(cut_draft)[:24]}，好草稿={ok_draft.status_code}',
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

    fixture = await _build_media_proxy_fixture(Path(tempfile.mkdtemp(prefix='hb-media-bounded-')))
    fixture.app.state.active_viewer = 'a'
    # B14 的几条只能在「写入缓存的唯一入口」这一层观察：透传路径自己也会因为
    # 「攒不下」而放弃缓存，两处防守会互相掩盖，端到端看不出差别。但被观察的必须
    # 是**路由真正在用的那一份**记账（app.state.media_proxy），否则断言的是另一个
    # 对象，B57 想让两条测试互相独立都做不到。
    caches = fixture.app.state.media_proxy
    original_httpx = ha_proxy.httpx
    saved_cache_bytes = ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES
    saved_cacheable = ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES
    caches.snapshots.clear()
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
            'conn-1', 'http://ha.test:8123', '/api/camera_proxy/camera.a'
        )
        check(
            'B15 完整读完的小图照旧写进快照缓存（第二次请求不再回源）',
            caches.snapshot(snapshot_key) is not None
            and len(caches.snapshots[snapshot_key].content) == len(body),
            f'缓存条目={len(caches.snapshots)}',
        )

        # —— B14：单张可缓存上限（只能在 remember_snapshot 这一层观察） ——
        # 透传路径自己也会因为「攒不下」而放弃缓存，两处防守会互相掩盖：
        # 只改这里的话端到端看不出差别，所以直接调这一层。
        caches.snapshots.clear()
        ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES = 1024
        caches.remember_snapshot('huge', b'x' * 4096, 'image/jpeg')
        check(
            'B14 单张超过可缓存上限的图不进缓存（一条大图不会顶掉几十张小图）',
            caches.snapshots == {},
            f'条目={sorted(caches.snapshots)}',
        )
        caches.remember_snapshot('exact', b'x' * 1024, 'image/jpeg')
        check(
            'B14 单张正好等于上限的图照旧进缓存（判据是「超过」，不是「达到」）',
            list(caches.snapshots) == ['exact'],
            f'条目={sorted(caches.snapshots)}',
        )

        # —— B14：端到端 —— 超限的快照照旧完整送到浏览器，只是不进缓存 ——
        upstream_big = _ChunkedUpstream([b'z' * 3000, b'y' * 3000])
        ha_proxy.httpx = SimpleNamespace(
            AsyncClient=lambda **_kwargs: _FixedUpstreamClient(upstream_big), HTTPError=httpx.HTTPError
        )
        caches.snapshots.clear()
        big_request = _request_with_chunks(
            fixture.app, '/api/camera_proxy/camera.a', {}, [], method='GET'
        )
        big_response = await ha_proxy.proxy_http(big_request)
        big_body = b''.join([chunk async for chunk in big_response.body_iterator])
        check(
            'B14 超过单张可缓存上限的响应照旧完整透传，但不进缓存',
            big_body == b'z' * 3000 + b'y' * 3000 and caches.snapshots == {},
            f'收到={len(big_body)} 字节 缓存条目={len(caches.snapshots)}',
        )

        # —— B14：总字节预算 ——
        caches.snapshots.clear()
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = 2048
        for index in range(3):
            caches.remember_snapshot(f'key-{index}', b'x' * 1024, 'image/jpeg')
        check(
            'B14 总字节预算封住缓存：超预算时淘汰最旧的一条（不是只按条数算）',
            caches.snapshots.get('key-0') is None
            and len(caches.snapshots) == 2
            and caches.snapshot_bytes() <= 2048,
            f'条目={sorted(caches.snapshots)} 占用={caches.snapshot_bytes()} 字节（预算 2048）',
        )
        caches.remember_snapshot('only', b'x' * 1024, 'image/jpeg')
        check(
            'B14 预算小于单张上限时至少留一条（不会空转成什么都存不下）',
            len(caches.snapshots) >= 1,
            f'条目={sorted(caches.snapshots)}',
        )

        # —— B14：覆盖已有键不该把别人挤掉 ——
        # 缓存满时刷新同一张图是常态（TTL 8 秒，看板一直开着），把它算成「新增」
        # 的话，每次刷新都会顺手淘汰一条别的活跃图，缓存会自己把自己抖空。
        caches.snapshots.clear()
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = 3072
        for index in range(3):
            caches.remember_snapshot(f'live-{index}', b'x' * 1024, 'image/jpeg')
        caches.remember_snapshot('live-2', b'x' * 1024, 'image/jpeg')
        check(
            'B14 预算刚好用满时刷新同一张图：只更新它自己，不淘汰别的活跃条目',
            sorted(caches.snapshots) == ['live-0', 'live-1', 'live-2'],
            f'条目={sorted(caches.snapshots)} 占用={caches.snapshot_bytes()} 字节',
        )
    finally:
        ha_proxy.httpx = original_httpx
        ha_proxy.CAMERA_SNAPSHOT_CACHE_MAX_BYTES = saved_cache_bytes
        ha_proxy.CAMERA_SNAPSHOT_MAX_CACHEABLE_BYTES = saved_cacheable
        caches.snapshots.clear()


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


async def check_panel_document_validation() -> None:
    """B21 / B22 / B23：文档里的「引用」必须真的存在，且实体 ID 与写入端同一把尺子。

    这三项都在同一个地方出错：**读取端与写入端的判据不一致**。

    - B21：``defaultPagePath`` 只判了长度，没判它指向的页面是否存在，于是能存下
      「打开就是空白」的默认页；
    - B22：读取端收实体用的是「含点即算实体」的宽松判据，于是任何带点的字符串
      （标题、说明文案、自定义字段）都会进入 `document_entity_ids` —— 而这个集合
      同时决定中控设备**能看到哪些实体**与**要订阅哪些状态**，放宽一格就是放宽一格
      可见范围；
    - B23：实体 ID 正则没有长度上限，``"a" * 一千万 + ".b"`` 这种「合法实体 ID」
      会被收进同一个集合。

    因此这里的断言刻意**成对**：写入端拒绝的值，读取端也必须不认；长度在边界内
    的照旧认得（避免修成「一律不认」把正常实体挡在门外）。
    """
    from backend.app.panel.action_rules import valid_entity_id, valid_ha_entity_id
    from backend.app.panel.entity_refs import document_entity_ids
    from backend.app.panel.schema import validate_panel_document

    def document(**extra) -> dict:
        """一份最小合法文档，用来只改动要测的那个字段。"""
        return {
            'schemaVersion': 1,
            'projectId': 'p1',
            'name': '示例',
            'pages': [
                {'id': 'home', 'name': '首页', 'path': 'home'},
                {'id': 'room', 'name': '房间', 'path': 'room'},
            ],
            **extra,
        }

    # —— B21 默认页：指向不存在的路径必须拒绝，空白归一成「没设」 ——
    def stored_default_page(value: str) -> str:
        """存一次默认页，把结果折成观测值：路径本身 / 拒绝 / 未设。"""
        try:
            saved = validate_panel_document(document(defaultPagePath=value))
        except ValueError as error:
            return '拒绝' if '默认页' in str(error) else f'别的原因：{error}'
        return saved.get('defaultPagePath', '未设')

    check(
        'B21 默认页指向不存在的页面时拒绝保存（否则展示页打开即空白）',
        stored_default_page('gone') == '拒绝',
        f'结果 {stored_default_page("gone")}',
    )
    check(
        'B21 默认页指向存在的页面时照旧保存',
        stored_default_page('room') == 'room',
        f'结果 {stored_default_page("room")}',
    )
    check(
        'B21 空白默认页归一成「没设」并剔除（清空默认页这个动作要能保存）',
        stored_default_page('   ') == '未设',
        f'结果 {stored_default_page("   ")}',
    )

    # —— B22 实体判据：与写入端（EntityBinding 校验）同一把尺子 ——
    # 「客厅.主灯」是那个必须成对的样本：写入端一直拒绝它（不是合法 HA 实体 ID），
    # 而读取端过去会因为「含点」把它收进可见范围。
    # 脏值必须挂在「键名以 entityId 结尾」的字段下 —— 那才是扫描真正会看的位置
    # （挂在 title / version 下，宽松判据也扫不到，等于没测着）。
    junk_document = {
        'pages': [
            {
                'panels': [
                    {
                        'bindings': {'main': {'entityId': 'light.kitchen'}},
                        'properties': {
                            'titleEntityId': '客厅.主灯',
                            'noteEntityIds': ['v1.2.3', 'light.kitchen_2'],
                        },
                    }
                ]
            }
        ]
    }
    bound = document_entity_ids(junk_document)
    check(
        'B22 含点但不是实体 ID 的字符串不再进可见范围 / 订阅集（客厅.主灯 / v1.2.3）',
        bound == {'light.kitchen', 'light.kitchen_2'},
        f'结果 {sorted(bound)}',
    )
    rejected_by_writer = False
    try:
        validate_panel_document(
            document(
                pages=[
                    {
                        'id': 'home',
                        'name': '首页',
                        'path': 'home',
                        'components': [
                            {
                                'id': 'c1',
                                'type': 'light',
                                'bindings': {'main': {'entityId': '客厅.主灯'}},
                            }
                        ],
                    }
                ]
            )
        )
    except ValueError:
        rejected_by_writer = True
    check(
        'B22 写入端拒绝的实体 ID，读取端也不认（两端同一把尺子）',
        rejected_by_writer and '客厅.主灯' not in document_entity_ids({'a': {'entityId': '客厅.主灯'}}),
        f'写入端拒绝={rejected_by_writer}',
    )
    virtual_and_empty = document_entity_ids(
        {'a': {'entityId': 'virtual.light.abc'}, 'b': {'entityId': ''}}
    )
    check(
        'B22 虚拟实体与空值照旧不收（渲染器自维护的 scope 不是 HA 实体）',
        virtual_and_empty == set(),
        f'结果 {sorted(virtual_and_empty)}',
    )

    # —— B22 隐式 sun：天气控件必须有太阳实体，但绑定值不合法时不能照抄 ——
    unbound_sun = document_entity_ids({'x': [{'type': 'weather'}]})
    bound_sun = document_entity_ids(
        {'x': [{'type': 'weather', 'bindings': {'sun': {'entityId': 'sun.mine'}}}]}
    )
    junk_sun = document_entity_ids(
        {'x': [{'type': 'weather', 'bindings': {'sun': {'entityId': '客厅.太阳'}}}]}
    )
    check(
        'B22 天气控件的隐式 sun：未绑用 sun.sun，绑了合法用绑定的，绑了垃圾退回 sun.sun',
        unbound_sun == {'sun.sun'} and bound_sun == {'sun.mine'} and junk_sun == {'sun.sun'},
        f'{sorted(unbound_sun)} / {sorted(bound_sun)} / {sorted(junk_sun)}',
    )

    # —— B23 长度上限：两段都要限住，且不能把正常长度误伤 ——
    max_length = 200
    boundary = (
        valid_ha_entity_id('light.' + 'a' * max_length),
        valid_ha_entity_id('light.' + 'a' * (max_length + 1)),
        valid_ha_entity_id('a' * max_length + '.light'),
        valid_ha_entity_id('a' * (max_length + 1) + '.light'),
    )
    check(
        'B23 实体 ID 的长度上限是按常量判的（200 放行、201 拒绝）',
        boundary == (True, False, True, False),
        f'对象段 {max_length}/{max_length + 1}={boundary[0]}/{boundary[1]}，域段={boundary[2]}/{boundary[3]}',
    )
    virtual_boundary = (
        valid_entity_id('virtual.light.' + 'a' * max_length),
        valid_entity_id('virtual.light.' + 'a' * (max_length + 1)),
    )
    check(
        'B23 虚拟实体同样限长（两段都是 200）',
        virtual_boundary == (True, False),
        f'{max_length}/{max_length + 1}={virtual_boundary[0]}/{virtual_boundary[1]}',
    )
    huge = {'a': {'entityId': 'light.' + 'x' * 100000}}
    check(
        'B23 超长实体 ID 不再被收进可见范围 / 订阅集',
        document_entity_ids(huge) == set(),
        f'结果 {len(document_entity_ids(huge))} 条',
    )


async def check_declared_input_constraints() -> None:
    """B49 / B54 / B60：输入边界与「草稿解析」都要收在一个入口里。

    - B49：3D 草稿的体积与嵌套深度上限原先只写在这条路由上（ASGI 中间件 + 写盘函数），
      直接挂路由器的应用没有这层保护 —— 几 KB 的深层嵌套就能把 ``json.loads`` 打爆；
    - B54：``json.loads(draft.document_json)`` 在十几个地方各抄一遍，兜底各不相同；
    - B60：``min_length=1`` 判的是未去空白前的原值，``" "`` 能过，随后被存成空名字。

    断言按「可观测」写：B49 用**没有中间件**的裸应用发真请求；B54 先用源码扫描钉住
    「全仓库只有一处解析入口」，再验证那个入口的两种语义；B60 直接看校验结果。
    """
    from fastapi import FastAPI, HTTPException

    from backend.app import body_guard
    from backend.app import schemas
    from backend.app.api import studio3d
    from backend.app.dependencies import licensed_user

    # —— B49 常量同源：中间件、schema、写盘三处必须是同一个数字 ——
    check(
        'B49 草稿上限只有一个定义（schema 与中间件/写盘共用同一批常量）',
        schemas.MAX_SCENE_DOCUMENT_BYTES is body_guard.MAX_SCENE_DOCUMENT_BYTES
        and schemas.MAX_JSON_DEPTH is body_guard.MAX_JSON_DEPTH
        and studio3d.MAX_DRAFT_BYTES == body_guard.MAX_SCENE_DOCUMENT_BYTES
        and body_guard.draft_body_limit('/api/v1/studio3d', 'PUT')
        == body_guard.MAX_SCENE_DOCUMENT_BYTES,
        f'schema={schemas.MAX_SCENE_DOCUMENT_BYTES} 中间件='
        f'{body_guard.draft_body_limit("/api/v1/studio3d", "PUT")} 写盘={studio3d.MAX_DRAFT_BYTES}',
    )

    # —— B49 裸应用（没有 DraftBodyGuard）：深度与体积都要由 schema 挡住 ——
    app = FastAPI()
    app.include_router(studio3d.router, prefix='/api/v1')
    app.dependency_overrides[licensed_user] = lambda: SimpleNamespace(id='u1')
    with tempfile.TemporaryDirectory(prefix='hb-declared-') as tmp:
        draft_path = Path(tmp) / 'draft.json'
        app.state.settings = SimpleNamespace(studio3d_draft_path=draft_path)
        app.state.global_log = SimpleNamespace(append=lambda *_args, **_kwargs: None)
        deep_scene: dict = {}
        cursor = deep_scene
        for _ in range(body_guard.MAX_JSON_DEPTH + 8):
            nxt: dict = {}
            cursor['a'] = nxt
            cursor = nxt

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            deep = await client.put('/api/v1/studio3d', json={'revision': 0, 'scene': deep_scene})
            shallow = await client.put('/api/v1/studio3d', json={'revision': 0, 'scene': {'floors': []}})
        check(
            'B49 没挂中间件的应用里，深层嵌套草稿也回 422（不是 500 / RecursionError）',
            deep.status_code == 422,
            f'结果 {deep.status_code} {_detail_of(deep)[:40]}',
        )
        check(
            'B49 合法草稿照旧保存（边界收紧没有误伤正常请求）',
            shallow.status_code == 200 and json.loads(draft_path.read_text(encoding='utf-8'))['revision'] == 1,
            f'结果 {shallow.status_code}',
        )

        # 体积上限：把常量拨小再发，避免真的造一份 32 MiB 的请求（「可拨的边界」）。
        original_limit = schemas.MAX_SCENE_DOCUMENT_BYTES
        schemas.MAX_SCENE_DOCUMENT_BYTES = 1024
        try:
            async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
                oversize = await client.put(
                    '/api/v1/studio3d',
                    json={'revision': 1, 'scene': {'blob': 'x' * 4096}},
                )
        finally:
            schemas.MAX_SCENE_DOCUMENT_BYTES = original_limit
        check(
            'B49 体积上限也由 schema 判（拨小上限后同样的请求被拒）',
            oversize.status_code == 422 and '过大' in str(_detail_of(oversize)),
            f'结果 {oversize.status_code} {_detail_of(oversize)[:40]}',
        )

    # —— B54 唯一解析入口：源码扫描 + 两种语义 ——
    import re

    from backend.app.panel.documents import parse_document, require_document

    entry = Path('backend/app/panel/documents.py').resolve()
    raw_parsers: list[str] = []
    for source in sorted(Path('backend/app').rglob('*.py')):
        if source.resolve() == entry:
            continue
        text = source.read_text(encoding='utf-8')
        # 同一行、或紧跟着换个行续写参数都算「自己在解析」。
        if re.search(r'json\.loads\([^;]{0,80}?document_json', text):
            raw_parsers.append(str(source))
    check(
        'B54 草稿文档只有一处解析入口（其它模块不再自己 json.loads(document_json)）',
        not raw_parsers,
        f'仍在自己解析：{raw_parsers}',
    )
    parsed = (
        parse_document('{"a": '),
        parse_document('[]'),
        parse_document('"x"'),
        parse_document(None),
        parse_document('{"a": 1}'),
    )
    check(
        'B54 解析入口对损坏 / 非对象 / 非字符串一律回 None（不抛异常）',
        parsed == (None, None, None, None, {'a': 1}),
        f'五种输入={parsed}',
    )
    broken_draft = SimpleNamespace(document_json='{"a": ')
    try:
        require_document(broken_draft, on_error='这份草稿坏了。')
        required = '通过'
    except HTTPException as error:
        required = f'{error.status_code}:{error.detail}'
    check(
        'B54 写路径读损坏草稿回 422 并带上调用方给的文案（不是 500）',
        required == '422:这份草稿坏了。',
        f'结果 {required}',
    )

    # —— B60 连接名：先去空白再判下限 ——
    from backend.app.schemas import HAConnectionInput

    def build_name(raw: str | None) -> str:
        """按接口的写法构造一次请求体，返回结果或校验错误类型。"""
        payload = {'baseUrl': 'http://ha.local:8123'}
        if raw is not None:
            payload['name'] = raw
        try:
            return HAConnectionInput(**payload).name
        except ValueError as error:
            return f'拒绝:{type(error).__name__}'

    check(
        'B60 全空白的连接名被拒（min_length 判的是去空白前的原值，单靠它拦不住）',
        build_name(' ') == '拒绝:ValidationError' and build_name('\t\n') == '拒绝:ValidationError',
        f"结果 {build_name(' ')}",
    )
    check(
        'B60 正常连接名去掉首尾空白后保存，默认名照旧',
        build_name('  客厅 HA  ') == '客厅 HA' and build_name(None) == 'Home Assistant',
        f"结果 {build_name('  客厅 HA  ')} / {build_name(None)}",
    )
    check(
        'B60 连接名的去空白只有 schema 一处（路由不再自己 strip）',
        'payload.name.strip()' not in Path('backend/app/api/ha.py').read_text(encoding='utf-8'),
        '路由里仍在 strip payload.name'
        if 'payload.name.strip()' in Path('backend/app/api/ha.py').read_text(encoding='utf-8')
        else '只有 schema 一处',
    )


# --------------------------------------------------------------------------- #
# B36 / B47：连接级设置与跨线程换手的前提
# --------------------------------------------------------------------------- #
def check_database_connection_settings() -> None:
    """B36：写锁等待、池子上限，以及「库级 PRAGMA 只在新池子的第一条连接上设一次」。

    原先这三点分别是：没有任何写锁等待（另一个连接正写着，本连接**立刻**失败）、
    池子参数从未被显式定过（默认值恰好也能跑，但没人知道上限是多少），以及
    ``PRAGMA journal_mode=WAL`` 挂在**每个**新连接上 —— 最后一条最隐蔽：库正被写住时
    这条库级 PRAGMA 会失败，于是「池子要造一条新连接」这件与被改数据无关的事，变成
    一次请求失败。

    观测方式：连接级设置直接查 PRAGMA；「只设一次」把 ``Database._enable_wal`` 换成
    计数桩，之后开三条连接看它涨几次；池子上限则把常量临时压到 1/0/0.2 秒，占着唯一一
    条连接再要第二条 —— 必须等到超时，这才是「有界」的可观测含义。计数桩之外还数一遍
    ``PRAGMA journal_mode`` 在源码里出现的次数（P10 补）：桩只能证明 first_connect
    触发一次，证明不了「没有另一条路径也在设库级 PRAGMA」。
    """
    from contextlib import ExitStack

    from sqlalchemy import text

    from backend.app import database as database_module
    from backend.app.database import (
        BUSY_TIMEOUT_SECONDS,
        MAX_OVERFLOW,
        POOL_SIZE,
        POOL_TIMEOUT_SECONDS,
        Database,
    )

    with tempfile.TemporaryDirectory(prefix='hb-db-') as tmp:
        wal_calls: list[int] = []
        real_enable_wal = Database._enable_wal

        def counting_enable_wal(connection, record) -> None:
            wal_calls.append(1)
            return real_enable_wal(connection, record)

        Database._enable_wal = staticmethod(counting_enable_wal)
        try:
            database = Database(f'sqlite:///{Path(tmp) / "app.db"}')
        finally:
            # 必须还原成 staticmethod：直接赋回裸函数的话，类属性查找会把它变成绑定方法，
            # 后面的 Database() 就会给 first_connect 监听器多塞一个 self。
            Database._enable_wal = staticmethod(real_enable_wal)
        try:
            # 同时占住三条连接：池子必须各自新建一条 DBAPI 连接 —— 顺序 connect 会被池子
            # 复用同一条，「库级 PRAGMA 只设一次」根本观测不出来（两种情况都只设一次）。
            with ExitStack() as stack:
                connections = [stack.enter_context(database.engine.connect()) for _ in range(3)]
                pragmas = {
                    'busy_timeout': connections[0].execute(text('PRAGMA busy_timeout')).scalar(),
                    'journal_mode': connections[0].execute(text('PRAGMA journal_mode')).scalar(),
                    'foreign_keys': connections[0].execute(text('PRAGMA foreign_keys')).scalar(),
                }
                for connection in connections:
                    connection.execute(text('SELECT 1'))
            pool = database.engine.pool
            # SQLAlchemy 没给 max_overflow/timeout 的公开读取口，这里直接读属性值。
            pool_shape = (type(pool).__name__, pool.size(), pool._max_overflow, pool._timeout)
        finally:
            database.dispose()

        # 池子上限是真的在起作用（而不只是常量写对了）：临时压到 1/0/0.2 秒，
        # 占着唯一一条连接之后，第二条必须等超时。
        real_pool_settings = (
            database_module.POOL_SIZE,
            database_module.MAX_OVERFLOW,
            database_module.POOL_TIMEOUT_SECONDS,
        )
        (
            database_module.POOL_SIZE,
            database_module.MAX_OVERFLOW,
            database_module.POOL_TIMEOUT_SECONDS,
        ) = (1, 0, 0.2)
        try:
            squeezed = Database(f'sqlite:///{Path(tmp) / "squeezed.db"}')
            try:
                held = squeezed.engine.connect()
                try:
                    started = time.monotonic()
                    squeezed_error = ''
                    try:
                        squeezed.engine.connect()
                    except Exception as error:  # noqa: BLE001 - 观测值
                        squeezed_error = type(error).__name__
                    squeezed_wait = time.monotonic() - started
                finally:
                    held.close()
            finally:
                squeezed.dispose()
        finally:
            (
                database_module.POOL_SIZE,
                database_module.MAX_OVERFLOW,
                database_module.POOL_TIMEOUT_SECONDS,
            ) = real_pool_settings

    check(
        'B36 连接级设置：写锁等待、外键开启、库是 WAL',
        pragmas
        == {'busy_timeout': BUSY_TIMEOUT_SECONDS * 1000, 'journal_mode': 'wal', 'foreign_keys': 1},
        f'实际 {pragmas}',
    )
    check(
        'B36 库级 WAL 只在新池子的第一条连接上设一次（三条连接之后仍是一次）',
        wal_calls == [1],
        f'_enable_wal 被调用 {len(wal_calls)} 次',
    )
    # 上面那条计数桩只能证明 first_connect 只触发一次，证明不了「没有第二条路径也在
    # 设库级 PRAGMA」：若有人把 journal_mode 又加回逐连接那条 `_configure_sqlite`，
    # PRAGMA 读出来仍是 'wal'、计数也仍是 1，上面两条会全绿 —— 老毛病就回来了。
    # （P10 给商店侧补断言时发现的同一个口径缺口，这里一并堵上。）
    database_module_source = (PROJECT_ROOT / 'backend' / 'app' / 'database.py').read_text(encoding='utf-8')
    wal_statements = database_module_source.count('PRAGMA journal_mode')
    check(
        'B36 全仓只有一条设置库级 journal_mode 的语句（计数桩抓不到这条）',
        wal_statements == 1,
        f'backend/app/database.py 里出现 {wal_statements} 次',
    )
    check(
        'B36 连接池显式有界（池类型/池大小/溢出上限/等待上限都来自常量）',
        pool_shape == ('QueuePool', POOL_SIZE, MAX_OVERFLOW, POOL_TIMEOUT_SECONDS),
        f'实际 {pool_shape}，期望 {("QueuePool", POOL_SIZE, MAX_OVERFLOW, POOL_TIMEOUT_SECONDS)}',
    )
    check(
        'B36 池子上限真的会拦住第 N+1 个请求（等超时，而不是无上限开连接）',
        squeezed_error == 'TimeoutError' and squeezed_wait < 5,
        f'第 2 条连接：{squeezed_error or "没报错"}，等了 {squeezed_wait:.2f}s',
    )


def check_session_thread_handoff() -> None:
    """B47：请求级会话的跨线程换手要能跑通，且它的前提被显式检查过。

    会话由同步依赖产出、被 ``async def`` 路由拿去（放进线程池）查库、最后由线程池关闭
    —— 同一个会话先后落在不同线程上。原先没有任何东西记录这个前提：``connect_args`` 里
    的 ``check_same_thread`` 无条件下把 sqlite3 自己的同线程检查关了（SQLAlchemy 对文件库
    本来也默认关），换个 ``SQLITE_THREADSAFE=0`` 编译的构建就是未定义行为，而症状是随机
    崩溃或读到脏数据，不是一条清楚的报错。

    观测三件事：低等级构建必须明确报错（把 ``sqlite3.threadsafety`` 临时改小）；一个会话
    按「取会话+首次查库 → 换线程再查库 → 再换线程关闭」走通（把 ``check_same_thread`` 设成
    True 就会在这里红 —— 这正说明它测的是「跨线程换手」这个属性本身）；最后发 12 个真请求
    看端到端是否全 200，并**证明**夹具里确实发生了换手 —— 记下每个会话出现过的线程号，
    要求至少有一个会话在 ≥2 个线程上被取用（否则这条检查什么也没测）。会话对象本身当
    字典键，是刻意的：用 ``id()`` 会在会话被回收后撞上地址复用，观测数据就成了假的。
    """
    from sqlalchemy import event, text

    from backend.app import database as database_module
    from backend.app.database import (
        REQUIRED_SQLITE_THREADSAFETY,
        Database,
        DatabaseConfigurationError,
    )

    with tempfile.TemporaryDirectory(prefix='hb-handoff-') as tmp:
        # —— 前提：低线程安全等级的构建必须在构造时就拒绝 ——
        # 用文件库而不是 ':memory:'：内存库在 SQLAlchemy 里走 SingletonThreadPool，
        # 与池子参数不兼容，会先炸在 create_engine 上，测不到这条断言本身。
        real_threadsafety = database_module.sqlite3.threadsafety
        database_module.sqlite3.threadsafety = REQUIRED_SQLITE_THREADSAFETY - 1
        try:
            try:
                Database(f'sqlite:///{Path(tmp) / "refused.db"}')
                refusal = '没有拒绝'
            except DatabaseConfigurationError as error:
                refusal = str(error)
        finally:
            database_module.sqlite3.threadsafety = real_threadsafety

        # —— 顺序换手的真实形状：三个线程先后碰同一个会话 ——
        # 三条线程必须**同时活着**、用事件排序：线程跑完就退出的话，操作系统会把线程 id
        # 复用给下一个线程，sqlite3 的「同线程检查」看到的还是一样的 id，这个夹具就什么
        # 都测不到了（本轮实现踩过这个坑）。
        handoff_database = Database(f'sqlite:///{Path(tmp) / "handoff.db"}')
        holder: list = []
        steps: list[str] = []
        handoff_error: list[str] = []
        taken = threading.Event()
        used = threading.Event()

        def take_session() -> None:
            """T1：取出会话并首次查库（DBAPI 连接就是在这里建立的）。"""
            try:
                generator = handoff_database.sessions()
                session = next(generator)
                holder.append(generator)
                holder.append(session)
                session.execute(text('CREATE TABLE probe(value INTEGER)'))
                session.execute(text('INSERT INTO probe VALUES (7)'))
                session.commit()
                steps.append('take')
            except Exception as error:  # noqa: BLE001 - 观测值
                handoff_error.append(f'take: {type(error).__name__}: {error}')
            finally:
                taken.set()

        def second_use() -> None:
            """T2：换一个线程接着用同一个会话查库。"""
            taken.wait(timeout=30)
            try:
                value = holder[1].execute(text('SELECT value FROM probe')).scalar()
                steps.append(f'second:{value}')
            except Exception as error:  # noqa: BLE001 - 观测值
                handoff_error.append(f'second: {type(error).__name__}: {error}')
            finally:
                used.set()

        def close_session() -> None:
            """T3：再换一个线程让依赖收尾（关闭会话、归还连接）。"""
            used.wait(timeout=30)
            try:
                generator = holder[0]
                try:
                    next(generator)
                except StopIteration:
                    pass
                steps.append('close')
            except Exception as error:  # noqa: BLE001 - 观测值
                handoff_error.append(f'close: {type(error).__name__}: {error}')

        handoff_threads = [
            threading.Thread(target=step, name=f'handoff-{step.__name__}')
            for step in (take_session, second_use, close_session)
        ]
        for thread in handoff_threads:
            thread.start()
        for thread in handoff_threads:
            thread.join(timeout=60)
        handoff_database.dispose()

        # —— 端到端：4 个线程各发 3 个真请求 ——
        (app, database, cookie) = _projects_app(Path(tmp))
        _seed_project(database, 'p1', '客厅', document_json='{"pages": []}')
        thread_by_session: dict[object, set[int]] = {}

        def note(session) -> None:
            thread_by_session.setdefault(session, set()).add(threading.get_ident())

        class RecordingDatabase:
            """只多记一件事：会话是在哪个线程上被取出来的。

            必须是生成器而不是上下文管理器：``dependencies.get_database_session``
            用的是 ``yield from``。
            """

            def __init__(self, inner) -> None:
                self._inner = inner

            def sessions(self):
                for session in self._inner.sessions():
                    note(session)
                    yield session

            def __getattr__(self, name):
                return getattr(self._inner, name)

        event.listen(database.session_factory, 'do_orm_execute', lambda state: note(state.session))
        app.state.database = RecordingDatabase(database)
        statuses: list[int] = []

        def drive() -> None:
            async def request_draft() -> None:
                transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
                async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
                    for _ in range(3):
                        response = await client.get('/api/v1/projects/p1/draft', cookies=cookie)
                        statuses.append(response.status_code)

            asyncio.run(request_draft())

        threads = [threading.Thread(target=drive, name=f'handoff-{index}') for index in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
        threads_per_session = sorted(len(item) for item in thread_by_session.values())
        database.dispose()

    check(
        'B47 低线程安全等级的 sqlite3 构建在启动时被明确拒绝（不是「凑巧能跑」）',
        refusal != '没有拒绝' and '线程安全等级' in refusal,
        refusal if refusal == '没有拒绝' else refusal.split('：')[0],
    )
    check(
        'B47 一个会话跨三个线程顺序换手（取会话+查库 → 换线程查库 → 换线程关闭）都成功',
        handoff_error == [] and steps == ['take', 'second:7', 'close'],
        f'步骤 {steps}，错误 {handoff_error}',
    )
    check(
        'B47 12 个真请求全部成功（同步依赖查库 + async 路由换线程查库）',
        statuses == [200] * 12,
        f'共 {len(statuses)} 个响应，状态码 {sorted(set(statuses))}',
    )
    check(
        'B47 夹具确实制造了跨线程换手（至少一个会话被 ≥2 个线程取用）',
        bool(threads_per_session) and threads_per_session[-1] >= 2,
        f'每个会话见过的线程数 {threads_per_session}',
    )


# --------------------------------------------------------------------------- #
# B37 / B40 / B41：迁移的串行化与上传的「半成品状态」
# --------------------------------------------------------------------------- #
def check_migration_lock_and_backup() -> None:
    """B37：迁移要串行化，动结构之前要留一份**真的能还原**的快照。

    原先两点都没有：启动是并发的（编排器可能同时拉起两个实例、运维也可能手滑双击），
    两个进程会同时 ``upgrade``；而留在手边的「备份」如果只是 ``shutil.copy2`` 主库文件，
    在 WAL 模式下它就是一份打不开的空壳 —— 文件名对、大小不为零，看起来完全正常。
    「以为有备份」比「知道自己没有备份」危险得多。

    观测方式：两条线程同时跑 ``run_migrations``，把 ``command.upgrade`` 换成「先睡
    0.25s 再跑真的 upgrade」的桩，记录每段的进入/退出时刻 —— 串行化生效时两段不重叠，
    且在桩内另开句柄抢锁必须失败（说明临界区里真的持着锁）。快照则同时验三件事：
    恰好一份（不需要迁移时不写）、``integrity_check`` 通过、**WAL 里刚提交的行在里面**
    （copy2 的做法读不到它）。夹具全程握着一条连接，就是为了让那行留在 WAL 里。

    本批（P10）在这里多了一条观测：**迁移不许把迁移之前建好的 logger 关掉**。
    alembic 的 ``env.py`` 会 ``fileConfig``，而它的 ``disable_existing_loggers`` 默认
    为 True；我们又在应用进程内跑迁移，于是各模块的 logger（import 阶段就建好了）
    会被永久置 ``disabled`` —— 日志整个消失，且不报错。断言只是「迁移前建一个 logger、
    迁移后问它还能不能发 WARNING」，但这是这类静默失效唯一能被看见的形态。
    """
    import logging
    import sqlite3
    from itertools import pairwise

    from alembic import command

    from backend.app import migrations

    #: 迁移**之前**就存在的一个 logger。它必须活过整段迁移 —— 见函数末尾那条断言。
    migration_logger_probe = logging.getLogger('hb.smoke.migration-logger-probe')

    try:
        import fcntl
    except ImportError:  # pragma: no cover - Windows 上没有 fcntl，锁探测随之跳过
        fcntl = None

    settings = SimpleNamespace(
        project_root=PROJECT_ROOT,
        database_path=None,
        database_url=None,
    )
    with tempfile.TemporaryDirectory(prefix='hb-migrate-') as tmp:
        database_path = Path(tmp) / 'homeos.db'
        # 先在 WAL 里放一行：commit 之后它还只在 <库名>-wal 里，主库文件没 checkpoint 过。
        keep_open = sqlite3.connect(database_path)
        keep_open.execute('PRAGMA journal_mode=WAL')
        keep_open.execute('CREATE TABLE premigration_probe(marker TEXT)')
        keep_open.execute("INSERT INTO premigration_probe VALUES ('迁移之前就在的行')")
        keep_open.commit()
        settings.database_path = database_path
        settings.database_url = f'sqlite:///{database_path}'

        intervals: list[tuple[float, float]] = []
        lock_probe: list[str] = []
        lock_path = Path(tmp) / f'{database_path.name}{migrations.MIGRATION_LOCK_SUFFIX}'
        real_upgrade = command.upgrade

        def slow_upgrade(config, revision, *args, **kwargs):
            entered = time.monotonic()
            time.sleep(0.25)
            # 临界区内再抢一次锁：同进程另一个句柄也拿不到，说明锁确实被持着。
            if fcntl is not None:
                handle = lock_path.open('a+b')
                try:
                    try:
                        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        lock_probe.append('没锁住')
                        fcntl.flock(handle, fcntl.LOCK_UN)
                    except OSError:
                        lock_probe.append('已持锁')
                finally:
                    handle.close()
            try:
                return real_upgrade(config, revision, *args, **kwargs)
            finally:
                intervals.append((entered, time.monotonic()))

        results: list[str] = []

        def migrate() -> None:
            try:
                migrations.run_migrations(settings)
                results.append('ok')
            except Exception as error:  # noqa: BLE001 - 观测值
                results.append(f'{type(error).__name__}: {error}')

        command.upgrade = slow_upgrade
        # Alembic 的 env.py 每次 upgrade 都会 fileConfig 一次，把 INFO 日志打到 stdout、
        # 混进自检的 PASS/FAIL 里。setLevel 会被 fileConfig 覆盖，只有全局 disable 挡得住。
        logging.disable(logging.INFO)
        try:
            threads = [threading.Thread(target=migrate, name=f'migrate-{index}') for index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=60)
        finally:
            logging.disable(logging.NOTSET)
            command.upgrade = real_upgrade
        keep_open.close()

        ordered = sorted(intervals)
        overlaps = [
            (first, second) for (first, second) in pairwise(ordered) if second[0] < first[1]
        ]
        snapshots = sorted(Path(tmp).glob('*.bak'))
        snapshot_rows: list[str] = []
        snapshot_integrity: list[str] = []
        for snapshot in snapshots:
            copied = sqlite3.connect(f'file:{snapshot}?mode=ro', uri=True)
            try:
                snapshot_integrity.append(copied.execute('PRAGMA integrity_check').fetchone()[0])
                snapshot_rows.append(
                    copied.execute('SELECT marker FROM premigration_probe').fetchone()[0]
                )
            except sqlite3.Error as error:
                snapshot_rows.append(f'{type(error).__name__}: {error}')
            finally:
                copied.close()
        with sqlite3.connect(database_path) as connection:
            migrated_tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            migrated_revision = connection.execute('SELECT version_num FROM alembic_version').fetchone()

        # 库文件不存在时不该留下空壳快照。
        fresh = Path(tmp) / 'fresh' / 'homeos.db'
        fresh.parent.mkdir()
        fresh_settings = SimpleNamespace(
            project_root=PROJECT_ROOT,
            database_path=fresh,
            database_url=f'sqlite:///{fresh}',
        )
        logging.disable(logging.INFO)
        try:
            migrations.run_migrations(fresh_settings)
        finally:
            logging.disable(logging.NOTSET)
        fresh_snapshots = sorted(fresh.parent.glob('*.bak'))
    check(
        'B37 两个进程同时迁移：都成功，且临界区不重叠（串行化生效）',
        results == ['ok', 'ok'] and not overlaps,
        f'结果 {results}，区间 {[(round(a, 2), round(b, 2)) for (a, b) in ordered]}',
    )
    check(
        'B37 迁移体内确实持着迁移锁（另一个句柄抢不到）',
        fcntl is None or lock_probe == ['已持锁', '已持锁'],
        f'两次探测 {lock_probe}' if fcntl is not None else '平台无 fcntl，跳过锁探测',
    )
    check(
        'B37 动结构前留快照，且快照带 WAL 里刚提交的行（copy2 主库文件读不到它）',
        len(snapshots) == 1 and snapshot_rows == ['迁移之前就在的行'] and snapshot_integrity == ['ok'],
        f'{len(snapshots)} 份快照，行 {snapshot_rows}，完整性 {snapshot_integrity}',
    )
    check(
        'B37 迁移后库结构到位，且不需要迁移时不写快照',
        # 头号从迁移脚本现算（见 _migration_head_revision）：写死 '0002' 的话，每新增
        # 一个迁移这条检查都会红一次，而它真正要守的是「跑到链尾了」。
        migrated_revision == (_migration_head_revision(),)
        and {'projects', 'project_drafts', 'project_path_aliases'} <= migrated_tables
        and fresh_snapshots == [],
        f'revision {migrated_revision}，表 {len(migrated_tables)} 张，空库启动留下 {len(fresh_snapshots)} 份快照',
    )
    # alembic 的 ``env.py`` 每次 upgrade 都会 ``fileConfig`` 一次，而 ``fileConfig`` 的
    # ``disable_existing_loggers`` 默认是 True —— 它会把「此刻已存在、又没写进
    # alembic.ini 的 logger」逐个置 ``disabled``。我们恰恰是在**应用进程内**跑迁移
    # （``create_app`` 启动时调 ``run_migrations``），此时各模块的 logger 早在 import
    # 阶段就建好了，于是启动一次就把它们**永久静默**：``logger.warning(...)`` 从此不写
    # 任何东西，全局日志跟着空掉。症状是「日志整个消失」而不是报错，所以只有
    # 「迁移前先建一个 logger、迁移后再问它还能不能用」这一种观测看得见它。
    check(
        '迁移不会把迁移之前创建的 logger 关掉（alembic 的 fileConfig 不许静默应用日志）',
        not migration_logger_probe.disabled
        and migration_logger_probe.isEnabledFor(logging.WARNING),
        f'disabled={migration_logger_probe.disabled} '
        f'可发 WARNING={migration_logger_probe.isEnabledFor(logging.WARNING)}',
    )


async def check_upload_half_written_state() -> None:
    """B40/B41：上传的中间态不许被看见，清理也不许把真正的失败换掉。

    - B41：原先直接写最终文件名，「文件已存在」与「已登记」之间有一段窗口：首次
      ``GET /assets/user`` 会扫盘建索引，它可能在这段窗口里（甚至在我们即将因校验失败
      而删掉这个文件之后）把 ``user:<id>`` 记进内存目录 —— 目录里于是留下一条指向不
      存在文件的条目，删素材、算版本、发 URL 都会跟着它走；
    - B40：失败路径原先用 ``directory.rmdir()`` 清理，目录非空时它抛 ``OSError``，
      把真正的 422（图片不合格）顶成一条与客户端无关的 500。

    观测方式：把 ``validate_uploaded_image`` 换成桩，在**校验失败的那一刻**调一次
    ``user_items()``（就是扫盘，模拟并发的列表请求），并顺手在目录里留个文件模拟
    「目录非空」；断言原始 422 没被顶掉、扫盘看不到未校验的文件、失败后目录干净。
    再用一张真图走成功路径：最终文件名在、登记条目在、没有残留的临时名。
    """
    from fastapi import HTTPException
    from PIL import Image

    from backend.app.api import assets

    with tempfile.TemporaryDirectory(prefix='hb-upload-') as tmp:
        root = Path(tmp) / 'user'
        root.mkdir()
        catalog = assets.AssetCatalog(Path(tmp) / 'builtin', root, None, Path(tmp) / 'variants')
        source = Path(tmp) / 'source.png'
        Image.new('RGB', (8, 8), (1, 2, 3)).save(source, format='PNG')
        body = source.read_bytes()
        app = SimpleNamespace(
            state=SimpleNamespace(
                settings=SimpleNamespace(user_assets_dir=root),
                asset_catalog=catalog,
            )
        )
        seen_mid_upload: list[list[str]] = []
        real_validate = assets.validate_uploaded_image

        def reject_after_scan(_suffix: str, path: Path) -> tuple[int, int]:
            seen_mid_upload.append([item['assetId'] for item in catalog.user_items()])
            # 目录里留个文件，模拟「清理时目录并非空」：rmdir 会在这里炸。
            (path.parent / 'leftover.bin').write_bytes(b'x')
            raise ValueError('图片文件已损坏或无法完整解码。')

        assets.validate_uploaded_image = reject_after_scan
        try:
            failure: object = None
            try:
                await assets.upload_user_asset(
                    _request_with_chunks(
                        app, '/api/v1/assets/user', {'x-file-name': quote('坏图.png')}, [body]
                    ),
                    _background_tasks(),
                    None,
                )
            except Exception as error:  # noqa: BLE001 - 观测值
                failure = error
        finally:
            assets.validate_uploaded_image = real_validate
        after_failure = [item['assetId'] for item in catalog.user_items()]
        leftovers = sorted(item.name for item in root.iterdir())

        uploaded = await assets.upload_user_asset(
            _request_with_chunks(
                app, '/api/v1/assets/user', {'x-file-name': quote('好图.png')}, [body]
            ),
            _background_tasks(),
            None,
        )
        registered = [item['assetId'] for item in catalog.user_items()]
        written = sorted((root / uploaded['assetId'].removeprefix('user:')).iterdir())
        temporary = sorted(item.name for item in root.rglob('.upload-*'))

    check(
        'B40 校验失败仍是 422 + 原始文案（清理失败不得顶掉原异常）',
        isinstance(failure, HTTPException)
        and failure.status_code == 422
        and '损坏' in str(failure.detail),
        f'实际 {type(failure).__name__}: {failure}',
    )
    check(
        'B41 校验进行中的扫盘看不到未校验的文件（写的是临时名）',
        seen_mid_upload == [[]],
        f'扫盘看到 {seen_mid_upload}',
    )
    check(
        'B41 失败后不留下指向缺失文件的目录条目，目录也清干净了',
        after_failure == [] and leftovers == [],
        f'条目 {after_failure}，残留 {leftovers}',
    )
    check(
        'B41 成功路径：真名落盘、已登记、没有残留临时名',
        [item.name for item in written] == ['好图.png']
        and registered == [uploaded['assetId']]
        and temporary == [],
        f'落盘 {[item.name for item in written]}，登记 {registered}，临时名 {temporary}',
    )


def check_cover_capability_fallback() -> None:
    """B27：设备从不报 ``supported_features`` 时，不能再给一个「永远重试」的 409。

    原实现把「读不到能力位」一律当成「能力尚未载入，请稍后重试」并回 409。但
    ``supported_features`` 是 HA 集成自愿上报的，一部分网关从不给这个字段 —— 那是
    **永久**条件，不是「稍后就好」：前端会无限重试，用户看到一条永远不消失的提示，
    而且这条提示给不出任何自救动作。

    修复分成三种情形，这条检查逐一钉住：

    1. 状态里连 ``attributes`` 都没有 → 仍是 409（确实还没载入，值得重试）；
    2. 有 ``attributes`` 但缺能力位 → 按设备**已经上报的状态**推断能力（开/关/停恒可用，
       位置/叶片看有没有对应的反馈属性），被拒时给的是能自救的 422 文案；
    3. 有明确能力位 → 一切照旧以它为准，推断不得放宽它。
    """
    from fastapi import HTTPException

    from backend.app.modules.interaction3d import cover

    def attempt(service: str, data: dict, state, *, dream: bool = False):
        """调一次校验：通过返回 None，被拒返回 (状态码, 文案)。"""
        try:
            cover.validate_cover_command(service, data, state, dream = dream)
            return None
        except HTTPException as error:
            return (error.status_code, error.detail)

    def message(outcome) -> str:
        """取被拒时的文案；放行（None）或形态不是 (码, 文案) 时回空串。

        直接写 ``outcome[1]`` 的话，一旦有回归让某个本该被拒的调用放行（``None``），
        检查会以 TypeError 崩掉而不是干净地判失败 —— 崩掉时后面的断言一条都不会执行，
        「哪一条被违反」也就无从知晓。
        """
        return outcome[1] if isinstance(outcome, tuple) and len(outcome) > 1 else ''

    # 报过位置反馈的设备：缺能力位时定位操作照旧可用（修复前这里恒为 409）。
    positional = {'state': 'open', 'attributes': {'current_position': 30}}
    # 什么反馈都没有的设备：开/关/停仍可用，定位与叶片无法判断（回可自救的 422）。
    bare: dict = {'state': 'open', 'attributes': {}}
    tiltable = {'state': 'open', 'attributes': {'current_position': 30, 'current_tilt_position': 60}}
    open_position = attempt('set_cover_position', {'position': 50}, positional)
    open_close = attempt('close_cover', {}, positional)
    bare_position = attempt('set_cover_position', {'position': 50}, bare)
    bare_stop = attempt('stop_cover', {}, bare)
    bare_tilt = attempt('set_cover_tilt_position', {'tilt_position': 50}, bare)
    tilt_position = attempt('set_cover_tilt_position', {'tilt_position': 50}, tiltable)
    missing_attributes = attempt('open_cover', {}, {'state': 'open'})
    # 明确上报了能力位：即使状态里没有位置反馈也用它的说法（设备说了算）。
    declared_without_feedback = attempt(
        'set_cover_position', {'position': 50},
        {'state': 'open', 'attributes': {'supported_features': 4}},
    )
    # 明确上报了「只支持开」的设备：位置操作仍要被拒，不能被推断放宽。
    declared_open_only = attempt(
        'set_cover_position', {'position': 50},
        {'state': 'open', 'attributes': {'supported_features': 1, 'current_position': 30}},
    )
    invalid_features = attempt(
        'open_cover', {}, {'state': 'open', 'attributes': {'supported_features': '4'}},
    )
    bool_features = attempt(
        'open_cover', {}, {'state': 'open', 'attributes': {'supported_features': True}},
    )
    inferred_empty = cover.inferred_cover_features({})
    inferred_positional = cover.inferred_cover_features({'current_position': '30'})

    check(
        'B27 缺能力位但报过位置反馈 → 定位放行（不再是永久 409「稍后重试」）',
        open_position is None and open_close is None,
        f'定位={open_position}，关={open_close}',
    )
    check(
        'B27 缺能力位时开/关/停恒可用，定位与叶片按已上报的反馈判断',
        bare_stop is None
        and isinstance(bare_position, tuple) and bare_position[0] == 422
        and isinstance(bare_tilt, tuple) and bare_tilt[0] == 422
        and tilt_position is None,
        f'停={bare_stop}，定位={bare_position}，叶片={bare_tilt}，有叶片反馈={tilt_position}',
    )
    check(
        'B27 被拒时给的是能自救的说明（指向设备能力，而不是「稍后重试」）',
        'Home Assistant' in message(bare_position) and '稍后重试' not in message(bare_position)
        and 'current_tilt_position' in message(bare_tilt),
        f'定位文案 {message(bare_position)}',
    )
    check(
        'B27 状态里连 attributes 都没有时仍是 409（这一种确实值得重试）',
        isinstance(missing_attributes, tuple)
        and missing_attributes[0] == 409
        and '稍后重试' in missing_attributes[1],
        f'{missing_attributes}',
    )
    check(
        'B27 有明确能力位时以它为准：够用的放行、不够的照旧拒绝',
        declared_without_feedback is None
        and isinstance(declared_open_only, tuple)
        and declared_open_only[0] == 422
        and declared_open_only[1] == '窗帘当前不支持此操作。',
        f'声明支持定位={declared_without_feedback}，声明只支持开={declared_open_only}',
    )
    check(
        'B27 能力位值不可用时按「上报有问题」回 422（布尔不算整数，不许被当成 1）',
        isinstance(invalid_features, tuple) and invalid_features[0] == 422
        and isinstance(bool_features, tuple) and bool_features[0] == 422
        and '能力值' in bool_features[1],
        f'字符串={invalid_features}，布尔={bool_features}',
    )
    check(
        'B27 推断出的能力不夸大：空属性只有开/关/停，位置反馈才加定位',
        inferred_empty == cover.COVER_SERVICES['open_cover'] | cover.COVER_SERVICES['close_cover'] | cover.COVER_SERVICES['stop_cover']
        and inferred_positional == inferred_empty | cover.COVER_SERVICES['set_cover_position'],
        f'空={inferred_empty}，有位置反馈={inferred_positional}',
    )


async def check_display_alias_redirect() -> None:
    """B38：项目改名后，已经配对的中控设备手里那份旧地址必须还能打开。

    展示地址由**名称**派生（``/display/{项目名称}``），而名称可以在编辑器里随手改。
    修复前改名等于把在用的平板全部踢掉：它们只会一直收到 404，页面上没有任何提示，
    用户唯一能想到的办法是把平板拆下来重新配对。

    修复后改名会把旧名称记进 ``project_path_aliases``，展示页在「没有现存项目占用该
    名称」时 303 跳到当前地址。这条检查同时钉住三件容易走偏的事：

    1. 现存名称优先 —— 别的项目后来取了这个名字，地址就该指向它，不能跳到别名；
    2. 未配对的匿名请求不会被别名跳转泄漏信息（仍走配对页）；
    3. 项目删除后旧地址变成干净的 404，而不是跳到一个不存在的展示页。
    """
    from datetime import datetime, timezone

    from backend.app.api.projects import serialize_document
    from backend.app.display_access import display_path, resolve_display_project
    from backend.app.models import DisplayDevice, ProjectPathAlias
    from backend.app.panel.documents import create_blank_project
    from backend.app.security import session_token_hash

    now = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory(prefix='hb-alias-') as tmp:
        (app, database, cookie) = _projects_app(Path(tmp))
        _seed_project(
            database, 'proj-a', '客厅',
            document_json=serialize_document(create_blank_project('proj-a', '客厅')),
        )
        _seed_project(
            database, 'proj-b', '影音室',
            document_json=serialize_document(create_blank_project('proj-b', '影音室')),
        )
        with database.session_factory() as session:
            # 两台平板各自绑一个项目：别名是否被误用，看它拿到 200 还是被踢去配对页。
            session.add_all([
                DisplayDevice(
                    id='disp-a', token_hash=session_token_hash('tok-a'), project_id='proj-a',
                    name='客厅平板', created_at=now, last_seen_at=now,
                ),
                DisplayDevice(
                    id='disp-b', token_hash=session_token_hash('tok-b'), project_id='proj-b',
                    name='影音室平板', created_at=now, last_seen_at=now,
                ),
            ])
            session.commit()
        settings = app.state.settings
        display_cookie = settings.display_cookie_name
        # 保存 / 删除项目都会顺手把「新绑定的实体」丢给 HA 连接器刷新（后台任务）。
        # 不跑 lifespan 的话这个名字不存在，路由会在**已经提交之后**炸出 500 ——
        # 写进去的东西还在，响应却是失败，那不是我们要观测的现象。
        refreshed: list[dict] = []
        app.state.ha_connector = SimpleNamespace(
            refresh_persistent_entity_ids=lambda **kwargs: refreshed.append(kwargs)
        )

        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as client:
            # 1) 走真实保存接口改名：别名必须由这一笔事务顺手落库。
            renamed = await client.put(
                '/api/v1/projects/proj-a/draft',
                cookies=cookie,
                json={
                    'revision': 1,
                    'globalPopupsDirty': False,
                    'document': create_blank_project('proj-a', '客厅（新）'),
                },
            )
            old_page = await client.get(display_path('客厅'), cookies={display_cookie: 'tok-a'})
            new_page = await client.get(display_path('客厅（新）'), cookies={display_cookie: 'tok-a'})
            unknown_page = await client.get(display_path('并不存在'), cookies={display_cookie: 'tok-a'})
            aliases_after_rename = _alias_rows(database)
            # 2) 现存名称优先：给 proj-b 造一条「同名别名」，它不该抢走 proj-b 的地址。
            with database.session_factory() as session:
                session.add(ProjectPathAlias(name='影音室', project_id='proj-a'))
                session.commit()
            shadowed = await client.get(display_path('影音室'), cookies={display_cookie: 'tok-b'})
        # 3) 删掉项目：旧地址随外键级联失效，回到干净的 404。
        # httpx 的 delete() 不收 json=，而通用 request() 上加 per-request cookies 会触发
        # 弃用警告（cookie 归属含糊），所以这一段单独开一个带管理员 Cookie 的 client。
        async with httpx.AsyncClient(transport = transport, base_url = 'http://app.test', cookies = cookie) as admin_client:
            deleted = await admin_client.request(
                'DELETE',
                '/api/v1/projects/proj-a',
                json={'confirmation': '客厅（新）'},
            )
            deleted_page = await admin_client.get(display_path('客厅（新）'))
        # 匿名探针要用一个新的 client：上面那个 client 的 Cookie 罐已经被展示页续期时
        # 下发的 Set-Cookie 写进去了，拿它发「无 Cookie」请求根本不是匿名请求。
        async with httpx.AsyncClient(transport=transport, base_url='http://app.test') as anonymous_client:
            anonymous = await anonymous_client.get(display_path('客厅'))

        aliases_after_delete = _alias_rows(database)

    check(
        'B38 改名后旧地址 303 跳到新地址（平板不用重新配对）',
        renamed.status_code == 200
        and old_page.status_code == 303
        and old_page.headers.get('location') == display_path('客厅（新）')
        and new_page.status_code == 200,
        f'改名={renamed.status_code}，旧={old_page.status_code} {old_page.headers.get("location")}，新={new_page.status_code}',
    )
    check(
        'B38 别名由改名那一笔事务落库，方向是「旧名称 → 该项目」',
        aliases_after_rename == [('客厅', 'proj-a')],
        f'改名后别名表 {aliases_after_rename}，删除后 {aliases_after_delete}',
    )
    check(
        'B38 未配对的匿名请求只看得到配对页（不因别名跳转而泄漏项目名）',
        anonymous.status_code == 303
        and anonymous.headers.get('location', '').startswith('/pair'),
        f'{anonymous.status_code} {anonymous.headers.get("location")}',
    )
    check(
        'B38 别名也不掩盖未知地址：既不是现存名称也没有别名时回 404',
        unknown_page.status_code == 404,
        f'{unknown_page.status_code}',
    )
    check(
        'B38 现存名称优先于同名别名（被占用时以现存项目为准，不跳走）',
        shadowed.status_code == 200,
        f'{shadowed.status_code}（若是 303 说明别名抢走了现存项目的地址）',
    )
    check(
        'B38 项目删除后旧地址回到 404（别名不指向不存在的展示页）',
        deleted.status_code == 204 and deleted_page.status_code == 404 and not aliases_after_delete,
        f'删除={deleted.status_code}，删除后访问={deleted_page.status_code}，剩余别名 {aliases_after_delete}',
    )

    # 解析函数的分支要单独走一遍：真库里造不出「别名指向已删项目」（外键会级联），
    # 而这个分支正是「外键没生效的库」上的兜底。
    class _StubDatabase:
        def __init__(self, project, alias, alias_project):
            self.project = project
            self.alias = alias
            self.alias_project = alias_project
            self.lookups: list[str] = []

        def scalar(self, statement):
            self.lookups.append('alias' if 'project_path_aliases' in str(statement) else 'project')
            return self.alias if self.lookups[-1] == 'alias' else self.project

        def get(self, _model, _key):
            return self.alias_project

    live = SimpleNamespace(id='p1', name='甲')
    dangle = _StubDatabase(None, SimpleNamespace(project_id='gone'), None)
    dangled = resolve_display_project(dangle, '旧名')
    direct = resolve_display_project(_StubDatabase(live, None, None), '甲')

    check(
        'B38 现存名称命中时不去查别名（一次查询就够，也避免别名抢名）',
        direct == (live, None) and dangle.lookups == ['project', 'alias'],
        f'现存命中 {direct[0] is live}/{direct[1]}，别名分支查了 {dangle.lookups}',
    )
    check(
        'B38 别名指不到项目时当作没有这个地址（外键没生效的库上也不跳空）',
        dangled == (None, None),
        f'{dangled}',
    )


def check_user_asset_quota_and_sweep() -> None:
    """B42：用户素材目录要有总量上限，散落的残留也要有人来收。

    修复前这里有两条缺口，合起来就是「磁盘只增不减」：

    1. 只有**单文件**上限（64 MB），没有总量上限 —— 反复上传就能把盘填满，而盘满之后
       先坏掉的不是上传接口，是数据库与日志（它们写同一块盘）；
    2. 只删原图不管别的 —— 上传中断留下的空壳目录 / 临时文件、素材删除或版本更新后
       留在变体缓存里的孤儿文件，谁也选不中、谁也删不掉，用户根本没有办法意识到它们
       占着盘。

    这条检查盯住三件事：配额在**写盘之前**就拦住、巡检只收真残留（且在用的、以及
    还没过宽限期的都不动）、以及「没有任何仪表盘引用的图片**不**自动删」（那是用户的
    素材，不是缓存）。
    """
    from PIL import Image

    from backend.app.api import assets

    with tempfile.TemporaryDirectory(prefix='hb-asset-sweep-') as tmp:
        root = Path(tmp) / 'user'
        variants = Path(tmp) / 'variants'
        root.mkdir()
        variants.mkdir()
        catalog = assets.AssetCatalog(Path(tmp) / 'builtin', root, None, variants)
        now = time.time()

        def add_asset(asset_id: str) -> Path:
            """造一张真的用户素材（落盘 + 登记），返回它的目录。

            图片四角透明、中间不透明：这样 ``_attach_effect_variant`` 才会真的生成
            透明裁剪变体 —— 「巡检用的键」与「生成侧用的键」是不是同一个算法，只有
            在图片真的产出了变体时才能验。
            """
            directory = root / asset_id
            directory.mkdir()
            path = directory / '图.png'
            canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
            canvas.paste(Image.new('RGBA', (16, 16), (9, 9, 9, 255)), (24, 24))
            canvas.save(path, format='PNG')
            catalog.register_user(asset_id, path, (64, 64))
            return directory

        live_dir = add_asset('a' * 32)
        # 一个目录里留下两张图（历史原因 / 迁移残留）：``user_asset_file`` 会判它非法、
        # 前端谁也选不中它，但它**仍然装着用户的图片** —— 巡检绝不能顺手删掉。
        duplicated_dir = add_asset('d' * 32)
        (duplicated_dir / '另一张.png').write_bytes(b'x' * 128)
        # 空壳目录：上传中断 / 被手工删掉文件之后留下的样子。
        stale_shell = root / ('b' * 32)
        stale_shell.mkdir()
        fresh_shell = root / ('c' * 32)
        fresh_shell.mkdir()
        # 根目录上不该有散落文件（临时文件都在素材目录内）。
        stale_stray = root / 'leftover.tmp'
        stale_stray.write_bytes(b'x' * 4096)
        fresh_stray = root / '.upload-half.png'
        fresh_stray.write_bytes(b'y' * 2048)
        # 变体缓存：一个在用（键来自素材的当前版本，由生成侧写下），一个新（没过宽限期），一个孤儿。
        live_id = 'user:' + 'a' * 32
        live_version = next(item['version'] for item in catalog.user_items() if item['assetId'] == live_id)
        live_key = assets.effect_variant_cache_key(live_id, live_version)
        # 生成侧落盘了才算数：文件名就是「生成侧算出来的键」。
        generated_variant = catalog.effect_variant_path(live_id)
        orphan_key = 'f' * 64
        (variants / f'{orphan_key}.png').write_bytes(b'orphan')
        (variants / f'{orphan_key}.json').write_text('{}', encoding='utf-8')
        fresh_key = 'e' * 64
        (variants / f'{fresh_key}.png').write_bytes(b'fresh')

        old = now - assets.USER_ASSET_ORPHAN_GRACE_SECONDS - 60
        old_variant = now - assets.EFFECT_VARIANT_GRACE_SECONDS - 60
        os.utime(stale_shell, (old, old))
        os.utime(stale_stray, (old, old))
        os.utime(duplicated_dir, (old, old))
        os.utime(variants / f'{orphan_key}.png', (old_variant, old_variant))
        os.utime(variants / f'{orphan_key}.json', (old_variant, old_variant))
        os.utime(variants / f'{fresh_key}.png', (now, now))
        # 在用的那份变体按**生成侧写的文件名**调时间戳，而不是按下面那个键重算的路径：
        # 两处算法一旦分家，重算出来的路径根本不存在，这里就会以 FileNotFoundError 崩掉 ——
        # 而这条检查要的恰恰是「干净地变红」，不是「把整套自检带崩」。
        if generated_variant is not None:
            os.utime(generated_variant, (old_variant, old_variant))
            os.utime(generated_variant.with_suffix('.json'), (old_variant, old_variant))
        os.utime(live_dir, (old, old))

        stats = assets.sweep_user_asset_storage(root, variants, catalog.effect_variant_keys(), now = now)

        check(
            'B42 巡检收掉过期的空壳目录与被手工删空的残骸，且在用的素材目录不动',
            stats['directories'] == 1
            and not stale_shell.exists()
            and live_dir.is_dir()
            and fresh_shell.is_dir(),
            f"统计 {stats['directories']} 个目录，空壳还在={stale_shell.exists()}，在用的={live_dir.is_dir()}，未过期的={fresh_shell.is_dir()}",
        )
        check(
            'B42 目录里还有图片就绝不回收（哪怕 user_asset_file 已判它非法）',
            duplicated_dir.is_dir()
            and sorted(item.name for item in duplicated_dir.iterdir()) == sorted(['图.png', '另一张.png']),
            f'目录还在={duplicated_dir.is_dir()}，内容 {sorted(item.name for item in duplicated_dir.iterdir()) if duplicated_dir.is_dir() else "已删"}',
        )
        check(
            'B42 未过宽限期的空壳不动（正在进行的上传长的就是这个样子）',
            fresh_shell.is_dir() and stats['kept'] > 0,
            f'未过期目录在={fresh_shell.is_dir()}，保留计数 {stats["kept"]}',
        )
        check(
            'B42 根目录下的散落残留按过期与否处理',
            not stale_stray.exists() and fresh_stray.exists() and stats['files'] == 1,
            f'过期残留还在={stale_stray.exists()}，新鲜残留={fresh_stray.exists()}，回收文件 {stats["files"]} 个',
        )
        # 「在用的变体还在不在」按**生成侧写的那个文件**问，不按巡检键重算路径：
        # 两处算法分家时，重算出来的路径本来就不存在，问它等于什么都没问。
        live_variant_alive = generated_variant is not None and generated_variant.exists()
        check(
            'B42 变体缓存：孤儿收掉、在用与未过期的不动（键必须与生成侧同源）',
            not (variants / f'{orphan_key}.png').exists()
            and not (variants / f'{orphan_key}.json').exists()
            and live_variant_alive
            and (variants / f'{fresh_key}.png').exists()
            and stats['variants'] == 2,
            f"回收变体 {stats['variants']} 个，在用还在={live_variant_alive}，"
            f"未过期还在={(variants / f'{fresh_key}.png').exists()}",
        )
        check(
            'B42 释放量如实统计（等于真被删掉的字节，不虚报）',
            stats['released'] == 4096 + len(b'orphan') + len('{}'),
            f"released={stats['released']}（期望 {4096 + len(b'orphan') + 2}）",
        )

        # 在用素材的变体键与生成侧必须一致：各写一份哈希的话，巡检会把在用的变体当垃圾删掉。
        live_path = catalog.effect_variant_path('user:' + 'a' * 32)
        check(
            'B42 素材的变体路径与巡检用的键同源（不一致就会删掉正在用的缓存）',
            live_path is not None and live_path.stem == live_key,
            f'变体路径 {live_path}，巡检键 {live_key}',
        )

        # remove_user：删素材时缓存也要走，否则它会永远留在这块盘上。
        discarded_path = catalog.effect_variant_path('user:' + 'a' * 32)
        released_variant = catalog.remove_user('user:' + 'a' * 32)
        check(
            'B42 摘掉素材时连带删掉它的变体与元数据（不是只删原图）',
            released_variant > 0
            and not discarded_path.exists()
            and not discarded_path.with_suffix('.json').exists()
            and catalog.effect_variant_path('user:' + 'a' * 32) is None,
            f'释放 {released_variant} 字节，文件还在={discarded_path.exists()}',
        )

        # 引用关系：三处来源都要算上，否则会在巡检里把在用的图片当成没人要。
        from backend.app.database import Base, Database
        from backend.app.models import GlobalCustomPopupState, Project, ProjectDraft, User

        database = Database(f'sqlite:///{Path(tmp) / "refs.db"}')
        Base.metadata.create_all(database.engine)
        with database.session_factory() as session:
            # 项目要挂在用户上（created_by 是 RESTRICT 外键），先建一行属主。
            session.add(User(id='u1', username='admin', password_hash='x', role='admin'))
            session.commit()
            session.add(Project(id='p1', name='甲', slug='p1', created_by='u1'))
            session.commit()
            session.add(ProjectDraft(
                project_id='p1', schema_version=1, revision=1, updated_by='u1',
                document_json=json.dumps({
                    'schemaVersion': 1, 'name': '甲', 'projectId': 'p1',
                    'widgets': [{'assetId': 'user:' + 'a' * 32}],
                    'customPopups': [],
                }),
            ))
            session.add(GlobalCustomPopupState(
                id=1, revision=1,
                popups_json=json.dumps([{'id': 'pop-1', 'assetId': 'user:' + 'd' * 32}]),
            ))
            session.commit()
        studio_draft = Path(tmp) / 'studio.json'
        studio_draft.write_text(
            json.dumps({'scene': {'items': [{'assetId': 'user:' + 'e' * 32}]}}), encoding='utf-8'
        )
        # referenced_user_asset_ids 收的是会话（与请求路径同一个签名）：这里自己开一个短会话。
        with database.session_factory() as session:
            referenced = assets.referenced_user_asset_ids(session, studio_draft)
        # 未被引用的图片**不**在巡检的回收范围里（素材库允许「先传进来、以后再用」）。
        unreferenced_dir = add_asset('9' * 32)
        os.utime(unreferenced_dir, (old, old))
        assets.sweep_user_asset_storage(root, variants, catalog.effect_variant_keys(), now = now)
        unreferenced_survived = unreferenced_dir.is_dir()

        # 路由级接线：删素材这条路径真的要顺手删掉变体。只有 discard 方法、没人调用等于没修，
        # 而「有没有调用」只有把路由跑一遍才算数（直接调方法是测不到的）。
        route_id = '7' * 32
        route_dir = add_asset(route_id)
        route_variant = catalog.effect_variant_path(f'user:{route_id}')
        route_request = _request_with_chunks(
            SimpleNamespace(state=SimpleNamespace(
                settings=SimpleNamespace(
                    user_assets_dir=root,
                    # 3D 草稿文件的路径也要有：删除路径会顺带查一次户型图里的引用。
                    studio3d_draft_path=Path(tmp) / 'nonexistent-studio.json',
                ),
                asset_catalog=catalog,
            )),
            f'/api/v1/assets/user/{route_id}',
            {},
            [],
            method='DELETE',
        )
        with database.session_factory() as session:
            # 鉴权依赖（LicensedUser）在直接调函数时不参与，这里给一个占位主体。
            route_response = assets.delete_user_asset(
                route_id, route_request, session, SimpleNamespace(role='admin')
            )
        route_state = (
            route_response.status_code,
            route_variant is not None and route_variant.exists(),
            route_variant is not None and route_variant.with_suffix('.json').exists(),
            route_dir.is_dir(),
            catalog.effect_variant_path(f'user:{route_id}'),
        )

    check(
        'B42 引用关系三处来源（项目草稿 / 全局弹窗 / 3D 草稿）都算上',
        referenced == {'a' * 32, 'd' * 32, 'e' * 32},
        f'引用集合 {sorted(referenced)}',
    )
    check(
        'B42 未被引用的图片不自动删（先传进来以后再用是合法用法，删它等于弄丢用户的图）',
        unreferenced_survived,
        f'未被引用的素材目录还在={unreferenced_survived}',
    )
    check(
        'B42 删素材这条路由真的会连带删掉变体（接线，不只是有个 discard 方法）',
        route_state == (204, False, False, False, None),
        f'状态码/变体还在/元数据还在/目录还在/缓存条目 = {route_state}',
    )


async def check_user_asset_total_quota() -> None:
    """B42（请求路径）：总量配额要在**写盘之前**生效，并按实收字节兜住假长度头。

    只测纯函数不够：配额的两道闸分别在「读请求头之后、建目录之前」与「流式写盘的每一批
    之前」，前者省下一次落盘，后者是唯一能挡住「不带长度头 / 长度头撒谎」那一路的判据。
    """
    from fastapi import HTTPException
    from PIL import Image

    from backend.app.api import assets

    with tempfile.TemporaryDirectory(prefix='hb-asset-quota-') as tmp:
        root = Path(tmp) / 'user'
        root.mkdir()
        source = Path(tmp) / 'source.png'
        Image.new('RGB', (16, 16), (4, 4, 4)).save(source, format='PNG')
        body = source.read_bytes()
        used = {'bytes': 0}
        app = SimpleNamespace(state=SimpleNamespace(
            settings=SimpleNamespace(user_assets_dir=root),
            asset_catalog=SimpleNamespace(
                register_user=lambda *_args: {'assetId': 'user:x'},
                user_asset_bytes=lambda: used['bytes'],
            ),
            global_log=SimpleNamespace(append=lambda *_args, **_kwargs: None),
            database=None,
        ))

        # 已用量顶到上限：第一次请求必须直接 413，且一个目录都不该被建出来。
        used['bytes'] = assets.MAX_USER_ASSET_TOTAL_BYTES
        rejected_status = None
        try:
            await assets.upload_user_asset(
                _request_with_chunks(app, '/api/v1/assets/user', {'x-file-name': quote('图.png')}, [body]),
                _background_tasks(),
                None,
            )
        except HTTPException as error:
            rejected_status = error.status_code
        leftovers = sorted(item.name for item in root.iterdir())

        # 长度头预判那道闸要独立生效：已用量故意压到「差一点点到上限」，声明长度刚刚越过
        # 上限。三个数刻意分开 —— 单文件上限（64 MB）远大于它，所以不是那条闸拒的；
        # 实收字节又远小于总量上限，所以流式那道闸也不会响。413 只可能来自总量预判。
        used['bytes'] = assets.MAX_USER_ASSET_TOTAL_BYTES - 1000
        declared_status = None
        try:
            await assets.upload_user_asset(
                _request_with_chunks(
                    app,
                    '/api/v1/assets/user',
                    {
                        'x-file-name': quote('图.png'),
                        'Content-Length': '2000',
                    },
                    [body],
                ),
                _background_tasks(),
                None,
            )
        except HTTPException as error:
            declared_status = error.status_code
        declared_dirs = sorted(item.name for item in root.iterdir())

        # 没有长度头（分块传输）时靠逐块累计兜住：上限以下放行、以上拒绝。
        used['bytes'] = assets.MAX_USER_ASSET_TOTAL_BYTES - len(body) // 2
        chunked_status = None
        try:
            await assets.upload_user_asset(
                _request_with_chunks(
                    app, '/api/v1/assets/user', {'x-file-name': quote('图.png')}, [body], no_content_length = True
                ),
                _background_tasks(),
                None,
            )
        except HTTPException as error:
            chunked_status = error.status_code
        chunked_dirs = sorted(item.name for item in root.iterdir())

        # 用量正常时照旧放行（配额不能变成「谁都传不上去」）。
        used['bytes'] = 0
        try:
            await assets.upload_user_asset(
                _request_with_chunks(
                    app, '/api/v1/assets/user', {'x-file-name': quote('图.png')}, [body], no_content_length = True
                ),
                _background_tasks(),
                None,
            )
            allowed_status = 201
        except HTTPException as error:
            allowed_status = error.status_code

    check(
        'B42 用量顶到上限时上传直接 413，且不留下任何目录 / 半截文件',
        rejected_status == 413 and leftovers == [],
        f'{rejected_status}，残留 {leftovers}',
    )
    check(
        'B42 声明长度就超限时靠长度头第一道闸拒掉（不用先落盘再发现）',
        declared_status == 413 and declared_dirs == [],
        f'{declared_status}，残留 {declared_dirs}',
    )
    check(
        'B42 没有长度头时按实收字节兜住（第一道闸判不了的那种请求）',
        chunked_status == 413 and chunked_dirs == [],
        f'{chunked_status}，残留 {chunked_dirs}',
    )
    check(
        'B42 用量正常时上传照旧通过（配额不是「谁都传不上去」）',
        allowed_status == 201,
        f'{allowed_status}',
    )


def check_user_asset_sweep_is_wired() -> None:
    """B42（接线）：巡检必须在**启动**时也跑一遍，否则它只在有人上传时才可能发生。

    为什么必须静态断言：上传触发的那一轮只在「用量超过告警线」时才排后台任务，而
    「盘上已经堆了一堆残留、但接下来没人再上传」恰恰是这台设备最可能的处境 ——
    启动那一轮是这个场景下唯一的清理机会。它不写返回值、不影响任何响应，功能上完全
    看不出来（素材库照旧能用），所以只能钉住调用关系。
    """
    tree = ast.parse((PROJECT_ROOT / 'backend/app/main.py').read_text(encoding='utf-8'))

    def function(name: str) -> ast.AST | None:
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
                return node
        return None

    def sweep_references(node: ast.AST) -> list[ast.AST]:
        """lifespan 里所有提到巡检函数的地方。

        必须同时认「作为参数传出去的函数名」：启动那一轮是同步重活，写法是
        ``await asyncio.to_thread(sweep_user_assets_for_app, app)`` —— 函数是 ``to_thread``
        的参数，不是被调用的 ``func``，只看 ``ast.Call.func`` 会一条都找不到。
        """
        found = []
        for inner in ast.walk(node):
            if isinstance(inner, ast.Name) and inner.id.endswith('sweep_user_assets_for_app'):
                found.append(inner)
            elif isinstance(inner, ast.Attribute) and inner.attr.endswith('sweep_user_assets_for_app'):
                found.append(inner)
        return found

    lifespan = function('lifespan')
    references = sweep_references(lifespan) if lifespan is not None else []
    swept = bool(references)

    # 巡检失败必须只记日志：清理是附加工作，把启动搞失败等于整个应用起不来。
    guarded = False
    if references:
        for parent in ast.walk(lifespan):
            if not isinstance(parent, ast.Try):
                continue
            covered = {
                id(inner)
                for statement in parent.body
                for inner in ast.walk(statement)
            }
            if not any(id(reference) in covered for reference in references):
                continue
            re_raises = any(
                isinstance(inner, ast.Raise) and inner.exc is None
                for handler in parent.handlers
                for inner in ast.walk(handler)
            )
            guarded = guarded or not re_raises
    check(
        'B42 启动时也跑一轮素材巡检（没人再上传时这是唯一的清理机会）',
        swept,
        'lifespan 里调用了巡检' if swept else 'lifespan 没有调用巡检',
    )
    check(
        'B42 启动巡检失败只记日志，不让应用起不来',
        guarded,
        'try/except 包住且不重新抛出' if guarded else '启动巡检没有容错包住',
    )


def _attach_log_sink(logger_name: str):
    """抓一段标准 logging 的输出（商店那套走 logger）。"""
    records: list[str] = []

    class _Sink(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    handler = _Sink()
    logger = logging.getLogger(logger_name)
    logger.addHandler(handler)
    return records, handler, logger


def _event_log_sink():
    """抓一段 ``SetupGuard.event_log.append(...)`` 的调用（主应用那套走回调）。"""
    messages: list[str] = []
    sink = SimpleNamespace(
        append=lambda level, category, scope, message, context=None: messages.append(message)
    )
    return messages, sink


def check_setup_token_provenance() -> None:
    """B34：引导令牌文件「是谁放的」决定它该不该被删。

    盘上的 ``setup-token`` 有两个来源：本服务上一次未完成窗口自动生成的（初始化成功后
    该删，否则它就是一枚落在磁盘上的死凭证），以及运维**预置**的（放在这里让实例读的
    恢复手段，删掉等于把运维准备好的后路掐断）。内容上无从区分 —— 两者都是同一串
    高熵字符串、都能通过 ``authorize()`` 的比对 —— 只有写入方知道自己是哪一个，所以
    判据只能是写入时留下的标记。

    两套实现（``backend/app/setup_guard.py`` 与 ``store/setup_guard.py``）各一份同构
    代码，这个检查对两边都跑：它们的差异只该是 logger 不同，语义必须一致。
    """
    from backend.app import setup_guard as backend_guard
    from store import setup_guard as store_guard

    check(
        'B34 两套 setup_guard 用同一份标记文件与同一种指纹记「这是谁放的」',
        backend_guard.GENERATED_MARKER_FILE == store_guard.GENERATED_MARKER_FILE
        and backend_guard.FINGERPRINT_PREFIX == store_guard.FINGERPRINT_PREFIX
        and 'setup-token' in backend_guard.GENERATED_MARKER_FILE,
        f'marker={backend_guard.GENERATED_MARKER_FILE!r} prefix={backend_guard.FINGERPRINT_PREFIX!r}',
    )

    operator_token = 'operator-provisioned-token-value-1234'

    for label, module in (('主应用', backend_guard), ('商店', store_guard)):
        with tempfile.TemporaryDirectory(prefix='hb-b34-provided-') as tmp:
            workdir = Path(tmp)
            path = workdir / 'setup-token'
            # 运维的写法：裸的一行，没有标记（也可能带自己的注释行）。
            path.write_text(f'# 运维自己写的备注\n{operator_token}\n', encoding='utf-8')
            if module is backend_guard:
                # 主应用那套把话写进注入的 event_log 回调，不是标准 logging。
                records, sink = _event_log_sink()
                guard = module.SetupGuard(workdir, event_log=sink)

                def detach() -> None:
                    return None

            else:
                records, handler, logger = _attach_log_sink('store.setup')
                guard = module.SetupGuard(workdir)

                def detach() -> None:
                    logger.removeHandler(handler)
            token = guard.ensure_token()
            # 「是不是我们生成的」这一判断本身也要看：它决定了后面两处删不删。
            mistaken_as_ours = guard.generated
            try:
                guard.discard_file()
                kept_by_discard = path.is_file()
                told = any('保留' in message for message in records)
            finally:
                detach()
            guard.consume()
            kept_by_consume = path.is_file()

            check(
                f'B34 {label}：运维预置的令牌带着注释行也读得出来',
                token == operator_token,
                f'读到 {token!r}',
            )
            check(
                f'B34 {label}：运维预置的文件不被认成自己生成的',
                mistaken_as_ours is False,
                f'generated={mistaken_as_ours}',
            )
            check(
                f'B34 {label}：已初始化时不清掉运维预置的文件（discard_file）',
                kept_by_discard,
                '文件还在' if kept_by_discard else '文件被删了 —— 运维的后路没了',
            )
            check(
                f'B34 {label}：初始化成功后不清掉运维预置的文件（consume）',
                kept_by_consume,
                '文件还在' if kept_by_consume else '文件被删了 —— 运维的后路没了',
            )
            check(
                f'B34 {label}：保留预置文件这件事会告诉运维（否则用户以为它被清掉了）',
                told,
                '记了 warning 日志' if told else f'没有日志（抓到 {records!r}）',
            )

        # 自动生成的那份相反：留着就是一枚落在磁盘上的死凭证，两处都必须删。
        with tempfile.TemporaryDirectory(prefix='hb-b34-generated-') as tmp:
            workdir = Path(tmp)
            first = module.SetupGuard(workdir)
            token = first.ensure_token()
            on_disk = first.path.read_text(encoding='utf-8')
            check(
                f'B34 {label}：自动生成的文件仍是「一行一枚密钥」（README 教的方式：cat 它）',
                on_disk.strip() == token and len(on_disk.splitlines()) == 1,
                f'内容={on_disk!r}',
            )
            check(
                f'B34 {label}：出处另外记在一份标记文件里（指纹对得上才算我们的）',
                first.marker_path.is_file()
                and module.token_fingerprint(token) in first.marker_path.read_text(encoding='utf-8'),
                f'标记={first.marker_path}',
            )
            # 重启后读回同一枚：密钥不该因为一次重启就换掉（运维手上那份会作废）。
            second = module.SetupGuard(workdir)
            check(
                f'B34 {label}：重启读回同一枚密钥，且仍认得是自己生成的',
                second.ensure_token() == token and second.generated is True,
                f'token 相同={second.ensure_token() == token} generated={second.generated}',
            )
            second.discard_file()
            check(
                f'B34 {label}：自动生成的残留在已初始化实例上会被清掉（标记一起走）',
                not second.path.exists() and not second.marker_path.exists(),
                f'密钥存在={second.path.exists()} 标记存在={second.marker_path.exists()}',
            )

        # 最要紧的一种「像但不是」：标记还在，密钥已经被换成人放的另一枚。
        # 指纹是这里唯一的判据 —— 只看标记在不在，人放的那枚就会被误删。
        with tempfile.TemporaryDirectory(prefix='hb-b34-swapped-') as tmp:
            workdir = Path(tmp)
            generated = module.SetupGuard(workdir)
            generated.ensure_token()
            replaced = 'replaced-by-the-operator-token-9999'
            generated.path.write_text(replaced + '\n', encoding='utf-8')
            reread = module.SetupGuard(workdir)
            check(
                f'B34 {label}：标记还在但密钥被换过 → 认指纹，不认标记文件的存在',
                reread.ensure_token() == replaced and reread.generated is False,
                f'generated={reread.generated}',
            )
            reread.discard_file()
            check(
                f'B34 {label}：换过的那一枚不会被误删（标记文件在也不能当成自己的）',
                reread.path.is_file(),
                '文件还在' if reread.path.is_file() else '文件被删了',
            )


async def check_setup_admin_conflicts_are_409() -> None:
    """B35：``stage()`` 的两类可预期冲突必须回 409，而不是 500 带堆栈。

    ``stage()`` 在落盘账号文件时可能撞上两种「这次请求不成立」：并发的初始化请求先赢了
    （``initialized`` 是进程内状态，后到的那个读到的是别人翻过去的那个 True），以及盘上
    出现了一份不属于本次初始化的账号文件。两种都是可预期状态 —— 正确回话是「刷新页面
    看状态」，不是「服务器坏了」。过去它们逃逸成 500：用户看不懂，全局日志里多一段
    堆栈，而 reset 之后连「谁赢的」都看不出来。

    观测点是**回给客户端的响应**加上**库里有没有留下半成品**：只测「抛了
    AdminAccountConflict」不够 —— 那正是它以前的样子（异常类型换了个名字，500 照旧）。
    """
    import httpx
    from fastapi import FastAPI

    from backend.app import setup_guard
    from backend.app.admin_account import AdminAccountConflict, AdminAccountStore
    from backend.app.api import auth
    from backend.app.config import load_settings
    from backend.app.database import Base, Database
    from backend.app.models import LoginSession, User

    payload = {
        'username': 'ops-admin',
        'password': 'correct-horse-battery',
        'passwordConfirmation': 'correct-horse-battery',
    }

    class RivalStore(AdminAccountStore):
        """第 3 次读 ``initialized`` 时才翻成 True。

        那一次读发生在 ``stage()`` 里面，也就是「另一个请求已经把账号写好了」这一刻：
        路由的前两次读（入口闸门、BEGIN IMMEDIATE 之后各一次）必须都还是 False，
        否则走不到被测的那条分支上。
        """

        def __init__(self, path: Path) -> None:
            super().__init__(path)
            self.reads = 0

        @property
        def initialized(self) -> bool:
            self.reads += 1
            return self.reads > 2

    def build(workdir: Path, store: AdminAccountStore):
        database = Database(f'sqlite:///{workdir / "app.db"}')
        Base.metadata.create_all(database.engine)
        app = FastAPI()
        # 前缀跟 main.py 一致：路由表是照着真实挂载点验的，不然 404 会冒充成「闸门生效」。
        app.include_router(auth.router, prefix='/api/v1')
        app.state.database = database
        app.state.settings = load_settings()
        app.state.admin_account = store
        app.state.setup_guard = setup_guard.SetupGuard(workdir / 'data')
        app.state.global_log = SimpleNamespace(append=lambda *a, **k: None)
        return app, database

    async def call(app) -> httpx.Response:
        # raise_app_exceptions=False：让「逃逸成 500」表现为 500 响应而不是把异常抛进
        # 测试进程 —— 否则一条未来的回归会让整套自检崩掉，而不是干净地红一条。
        # 默认对端就是 loopback：本机直连那条放行分支成立，不必再带引导令牌。
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url='http://homeos.test',
        ) as client:
            return await client.post('/api/v1/setup/admin', json=payload)

    def leftovers(database) -> tuple[int, int]:
        from sqlalchemy import select

        with database.session_factory() as session:
            return (
                len(session.scalars(select(User.id)).all()),
                len(session.scalars(select(LoginSession.id_hash)).all()),
            )

    # 情形一：并发的初始化请求先赢了。
    with tempfile.TemporaryDirectory(prefix='hb-b35-race-') as tmp:
        workdir = Path(tmp)
        store = RivalStore(workdir / 'admin-account.json')
        app, database = build(workdir, store)
        response = await call(app)
        users, sessions = leftovers(database)
        check(
            'B35 被并发请求抢先时回 409（而不是 500 带堆栈）',
            response.status_code == 409,
            f'status={response.status_code} body={response.text[:120]}',
        )
        check(
            'B35 抢先后告诉用户刷新页面（而不是只说「服务器错误」）',
            response.status_code == 409 and '刷新' in response.text,
            response.text[:160],
        )
        check(
            'B35 抢先后不留半成品用户与会话（回滚真的发生了）',
            users == 0 and sessions == 0,
            f'users={users} sessions={sessions}',
        )
        check(
            'B35 抢先后不落盘账号文件（否则这枚凭据是谁的说不清）',
            not store.path.exists(),
            f'文件存在={store.path.exists()}',
        )

    # 情形二：盘上已经有一份账号文件（另一次初始化/别处补进来的），拒绝覆盖。
    with tempfile.TemporaryDirectory(prefix='hb-b35-rogue-') as tmp:
        workdir = Path(tmp)
        store = AdminAccountStore(workdir / 'admin-account.json')
        store.path.parent.mkdir(parents=True, exist_ok=True)
        planted = json.dumps({'schemaVersion': 1, 'generation': 7})
        store.path.write_text(planted, encoding='utf-8')
        app, database = build(workdir, store)
        response = await call(app)
        users, sessions = leftovers(database)
        check(
            'B35 账号文件已存在时回 409（而不是 500）',
            response.status_code == 409,
            f'status={response.status_code} body={response.text[:120]}',
        )
        check(
            'B35 账号文件已存在时不覆盖它（内容一个字节都没变）',
            store.path.read_text(encoding='utf-8') == planted,
            store.path.read_text(encoding='utf-8')[:120],
        )
        check(
            'B35 账号文件已存在时也不留半成品用户与会话',
            users == 0 and sessions == 0,
            f'users={users} sessions={sessions}',
        )

    check(
        'B35 stage() 的冲突类型是专门的一类（可被路由精确映射成 409）',
        issubclass(AdminAccountConflict, RuntimeError),
        'AdminAccountConflict 继承 RuntimeError，未改动既有捕获面',
    )


def check_license_flag_default_matches_loader() -> None:
    """B46：``license_required`` 的字段默认值必须与 ``load_settings`` 的取值一致。

    这个开关在 6 处被读（启动校验、心跳、状态接口、3D 交互的授权判定……），而
    dataclass 默认是 False、加载器写死 True —— 直接构造 ``Settings`` 的自检与内部
    工具拿到的是「另一种产品」：授权闸门在它们那里是关着的。差异只在某条分支上才
    看得出来，所以只能在这里把两处钉在一起。

    同样重要的一点：**加载器不许读环境变量**。README 承诺「不能用环境变量关掉授权」，
    一旦有人为了「让默认值与字段一致」而去读 ``APP_LICENSE_REQUIRED``，这个承诺就
    失守了 —— 所以这里连「环境变量改不动它」也一起钉住。
    """
    from backend.app.config import Settings, load_settings

    with tempfile.TemporaryDirectory(prefix='hb-b46-') as tmp:
        settings = Settings(data_dir=Path(tmp))
        loaded = load_settings()
        check(
            'B46 license_required 的字段默认值与加载器一致（都是 True）',
            settings.license_required is True and loaded.license_required is True,
            f'default={settings.license_required} loader={loaded.license_required}',
        )
        check(
            'B46 显式传 False 仍然可用（自检与内部工具的唯一入口）',
            Settings(data_dir=Path(tmp), license_required=False).license_required is False,
            '显式 False 被尊重',
        )

    source = (PROJECT_ROOT / 'backend/app/config.py').read_text(encoding='utf-8')
    tree = ast.parse(source)
    loader_mentions_env = False
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name != 'load_settings':
            continue
        loader_mentions_env = any(
            isinstance(inner, ast.Constant)
            and isinstance(inner.value, str)
            and 'LICENSE_REQUIRED' in inner.value
            for inner in ast.walk(node)
        )
    check(
        'B46 加载器不读任何 license 环境变量（README 承诺关不掉）',
        not loader_mentions_env,
        '没读' if not loader_mentions_env else 'load_settings 里出现了 LICENSE_REQUIRED',
    )


# --------------------------------------------------------------------------- #
# 前端高危项（P6 / W1-W5）：活体探针
# --------------------------------------------------------------------------- #
FRONTEND_ROOT = PROJECT_ROOT / 'frontend'

#: 探针文件；套件名 -> 该套件守护的缺陷。交给 node 跑，跑的就是磁盘上那一份前端文件。
FRONTEND_PROBE = PROJECT_ROOT / 'backend' / 'tools' / 'frontend_probe.mjs'
FRONTEND_PROBE_SUITES = {
    'api-fetch': 'W1/W2 接口超时预算的唯一主人（utils/api-fetch.js）',
    'request-json': 'W1 编辑器唯一接口出入口（home.js requestJson）',
    'studio-request': 'W2 舞台页唯一接口出入口（studio-app.js requestStudioApi）',
    'login': 'W3 登录按钮与超时（login.js）',
    'display-boot': 'W4/W5 展示页运行期横幅（display-boot.js）',
    'pair': 'W6 配网页提交按钮与超时（pair.js）',
    'pair-scan': 'W27 扫码带入配对码后的焦点与退路（pair.js 扫码分支）',
    'auth-shell': 'W25/W26 鉴权壳页的角色区守卫与指针几何缓存（auth-shell.js）',
    'renderer-resize': 'W20 resize 的先读后写与一帧一遍（renderer.js）',
    'studio-history': 'W22 撤销 / 重做的互斥闩与长按自动重复（studio-app.js）',
    'debug-log': 'W23 生产控制台的诊断开关（utils/debug-log.js）',
    'runtime-caches': 'W19 历史序列缓存的上限常量（renderer/runtime-caches.js）',
    'number-helpers': 'P10-B 四份「夹取」契约的语义与参数顺序（utils/numbers.js）',
    'color-helpers': 'P10-B 三份「颜色归一」契约的差异（utils/colors.js）',
    'entity-helpers': 'P10-B 实体检索文本与实体域的边界（utils/entities.js）',
    'apple-device': 'P10-B 苹果移动端判定的设备矩阵（utils/apple-device.js）',
    'setup': 'W6 初始化页提交按钮与超时（setup.js）',
    'license': 'W6/W7 授权页激活提交与状态轮询（license.js）',
    'home-boot': 'W8 编辑器启动分片（home.js 启动序列）',
    'home-snapshot': 'W9 草稿恢复快照的内容与失败告警（home.js）',
    'optimistic-toggle': 'W10 乐观开关的确认超时回滚与提示（renderer.js）',
    'dialog-escape': 'W12 ESC 逐层收口（renderer.js 运行时弹窗）',
    'dialog-a11y': 'W11 运行时弹窗的模态语义与焦点（renderer.js）',
    'interaction3d-mount': 'W13 3D 运行时挂载失败的兜底（bridge.js）',
    'studio-conflict': 'W15 保存冲突的三条出路与稍后处理（studio-app.js）',
}

#: 真的被 ``_run_frontend_probe`` 调用过的套件。登记表只是一张名单，
#: 调用点是各处硬编码的元组 —— 两者会脱节，脱节的后果是「套件不跑」，
#: 而「不跑」在自检里和「全绿」长得一模一样。
_PROBE_SUITES_RUN: set[str] = set()

#: W3/W6：四个「未激活页面」的提交复位语句 —— 都写在同一个表单提交处理器里，
#: 也都必须落在 finally 块体内。为什么用结构断言而不是只看行为：探针里的「悬挂」
#: 最终会被超时那一刀切开，于是把复位挪回 catch 分支仍然能通过行为断言；可一旦
#: 超时预算被去掉（或以后新增一条 return 路径），catch 分支就再也兜不住了。
FORM_SUBMIT_RESET_STATEMENTS = {
    'static/login.js': ('submit.disabled = !1',),
    'static/pair.js': ('submitButton.disabled = !1',),
    'static/setup.js': ('submit.disabled = false',),
    # 授权页多一条：activationPending 是「防重复提交」的闩，漏放同样会锁死按钮。
    'static/license.js': ('submit.disabled = !1', 'activationPending = !1'),
}

#: 语法门覆盖的文件：P6/P7 改过的页面脚本，加上它们新引入的工具模块。
#: 为什么不扫整个 frontend/：全量扫要一两百次 node 启动，太重；全仓语法门属于
#: CI 的事（P9），这里只保证「这批改过的文件不会因为截断 / 括号错位静默失效」。
FRONTEND_SYNTAX_FILES = (
    'frontend/static/home.js',
    'frontend/static/global-log-boot.js',
    'frontend/static/login.js',
    'frontend/static/display.js',
    'frontend/static/display-boot.js',
    'frontend/static/renderer/renderer.js',
    'frontend/static/3d-studio/studio-app.js',
    'frontend/static/utils/api-fetch.js',
    'frontend/static/utils/request-timeout.js',
    # P8：这几个是「诊断收口」时改过的文件 —— 它们只在探针里被 import（或压根不 import），
    # 语法错会一路静默到浏览器控制台，所以在自检里补一次解析。
    'frontend/static/utils/debug-log.js',
    'frontend/static/renderer/runtime-caches.js',
    # P10-B：这两份是「同名不同义」收敛后的唯一实现，探针只 import 它们，
    # 页面脚本 import 它们 —— 语法错会一路静默到浏览器控制台。
    'frontend/static/utils/numbers.js',
    'frontend/static/utils/colors.js',
    # P10-B 第二批：实体文本 / 实体域与苹果设备判定的唯一实现，同样只被 import。
    'frontend/static/utils/entities.js',
    'frontend/static/utils/apple-device.js',
    'frontend/static/renderer/registry.js',
    'frontend/static/3d-studio/studio-shadow-atlas.js',
    'frontend/static/3d-studio/studio-external-models.js',
    'frontend/static/3d-studio/draco-decoder-worker.js',
    'frontend/static/pair.js',
    'frontend/static/auth-shell.js',
    'frontend/static/pairing-entry.js',
    'frontend/static/setup.js',
    'frontend/static/license.js',
)


def _run_frontend_probe(suite: str) -> None:
    """跑一个前端探针套件，把里面每条断言原样登记成自检项。

    node 不在时跳过（与 ``store/tools/smoke.py`` 的静态资源检查同一口径）；
    探针自己崩了（退出码 2 或没吐出 JSON）时登记一条失败而不是抛栈 —— 那种情况
    等于「这一套断言一条都没跑」，必须是红的。
    """
    # 记账放在最前面：``check_frontend_probe_suites_all_ran`` 要拦的是「登记了却
    # 没有调用点」，与 node 在不在无关 —— 后者本来就该是 skip 而不是红。
    _PROBE_SUITES_RUN.add(suite)
    purpose = FRONTEND_PROBE_SUITES[suite]
    if shutil.which('node') is None:
        check(f'前端探针 {suite}（{purpose}）', True, 'skipped：环境里没有 node')
        return
    try:
        probe = subprocess.run(  # noqa: S603
            ['node', str(FRONTEND_PROBE), str(PROJECT_ROOT), suite],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        check(f'前端探针 {suite} 能在 120 秒内跑完', False, '超时（多半是探针卡在永远不结算的等待上）')
        return
    last_line = next(
        (line for line in reversed(probe.stdout.strip().splitlines()) if line.strip().startswith('{')),
        '',
    )
    try:
        payload = json.loads(last_line)
        probe_results = payload['results']
        assert isinstance(probe_results, list) and probe_results
    except (ValueError, KeyError, AssertionError):
        # 顺手报出 stdout 长度：结果 JSON 被截断时（探针用 process.exit 丢掉还没落盘的
        # 异步写、管道缓冲区刚好 64 KiB）从「长度 = 65536 的整数倍附近」一眼可辨，
        # 比只盯尾部那段乱码有用得多。
        check(
            f'前端探针 {suite} 吐出了完整结果（{purpose}）',
            False,
            f'stdout {len(probe.stdout)} 字节；'
            f'stdout={probe.stdout.strip()[-300:]!r} stderr={probe.stderr.strip()[-300:]!r}',
        )
        return
    for probe_result in probe_results:
        check(f"[{suite}] {probe_result['name']}", probe_result['ok'], probe_result['detail'])


def check_frontend_api_request_timeouts() -> None:
    """W1/W2：所有接口调用都带超时预算，「请求悬挂 → 上层闩永不复位」不许再出现。

    三套探针合起来守一条不变量：预算在 utils/api-fetch.js 里（常量 + 二进制体自动
    放宽），两个唯一出入口（home.js 的 requestJson、studio-app.js 的
    requestStudioApi）都真的走它。断言点全是行为：把假时钟推到 20 秒，看它抛不抛、
    抛的是不是 TimeoutError、中止信号有没有真的落到 fetch 上。
    """
    _run_frontend_probe('api-fetch')
    _run_frontend_probe('request-json')
    _run_frontend_probe('studio-request')

    # 第四个入口（客户端日志上报引导）没有行为探针：它是引导脚本、模块顶层就摸 DOM，
    # 整份加载不划算（login.js 那条之所以能整份跑，是因为它短且垫片少）。因此改用
    # 结构断言把它钉住 —— 该文件里不再出现裸 fetch，且确实引用了 apiFetch。
    # 与 W1 的「超时预算只有一个主人」是同一类要求：多一个裸 fetch 调用点，就多一处
    # 没有预算的路径，而这处恰好是「悬挂了就永远停在『正在上报』」的那种。
    log_boot_source = (FRONTEND_ROOT / 'static' / 'global-log-boot.js').read_text(encoding='utf-8')
    bare_fetch = re.search(r'(?<![A-Za-z_$])fetch\(', log_boot_source)
    if 'apiFetch(' not in log_boot_source:
        log_boot_detail = '文件里没有 apiFetch(（超时预算的唯一入口没被引用）'
    elif bare_fetch is None:
        log_boot_detail = '只走 apiFetch，没有裸 fetch 调用点'
    else:
        log_boot_detail = (
            '仍有一处裸 fetch(：第 '
            f'{log_boot_source.count(chr(10), 0, bare_fetch.start()) + 1} 行'
        )
    check(
        'W1 日志上报引导也走 apiFetch（该文件里不再有裸 fetch）',
        bare_fetch is None and 'apiFetch(' in log_boot_source,
        log_boot_detail,
        )


def _js_block_body(source: str, marker: str) -> str | None:
    """取出 ``marker`` 之后第一对花括号之间的源码。

    为什么需要它：「这个方法体里不许再出现裸 8000」「这个调用点必须先看保存结论」
    这类要求必须只看目标函数体 —— 扫全文会被同一文件里无关的 8000（重连退避、
    其它模块的排期）或其它调用点的结论判断误判成红。括号配对扫描，因此函数体里
    嵌套的块、字符串里的花括号都不会把结果带偏。

    @param source 文件全文。
    @param marker 定位用的片段（例如 ``applyOptimisticToggle(toggleEntityIdInput``）。
    @returns 块体源码；找不到 marker 或括号不配对时返回 None（调用方据此判红）。
    """
    marker_index = source.find(marker)
    if marker_index == -1:
        return None
    body_open = source.find('{', marker_index)
    if body_open == -1:
        return None
    depth = 0
    for cursor in range(body_open, len(source)):
        if source[cursor] == '{':
            depth += 1
        elif source[cursor] == '}':
            depth -= 1
            if depth == 0:
                return source[body_open + 1:cursor]
    return None


def check_frontend_operation_feedback() -> None:
    """W10/W12/W13/W15：操作之后的反馈必须存在、唯一、且不许谎报。

    这几处的共同点曾经都是「用户看不见」：回滚静默、ESC 被里层吞掉整层照样关、
    3D 挂载失败只剩一句「无法载入」、保存冲突把自动保存锁死。行为断言（探针四个
    套件）能证明修好的路径跑起来对，但证明不了**接线与唯一性**：
    「十条弹窗都走同一个 ESC 助手、没有第二处手写」「常驻入口真的接上了事件」
    「两个会说『已保存』的调用点都先看结论」只能静态看。
    """
    for suite in (
        'optimistic-toggle',
        'dialog-escape',
        'interaction3d-mount',
        'studio-conflict',
    ):
        _run_frontend_probe(suite)

    renderer_source = (FRONTEND_ROOT / 'static' / 'renderer' / 'renderer.js').read_text(encoding='utf-8')
    bridge_source = (
        FRONTEND_ROOT / 'static' / 'modules' / 'interaction3d' / 'bridge.js'
    ).read_text(encoding='utf-8')
    studio_source = (FRONTEND_ROOT / 'static' / '3d-studio' / 'studio-app.js').read_text(encoding='utf-8')
    studio_html = (FRONTEND_ROOT / '3d-studio.html').read_text(encoding='utf-8')

    # W10：确认超时只能有一个主人，且回滚必须挂了提示。
    optimistic_body = _js_block_body(renderer_source, 'applyOptimisticToggle(toggleEntityIdInput')
    check(
        'W10 乐观开关的确认超时只有一个主人（方法体里不再有裸 8000）',
        optimistic_body is not None
        and '8000' not in optimistic_body
        and optimistic_body.count('OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS') == 2,
        f'body={optimistic_body if optimistic_body is None else optimistic_body[:200]!r}',
    )
    check(
        'W10 回滚路径挂着 onError（回滚不吭声 = 用户以为按钮坏了，会反复点）',
        optimistic_body is not None
        and 'this.options.onError?.(createOptimisticToggleTimeoutError(' in optimistic_body,
        '回滚分支没有把超时错误交给 onError',
    )

    # W12：没有第二处手写的「关闭整层」，十条弹窗全部走助手。
    hand_rolled_escapes = re.findall(
        r'if \(\w+\.key === "Escape"\) \{\s*\n\s*\w+\.close\(\);',
        renderer_source,
    )
    check(
        'W12 运行时弹窗不再各写一份「Escape 就关整层」（全部收口到同一个助手）',
        not hand_rolled_escapes
        and renderer_source.count('this.bindRuntimeDialogEscapeClose(') == 10,
        f'手写份数={len(hand_rolled_escapes)} 助手调用={renderer_source.count("this.bindRuntimeDialogEscapeClose(")}',
    )
    check(
        'W12 ESC 助手看 defaultPrevented（里层下拉/展开面板处理过就不再关这一层）',
        '!escapeKeyEvent.defaultPrevented' in renderer_source,
        '助手里没有 defaultPrevented 判断 —— 等于把收口又退回到「谁都能关」',
    )

    # W13：失败原因不许被丢掉，且要同时进文案、日志与等待者。
    # 只看真正的裸 catch 子句（`} catch {`）：文档注释里会写「原先这里是裸 catch {}」，
    # 拿它当命中就是被打注释假红。
    check(
        'W13 bridge 里不再有裸 catch（吞掉 import 失败的原因）',
        not re.search(r'\}\s*catch\s*\{', bridge_source),
        'bridge.js 仍有裸 catch —— 挂载失败的原因会被再次吞掉',
    )
    load_failure_body = _js_block_body(bridge_source, 'function showInteraction3dLoadFailure(')
    check(
        'W13 挂载失败的兜底三件事都在：占位文案带原因、原始错误进日志、等待者当场被拒',
        load_failure_body is not None
        and 'loadFailureReason' in load_failure_body
        and 'window.HABridgeLog?.error?.' in load_failure_body
        and "phase: \"interaction3d-mount\"" in load_failure_body
        and 'notifyViewReady(' in load_failure_body,
        f'body={load_failure_body if load_failure_body is None else load_failure_body[:200]!r}',
    )

    # W15：冲突必须留出口，且不许把「没落盘」说成「已保存」。
    check(
        'W15 冲突弹窗有「稍后处理」、顶栏有常驻入口、ESC 等同稍后处理',
        all(
            marker in studio_html
            for marker in ('id="save-conflict-later"', 'id="save-conflict-reopen"')
        )
        and 'saveConflictLaterButton.addEventListener("click", deferSaveConflict)' in studio_source
        and 'saveConflictReopenButton.addEventListener("click"' in studio_source
        and 'dialogCancelEvent.preventDefault();\n  deferSaveConflict();' in studio_source,
        '三条出路里的某一条没有接线（按钮在 HTML 里、事件没接上）',
    )
    base_lighting_body = _js_block_body(studio_source, 'function saveBaseLighting()')
    check(
        'W15 基础光保存先看结论再说话（冲突/失败时不再谎报「已保存」）',
        base_lighting_body is not None
        and '"saved"' in base_lighting_body
        and '"blocked-by-conflict"' in base_lighting_body,
        f'body={base_lighting_body if base_lighting_body is None else base_lighting_body[:200]!r}',
    )
    camera_view_body = _js_block_body(studio_source, 'function saveCurrentCameraView()')
    check(
        'W15 机位保存先看结论再说话（冲突/失败时不再谎报「已保存」）',
        camera_view_body is not None
        and '"blocked-by-conflict"' in camera_view_body
        and '"failed"' in camera_view_body,
        f'body={camera_view_body if camera_view_body is None else camera_view_body[:200]!r}',
    )


def check_frontend_dialog_modal_semantics() -> None:
    """W11 + W21：运行时弹窗的模态语义、焦点，以及「遮罩只有一个来源」。

    为什么这一条不是「换个 showModal() 就完事」：弹窗层挂在画布容器里（`this.container` /
    3D 呈现根），弹窗坐标是画布坐标。`showModal()` 会把弹窗提到顶层，于是
    （一）在整体缩放的展示页上它脱离画布坐标系，尺寸位置走样；
    （二）它还会额外生成 `::backdrop`，与层自带的遮罩叠在一起。
    所以这里保留 `show()` 的坐标空间，把模态该有的四件事（`aria-modal` + `aria-labelledby`、
    焦点交接、Tab 循环、关闭还焦点）收在 `presentRuntimeDialog` 里 ——
    「十条弹窗都走它、且没有第二条 `show()`」正是只能静态看的那一半。

    W21 是这条决定的下半句：``show()`` 不把元素送进顶层，所以**这些弹窗的 ``::backdrop``
    从来不会生成** —— 文件里原本那两条规则（相机预览、实体详情）是死代码，P9 已删除，
    遮罩从此只有承载层一个来源。反过来，三条下拉菜单的 ``::backdrop`` 是**活的**：
    它们是 ``div[popover]``，展开时进顶层。这一段把两边的边界都钉住。
    """
    _run_frontend_probe('dialog-a11y')

    renderer_source = (FRONTEND_ROOT / 'static' / 'renderer' / 'renderer.js').read_text(encoding='utf-8')
    present_body = _js_block_body(renderer_source, 'presentRuntimeDialog(dialogLayerElement, dialogElement)')
    check(
        'W11 十条运行时弹窗都走 presentRuntimeDialog（不再各自 show()）',
        renderer_source.count('this.presentRuntimeDialog(') == 10
        and not re.search(r'\w+DialogElement\.show\(\);', renderer_source)
        and not re.search(r'\w+Dialog\.show\(\);', renderer_source),
        f'助手调用={renderer_source.count("this.presentRuntimeDialog(")} '
        f'裸 show()={len(re.findall(r"\\w+Dialog(Element)?\\.show\\(\\);", renderer_source))}',
    )
    check(
        'W11 模态四件事都在同一个方法里：aria-modal / aria-labelledby / 焦点交接 / 关闭还焦点',
        present_body is not None
        and '"aria-modal"' in present_body
        and '"aria-labelledby"' in present_body
        and 'dialogElement.show();' in present_body
        and 'dialogElement.focus(' in present_body
        and 'previouslyFocusedElement?.isConnected' in present_body,
        f'body={present_body if present_body is None else present_body[:200]!r}',
    )
    check(
        'W11 焦点循环在关闭时被撤掉（留着的键盘监听会去动一个已经消失的弹窗）',
        present_body is not None
        and 'removeEventListener("keydown", focusTrapHandler)' in present_body,
        f'关闭分支摘监听的次数={present_body.count("removeEventListener") if present_body else 0}',
    )
    check(
        'W11 已打开的弹窗不再 show() 一次（原生 show() 对已打开的弹窗抛 InvalidStateError）',
        present_body is not None and 'dialogElement.open' in present_body,
        f'open 守卫出现次数={present_body.count("dialogElement.open") if present_body else 0}',
    )
    focusable_selector_match = re.search(
        r'RUNTIME_DIALOG_FOCUSABLE_SELECTOR = \[(.*?)\]\s*\.join',
        renderer_source,
        re.DOTALL,
    )
    focusable_selector = focusable_selector_match.group(1) if focusable_selector_match else ''
    check(
        'W11 焦点可及性的选择器排掉禁用与 tabindex="-1"（探针的桩只认两种形态，这里看真的）',
        bool(focusable_selector)
        and 'button:not([disabled])' in focusable_selector
        and 'input:not([disabled])' in focusable_selector
        and '[tabindex]:not([tabindex="-1"])' in focusable_selector,
        f'selector={focusable_selector!r}',
    )

    # ---- W21：::backdrop 的死 / 活边界 ----
    renderer_css = (FRONTEND_ROOT / 'static' / 'renderer' / 'renderer.css').read_text(encoding='utf-8')
    backdrop_selectors = [
        selector
        for rule_selector, _ in _css_rules(renderer_css)
        for selector in [item.strip() for item in rule_selector.split(',')]
        if '::backdrop' in selector
    ]
    show_opened_backdrops = [
        selector
        for selector in backdrop_selectors
        if selector.startswith(('.hb-camera-preview-dialog', '.hb-entity-details-dialog'))
    ]
    check(
        'W21 两个用 show() 打开的弹窗不再写 ::backdrop（show() 不进顶层，写了也永不生成；P9 已删）',
        not show_opened_backdrops,
        f'仍在={show_opened_backdrops}'
        if show_opened_backdrops
        else f'渲染器里剩下的 ::backdrop 全是 popover 的（{len(backdrop_selectors)} 条）',
    )
    layer_declarations = _css_rule_declarations(renderer_css, '.hb-renderer-runtime-dialog-layer')
    check(
        'W21 弹窗外的暗色遮罩只剩承载层一个来源（删掉那两条 ::backdrop 之后它是唯一的）',
        bool(layer_declarations.get('background')) and bool(layer_declarations.get('backdrop-filter')),
        f"background={layer_declarations.get('background')!r} "
        f"backdrop-filter={layer_declarations.get('backdrop-filter')!r}",
    )
    popover_menu_classes = (
        'hb-electric-bed-select-menu',
        'hb-related-select-menu',
        'hb-climate-select-menu',
    )
    not_popover_menus = [
        name
        for name in popover_menu_classes
        if not re.search(
            r'createElement\("div"\);\s*\n\s*\w+\.className =\s*"' + re.escape(name) + r'"',
            renderer_source,
        )
    ]
    popover_attribute_count = renderer_source.count('setAttribute("popover", "auto")')
    check(
        'W21 三条 ::backdrop 是活的：下拉菜单是 div[popover]（展开时进顶层），别按上面的口径删掉',
        not not_popover_menus and popover_attribute_count >= len(popover_menu_classes),
        f'不是 div+popover 形态的={not_popover_menus}；popover 属性出现 {popover_attribute_count} 次',
    )


def _css_rules(css_text: str) -> list[tuple[str, str]]:
    """把 CSS 切成 ``(选择器, 声明块)`` 列表。

    只取「花括号内不再有花括号」的那一层：`@media` 的头（`@media (...) {`）匹配不到，
    它里面的规则因为选择器里不含花括号而照常单独成项 —— 因此
    `_css_rules(_css_brace_body(css, '@media ...'))` 拿到的就是该媒体查询里的规则。
    先剥掉注释：注释落在规则前面，会被算进「选择器」那一组，
    于是 `.element-visibility` 这种精确匹配就永远匹配不上。

    @param css_text CSS 全文。
    @returns 规则列表（选择器已 strip，保留逗号分隔的原文）。
    """
    stripped = re.sub(r'/\*.*?\*/', '', css_text, flags=re.DOTALL)
    return [
        (match.group(1).strip(), match.group(2).strip())
        for match in re.finditer(r'([^{}]+)\{([^{}]*)\}', stripped, re.DOTALL)
    ]


def _css_brace_body(css_text: str, marker: str, search_from: int = 0) -> str:
    """取 ``marker`` 之后第一对花括号之间的内容（与 `_js_block_body` 同一套括号配平逻辑）。"""
    return _js_block_body(css_text[search_from:], marker) or ''


def _css_px(value: str) -> float | None:
    """把 ``12px`` 这类长度读成数字；`%` / `auto` / 变量一律返回 None。"""
    matched = re.match(r'^\s*(-?\d+(?:\.\d+)?)px\s*$', value or '')
    return float(matched.group(1)) if matched else None


def _css_hex_color(value: str) -> tuple[int, int, int] | None:
    """把 ``#1a2026`` / ``#fff`` 读成 RGB 三元组。"""
    matched = re.match(r'^\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*$', value or '')
    if not matched:
        return None
    hex_text = matched.group(1)
    if len(hex_text) == 3:
        hex_text = ''.join(character * 2 for character in hex_text)
    return tuple(int(hex_text[index:index + 2], 16) for index in (0, 2, 4))


def _wcag_contrast(foreground: tuple[int, int, int], background: tuple[int, int, int]) -> float:
    """WCAG 相对亮度对比度（1.0 ~ 21.0）。"""

    def relative_luminance(color: tuple[int, int, int]) -> float:
        channels = []
        for channel in color:
            ratio = channel / 255
            channels.append(ratio / 12.92 if ratio <= 0.03928 else ((ratio + 0.055) / 1.055) ** 2.4)
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    brighter, darker = sorted((relative_luminance(foreground), relative_luminance(background)), reverse=True)
    return (brighter + 0.05) / (darker + 0.05)


def _css_rule_declarations(css_text: str, selector: str) -> dict[str, str]:
    """取某个选择器（逗号分隔的任一项）命中的**全部**规则的合并声明表。

    必须合并而不是取第一条：命中区那批小控件先在一个共用规则里挂 `position: relative`，
    尺寸分别写在各自的规则里；只取第一条就会读成「没有尺寸」。
    按出现顺序合并、后者覆盖前者，与 CSS 的层叠方向一致。
    """
    declarations: dict[str, str] = {}
    for rule_selector, rule_body in _css_rules(css_text):
        if selector in [item.strip() for item in rule_selector.split(',')]:
            declarations.update(
                {
                    name.strip().lower(): value.strip()
                    for name, _, value in (part.partition(':') for part in rule_body.split(';'))
                    if value
                }
            )
    return declarations


def check_frontend_motion_and_target_guards() -> None:
    """W14/W16/W17：动效减弱兜底、命中区与对比度 —— 全部按 CSS 文本算出来。

    这三条都是纯样式、没有可观察的行为：动效有没有被关掉、命中区多大、颜色对比度多少，
    读源码「看着像」是最容易骗过自己的做法。所以这里的观测量是**计算**：
    无限动画的选择器必须逐个出现在 reduced-motion 块里、
    命中区按 `width + 2×|inset|` 算出来必须过线、颜色按 WCAG 公式算出对比度必须过关。
    数字写进诊断信息，改坏了能直接看出差多少。
    """
    studio_css = (FRONTEND_ROOT / 'static' / '3d-studio' / 'studio.css').read_text(encoding='utf-8')
    auth_css = (FRONTEND_ROOT / 'static' / 'auth.css').read_text(encoding='utf-8')
    app_css = (FRONTEND_ROOT / 'static' / 'app.css').read_text(encoding='utf-8')

    # ---- W14：studio.css 的每一处无限动画都要有 reduced-motion 兜底 ----
    reduced_motion_bodies = []
    search_from = 0
    while True:
        marker_index = studio_css.find('@media (prefers-reduced-motion: reduce)', search_from)
        if marker_index == -1:
            break
        body = _css_brace_body(studio_css, '@media (prefers-reduced-motion: reduce)', search_from)
        if body:
            reduced_motion_bodies.append(body)
        search_from = marker_index + 1
    guarded_selectors = set()
    for body in reduced_motion_bodies:
        for rule_selector, rule_body in _css_rules(body):
            if 'animation' in rule_body and 'none' in rule_body:
                guarded_selectors.update(item.strip() for item in rule_selector.split(','))
    infinite_animation_selectors = [
        item.strip()
        for rule_selector, rule_body in _css_rules(studio_css)
        if 'infinite' in rule_body and 'animation' in rule_body
        for item in rule_selector.split(',')
    ]
    check(
        'W14 studio.css 的每一处无限动画都有「减少动效」兜底（逐个选择器核对，不是抽一个代表）',
        bool(infinite_animation_selectors)
        and all(selector in guarded_selectors for selector in infinite_animation_selectors),
        f'无限动画={infinite_animation_selectors}；已守卫={sorted(guarded_selectors)}',
    )

    # ---- W14：auth.css 的入场动画要「瞬间到终态」，而不是 animation: none ----
    auth_guard_body = _css_brace_body(auth_css, '@media (prefers-reduced-motion: reduce)')
    auth_entrance_selectors = [
        '.home-characters.is-ready .character-purple',
        '.home-characters.is-ready .character-dark',
        '.home-characters.is-ready .character-orange',
        '.home-characters.is-ready .character-yellow',
    ]
    guarded_entrance = [
        selector
        for selector, body in _css_rules(auth_guard_body)
        for selector in (item.strip() for item in selector.split(','))
        if selector in auth_entrance_selectors
    ]
    check(
        'W14 四个入场角色都在「减少动效」块里（漏一个就会有一个角色飞进来）',
        sorted(guarded_entrance) == sorted(auth_entrance_selectors),
        f'已守卫={sorted(guarded_entrance)}',
    )
    check(
        'W14 入场动画用 1ms 到终态而不是 animation: none（关掉动画会回落到带 skew 的静态样式，'
        '与关键帧的 to 不等价 —— 等于顺手改了最终姿态）',
        'animation-duration: 1ms' in auth_guard_body
        and 'animation-delay: 0s' in auth_guard_body
        and 'animation: none' not in auth_guard_body,
        auth_guard_body.replace('\n', ' ')[:200],
    )

    # ---- W16：可见性按钮的命中区与隐藏态对比度 ----
    visibility_rule = _css_rule_declarations(app_css, '.element-visibility')
    visibility_hit_rule = _css_rule_declarations(app_css, '.element-visibility:after')
    row_rule = _css_rule_declarations(app_css, '.element-item')
    hit_inset = _css_px((visibility_hit_rule.get('inset') or '').split()[0]) if visibility_hit_rule else None
    visibility_width = _css_px(visibility_rule.get('width', ''))
    row_height = _css_px(row_rule.get('min-height', ''))
    check(
        'W16 可见性按钮的可点区域按 width + 2×外扩算出来过 44×44（列宽 28px 不动，只外扩）',
        visibility_rule.get('position') == 'relative'
        and hit_inset is not None
        and hit_inset < 0
        and visibility_width is not None
        and row_height is not None
        and visibility_width + 2 * abs(hit_inset) >= 44
        and row_height + 2 * abs(hit_inset) >= 44,
        f'position={visibility_rule.get("position")} width={visibility_width} '
        f'行高={row_height} inset={hit_inset}',
    )
    surface_color = _css_hex_color(_css_rule_declarations(app_css, ':root').get('--surface', ''))
    hidden_color = _css_hex_color(
        _css_rule_declarations(app_css, '.element-visibility.hidden-element').get('color', '')
    )
    visible_color = _css_hex_color(visibility_rule.get('color', ''))
    hidden_contrast = (
        _wcag_contrast(hidden_color, surface_color)
        if hidden_color and surface_color
        else 0.0
    )
    visible_contrast = (
        _wcag_contrast(visible_color, surface_color)
        if visible_color and surface_color
        else 0.0
    )
    check(
        'W16 隐藏态图标的对比度过 3:1（图形对象那条线），且仍明显暗于可见态',
        hidden_contrast >= 3.0 and hidden_contrast < visible_contrast,
        f'隐藏态 {hidden_contrast:.2f}:1 / 可见态 {visible_contrast:.2f}:1（底色 {surface_color}）',
    )

    # ---- W17：关键控件的命中区（基础档 + 触屏/平板档） ----
    key_control_selectors = [
        '.element-list-tabs button',
        '.add-element-button',
        '.workspace-sound-toggle',
        '.history-toolbar-button',
        '.icon-button',
        '.component-context-actions button',
        '.component-label-options button',
    ]
    hit_rule_selectors = [
        item.strip()
        for rule_selector, rule_body in _css_rules(app_css)
        if 'inset: -8px' in rule_body
        for item in rule_selector.split(',')
        if item.strip().endswith(':before')
    ]
    check(
        'W17 七个关键控件都挂了命中区外扩（用 ::before —— active 页签的下划线占着 ::after）',
        all(f'{selector}:before' in hit_rule_selectors for selector in key_control_selectors),
        f'已挂={sorted(hit_rule_selectors)}',
    )
    undersized_controls = []
    for selector in key_control_selectors:
        declarations = _css_rule_declarations(app_css, selector)
        heights = [
            size
            for size in (_css_px(declarations.get('height', '')), _css_px(declarations.get('min-height', '')))
            if size is not None
        ]
        widths = [
            size
            for size in (_css_px(declarations.get('width', '')), _css_px(declarations.get('min-width', '')))
            if size is not None and size > 0
        ]
        if not heights or heights[0] + 16 < 44:
            undersized_controls.append(f'{selector} 高={heights}')
        if widths and widths[0] + 16 < 44:
            undersized_controls.append(f'{selector} 宽={widths}')
    check(
        'W17 外扩 8px 之后每个关键控件的命中区都过 44（尺寸从各自的规则里读出来算的）',
        not undersized_controls,
        '；'.join(undersized_controls) or f'{len(key_control_selectors)} 个控件全部过线',
    )
    touch_rule = _css_brace_body(app_css, '@media (max-width: 1180px), (pointer: coarse)')
    touch_inset = None
    for rule_selector, rule_body in _css_rules(touch_rule):
        if rule_selector.strip().endswith(':before') and 'inset' in rule_body:
            touch_inset = _css_px(rule_body.split('inset:', 1)[1].split(';')[0].strip())
    check(
        'W17 平板与触屏再放宽一档到 48（按指针判定，触屏才是「点不准」的原因）',
        touch_inset is not None and touch_inset <= -10,
        f'touch_inset={touch_inset} body={touch_rule[:120]!r}',
    )


def _reset_statement_in_finally(source: str, reset_statement: str) -> tuple[bool, str]:
    """判断 ``reset_statement`` 是否落在文件中某个 ``} finally {`` 块体内。

    为什么要遍历所有 finally 块而不是只看第一个：license.js 里 ``refreshStatus`` 的
    ``finally``（放的是状态请求的在飞闩）排在提交处理器的 ``finally`` 之前 —— 只看
    第一个会把「复位其实在后面的 finally 里」误判成红。

    为什么要括号配平地扫块体：块里可能有更深的一层花括号（license.js 的复位是
    `((submit.disabled = !1), (activationPending = !1));`），只找「下一行」的写法
    会在第一次嵌套就报假红。

    @param source 文件全文。
    @param reset_statement 要查找的复位语句。
    @returns (是否在某个 finally 里, 该语句现在所处的那一行文本)。
    """
    finally_marker = '} finally {'
    in_finally = False
    search_from = 0
    while not in_finally:
        finally_start = source.find(finally_marker, search_from)
        if finally_start == -1:
            break
        search_from = finally_start + len(finally_marker)
        cursor = search_from
        depth = 0
        while cursor < len(source):
            character = source[cursor]
            if character == '{':
                depth += 1
            elif character == '}':
                if depth == 0:
                    break
                depth -= 1
            cursor += 1
        in_finally = reset_statement in source[search_from:cursor]
    location = next(
        (
            line.strip()
            for line in source.splitlines()
            if reset_statement in line
        ),
        f'全文找不到 {reset_statement!r}',
    )
    return in_finally, location


def check_frontend_form_resets_guarded() -> None:
    """W6：四个未激活页面的提交按钮复位必须写在 ``finally`` 里（结构断言）。

    探针能证明「超时之后按钮恢复」，但证明不了「复位不依赖超时」—— 悬挂请求最终
    会被 20 秒那一刀切开，于是把复位挪回 ``catch`` 分支依然能通过行为断言。而
    `catch` 分支在「超时预算被去掉」「以后新增一条 return 路径」两种情况下都会漏掉
    复位。所以这里逐个文件做结构断言：复位语句必须落在 ``finally`` 块体内。
    """
    for relative_path, statements in FORM_SUBMIT_RESET_STATEMENTS.items():
        source = (FRONTEND_ROOT / relative_path).read_text(encoding='utf-8')
        for statement in statements:
            in_finally, location = _reset_statement_in_finally(source, statement)
            check(
                f'W6 {relative_path} 的「{statement}」在 finally 里'
                '（成功 / 失败 / 超时三条路径都要复位）',
                in_finally,
                location,
            )


def check_frontend_auth_shell_guards() -> None:
    """W25/W26：鉴权壳页的空值守卫与「指针事件里不读几何」（结构断言）。

    探针用假 DOM 跑出了行为，但两件事只有静态看才作数：

    - **守卫写没写进结构**。把 ``if (!characters) return;`` 从 ``syncPasswordState``
      里删掉，探针只有在「角色区缺席」那个场景才会红；而这段逻辑以后被复制到别处
      （或守卫被内联成 ``characters?.classList`` 却漏掉几何那几行）时不再有人挡。
      同理，密码框的 id 来自 HTML，配错一个字母就是运行时 null。
    - **失效回调里不许测量**。``resize`` 在拖动窗口时连着来，把测量写在事件里等于
      每个 resize 事件强制一次同步布局 —— 这正是 W26 要治的病，只是换了个事件名。
    """
    source_path = FRONTEND_ROOT / 'static/auth-shell.js'
    if not source_path.is_file():
        check('W25/W26 auth-shell.js 存在（否则这条链上的断言全部无从谈起）', False, '文件不存在')
        return
    source = source_path.read_text(encoding='utf-8')
    characters_guard = 'if (!characters) return;'
    check(
        'W25 syncPasswordState 开头判角色区缺席（不靠调用方自觉，/pair 页真的没有它）',
        characters_guard in source,
        '有守卫' if characters_guard in source else f'没找到 {characters_guard!r}',
    )
    password_guard = 'if (!passwordInput) return;'
    check(
        'W25 密码框用 getElementById 取并判空（按钮指向的 id 可以不存在）',
        'getElementById(' in source and password_guard in source,
        f'getElementById={"getElementById(" in source} 判空={password_guard in source}',
    )
    # 用 find 而不是 index：结构断言面对的是「被改坏的文件」，找不到子串时必须
    # 报红，而不是抛 ValueError 把整份自检打断（那会让 656 条结果一条都不报）。
    toggle_marker = source.find('[data-toggle-password]')
    characters_block = source.find('if (characters) {')
    check(
        'W25 密码显隐接线排在角色块之前（缺角色区不连累与它无关的接线）',
        -1 not in (toggle_marker, characters_block) and toggle_marker < characters_block,
        f'按钮接线 @{toggle_marker} 角色块 @{characters_block}',
    )

    pointermove_body = _js_block_body(source, 'document.addEventListener("pointermove"')
    pointermove_red = (
        pointermove_body is not None and 'getBoundingClientRect' in pointermove_body
    )
    check(
        'W26 pointermove 回调里不读几何、只记坐标并排一帧（读 rect 会强制同步布局）',
        pointermove_body is not None and not pointermove_red and 'requestAnimationFrame' in pointermove_body,
        '回调体里出现了 getBoundingClientRect'
        if pointermove_red
        else ('没取到回调体' if pointermove_body is None else '回调体只记坐标并排一帧'),
    )
    missing_invalidations = [
        name
        for name in ('resize', 'orientationchange', 'scroll')
        if f'window.addEventListener("{name}"' not in source
    ]
    check(
        'W26 resize / 屏幕方向 / 滚动三处都让缓存失效（漏一处就会出现偏移算错）',
        not missing_invalidations,
        f'缺：{"、".join(missing_invalidations)}' if missing_invalidations else '三处齐全',
    )
    invalidate_body = _js_block_body(source, 'const invalidateLookBounds = () =>')
    invalidate_red = invalidate_body is not None and 'getBoundingClientRect' in invalidate_body
    check(
        'W26 失效回调只作废缓存、不当场测量（拖动窗口时 resize 连着来，测量搬不得）',
        invalidate_body is not None and not invalidate_red,
        '失效回调里在测量'
        if invalidate_red
        else ('没取到 invalidateLookBounds 函数体' if invalidate_body is None else '只作废缓存'),
    )

    _run_frontend_probe('auth-shell')


def check_frontend_pair_scan_focus() -> None:
    """W27：扫码带入配对码后不许把输入口藏起来，必须主动交焦点（结构断言）。

    行为断言只覆盖「正常路径」，而这两条都是**反向**要求 —— 少了它页面照样能连，
    只有键盘 / 读屏用户会掉到 body 上：探针能证明「焦点现在给对了」，证明不了
    「以后没人再把 label 藏起来」。所以把「不许出现」的写法和「必须出现」的写法
    都钉在结构上。
    """
    source_path = FRONTEND_ROOT / 'static/pair.js'
    if not source_path.is_file():
        check('W27 pair.js 存在（否则这条链上的断言全部无从谈起）', False, '文件不存在')
        return
    source = source_path.read_text(encoding='utf-8')
    hidden_label = [
        pattern
        for pattern in ('closest("label").hidden', "closest('label').hidden")
        if pattern in source
    ]
    check(
        'W27 不再把扫码带入的输入口藏起来（藏聚焦中的元素会把焦点甩回 body）',
        not hidden_label,
        f'又出现了：{"、".join(hidden_label)}' if hidden_label else '没有隐藏 label 的写法',
    )
    focus_call = re.search(r'submitButton\.focus\(', source)
    check(
        'W27 扫码成功后主动把焦点交给主按钮（键盘用户按 Enter 就能连）',
        focus_call is not None,
        f'@{focus_call.start()} 有 submitButton.focus(' if focus_call else '没找到 submitButton.focus(',
    )

    _run_frontend_probe('pair-scan')


def check_frontend_static_cache_stamps() -> None:
    """W18：HTML 引用的 ``/static`` 资源必须带**一致**的缓存戳。

    为什么值得一条自检：同一个模块被多页共用时，带戳与不带戳会各下载一份 ——
    两份模块实例、各自一份模块级状态。表现是「改了一页生效、另一页像没改」，
    服务端日志里连请求都看不出异常。这里同时钉两件事：一个都不许漏、
    以及全站只许有一个戳（换戳必须整站一起换）。
    """
    tag_pattern = re.compile(
        r'<(?:script|link)\b[^>]*?(?:src|href)="(/static/[^"]+)"',
        re.IGNORECASE,
    )
    stamps: set[str] = set()
    missing: list[str] = []
    for html_path in sorted(FRONTEND_ROOT.glob('**/*.html')):
        text = html_path.read_text(encoding='utf-8')
        for url in tag_pattern.findall(text):
            # vendor 的版本号写在路径里（/static/vendor/hls.js/1.6.16/...），
            # 再叠一层戳只会让升级 vendor 时多一处要改。
            if url.startswith('/static/vendor/'):
                continue
            if '?v=' not in url:
                missing.append(f'{html_path.name}: {url}')
            else:
                stamps.add(url.split('?v=', 1)[1])
    check(
        'W18 每个 /static 资源都带缓存戳（漏一个就会多出第二份模块实例）',
        not missing,
        '；'.join(missing) or '全部带戳',
    )
    check(
        'W18 全站缓存戳一致（各页各带一个戳时，模块会在页面间重复实例化）',
        len(stamps) == 1,
        '、'.join(sorted(stamps)),
    )
    for page in ('login.html', 'pair.html'):
        page_text = (FRONTEND_ROOT / page).read_text(encoding='utf-8')
        stamped = re.search(r'auth-shell\.js\?v=', page_text)
        check(
            f'W18 {page} 里的 auth-shell.js 带缓存戳（它被两页共用，戳不一致即两份实例）',
            stamped is not None,
            f'@{stamped.start()} 带戳' if stamped else '没找到 auth-shell.js?v=',
        )


def check_frontend_resize_batching() -> None:
    """W20：resize 的「先读后写 + 一帧一遍」（活体探针 + 两处接线断言）。

    探针能证明 resize 自己先读后写、scheduleResize 能合并，但**证明不了谁调用它** ——
    `scheduleResize` 在沙箱里被探针直接调用，把构造函数里的两个事件入口改回
    `this.resize()` 它照样全绿。而「漏掉一个入口」正好是这条修复最容易出的错：
    ResizeObserver 与 visualViewport 是两个独立的高频来源，只改一个就等于没改。
    """
    _run_frontend_probe('renderer-resize')

    source = (FRONTEND_ROOT / 'static' / 'renderer' / 'renderer.js').read_text(encoding='utf-8')
    observer_wired = 'new ResizeObserver(() => this.scheduleResize())' in source
    bound_resize_wired = 'this.boundResize = () => this.scheduleResize();' in source
    check(
        'W20 两个高频道尺寸入口都走 scheduleResize（只改一个 = 另一半照样每事件跑一遍）',
        observer_wired and bound_resize_wired,
        f'ResizeObserver={observer_wired} boundResize={bound_resize_wired}',
    )
    check(
        'W20 destroy 撤掉还没跑的那一帧（否则卸载后回调还会去摸已经清空的容器）',
        'cancelAnimationFrame(this.resizeFrameId)' in source,
        '没找到 cancelAnimationFrame(this.resizeFrameId)',
    )


def check_frontend_studio_history_guard() -> None:
    """W22：撤销 / 重做的互斥与长按挡板（活体探针 + 三处接线断言）。

    「快捷键分支有没有绕开入口」只能静态看：探针调的是 `applyHistoryShortcut`，
    把 keydown 里那段改回直接 `undo()` 它一样绿 —— 而 `repeat` 挡板正是在那个入口里，
    绕过去等于挡板失效。
    """
    _run_frontend_probe('studio-history')

    source = (FRONTEND_ROOT / 'static' / '3d-studio' / 'studio-app.js').read_text(encoding='utf-8')
    z_branch = _js_block_body(source, 'windowKeyDownEvent.key.toLowerCase() === "z"')
    check(
        'W22 Ctrl+Z 分支走统一入口（绕过 applyHistoryShortcut 就等于绕过 repeat 挡板）',
        z_branch is not None
        and 'applyHistoryShortcut(' in z_branch
        and 'undo();' not in z_branch
        and 'redo();' not in z_branch,
        (z_branch or '没取到分支体').strip(),
    )
    shortcut_body = _js_block_body(source, 'function applyHistoryShortcut(')
    check(
        'W22 入口里挡掉 repeat（长按的补发事件不算数）',
        shortcut_body is not None and 'shortcutEvent.repeat' in shortcut_body,
        (shortcut_body or '没取到 applyHistoryShortcut 函数体').strip(),
    )
    for function_name in ('undo', 'redo'):
        history_body = _js_block_body(source, f'async function {function_name}()')
        check(
            f'W22 {function_name} 以闩开头、在 finally 里放闩'
            '（漏了开头等于没闩，漏了 finally 会让一次失败永久锁死撤销）',
            history_body is not None
            and 'historyBusy' in history_body
            and 'finally' in history_body
            and history_body.count('historyBusy = !1') == 1,
            (history_body or f'没取到 {function_name} 函数体').strip()[:120],
        )


# --------------------------------------------------------------------------- #
# 前端低危项（P8）：诊断开关、经典脚本、缓存上限、开发期钩子
# --------------------------------------------------------------------------- #
#: W23：已经改走 ``utils/debug-log.js`` 的文件 -> 它们各自那条诊断的用途。
#: 断言「清理过了」时**同时**要求这里仍然调用 ``debugLog``：把 console 那行删掉也能让
#: 「全站 console 只剩一处」变绿，但那是丢诊断，不是收口。
DEBUG_LOG_CONSUMERS = {
    'static/3d-studio/studio-app.js': '灯光缓存 / WebGL 初始化 / 导出 / 两次预编译',
    'static/3d-studio/studio-shadow-atlas.js': '单灯烘焙失败、未出图灯清单、图集重建失败、几何刷新',
    'static/3d-studio/studio-external-models.js': '外部模型加载超时与非超时失败',
    'static/renderer/registry.js': 'HLS 播放失败（已由 HABridgeLog 上报）',
}

#: 生产代码里 ``console`` 的合法主人；其余一律走 ``debugLog``。
CONSOLE_OWNER = 'static/utils/debug-log.js'

#: 真正会调用 console 的方法名。用它而不是裸 ``console`` 一词：注释里提到
#: ``console.*`` 是在说这件事，不是在干这件事，否则这条断言会逼着人绕开词本身说话。
CONSOLE_CALL_PATTERN = re.compile(
    r'\bconsole\s*\.\s*(?:log|warn|error|info|debug|trace|table|assert|dir|group'
    r'|groupEnd|time|timeEnd|count|profile)\b'
)

#: W23：``debugLog`` 必须是被 import 进来的，不能被当成源码里的注释或字符串。
IMPORT_DEBUG_LOG_PATTERN = re.compile(
    r'^import\s*\{[^}]*\bdebugLog\b[^}]*\}\s*from\s*"[^"]*utils/debug-log\.js\?v=[^"]*";',
    re.MULTILINE,
)

#: 调用 ``debugLog``（排掉 ``window.debugLog`` 这类同名成员）。
DEBUG_LOG_CALL_PATTERN = re.compile(r'(?<![\w.$])debugLog\(')


def _strict_directive_position(source: str) -> int | None:
    """定位 ``"use strict"`` 指令；不在最前面时返回 None。

    指令序言要生效，必须出现在任何语句之前。经典脚本里有
    ``(() => { ... })()`` 与 ``(function (w) { ... })(window)`` 两种包裹，
    指令写在其函数体开头同样有效 —— 所以判据是「剥掉注释后，前面要么是空的，
    要么以 ``{`` 收尾」。一旦前面还有 ``;`` 或别的语句，它就退化成一句
    没人看的字符串字面量：脚本照跑，错字照旧静默变成全局变量。
    """
    code_only = re.sub(r'/\*[\s\S]*?\*/', '', source)
    code_only = re.sub(r'^\s*//.*$', '', code_only, flags=re.MULTILINE)
    match = re.search("[\"']use strict[\"']", code_only)
    if match is None:
        return None
    prefix = code_only[:match.start()].strip()
    if prefix == '' or prefix.endswith('{'):
        return match.start()
    return None


def _frontend_js_sources() -> list[tuple[str, str]]:
    """列出 ``frontend/static`` 下所有 JS（vendor 除外）：(相对仓库根路径, 源码)。"""
    sources: list[tuple[str, str]] = []
    for source_path in sorted((FRONTEND_ROOT / 'static').rglob('*.js')):
        if 'vendor' in source_path.parts:
            continue
        sources.append(
            (
                source_path.relative_to(FRONTEND_ROOT).as_posix(),
                source_path.read_text(encoding='utf-8'),
            )
        )
    return sources


def _frontend_classic_scripts() -> dict[str, str]:
    """从**装载方式**推出哪些 JS 是经典脚本（经典 ``<script>`` 与经典 Worker）。

    为什么不按「文件里有没有 import/export」判：``auth-shell.js`` 一个 import 也
    没有，但 login / pair 两页都用 ``type="module"`` 引它 —— 它是模块，本来就跑在
    严格模式里，给它要求一条指令只是噪声。所以模块性必须认页面与 Worker 的装载方式。

    Worker 的地址可能来自变量（draco-loader 就是 ``this.sameOriginWorkerUrl``），
    无法从 ``new Worker(...)`` 那行反推出文件，因此判据反过来取：只有**明确以
    ``type: "module"`` 构造**的 worker 才免检，其余 ``*-worker.js`` 一律按经典算 ——
    判错的代价只是多要求一条无害的指令，漏判的代价是缺陷从此没人守。

    @returns 相对仓库根的路径 -> 这条判定的出处（写进断言详情，便于核对）。
    """
    classic: dict[str, str] = {}
    script_tag_pattern = re.compile(r'<script\b(?P<attributes>[^>]*)>', re.IGNORECASE)
    src_pattern = re.compile(r'src="(?P<url>[^"]+)"')
    for html_path in sorted(FRONTEND_ROOT.glob('*.html')):
        page_source = html_path.read_text(encoding='utf-8')
        for tag in script_tag_pattern.finditer(page_source):
            attributes = tag.group('attributes')
            src_match = src_pattern.search(attributes)
            if src_match is None or 'type="module"' in attributes:
                continue
            url = src_match.group('url')
            if url.startswith('/static/vendor/'):
                continue
            relative_path = 'static/' + url.removeprefix('/static/').split('?', 1)[0]
            classic[relative_path] = f'{html_path.name} 的经典 <script>'

    combined_js = '\n'.join(source for _, source in _frontend_js_sources())
    module_workers: set[str] = set()
    for worker_match in re.finditer(r'new Worker\(', combined_js):
        call_window = combined_js[worker_match.start():worker_match.start() + 400]
        if 'type: "module"' in call_window:
            module_workers.update(re.findall(r'([\w.-]+-worker\.js)', call_window))

    for worker_path in sorted((FRONTEND_ROOT / 'static').rglob('*-worker.js')):
        if 'vendor' in worker_path.parts or worker_path.name in module_workers:
            continue
        classic[worker_path.relative_to(FRONTEND_ROOT).as_posix()] = '经典 Worker（非 type: "module"）'
    return classic


def check_frontend_console_routed_through_debug_log() -> None:
    """W23：生产控制台只许由 ``utils/debug-log.js`` 说话（结构断言 + 活体探针）。

    两条腿缺一不可：

    - **行为**（探针 ``debug-log``）：开关关着时 ``debugLog`` 真的一次 console 都不碰，
      开着时按级别原样透传。只写结构断言的话，「把开关判断写反 / 删掉」照样全绿；
    - **结构**（这里）：全 frontend（vendor 除外）除 ``debug-log.js`` 外不许出现
      ``console.<方法>``，且这次清理掉的那几份诊断必须还在（改走 ``debugLog``）。
      只写行为断言的话，「干脆把那几行删了」会变绿 —— 那是丢诊断，不是收口。
    """
    _run_frontend_probe('debug-log')

    offenders: list[str] = []
    for relative_path, source in _frontend_js_sources():
        if relative_path == CONSOLE_OWNER:
            continue
        for line_number, line in enumerate(source.splitlines(), 1):
            stripped = line.strip()
            # 注释里提到 ``console.xxx`` 是在说这件事，不是在干这件事。
            if stripped.startswith(('//', '*', '/*')):
                continue
            if CONSOLE_CALL_PATTERN.search(line):
                offenders.append(f'{relative_path}:{line_number}')
    check(
        'W23 生产代码里的 console 只出自 utils/debug-log.js'
        '（同一条错误不该在上报之外再响一份，且要有关得掉的开关）',
        not offenders,
        '；'.join(offenders) or f'仅 {CONSOLE_OWNER} 持有 console',
    )

    for relative_path, purpose in DEBUG_LOG_CONSUMERS.items():
        source = (FRONTEND_ROOT / relative_path).read_text(encoding='utf-8')
        imported = IMPORT_DEBUG_LOG_PATTERN.search(source) is not None
        called = DEBUG_LOG_CALL_PATTERN.search(source) is not None
        check(
            f'W23 {relative_path} 的「{purpose}」改走 debugLog（清理不等于丢诊断）',
            imported and called,
            f'import={imported} 调用 debugLog={called}',
        )


def check_frontend_classic_scripts_use_strict() -> None:
    """W28：经典脚本必须带 ``"use strict"``，且要在最前面（结构断言）。

    模块脚本本来就跑在严格模式里，加不加一样；缺口在经典脚本：``<script src>`` 不带
    ``type`` 时按 sloppy 模式跑，「给未声明的变量赋值」不报错，只把变量静默挂上
    ``window`` —— 而这几份恰好是启动路径上最早执行的（配对入口、展示页引导、
    Draco 解码 Worker）。Worker 里这一条更值钱：解码结果要按转移对象回传，
    属性名写错会被静默挂到 ``self`` 上而不是当场报错。
    """
    classic_scripts = _frontend_classic_scripts()
    check(
        'W28 能从装载方式推出经典脚本清单（HTML script 标签 + 非 module 的 Worker）',
        bool(classic_scripts),
        '、'.join(sorted(classic_scripts)) or '一个都没推出来',
    )

    for relative_path, origin in sorted(classic_scripts.items()):
        source_path = FRONTEND_ROOT / relative_path
        if not source_path.is_file():
            check(f'W28 {relative_path} 存在（{origin}）', False, '文件不存在')
            continue
        position = _strict_directive_position(source_path.read_text(encoding='utf-8'))
        check(
            f'W28 {relative_path} 的 "use strict" 在任何语句之前（{origin}）'
            '（写在别的语句之后只是一句没人看的字符串）',
            position is not None,
            f'指令位置={position}' if position is not None else '没找到有效的 "use strict" 指令',
        )


def check_frontend_studio_export_hook_is_dev_gated() -> None:
    """W24：离线模型导出的测试钩子必须挂在开发开关后面（结构断言）。

    钩子是给模型核对脚本用的：按类型构造一类家具，把 three.js 的 JSON 塞进页面里的
    一个隐藏 textarea。它此前只认 ``?model-export=``，于是生产包里任何访问者加一个
    查询参数就能让页面挂上 ``window.__haBridgeExportFurnitureJson``。断言三件事：
    赋值只有一处、外层 ``if`` 里有 ``isFrontendDebugMode()``、以及 ``model-export``
    这个入口本身没有被顺手删掉（加了开关不等于把工具关掉）。
    """
    source = (FRONTEND_ROOT / 'static' / '3d-studio' / 'studio-app.js').read_text(encoding='utf-8')
    hook = 'window.__haBridgeExportFurnitureJson ='
    occurrences = source.count(hook)
    check(
        'W24 测试钩子只在装载点赋值一次（多一处赋值就多一个绕过开关的口子）',
        occurrences == 1,
        f'出现 {occurrences} 次',
    )
    hook_index = source.find(hook)
    if hook_index == -1:
        check('W24 能定位钩子赋值并检查它的守卫', False, f'没找到 {hook}')
        return
    guard_index = source.rfind('\nif (', 0, hook_index)
    guard = source[guard_index:hook_index] if guard_index != -1 else ''
    check(
        'W24 钩子的外层 if 里判开发开关（否则生产包里谁都能挂上它）',
        'isFrontendDebugMode()' in guard,
        guard.strip()[:200] or '赋值前面没有 if 守卫',
    )
    check(
        'W24 ?model-export= 入口本身保留（加开关不等于把核对工具一起关掉）',
        'has("model-export")' in guard,
        guard.strip()[:200] or '赋值前面没有 if 守卫',
    )


def check_frontend_runtime_cache_limit_single_source() -> None:
    """W19：历史序列缓存的上限只许有一个来源（结构断言 + 活体探针）。

    探针把上限常量改小、加载那份改过的模块，证明「淘汰上限真的跟着常量走」——
    这是 W19 唯一防得住的做法：只断言「插到上限就不再涨」的话，写死 512 一样能通过，
    而「调参不生效」在行为上与「没调过」一模一样。这里再静态钉住淘汰循环里不许
    出现数字字面量：探针只看它改的那一处，将来在同一个函数里再写一个数字
    （第二处淘汰、或给上限另加一条条件）它看不见。
    """
    _run_frontend_probe('runtime-caches')

    relative_path = 'static/renderer/runtime-caches.js'
    source = (FRONTEND_ROOT / relative_path).read_text(encoding='utf-8')
    cache_body = _js_block_body(source, 'export function cacheHistorySeries(')
    check(
        'W19 淘汰循环里不出现数字字面量（上限只有一个主人，调参不会只改半边）',
        cache_body is not None
        and 'MAX_HISTORY_SERIES_CACHE_SIZE' in cache_body
        # 负向断言排掉箭头函数（`=> 1` 里的 `>` 后面也跟数字）。
        and re.search(r'(?<![=>])>\s*\d', cache_body) is None,
        '淘汰循环只认常量'
        if cache_body is not None and re.search(r'(?<![=>])>\s*\d', cache_body) is None
        else (cache_body or '没取到 cacheHistorySeries 函数体').strip()[:220],
    )
    limit_declaration = re.search(r'export const MAX_HISTORY_SERIES_CACHE_SIZE\s*=\s*\d+;', source)
    check(
        'W19 上限常量对外可见（探针靠改小它再加载，改名 / 去掉 export 都会红）',
        limit_declaration is not None,
        limit_declaration.group(0)
        if limit_declaration is not None
        else '没找到 `export const MAX_HISTORY_SERIES_CACHE_SIZE = <数字>;`',
    )


def check_frontend_pending_page_submits() -> None:
    """W6/W7：配网 / 初始化 / 授权三页的按钮与轮询闩（活体探针）。

    这三页都发生在「还没有编辑器、也没有登录态」的阶段，是用户唯一能操作的东西：
    按钮一旦永久灰掉、轮询一旦永久冻住，用户除了刷新页面没有别的出路。探针用真实
    import + 假 DOM + 假时钟 + 假 fetch 驱动提交与轮询，断言：

    - pair / setup / license 的提交请求都带 20 秒预算（弱网下一定有结论）；
    - 超时之后按钮恢复可用（并且能再次提交）；
    - 授权页 5 秒轮询在上一次状态请求还没回来时整拍跳过（不叠加同源请求），
      而超时又保证闩一定会被放掉（轮询不会被守卫锁死）；
    - 这几页原有的安全分支没有被顺手改松（配对 targetUrl 的同源校验、
      setup 的前端密码比对、license 的 401 回登录页）。
    """
    for suite in ('pair', 'setup', 'license'):
        _run_frontend_probe(suite)


def check_frontend_editor_boot_and_snapshot() -> None:
    """W8/W9：编辑器启动分片与草稿恢复快照（活体探针 + 接线断言）。

    两条都在 `frontend/static/home.js` 里，都用「按源码把函数切出来、在 vm 里配桩驱动」
    的办法测（这个文件几万行、模块顶层就摸 DOM，整份 import 需要一整套编辑器 DOM）：

    - W8：六个启动分片（会话 / 授权 / HA 连接 / 项目 / 素材 / 实体）各自失败一次，
      断言面板照样渲染、失败片的名字进得了报错文案、六片同时失败也只合成一条告警；
    - W9：快照内容里不许出现撤销/重做栈（哪怕内存里堆了 20 份大文档），配额爆掉时
      必须给出可读告警且同一项目只提醒一次，成功写过之后要能重新提醒，
      页面不可见（pageleave 那一跳）时只记日志。

    **探针证明不了的两处接线**由源码断言补：探针是**按名字把函数切出来自己调用**的，
    所以「顶层启动有没有真的用它」「写入器有没有真的由它驱动」它一无所知 —— 删掉调用点
    它照样全绿。这类「有人用它」只能静态看（与 P5 第十三批给 AST 划的边界一致）。
    """
    for suite in ('home-boot', 'home-snapshot'):
        _run_frontend_probe(suite)

    home_source = (FRONTEND_ROOT / 'static' / 'home.js').read_text(encoding='utf-8')
    check(
        'W8 顶层启动真的调用了分片加载器（探针是自己调它，不证明它被用上）',
        'loadEditorBootSlices().catch(handleOperationError)' in home_source,
        '顶层没有 loadEditorBootSlices() 的调用点 —— 分片逻辑等于死代码',
    )
    check(
        'W9 恢复写入器仍然由 persistRecoverySnapshot 驱动（探针是直接调它）',
        'const recoveryWriter = createRecoveryWriter(persistRecoverySnapshot)' in home_source,
        'createRecoveryWriter 的入参不再是 persistRecoverySnapshot，探针测的就不是线上那条路',
    )
    check(
        'W9 快照仍然挂在「有未保存改动」这个唯一触发点上',
        '  if (hasUnsavedChanges) {\n    scheduleRecoverySnapshot();' in home_source,
        'refreshDirtyState 里的触发点不见了 —— 快照再也不会被排入队列',
    )
    check(
        'W9 除了 scheduleRecoverySnapshot 之外没有第二个地方把历史栈带上（快照只留文档本体）',
        'undo: [...historyState.undo]' not in home_source
        and 'redo: [...historyState.redo]' not in home_source,
        '仍有地方把撤销/重做栈塞进快照 —— 大文档下 200ms 一节流会重新开始卡',
    )


def check_frontend_login_submit_recovers() -> None:
    """W3：登录请求悬挂时按钮也必须恢复（超时 + finally 两件都要有）。

    ``frontend/static/login.js`` 是模块，探针直接用真实 import 加载磁盘上那一份，
    配假 DOM / 假时钟 / 假 fetch 驱动 submit。

    复位语句是否落在 ``finally`` 里由 ``check_frontend_form_resets_guarded`` 统一
    覆盖（那条断言对 login / pair / setup / license 四个页面一视同仁）。
    """
    _run_frontend_probe('login')


def check_frontend_display_runtime_notice() -> None:
    """W4/W5：启动层摘掉之后，断网与实时推送停止都必须看得见。

    探针把 display-boot.js 真的放进 vm 里跑（最小 DOM 垫片 + 假时钟），先推进到
    ``done``，再分别验证「刷新失败 → 横幅」「刷新成功 → 撤销」「实时推送停止 →
    常驻且刷新成功撤不掉」「重新订阅成功 → 撤销」「一次性提示 8 秒自收」
    「capturePreview 不出横幅」。
    """
    _run_frontend_probe('display-boot')


def check_frontend_display_notice_wiring() -> None:
    """W4/W5 的接线：横幅本身会动，还要有人把消息送上去、把恢复报下来。

    行为探针只能证明 display-boot 的接口是对的，证明不了展示页与渲染层真的在用
    它们 —— 那两处都是几万行的页面脚本，无法在自检里整份加载，因此这里做结构
    断言：语句存在、且落在正确的函数体内。
    """
    display_source = (FRONTEND_ROOT / 'static' / 'display.js').read_text(encoding='utf-8')
    renderer_source = (FRONTEND_ROOT / 'static' / 'renderer' / 'renderer.js').read_text(encoding='utf-8')
    boot_css = (FRONTEND_ROOT / 'static' / 'display-boot.css').read_text(encoding='utf-8')

    def matched_lines(text: str, needle: str) -> str:
        """把命中的那几行摘出来当诊断：失败时不用再回读整个文件。"""
        hits = [line.strip() for line in text.splitlines() if needle in line]
        return ' | '.join(hits[:3]) or f'没有任何一行包含 {needle!r}'

    renderer_options = re.search(
        r'new PanelRenderer\(displayRootElement, \{(.*?)\n          \}\);', display_source, re.DOTALL
    )
    options_text = renderer_options.group(1) if renderer_options else ''
    check(
        'W5 展示页构造渲染器时传了 onError（否则运行期异常只进日志、屏幕前毫无反馈）',
        'onError(' in options_text,
        matched_lines(options_text, 'onError')
        if options_text
        else '没找到 new PanelRenderer(displayRootElement, {...}) 的选项块',
    )
    check(
        'W5 展示页把实时推送可用性接到了横幅上',
        'onRuntimeAvailabilityChange(' in options_text and 'setRuntimePush(' in options_text,
        matched_lines(options_text, 'setRuntimePush'),
    )

    refresh_if_visible = re.search(r'function refreshIfVisible\(\) \{(.*?)\n\}', display_source, re.DOTALL)
    refresh_body = refresh_if_visible.group(1) if refresh_if_visible else ''
    check(
        'W4 展示页在每次刷新成功后撤销「无法更新」横幅（否则恢复联网后横幅一直挂着）',
        'recovered()' in refresh_body and '.then(' in refresh_body,
        matched_lines(refresh_body, 'recovered()')
        if refresh_body
        else '没找到 refreshIfVisible() 的函数体',
    )

    open_handler = re.search(r'addEventListener\("open", \(\) => \{(.*?)\n    \}\);', renderer_source, re.DOTALL)
    fatal_close = re.search(r'if \(socketCloseEvent\.code === 4400\) \{(.*?)\n      \}', renderer_source, re.DOTALL)
    check(
        'W5 渲染层在订阅建立时上报「可用」（宿主机才有机会撤掉横幅）',
        bool(open_handler) and 'onRuntimeAvailabilityChange?.(true)' in open_handler.group(1),
        matched_lines(open_handler.group(1), 'onRuntimeAvailabilityChange?.(true)')
        if open_handler
        else '没找到 runtime socket 的 open 处理',
    )
    check(
        'W5 渲染层在 4400（永久停止重连）时上报「不可用」并带上原因',
        bool(fatal_close) and 'onRuntimeAvailabilityChange?.(false' in fatal_close.group(1),
        matched_lines(fatal_close.group(1), 'onRuntimeAvailabilityChange?.(false')
        if fatal_close
        else '没找到 4400 分支',
    )
    check(
        'W4 横幅不吃指针事件（横在画布顶部时不能挡住控件点击）',
        bool(re.search(r'#display-notice \{[^}]*pointer-events: none', boot_css, re.DOTALL)),
        matched_lines(boot_css, 'pointer-events: none'),
    )


def check_frontend_scripts_parse() -> None:
    """改过的前端脚本必须能真解析（截断 / 括号错位会让整页静默失效）。

    这些文件都是 ES 模块，而 ``node --check`` 对 ``.js`` 按 CommonJS 解析，会直接
    在 `import` 上失败；因此复制成 ``.mjs`` 再检查（扩展名决定解析目标）。
    """
    if shutil.which('node') is None:
        check('前端脚本语法门（node 不可用，跳过）', True, 'skipped')
        return
    with tempfile.TemporaryDirectory() as temporary_directory:
        for relative_path in FRONTEND_SYNTAX_FILES:
            source = PROJECT_ROOT / relative_path
            if not source.is_file():
                check(f'前端脚本存在：{relative_path}', False, '文件不存在')
                continue
            copied = Path(temporary_directory) / (source.name + '.mjs')
            copied.write_bytes(source.read_bytes())
            parse = subprocess.run(  # noqa: S603
                ['node', '--check', str(copied)],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            first_error = next(
                (
                    line.strip()
                    for line in parse.stderr.strip().splitlines()
                    if line.strip() and not line.strip().startswith(str(copied))
                ),
                '',
            )
            check(f'前端脚本语法可解析：{relative_path}', parse.returncode == 0, first_error)


def _public_static_whitelist() -> set[str] | None:
    """从 ``main.py`` 取出「匿名可访问的静态资源」白名单（字面量集合）。"""
    main_tree = ast.parse((PROJECT_ROOT / 'backend' / 'app' / 'main.py').read_text(encoding='utf-8'))
    for node in ast.walk(main_tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Set):
            continue
        if not any(
            isinstance(target, ast.Name) and target.id == 'public_static_files'
            for target in node.targets
        ):
            continue
        return {
            element.value
            for element in node.value.elts
            if isinstance(element, ast.Constant) and isinstance(element.value, str)
        }
    return None


def check_public_static_import_closure() -> None:
    """匿名可访问的页面脚本，其 import 图必须整条都在匿名白名单里。

    为什么值得一条自检：``/static/`` 下不在白名单的资源需要登录 + assets 能力，
    而未激活 / 未登录时唯一能打开的正是 login / setup / pair / license 四个页面。
    往 login.js 里加一行 import（P6 给登录请求加超时时就这么干了），模块图就断了
    一环 —— 表现是整页脚本不执行、登录按钮完全没反应，而服务端日志一切正常。
    这条检查把「漏加一个文件」从线上事故变成一条红色断言。
    """
    whitelist = _public_static_whitelist()
    if whitelist is None:
        check('能从 main.py 解析出匿名静态白名单', False, '没找到 public_static_files 集合字面量')
        return
    import_pattern = re.compile(r'''(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']''')
    static_root = (FRONTEND_ROOT / 'static').resolve()
    pending = [url for url in sorted(whitelist) if url.endswith('.js')]
    visited: set[str] = set()
    missing: list[str] = []
    while pending:
        url = pending.pop()
        if url in visited:
            continue
        visited.add(url)
        owner = static_root / url.removeprefix('/static/')
        if not owner.is_file():
            missing.append(f'{url}（白名单里有这个文件，但磁盘上不存在）')
            continue
        for match in import_pattern.finditer(owner.read_text(encoding='utf-8')):
            specifier = match.group(1) or match.group(2) or ''
            # 只跟相对导入：绝对路径（/static/vendor/...）走的是另一套加载约定，
            # 而且不在匿名页面的 import 图里。
            if not specifier.startswith('.'):
                continue
            target = (owner.parent / specifier.split('?')[0]).resolve()
            try:
                target_url = '/static/' + str(target.relative_to(static_root))
            except ValueError:
                missing.append(f'{url} → {specifier}（跑到 static/ 之外了）')
                continue
            if target_url in whitelist:
                pending.append(target_url)
            else:
                missing.append(f'{url} → {target_url}')
    check(
        '匿名页面脚本的 import 图在白名单内闭合',
        not missing,
        f'入口文件 {len(visited)} 个；' + ('；'.join(sorted(set(missing))) or '整条 import 图都在白名单里'),
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


def check_frontend_probe_suites_all_ran() -> None:
    """登记的探针套件必须都有调用点（否则「新断言全绿」是假象）。

    为什么值得一条自检：``FRONTEND_PROBE_SUITES`` 只是名单，真正的调用散在各个
    ``check_frontend_*`` 里（每处自带自己那几套，元组是硬编码的）。往名单里加一行
    却忘了加调用点时，套件**不报错，它只是不跑** —— 自检总数只涨了结构断言的量，
    而结构断言恰恰是「不依赖探针」的那一半，于是看起来一切正常。

    P8 第一批就踩了这个坑：两条新套件登记完，631 项全绿，但一条行为断言都没执行。
    这类脱节只能靠记账发现。
    """
    missing = sorted(set(FRONTEND_PROBE_SUITES) - _PROBE_SUITES_RUN)
    check(
        '登记的前端探针套件都真的跑过（只登记不调用 = 断言全绿也是假的）',
        not missing,
        f'没有调用点：{missing}' if missing else f'{len(FRONTEND_PROBE_SUITES)} 个套件全部跑过',
    )


async def run() -> int:
    """跑完所有自检，返回进程退出码。"""
    await check_media_proxy_entity_scope()
    check_media_proxy_entity_parsing()
    check_media_routes_carry_scope()
    check_hls_stream_registration()
    await check_media_proxy_state_ownership()
    check_request_sessions_are_used()
    await check_media_cache_invalidated_on_reconnect()
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
    check_no_dead_module_level_symbols()
    check_no_duplicated_helper_implementations()
    check_frontend_helper_contract_single_source()
    check_access_criteria_single_source()
    check_login_password_verification_cost()
    await check_revoke_other_sessions_requires_valid_session()
    check_same_origin_scheme_pinning()
    check_request_security_parity()
    check_setup_guard_privilege_parity()
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
    await check_anonymous_log_limit_before_filter()
    check_empty_log_store_health()
    check_log_context_default_is_not_shared()
    check_folded_snapshot_reuses_queue_slot()
    await check_health_probe_details_local_only()
    check_update_checks_opt_in()
    check_bounded_attempt_limiter()
    check_limiter_key_bound()
    check_trust_anchor_memory()
    check_icon_metadata_refresh()
    check_render_cache_read_lock()
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
    await check_panel_document_validation()
    await check_declared_input_constraints()
    check_database_connection_settings()
    check_session_thread_handoff()
    check_migration_lock_and_backup()
    await check_upload_half_written_state()
    check_cover_capability_fallback()
    await check_display_alias_redirect()
    check_user_asset_quota_and_sweep()
    await check_user_asset_total_quota()
    check_user_asset_sweep_is_wired()
    check_setup_token_provenance()
    await check_setup_admin_conflicts_are_409()
    check_license_flag_default_matches_loader()
    check_frontend_api_request_timeouts()
    check_frontend_login_submit_recovers()
    check_frontend_form_resets_guarded()
    check_frontend_auth_shell_guards()
    check_frontend_pair_scan_focus()
    check_frontend_static_cache_stamps()
    check_frontend_resize_batching()
    check_frontend_studio_history_guard()
    check_frontend_runtime_cache_limit_single_source()
    check_frontend_console_routed_through_debug_log()
    check_frontend_classic_scripts_use_strict()
    check_frontend_studio_export_hook_is_dev_gated()
    check_frontend_pending_page_submits()
    check_frontend_editor_boot_and_snapshot()
    check_frontend_operation_feedback()
    check_frontend_dialog_modal_semantics()
    check_frontend_motion_and_target_guards()
    check_frontend_display_runtime_notice()
    check_frontend_display_notice_wiring()
    check_frontend_scripts_parse()
    check_public_static_import_closure()
    check_frontend_probe_suites_all_ran()
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
