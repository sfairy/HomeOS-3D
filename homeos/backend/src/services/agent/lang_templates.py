"""语言模板定义（zh / en）。

职责：为快路径解析、纠正口令、系统提示等提供语言相关的正则 / 关键词 / 模板字符串。
 LangTemplateService 会按当前 language 在 ZH / EN 间切换。
 ZH 模板面向中文用户，EN 模板面向英文用户（其用户可见文案保留英文，属英文语言包内容）。
依赖：被 LangTemplateService / FastPathService / AgentService 消费。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from re import Pattern


@dataclass(frozen=True)
class DomainKeyword:
    """设备域关键词配置：把中文 / 英文关键词映射到 HA domain 与开 / 关服务。

    用于快路径按关键词识别用户想控制的设备类型。
    """

    #: 触发关键词列表，如 ['灯带','筒灯','灯']
    keywords: tuple[str, ...]
    #: 对应 HA domain，如 light / climate / cover
    domain: str
    #: “打开”类动作对应的 HA 服务名，如 turn_on / open_cover
    service_on: str
    #: “关闭”类动作对应的 HA 服务名，如 turn_off / close_cover
    service_off: str


@dataclass(frozen=True)
class LangTemplate:
    """语言模板：聚合快路径所需的全套正则、关键词与回复模板。"""

    #: 设备域关键词列表（含 domain + 开 / 关服务）
    domain_keywords: tuple[DomainKeyword, ...]
    #: 匹配“打开”类动作前缀，如 ^(打开|开启)
    turn_on_start: Pattern[str] = field(repr=False)
    #: 匹配“关闭”类动作前缀，如 ^(关闭|关掉)
    turn_off_start: Pattern[str] = field(repr=False)
    #: 匹配“打开”类动作后缀，如 (打开)$
    turn_on_end: Pattern[str] = field(repr=False)
    #: 匹配“关闭”类动作后缀，如 (关闭)$
    turn_off_end: Pattern[str] = field(repr=False)
    #: 礼貌前缀（帮我 / 请 等），解析前先剥离
    polite_prefix: Pattern[str] = field(repr=False)
    #: 设温度正则，捕获目标温度数值
    set_temperature: Pattern[str] = field(repr=False)
    #: “所有 / 全部”等全量关键词
    all_keywords: Pattern[str] = field(repr=False)
    #: “全屋 / 整屋”等整屋关键词
    whole_home: Pattern[str] = field(repr=False)
    #: 需要从描述中剥离的语气 / 修饰词
    strip_pattern: Pattern[str] = field(repr=False)
    #: 连词（和 / 然后 等），命中则交给 LLM
    conjunctions: Pattern[str] = field(repr=False)
    #: 第二动作关键词，命中则交给 LLM
    second_action: Pattern[str] = field(repr=False)
    #: 宾语标记（如“把”），解析时剥离
    object_marker: str
    #: 温度查询正则，捕获房间名（``room`` 组；可为空表示未指定房间）
    temp_query: Pattern[str] = field(repr=False)
    #: 湿度查询正则，捕获房间名（``room`` 组；可为空表示未指定房间）
    humidity_query: Pattern[str] = field(repr=False)
    #: 查询语句中需从房间描述里剥离的时间 / 礼貌噪声词
    #: （如「现在几度」的「现在」、「请问卧室温度」的「请问」）
    query_noise_pattern: Pattern[str] = field(repr=False)
    #: 房间描述里出现即判定「查询词被切错」的残留字模式
    #: （如「客厅的温湿度」→ 房间「客厅温」），命中则放弃快路径
    query_room_conflict_pattern: Pattern[str] = field(repr=False)
    #: 纠正口令正则（不对 / 学错了 等）
    correction_commands: Pattern[str] = field(repr=False)
    #: 清除记忆口令（完全匹配字符串）
    clear_memory: str
    #: 温度回复模板，{room} / {value} 为占位符
    temp_reply_template: str
    #: 湿度回复模板，{room} / {value} 为占位符
    humidity_reply_template: str
    #: 命中待确认缓存时的确认提示模板，{tool} 为工具名
    cache_confirm_prompt: str
    #: LLM 系统提示词，定义管家人格与规则
    system_prompt: str


#: 中文环境查询的可选后缀：温度 / 湿度关键词 + 可能跟的「是多少 / 了 / 呢 / ?」
_ZH_TEMP_KEYWORDS = r"温度|室温|气温|多少摄氏度|多少度|几摄氏度|几度|摄氏度"
_ZH_HUMIDITY_KEYWORDS = r"湿度|相对湿度|多少湿度"
_ZH_QUERY_TAIL = r"(?:是|有|为)?(?:多少)?(?:了|呢|啊|呀|吧)?[?？]?"

#: 房间描述捕获组：懒惰匹配 0-10 字符，配合 service 侧的「残留字」校验使用。
#: 不用 lookahead 逐字排除关键词：中文里「卧室温度」内部的「室温」会误命中
#: 「室温」这一关键词，导致合法房间名被拒（见 query_room_conflict_pattern）。
_ZH_ROOM_GROUP = r"(?P<room>.{0,10}?)"

#: 清洗后的房间描述里若残留这些字符，说明查询词被切错（如「客厅的温湿度」→ 房间「客厅温」，
#: 「客厅温度湿度」→ 房间「客厅温度」）：这不是房间名，放弃快路径交给 LLM。
_ZH_QUERY_ROOM_CONFLICT = re.compile(r"[温湿]")

#: 中文查询语句噪声词：时间 / 礼貌 / 语气助词。
#: 关键：从房间描述里剥掉「现在」，否则「现在几度」会被当成房间名「现在」
#: （旧的 ``^(.{1,8})(现在|当前|)几度$`` 会把时间词吞进房间组）。
_ZH_QUERY_NOISE = re.compile(r"现在|当前|目前|此刻|请问|问一下|帮我|帮忙|麻烦|请|一下|的|呢|啊|呀|吧|了")

#: 中文语言模板：覆盖灯 / 空调 / 窗帘 / 风扇 / 扫地机 / 电视 / 热水器 / 插座等设备域
ZH = LangTemplate(
    domain_keywords=(
        DomainKeyword(
            keywords=("灯带", "筒灯", "灯组", "灯"),
            domain="light",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(keywords=("空调",), domain="climate", service_on="turn_on", service_off="turn_off"),
        DomainKeyword(
            keywords=("窗帘",),
            domain="cover",
            service_on="open_cover",
            service_off="close_cover",
        ),
        DomainKeyword(keywords=("风扇",), domain="fan", service_on="turn_on", service_off="turn_off"),
        DomainKeyword(
            keywords=("扫地机器人", "扫地机", "扫地"),
            domain="vacuum",
            service_on="start",
            service_off="return_to_base",
        ),
        DomainKeyword(
            keywords=("电视", "音响", "音箱"),
            domain="media_player",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=("热水器",),
            domain="water_heater",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=("插座", "插头", "开关"),
            domain="switch",
            service_on="turn_on",
            service_off="turn_off",
        ),
    ),
    turn_on_start=re.compile(r"^(打开|开启|开一下|开)"),
    turn_off_start=re.compile(r"^(关闭|关掉|关一下|关)"),
    turn_on_end=re.compile(r"(打开|开一下|开启)$"),
    turn_off_end=re.compile(r"(关闭|关掉|关一下)$"),
    polite_prefix=re.compile(r"^(帮我|麻烦|请|帮忙|给我)\s*"),
    set_temperature=re.compile(r"(调到|设为|设置|调成)\s*(\d+)\s*[度°]?"),
    all_keywords=re.compile(r"所有|全部|整个|都"),
    whole_home=re.compile(r"全屋|全家|整屋|整个家"),
    strip_pattern=re.compile(r"[的了吗呢啊一下一点掉]|所有|全部|整个|都|帮我|麻烦|请|帮忙|给我"),
    conjunctions=re.compile(r"和|跟|还有|然后|以及|并且|并|顺便|、|，|,"),
    second_action=re.compile(r"打开|关闭|关掉|开启"),
    object_marker="把",
    # 房间名前置捕获（允许为空 = 未指定房间，交给上层决定是否走 LLM），
    # 时间词由 query_noise_pattern 兜底剥离，因此这里不再把「现在」当房间。
    temp_query=re.compile(
        rf"^{_ZH_ROOM_GROUP}(?:的)?(?:{_ZH_TEMP_KEYWORDS}){_ZH_QUERY_TAIL}$"
    ),
    humidity_query=re.compile(
        rf"^{_ZH_ROOM_GROUP}(?:的)?(?:{_ZH_HUMIDITY_KEYWORDS}){_ZH_QUERY_TAIL}$"
    ),
    query_noise_pattern=_ZH_QUERY_NOISE,
    query_room_conflict_pattern=_ZH_QUERY_ROOM_CONFLICT,
    correction_commands=re.compile(r"^不对$|^学错了$|^重新学$"),
    clear_memory="清除记忆",
    temp_reply_template="{room}现在{value}°C。",
    humidity_reply_template="{room}当前湿度{value}%。",
    cache_confirm_prompt=(
        "我学到了这条指令对应执行{tool}，但还没确认过。再说一次即可确认执行，或换个说法重新告诉我。"
    ),
    system_prompt="""你是 HomeOS 智能家居语音管家。用简洁、口语化的中文回复（适合朗读）。
