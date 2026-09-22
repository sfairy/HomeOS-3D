"""入口页右栏「状态甲板」的读数。

五个入口页的玻璃坞里，除了表单与开通轨之外还有一条四格读数（``.hos-deck``）：
它回答的是「这台中控现在是什么样」。读数在这里组装，与 ``commissioning`` 是同一套
思路 —— **按访问者给，不按页面给**，因为 ``/pair`` 同时服务两种人
（管理员带着 ``?scan=1`` 来配第二块屏，与一台还没配对的墙面板）。

四条硬约束，改了任一条都会让这块甲板变成负债：

1. **不发新请求、不新增公开接口。** 读数全部取自已有的进程内状态与本地库
   （``app.state.ha_connector`` / ``license_service`` / ``admin_account`` / 数据库），
   在渲染这一页时就地算完。入口页在未登录时就能打开，多一个匿名可读的接口就多一处
   需要审的攻击面，而甲板要的只是几个本地计数。

2. **不向匿名访问者暴露家的规模。** 档位按**访问者**判，不按页面判：有管理员会话或
   已配对设备 Cookie 的人拿真读数；两者都没有的人只拿「机制读数」（数据自持、无需公网、
   服务就绪、运行时长），不给实体数、设备数、项目数。口径与 ``/api/v1/setup/status``
   只回 ``initialized`` / ``version`` 一致 —— 一台还没登录的机器上写着「纳管 87 个实体」，
   等于把这家有几盏灯告诉了每一个能打开登录页的人。
   **为什么必须按访问者判**：``/login``、``/setup`` 天生只有匿名访客，但 ``/pair`` 与
   恢复页也在 ``main.public_page_paths`` 里（任何浏览器输地址就能打开），而它们落到的
   分支与墙面板相同 —— 按页面判会让未登录的人在 /pair 上读到实体数。

3. **时间类的读数在客户端自走。** 时钟、运行时长、距上次 HA 同步多久，三格都是
   「每一秒都在变」的读数；把它们做成服务端轮询等于给入口页装一台每秒响一次的闹钟。
   这里只把**时间戳**注入 ``data-*``，由 ``frontend/static/auth/entry-deck.js``
   在客户端推进。

4. **一格读数不许长过一格。** 甲板四等分，而坞宽封顶 ``600px``，扣掉坞内距与甲板
   内距之后每格最宽只有 **87px**。等宽字体下那是一行约 4.8em 的预算：本机时钟的
   ``18:04:22`` 是 80px、``23时59分`` 是 77px，都在里面；而带空格的 ``23 时 59 分``
   （107px）与五个汉字的 ``待联网验证``（91px）都在外面 —— 后者会在格子里被切掉半截。
   字号的下限已经由 ``.hos-deck__value`` 按格宽自动收（见 ``panel.css``），
   所以**文案本身**要守这条预算：往这一格加字之前，先算它有多宽。

为什么甲板是「四格」而不是更多：坞体宽度是 ``min(600px, 47%)``，扣掉内边距后
一行放得下四格等宽数字；第五格会开始换行，而甲板一旦折成两行，它就从「一排仪表」
退化成了「一张表」—— 那是另一种组件，不是这个位置该有的东西。
"""
from __future__ import annotations

import html
from datetime import datetime, timezone

from sqlalchemy import func, select

from ..core.models import DisplayDevice, HAConnection, HAEntity, HASyncState, Project
from ..core.time_utils import ensure_aware

#: 页面模板里的甲板插入点。与 SCENE/STEPS/APPEARANCE 同一套严格度
#: （登记进 ``page_shell._COMMENT_TRAPS``，缺了直接抛，不静默少一块）。
DECK_PLACEHOLDER = '<!--{{DECK}}-->'

#: 有状态甲板的页面。与 ``commissioning.RAIL_PAGES`` 是同一批，但**刻意不共用一份常量**：
#: 甲板是「这台机器现在什么样」，开通轨是「这条链走到哪」，将来可能只有一边多一个页面。
DECK_PAGES = frozenset(
    {
        'setup.html',
        'login.html',
        'license.html',
        'pair.html',
        'license-recovery.html',
    }
)

