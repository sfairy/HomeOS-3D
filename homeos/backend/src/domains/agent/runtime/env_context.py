"""家庭环境上下文：把「现在几点 / 农历 / 天气 / 何时日落」注入系统提示。

对齐 Nest ``getHomeEnvironmentContext()`` 与 ``getSystemTimeAndCalendarContext()``。
模型不能读时钟，缺少这段上下文时「半小时后关灯」「明天要带伞吗」这类相对时间
与本地天气指令只能靠猜；任何一环（时区 / 天气实体 / 预报接口）缺失都安静降级，
绝不因为某个实体不存在就让整轮对话失败。

三段结构：
1. 基准时间（公历 + 星期 + 农历 + 明日预知 + 时间铁律）—— 纯内存计算；
2. 家庭所在城市与本地气象（实况 + 三日预报）—— 预报要问 HA，带 TTL 缓存；
3. 规则指引 —— 告诉模型「本地天气直接用、别去联网搜」。
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .lunar_calendar import lunar_text
from ....platform.core.db.json_field import object_field

logger = logging.getLogger("homeos.agent.env_context")

#: 星期名（中文 / 英文）
_WEEKDAYS_ZH = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
_WEEKDAYS_EN = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

#: 实体 id 后缀 → 中文城市名（`weather.chengdu` 这类命名在中文家庭里很常见）
_CITY_BY_SUFFIX: dict[str, str] = {
    "chengdu": "成都",
    "beijing": "北京",
    "shanghai": "上海",
    "shenzhen": "深圳",
    "guangzhou": "广州",
    "hangzhou": "杭州",
    "wuhan": "武汉",
    "chongqing": "重庆",
    "nanjing": "南京",
    "xian": "西安",
    "changsha": "长沙",
    "tianjin": "天津",
    "suzhou": "苏州",
    "zhengzhou": "郑州",
    "dongguan": "东莞",
    "foshan": "佛山",
    "ningbo": "宁波",
    "qingdao": "青岛",
    "wuxi": "无锡",
    "hefei": "合肥",
}

#: ``(lat_min, lat_max, lon_min, lon_max, city)``：家庭坐标落在框内时的兜底
_CITY_BOXES: tuple[tuple[float, float, float, float, str], ...] = (
    (30.0, 31.5, 103.5, 105.0, "成都"),
    (39.5, 40.5, 116.0, 117.0, "北京"),
    (31.0, 31.8, 121.0, 122.2, "上海"),
    (22.4, 22.9, 113.7, 114.5, "深圳"),
    (22.8, 23.5, 113.0, 113.8, "广州"),
    (30.1, 30.5, 119.9, 120.5, "杭州"),
    (30.4, 30.8, 114.1, 114.6, "武汉"),
    (29.4, 29.9, 106.3, 106.8, "重庆"),
    (31.2, 31.5, 118.6, 119.0, "南京"),
    (34.1, 34.5, 108.7, 109.1, "西安"),
)

#: 城市名里会拼在「市」前面的修饰词（``成都天气`` → ``成都``）
_CITY_TRIM = ("天气", "气象", "实时")

#: 三日预报缓存：成功 10 分钟，失败 1 分钟（别把 HA 打穿，也别卡住一分钟的问答）
_FORECAST_TTL = 600.0
_FORECAST_FAILURE_TTL = 60.0

#: HA ``weather`` 实体的机器状态 → 中文口语描述（实体没给 ``condition_desc`` 时用）
_CONDITION_ZH: dict[str, str] = {
    "sunny": "晴",
    "clear-night": "晴（夜间）",
    "partlycloudy": "晴间多云",
    "cloudy": "多云",
    "rainy": "雨",
    "pouring": "暴雨",
    "lightning": "雷电",
    "lightning-rainy": "雷阵雨",
    "snowy": "雪",
    "snowy-rainy": "雨夹雪",
    "fog": "雾",
    "hail": "冰雹",
    "windy": "大风",
    "windy-variant": "大风",
    "exceptional": "极端天气",
}


def _zone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(str(timezone_name or "").strip() or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        logger.debug("家庭时区不可用，回退 UTC: %s", timezone_name)
        return ZoneInfo("UTC")


def _fmt_time(raw: Any) -> str:
    """把 HA 的 ISO 时间压成 ``HH:MM``；非法值返回空串。"""
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        logger.debug("天气 / 太阳时间格式非法: %s", text)
        return ""
    return moment.strftime("%H:%M")


def _temp(value: Any) -> str:
    """数值型温度 → ``21°C``；布尔 / 字符串 / 缺省一律空串。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return ""
    return f"{round(float(value))}°C"


