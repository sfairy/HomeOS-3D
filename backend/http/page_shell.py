"""入口页的场景外壳与站点配色注入。

``/setup``、``/login``、``/license``、``/pair`` 与就地渲染在 /pair、/display/* 上的恢复页，
表单各不相同，但外壳完全一样：全屏场景 + 右侧玻璃坞。外壳标记只有一份，在
``design/scene/scene.html``，由 ``tools/sync_scene_assets.mjs`` 分发到
``frontend/static/auth/scene/scene.html``；页面模板里留一个 ``<!--{{SCENE}}-->``，
本模块在返回前把它换成填好占位符的片段。

为什么不把片段抄进每个 HTML：五个页面各粘一份 150 行的场景 DOM，改一次场景要改五处，
而且抄漏一处不会有任何报错 —— 只是那一页少了山、星星和小屋，没人会发现。

为什么占位符替换而不是模板引擎：这几个页面就是静态 HTML，引入 Jinja 只为插一段标记，
等于给主应用多开一条「模板里的表达式会被求值」的路径，而它现在完全没有模板层。

站点配色（``<!--{{APPEARANCE}}-->``）走同一条路：它是一个 ``<link>``，指向
``/appearance.css?v=<revision>`` —— 由 ``backend/api/appearance`` 生成的服务端样式表。
主应用的 CSP 是 ``style-src 'self'``，所以配色只能这么注入；同时这也解释了为什么
这个占位符**必须**在每个页面里：CSP 不会报「你少了一个 <link>」，页面只是安静地
保持默认配色，而管理员会以为保存没生效。
"""
from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from fastapi.responses import HTMLResponse, Response

#: 页面模板里的场景插入点。用 HTML 注释包起来，这样直接用浏览器打开
#: ``frontend/*.html``（不经后端）时它不会在页面上显示成一行乱码。
SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 站点配色样式表的插入点。同样用注释包起来，理由同上。
APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

#: 配色样式表的公开路径。前后端都认这一个字符串，别在别处再拼一遍。
APPEARANCE_PATH = '/appearance.css'

#: 页面模板里的场景插入点。用 HTML 注释包起来，这样直接用浏览器打开
#: ``frontend/*.html``（不经后端）时它不会在页面上显示成一行乱码。
SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 片段里剩下的花括号占位符。填空不全会把 ``{{TITLE}}`` 直接印在用户脸上，
#: 所以宁可在这里抛异常 —— 500 在开发时立刻可见，静默漏填则是上线后才发现。
_PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z_]+)\}\}')

#: 片段自带的说明注释，不进响应：里面写着 canonical 路径与占位符清单。
_HTML_COMMENT_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)


def _comment_spans(text: str) -> list[tuple[int, int]]:
    """HTML 注释的 ``[起, 止)`` 区间。

    用来分辨「真正的插入点」与「注释里提到了一句占位符」。后者是个很自然的写法
    （模板顶部的说明注释里写「本文件里的 <!--{{SCENE}}--> 由后端注入」），但插入点
    本身就是一条注释，所以那句话会被当成第二个插入点 —— 换出来的结果是整块场景被
    塞进注释里，页面**看起来正常但少了场景**，而且不报任何错。宁可在这里抛异常。
    """
    spans = []
    cursor = 0
    while True:
        start = text.find('<!--', cursor)
        if start < 0:
            return spans
        end = text.find('-->', start + 4)
        if end < 0:
            return spans
        spans.append((start, end + 3))
        cursor = end + 3


def _assert_placeholders_are_real(text: str) -> None:
    spans = _comment_spans(text)
    for match in re.finditer(re.escape(SCENE_PLACEHOLDER), text):
        offset = match.start()
        # `start < offset` 而不是 `<=`：占位符本身是一条完整的注释，它的区间起点
        # 恰好等于自己的偏移，用 `<=` 会把每个正常的插入点都判成「在注释里」。
        if any(start < offset < end for start, end in spans):
            line = text.count('\n', 0, offset) + 1
            raise RuntimeError(
                f'{SCENE_PLACEHOLDER} 出现在了第 {line} 行的注释里，插入点必须是独立的占位符；'
                '注释里提到它会被一起替换掉，结果是整块场景被塞进注释、页面上看不到场景'
            )
    # 配色占位符不受这条约束：它替换出来的本身就是一个普通标签，被塞进注释里会
    # 让 `<link>` 失效 —— 而「注释里提到了一句 <!--{{APPEARANCE}}-->」这种写法
    # 自然得多，所以这里显式检查，免得那个页面安静地不跟配色。
    for match in re.finditer(re.escape(APPEARANCE_PLACEHOLDER), text):
        offset = match.start()
        if any(start < offset < end for start, end in spans):
            line = text.count('\n', 0, offset) + 1
            raise RuntimeError(
                f'{APPEARANCE_PLACEHOLDER} 出现在了第 {line} 行的注释里，插入点必须是独立的占位符；'
                '注释里的 <link> 不会生效，页面会安静地保持默认配色'
            )

#: 主应用入口页的场景取值。仅 ``VERSION`` 随发布变化，其余是本端的固定品牌口径。
#: 商店与 Activate 各有自己的一份（store/api/pages.py、HomeOS-Activate/src/ui/page.mjs）。
SCENE_VALUES = {
    'SHELL_TITLE': 'HomeOS 本机中控',
    'SHELL_NAME': 'HomeOS',
    'STATUS_LABEL': '本机服务就绪',
    'TITLE': '本机中控 · 数据自持',
    'TAGLINE': '数据本机 · 一键纳管 · 3D 全景',
    'LOGO_SRC': '/static/assets/icons/homeos-mark-white-orange.svg',
    'SIGNAL_ITEMS': (
        '<span>本机运行</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>离线可用</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>无需公网</span>'
    ),
}


