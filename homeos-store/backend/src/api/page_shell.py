"""商店页面外壳：把场景片段填进模板里的 ``<!--{{SCENE}}-->``，并把站点配色样式表
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from sqlalchemy.orm import Session

from ..api.telemetry import DECK_PLACEHOLDER, deck_markup, deck_tiles, has_deck
from ..ops.release_info import CURRENT_VERSION

SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 站点配色样式表的插入点。同一个道理用注释包起来。
APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

#: 配色样式表的公开路径。前后端都认这一个字符串，别在别处再拼一遍。
APPEARANCE_PATH = '/store-appearance.css'

#: 片段文件名。分发产物，与模板同目录。
SCENE_TEMPLATE_NAME = '_scene.html'

#: 片段里剩下的花括号占位符。填空不全会把 ``{{TITLE}}`` 直接印在用户脸上，
_PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z_]+)\}\}')

#: 片段自带的说明注释，不进响应：里面写着 canonical 路径与占位符清单。
_HTML_COMMENT_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)

#: 两个插入点，以及「它被写进注释里」的后果。
_COMMENT_TRAPS = (
    (SCENE_PLACEHOLDER, '整块场景会被塞进注释，页面上看不到场景'),
    (DECK_PLACEHOLDER, '整块状态甲板会被塞进注释，页面上看不到读数'),
)


def _comment_spans(text: str) -> list[tuple[int, int]]:
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
    """断言每个占位符都独立存在，而不是被写在某条注释里。
    """
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


def _deck_gutter(text: str) -> str:
    """甲板插入点的缩进；同一模板里的多处插入点必须同缩进。
    """
    gutters: set[str] = set()
    cursor = 0
    while True:
        offset = text.find(DECK_PLACEHOLDER, cursor)
        if offset < 0:
            break
        gutter = text[text.rfind('\n', 0, offset) + 1:offset]
        if gutter.strip():
            raise RuntimeError(
                f'{DECK_PLACEHOLDER} 必须独占一行，它前面只有缩进（实际是 {gutter!r}）'
            )
        gutters.add(gutter)
        cursor = offset + len(DECK_PLACEHOLDER)
    if len(gutters) > 1:
        raise RuntimeError(
            f'同一模板里的 {DECK_PLACEHOLDER} 缩进不一致：{sorted(gutters)!r}；'
            '注入是一次全量替换，缩进不同的那几处会留在原地不生效'
        )
    return gutters.pop()

def _dossier(*rows: tuple[str, str]) -> str:
    """把若干「键 → 值」拼成左栏那张档案表（主应用同名函数的商店副本）。
    """
    return ''.join(
        f'<div class="hos-scene__dossier-row"><dt>{key}</dt><dd>{value}</dd></div>'
        for key, value in rows
    )


#: 商店三份模板的左栏口径，按模板文件名取（与主应用的 ``SCENE_VALUES_BY_PAGE`` 同构）。
_SCENE_SHARED = {
    'SHELL_TITLE': 'HomeOS 授权服务中心',
    'SHELL_NAME': '授权中心',
    'LOGO_SRC': '/store-static/homeos-mark.svg',
}

SCENE_VALUES_BY_PAGE: dict[str, dict[str, str]] = {
    'store.html': {
        'STATUS_LABEL': '授权服务就绪',
        'TITLE': '账号就是你的授权凭证',
        'TAGLINE': '注册、下单、拿码，一台机器一份授权，全挂在这个账号上',
        'DOSSIER_LABEL': '授权档案',
        'DOSSIER': _dossier(
            ('账号', '邮箱即账号，验证码注册'),
            ('授权', '一机一码，可自助解绑换机'),
            ('发码', '支付成功后自动发码'),
            ('售后', '订单号 + 下单邮箱即可查询'),
        ),
    },
    'setup.html': {
        'STATUS_LABEL': '尚未初始化',
        'TITLE': '这台机器还没有店长',
        'TAGLINE': '先把管理员定下来，商品、订单与授权才有归属',
        'DOSSIER_LABEL': '部署档案',
        'DOSSIER': _dossier(
            ('身份', '管理员账号只建在这台机器上'),
            ('权限', '商品、订单、授权码与站点配置'),
            ('数据', '订单与激活码落在本机数据库'),
            ('之后', '进后台开张上架'),
        ),
    },
    'admin.html': {
        'STATUS_LABEL': '授权服务就绪',
        'TITLE': '后台只开给本机的管理员',
        'TAGLINE': '运营动作全部在这套部署上完成，不等云端下发',
        'DOSSIER_LABEL': '后台档案',
        'DOSSIER': _dossier(
            ('账号', '初始化时创建，不开放注册'),
            ('权限', '只认本机管理员，越权一律拒绝'),
            ('数据', '订单、授权与审计都留在本机库'),
            ('建议', '经 HTTPS 或反代，不直连公网'),
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
    return {**_SCENE_SHARED, **page_values}


@lru_cache(maxsize=8)
def _scene_markup(scene_file: str, modified_ns: int, version: str, page: str) -> str:
    """读片段并填占位符。
    """
    template = Path(scene_file).read_text(encoding='utf-8')
    template = _HTML_COMMENT_PATTERN.sub('', template)
    rendered = template.replace('{{VERSION}}', version)
    for key, value in scene_values(page).items():
        rendered = rendered.replace('{{' + key + '}}', value)
    missing = sorted(set(_PLACEHOLDER_PATTERN.findall(rendered)))
    if missing:
        raise RuntimeError(
            f'{scene_file} 里仍有未填充的占位符：{", ".join(missing)}；'
            '请同步 backend/src/api/page_shell.py 的 SCENE_VALUES_BY_PAGE'
        )
    return rendered


def scene_markup(templates_dir: Path, version: str, page: str) -> str:
    """某一页填充好的场景片段。文件缺失时报错而不是静默返回空串 —— 外壳没了页面还
    「正常」返回，是最难排查的一种坏法。"""
    path = templates_dir / SCENE_TEMPLATE_NAME
    try:
        stat = path.stat()
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{path}；请从 design/scene/scene.html 同步分发副本'
        ) from error
    return _scene_markup(str(path), stat.st_mtime_ns, version, page)


def inject_scene(
    text: str, request: Request, *, session: Session | None = None
) -> str:
    """把 ``text`` 里的插入点换成实际标记：配色 + 场景 + 状态甲板。
    """
    if APPEARANCE_PLACEHOLDER not in text:
        raise RuntimeError(
            '模板缺少 ' + APPEARANCE_PLACEHOLDER + ' 占位符，页面不会跟随站点配色'
        )
    text = text.replace(
        APPEARANCE_PLACEHOLDER,
        f'<link rel="stylesheet" href="{APPEARANCE_PATH}?v={request.app.state.appearance.revision}">',
    )
    _assert_placeholders_are_real(text)
    page = page_of(request)
    if SCENE_PLACEHOLDER in text:
        # 场景是**按页**填的（见 SCENE_VALUES_BY_PAGE）：先取页面名，填错页比少填更隐蔽 ——
        settings = request.app.state.settings
        text = text.replace(
            SCENE_PLACEHOLDER, scene_markup(settings.templates_dir, CURRENT_VERSION, page)
        )
    if DECK_PLACEHOLDER in text:
        if not page:
            raise RuntimeError(
                f'模板里有 {DECK_PLACEHOLDER} 但没有登记页面名；请在 pages._render_page 里'
                f'设置 request.state.{PAGE_STATE_ATTR}，读数要靠它分页'
            )
        if session is None:
            raise RuntimeError(
                f'{page} 有 {DECK_PLACEHOLDER} 却没有会话；甲板要读站点配置，'
                '调用 inject_scene 时请把 session 传进来'
            )
        indent = _deck_gutter(text)
        # 替换键带上插入点前面那段缩进：单换占位符的话，它自己的缩进会留在原地，
        text = text.replace(
            indent + DECK_PLACEHOLDER,
            deck_markup(deck_tiles(page, session = session, request = request), indent = indent),
        )
    elif page and has_deck(page):
        # 反向的漏法：这一页登记了读数，模板里却没有插入点。甲板会整块消失，
        raise RuntimeError(
            f'{page} 登记了状态甲板读数，模板里却没有 {DECK_PLACEHOLDER} 占位符；'
            '要么补上插入点，要么从 telemetry.DECK_PAGES 里移除这一页'
        )
    return text


#: 当前请求渲染的是哪一份模板。商店的前台是「一份 HTML 服务所有路由」，
PAGE_STATE_ATTR = 'store_shell_page'


def page_of(request: Request) -> str:
    """这一响应渲染的模板文件名；没登记时回空串。
    """
    return getattr(request.state, PAGE_STATE_ATTR, '')