#: 进程启动时刻。模块在应用启动时被导入，所以这约等于进程启动时间 —— 精度到秒级足够，
#: 而它换来的是「不必为了一个读数去改 main.py 的 lifespan」。运行时长只是给用户一个
#: 「这台机器已经在跑」的量感，不是审计字段。
_PROCESS_STARTED_AT = datetime.now(timezone.utc)

#: 一格读数的冻结形态：``(标签, 文本, 单位, 色条档, 客户端钩子, 时间戳)``。
#:
#: 用定长元组而不是 dataclass：它要进 ``page_shell._render_page_cached`` 的
#: ``lru_cache`` 键，必须是可哈希的。dataclass 要额外冻结成元组才进得去，
#: 而多这一步就等于多一处「忘了转」的机会 —— 忘了转的后果是每请求都失去缓存。
Tile = tuple[str, str, str, str, str, str]

#: 客户端钩子名。``''`` 表示这格是静态读数，由服务端一次算定。
HOOK_CLOCK = 'clock'
HOOK_UPTIME = 'uptime'
HOOK_SINCE = 'since'

#: 授权状态 → 甲板读数。未登记的取值回落到「未激活」而不是原样透出状态码：
#: 状态码是给日志和接口用的（``STARTUP_VALIDATION_REQUIRED`` 这类），
#: 印在四格宽的一格里会被省略号吃掉后半截，读起来只剩一个不完整的英文单词。
_LICENSE_READOUT = {
    'ACTIVE': ('已激活', 'is-full'),
    'CONNECTION_WARNING': ('连接告警', 'is-mid'),
    'RECOVERY_RETRY': ('重连中', 'is-mid'),
    'RECOVERY_REQUIRED': ('待恢复', 'is-low'),
    'LEASE_EXPIRED': ('租约到期', 'is-low'),
    # 「待联网验证」五个汉字实测 91.4px，而四列甲板每格最宽只有 87px（坞取满 600px 时）
    # —— 又是「一格读数永远在省略号里」。授权状态这一格的值上限是四个汉字，
    # 加字之前先看 .hos-deck__value 的宽度预算。
    'STARTUP_VALIDATION_REQUIRED': ('待联网', 'is-low'),
    'UNACTIVATED': ('未激活', 'is-low'),
    'DEACTIVATED': ('已停用', 'is-none'),
    'REVOKED': ('已吊销', 'is-none'),
}


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
    """组装一格读数。所有文本在这里就转义 —— 甲板的取值来自库与配置，不该有任何
    一条路径让它们被当成标记解析。"""
    return (html.escape(label), html.escape(text), html.escape(unit), spark, hook, stamp)


def _ratio_spark(value: int) -> str:
    """按数量给色条长度。分档而不是连续比例：四格的量级差得远（3 台设备 vs 87 个实体），
    连续映射会让「3 台」那一格几乎看不见，反而读成「没有」。"""
    if value <= 0:
        return 'is-none'
    if value >= 50:
        return 'is-full'
    if value >= 12:
        return 'is-high'
    if value >= 3:
        return 'is-mid'
    return 'is-low'


def _elapsed_placeholder() -> str:
    """时间类读数的服务端兜底文本。

    刻意是一个**中立的破折号**，而不是「渲染这一刻」的真实值。真实值会让四格读数
    的元组每分钟都变一次 —— 而它要进 ``page_shell._render_page_cached`` 的
    ``lru_cache`` 键，于是每次渲染都换一把新钥匙，缓存从「一次发布命中到底」退化成
    「每分钟命中一次」，同时 64 格的缓存被慢慢塞满倒计时文本。

    代价只有一处：没有脚本的访客在这几格看到的是一横。而这个代价基本不存在 ——
    五个入口页的表单本身就是 module 脚本提交的（login.js / setup.js / …），
    脚本不在时这些页面连提交都做不到，甲板的兜底文案不是那条链路上最先断的一环。

    与之相对，时间戳（``data-since``）**是真实的绝对时刻**，所以它在被缓存了十分钟的
    页面上依然算得对：脚本读的是「起点」，不是「已经过去多久」。
    """
    return '—'


