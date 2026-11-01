"""edge-tts 的 ``Sec-MS-GEC`` 防滥用令牌。

微软的边缘语音接口要求每次连接带一个「当前窗口 + 客户端固定 token」的摘要。
窗口 300 秒一格，跨窗口时旧令牌会被判过期（返回 403）。

历史上有两种形态，取决于 ``Sec-MS-GEC-Version``：

- ``1-130.0.2849.68``：``SHA256(ticks + TRUSTED_CLIENT_TOKEN)``，纯标准库即可；
- ``2-143.0.3650.75``：在上面的 SHA256 摘要之外再叠一层自定义混淆（参考实现里叫
  CS64），最终形态是 ``<8 字节混淆>-<SHA256>`` 全大写十六进制。

本项目两种都实现：默认走版本 2（2026-11 起服务端只认这一种，版本 1 恒定 403），
环境变量可覆盖。
参考实现的 SHA256 也是自己写的（打散过的常量与初始状态），这里改成标准实现 +
迭代轮转 —— 两者在数学上等价，实现期已用同一组时间戳逐个比对哈希值。
"""

from __future__ import annotations

import hashlib
import math
import secrets
import time
from collections.abc import Sequence

#: Windows FILETIME 纪元与 Unix 纪元的秒差
WIN_EPOCH = 11644473600

#: 令牌窗口（秒）
TOKEN_WINDOW_SECONDS = 300

#: 客户端固定 token（浏览器扩展内置，并非用户凭据）
TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"

#: Chromium 版本号：同时用作 ``Sec-MS-GEC-Version`` 的版本段与 UA
CHROMIUM_FULL_VERSION = "143.0.3650.75"
#: UA 里只带主版本（``Chrome/143.0.0.0 ... Edg/143.0.0.0``）。带上完整版本号会被判成
#: 非浏览器客户端并直接 403 —— 与 ``Sec-MS-GEC-Version`` 的主版本必须一致。
CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".", 1)[0]

#: 纯 SHA256 形态的版本号（社区长期可用）
PLAIN_GEC_VERSION = "1-130.0.2849.68"

#: 混淆形态的版本号
OBFUSCATED_GEC_VERSION = f"2-{CHROMIUM_FULL_VERSION}"

_U32_MASK = 0xFFFFFFFF

# —— 参考实现里被「打散」的 SHA256 常量，换成标准值；轮转等价性由测试锁住 ——
_SHA256_K: tuple[int, ...] = (
    0x428A2F98,
    0x71374491,
    0xB5C0FBCF,
    0xE9B5DBA5,
    0x3956C25B,
    0x59F111F1,
    0x923F82A4,
    0xAB1C5ED5,
    0xD807AA98,
    0x12835B01,
    0x243185BE,
    0x550C7DC3,
    0x72BE5D74,
    0x80DEB1FE,
    0x9BDC06A7,
    0xC19BF174,
    0xE49B69C1,
    0xEFBE4786,
    0x0FC19DC6,
    0x240CA1CC,
    0x2DE92C6F,
    0x4A7484AA,
    0x5CB0A9DC,
    0x76F988DA,
    0x983E5152,
    0xA831C66D,
    0xB00327C8,
    0xBF597FC7,
    0xC6E00BF3,
    0xD5A79147,
    0x06CA6351,
    0x14292967,
    0x27B70A85,
    0x2E1B2138,
    0x4D2C6DFC,
    0x53380D13,
    0x650A7354,
    0x766A0ABB,
    0x81C2C92E,
    0x92722C85,
    0xA2BFE8A1,
    0xA81A664B,
    0xC24B8B70,
    0xC76C51A3,
    0xD192E819,
    0xD6990624,
    0xF40E3585,
    0x106AA070,
    0x19A4C116,
    0x1E376C08,
    0x2748774C,
    0x34B0BCB5,
    0x391C0CB3,
    0x4ED8AA4A,
    0x5B9CCA4F,
    0x682E6FF3,
    0x748F82EE,
    0x78A5636F,
    0x84C87814,
    0x8CC70208,
    0x90BEFFFA,
    0xA4506CEB,
    0xBEF9A3F7,
    0xC67178F2,
)