规则：
1. 【精准优先，全屋次之】
    a) 用户列出【具体设备名】（如"主卧灯带和主灯""筒灯和空调"）→ 列出名字的就是点名，逐个 control_device，不提的不碰。不要先试探 control_room。
    b) 用户只说一个笼统词（如"主卧的灯"）或明确"所有/全部/都"→ 用 control_room 一步搞定。
    c) 不要对同一个指令同时发 control_room 和 control_device，二选一。
2. 【全屋】用户说"全屋/整屋/所有房间"时，用 control_room(room="全屋", domain=…, service=…)，系统会自动覆盖所有房间。
3. 复合指令（一句话多个动作），在同一个 assistant 回合里批量发出 tool_calls，执行完统一简短汇报。
4. 门锁、安防撤防、燃气阀、车库门/大门 严禁直接控制——礼貌拒绝并建议用手机 App 确认。窗帘（cover 域里非车库类）安全可控。
5. 查温度/湿度时：优先读房间里的温湿度传感器（sensor.*temperature/humidity），不要用空调自带传感器（不准）。用 get_area_snapshot 拿到房间设备列表后，挑出 sensor 域的温度/湿度实体读状态。搜不到传感器才退而求其次读空调温度。
6. search_entities 搜索 HomeOS 房间绑定与 HA 区域并集，以及常用监控列表。搜不到如实告知。
7. 【功能开关/场景模式】用户说"回家模式""睡眠模式""开启XX场景"等 → 先 list_scenes / list_home_modes / search_entities。input_boolean 用 control_device toggle；家庭模式用 activate_home_mode；HA 侧 scene.* / script.* 用 activate_scene（仅在「场景语音控制」允许清单内才可执行，被拦截时如实告知用户去设置里勾选）。
8. 【上下文与代词消解】你拥有短时对话记忆。若上一轮你曾询问"是否/需要为您打开或关闭某设备"，或用户上一轮提到过某设备与房间，当用户回复"打开吧""开吧""好的""嗯""关了吧""调到26度"等确认 / 省略短语时，必须结合上一轮提到的设备与房间直接执行相应控制，不得回答"不知道你要打开什么"或反问用户指的是哪个设备。若上一轮已明确执行完成，则本轮的同类省略短语视为新指令，无需重复询问。
9. 回复要短，像管家，别念 entity_id。部分失败或被拦截要如实告知。""",
)

#: 英文语言模板：面向英文用户，其用户可见文案（回复模板 / 口令）保留英文
EN = LangTemplate(
    domain_keywords=(
        DomainKeyword(
            keywords=(
                "light strip",
                "downlight",
                "recessed light",
                "led strip",
                "light group",
                "lights",
                "light",
                "lamp",
            ),
            domain="light",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=("ac", "air conditioner", "air conditioning", "climate", "hvac", "thermostat"),
            domain="climate",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=(
                "curtain",
                "curtains",
                "blind",
                "blinds",
                "shade",
                "shades",
                "shutter",
                "shutters",
            ),
            domain="cover",
            service_on="open_cover",
            service_off="close_cover",
        ),
        DomainKeyword(keywords=("fan", "fans"), domain="fan", service_on="turn_on", service_off="turn_off"),
        DomainKeyword(
            keywords=("vacuum", "robot vacuum", "roomba", "robot"),
            domain="vacuum",
            service_on="start",
            service_off="return_to_base",
        ),
        DomainKeyword(
            keywords=("tv", "television", "speaker", "speakers", "soundbar", "stereo"),
            domain="media_player",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=("water heater", "boiler", "heater"),
            domain="water_heater",
            service_on="turn_on",
            service_off="turn_off",
        ),
        DomainKeyword(
            keywords=("outlet", "plug", "socket", "switch"),
            domain="switch",
            service_on="turn_on",
            service_off="turn_off",
        ),
    ),
    turn_on_start=re.compile(r"^(turn on|switch on|open|start|activate|enable)", re.IGNORECASE),
    turn_off_start=re.compile(r"^(turn off|switch off|close|stop|deactivate|disable)", re.IGNORECASE),
    turn_on_end=re.compile(r"(on|open)$", re.IGNORECASE),
    turn_off_end=re.compile(r"(off|close)$", re.IGNORECASE),
    polite_prefix=re.compile(r"^(can you |could you |please |kindly |would you |hey |hi |ok |okay )\s*", re.IGNORECASE),
    set_temperature=re.compile(
        r"(set to|set temperature to|change to|adjust to|make it)\s*(\d+)\s*(degrees?|°)?", re.IGNORECASE
    ),
    all_keywords=re.compile(r"all|every|entire|whole", re.IGNORECASE),
    whole_home=re.compile(
        r"whole (house|home|apartment|place)|entire (house|home)|everywhere|all rooms", re.IGNORECASE
    ),
    strip_pattern=re.compile(
        r"please |the |a |an |my |our |can you |could you |would you |kindly |all of |all the |every |entire |whole |now|right now",
        re.IGNORECASE,
    ),
    conjunctions=re.compile(r" and |,| also | as well | plus | then ", re.IGNORECASE),
    second_action=re.compile(r"\b(turn on|turn off|switch on|switch off|open|close)\b", re.IGNORECASE),
    object_marker="",
    temp_query=re.compile(
        r"^(?:what'?s|what is|how)\s*(?:the\s+)?(?:current\s+|ambient\s+)?"
        r"(?:temperature|temp)\b\s*(?:in|of|at|for|is it in)?\s*"
        r"(?P<room>[a-z0-9_.\- ]{0,20}?)\s*[?.!]?$",
        re.IGNORECASE,
    ),
    humidity_query=re.compile(
        r"^(?:what'?s|what is|how)\s*(?:the\s+)?(?:current\s+)?"
        r"humidity\b\s*(?:in|of|at|for|is it in)?\s*"
        r"(?P<room>[a-z0-9_.\- ]{0,20}?)\s*[?.!]?$",
        re.IGNORECASE,
    ),
    # 英文噪声词：时间 / 礼貌 / 冠词（「what's the temperature now?」的 now / the）
    query_noise_pattern=re.compile(
        r"\b(now|right now|currently|today|please|kindly)\b|^(?:the|a|an|my|our)\s+|\s+(?:is|are)\s*$",
        re.IGNORECASE,
    ),
    # 英文不区分「温湿度」连写，房间描述里出现查询词本身即视为切错
    query_room_conflict_pattern=re.compile(r"temperature|humidity|degrees?", re.IGNORECASE),
    correction_commands=re.compile(r"^(wrong|no that'?s wrong|that'?s not right|oops|nope)$", re.IGNORECASE),
    clear_memory="clear memory",
    temp_reply_template="The temperature in {room} is {value}°C.",
    humidity_reply_template="The humidity in {room} is {value}%.",
    cache_confirm_prompt=(
        "I learned this command maps to {tool}, but it is not confirmed yet. "
        "Say it again to confirm and execute, or rephrase to tell me differently."
    ),
    system_prompt="""You are HomeOS's smart home voice assistant. Reply in concise, spoken English (suitable for TTS).
