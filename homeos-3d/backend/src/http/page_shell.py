"""入口页的场景外壳、开通轨与站点配色注入。
"""
from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from fastapi.responses import HTMLResponse, Response

from .commissioning import rail_markup
from .telemetry import DECK_PLACEHOLDER, Tile, deck_markup

#: 页面模板里的场景插入点。用 HTML 注释包起来，这样直接用浏览器打开
SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 站点配色样式表的插入点。同样用注释包起来，理由同上。
APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

STEPS_PLACEHOLDER = '<!--{{STEPS}}-->'

#: 状态甲板（四格读数）的插入点。定义在 ``telemetry`` 里 —— 产出它的是那一侧，
DECK = DECK_PLACEHOLDER

#: 配色样式表的公开路径。前后端都认这一个字符串，别在别处再拼一遍。
APPEARANCE_PATH = '/appearance.css'

#: 片段里剩下的花括号占位符。填空不全会把 ``{{TITLE}}`` 直接印在用户脸上，
_PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z_]+)\}\}')

#: 片段自带的说明注释，不进响应：里面写着 canonical 路径与占位符清单。
_HTML_COMMENT_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)

#: 三个插入点，以及「它被写进注释里」的后果。
_COMMENT_TRAPS = (
    (SCENE_PLACEHOLDER, '整块场景会被塞进注释，页面上看不到场景'),
    (APPEARANCE_PLACEHOLDER, '注释里的 <link> 不会生效，页面会安静地保持默认配色'),
    (STEPS_PLACEHOLDER, '整条开通轨会被塞进注释，页面上看不到进度'),
    (DECK, '整块状态甲板会被塞进注释，页面上看不到读数'),
)


