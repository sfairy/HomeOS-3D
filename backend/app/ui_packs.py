from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request, status

DEFAULT_UI_PACK_ID = "ui.base"
TEMPLATE_ROOT = Path(__file__).resolve().parents[2] / "dashboard_templates"


@dataclass(frozen=True)
class DashboardTemplate:
    id: str
    name: str
    version: int
    description: str
    file_name: str
    preview_urls: tuple[str, ...] = ()
    preview_labels: tuple[str, ...] = ()
    canvas_width: int = 2778
    canvas_height: int = 1940

    def payload(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "previewUrls": list(self.preview_urls),
            "previewLabels": list(self.preview_labels),
            "canvasWidth": self.canvas_width,
            "canvasHeight": self.canvas_height,
        }


@dataclass(frozen=True)
class UIPack:
    id: str
    name: str
    english_name: str
    version: str
    feature_code: str
    description: str
    asset_prefix: str
    popup_template: str
    preview_url: str
    runtime_module: str
    theme_name: str
    dashboard_templates: tuple[DashboardTemplate, ...] = ()

    def payload(self, *, allowed: bool) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "englishName": self.english_name,
            "version": self.version,
            "featureCode": self.feature_code,
            "description": self.description,
            "assetPrefix": self.asset_prefix,
            "popupTemplate": self.popup_template,
            "previewUrl": self.preview_url,
            "runtimeUrl": f"/api/v1/ui-packs/{self.id}/runtime.js?v={self.version}",
            "theme": {"name": self.theme_name, "variables": {}},
            "templateVersion": 1,
            "includes": ["dashboards", "components", "popups", "assets"],
            "dashboardTemplates": [item.payload() for item in self.dashboard_templates],
            "allowed": allowed,
        }


UI_PACKS = (
    UIPack(
        id=DEFAULT_UI_PACK_ID,
        name="栖光",
        english_name="DWELL LIGHT",
        version="1.0.0",
        feature_code="ui.base",
        description="黑色界面与橙色高亮，包含现有控件、弹窗和示例素材。",
        asset_prefix="v1",
        popup_template="dwell-light",
        preview_url="/static/ui-packs/dwell-light-dashboard-cover.png",
        runtime_module="ui.base/runtime.js",
        theme_name="dashboard-v1-dark",
        dashboard_templates=(
            DashboardTemplate(
                id="dwell-light",
                name="栖光",
                version=1,
                description="栖光完整方案，包含页面、控件、弹窗、素材与实体 ID。",
                file_name="dwell-light-v1.json.gz",
                canvas_width=1852,
                canvas_height=1293,
                preview_urls=(
                    "/static/ui-packs/qiguang-preview-01-overview.png",
                    "/static/ui-packs/qiguang-preview-02-lights.png",
                    "/static/ui-packs/qiguang-preview-03-devices.png",
                    "/static/ui-packs/qiguang-preview-04-vacuum.png",
                    "/static/ui-packs/qiguang-preview-05-climate-popup.png",
                    "/static/ui-packs/qiguang-preview-06-light-popup.png",
                    "/static/ui-packs/qiguang-preview-07-light-group-popup.png",
                    "/static/ui-packs/qiguang-preview-08-temperature-popup.png",
                    "/static/ui-packs/qiguang-preview-09-vacuum-popup.png",
                ),
                preview_labels=(
                    "家庭总览",
                    "所有灯光",
                    "其它设备",
                    "扫地机器人",
                    "空调弹窗",
                    "单灯弹窗",
                    "房间灯组弹窗",
                    "温度曲线弹窗",
                    "扫地机器人弹窗",
                ),
            ),
        ),
    ),
)

UI_PACKS_BY_ID = {item.id: item for item in UI_PACKS}


def get_ui_pack(ui_pack_id: str) -> UIPack | None:
    return UI_PACKS_BY_ID.get(ui_pack_id)


def get_dashboard_template(ui_pack_id: str, template_id: str) -> DashboardTemplate | None:
    ui_pack = get_ui_pack(ui_pack_id)
    if ui_pack is None:
        return None
    return next((item for item in ui_pack.dashboard_templates if item.id == template_id), None)


def load_dashboard_template(ui_pack_id: str, template_id: str) -> tuple[DashboardTemplate, dict]:
    template = get_dashboard_template(ui_pack_id, template_id)
    if template is None:
        raise ValueError("所选仪表盘模板不存在。")
    path = (TEMPLATE_ROOT / template.file_name).resolve()
    if not (path.is_relative_to(TEMPLATE_ROOT.resolve()) and path.is_file()):
        raise RuntimeError(f"仪表盘模板文件缺失：{template.file_name}")
    with gzip.open(path, "rt", encoding="utf-8") as source:
        payload = json.load(source)
    if (
        payload.get("id") != template.id
        or payload.get("uiPackId") != ui_pack_id
        or payload.get("version") != template.version
        or not isinstance(payload.get("document"), dict)
    ):
        raise RuntimeError(f"仪表盘模板元数据无效：{template.file_name}")
    return template, payload["document"]


def get_ui_pack_for_asset_path(relative_path: str) -> UIPack | None:
    normalized = relative_path.strip("/")
    matches = [
        item
        for item in UI_PACKS
        if normalized == item.asset_prefix or normalized.startswith(f"{item.asset_prefix}/")
    ]
    return max(matches, key=lambda item: len(item.asset_prefix), default=None)


def require_ui_pack_access(request: Request, ui_pack_id: str, *, database=None) -> UIPack:
    ui_pack = get_ui_pack(ui_pack_id)
    if ui_pack is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="所选 UI 方案不存在。",
        )
    if not request.app.state.license_service.allows(ui_pack.feature_code, database=database):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "UI_PACK_RESTRICTED",
                "message": f"当前授权尚未解锁“{ui_pack.name}”。",
            },
        )
    return ui_pack
