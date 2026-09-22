"""商店页面外壳：把场景片段填进模板里的 ``<!--{{SCENE}}-->``，并把站点配色样式表
与状态甲板注入到对应位置。

与主应用的 ``backend/http/page_shell.py`` 同源同思路 —— 片段都由
``design/scene/scene.html`` 手工同步而来（这里读的是
``store/templates/_scene.html``），只有品牌取值不同：主项目讲「本机中控」，
商店讲「授权服务」。

为什么不把片段抄进每个模板：商店有 4 处要用到它（``store.html`` 的三个入口分页、
``setup.html``、``admin.html`` 的后台登录、模拟收银台的内联页）。抄 4 份意味着改一次
场景要改 4 处，而且抄漏一处不会有任何报错 —— 只是那一处少了山、星星和小屋。

为什么不放进 ``store/security/request_security.py``：那个模块只管 CSP（nonce 与
允许来源），场景是纯展示。混进去会让「安全策略」这块多出一个读模板文件的副作用，
评审 CSP 改动时得连着跳过一段 SVG。

配色（``<!--{{APPEARANCE}}-->``）走同一条路：它是一个 ``<link>``，指向
``/store-appearance.css?v=<revision>`` —— 由 ``store/api/appearance`` 生成的服务端
样式表。商店的 CSP 对 ``style-src`` 允许 ``'unsafe-inline'``，但配色仍然走服务端样式表：
一是与主应用同一套做法，二是「配色由 URL 版本戳决定」比「靠内联脚本写一串令牌」更容易
缓存与排查。

三个占位符的严格程度**故意不同**：

    ``{{APPEARANCE}}`` 每个页面都**必须**有，缺了直接抛。它替换出来的是一个
        ``<link>``，少了它页面只是安静地保持默认配色，管理员会以为保存没生效。
    ``{{SCENE}}``      入口类页面有，别的页面没有。缺了不报错（前台其余分页本来
        就不需要整页场景），但**如果留着插入点却没给片段**，那是真错。
    ``{{DECK}}``       三块入口壳上有（见 ``telemetry.DECK_PAGES``）。与主应用那边的
        开通轨一样是**双向严格**：留着插入点却没给读数、给了读数却没有插入点，
        两边都抛 —— 甲板的坏法是「响应里多一条注释」，页面上什么都看不见，
        不抛就是静默失效。
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request
from sqlalchemy.orm import Session

from store.api.telemetry import DECK_PLACEHOLDER, deck_markup, deck_tiles, has_deck
from store.ops.release_info import CURRENT_VERSION

#: 模板里的场景插入点。用 HTML 注释包起来，这样就算有人把 ``store/templates/*.html``
#: 直接塞进浏览器看（不经后端），它也不会在页面上显示成一行乱码。
SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 站点配色样式表的插入点。同一个道理用注释包起来。
APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

#: 配色样式表的公开路径。前后端都认这一个字符串，别在别处再拼一遍。
APPEARANCE_PATH = '/store-appearance.css'

#: 片段文件名。分发产物，与模板同目录。
SCENE_TEMPLATE_NAME = '_scene.html'

#: 片段里剩下的花括号占位符。填空不全会把 ``{{TITLE}}`` 直接印在用户脸上，
#: 所以宁可在这里抛异常 —— 500 在开发时立刻可见，静默漏填则是上线后才发现。
_PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z_]+)\}\}')

#: 片段自带的说明注释，不进响应：里面写着 canonical 路径与占位符清单。
_HTML_COMMENT_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)

#: 两个插入点，以及「它被写进注释里」的后果。
#:
#: 两者都值得挡：插入点本身就是一条注释，所以在文件顶部的说明注释里提一句占位符是
#: 很自然的写法 —— 而那句话会被当成第二个插入点，把整块标记换进注释里，页面看起来
#: 完全正常，只是少了场景/甲板。后果文案写进表里而不是两处各写一段 raise：
#: 新加占位符时只会往这里添一行，不会漏掉某个分支 —— 而漏掉的那一支正是
#: 「安静地坏掉」的类型。
_COMMENT_TRAPS = (
    (SCENE_PLACEHOLDER, '整块场景会被塞进注释，页面上看不到场景'),
    (DECK_PLACEHOLDER, '整块状态甲板会被塞进注释，页面上看不到读数'),
)


def _comment_spans(text: str) -> list[tuple[int, int]]:
    """HTML 注释的 ``[起, 止)`` 区间。见 :func:`_assert_placeholders_are_real`。"""
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

    插入点本身就写成了一条 HTML 注释（这样浏览器直接打开模板也不会露出乱码），
    于是「注释里提一句占位符」是个很自然的写法，但 ``str.replace`` 会把它当成
    第二个插入点 —— 结果是整块场景被塞进注释里，页面**看起来正常但少了场景**，
    不报任何错。这里宁可抛异常。

    与主应用 ``backend/http/page_shell.py`` 的同名函数保持一致：三端各自独立构建，
    没有共享的 Python 包，只能各放一份。
    """
    spans = _comment_spans(text)
    for placeholder, consequence in _COMMENT_TRAPS:
        for match in re.finditer(re.escape(placeholder), text):
            offset = match.start()
            # `start < offset` 而不是 `<=`：占位符本身是一条完整的注释，它的区间起点
            # 恰好等于自己的偏移，用 `<=` 会把每个正常的插入点都判成「在注释里」。
            if any(start < offset < end for start, end in spans):
                line = text.count('\n', 0, offset) + 1
                raise RuntimeError(
                    f'{placeholder} 出现在了第 {line} 行的注释里，插入点必须是独立的占位符；'
                    f'注释里提到它会被一起替换掉：{consequence}'
                )


