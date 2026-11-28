"""唤醒词网关（对齐参考 ``wake-word-config.service.js``）。

**唤醒词的真源在音箱网关**，不在本项目的配置里：网关才是负责识别的那一端，
本地配置只是镜像（给前端展示与离线兜底用）。照抄「本地是权威」会让两份词表逐渐漂移，
最终表现成「设置页改了但音箱不认」。

三条硬约束（都来自参考实现，且都有安全含义）：

1. 网关地址只允许私有网段 + 根路径 + 无账号密码 —— 这个 URL 由管理员填，但一旦被
   注入成公网地址，就等于把带 ``Bearer`` 的请求发到别人服务器。
2. ``secret`` 至少 32 字符：它是唯一的鉴权头，弱串等于没有鉴权。
3. 词表更新带 ``expectedVersion``（CAS）：两个设置页同时保存时，后到的那个拿到 409
   而不是覆盖前一个的结果。
"""

from __future__ import annotations

import ipaddress
import json
import logging
import re
from typing import Any
from urllib.parse import urlsplit

logger = logging.getLogger("homeos.voice_device.wake_words")

#: 一个词最多 20 字符（中文 / 英数 / 空格）。
_WORD_RE = re.compile(r"^[\u4e00-\u9fffA-Za-z0-9 ]{1,20}$")
#: 词表上限：与参考一致。
MAX_WORDS = 10
#: 网关请求超时（秒）。参考是 20s：识别模型的词表重载比普通接口慢。
REQUEST_TIMEOUT_SECONDS = 20.0
#: secret 最小长度。
MIN_SECRET_LENGTH = 32


class WakeWordError(Exception):
    """带 HTTP 语义的错误（``status`` 由 API 层映射）。"""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _is_private_host(host: str) -> bool:
    """只允许内网地址（含 ``localhost``）。

    主机名不是字面 IP 时按「不信任」处理 —— 允许域名就等于允许 DNS 指向公网，
    而这条链路上带的是 ``Bearer`` 密钥。
    """
    name = host.strip().lower()
    if name == "localhost":
        return True
    try:
        address = ipaddress.ip_address(name)
    except ValueError:  # fmt: skip
        return False
    return address.is_private or address.is_loopback


def normalize_words(raw: Any) -> list[str]:
    """校验并归一化词表：1–10 个、每个 ≤20 字符、大小写去重（保序）。"""
    if not isinstance(raw, list) or not raw:
        raise WakeWordError("请输入 1 至 10 个有效唤醒词，每个最多 20 个字符。")
    cleaned: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            raise WakeWordError("请输入 1 至 10 个有效唤醒词，每个最多 20 个字符。")
        word = " ".join(item.strip().split())
        if not _WORD_RE.match(word):
            raise WakeWordError("请输入 1 至 10 个有效唤醒词，每个最多 20 个字符。")
        cleaned.append(word)
    unique: list[str] = []
    seen: set[str] = set()
    for word in cleaned:
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(word)
    if not unique or len(unique) > MAX_WORDS:
        raise WakeWordError(f"词表必须包含 1 至 {MAX_WORDS} 个唤醒词。")
    return unique


def merge_words(current: list[str], requested: list[str], action: str) -> list[str]:
    """按动作合成新词表：``replace`` / ``add`` / ``remove``。

    「语音加词」必须是 **add**：把用户新说的词追加进去，而不是替换掉原有词表 ——
    参考实现里「原来的唤醒词仍然可用」这句承诺就落在这里。
    """
    if action == "replace":
        merged = list(requested)
    elif action == "add":
        merged = [*current, *requested]
    elif action == "remove":
        drop = {item.lower() for item in requested}
        merged = [word for word in current if word.lower() not in drop]
    else:  # pragma: no cover - 内部调用约束
        raise WakeWordError("未知的唤醒词操作")
    unique: list[str] = []
    seen: set[str] = set()
    for word in merged:
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(word)
    if not unique or len(unique) > MAX_WORDS:
        raise WakeWordError(f"词表必须包含 1 至 {MAX_WORDS} 个唤醒词。")
    return unique


