"""商店页面外壳：把场景片段填进模板里的 ``<!--{{SCENE}}-->``，并注入站点配色样式表。

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
缓存与排查。与场景不同，缺这个占位符**会报错** —— 缺场景只是少了插画，
缺配色则是管理员改完却看不到任何变化。
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from fastapi import Request

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
    for match in re.finditer(re.escape(SCENE_PLACEHOLDER), text):
        offset = match.start()
        # `start < offset` 而不是 `<=`：占位符本身是一条完整的注释，它的区间起点
        # 恰好等于自己的偏移，用 `<=` 会把每个正常的插入点都判成「在注释里」。
        if any(start < offset < end for start, end in spans):
            line = text.count('\n', 0, offset) + 1
            raise RuntimeError(
                f'{SCENE_PLACEHOLDER} 出现在了第 {line} 行的注释里，插入点必须是独立的占位符'
            )

#: 商店场景的固定口径。仅 ``VERSION`` 随发布变化，由 :func:`inject_scene` 从
#: ``store.ops.release_info.CURRENT_VERSION`` 取。
SCENE_VALUES = {
    'SHELL_TITLE': 'HomeOS 授权服务中心',
    'SHELL_NAME': 'HomeOS Store',
    'STATUS_LABEL': '授权服务就绪',
    'TITLE': '授权服务 · 账号通行',
    'TAGLINE': '账号即授权 · 一码一机 · 自助解绑',
    'LOGO_SRC': '/store-static/homeos-mark.svg',
    'SIGNAL_ITEMS': (
        '<span>邮箱验证</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>订单可查</span>'
        '<span class="hos-scene__signal-sep" aria-hidden="true"></span>'
        '<span>设备自查</span>'
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


def inject_scene(text: str, request: Request) -> str:
    """把 ``text`` 里的 ``<!--{{SCENE}}-->`` 换成场景片段。

    模板**没有**场景占位符时原样返回：商店只有入口类页面需要整页场景，购物车、账号中心
    这些前台页面不需要（它们的皮肤由 ``store.css`` 的令牌承担）。这与主应用入口页
    「缺占位符就报错」的严格程度不同，是刻意的 —— 那里 5 个页面全都要场景。

    配色占位符则相反：**每个**页面都必须带，缺了直接抛异常。它替换出来的是一个
    ``<link>``，少了它页面只是安静地保持默认配色，管理员会以为保存没生效。
    """
    if APPEARANCE_PLACEHOLDER not in text:
        raise RuntimeError(
            '模板缺少 ' + APPEARANCE_PLACEHOLDER + ' 占位符，页面不会跟随站点配色'
        )
    text = text.replace(
        APPEARANCE_PLACEHOLDER,
        f'<link rel="stylesheet" href="{APPEARANCE_PATH}?v={request.app.state.appearance.revision}">',
    )
    if SCENE_PLACEHOLDER not in text:
        return text
    _assert_placeholders_are_real(text)
    settings = request.app.state.settings
    return text.replace(
        SCENE_PLACEHOLDER, scene_markup(settings.templates_dir, CURRENT_VERSION)
    )