def _uptime_tile() -> Tile:
    """运行时长。这一格是甲板上唯一永远存在的读数 —— 它不依赖任何配置、任何会话，
    又自带「这台机器活着」的语义，匿名档与有会话档都留着它。"""
    return _tile(
        '服务运行',
        _elapsed_placeholder(),
        spark = 'is-full',
        hook = HOOK_UPTIME,
        stamp = _PROCESS_STARTED_AT.isoformat(),
    )


def _clock_tile() -> Tile:
    """本机时钟。这一格没有时间戳：脚本直接用**访客设备的本地时钟**，
    也就自动是本机时区 —— 入口页说的是「本机中控」，这一格要读成这台机器的钟。"""
    return _tile(
        '本机时间',
        _elapsed_placeholder(),
        spark = 'is-mid',
        hook = HOOK_CLOCK,
    )


def _sync_tile(readout: dict) -> Tile:
    """距上次 HA 全量同步多久。这是甲板上第二格自走的读数 —— 它每分每秒都在变老，
    而「同步是不是停住了」正是这套系统最该被一眼看出来的事。"""
    moment = readout['synced_at']
    return _tile(
        '上次同步',
        _elapsed_placeholder() if moment is not None else '尚未同步',
        spark = 'is-high' if moment is not None else 'is-none',
        hook = HOOK_SINCE if moment is not None else '',
        stamp = moment.isoformat() if moment is not None else '',
    )


def _ha_tiles(readout: dict) -> list[Tile]:
    """HA 连接与纳管规模（两格）。未配置 HA 时不显示「0 个实体」这种读数 ——
    「没接」与「接了但空着」是两种处境，读数必须分得开。"""
    if not readout['configured']:
        return [
            _tile('家庭中枢', '未接入', spark = 'is-none'),
            _tile('纳管实体', '—', spark = 'is-none'),
        ]
    if readout['connected']:
        connection = _tile('家庭中枢', '已连接', spark = 'is-full')
    elif readout['error']:
        connection = _tile('家庭中枢', '连接异常', spark = 'is-low')
    else:
        connection = _tile('家庭中枢', '已断开', spark = 'is-none')
    entities = _tile(
        '纳管实体',
        f"{readout['entities']:,}",
        unit = '个',
        spark = _ratio_spark(readout['entities']),
    )
    return [connection, entities]


def _license_tile(service) -> Tile:
    """授权读数。``service.status()`` 会实时修正租约到期与启动联网确认等待这两件事
    （见 ``_payload``），所以它与门禁口径一致 —— 甲板上写「已激活」而路由却把用户
    挡在激活页，是这块甲板能犯的最严重的错。"""
    if service is None:
        return _tile('授权状态', '未知', spark = 'is-none')
    state = service.status()
    if not state.get('required') and not state.get('activationCodeId'):
        # 免授权部署（license_required 关且没绑过码）：如实写「免授权」而不是
        # 借「已激活」来好看 —— 它俩在用户眼里是两件事。
        return _tile('授权状态', '免授权', spark = 'is-none')
    label, spark = _LICENSE_READOUT.get(state.get('status', ''), ('未激活', 'is-low'))
    return _tile('授权状态', label, spark = spark)


def _database_readout(request) -> dict:
    """一次会话读完库里的四项读数（HA 连接 / 实体数 / 同步时刻 / 设备与项目数）。

    收成一个函数而不是在 ``deck_tiles`` 里散着查：这些读数共用同一个会话，
    拆开写迟早会有人补一句「顺手再查一下」，把一次入口页渲染变成五次开库。
    """
    database = getattr(request.app.state, 'database', None)
    readout: dict = {
        'configured': False,
        'connected': False,
        'entities': 0,
        'synced_at': None,
        'error': None,
        'displays': 0,
        'projects': 0,
    }
    if database is None:
        return readout
    with database.session_factory() as session:
        readout['displays'] = int(
            session.scalar(
                select(func.count())
                .select_from(DisplayDevice)
                .where(DisplayDevice.revoked_at.is_(None))
            )
            or 0
        )
        readout['projects'] = int(session.scalar(select(func.count()).select_from(Project)) or 0)
        connection = session.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))
        if connection is None:
            return readout
        readout['configured'] = True
        readout['entities'] = int(
            session.scalar(
                select(func.count())
                .select_from(HAEntity)
                .where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status != 'missing',
                )
            )
            or 0
        )
        sync = session.scalar(select(HASyncState).where(HASyncState.connection_id == connection.id))
        if sync is not None:
            readout['synced_at'] = ensure_aware(sync.last_completed_at)
            readout['error'] = sync.last_error
    connector = getattr(request.app.state, 'ha_connector', None)
    readout['connected'] = bool(connector is not None and connector.connected)
    return readout


