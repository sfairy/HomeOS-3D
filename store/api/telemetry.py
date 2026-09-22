"""商店入口页右栏「状态甲板」的读数。

与主应用的 ``backend/http/telemetry.py`` 同源同思路：三块入口壳（``store.html`` 的
认证三屏、``admin.html`` 的后台登录、``setup.html`` 的商店初始化）的玻璃坞里，
除了表单之外还有一条四格读数（``.hos-deck``），回答「这套授权服务现在是什么样」。

四条硬约束与主应用逐条对应，改任一条都会让这块甲板变成负债：

1. **不发新请求、不新增公开接口。** 读数在渲染这一页时就从进程内状态与站点配置
   里算完（``app.state.settings`` + 那一行的 ``store_settings`` 单例）。入口页在
   未登录时就能打开，多一个匿名可读的接口就多一处需要审的攻击面，而甲板要的只是
   几个布尔。

2. **不向匿名访问者暴露生意的规模。** 这三块壳的访问者**全是匿名的** ——
   ``store.html`` 的认证三屏是给还没登录的人看的，``admin.html`` 的登录屏是给
   还不是管理员的人看的，``setup.html`` 只在没有管理员时可达。所以这里一律只给
   「机制读数」：服务在不在、渠道通不通、初始化完成没有、跑了多久。
   **不给**订单数、授权数、账号数、在线会话数 —— 那正是主应用那边
   「一台还没登录的机器上写着纳管 87 个实体」的商店版本：把站里的生意摊给
   每一个能打开登录页的人。后台登录之后 ``/admin`` 的概览页有全部真实读数。

3. **时间类的读数在客户端自走。** 时钟与运行时长都由这里注入时间戳到 ``data-*``，
   交给 ``store-static/entry-deck.js`` 在客户端推进（与主应用那份是同一套契约，
    商店单独留一份是因为它是独立构建上下文，拿不到 ``/static``）。

4. **一格读数不许长过一格。** 甲板四等分，而坞宽封顶 ``600px``，扣掉坞内距与甲板
   内距之后每格最宽只有 **87px**。等宽字体下那是一行约 4.8em 的预算：本机时钟的
   ``18:04:22`` 是 80px 在里面；``本机 SQLite``（107px）与运行时长曾经带空格的写法
   ``23 时 59 分``（107px，十小时以后必被切掉半截）都在外面。
   字号的下限已经由 ``.hos-deck__value``
   按格宽自动收（见 ``store/static/scene/panel.css``，与主应用同一份设计源），
   所以**文案本身**要守这条预算：往这一格加字之前，先算它有多宽。

为什么甲板是「四格」：坞体宽度是 ``min(600px, 47%)``，扣掉内边距后一行放得下四格
等宽数字；第五格会开始换行，而甲板一旦折成两行，它就从「一排仪表」退化成了
「一张表」—— 那是另一种组件，不是这个位置该有的东西。
"""

from __future__ import annotations

import html
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from store.core.models import StoreSetting
from store.ops import site_settings as site_config

#: 页面模板里的甲板插入点。与 SCENE/APPEARANCE 同一套严格度（登记进
#: ``page_shell._COMMENT_TRAPS``，缺了直接抛，不静默少一块）。
DECK_PLACEHOLDER = '<!--{{DECK}}-->'

#: 有状态甲板的页面。商店只有这三块「整页入口壳」—— 前台其余分页（首页、商品、
#: 账号中心）与后台工作台都不在场景壳里，没有插它的位置。
DECK_PAGES = frozenset({'store.html', 'admin.html', 'setup.html'})

#: 进程启动时刻。模块在应用启动时被导入，所以这约等于进程启动时间 —— 精度到秒级
#: 足够，而它换来的是「不必为了一个读数去改 app 的 lifespan」。运行时长只是给用户
#: 一个「这套服务已经在跑」的量感，不是审计字段。
_PROCESS_STARTED_AT = datetime.now(timezone.utc)

