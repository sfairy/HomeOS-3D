"""不可信 XML 解析回归：DTD / 实体必须被拒绝。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from xml.etree.ElementTree import ParseError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.security.xml_safe import safe_fromstring


class SafeXmlParseTest(unittest.TestCase):
    def test_plain_xml_is_parsed(self) -> None:
        root = safe_fromstring("<xml><ToUserName>corp</ToUserName></xml>")
        self.assertEqual(root.tag, "xml")
        self.assertEqual(root.findtext("ToUserName"), "corp")

    def test_doctype_is_rejected(self) -> None:
        payload = b'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>'
        with self.assertRaises(ParseError) as caught:
            safe_fromstring(payload)
        self.assertIn("不允许的构造", str(caught.exception))

    def test_entity_expansion_is_rejected(self) -> None:
        payload = b'<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><lolz>&lol2;</lolz>'
        with self.assertRaises(ParseError):
            safe_fromstring(payload)

    def test_malformed_xml_raises_parse_error(self) -> None:
        with self.assertRaises(ParseError):
            safe_fromstring("<xml><unclosed></xml>")


if __name__ == "__main__":
    unittest.main()
