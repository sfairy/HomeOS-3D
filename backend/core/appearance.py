"""站点配色（可配置的四束光）的读取、校验与样式表生成。

配置落在 ``data/appearance.json``，与 ``admin-account.json`` 同款做法（见
``backend/security/admin_account.py``）：一个几十字节的设置不值得为它开一张表、
再走一次 Alembic 迁移，而删掉这个文件就等于回到默认配色。

## 这个模块刻意不做的事：算颜色

预设、明暗派生（``-bright`` / ``-deep``）与令牌展开都在
``design/scene/appearance.js`` 里 —— 它是唯一一份实现，前端设置界面 import 的就是它。
本模块只接收「已经展开好的令牌表」，做白名单 + 取值格式校验后原样存下。

理由见那个文件头：主应用与商店是两个独立构建上下文，后端无法共享 Python，而前端
本来就必须有一份派生逻辑用来即时预览。多写一份 Python 只会多出一份会走散的真值。

## 那为什么还留着校验

要防的不是管理员审美，而是**把样式表写坏**：``tokensToCss()`` 把键值直接拼进 `:root{}`，
键里塞一个 ``}`` 或值里塞一个 ``url(...)`` 就能关掉自己的样式、污染整页。所以两道墙：
键必须命中令牌白名单正则，值必须命中该后缀对应的取值正则。两者都不通过就整个请求 422，
不做部分保留 —— 半张配色表比没有配色表更难排查（界面会「大部分对、某一处不对」）。
"""
from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path

from .static_revision import file_revision

#: 令牌名白名单。与 ``design/scene/appearance.js`` 的 ``tokenNames()`` 一一对应 ——
#: 往 JS 里加令牌而忘了放宽这里不会报错，只会在管理员保存时才发现少了一项；
#: 改动任一侧请手工核对另一侧。
_TOKEN_NAME = re.compile(
    r'^--(?:hos|hb)-(?:accent|lumen|aura|eco)(?:-rgb|-bright|-deep|-soft|-line|-text)?$'
)
#: 主按钮悬停渐变是唯一一枚不按后缀归类的令牌（它同时用两枚色）。
_TOKEN_NAME_EXTRA = frozenset({'--hb-accent-grad-hover'})

_HEX = r'#[0-9a-f]{6}'
#: 后缀 → 取值形状。基础令牌与 `-bright` / `-deep` / `-text` 都是纯色，共用 `_HEX`。
_VALUE_PATTERNS: dict[str, re.Pattern[str]] = {
    '-rgb': re.compile(r'^\d{1,3}, \d{1,3}, \d{1,3}$'),
    '-soft': re.compile(rf'^rgba\(\d{{1,3}}, \d{{1,3}}, \d{{1,3}}, 0?\.\d+\)$'),
    '-line': re.compile(rf'^rgba\(\d{{1,3}}, \d{{1,3}}, \d{{1,3}}, 0?\.\d+\)$'),
}
_VALUE_DEFAULT = re.compile(rf'^{_HEX}$')
_VALUE_GRADIENT = re.compile(rf'^linear-gradient\(180deg, {_HEX}, {_HEX}\)$')

#: 允许的预设 id。取值合法性与「是不是我们发出去的预设」是两件事：
#: 前者防样式表被写坏，后者防界面上出现一个下拉框里从来没有过的名字。
PRESET_IDS = frozenset({'amber', 'custom'})

#: 配置文件 schema 版本。读取时严格比对：不匹配就当作「没配置过」，
#: 而不是尽力解析半个文件 —— 半个配色表会让界面出现「某处还是旧色」的假象。
SCHEMA_VERSION = 1

#: 文件大小上限。45 枚令牌约 1.5KB，超过 16KB 只可能是被写脏了。
_MAX_FILE_BYTES = 16384

#: 单次请求最多接受多少枚令牌。白名单正则已经限定了名字，这个上限防的是
#: 「同一个名字重复几百次」把配置文件撑大。
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
    """校验并归一化一张令牌表；任何一项不合法都抛 :class:`AppearanceError`。

    归一化 = 转小写 + 去掉两侧空白。前端产出的值本来就是小写，但 ``#AABBCC`` 这种
    手改过的配置如果原样存下，取值正则就会拒掉它 —— 与其让管理员困惑，不如先归一。
    """
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

    这里就是白名单存在的理由：``tokens`` 全部来自 :func:`validate_tokens`，
    所以拼接是安全的；直接拿请求体拼的写法等于把整页样式交给调用方。
    """
    if not tokens:
        # 没有配置时仍然返回一个合法的空样式表，而不是 404：<link> 拿到 404
        # 会在控制台留下一条常年存在的红字，而「还没配过」是完全正常的初始状态。
        return '/* HomeOS 站点配色：尚未配置，使用设计系统默认值。 */\n'
    body = '\n'.join(f'  {name}: {value};' for name, value in sorted(tokens.items()))
    return f'/* HomeOS 站点配色（由设置界面生成，勿手改） */\n:root {{\n{body}\n}}\n'


class AppearanceStore:
    """``data/appearance.json`` 的读写。

    与 ``AdminAccountStore`` 的关键差别：那个文件「只能写一次」（重复写意味着有人搞错了），
    这个文件天生要反复覆盖 —— 管理员每次拖色轮都会写一次。因此写入用
    「临时文件 + rename」保证原子，但不拒绝覆盖。
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._preset = ''
        self._tokens: dict[str, str] = {}
        self._revision = 0

    def load(self) -> None:
        """启动时读一次。文件不存在、读不动或 schema 不认，都退回默认配色。

        刻意不抛异常：配色是纯装饰，一份坏掉的配色文件绝不该让整个服务起不来 ——
        那会把「管理员改错了颜色」升级成「全家打不开中控」。
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
            # 文件被手改坏了：退回默认值，并在下次写入时覆盖掉它。
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
        """当前配置的版本号，用于 ``?v=`` 缓存戳。

        与页面里其它服务端拼出来的静态链接同一口径，见 ``core/static_revision.py``：
        取文件 mtime，改完配色 URL 立刻变；多进程 / 重启后也不会像自增计数那样从头开始。
        """
        return file_revision(self.path)

    @property
    def configured(self) -> bool:
        """是否真的配置过。只有配置过才值得往响应里塞一张覆盖表。"""
        return bool(self._tokens)

    def state(self) -> dict:
        """当前状态快照，供 ``GET/PUT /api/v1/appearance`` 返回。"""
        return {
            'preset': self._preset,
            'tokens': dict(self._tokens),
            'revision': self.revision,
        }

    def css(self) -> str:
        """当前配置对应的 ``:root{…}`` 正文。未配置时是一张空样式表。"""
        return tokens_to_css(self._tokens)

    def save(self, *, preset: str, tokens: dict[str, str]) -> dict:
        """原子写入并刷新内存快照。

        先落盘再更新内存：反过来的话，写盘失败会让「界面显示新配色、重启后变回旧配色」，
        而管理员已经关掉页面了。
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encoded = (
            json.dumps(
                {'schemaVersion': SCHEMA_VERSION, 'preset': preset, 'tokens': tokens},
                ensure_ascii = False,
                indent = 2,
                sort_keys = True,
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
            temporary_path.unlink(missing_ok = True)
            raise
        self._preset = preset
        self._tokens = dict(tokens)
        return self.state()