def validate_gateway_url(url: str) -> str:
    """只接受「私有地址 + 根路径 + 无凭据」的 http(s) 地址，返回 ``/wake-words`` 端点。

    拒绝的理由只有一条：这个 URL 由管理员填，而请求上带的是 ``Bearer`` 密钥 ——
    一旦它能指向公网（或用域名解析到公网），这条链路就是在替别人发密钥。
    不合法时抛 503（"未配置"），因为对用户来说两种情况都是「网关没配好」。
    """
    try:
        parts = urlsplit(str(url or ""))
        hostname = parts.hostname or ""
        port = f":{parts.port}" if parts.port else ""
    except ValueError:  # fmt: skip
        raise WakeWordError("音箱网关设置连接未配置。", 503) from None
    if (
        parts.scheme not in ("http", "https")
        or not hostname
        or parts.username
        or parts.password
        or parts.path not in ("", "/")
        or parts.query
        or parts.fragment
        or not _is_private_host(hostname)
    ):
        raise WakeWordError("音箱网关设置连接未配置。", 503)
    return f"{parts.scheme}://{hostname}{port}/wake-words"


class WakeWordGateway:
    """唤醒词网关读写 + 本地配置镜像。

    ``app_config`` 用于读 ``voice.gatewayUrl`` / ``voice.gatewaySecret``，并镜像
    ``voice.wakeWords`` / ``voice.wakeWordsVersion``；``http`` 是可注入的请求函数
    （测试用），签名 ``(url, method, payload, headers) -> (status, text)``。
    """

    def __init__(self, app_config: Any, http: Any = None) -> None:
        self._app_config = app_config
        self._http = http

    # ── 网关地址 ──────────────────────────────────────────────
    def _gateway_settings(self) -> tuple[str, str]:
        """读网关地址与 secret；未配置或不合法统一抛 503。

        取值顺序：应用配置 ``voice.gatewayUrl`` / ``voice.gatewaySecret``（设置页可改）
        → 环境变量 ``HOMEOS_VOICE_GATEWAY_URL`` / ``_SECRET``（部署期固定）
        → 参考实现的 ``OH2P_SETTINGS_URL`` / ``OH2P_SETTINGS_SECRET``（兼容旧部署）。
        """
        import os

        voice = self._app_config.get("voice")
        voice = voice if isinstance(voice, dict) else {}
        url = str(voice.get("gatewayUrl") or "").strip()
        secret = str(voice.get("gatewaySecret") or "").strip()
        if not url:
            url = (os.getenv("HOMEOS_VOICE_GATEWAY_URL") or os.getenv("OH2P_SETTINGS_URL") or "").strip()
        if not secret:
            secret = (os.getenv("HOMEOS_VOICE_GATEWAY_SECRET") or os.getenv("OH2P_SETTINGS_SECRET") or "").strip()
        if not url or not secret:
            raise WakeWordError("音箱网关设置连接未配置。", 503)
        endpoint = validate_gateway_url(url)
        if len(secret) < MIN_SECRET_LENGTH:
            raise WakeWordError("音箱网关设置连接未配置。", 503)
        return endpoint, secret

    # ── 读取 / 更新 ──────────────────────────────────────────
    def read(self) -> dict[str, Any]:
        status, text = self._request("GET", None)
        if status == 409:
            raise WakeWordError("唤醒词已更新，请刷新后重试。", 409)
        if status == 400:
            raise WakeWordError("网关拒绝了候选词表，请检查词语格式和识别模型支持情况。", 400)
        if status != 200:
            raise WakeWordError("音箱网关未能确认有效词表。", 503)
        return self._parse(text)

    def update(
        self,
        action: str,
        words: Any,
        expected_version: Any = None,
        before_write: Any = None,
    ) -> dict[str, Any]:
        """按动作更新词表；``before_write`` 在真正下发前调用（权限 / 轮次校验）。

        下发成功后再镜像到本地配置：镜像失败只记日志 —— 网关已经是新词表了，回滚
        只会让两边再次不一致。
        """
        current = self.read()
        requested = normalize_words(words)
        if expected_version is not None:
            # 只接受非布尔的整数：字符串 / 布尔会被 ``isinstance(int)`` 判成别的类型而静默
            # 跳过 CAS —— 那等于把「并发保护」变成「碰运气」，不如直接拒掉。
            if isinstance(expected_version, bool) or not isinstance(expected_version, int):
                raise WakeWordError("expectedVersion 须为整数版本号", 400)
            if expected_version != current["version"]:
                raise WakeWordError("唤醒词已更新，请刷新后重试。", 409)
        merged = merge_words(current["words"], requested, action)
        if before_write is not None:
            before_write()
        payload = {"words": merged, "expectedVersion": current["version"]}
        status, text = self._request("PUT", payload)
        if status == 409:
            raise WakeWordError("唤醒词已更新，请刷新后重试。", 409)
        if status == 400:
            raise WakeWordError("网关拒绝了候选词表，请检查词语格式和识别模型支持情况。", 400)
        if status != 200:
            raise WakeWordError("音箱网关未能确认有效词表。", 503)
        updated = self._parse(text)
        # 网关回显必须与提交内容一致：不一致说明另一处并发写入（或网关实现有问题），
        # 这时不能把本地镜像改成「我以为是的那份」。
        if updated["version"] != current["version"] + 1 or updated["words"] != merged:
            raise WakeWordError("网关返回的词表与提交内容不一致，请重新读取当前词表。", 503)
        self._mirror(updated)
        return updated

    def _parse(self, text: str) -> dict[str, Any]:
        try:
            data = json.loads(text or "{}")
        except (TypeError, ValueError):  # fmt: skip
            raise WakeWordError("音箱网关未能确认有效词表。", 503) from None
        words = data.get("words") if isinstance(data, dict) else None
        version = data.get("version") if isinstance(data, dict) else None
        if (
            not isinstance(words, list)
            or not words
            or any(not isinstance(item, str) for item in words)
            or not isinstance(version, int)
            or isinstance(version, bool)
        ):
            raise WakeWordError("音箱网关未能确认有效词表。", 503)
        return {"words": list(words), "version": version}

    def _mirror(self, updated: dict[str, Any]) -> None:
        """把网关词表镜像进 ``voice.wakeWords`` / ``voice.wakeWordsVersion``。

        版本只增不减：并发写入时较旧的那次不能把版本改小，否则下一次 CAS 会误判。
        """
        voice = self._app_config.get("voice")
        voice = dict(voice) if isinstance(voice, dict) else {}
        current_version = voice.get("wakeWordsVersion")
        if isinstance(current_version, int) and not isinstance(current_version, bool):
            if current_version > int(updated["version"]):
                return
        voice["wakeWords"] = updated["words"]
        voice["wakeWordsVersion"] = int(updated["version"])
        try:
            self._app_config.update({"voice": voice})
        except Exception as error:  # pragma: no cover - 配置写入自身防御
            logger.warning("唤醒词镜像写入本地配置失败（网关已更新）：%s", error)

    # ── 传输 ─────────────────────────────────────────────────
    def _request(self, method: str, payload: dict[str, Any] | None) -> tuple[int, str]:
        endpoint, secret = self._gateway_settings()
        headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
        if self._http is not None:
            return self._http(endpoint, method, payload, headers)
        return _default_http(endpoint, method, payload, headers)


