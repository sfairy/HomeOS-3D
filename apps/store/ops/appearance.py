"""商店侧的站点配色：``data/appearance.json`` 的读写。
"""
from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path

#: 令牌名白名单。与 ``apps/server/core/appearance.py`` 逐字相同，与
_TOKEN_NAME = re.compile(
    r'^--(?:hos|hb)-(?:accent|lumen|aura|eco)(?:-rgb|-bright|-deep|-soft|-line|-text)?$'
)
#: 主按钮悬停渐变：唯一一枚不按后缀归类的令牌（它同时用两枚色）。
_TOKEN_NAME_EXTRA = frozenset({'--hb-accent-grad-hover'})

_HEX = r'#[0-9a-f]{6}'
_SOFT_PATTERN = re.compile(r'^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0?\.\d+\)$')
_VALUE_PATTERNS: dict[str, re.Pattern[str]] = {
    '-rgb': re.compile(r'^\d{1,3}, \d{1,3}, \d{1,3}$'),
    '-soft': _SOFT_PATTERN,
    '-line': _SOFT_PATTERN,
}
_VALUE_DEFAULT = re.compile(rf'^{_HEX}$')
_VALUE_GRADIENT = re.compile(rf'^linear-gradient\(180deg, {_HEX}, {_HEX}\)$')

#: 允许的预设 id。取值合法性（防写坏样式表）与「是不是我们发出去的预设」
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
    """
    if not tokens:
        # 没配置时返回合法的空样式表而不是 404：<link> 拿到 404 会在控制台留下一条
        return '/* HomeOS 商店配色：尚未配置，使用设计系统默认值。 */\n'
    body = '\n'.join(f'  {name}: {value};' for name, value in sorted(tokens.items()))
    return f'/* HomeOS 商店配色（由设置界面生成，勿手改） */\n:root {{\n{body}\n}}\n'


class AppearanceStore:
    """``data/appearance.json`` 的读写。
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._preset = ''
        self._tokens: dict[str, str] = {}

    def load(self) -> None:
        """启动时读一次。文件不存在、读不动或 schema 不认，都退回默认配色。
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
