"""入口页右栏「状态甲板」的读数。
"""
from __future__ import annotations

import html
from datetime import datetime, timezone

from sqlalchemy import func, select

from ..core.models import DisplayDevice, HAConnection, HAEntity, HASyncState, Project
from ..core.time_utils import ensure_aware

#: 页面模板里的甲板插入点。与 SCENE/STEPS/APPEARANCE 同一套严格度
DECK_PLACEHOLDER = '<!--{{DECK}}-->'

DECK_PAGES = frozenset(
    {
        'setup.html',
        'login.html',
        'license.html',
        'pair.html',
        'license-recovery.html',
    }
)

_PROCESS_STARTED_AT = datetime.now(timezone.utc)

#: 一格读数的冻结形态：``(标签, 文本, 单位, 色条档, 客户端钩子, 时间戳)``。
Tile = tuple[str, str, str, str, str, str]

#: 客户端钩子名。``''`` 表示这格是静态读数，由服务端一次算定。
HOOK_CLOCK = 'clock'
HOOK_UPTIME = 'uptime'
HOOK_SINCE = 'since'

#: 授权状态 → 甲板读数。未登记的取值回落到「未激活」而不是原样透出状态码：
_LICENSE_READOUT = {
    'ACTIVE': ('已激活', 'is-full'),
    'CONNECTION_WARNING': ('连接告警', 'is-mid'),
    'RECOVERY_RETRY': ('重连中', 'is-mid'),
    'RECOVERY_REQUIRED': ('待恢复', 'is-low'),
    'LEASE_EXPIRED': ('租约到期', 'is-low'),
    # 「待联网验证」五个汉字实测 91.4px，而四列甲板每格最宽只有 87px（坞取满 600px 时）
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
    挡在激活页，是这块甲板能犯的最严重的错。"""
    if service is None:
        return _tile('授权状态', '未知', spark = 'is-none')
    state = service.status()
    if not state.get('required') and not state.get('activationCodeId'):
        # 免授权部署（license_required 关且没绑过码）：如实写「免授权」而不是
        return _tile('授权状态', '免授权', spark = 'is-none')
    label, spark = _LICENSE_READOUT.get(state.get('status', ''), ('未激活', 'is-low'))
    return _tile('授权状态', label, spark = spark)


def _database_readout(request) -> dict:
    """一次会话读完库里的四项读数（HA 连接 / 实体数 / 同步时刻 / 设备与项目数）。
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
        return (
            _clock_tile(),
            _tile('服务状态', '就绪', spark = 'is-full'),
            _tile('数据存储', '不出本机', spark = 'is-full'),
            _uptime_tile(),
        )

    #: 真正匿名：既没有管理员会话，也没有已配对设备 Cookie。
    anonymous = not admin_session and not device
    if anonymous:
        if page == 'pair.html':
            # 未配对的面板、或任何直接打开 /pair 的人。这一档要回答的是
            return (
                _clock_tile(),
                _tile('服务状态', '就绪', spark = 'is-full'),
                # 「6 位固定码」实测 93.2px，比四列甲板最宽的那一格（87px）还宽 ——
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
        raise RuntimeError(
            f'{page} 落到了匿名档；这一页应由路由挡在门外，请检查门禁与档位判断'
        )

    readout = _database_readout(request)
    license_service = getattr(request.app.state, 'license_service', None)

    if page == 'license.html':
        # 只在已登录时渲染（路由未登录会 303 去 /login）：四格全部给
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
            return (
                *_ha_tiles(readout),
                _sync_tile(readout),
                _uptime_tile(),
            )
        # 走到这里说明既无会话也无设备 Cookie —— 而那一档上面已经拦掉了。
        raise RuntimeError('pair.html 的匿名档没有在 _database_readout 之前拦下；档位判断有漏洞')

    if page == 'license-recovery.html':
        # 匿名档同样已在上面拦掉；能到这里的一定带着会话或设备 Cookie。
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
        f'{page} 没有登记状态甲板读数；请在 apps/server/http/telemetry.deck_tiles 里补一个分支'
        f'（已登记：{known}）'
    )


def deck_markup(tiles: tuple[Tile, ...], *, indent: str) -> str:
    """把读数渲染成 ``<div class="hos-deck">``。
    """
    if len(tiles) != 4:
        # 四列是这个组件的形状（见模块 docstring 末段）。少一格 CSS 会留下一个空洞，
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