def _default_http(url: str, method: str, payload: dict[str, Any] | None, headers: dict[str, str]) -> tuple[int, str]:
    """``urllib`` 同步请求：网关在局域网内，阻塞几十毫秒，不值得为此引依赖。

    放在线程池里由 API 层 ``asyncio.to_thread`` 调用（见 ``api/voice_device.py``）。
    """
    import urllib.error
    import urllib.request

    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    # URL 已由 ``_validate_url`` 限定成 http(s) + 私有地址 + 根路径，不存在 file:/自定义 scheme。
    request = urllib.request.Request(url, data=body, method=method, headers=headers)  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310
            return int(response.status), response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return int(error.code), error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        logger.warning("唤醒词网关请求失败: %s", error)
        raise WakeWordError("无法从音箱网关确认唤醒词，请重新读取当前词表。", 503) from None


def current_words_snapshot(app_config: Any) -> dict[str, Any]:
    """本地镜像快照（网关不可用时设置页展示用）。"""
    voice = app_config.get("voice")
    voice = voice if isinstance(voice, dict) else {}
    words = voice.get("wakeWords")
    version = voice.get("wakeWordsVersion")
    return {
        "words": [str(item) for item in words] if isinstance(words, list) else [],
        "version": int(version) if isinstance(version, int) and not isinstance(version, bool) else 0,
        "source": "local",
    }


__all__ = [
    "MAX_WORDS",
    "WakeWordError",
    "WakeWordGateway",
    "current_words_snapshot",
    "merge_words",
    "normalize_words",
    "validate_gateway_url",
]
