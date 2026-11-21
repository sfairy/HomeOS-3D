"""意图门（IntentGate）：在「执行动作」之前先判断一句话是不是**规则型**表达。

背景：一句「晚上十点关客厅灯」在语义上是「建一条规则」，但正则快路径只看到
「关客厅灯」，会立刻执行一次。参考实现用三层拦法：

1. ``off``：不启用；
2. ``shadow``（默认）：只记录判定结果，不改变行为，用来积累影子样本；
3. ``enforce``：非 ``IMMEDIATE`` 的判定禁用控制类快路径 / 命令缓存 / 控制类工具。

判定结果（verdict）：

- ``IMMEDIATE``：可以立刻执行的一次性指令（「关客厅灯」）；
- ``RULE``：动态意图（时间 / 习惯 / 事件 / 条件 / 状态），应交给计划任务或自动化；
- ``AMBIGUOUS``：像动作但含无法归一的残句，需要澄清；
- ``NONE``：没有动作语义（问答、闲聊），快路径本来就不会命中。

词表刻意保持「少量高置信」：宁可漏判（走 LLM）也不要误判（把一次性指令拦成规则）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

MODE_OFF = "off"
MODE_SHADOW = "shadow"
MODE_ENFORCE = "enforce"
VALID_MODES = (MODE_OFF, MODE_SHADOW, MODE_ENFORCE)
DEFAULT_MODE = MODE_SHADOW

IMMEDIATE = "IMMEDIATE"
RULE = "RULE"
AMBIGUOUS = "AMBIGUOUS"
NONE = "NONE"

#: 五类动态意图词表。命中任一类即判 ``RULE``（带 KIND 前缀便于影子回放分桶）。
LEXICON: dict[str, tuple[str, ...]] = {
    "TIME": (
        "每天",
        "每晚",
        "每周",
        "每月",
        "每小时",
        "每周末",
        "工作日",
        "周末",
        "明天",
        "后天",
        "稍后",
        "之后",
        "过一会",
        "一会儿",
        "十分钟后",
        "半小时后",
        "一个小时后",
        "早上",
        "上午",
        "中午",
        "下午",
        "傍晚",
        "晚上",
        "夜里",
        "半夜",
        "凌晨",
        "睡前",
        "起床",
        "定时",
        "定期",
        "周期性",
        "每天固定",
        "闹钟",
        "提醒我",
        "叫醒我",
        "点提醒",
        "every day",
        "every night",
        "every week",
        "every month",
        "tomorrow",
        "later",
        "in 10 minutes",
        "in an hour",
        "morning",
        "evening",
        "tonight",
    ),
    "HABIT": (
        "每次",
        "每当",
        "习惯",
        "总是",
        "一向",
        "往常",
        "通常",
        "一般",
        "默认",
        "以后都",
        "都改成",
        "都设为",
        "就一直",
        "就自动",
        "以后",
        "今后",
        "从现在起",
        "whenever",
        "every time",
        "always",
        "by default",
        "from now on",
    ),
    "EVENT": (
        "回家",
        "出门",
        "离家",
        "到家",
        "进门",
        "出门时",
        "回家时",
        "起床时",
        "睡觉时",
        "有人",
        "无人",
        "有人按门铃",
        "门铃响",
        "报警",
        "着火",
        "漏水",
        "开门",
        "关门",
        "当有人",
        "如果检测到",
        "检测到",
        "when someone",
        "on arrival",
        "when i leave",
        "doorbell",
        "when motion",
    ),
    "COND": (
        "如果",
        "假如",
        "要是",
        "一旦",
        "只要",
        "除非",
        "当温度",
        "当湿度",
        "当PM2.5",
        "超过",
        "低于",
        "高于",
        "大于",
        "小于",
        "到达",
        "达到",
        "就开",
        "就关",
        "就打开",
        "if ",
        "unless",
        "as long as",
        "above",
        "below",
    ),
    "STATE": (
        "开着的时候",
        "亮着的时候",
        "没人的时候",
        "有人在家",
        "没人在家",
        "在家时",
        "离开时",
        "睡觉模式",
        "离家模式",
        "回家模式",
        "离家后",
        "回家后",
        "while on",
        "while off",
        "when home",
        "when away",
    ),
}

#: 一次性相对延时（「10 分钟后提醒我」）：这是**现在就要建任务**，不是规则型思考。
_ONE_TIME_DELAY_RE = re.compile(r"(?:\d+|[一二两三四五六七八九十百]+)\s*(?:秒|分钟|分|小时|钟头)\s*(?:后|之后|以后)")

#: 时间词「单独出现」不构成规则：需要同时具备动作或明确的日程语汇。
_TIME_ONLY_WORDS = ("晚上", "夜里", "半夜", "凌晨", "早上", "上午", "中午", "下午", "傍晚")
_TIME_SCHEDULE_WORDS = ("点", "时", "分", "每天", "每晚", "每周", "工作日", "周末", "明天", "定时")

#: 礼貌前缀：判定前剥掉，避免「帮我」「请」被当成残句。
_POLITE_PREFIX_RE = re.compile(r"^(?:请|麻烦|帮我|帮忙|劳驾|能不能|可以|给我|替我)\s*")
_TRAILING_PUNCT_RE = re.compile(r"[。！？!?.,，、\s]+$")

#: 立即执行模板（高置信）：命中即 ``IMMEDIATE``，不再看动态词。
_IMMEDIATE_TEMPLATES: tuple[re.Pattern[str], ...] = (
    re.compile(r"^(?:打开|开启|关闭|关掉|开|关)\s*.{1,20}$"),
    re.compile(r"^(?:把|将)\s*.{1,20}\s*(?:打开|开启|关闭|关掉|调|设|切)"),
    re.compile(r"^(?:调|设|设置|切到|切成)\s*.{1,20}$"),
    re.compile(r"^(?:亮度|色温|温度|音量)\s*.{0,12}(?:调|设|加|减|\d)"),
    re.compile(r"^(?:播放|暂停|继续|停止|下一首|上一首|切歌)\s*.{0,20}$"),
    re.compile(r"^(?:执行|激活|启动|运行)\s*.{1,20}$"),
    re.compile(
        r"^(?:turn\s+(?:on|off)|switch\s+(?:on|off)|open|close|set|play|pause|stop|start)\b.{0,40}$",
        re.IGNORECASE,
    ),
    re.compile(r"^(?:dim|brighten|louder|quieter)\b.{0,40}$", re.IGNORECASE),
)

#: 动作动词：用于判断「非动态句里是否还有没被模板吃掉的残句」。
_ACTION_VERBS = (
    "打开",
    "开启",
    "关闭",
    "关掉",
    "调",
    "设",
    "切",
    "播",
    "暂停",
    "停止",
    "执行",
    "激活",
    "启动",
    "运行",
    "开",
    "关",
)
_ACTION_VERBS_EN = ("turn", "switch", "open", "close", "set", "play", "pause", "stop", "start", "dim")


@dataclass(frozen=True)
class IntentVerdict:
    """一次判定结果。``reason`` 形如 ``dynamic:TIME`` / ``one_time_relative_delay``。"""

    verdict: str
    reason: str = ""

    @property
    def is_immediate(self) -> bool:
        return self.verdict == IMMEDIATE

    @property
    def is_rule_like(self) -> bool:
        return self.verdict in (RULE, AMBIGUOUS)

    def to_dict(self) -> dict[str, Any]:
        return {"verdict": self.verdict, "reason": self.reason}


def normalize_mode(value: Any) -> str:
    """模式归一：非法/缺省 → ``shadow``（与参考实现一致）。"""
    text = str(value or "").strip().lower()
    return text if text in VALID_MODES else DEFAULT_MODE


def _strip(text: str) -> str:
    return _TRAILING_PUNCT_RE.sub("", _POLITE_PREFIX_RE.sub("", str(text or "").strip()))


def _lexicon_hit(text: str, kind: str) -> bool:
    lowered = text.lower()
    return any(word.lower() in lowered for word in LEXICON[kind])


def _without_relative_delay(text: str) -> str:
    """剔除「10 分钟后」这类相对延时，避免它被 HABIT（「每次」）误伤。"""
    return _ONE_TIME_DELAY_RE.sub(" ", text)


def _has_time_only(text: str) -> bool:
    return any(word in text for word in _TIME_ONLY_WORDS)


def _has_schedule_word(text: str) -> bool:
    return any(word in text for word in _TIME_SCHEDULE_WORDS)


def _is_immediate_template(text: str) -> bool:
    return any(template.match(text) for template in _IMMEDIATE_TEMPLATES)


def _has_action_verb(text: str) -> bool:
    lowered = text.lower()
    return any(verb in text for verb in _ACTION_VERBS) or any(
        re.search(rf"\b{re.escape(verb)}\b", lowered) for verb in _ACTION_VERBS_EN
    )


def classify(text: str) -> IntentVerdict:
    """判定一句话的意图类型（纯函数，不读配置、不写日志）。"""
    raw = str(text or "").strip()
    if not raw:
        return IntentVerdict(NONE)
    normalized = _strip(raw)

    # 1) 一次性相对延时：这是「现在就要建任务」，不是规则型思考。
    if _ONE_TIME_DELAY_RE.search(normalized):
        # 但若同时含「每天 / 每次」等周期词，说明是周期规则（「每天 10 分钟后」罕见，
        # 仍按 RULE 处理更安全）。
        habit_text = _without_relative_delay(normalized)
        if not any(_lexicon_hit(habit_text, kind) for kind in ("HABIT", "TIME")) or not any(
            word in habit_text for word in ("每天", "每晚", "每周", "每次", "总是")
        ):
            return IntentVerdict(NONE, "one_time_relative_delay")

    # 2) 只有时间词、没有日程语汇：属于「晚上」这类模糊时段，先澄清。
    if _has_time_only(normalized) and not _has_schedule_word(normalized):
        if not _is_immediate_template(normalized):
            return IntentVerdict(AMBIGUOUS, "time_of_day_ambiguous")

    # 3) 动态词表：HABIT 先剔除相对延时再匹配。
    for kind in ("TIME", "HABIT", "EVENT", "COND", "STATE"):
        probe = _without_relative_delay(normalized) if kind == "HABIT" else normalized
        if _lexicon_hit(probe, kind):
            # 「每天/提醒我」这类没有动作也算规则；有动作更是规则。
            return IntentVerdict(RULE, f"dynamic:{kind}")

    # 4) 立即执行模板。
    if _is_immediate_template(normalized):
        return IntentVerdict(IMMEDIATE, "immediate_template")

    # 5) 有动作动词但模板没吃掉 → 残句，需要澄清。
    if _has_action_verb(normalized):
        return IntentVerdict(AMBIGUOUS, "action_verb_with_unmatched_residual")

    return IntentVerdict(NONE)


__all__ = [
    "AMBIGUOUS",
    "DEFAULT_MODE",
    "IMMEDIATE",
    "LEXICON",
    "MODE_ENFORCE",
    "MODE_OFF",
    "MODE_SHADOW",
    "NONE",
    "RULE",
    "VALID_MODES",
    "IntentVerdict",
    "classify",
    "normalize_mode",
]
