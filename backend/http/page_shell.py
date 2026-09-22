"""入口页的场景外壳、开通轨与站点配色注入。

``/setup``、``/login``、``/license``、``/pair`` 与就地渲染在 /pair、/display/* 上的恢复页，
表单各不相同，但外壳完全一样：全屏场景 + 右侧玻璃坞。外壳标记只有一份，在
``design/scene/scene.html``，手工同步到 ``frontend/static/auth/scene/scene.html``；
页面模板里留一个 ``<!--{{SCENE}}-->``，
本模块在返回前把它换成填好占位符的片段。

为什么不把片段抄进每个 HTML：五个页面各粘一份 150 行的场景 DOM，改一次场景要改五处，
而且抄漏一处不会有任何报错 —— 只是那一页少了山、星星和小屋，没人会发现。

外壳的**结构与品牌锚点**五页共用，但填进去的**左侧文案**按页给，见
``SCENE_VALUES_BY_PAGE``：这五个页面是同一条开通链路上的五道门，左栏那三行是唯一
能说清「这一道门在做什么」的地方。共用一份取值时左栏就只剩装饰，五页之间仅剩右栏
表单的差别。

右栏那条**开通轨**（``<!--{{STEPS}}-->``）也走同一条路，但它的取值按**访问者**给：
同一页对管理员与墙面板的读数不同（见 ``commissioning``）。它是一个嵌在面板里的
小块标记，所以注入时按插入点的缩进逐行对齐 —— 见 ``_indent_at``。

右栏那条**状态甲板**（``<!--{{DECK}}-->``）是同一套机制的第二份用例，产出它的是
``telemetry``：四格读数，同样按访问者分档，同样按缩进对齐。两者的差别只在
「读数说的是什么」—— 轨说「这条链走到哪」，甲板说「这台机器现在什么样」。

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

from .commissioning import rail_markup
from .telemetry import DECK_PLACEHOLDER, deck_markup

#: 页面模板里的场景插入点。用 HTML 注释包起来，这样直接用浏览器打开
#: ``frontend/*.html``（不经后端）时它不会在页面上显示成一行乱码。
SCENE_PLACEHOLDER = '<!--{{SCENE}}-->'

#: 站点配色样式表的插入点。同样用注释包起来，理由同上。
APPEARANCE_PLACEHOLDER = '<!--{{APPEARANCE}}-->'

#: 开通轨（五道门的进度）的插入点。别页没有这条轨，所以非入口页里不该出现它。
STEPS_PLACEHOLDER = '<!--{{STEPS}}-->'

#: 状态甲板（四格读数）的插入点。定义在 ``telemetry`` 里 —— 产出它的是那一侧，
#: 常量跟着产出走，两边不会各写一份。
DECK = DECK_PLACEHOLDER

#: 配色样式表的公开路径。前后端都认这一个字符串，别在别处再拼一遍。
APPEARANCE_PATH = '/appearance.css'

#: 片段里剩下的花括号占位符。填空不全会把 ``{{TITLE}}`` 直接印在用户脸上，
#: 所以宁可在这里抛异常 —— 500 在开发时立刻可见，静默漏填则是上线后才发现。
_PLACEHOLDER_PATTERN = re.compile(r'\{\{([A-Z_]+)\}\}')

#: 片段自带的说明注释，不进响应：里面写着 canonical 路径与占位符清单。
_HTML_COMMENT_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)

#: 三个插入点，以及「它被写进注释里」的后果。
#:
#: 三者都值得挡：插入点本身就是一条注释，所以在文件顶部的说明注释里提一句占位符是
#: 很自然的写法 —— 而那句话会被当成第二个插入点，把整块标记换进注释里，页面看起来
#: 完全正常，只是少了场景/配色/进度轨。
#:
#: 后果文案写进表里而不是三处各写一段 raise：新加占位符时只会往这里添一行，
#: 不会漏掉某个分支 —— 而漏掉的那一支正是「安静地坏掉」的类型。
_COMMENT_TRAPS = (
    (SCENE_PLACEHOLDER, '整块场景会被塞进注释，页面上看不到场景'),
    (APPEARANCE_PLACEHOLDER, '注释里的 <link> 不会生效，页面会安静地保持默认配色'),
    (STEPS_PLACEHOLDER, '整条开通轨会被塞进注释，页面上看不到进度'),
    (DECK, '整块状态甲板会被塞进注释，页面上看不到读数'),
)


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


def _indent_at(text: str, placeholder: str) -> str:
    """插入点所在行、行首到插入点之间的那段缩进。

    注入的标记要逐行补上这段缩进，否则读 ``view-source`` 的人会看到一块贴着左边、
    却又分明嵌在表单坞里的标记。顺带要求插入点独占一行：写在一行中间时这段前缀
    就是半行代码，跟着复制到每一行去只会更难认。

    返回值同时是**替换键**的一部分（调用处拼成 ``indent + placeholder``）：插入点
    前面那段空格不会被 ``str.replace`` 吃掉，只换占位符本身的话，注入块的第一行
    会额外多出这一份缩进（``<ol>`` 比 ``<li>`` 还深两格），而它只是难看、不会报错。
    """
    offset = text.index(placeholder)
    gutter = text[text.rfind('\n', 0, offset) + 1:offset]
    if gutter.strip():
        raise RuntimeError(f'{placeholder} 必须独占一行，它前面只有缩进（实际是 {gutter!r}）')
    return gutter

#: 入口页左侧品牌区的取值。
#:
#: 分两半：「品牌锚点」（站点名、标题、图标）五页共用一份 —— 换一页就换一个品牌名
#: 不是设计，是穿帮；其余按页面给。
#:
#: 为什么必须按页面给：这五个页面是同一条开通链路上的五道门（/setup → /login →
#: /license → /pair → 进中控），左侧那三行是唯一能说清「这一道门在做什么」的地方。
#: 原先五页共用一份取值，于是左栏彻底成了装饰，五页之间只剩右栏表单能区分。
#:
#: 三条的**分工**在重构时定死，改文案时请守住它，否则又会回到「同一句话说三遍」：
#:   TITLE     这一道门在哪、过了它是什么（左栏是整页最重的一块字）
#:   TAGLINE   这一步具体做什么
#:   SIGNAL    这台机器具备什么（一行读数条）
#: 右栏的 h1 / desc 说的是「你要做什么」，坞脚 .hos-panel__meta 说的是「这一页怎么运作」。
#: 四处各说一件事，任何两句能互换位置，就说明有一处该删。
#:
#: 商店与 Activate 各有自己的一份（store/api/page_shell.py、HomeOS-Activate/src/ui/page.mjs）。
_SCENE_BRAND = {
    # 顶栏右端显示的是「站点名 · 版本号」，而顶栏左端已经是 HomeOS 字标 ——
    # 这里再写一次「HomeOS」就成了同一行里同一句话的两个版本。
    # 改成这台机器在这个部署里的身份，商店侧对应改成「授权中心」（见 store/api/page_shell.py）。
    'SHELL_NAME': '本机中控',
    'SHELL_TITLE': 'HomeOS 本机中控',
    'LOGO_SRC': '/static/assets/icons/homeos-mark-white-orange.svg',
}


def _signal(*items: str) -> str:
    """把若干短句拼成品牌区那行信号，中间自动插分隔点。

    让调用方逐个手写 `hos-scene__signal-sep` 是个必然出错的设计：漏一个就有两个词
    连在一起（「本机运行离线可用」），而它看起来只是文案少了个空格，没人会当 bug。
    """
    separator = '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
    return separator.join(f'<span>{item}</span>' for item in items)


#: 页面模板文件名 → 该页左侧的取值。键与 ``render_shell_page`` 收到的 ``filename`` 同源。
SCENE_VALUES_BY_PAGE = {
    'setup.html': {
        'STATUS_LABEL': '尚未初始化',
        'TITLE': '这台机器还没有主人',
        'TAGLINE': '第一步是给它一个本机管理员 —— 账号与密码只落在这台机器上',
        'SIGNAL_ITEMS': _signal('唯一管理员', '数据不出机', '完成后先验授权'),
    },
    'login.html': {
        'STATUS_LABEL': '本机服务就绪',
        'TITLE': '中控在等你回来',
        'TAGLINE': '登录后进入 3D 全景编辑器，纳管灯光、空调、窗帘与影音',
        'SIGNAL_ITEMS': _signal('会话仅存本机', '无需公网', '本机唯一出口'),
    },
    'license.html': {
        'STATUS_LABEL': '等待激活',
        'TITLE': '还缺一张授权凭证',
        'TAGLINE': '激活后解锁 3D 编辑器与设备纳管，首次激活绑定本机硬件指纹',
        'SIGNAL_ITEMS': _signal('一机一码', '换机需先解绑', '租约内离线可用'),
    },
    'pair.html': {
        'STATUS_LABEL': '等待配对',
        'TITLE': '把这块屏接进这个家',
        'TAGLINE': '用管理员设置的 6 位配对码完成绑定，这台屏从此就有自己的画面',
        'SIGNAL_ITEMS': _signal('6 位固定配对码', '扫码或手输', '配对即下发设备 Cookie'),
    },
    'license-recovery.html': {
        'STATUS_LABEL': '授权暂不可达',
        'TITLE': '家在，只是暂时说不上话',
        'TAGLINE': '授权后台联系不上；本地租约内项目与配对照常可用',
        'SIGNAL_ITEMS': _signal('项目与配对不清除', '本地租约内可用', '恢复后自动进画面'),
    },
}


def scene_values(page: str) -> dict[str, str]:
    """某一页的完整场景取值。未登记的页面直接抛。

    为什么不回落到一份默认值：那正是这个模块反复躲开的那种坏法 —— 新加一个入口页
    忘了登记，页面**照常返回**，只是左侧又变回通用文案，没有任何地方会报错。
    抛异常则第一次访问就是 500，加页面的人当场就知道要登记（与未填占位符同样的处置）。
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

    缓存键里带 ``st_mtime_ns``：静态目录在部署后可能被原地替换（滚更新），
    只按路径缓存会把旧片段一直发下去；mtime 一变键就变，缓存自然失效。
    ``version`` 同样进键 —— 版本号写在片段的标题栏里。
    ``page`` 也进键：片段本身只有一份，但每页填进去的文案不同（见 SCENE_VALUES_BY_PAGE），
    少带这个键会让五页里最后渲染的那一页的文案被其余四页共用。

    maxsize 从 8 提到 16：键空间随页面数乘开（五页 × 各自的 mtime/version 组合），
    太小会在滚更新期间把刚填好的页面挤出去、每次请求重读一遍片段。
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
            '请同步 backend/http/page_shell.py 的 SCENE_VALUES_BY_PAGE'
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

    ``?v=`` 取配置文件的 mtime（见 ``AppearanceStore.revision``）：改完配色 URL 就变了，
    浏览器必然重取，不必给它加 ``no-cache`` 去换掉整站 HTML 的可缓存性。
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
    deck: tuple[tuple[str, ...], ...] | None,
) -> str:
    """渲染结果缓存。

    缓存键里带页面与场景片段的 mtime：静态目录在部署后可能被原地替换（滚更新），
    只按路径缓存会把旧页面一直发下去。场景片段虽然另有一层自己的缓存，但这一层
    缓存的是**整页**（含片段），所以它的 mtime 也必须进键。

    ``page`` 进键的理由与 ``_scene_markup`` 相同：五页共用一份片段模板，填进去的
    左侧文案不同，键里少了它就会串页。

    ``rail`` 也进键，理由同一类：同一条 ``/pair`` 对管理员和墙面板的进度读数不同
    （见 ``commissioning``），少了这个键就会把先渲染的那一种人读到的进度发给后一种人
    —— 而且不会报错。状态元组的取值空间很小（每页最多四种访问者），
    ``maxsize`` 因此从 32 提到 64：五页各自的分支加上编辑器与展示页仍在上限内。

    ``deck`` 同理（见 ``telemetry``）。它之所以能进这个键而不会把缓存打散：
    ``deck_tiles`` 返回的元组里**没有随时间漂移的文本** —— 时间类读数是破折号加
    绝对时间戳，由客户端自走。早先试过在这里放「渲染这一刻」的时长文案，
    结果是缓存键每分钟换一次，64 格缓存被倒计时文本慢慢塞满。
    """
    page_path = Path(page_file)
    text = page_path.read_text(encoding = 'utf-8')
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
            '这一页登记了开通轨读数，却没有插入点（见 registry：backend/http/commissioning.py）',
        )
        indent = _indent_at(text, STEPS_PLACEHOLDER)
        # 替换键带上插入点前面那段缩进：单换占位符的话，它自己的缩进会留在原地，
        # 注入块的第一行就会比其余行深两格（见 _indent_at）。
        text = text.replace(indent + STEPS_PLACEHOLDER, rail_markup(rail, indent = indent))
    elif STEPS_PLACEHOLDER in text:
        # 反向的漏法：页面留着插入点，调用方却没给读数。占位符是一条注释，会原样
        # 落在响应里 —— 页面上什么都看不见，只是少了一条进度轨。
        raise RuntimeError(
            f'{page_path} 留着 {STEPS_PLACEHOLDER} 但没有开通轨读数；'
            '入口页请走 render_page（它会带上 rail），别的页面请删掉这个占位符'
        )
    if deck is not None:
        _require_placeholder(
            page_path,
            text,
            DECK,
            '这一页登记了状态甲板读数，却没有插入点（见 registry：backend/http/telemetry.py）',
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

    四个占位符都是**必填**的：不带就说明这个页面没被改造过，结果分别是「看起来正常但
    少了场景」「看起来正常但不跟随配色」「看起来正常但不显示进度」和「看起来正常但
    没有读数」—— 都不会报错，所以在这里直接抛异常。

    ``rail`` 只给五个入口页（见 ``commissioning.RAIL_PAGES``）：它按**访问者**给，
    不是按页面给，所以在调用处算好再传进来。``deck`` 同理（见 ``telemetry.DECK_PAGES``）。

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
    # 不给这里加 Cache-Control：入口页的整页缓存策略在 `backend/main.py` 的响应头中间件里
    # 统一决定了（`/pair`、`/login`、`/setup`、`/license`、`/display/*` 一律 no-store），
    # 在这里再写一遍只会被覆盖掉 —— 而按访问者变化的页面**必须**是不可共享的，
    # 覆盖掉的恰好是那条更弱的指令。
    return HTMLResponse(rendered, headers = headers)