def scene_path(frontend_dir: Path) -> Path:
    """场景片段的位置：分发产物，与前端静态资源放在一起随镜像走。"""
    return frontend_dir / 'static' / 'auth' / 'scene' / 'scene.html'


@lru_cache(maxsize = 8)
def _scene_markup(scene_file: str, modified_ns: int, version: str) -> str:
    """读片段并填占位符。

    缓存键里带 ``st_mtime_ns``：静态目录在部署后可能被原地替换（滚更新），
    只按路径缓存会把旧片段一直发下去；mtime 一变键就变，缓存自然失效。
    ``version`` 同样进键 —— 版本号写在片段的标题栏里。
    """
    template = Path(scene_file).read_text(encoding = 'utf-8')
    template = _HTML_COMMENT_PATTERN.sub('', template)
    rendered = template.replace('{{VERSION}}', version)
    for key, value in SCENE_VALUES.items():
        rendered = rendered.replace('{{' + key + '}}', value)
    missing = sorted(set(_PLACEHOLDER_PATTERN.findall(rendered)))
    if missing:
        raise RuntimeError(
            f'{scene_file} 里仍有未填充的占位符：{", ".join(missing)}；'
            '请同步 backend/http/page_shell.py 的 SCENE_VALUES'
        )
    return rendered


def scene_markup(frontend_dir: Path, version: str) -> str:
    """填充好的场景片段。文件缺失时报错而不是静默返回空串 —— 外壳没了页面还「正常」返回，
    是最难排查的一种坏法。"""
    path = scene_path(frontend_dir)
    try:
        stat = path.stat()
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{path}；请先运行 node tools/sync_scene_assets.mjs'
        ) from error
    return _scene_markup(str(path), stat.st_mtime_ns, version)


def appearance_link(revision: str) -> str:
    """配色样式表的 ``<link>``。

    ``?v=`` 取配置文件的 mtime（见 ``AppearanceStore.revision``）：改完配色 URL 就变了，
    浏览器必然重取，不必给它加 ``no-cache`` 去换掉整站 HTML 的可缓存性。
    """
    return f'<link rel="stylesheet" href="{APPEARANCE_PATH}?v={revision}">'


def _require_placeholder(page_path: Path, text: str, placeholder: str, why: str) -> None:
    """占位符必须存在且必须是**真**插入点（不能只出现在说明注释里）。"""
    if placeholder not in text:
        raise RuntimeError(f'{page_path} 缺少 {placeholder} 占位符，{why}')


@lru_cache(maxsize = 32)
def _render_page_cached(
    page_file: str,
    page_modified_ns: int,
    frontend_dir: str,
    scene_modified_ns: int,
    version: str,
    revision: str,
    with_scene: bool,
) -> str:
    """渲染结果缓存。

    缓存键里带页面与场景片段的 mtime：静态目录在部署后可能被原地替换（滚更新），
    只按路径缓存会把旧页面一直发下去。场景片段虽然另有一层自己的缓存，但这一层
    缓存的是**整页**（含片段），所以它的 mtime 也必须进键。
    """
    page_path = Path(page_file)
    text = page_path.read_text(encoding = 'utf-8')
    _require_placeholder(
        page_path,
        text,
        APPEARANCE_PLACEHOLDER,
        '页面不会跟随站点配色（CSP 下配色只能靠这个 <link> 注入，少了它页面会安静地保持默认色）',
    )
    if with_scene:
        _require_placeholder(page_path, text, SCENE_PLACEHOLDER, '页面未接入场景外壳')
        _assert_placeholders_are_real(text)
        text = text.replace(SCENE_PLACEHOLDER, scene_markup(Path(frontend_dir), version))
    return text.replace(APPEARANCE_PLACEHOLDER, appearance_link(revision))


def render_shell_page(
    frontend_dir: Path,
    filename: str,
    version: str,
    revision: str,
    *,
    scene: bool = True,
    request: Request | None = None,
) -> Response:
    """本应用所有 HTML 页面的统一出口：场景外壳（可选）+ 站点配色样式表。

    两个占位符都是**必填**的：不带就说明这个页面没被改造过，结果分别是「看起来正常但
    少了场景」和「看起来正常但不跟随配色」—— 都不会报错，所以在这里直接抛异常。

    带 ``request`` 时会回 ``ETag`` 并处理 ``If-None-Match``。原先编辑器首页走
    ``FileResponse``（自带 ETag），改到这里渲染后必须自己补上，否则 4400 行的
    ``index.html`` 每次跳转都要重下一遍。
    """
    page_path = frontend_dir / filename
    # 场景片段缺失时给出可操作的中文提示。这里先 stat 一次是为了喂缓存键
    # （见 _render_page_cached 的 docstring），真正读片段仍在 scene_markup 里。
    try:
        scene_modified_ns = scene_path(frontend_dir).stat().st_mtime_ns
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{scene_path(frontend_dir)}；请先运行 node tools/sync_scene_assets.mjs'
        ) from error
    rendered = _render_page_cached(
        str(page_path),
        page_path.stat().st_mtime_ns,
        str(frontend_dir),
        scene_modified_ns,
        version,
        revision,
        scene,
    )
    etag = f'"{hashlib.sha1(rendered.encode("utf-8")).hexdigest()[:32]}"'
    if request is not None and request.headers.get('if-none-match') == etag:
        # 304 不带 body，也不该带 Content-Type。
        return Response(status_code = 304, headers = {'ETag': etag})
    return HTMLResponse(rendered, headers = {'ETag': etag})