_SHA256_H0 = (
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
)

#: 参考实现自定义的「初始状态」（把 H0 与打散后的常量混在一起），保持不变
_SHA256_CUSTOM_STATE = (
    0xFD9FBEA2,
    0x91243CE7,
    0xBE499094,
    0xCD2E1E0A,
    0x6C006F49,
    0x04BD35AB,
    0xFEB0A7E4,
    0x03EFFBD2,
)

#: 参考实现里前 30 个消息字的种子（打散后的常量表）
_SHA256_SCHEDULE = (
    0xEB24BF9E,
    0x1558691F,
    0xA0C09EE2,
    0x0CFA32BA,
    0xA622EE8C,
    0xD1DD9491,
    0xC0DD25A0,
    0xF9E70AB6,
    0xF0C31573,
    0x7058CE4E,
    0x7188E606,
    0x00E5AB33,
    0xD258B060,
    0x72766564,
)

_SHA256_ADJUSTMENT = 0xC9DC06A7
_SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80
_SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0

#: CS64 混淆用系数（(系数, 偏移) 成对出现）
_CS64_COEFFICIENTS = (
    (0xE82E91B1, 0xB32700D0),
    (0x44DE24C6, 0x88DFF51D),
    (0x3BEB65BC, 0x29514038),
    (0xC89C5933, 0xB328CBDF),
    (0x8D1EC211, 0xD405B4D5),
    (0x314EF5D5, 0x26E55F3C),
    (0xE92491B1, 0x607801C6),
    (0xF0A5B9D5, 0x82B2C1FB),
    (0x06064CF3, 0xFA51A3DA),
    (0xDA79FA60, 0x207CC464),
    (0xBED20560, 0x3C3C74F3),
    (0x89F9C9F8, 0xD2D14B61),
    (0x35FA38C6, 0xBB04A2C1),
    (0xCB49E3C6, 0xC5626167),
)
_CS64_FACTOR = 0x82893933
_CS64_ADJUSTMENT0 = 0xF2F90B1A
_CS64_ADJUSTMENT1 = 0x0B1A0000
_CS64_ODD_MULTIPLIER = 0xEF0569FB
_CS64_EVEN_MULTIPLIER = 0xC31713DB


def _u32(value: int) -> int:
    return value & _U32_MASK


def _rol16(value: int) -> int:
    """32 位里高低 16 位互换。"""
    value = _u32(value)
    return _u32((value << 16) | (value >> 16))


def _sigma0(value: int) -> int:
    return _u32((value >> 7) ^ ((value << 25) & _U32_MASK) ^ (value >> 18) ^ ((value << 14) & _U32_MASK) ^ (value >> 3))


def _sigma1(value: int) -> int:
    return _u32(
        (value >> 17) ^ ((value << 15) & _U32_MASK) ^ (value >> 19) ^ ((value << 13) & _U32_MASK) ^ (value >> 10)
    )


def _sha256_rounds(state: Sequence[int], words: list[int], first_round: int = 0) -> list[int]:
    """SHA256 压缩函数。

    参考实现把 8 个寄存器「展开」成固定变量以避免搬移，这里按标准写法逐轮轮转：
    两者只是寄存器命名的重排，结果完全一致。唯一的差别是 ``first_round == 14``
    时第 14 轮的常量被替换成 ``_SHA256_ADJUSTMENT``（参考实现里那张 BLOCK 常量表）。
    """
    constants = list(_SHA256_K)
    if first_round == 14:
        constants[14] = _SHA256_ADJUSTMENT
    a, b, c, d, e, f, g, h = state
    for index in range(first_round, 64):
        big_e = e * 0x100000001
        big_a = a * 0x100000001
        sigma_e = (big_e >> 6) ^ (big_e >> 11) ^ (big_e >> 25)
        sigma_a = (big_a >> 2) ^ (big_a >> 13) ^ (big_a >> 22)
        choice = g ^ (e & (f ^ g))
        majority = (a & b) | (c & (a | b))
        t1 = (h + sigma_e + choice + constants[index] + words[index]) & _U32_MASK
        t2 = (sigma_a + majority) & _U32_MASK
        a, b, c, d, e, f, g, h = (t1 + t2) & _U32_MASK, a, b, c, (d + t1) & _U32_MASK, e, f, g
    return [a, b, c, d, e, f, g, h]


