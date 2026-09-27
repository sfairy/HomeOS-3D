"""商店入口页右栏「状态甲板」的读数。
"""

from __future__ import annotations

import html
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from src.core.models import StoreSetting
from src.ops import site_settings as site_config

#: 页面模板里的甲板插入点。与 SCENE/APPEARANCE 同一套严格度（登记进
DECK_PLACEHOLDER = '<!--{{DECK}}-->'

#: 有状态甲板的页面。商店只有这三块「整页入口壳」—— 前台其余分页（首页、商品、
DECK_PAGES = frozenset({'store.html', 'admin.html', 'setup.html'})

_PROCESS_STARTED_AT = datetime.now(timezone.utc)

#: 一格读数的冻结形态：``(标签, 文本, 单位, 色条档, 客户端钩子, 时间戳)``。
Tile = tuple[str, str, str, str, str, str]

#: 客户端钩子名。``''`` 表示这格是静态读数，由服务端一次算定（见 entry-deck.js）。
HOOK_CLOCK = 'clock'
HOOK_UPTIME = 'uptime'

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
    """
    settings = request.app.state.settings

    if page == 'store.html':
        # 认证三屏（登录 / 注册 / 找回）。访问者一定是未登录的 —— 登录成功的人
        setting = site_config.get_setting(session)
        return (
            _clock_tile(),
            _maintenance_tile(setting, '授权服务'),
            _payment_tile(setting, settings),
            _uptime_tile(),
        )

    if page == 'admin.html':
        # 后台登录屏。能看到这一屏，就说明库里已经有管理员了 —— 一个管理员都没有时
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
            _tile('数据存储', 'SQLite', spark = _SPARK_OK),
            _tile('初始化', '待完成', spark = _SPARK_IDLE),
            _uptime_tile(),
        )

    known = '、'.join(sorted(DECK_PAGES))
    raise RuntimeError(
        f'{page} 没有登记状态甲板读数；请在 backend/src/api/telemetry.deck_tiles 里补一个分支'
        f'（已登记：{known}）'
    )


def deck_markup(tiles: tuple[Tile, ...], *, indent: str) -> str:
    """把读数渲染成 ``<div class="hos-deck">``。
    """
    if len(tiles) != 4:
        # 四列是这个组件的形状（见模块 docstring 末段）。少一格 CSS 会留下一个空洞，
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
