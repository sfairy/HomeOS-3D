"""不可信 XML 的统一解析入口。

企微回调、SVG 上传等输入都是外部可控 XML。标准库 xml.etree.ElementTree 默认会展开
内部实体、允许外部实体声明，历史上因此出过 XXE 与实体膨胀（billion laughs）。调用点各自
写 noqa: S314 只是把风险标注出来，并没有真正关掉解析器能力。

这里统一走 defusedxml：它保留 ElementTree 的 API，但对 DTD / 实体声明直接拒绝。
为了让现有调用点的 except ET.ParseError 保持有效，把 defusedxml 的拒绝异常转换成
同一个 xml.etree.ElementTree.ParseError —— 调用方无需知道底层换了实现。
"""

from __future__ import annotations

from xml.etree.ElementTree import Element, ParseError

from defusedxml import ElementTree as _defused_element_tree
from defusedxml.common import DefusedXmlException


def safe_fromstring(source: str | bytes) -> Element:
    """解析不可信 XML；DTD / 实体声明一律拒绝，并统一抛 ParseError。"""
    try:
        return _defused_element_tree.fromstring(source)
    except DefusedXmlException as error:
        raise ParseError(f"XML 包含不允许的构造：{error}") from error