def _expand_schedule(words: list[int], first_word: int = 16) -> None:
    for index in range(first_word, 64):
        total = _sigma1(words[index - 2]) + words[index - 7] + _sigma0(words[index - 15]) + words[index - 16]
        words.append(total & _U32_MASK)


def _read_u32_be(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset : offset + 4], "big")


def _read_u24_be(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset : offset + 3], "big")


def _sha256_init(prefix: bytes) -> list[int]:
    """构造参考实现特有的初始消息字表（前 7 字节被揉进常量表）。"""
    words: list[int] = [0] * 14
    words.append(_read_u24_be(prefix, 0))
    words.append(_read_u32_be(prefix, 3))
    for index in range(16, 30):
        value = _SHA256_SCHEDULE[index - 16]
        if index - 2 >= 14:
            sigma1 = _sigma1(words[index - 2])
            value += (sigma1 ^ _SHA256_SIGMA1_ADJUSTMENT) if index == 16 else sigma1
        if index - 7 >= 14:
            value += words[index - 7]
        if index - 15 >= 14:
            sigma0 = _sigma0(words[index - 15])
            value += (sigma0 ^ _SHA256_SIGMA0_ADJUSTMENT) if index == 29 else sigma0
        words.append(value & _U32_MASK)
    extra = (
        _sigma1(words[28]) + words[23] + _sigma0(words[15]) + words[14] + _SHA256_ADJUSTMENT - _SHA256_K[14]
    ) & _U32_MASK
    words.append(extra)
    _expand_schedule(words, 31)
    working = _sha256_rounds(_SHA256_CUSTOM_STATE, words, 14)
    return [_u32(_SHA256_H0[i] + working[i]) for i in range(8)]


def _sha256_digest(data: bytes) -> bytes:
    """参考实现的 SHA256 变体：前 7 字节特殊处理，其余按标准分块。"""
    declared_bits = (57 + len(data)) * 8
    pad_len = (55 - ((57 + len(data)) % 64) + 64) % 64
    padded = data[7:] + b"\x80" + bytes(pad_len) + declared_bits.to_bytes(8, "big")
    state = _sha256_init(data[:7])
    for offset in range(0, len(padded), 64):
        chunk = padded[offset : offset + 64]
        words = [_read_u32_be(chunk, index) for index in range(0, 64, 4)]
        _expand_schedule(words)
        working = _sha256_rounds(state, words)
        state = [_u32(state[index] + working[index]) for index in range(8)]
    return b"".join(word.to_bytes(4, "big") for word in state)


def _words_le4_even(data: bytes) -> list[int]:
    """每 4 字节小端取一个 32 位字，不足 4 字节补零，奇数个再补 0。"""
    pad_len = (4 - (len(data) % 4)) % 4
    padded = data + bytes(pad_len)
    words = [int.from_bytes(padded[index : index + 4], "little") for index in range(0, len(padded), 4)]
    if len(words) % 2:
        words.append(0)
    return words


def _cs64_terms(words: list[int], key_a: int, key_b: int, factors: tuple[int, int]) -> tuple[list[int], list[int]]:
    """把每个消息字摊成一个「乘子项 + 偏移项」。"""
    terms = [_u32(coef * factors[index % 2]) for index, (coef, _offset) in enumerate(_CS64_COEFFICIENTS)]
    offsets = [offset for _coef, offset in _CS64_COEFFICIENTS]
    for index, word in enumerate(words):
        odd = index % 2 == 1
        term = word * (key_b if odd else key_a)
        offset = _rol16(word) * (_CS64_EVEN_MULTIPLIER if odd else _CS64_ODD_MULTIPLIER)
        if index == 0:
            term += _CS64_ADJUSTMENT0 * factors[0]
            offset += _CS64_ADJUSTMENT1
        terms.append(term & _U32_MASK)
        offsets.append(offset & _U32_MASK)
    return terms, offsets