def _degree(value: Any) -> str:
    """数值型温度 → ``21``（拼 ``15~24°C`` 这种区间时用）；非法值空串。"""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return ""
    return f"{round(float(value))}"


def _condition_text(state: str, attrs: dict[str, Any], english: bool) -> str:
    """优先用实体自带的 ``condition_desc``（中文彩云插件常给），否则翻译机器状态。"""
    described = str(attrs.get("condition_desc") or "").strip()
    if described:
        return described
    raw = str(state or "").strip()
    if english:
        return raw
    return _CONDITION_ZH.get(raw.lower(), raw)


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _has_cjk(text: str) -> bool:
    """名字里有没有汉字（用来判断天气实体是不是「给中国家庭命名」的）。"""
    return any("\u4e00" <= char <= "\u9fff" for char in str(text or ""))


class HomeEnvironmentContextService:
    """拼装系统提示里的环境段落（读内存实体 + 可选的一次 HA 预报调用）。"""

    def __init__(
        self,
        state_store: Any = None,
        app_config: Any = None,
        command_proxy: Any = None,
    ) -> None:
        self._state_store = state_store
        self._app_config = app_config
        self._command_proxy = command_proxy
        # (entity_id, 取的时刻, 预报列表)；失败时列表为空并只缓存 1 分钟
        self._forecast_cache: tuple[str, float, list[dict[str, Any]]] = ("", 0.0, [])
        self._forecast_cache_ttl = 0.0

    # ── 配置 / 实体读取 ────────────────────────────────────────────────

    def timezone_name(self) -> str:
        """家庭时区（``ops.homeTimezone``）；未配置时返回空串。"""
        try:
            ops = self._app_config.get("ops") if self._app_config is not None else None
            return str((ops or {}).get("homeTimezone") or "").strip()
        except Exception as exc:
            logger.debug("读取家庭时区失败: %s", exc)
            return ""

    def _entities_in_domain(self, domain: str) -> list[dict[str, Any]]:
        if self._state_store is None:
            return []
        try:
            entities = self._state_store.get_all()
        except Exception as exc:
            logger.debug("读取实体列表失败: %s", exc)
            return []
        prefix = f"{domain}."
        return [
            entity
            for entity in entities or []
            if isinstance(entity, dict) and str(entity.get("entity_id") or "").startswith(prefix)
        ]

    def _find_first(self, domain: str) -> dict[str, Any] | None:
        found = self._entities_in_domain(domain)
        return found[0] if found else None

    def _weather_entity(self) -> dict[str, Any] | None:
        """优先用「昼夜节律」里绑定的天气实体，否则取第一个中文名的 weather 实体。"""
        configured = ""
        try:
            circadian = self._app_config.get("circadian") if self._app_config is not None else None
            configured = str((circadian or {}).get("weatherEntityId") or "").strip()
        except Exception as exc:
            logger.debug("读取天气实体绑定失败: %s", exc)
        if configured and self._state_store is not None:
            try:
                entity = self._state_store.get(configured)
            except Exception as exc:
                logger.debug("读取天气实体失败: %s", exc)
                entity = None
            if isinstance(entity, dict):
                return entity
        candidates = self._entities_in_domain("weather")
        # 没显式绑定：先挑有中文名的实体（参考实现口径），挑不到才退回第一个
        for entity in candidates:
            if _has_cjk(object_field(entity, "attributes").get("friendly_name")):
                return entity
        return candidates[0] if candidates else None

    def _sun(self) -> tuple[str, str]:
        entity = self._find_first("sun")
        attrs = object_field(entity, "attributes") if entity else {}
        return _fmt_time(attrs.get("next_dawn")), _fmt_time(attrs.get("next_dusk"))

    # ── 城市推断（三层：实体名 → 实体 id → 家庭坐标） ────────────────────

    def _city_from_name(self, entity: dict[str, Any] | None) -> str:
        attrs = object_field(entity, "attributes") if entity else {}
        name = str(attrs.get("friendly_name") or "").strip()
        if not name:
            return ""
        for suffix in _CITY_TRIM:
            index = name.find(suffix)
            if index >= 2:
                return name[:index].strip()[:6]
        for suffix in ("市", "区", "县"):
            index = name.find(suffix)
            if index >= 2:
                return name[:index].strip()[:6]
        return ""

    def _city_from_entity_id(self, entity: dict[str, Any] | None) -> str:
        entity_id = str((entity or {}).get("entity_id") or "")
        if "." not in entity_id:
            return ""
        suffix = entity_id.split(".", 1)[1].strip().lower()
        # ``weather.chengdu_weather`` / ``weather.wuhan`` 都取第一段
        for token in (suffix, suffix.split("_")[0]):
            city = _CITY_BY_SUFFIX.get(token)
            if city:
                return city
        return ""

    def _home_coordinates(self) -> tuple[float, float] | None:
        """家庭坐标：沿用地震预警配置里已经填好的经纬度，避免再要用户填一遍。"""
        try:
            layout = self._app_config.get("layout") if self._app_config is not None else None
            quake = (layout or {}).get("earthquakeConfig") if isinstance(layout, dict) else None
            lat = _num((quake or {}).get("latitude"))
            lon = _num((quake or {}).get("longitude"))
        except Exception as exc:
            logger.debug("读取家庭坐标失败: %s", exc)
            return None
        if lat is None or lon is None:
            return None
        return lat, lon

    def _city_from_coordinates(self) -> str:
        coordinates = self._home_coordinates()
        if coordinates is None:
            return ""
        lat, lon = coordinates
        for lat_min, lat_max, lon_min, lon_max, city in _CITY_BOXES:
            if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
                return city
        return ""

    def resolve_city(self, entity: dict[str, Any] | None = None) -> str:
        """家庭所在城市；三层都推不出来时返回空串（提示里就用「本地」）。"""
        weather = entity if entity is not None else self._weather_entity()
        return self._city_from_name(weather) or self._city_from_entity_id(weather) or self._city_from_coordinates()

    # ── 三日预报（异步、带 TTL 缓存） ───────────────────────────────────

    def _cached_forecast(self, entity_id: str) -> list[dict[str, Any]] | None:
        cached_id, cached_at, cached = self._forecast_cache
        if cached_id != entity_id:
            return None
        if time.monotonic() - cached_at > self._forecast_cache_ttl:
            return None
        return cached

    async def _forecast(self, entity: dict[str, Any] | None) -> list[dict[str, Any]]:
        entity_id = str((entity or {}).get("entity_id") or "")
        if not entity_id or self._command_proxy is None:
            return []
        cached = self._cached_forecast(entity_id)
        if cached is not None:
            return cached
        try:
            response = await self._command_proxy.call_service(
                {
                    "domain": "weather",
                    "service": "get_forecasts",
                    "entity_id": entity_id,
                    "service_data": {"type": "daily"},
                    "return_response": True,
                },
                policy="agent",
            )
        except Exception as exc:
            logger.debug("拉取天气预报失败: %s", exc)
            self._remember_forecast(entity_id, [], _FORECAST_FAILURE_TTL)
            return []
        forecast = self._extract_forecast(response, entity_id)
        self._remember_forecast(entity_id, forecast, _FORECAST_TTL if forecast else _FORECAST_FAILURE_TTL)
        return forecast

    def _remember_forecast(self, entity_id: str, forecast: list[dict[str, Any]], ttl: float) -> None:
        self._forecast_cache = (entity_id, time.monotonic(), forecast)
        self._forecast_cache_ttl = ttl

    @staticmethod
    def _extract_forecast(response: Any, entity_id: str) -> list[dict[str, Any]]:
        """从 HA ``return_response`` 的嵌套结构里挖出 ``forecast`` 列表。

        代理把 HA 响应裹在 ``data`` 里；``get_forecasts`` 再按实体 id 分桶。
        任何一层不符合预期都返回空列表 —— 预报是锦上添花，不该抛异常。
        """
        node: Any = response
        for key in ("data", "service_response"):
            if isinstance(node, dict) and isinstance(node.get(key), dict):
                node = node[key]
        if isinstance(node, dict) and isinstance(node.get(entity_id), dict):
            node = node[entity_id]
        forecast = node.get("forecast") if isinstance(node, dict) else None
        return [item for item in forecast if isinstance(item, dict)] if isinstance(forecast, list) else []

    # ── 段落拼装 ───────────────────────────────────────────────────────

    def _time_lines(self, lang: str, moment: datetime, tz_label: str) -> list[str]:
        english = str(lang).lower().startswith("en")
        today_solar, today_lunar = moment.date(), lunar_text(moment.date())
        tomorrow = moment.date() + timedelta(days=1)
        tomorrow_lunar = lunar_text(tomorrow)
        clock = moment.strftime("%H:%M:%S")

        if english:
            lines = ["[Objective reference time & calendar]"]
            line = f"- Today: {today_solar.isoformat()} ({_WEEKDAYS_EN[moment.weekday()]}) {clock}{tz_label}"
            lines.append(line + (f", {today_lunar}." if today_lunar else "."))
            lines.append(
                f"- Tomorrow: {tomorrow.isoformat()} ({_WEEKDAYS_EN[tomorrow.weekday()]})"
                + (f", {tomorrow_lunar}." if tomorrow_lunar else ".")
            )
            lines.append(
                '- Time rule: every "today / tomorrow / yesterday / weekday / now / lunar date" '
                "inference must be derived from the reference time above; never invent a date."
            )
            return lines

        lines = ["【当前系统客观基准时间与日历感知】："]
        if today_lunar:
            lines.append(
                f"- 今日时间：公历 {today_solar:%Y年%m月%d日} {_WEEKDAYS_ZH[moment.weekday()]} {clock}{tz_label}，{today_lunar}。"
            )
        else:
            lines.append(
                f"- 今日时间：公历 {today_solar:%Y年%m月%d日} {_WEEKDAYS_ZH[moment.weekday()]} {clock}{tz_label}。"
            )
        tomorrow_text = f"- 明日预知：公历 {tomorrow:%Y年%m月%d日} {_WEEKDAYS_ZH[tomorrow.weekday()]}"
        lines.append(tomorrow_text + (f"，{tomorrow_lunar}。" if tomorrow_lunar else "。"))
        lines.append(
            "- 时间感知铁律：所有的“今天、明天、昨天、后天、周几、星期几、当前时刻、农历”"
            "等时间推断，必须严格以此客观基准时间为唯一真理进行推算，严禁产生年份、星期或日期幻觉。"
        )
        return lines

    @staticmethod
    def _current_weather_text(attrs: dict[str, Any], state: str, english: bool) -> str:
        condition = _condition_text(state, attrs, english)
        temperature = _temp(attrs.get("temperature"))
        high, low = _degree(attrs.get("temphigh")), _degree(attrs.get("templow"))
        humidity = attrs.get("humidity")
        parts: list[str] = []
        if condition:
            parts.append(("outdoor " if english else "当前本地实时气象：") + condition)
        if temperature:
            parts.append(("now " if english else "当前气温 ") + temperature)
        if high and low:
            parts.append(f"today {low}~{high}°C" if english else f"今日 {low}~{high}°C")
        if isinstance(humidity, (int, float)) and not isinstance(humidity, bool):
            parts.append(("humidity " if english else "湿度 ") + f"{round(float(humidity))}%")
        if not parts:
            return ""
        return "; ".join(parts) + "." if english else "，".join(parts) + "。"

    def _forecast_line(self, forecast: list[dict[str, Any]], today: date, english: bool) -> str:
        """把三日预报压成一行；日期早于今天的条目丢弃。

        「今日 / 明天 / 后天」按**日期差**取，而不是按列表下标 —— HA 的预报常从
        昨天开始返回，按下标会把明天的天气说成「今日」。
        """
        labels = {0: ("Today", "今日"), 1: ("Tomorrow", "明天"), 2: ("D+2", "后天")}
        chunks: list[str] = []
        for item in forecast:
            day_text = str(item.get("datetime") or "")[:10]
            try:
                day_date = date.fromisoformat(day_text)
            except ValueError:
                logger.debug("天气预报日期字段非法，跳过该天: %r", day_text)
                continue
            offset = (day_date - today).days
            if offset < 0 or offset > 2:
                continue
            condition = _condition_text(str(item.get("condition") or "cloudy"), {}, english) or "多云"
            low, high = _degree(item.get("templow")), _degree(item.get("temperature"))
            span = f"{low}~{high}°C" if low and high else (f"{high}°C" if high else f"{low}°C")
            rain = item.get("precipitation")
            rain_text = ""
            if isinstance(rain, (int, float)) and not isinstance(rain, bool) and float(rain) > 0:
                rain_text = f", rain ~{float(rain):g}mm" if english else f"，降水约{float(rain):g}mm"
            english_label, chinese_label = labels[offset]
            label = english_label if english else chinese_label
            join = ", " if english else "，"
            chunks.append(f"{label}({day_text[5:]}): {condition}{join}{span}{rain_text}")
        if not chunks:
            return ""
        joiner = "; " if english else "；"
        head = "Local forecast: " if english else "- 本地未来多日预报："
        return head + joiner.join(chunks) + ("." if english else "。")

    def _weather_lines(
        self,
        lang: str,
        entity: dict[str, Any] | None,
        forecast: list[dict[str, Any]],
        today: date,
    ) -> list[str]:
        english = str(lang).lower().startswith("en")
        city = self.resolve_city(entity)
        label = city or ("local area" if english else "本地")
        attrs = object_field(entity, "attributes") if entity else {}
        state = str((entity or {}).get("state") or "").strip()

        if english:
            lines = ["[Home location & local weather]"]
            lines.append(f"- Home city: {label}. Unspecified weather/travel questions default to {label}.")
        else:
            lines = ["【家庭物理所在地与本地天气感知】："]
            lines.append(
                f"- 家庭所在城市：{label}（用户若未指明城市询问天气、出行、气温、冷热、穿衣、带伞等，一律默认指{label}）。"
            )
        current = self._current_weather_text(attrs, state, english)
        if current:
            lines.append(f"- {current}")
        for attr, prefix in (
            ("forecast_minutely", "短时预警" if not english else "Nowcast"),
            ("forecast_keypoint", "气象提示" if not english else "Weather note"),
            ("forecast_hourly", "生活指引" if not english else "Lifestyle tip"),
        ):
            value = str(attrs.get(attr) or "").strip()
            if value:
                lines.append(f"- {prefix}：{value}" if not english else f"- {prefix}: {value}")
        dawn, dusk = self._sun()
        if dawn and dusk:
            lines.append(
                f"- 昼夜：日出 {dawn}，日落 {dusk}。" if not english else f"- Daylight: sunrise {dawn}, sunset {dusk}."
            )
        forecast_line = self._forecast_line(forecast, today, english)
        if forecast_line:
            lines.append(forecast_line)
        if english:
            lines.append(
                "- Rule: answer local weather / clothing / umbrella questions straight from the data above; "
                "only search the web for other cities or long-range forecasts."
            )
        else:
            lines.append(
                "- 规则指引：若用户询问今天、明天、后天或近期天气、冷热、穿衣、带伞等，"
                "直接根据上述本地气象与多日预报回答即可（无需发起网络搜索）；"
                "只有当用户询问外地城市天气或超长周期时才调用 web_search 检索。"
            )
        return lines

    async def build(self, lang: str = "zh", now: datetime | None = None) -> str:
        """生成环境段落；无任何有效信息时返回空串。"""
        try:
            tz_name = self.timezone_name()
            moment = (now or datetime.now(_zone(tz_name))).astimezone(_zone(tz_name))
            english = str(lang).lower().startswith("en")
            tz_label = self._timezone_label(tz_name, english)
            entity = self._weather_entity()
            forecast = await self._forecast(entity)
            lines = self._time_lines(lang, moment, tz_label)
            lines.append("")
            lines.extend(self._weather_lines(lang, entity, forecast, moment.date()))
            return "\n".join(line for line in lines if line is not None)
        except Exception:
            logger.debug("生成家庭环境上下文失败", exc_info=True)
            return ""

    @staticmethod
    def _timezone_label(tz_name: str, english: bool = False) -> str:
        """时区提示语：北京时间单独点名，其它时区直接用 IANA 名。"""
        if english:
            if tz_name == "Asia/Shanghai":
                return " (UTC+8)"
            return f" ({tz_name})" if tz_name else ""
        if tz_name == "Asia/Shanghai":
            return "（北京时间/东八区）"
        return f"（{tz_name}）" if tz_name else ""


__all__ = ["HomeEnvironmentContextService"]