def _comment_spans(text: str) -> list[tuple[int, int]]:
    """HTML 注释的 ``[起, 止)`` 区间。
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
    for placeholder, consequence in _COMMENT_TRAPS:
        for match in re.finditer(re.escape(placeholder), text):
            offset = match.start()
            # `start < offset` 而不是 `<=`：占位符本身是一条完整的注释，它的区间起点
            if any(start < offset < end for start, end in spans):
                line = text.count('\n', 0, offset) + 1
                raise RuntimeError(
                    f'{placeholder} 出现在了第 {line} 行的注释里，插入点必须是独立的占位符；'
                    f'注释里提到它会被一起替换掉：{consequence}'
                )


def _indent_at(text: str, placeholder: str) -> str:
    """插入点所在行、行首到插入点之间的那段缩进。
    """
    offset = text.index(placeholder)
    gutter = text[text.rfind('\n', 0, offset) + 1:offset]
    if gutter.strip():
        raise RuntimeError(f'{placeholder} 必须独占一行，它前面只有缩进（实际是 {gutter!r}）')
    return gutter

#: 入口页左侧品牌区的取值。
_SCENE_BRAND = {
    # 顶栏右端显示的是「站点名 · 版本号」，而顶栏左端已经是 HomeOS 字标 ——
    'SHELL_NAME': '本机中控',
    'SHELL_TITLE': 'HomeOS 本机中控',
    'LOGO_SRC': '/static/assets/icons/homeos-mark-white-orange.svg',
}


def _dossier(*rows: tuple[str, str]) -> str:
    """把若干「键 → 值」拼成左栏那张档案表。
    """
    return ''.join(
        f'<div class="hos-scene__dossier-row"><dt>{key}</dt><dd>{value}</dd></div>'
        for key, value in rows
    )


SCENE_VALUES_BY_PAGE = {
    'setup.html': {
        'STATUS_LABEL': '尚未初始化',
        'TITLE': '这台机器还没有主人',
        'TAGLINE': '第一次开机先做一件事：给这台机器一个本机管理员',
        'DOSSIER_LABEL': '本机档案',
        'DOSSIER': _dossier(
            ('角色', '本机唯一管理员'),
            ('数据', '账号与项目只落本机磁盘'),
            ('口令', '只存本机，不随项目导出'),
            ('之后', '登录这台中控'),
        ),
    },
    'login.html': {
        'STATUS_LABEL': '本机服务就绪',
        'TITLE': '中控在等你回来',
        'TAGLINE': '一次登录，把灯光、空调、窗帘与影音收进同一个画面',
        'DOSSIER_LABEL': '本机档案',
        'DOSSIER': _dossier(
            ('会话', '只留在本机内存'),
            ('网络', '不依赖公网，仅本机网段可达'),
            ('出口', '本机唯一入口，不对外开放'),
            ('之后', '3D 全景编辑器'),
        ),
    },
    'license.html': {
        'STATUS_LABEL': '等待激活',
        'TITLE': '还缺一张授权凭证',
        'TAGLINE': '把凭证交给这台机器，授权校验从此刻开始',
        'DOSSIER_LABEL': '本机档案',
        'DOSSIER': _dossier(
            ('绑定', '首次激活认本机硬件指纹'),
            ('换机', '变更硬件后先在商店解绑'),
            ('离线', '租约期内照常可用'),
            ('之后', '回中控配房间与设备'),
        ),
    },
    'pair.html': {
        'STATUS_LABEL': '等待配对',
        'TITLE': '把这块屏接进这个家',
        'TAGLINE': '用管理员给的 6 位码，把这面屏接进来',
        'DOSSIER_LABEL': '本机档案',
        'DOSSIER': _dossier(
            ('输入', '扫码或手动输入'),
            ('凭证', '配对成功后下发设备 Cookie'),
            ('生效', '刷新后仍停在这台设备的画面'),
            ('之后', '引导添加到主屏幕'),
        ),
    },
    'license-recovery.html': {
        'STATUS_LABEL': '授权暂不可达',
        'TITLE': '家在，只是暂时说不上话',
        'TAGLINE': '授权后台暂时联系不上，本机照常过自己的日子',
        'DOSSIER_LABEL': '本机档案',
        'DOSSIER': _dossier(
            ('现状', '项目、配对与连接信息都不清除'),
            ('自检', '每 5 秒重试一次授权后台'),
            ('租约', '本地租约内照常可用'),
            ('之后', '后台恢复后自动继续'),
        ),
    },
}


def scene_values(page: str) -> dict[str, str]:
    """某一页的完整场景取值。未登记的页面直接抛。
    """
    try:
        page_values = SCENE_VALUES_BY_PAGE[page]
    except KeyError as error:
        known = '、'.join(sorted(SCENE_VALUES_BY_PAGE))
        raise RuntimeError(
            f'{page} 没有登记左侧文案；请在 page_shell.SCENE_VALUES_BY_PAGE 里补一份'
            f'（已登记：{known}）'
        ) from error
    return {**_SCENE_BRAND, **page_values}


def scene_path(frontend_dir: Path) -> Path:
    """场景片段的位置：分发产物，与前端静态资源放在一起随镜像走。"""
    return frontend_dir / 'static' / 'auth' / 'scene' / 'scene.html'


@lru_cache(maxsize = 16)
def _scene_markup(scene_file: str, modified_ns: int, version: str, page: str) -> str:
    """读片段并填占位符。
    """
    template = Path(scene_file).read_text(encoding = 'utf-8')
    template = _HTML_COMMENT_PATTERN.sub('', template)
    rendered = template.replace('{{VERSION}}', version)
    for key, value in scene_values(page).items():
        rendered = rendered.replace('{{' + key + '}}', value)
    missing = sorted(set(_PLACEHOLDER_PATTERN.findall(rendered)))
    if missing:
        raise RuntimeError(
            f'{scene_file} 里仍有未填充的占位符：{", ".join(missing)}；'
            '请同步 backend/src/http/page_shell.py 的 SCENE_VALUES_BY_PAGE'
        )
    return rendered


def scene_markup(frontend_dir: Path, version: str, page: str) -> str:
    """填充好的场景片段，``page`` 决定左侧文案。文件缺失时报错而不是静默返回空串 ——
    外壳没了页面还「正常」返回，是最难排查的一种坏法。"""
    path = scene_path(frontend_dir)
    try:
        stat = path.stat()
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{path}；请从 design/scene/scene.html 同步分发副本'
        ) from error
    return _scene_markup(str(path), stat.st_mtime_ns, version, page)


def appearance_link(revision: str) -> str:
    """配色样式表的 ``<link>``。
    """
    return f'<link rel="stylesheet" href="{APPEARANCE_PATH}?v={revision}">'


def _require_placeholder(page_path: Path, text: str, placeholder: str, why: str) -> None:
    """占位符必须存在且必须是**真**插入点（不能只出现在说明注释里）。"""
    if placeholder not in text:
        raise RuntimeError(f'{page_path} 缺少 {placeholder} 占位符，{why}')


@lru_cache(maxsize = 64)
def _render_page_cached(
    page_file: str,
    page_modified_ns: int,
    frontend_dir: str,
    scene_modified_ns: int,
    version: str,
    revision: str,
    with_scene: bool,
    page: str,
    rail: tuple[str, ...] | None,
    deck: tuple[Tile, ...] | None,
) -> str:
    """渲染结果缓存。
    """
    page_path = Path(page_file)
    text = page_path.read_text(encoding = 'utf-8')
    # 版本号只有仓库根 package.json 一个来源（settings.version），页面里写 {{VERSION}} 即可。
    text = text.replace('{{VERSION}}', version)
    _require_placeholder(
        page_path,
        text,
        APPEARANCE_PLACEHOLDER,
        '页面不会跟随站点配色（CSP 下配色只能靠这个 <link> 注入，少了它页面会安静地保持默认色）',
    )
    _assert_placeholders_are_real(text)
    if with_scene:
        _require_placeholder(page_path, text, SCENE_PLACEHOLDER, '页面未接入场景外壳')
        text = text.replace(SCENE_PLACEHOLDER, scene_markup(Path(frontend_dir), version, page))
    if rail is not None:
        _require_placeholder(
            page_path,
            text,
            STEPS_PLACEHOLDER,
            '这一页登记了开通轨读数，却没有插入点（见 registry：backend/src/http/commissioning.py）',
        )
        indent = _indent_at(text, STEPS_PLACEHOLDER)
        # 替换键带上插入点前面那段缩进：单换占位符的话，它自己的缩进会留在原地，
        text = text.replace(indent + STEPS_PLACEHOLDER, rail_markup(rail, indent = indent))
    elif STEPS_PLACEHOLDER in text:
        # 反向的漏法：页面留着插入点，调用方却没给读数。占位符是一条注释，会原样
        raise RuntimeError(
            f'{page_path} 留着 {STEPS_PLACEHOLDER} 但没有开通轨读数；'
            '入口页请走 render_page（它会带上 rail），别的页面请删掉这个占位符'
        )
    if deck is not None:
        _require_placeholder(
            page_path,
            text,
            DECK,
            '这一页登记了状态甲板读数，却没有插入点（见 registry：backend/src/http/telemetry.py）',
        )
        indent = _indent_at(text, DECK)
        text = text.replace(indent + DECK, deck_markup(deck, indent = indent))
    elif DECK in text:
        # 与 STEPS 对称的一条：漏了不报错，只是甲板变成响应里的一条注释。
        raise RuntimeError(
            f'{page_path} 留着 {DECK} 但没有状态甲板读数；'
            '入口页请走 render_page（它会带上 deck），别的页面请删掉这个占位符'
        )
    return text.replace(APPEARANCE_PLACEHOLDER, appearance_link(revision))


def render_shell_page(
    frontend_dir: Path,
    filename: str,
    version: str,
    revision: str,
    *,
    scene: bool = True,
    rail: tuple[str, ...] | None = None,
    deck: tuple[tuple[str, ...], ...] | None = None,
    request: Request | None = None,
) -> Response:
    """本应用所有 HTML 页面的统一出口：场景外壳（可选）+ 站点配色样式表 + 开通轨（可选）。
    """
    page_path = frontend_dir / filename
    # 场景片段缺失时给出可操作的中文提示。这里先 stat 一次是为了喂缓存键
    try:
        scene_modified_ns = scene_path(frontend_dir).stat().st_mtime_ns
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{scene_path(frontend_dir)}；请从 design/scene/scene.html 同步分发副本'
        ) from error
    rendered = _render_page_cached(
        str(page_path),
        page_path.stat().st_mtime_ns,
        str(frontend_dir),
        scene_modified_ns,
        version,
        revision,
        scene,
        filename,
        rail,
        deck,
    )
    etag = f'"{hashlib.sha1(rendered.encode("utf-8")).hexdigest()[:32]}"'
    if request is not None and request.headers.get('if-none-match') == etag:
        # 304 不带 body，也不该带 Content-Type。
        return Response(status_code = 304, headers = {'ETag': etag})
    headers = {'ETag': etag}
    return HTMLResponse(rendered, headers = headers)