def deck_tiles(
    page: str,
    *,
    admin_session: bool,
    device: bool,
    request,
) -> tuple[Tile, ...]:
    """这一页、这个访问者，四格读数该是什么。

    参数:
        page: 页面模板文件名（与 ``page_shell`` 收到的同源）。
        admin_session: 请求里有没有有效的管理员会话。它与 ``device`` 一起决定**档位**，
            而档位是这块甲板上唯一因访问者而异的维度。
        device: 请求里有没有已配对且未过期的中控设备 Cookie。
        request: 用来取 ``app.state`` 上的进程内服务与数据库。

    返回: 定长四元组之外不做别的裁剪 —— 调用方（``page_shell``）只负责按插入点的缩进
    把标记排好，不再对读数做判断，这样「哪一档给哪几格」只有这一处说了算。

    返回的元组**不含任何随时间漂移的文本**（时间类读数给的是破折号 + 绝对时间戳，
    见 ``_elapsed_placeholder``），所以它能安全地进 ``_render_page_cached`` 的缓存键：
    同一档位的读数在库状态不变时是同一个元组，整页缓存照常命中。
    """
    if page == 'setup.html':
        # 未初始化：库与授权服务都还没有可读的东西，这里只有机制读数。
        return (
            _clock_tile(),
            _tile('账号归属', '仅本机', spark = 'is-full'),
            _tile('初始化', '待完成', spark = 'is-none'),
            _uptime_tile(),
        )

    if page == 'login.html':
        # 匿名档（能走到这一页就说明未登录）。刻意不给家的规模，见模块 docstring 第 2 条。
        return (
            _clock_tile(),
            _tile('服务状态', '就绪', spark = 'is-full'),
            _tile('数据存储', '不出本机', spark = 'is-full'),
            _uptime_tile(),
        )

    #: 真正匿名：既没有管理员会话，也没有已配对设备 Cookie。
    #:
    #: 档位必须按**访问者**判，不能按页面判 —— ``/login`` 与 ``/setup`` 天生只有匿名访客，
    #: 但 ``/pair`` 与恢复页也在 ``main.public_page_paths`` 里，任何浏览器直接输地址就能打开，
    #: 而它落到的分支与墙面板完全相同。按页面判的那一版正是让**未登录的访客**在 /pair 上
    #: 读到「纳管实体 1,646 个 · 上次同步 3 分钟前」的原因 —— 与 /login 刻意藏起来的是同一批
    #: 数字，等于把模块 docstring 第 2 条只执行了一半。
    #:
    #: 这一段放在 ``_database_readout`` **之前**：匿名档一格都不查库，
    #: 否则每次匿名渲染都要白开一次会话、白查五张表。
    anonymous = not admin_session and not device
    if anonymous:
        if page == 'pair.html':
            # 未配对的面板、或任何直接打开 /pair 的人。这一档要回答的是
            # 「我现在能不能配」，而不是「这个家有多大」。
            return (
                _clock_tile(),
                _tile('服务状态', '就绪', spark = 'is-full'),
                # 「6 位固定码」实测 93.2px，比四列甲板最宽的那一格（87px）还宽 ——
                # 见模块 docstring 第 4 条，所以这里只留「6 位码」（3.2em / 57px）。
                _tile('配对方式', '6 位码', spark = 'is-mid'),
                _uptime_tile(),
            )
        if page == 'license-recovery.html':
            # 恢复页会就地渲染在 /pair 与 /display/* 上，/pair 那一处同样公开可达。
            return (
                _clock_tile(),
                _tile('服务状态', '待恢复', spark = 'is-low'),
                _tile('本地数据', '不清除', spark = 'is-full'),
                _uptime_tile(),
            )
        # 剩下的页面都不该由匿名访客看到：/license 未登录时路由就 303 去 /login
        # （见 ``main.license_page``），/setup 与 /login 在上面已经返回。
        # 走到这里说明档位判断本身有漏洞，抛出来比泄一份读数安全。
        raise RuntimeError(
            f'{page} 落到了匿名档；这一页应由路由挡在门外，请检查门禁与档位判断'
        )

    readout = _database_readout(request)
    license_service = getattr(request.app.state, 'license_service', None)

    if page == 'license.html':
        # 只在已登录时渲染（路由未登录会 303 去 /login）：四格全部给
        # 「这台机器接了什么、被授权到什么程度」。
        return (
            *_ha_tiles(readout),
            _license_tile(license_service),
            _tile(
                '已配对中控',
                f"{readout['displays']:,}",
                unit = '台',
                spark = _ratio_spark(readout['displays']),
            ),
        )

    if page == 'pair.html':
        if admin_session:
            # 管理员带 ?scan=1 来配第二块屏：他最关心「已经配了几台」。
            return (
                *_ha_tiles(readout),
                _tile(
                    '已配对中控',
                    f"{readout['displays']:,}",
                    unit = '台',
                    spark = _ratio_spark(readout['displays']),
                ),
                _license_tile(license_service),
            )
        if device:
            # 已配对的面板回来重配（?scan=1）：它本来就在这个家里，读数不是新信息。
            # 「上次同步多久之前」它最该看见 —— 同步停住是这块屏最先会表现出的故障。
            return (
                *_ha_tiles(readout),
                _sync_tile(readout),
                _uptime_tile(),
            )
        # 走到这里说明既无会话也无设备 Cookie —— 而那一档上面已经拦掉了。
        # 这里只剩「不该到达」，抛出来比返回一份设计外的读数更安全。
        raise RuntimeError('pair.html 的匿名档没有在 _database_readout 之前拦下；档位判断有漏洞')

    if page == 'license-recovery.html':
        # 匿名档同样已在上面拦掉；能到这里的一定带着会话或设备 Cookie。
        # 卡在激活这道门上：授权状态与「上次同步」是这一页最要紧的两格，
        # 另外两格回答「我的东西还在不在」（设备与项目都留着）。
        return (
            _license_tile(license_service),
            _sync_tile(readout),
            _tile(
                '已配对中控',
                f"{readout['displays']:,}",
                unit = '台',
                spark = _ratio_spark(readout['displays']),
            ),
            _tile(
                '项目',
                f"{readout['projects']:,}",
                unit = '个',
                spark = _ratio_spark(readout['projects']),
            ),
        )

    known = '、'.join(sorted(DECK_PAGES))
    raise RuntimeError(
        f'{page} 没有登记状态甲板读数；请在 backend/http/telemetry.deck_tiles 里补一个分支'
        f'（已登记：{known}）'
    )


def deck_markup(tiles: tuple[Tile, ...], *, indent: str) -> str:
    """把读数渲染成 ``<div class="hos-deck">``。

    ``indent`` 是插入点所在行的缩进，逐行补上：注入的标记要落在页面原来的缩进上，
    否则读 ``view-source`` 的人会看到一段贴着左边的块，而它分明嵌在表单坞里面
    （与 ``commissioning.rail_markup`` 同一套约定）。

    ``data-deck`` / ``data-since`` 是给 ``entry-deck.js`` 的唯一契约：它按钩子名
    决定这一格是时钟、运行时长还是「距某时刻多久」。把钩子写成属性而不是给每一格
    固定一个 class，是因为四格的位置按页面会换（见 ``deck_tiles``）——
    位置变了，class 名就会开始撒谎。
    """
    if len(tiles) != 4:
        # 四列是这个组件的形状（见模块 docstring 末段）。少一格 CSS 会留下一个空洞，
        # 多一格会换行，两种都是「看起来正常但不对」的坏法，所以在这里挡住。
        raise RuntimeError(f'状态甲板必须有 4 格读数，实际有 {len(tiles)} 格')

    lines = [f'{indent}<div class="hos-deck" role="group" aria-label="本机状态读数">']
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