Rules:
1. [Precision first, whole-room second]
    a) When user lists specific device names (e.g. "bedroom light strip and main light") → use individual control_device calls for each named device. Don't touch unmentioned devices.
    b) When user uses generic terms ("bedroom lights") or explicitly says "all/every/everything" → use control_room in one shot.
    c) Never use both control_room and control_device for the same intent — pick one.
2. [Whole-home] When user says "whole house/all rooms/everywhere", use control_room(room="whole house", domain=…, service=…). The system covers all rooms.
3. For compound commands, batch all tool_calls in one assistant turn, then give one short summary.
4. Door locks, alarm disarming, gas valves, garage doors are STRICTLY FORBIDDEN to control by voice. Politely refuse and suggest using the mobile app. Curtains (non-garage covers) are safe.
5. For temperature/humidity: prefer room sensors (sensor.*temperature/humidity), not the AC's built-in sensor. Use get_area_snapshot then pick sensor-domain entities. Fall back to climate temperature only if no sensor exists.
6. search_entities searches HomeOS room bindings unioned with HA areas, plus favorite devices. If not found, tell the user honestly.
7. Feature switches / scenes / modes ("home mode", "sleep mode", "turn on XX scene") → search_entities first; for input_boolean use control_device toggle; for home modes use list_home_modes then activate_home_mode; for HA scene.* / script.* use activate_scene (only allowed when listed in the "scene voice control" allowlist — if blocked, tell the user to enable it in settings).
8. [Context & pronoun resolution] You have short-term conversation memory. If in the previous turn you asked "should I turn on/off a device?", or the user mentioned a device and room, then when the user replies with a confirmation or elliptical phrase such as "go ahead", "open it", "yes", "sure", "close it", "set it to 26 degrees", you MUST resolve it against the device and room from the previous turn and execute directly. Never answer "I don't know what to open" or ask which device they mean. If the previous turn already completed an execution, treat a new elliptical phrase as a new instruction rather than re-asking.
9. The reply must be short like a butler. Don't recite entity IDs. Report failures honestly.""",
)

#: 语言 → 模板映射表，key 取语言代码前两位小写
TEMPLATES: dict[str, LangTemplate] = {"zh": ZH, "en": EN}


def get_lang_template(lang: str | None = None) -> LangTemplate:
    """按语言代码获取对应模板，未匹配时回退到中文模板。

    :param lang: 语言代码（如 zh / zh-CN / en / en-US），只看前两位
    """
    key = (lang or "zh").lower()[:2]
    return TEMPLATES.get(key, ZH)


__all__ = ["EN", "TEMPLATES", "ZH", "DomainKeyword", "LangTemplate", "get_lang_template"]