def _cs64_pair(terms: list[int], offsets: list[int]) -> tuple[int, int]:
    """逐对混洗并累积：返回 ``(swap_acc, swap_last)`` 的末态。"""
    swap_acc = 0
    swap_last = 0
    for index in range(0, len(terms), 2):
        left = _rol16((offsets[index] + terms[index]) & _U32_MASK)
        left_q = _u32(left * 0x76F50F34)
        swap_acc = _u32(swap_acc + _u32(_rol16(left_q) * 0xC3EFEA97 + left_q))
        right = _rol16((offsets[index + 1] + terms[index + 1]) & _U32_MASK)
        right_q = _u32(right * 0x1881CE3C)
        swap_last = _u32(_rol16(right_q) * 0x35BD1EC9 + right_q)
        swap_acc = _u32(swap_acc + swap_last)
    return swap_acc, swap_last


def _cs64_state(terms: list[int], key_a: int, key_b: int) -> tuple[int, int]:
    """混洗状态的 ``(state, acc)`` 末态（每对项各推两轮）。"""
    state = 0
    acc = 0
    for index in range(0, len(terms), 2):
        state = _u32(state * key_a + terms[index])
        for multiplier in (0xCF98B111, 0x87085B9F, 0x12CEB96D, 0x257E1D83):
            state = _u32(_rol16(state) * multiplier)
        acc = _u32(acc + state)
        state = _u32(state * key_b + terms[index + 1])
        for multiplier in (0xA27416F5, 0xD38396FF, 0x7C932B89, 0xBFA49F69):
            state = _u32(_rol16(state) * multiplier)
        acc = _u32(acc + state)
    return state, acc


def _cs64_digest(data: bytes, digest: bytes) -> bytes:
    """参考实现的 8 字节混淆摘要（小端打包）。"""
    key_a = int.from_bytes(digest[0:4], "little") | 1
    key_b = int.from_bytes(digest[4:8], "little") | 1
    factors = (_u32(key_a * _CS64_FACTOR), _u32(key_b * _CS64_FACTOR))
    words = _words_le4_even(b"\x00" + data)
    terms, offsets = _cs64_terms(words, key_a, key_b, factors)
    swap_acc, swap_last = _cs64_pair(terms, offsets)
    state, acc = _cs64_state(terms, key_a, key_b)
    return (swap_last ^ state).to_bytes(4, "little") + (swap_acc ^ acc).to_bytes(4, "little")


def _ticks(unix_seconds: float | None) -> int:
    """把 Unix 秒压到 300 秒窗口并换算成 FILETIME 百纳秒。"""
    stamp = time.time() if unix_seconds is None else float(unix_seconds)
    ticks = stamp + WIN_EPOCH
    ticks -= ticks % TOKEN_WINDOW_SECONDS
    return math.floor(ticks * 1e7)


def plain_gec_token(unix_seconds: float | None = None) -> str:
    """版本 1 形态：纯 SHA256 十六进制大写。"""
    return hashlib.sha256(f"{_ticks(unix_seconds)}{TRUSTED_CLIENT_TOKEN}".encode("ascii")).hexdigest().upper()


def obfuscated_gec_token(unix_seconds: float | None = None) -> str:
    """版本 2 形态：``<混淆 8 字节>-<SHA256>``。"""
    data = f"{_ticks(unix_seconds)}{TRUSTED_CLIENT_TOKEN}".encode("ascii")
    digest = _sha256_digest(data)
    obfuscated = _cs64_digest(data, digest)
    return f"{obfuscated.hex().upper()}-{digest.hex().upper()}"


def generate_muid() -> str:
    """握手用的随机 MUID（浏览器扩展每次连接都会在 Cookie 里带一个新的）。"""
    return secrets.token_hex(16).upper()


__all__ = [
    "CHROMIUM_FULL_VERSION",
    "CHROMIUM_MAJOR_VERSION",
    "OBFUSCATED_GEC_VERSION",
    "PLAIN_GEC_VERSION",
    "TOKEN_WINDOW_SECONDS",
    "TRUSTED_CLIENT_TOKEN",
    "generate_muid",
    "obfuscated_gec_token",
    "plain_gec_token",
]