#: 一格读数的冻结形态：``(标签, 文本, 单位, 色条档, 客户端钩子, 时间戳)``。
#:
#: 用定长元组而不是 dataclass：主应用那侧要把它喂进 ``lru_cache`` 的键，必须可哈希。
#: 商店这一侧没有整页缓存，本可以松一点，但**两边保持同一种形状**才让「同一份
#: entry-deck.js 契约」这件事站得住 —— 形状开始分叉的地方，就是两份渲染逻辑
#: 慢慢走散的地方。
Tile = tuple[str, str, str, str, str, str]

#: 客户端钩子名。``''`` 表示这格是静态读数，由服务端一次算定（见 entry-deck.js）。
HOOK_CLOCK = 'clock'
HOOK_UPTIME = 'uptime'

#: 色条档位。与主应用同五个（``is-full`` / ``is-high`` / ``is-mid`` / ``is-low`` /
#: ``is-none``），都由 panel.css 的 ``.hos-deck__spark`` 定义 —— 商店复用同一份
#: 设计源，所以这里只认名字，不问长度。
_SPARK_OK = 'is-full'
_SPARK_IDLE = 'is-none'


def has_deck(page: str) -> bool:
    """这一页要不要灌状态甲板。"""
    return page in DECK_PAGES


def _tile(
    label: str,
    text: str,
    *,
    unit: str = '',
    spark: str = 'is-mid',
    hook: str = '',
    stamp: str = '',
) -> Tile:
    """组装一格读数。所有文本在这里就转义 —— 甲板的取值来自站点配置，
    名字是运营在后台填的，不该有任何一条路径让它们被当成标记解析。"""
    return (html.escape(label), html.escape(text), html.escape(unit), spark, hook, stamp)


def _elapsed_placeholder() -> str:
    """时间类读数的服务端兜底文本。

    与主应用同一个取舍：刻意是一个**中立的破折号**，而不是「渲染这一刻」的真实值。
    「已经过去多久」这句话每秒钟都不一样，把它交给客户端算，服务端就只负责
    「起点是几号几点」这一个不会变的绝对时刻（``data-since``）。

    代价只有一处：没有脚本的访客在这几格看到的是一横。而这个代价基本不存在 ——
    这三块壳的表单本身就是脚本提交的（store.js / setup.js / admin 的引导脚本），
    脚本不在时这些页面连登录都做不到，甲板的兜底文案不是那条链路上最先断的一环。
    """
    return '—'


def _clock_tile() -> Tile:
    """本机时钟。这一格没有时间戳：脚本直接用**访客设备的本地时钟**，
    也就自动是本机时区。"""
    return _tile('本机时间', _elapsed_placeholder(), spark = 'is-mid', hook = HOOK_CLOCK)


def _uptime_tile() -> Tile:
    """运行时长。三块壳上都留着它 —— 它不依赖任何配置、任何会话，又自带
    「这套服务活着」的语义。"""
    return _tile(
        '服务运行',
        _elapsed_placeholder(),
        spark = _SPARK_OK,
        hook = HOOK_UPTIME,
        stamp = _PROCESS_STARTED_AT.isoformat(),
    )


def _maintenance_tile(setting: StoreSetting, label: str) -> Tile:
    """维护模式读数。``maintenance_mode`` 本来就是公开信息（维护页对所有人可见），
    所以这里如实给，不藏。"""
    if setting.maintenance_mode:
        return _tile(label, '维护中', spark = 'is-low')
    return _tile(label, '正常', spark = _SPARK_OK)


def _payment_tile(setting: StoreSetting, settings) -> Tile:
    """支付渠道读数。``configured`` 的判定口径**必须**复用 ``site_settings`` 那一处 ——
    前台首页正是按同一个布尔决定「购买授权」按钮出不出现。甲板写「已配置」而首页
    把购买入口收起来，是这块甲板能犯的最严重的错（用户会以为是自己没登录）。
    """
    payload = site_config.payment_configuration_payload(
        setting, settings, include_credentials = False
    )
    if payload['configured']:
        return _tile('支付渠道', '已配置', spark = _SPARK_OK)
    return _tile('支付渠道', '未配置', spark = _SPARK_IDLE)


