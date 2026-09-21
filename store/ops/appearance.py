"""商店侧的站点配色：``data/appearance.json`` 的读写。

与主应用 ``backend/core/appearance.py`` 是同一件事的两个副本 —— 两个服务各自独立
构建、独立部署（``Dockerfile`` 的 app / store 两个 target 只 COPY 各自的目录），
没有可共享的 Python 包。这里存在的只有**校验**：预设、明暗派生与令牌展开都在
``design/scene/appearance.js`` 里，前端设置界面 import 的就是它，本模块只接收
已经展开好的令牌表。

为什么校验必须留：``tokens_to_css()`` 把键值直接拼进 ``:root{}``，键里塞一个 ``}``
就能关掉整站样式。两道墙 —— 键必须命中令牌白名单正则，值必须命中该后缀的取值正则；
不通过就整个请求 422，不做部分保留（半张配色表会让界面「大部分对、某一处不对」，
比完全没配色更难排查）。

本文件的 ``_TOKEN_NAME`` 正则必须与 ``design/scene/appearance.js`` 的 ``tokenNames()``
保持一致 —— 两份副本里唯一会走散的就是这条正则，改动其一时请手工核对另一份。
（商店页面实际加载的是它的分发副本 ``store/static/scene/appearance.js``，那份由
``design/scene/`` 手工同步，只读；改配色请改源文件，见 ``store/README.md``。）
"""
from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path

#: 令牌名白名单。与 ``backend/core/appearance.py`` 逐字相同，与
#: ``design/scene/appearance.js`` 的 ``tokenNames()`` 一一对应。
#:
#: 前缀同时收 ``--hos-`` 与 ``--hb-`` 是**故意的**：前者归主应用与 3D 场景、后者归商店
#: （appearance.js 的 ``tokensToCss`` 两个命名空间一起发）。看着像改名前缀的历史残留，
#: 别顺手收窄 —— 收窄的结果是商店自己的令牌被 422 拒掉。
_TOKEN_NAME = re.compile(
    r'^--(?:hos|hb)-(?:accent|lumen|aura|eco)(?:-rgb|-bright|-deep|-soft|-line|-text)?$'
)
#: 主按钮悬停渐变：唯一一枚不按后缀归类的令牌（它同时用两枚色）。
_TOKEN_NAME_EXTRA = frozenset({'--hb-accent-grad-hover'})

_HEX = r'#[0-9a-f]{6}'
#: 软色（-soft）与描边（-line）同形：都是半透明 rgba，所以共用同一个 pattern 对象
#: ——两个后缀各自一个键是必须的（下面按后缀查表），重复的只是取值本身。
_SOFT_PATTERN = re.compile(r'^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$')
_VALUE_PATTERNS: dict[str, re.Pattern[str]] = {
    '-rgb': re.compile(r'^\d{1,3}, \d{1,3}, \d{1,3}$'),
    '-soft': _SOFT_PATTERN,
    '-line': _SOFT_PATTERN,
}
_VALUE_DEFAULT = re.compile(rf'^{_HEX}$')
_VALUE_GRADIENT = re.compile(rf'^linear-gradient\(180deg, {_HEX}, {_HEX}\)$')

#: 允许的预设 id。取值合法性（防写坏样式表）与「是不是我们发出去的预设」
#: 是两件事：后者防的是下拉框里出现一个从来没见过的名字。
#:
#: ``custom`` 商店界面**永远不会发出**（``store/static/palette.js`` 的 ``draft.preset``
#: 只取自 ``PRESETS``，目前只有 ``amber``），保留它是为了两件事：与主应用那份同名副本
#: 的取值集对齐，以及在 ``load()`` 时容忍一个手改/历史遗留的 ``preset`` —— 校验失败会连
#: **tokens 一起丢弃**（见 ``load``），为一个只是标签的字段赔上整份配色不划算。
PRESET_IDS = frozenset({'amber', 'custom'})

SCHEMA_VERSION = 1
_MAX_FILE_BYTES = 16384
_MAX_TOKENS = 64


class AppearanceError(ValueError):
    """配色取值不合法。路由把它转成 422 并带上 ``str(error)`` 作为用户可见文案。"""


def _value_pattern(token: str) -> re.Pattern[str]:
    """按令牌名挑取值正则。后缀优先，命中不了就是纯色。"""
    if token == '--hb-accent-grad-hover':
        return _VALUE_GRADIENT
    for suffix, pattern in _VALUE_PATTERNS.items():
        if token.endswith(suffix):
            return pattern
    return _VALUE_DEFAULT


