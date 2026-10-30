"""进程级代理环境变量修复。

背景（审计 LEAD-001）：宿主机常见的 `NO_PROXY` 写法会带方括号 IPv6 条目，
例如 `localhost,127.0.0.1,[::1]`。httpx 0.28 在构造客户端时把 no_proxy 条目
直接交给内部 URLPattern，方括号形式会抛 `httpx.InvalidURL: Invalid port: ':1]'`。
该异常既不是 HTTPError 也不是 ValueError，通道/HA/许可证等出站客户端都无法兜住；
更糟的是 WebPush/WeCom 在 lifespan 启动期就构造客户端，整个后端直接启动失败。

修复放在应用工厂入口（任何客户端构造之前）：
- `[2001:db8::1]` -> `2001:db8::1`（httpx 支持无方括号形式）；
- `[2001:db8::1]:8080` -> `2001:db8::1`（httpx 无法表达「IPv6 + 端口」的
  no_proxy 条目；这里放宽为整地址绕过代理，避免把本机/内网流量错误地送进代理，
  并记录一次 warning 说明端口被忽略）；
- 其它条目原样保留，包括通配符、域名、IPv4 与普通 host:port。

只在确有方括号条目时改写，且同时处理大小写两个变量；重复调用是幂等的。
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("homeos.bootstrap")

NO_PROXY_KEYS = ("NO_PROXY", "no_proxy")


def normalize_no_proxy(value: str) -> tuple[str, list[str]]:
    """把 httpx 无法解析的方括号 IPv6 条目归一化。

    返回 `(新值, 说明列表)`；没有可归一化条目时原样返回、说明为空。
    """
    tokens = [token.strip() for token in value.split(",")]
    normalized: list[str] = []
    notes: list[str] = []
    for token in tokens:
        if not token or not token.startswith("["):
            normalized.append(token)
            continue
        closing = token.find("]")
        if closing <= 1:
            normalized.append(token)
            continue
        host = token[1:closing]
        suffix = token[closing + 1 :]
        if not suffix:
            normalized.append(host)
            continue
        if suffix.startswith(":") and suffix[1:].isdigit():
            # httpx 的 no_proxy 解析器不支持 [addr]:port；保留地址、忽略端口，
            # 保证本机/内网地址仍然绕过代理（宁可放宽，不要把内网流量送进代理）。
            normalized.append(host)
            notes.append(f"{token} -> {host}（httpx 不支持 IPv6 端口，已按整地址绕过）")
            continue
        normalized.append(token)
    return ",".join(normalized), notes


def repair_no_proxy_env() -> bool:
    """归一化进程内 NO_PROXY/no_proxy；返回是否发生改写。"""
    changed = False
    for key in NO_PROXY_KEYS:
        original = os.environ.get(key)
        if original is None:
            continue
        normalized, notes = normalize_no_proxy(original)
        if normalized == original:
            continue
        os.environ[key] = normalized
        changed = True
        logger.warning(
            "代理环境变量 %s 含 httpx 无法解析的 IPv6 条目，已归一化：%r -> %r%s",
            key,
            original,
            normalized,
            f"；{'；'.join(notes)}" if notes else "",
        )
    return changed
