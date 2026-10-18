"""go2rtc 中继取址：服务端权威解析、授权与地址白名单的拒绝语义。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from src.api.go2rtc import saved_camera_target
from src.domains.proxy.go2rtc_target import normalize_go2rtc_target
from src.platform.core.models import ProjectDraft

from tests.studio3d_helpers import dispose, new_database

RAW_TARGET = "http://192.168.1.50:1984/stream.html?src=cam1"
PROJECT_ID = "project-1"
COMPONENT_ID = "dash-camera"


def _camera_document(*, visible=True, source="go2rtc", url=RAW_TARGET):
    return {
        "sharedComponents": [
            {
                "id": COMPONENT_ID,
                "type": "interaction3d",
                "properties": {
                    "security": {
                        "cameras": [
                            {
                                "id": "cam-1",
                                "visible": visible,
                                "cameraSource": source,
                                "go2rtcUrl": url,
                            }
                        ]
                    }
                },
            }
        ],
        "pages": [],
    }


class _FakeWebSocket:
    def __init__(self, factory, *, allows=True, project_id=PROJECT_ID, camera_id="cam-1"):
        license_service = SimpleNamespace(allows=lambda _feature: allows)
        state = SimpleNamespace(
            database=SimpleNamespace(session_factory=factory),
            license_service=license_service,
        )
        self.app = SimpleNamespace(state=state)
        self.query_params = {
            "projectId": project_id,
            "componentId": COMPONENT_ID,
            "cameraId": camera_id,
        }


class SavedCameraTargetTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.factory = new_database(Path(self._tmp.name) / "go2rtc.db")

    def tearDown(self) -> None:
        dispose(self.factory)
        self._tmp.cleanup()

    def _write_draft(self, document: dict, project_id: str = PROJECT_ID) -> None:
        with self.factory() as session:
            session.add(
                ProjectDraft(
                    project_id=project_id,
                    document_json=json.dumps(document),
                    updated_by="user-1",
                )
            )
            session.commit()

    def test_resolves_saved_lan_target_to_signaling_url(self) -> None:
        self._write_draft(_camera_document())
        target = saved_camera_target(_FakeWebSocket(self.factory), object())
        self.assertEqual(target, normalize_go2rtc_target(RAW_TARGET))
        self.assertTrue(target.startswith("ws://192.168.1.50:1984/api/ws?src=cam1"))

    def test_license_denied_raises(self) -> None:
        self._write_draft(_camera_document())
        with self.assertRaisesRegex(ValueError, "授权不可用"):
            saved_camera_target(_FakeWebSocket(self.factory, allows=False), object())

    def test_hidden_camera_raises(self) -> None:
        self._write_draft(_camera_document(visible=False))
        with self.assertRaisesRegex(ValueError, "摄像头已隐藏"):
            saved_camera_target(_FakeWebSocket(self.factory), object())

    def test_missing_draft_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "请先保存 go2rtc 摄像头配置"):
            saved_camera_target(_FakeWebSocket(self.factory), object())

    def test_non_go2rtc_source_raises(self) -> None:
        self._write_draft(_camera_document(source="rtsp"))
        with self.assertRaisesRegex(ValueError, "未选择 go2rtc 来源"):
            saved_camera_target(_FakeWebSocket(self.factory), object())

    def test_public_ip_target_rejected(self) -> None:
        self._write_draft(_camera_document(url="http://8.8.8.8:1984/stream.html?src=cam1"))
        with self.assertRaisesRegex(ValueError, "只支持局域网 IP"):
            saved_camera_target(_FakeWebSocket(self.factory), object())

    def test_unknown_component_raises(self) -> None:
        self._write_draft(_camera_document())
        websocket = _FakeWebSocket(self.factory)
        websocket.query_params["componentId"] = "missing"
        with self.assertRaisesRegex(ValueError, "请先保存 go2rtc 摄像头配置"):
            saved_camera_target(websocket, object())