def validate_tokens(tokens: object) -> dict[str, str]:
    """校验并归一化一张令牌表；任何一项不合法都抛 :class:`AppearanceError`。"""
    if tokens is None:
        return {}
    if not isinstance(tokens, dict):
        raise AppearanceError('配色令牌必须是一个对象。')
    if len(tokens) > _MAX_TOKENS:
        raise AppearanceError(f'配色令牌最多 {_MAX_TOKENS} 枚。')
    normalized: dict[str, str] = {}
    for raw_name, raw_value in tokens.items():
        name = str(raw_name).strip()
        if name not in _TOKEN_NAME_EXTRA and not _TOKEN_NAME.match(name):
            raise AppearanceError(
                f'「{name}」不是可配置的配色令牌；可配置的是主控色 / 暖光 / 极光紫 / 生态薄荷这四束光。'
            )
        if not isinstance(raw_value, str):
            raise AppearanceError(f'「{name}」的取值必须是字符串。')
        value = raw_value.strip().lower()
        if not _value_pattern(name).match(value):
            raise AppearanceError(f'「{name}」的取值「{raw_value}」不是合法的颜色写法。')
        normalized[name] = value
    return normalized


def validate_preset(preset: object) -> str:
    """校验预设 id；``None`` / 空串归一成 ``''``（表示「没配置过，用设计系统默认值」）。"""
    if preset is None:
        return ''
    value = str(preset).strip().lower()
    if not value:
        return ''
    if value not in PRESET_IDS:
        raise AppearanceError(
            f'配色预设「{preset}」不存在；可选值为 {"、".join(sorted(PRESET_IDS))}。'
        )
    return value


def tokens_to_css(tokens: dict[str, str]) -> str:
    """把令牌表拼成 ``:root{…}`` 样式表正文。

    ``tokens`` 必须来自 :func:`validate_tokens` —— 拼接的安全性由那道白名单保证。
    """
    if not tokens:
        # 没配置时返回合法的空样式表而不是 404：<link> 拿到 404 会在控制台留下一条
        # 常年存在的红字，而「还没配过」是完全正常的初始状态。
        return '/* HomeOS 商店配色：尚未配置，使用设计系统默认值。 */\n'
    body = '\n'.join(f'  {name}: {value};' for name, value in sorted(tokens.items()))
    return f'/* HomeOS 商店配色（由设置界面生成，勿手改） */\n:root {{\n{body}\n}}\n'


class AppearanceStore:
    """``data/appearance.json`` 的读写。

    与账号文件不同，这份文件天生要反复覆盖（管理员每拖一次色轮都可能保存一次），
    所以写入用「临时文件 + rename」保证原子，但不拒绝覆盖。
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._preset = ''
        self._tokens: dict[str, str] = {}

    def load(self) -> None:
        """启动时读一次。文件不存在、读不动或 schema 不认，都退回默认配色。

        刻意不抛异常：配色是纯装饰，一份坏掉的配色文件绝不该让商店起不来 ——
        那会把「管理员改错了颜色」升级成「顾客打不开商店」。
        """
        self._preset = ''
        self._tokens = {}
        payload = self._read()
        if payload is None:
            return
        try:
            self._preset = validate_preset(payload.get('preset'))
            self._tokens = validate_tokens(payload.get('tokens'))
        except AppearanceError:
            # 文件被手改坏了：退回默认值，下次写入时覆盖掉它。
            self._preset = ''
            self._tokens = {}

    def _read(self) -> dict | None:
        try:
            if not self.path.is_file() or self.path.stat().st_size > _MAX_FILE_BYTES:
                return None
            payload = json.loads(self.path.read_text(encoding='utf-8'))
        except (OSError, UnicodeError, ValueError):
            return None
        if not isinstance(payload, dict) or payload.get('schemaVersion') != SCHEMA_VERSION:
            return None
        return payload

    @property
    def revision(self) -> str:
        """版本号，用于 ``?v=`` 缓存戳。用文件 mtime 而不是自增计数：
        多进程 / 重启后计数会从头开始，而 mtime 单调，浏览器不会把旧响应当成新的。"""
        try:
            return str(self.path.stat().st_mtime_ns)
        except OSError:
            return '0'

    def state(self) -> dict:
        return {
            'preset': self._preset,
            'tokens': dict(self._tokens),
            'revision': self.revision,
        }

    def css(self) -> str:
        return tokens_to_css(self._tokens)

    def save(self, *, preset: str, tokens: dict[str, str]) -> dict:
        """原子写入并刷新内存快照。先落盘再更新内存：反过来的话，写盘失败会让
        「界面显示新配色、重启后变回旧配色」，而管理员已经关掉页面了。"""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encoded = (
            json.dumps(
                {'schemaVersion': SCHEMA_VERSION, 'preset': preset, 'tokens': tokens},
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + '\n'
        ).encode('utf-8')
        temporary_path = self.path.with_name(f'.{self.path.name}.{secrets.token_hex(8)}.tmp')
        try:
            descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                output.write(encoded)
                output.flush()
                # 先刷内容再 rename：断电后不会留下一个空文件把配色清掉。
                os.fsync(output.fileno())
            os.replace(temporary_path, self.path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
        self._preset = preset
        self._tokens = dict(tokens)
        return self.state()