def deck_tiles(
    page: str,
    *,
    session: Session,
    request,
) -> tuple[Tile, ...]:
    """这一页的四格读数。

    参数:
        page: 页面模板文件名（与 ``page_shell`` 收到的同源）。
        session: 读站点配置单例。这里只读那一行，不查订单 / 账号 / 授权 ——
            见模块 docstring 第 2 条。
        request: 用来取 ``app.state.settings``（环境变量里那份支付渠道与模拟支付开关）。

    返回: 定长四元组。调用方（``page_shell``）只负责按插入点的缩进把标记排好，
    不再对读数做判断，这样「哪一页给哪几格」只有这一处说了算。
    """
    settings = request.app.state.settings

    if page == 'store.html':
        # 认证三屏（登录 / 注册 / 找回）。访问者一定是未登录的 —— 登录成功的人
        # 看到的是账号中心，不是这三屏。
        setting = site_config.get_setting(session)
        return (
            _clock_tile(),
            _maintenance_tile(setting, '授权服务'),
            _payment_tile(setting, settings),
            _uptime_tile(),
        )

    if page == 'admin.html':
        # 后台登录屏。能看到这一屏，就说明库里已经有管理员了 —— 一个管理员都没有时
        # ``/admin`` 会 303 去 /setup（见 store/api/pages.admin_page），所以
        # 「管理员账号 · 已创建」在这里是**可核验**的事实，不是客套话。
        setting = site_config.get_setting(session)
        return (
            _clock_tile(),
            _maintenance_tile(setting, '站点状态'),
            _tile('管理员账号', '已创建', spark = _SPARK_OK),
            _uptime_tile(),
        )

    if page == 'setup.html':
        # 未初始化：站点配置与支付渠道都还没被后台配过，这里只有机制读数。
        return (
            _clock_tile(),
            # 只写「SQLite」而不是「本机 SQLite」：后者实测 106.8px，比四列甲板最宽的
            # 那一格（87px）宽出小半格 —— 见模块 docstring 第 4 条。「本机」这层意思
            # 由隔壁 store.html 的正文在说，甲板这一格只负责回答「数据落在什么上」。
            _tile('数据存储', 'SQLite', spark = _SPARK_OK),
            _tile('初始化', '待完成', spark = _SPARK_IDLE),
            _uptime_tile(),
        )

    known = '、'.join(sorted(DECK_PAGES))
    raise RuntimeError(
        f'{page} 没有登记状态甲板读数；请在 store/api/telemetry.deck_tiles 里补一个分支'
        f'（已登记：{known}）'
    )


def deck_markup(tiles: tuple[Tile, ...], *, indent: str) -> str:
    """把读数渲染成 ``<div class="hos-deck">``。

    ``indent`` 是插入点所在行的缩进，逐行补上：注入的标记要落在页面原来的缩进上，
    否则读 ``view-source`` 的人会看到一段贴着左边的块，而它分明嵌在表单坞里面。

    ``data-deck`` / ``data-since`` 是给 ``entry-deck.js`` 的唯一契约，与主应用
    那份逐字同名 —— 两侧的脚本是两份文件（独立构建上下文），但契约只有一套。
    """
    if len(tiles) != 4:
        # 四列是这个组件的形状（见模块 docstring 末段）。少一格 CSS 会留下一个空洞，
        # 多一格会换行，两种都是「看起来正常但不对」的坏法，所以在这里挡住。
        raise RuntimeError(f'状态甲板必须有 4 格读数，实际有 {len(tiles)} 格')

    lines = [f'{indent}<div class="hos-deck" role="group" aria-label="服务状态读数">']
    lines.append(f'{indent}  <span class="hos-deck__scan" aria-hidden="true"></span>')
    for label, text, unit, spark, hook, stamp in tiles:
        lines.append(f'{indent}  <div class="hos-deck__tile">')
        lines.append(f'{indent}    <span class="hos-deck__label">{label}</span>')
        value = f'{indent}    <span class="hos-deck__value"'
        if hook:
            value += f' data-deck="{hook}"'
            if stamp:
                value += f' data-since="{stamp}"'
        value += f'>{text}'
        if unit:
            value += f'<span class="hos-deck__unit">{unit}</span>'
        value += '</span>'
        lines.append(value)
        lines.append(f'{indent}    <span class="hos-deck__spark {spark}" aria-hidden="true"></span>')
        lines.append(f'{indent}  </div>')
    lines.append(f'{indent}</div>')
    return '\n'.join(lines)