def _deck_gutter(text: str) -> str:
    """甲板插入点的缩进；同一模板里的多处插入点必须同缩进。

    甲板可以出现在同一份模板的多个位置（``store.html`` 的认证三屏各一处、
    ``setup.html`` 的表单屏与「已初始化」屏），注入走一次 ``str.replace`` 就全部填上，
    所以它们必须共用同一份缩进 —— 缩进不同的那几处会**留在原地不被替换**：
    响应里多出一条注释，页面上那一屏安静地少了甲板。宁可在这里抛。
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

#: 商店场景的固定口径。仅 ``VERSION`` 随发布变化，由 :func:`inject_scene` 从
#: ``store.ops.release_info.CURRENT_VERSION`` 取。
#:
#: 三条的分工与主应用那份一致（见 ``backend/http/page_shell.py`` 的 SCENE_VALUES_BY_PAGE）：
#:   TITLE     这一页在哪、过了它是什么（左栏是整页最重的一块字）
#:   TAGLINE   这一步具体做什么
#:   SIGNAL    这套服务具备什么（一行读数条）
#: 右栏的 h1 / desc 说的是「你要做什么」，坞脚 .hos-panel__meta 说的是「这一页怎么运作」，
#: 甲板说的是「这套服务现在什么样」。五处各说一件事，任何两句能互换位置就说明有一处该删。
SCENE_VALUES = {
    'SHELL_TITLE': 'HomeOS 授权服务中心',
    'SHELL_NAME': '授权中心',
    'STATUS_LABEL': '授权服务就绪',
    'TITLE': '账号就是你的授权凭证',
    'TAGLINE': '注册、下单、拿码，一台机器一份授权，全挂在这个账号上',
    'LOGO_SRC': '/store-static/homeos-mark.svg',
    'SIGNAL_ITEMS': (
        '<span>邮箱即账号</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>支付后自动发码</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>设备可自助解绑</span>'
    ),
}


@lru_cache(maxsize=8)
def _scene_markup(scene_file: str, modified_ns: int, version: str) -> str:
    """读片段并填占位符。

    缓存键里带 ``st_mtime_ns``：静态目录在部署后可能被原地替换（滚更新），只按路径
    缓存会把旧片段一直发下去；mtime 一变键就变，缓存自然失效。``version`` 同样进键 ——
    版本号写在片段的标题栏里。
    """
    template = Path(scene_file).read_text(encoding='utf-8')
    template = _HTML_COMMENT_PATTERN.sub('', template)
    rendered = template.replace('{{VERSION}}', version)
    for key, value in SCENE_VALUES.items():
        rendered = rendered.replace('{{' + key + '}}', value)
    missing = sorted(set(_PLACEHOLDER_PATTERN.findall(rendered)))
    if missing:
        raise RuntimeError(
            f'{scene_file} 里仍有未填充的占位符：{", ".join(missing)}；'
            '请同步 store/api/page_shell.py 的 SCENE_VALUES'
        )
    return rendered


def scene_markup(templates_dir: Path, version: str) -> str:
    """填充好的场景片段。文件缺失时报错而不是静默返回空串 —— 外壳没了页面还「正常」
    返回，是最难排查的一种坏法。"""
    path = templates_dir / SCENE_TEMPLATE_NAME
    try:
        stat = path.stat()
    except FileNotFoundError as error:
        raise RuntimeError(
            f'场景片段缺失：{path}；请从 design/scene/scene.html 同步分发副本'
        ) from error
    return _scene_markup(str(path), stat.st_mtime_ns, version)


def inject_scene(
    text: str, request: Request, *, session: Session | None = None
) -> str:
    """把 ``text`` 里的插入点换成实际标记：配色 + 场景 + 状态甲板。

    场景占位符**没有**时原样跳过：商店只有入口类页面需要整页场景，购物车、账号中心
    这些前台页面不需要（它们的皮肤由 ``store.css`` 的令牌承担）。这与主应用入口页
    「缺占位符就报错」的严格程度不同，是刻意的 —— 那里 5 个页面全都要场景。

    配色占位符则相反：**每个**页面都必须带，缺了直接抛异常。它替换出来的是一个
    ``<link>``，少了它页面只是安静地保持默认配色，管理员会以为保存没生效。

    甲板占位符与场景一样是「有才填」，但填的时候双向都严格：页面登记了读数却没有
    插入点、或留着插入点却拿不到读数，都会在这里抛（见 ``telemetry.deck_tiles``）。

    ``session`` 只有真的存在甲板插入点时才需要 —— 模拟收银台也走这个函数，
    但它没有甲板，且它的调用处只有一笔订单、不该为了一块不存在的读数去开库会话。
    于是这里不做无条件的必填，改成「要甲板才要会话」，缺了当场抛。
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
    if SCENE_PLACEHOLDER in text:
        settings = request.app.state.settings
        text = text.replace(
            SCENE_PLACEHOLDER, scene_markup(settings.templates_dir, CURRENT_VERSION)
        )
    page = page_of(request)
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
        # 注入块的第一行就会比其余行深两格（见 _deck_gutter）。
        # 同一模板里可以有多处插入点（store.html 的认证三屏各一处、setup.html 的
        # 「已初始化」屏一处），一次 replace 会在所有位置填上**同一份**读数 ——
        # 这三屏本来就是同一页的三个状态，读数相同才对。
        text = text.replace(
            indent + DECK_PLACEHOLDER,
            deck_markup(deck_tiles(page, session = session, request = request), indent = indent),
        )
    elif page and has_deck(page):
        # 反向的漏法：这一页登记了读数，模板里却没有插入点。甲板会整块消失，
        # 而页面上看不出少了什么 —— 抛出来，加模板的人当场就知道。
        raise RuntimeError(
            f'{page} 登记了状态甲板读数，模板里却没有 {DECK_PLACEHOLDER} 占位符；'
            '要么补上插入点，要么从 telemetry.DECK_PAGES 里移除这一页'
        )
    return text


#: 当前请求渲染的是哪一份模板。商店的前台是「一份 HTML 服务所有路由」，
#: ``store.html`` 一条路由挂七个路径，所以不能从 URL 反推页面 —— 由渲染方
#: 在读模板时把它记在 ``request.state`` 上（见 ``pages._render_page``）。
#: 公开常量：登记方（pages）与消费方（inject_scene）分处两个模块，各写一份字面量
#: 就会在改名时一边错、另一边静默读到 ``None``。
PAGE_STATE_ATTR = 'store_shell_page'


def page_of(request: Request) -> str:
    """这一响应渲染的模板文件名；没登记时回空串。

    回空串而不是抛：模拟收银台也走 ``inject_scene``，但它没有甲板插入点、也不需要
    分页 —— 在那里抛等于把「没登记」当成一种错误，而它其实只是「这一页没有甲板」。
    真正的错误在 ``inject_scene`` 里判：有插入点却没登记，或登记了却没有插入点，
    两种都会当场抛。
    """
    return getattr(request.state, PAGE_STATE_ATTR, '')
