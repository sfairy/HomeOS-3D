#!/usr/bin/env python3
"""API / 页面契约断言：优化不得改变既有响应字段与状态码语义。

只对隔离实例运行。ETag 是本次新增的可选能力：基线没有 ETag 时记为 skipped，
有 ETag 时必须返回 304 且空 body。
"""
from __future__ import annotations

import argparse
import json
from typing import Any

from perf_common import http_get, json_get, load_env, result_dir, write_json


class Checks:
    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def record(self, name: str, ok: bool, detail: Any = None, *, skipped: bool = False) -> None:
        self.items.append({"name": name, "ok": ok, "skipped": skipped, "detail": detail})
        print(("SKIP " if skipped else "PASS " if ok else "FAIL ") + name)

    def expect(self, name: str, condition: bool, detail: Any = None) -> None:
        self.record(name, bool(condition), detail)


def _etag_probe(checks: Checks, name: str, url: str, cookie: str) -> None:
    first = http_get(url, cookie=cookie)
    etag = first["headers"].get("etag", "")
    if not etag:
        checks.record(f"{name}:etag", True, {"reason": "基线无 ETag（可选项）"}, skipped=True)
        return
    checks.expect(f"{name}:etag-present", bool(etag), {"etag": etag})
    second = http_get(url, cookie=cookie, headers={"If-None-Match": etag})
    checks.expect(f"{name}:conditional-304", second["status"] == 304,
                  {"status": second["status"], "bytes": second["bytes"]})
    checks.expect(f"{name}:conditional-empty-body", second["bytes"] == 0, {"bytes": second["bytes"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    args = parser.parse_args()
    env = load_env(args.label)
    homeos = env["homeos"]
    store = env["store"]
    homeos_base = f"http://127.0.0.1:{homeos['port']}"
    store_base = f"http://127.0.0.1:{store['port']}"
    cookie = str(homeos["token"])
    project_id = homeos["projectId"]
    checks = Checks()

    ready = json_get(f"{homeos_base}/health/ready")
    checks.expect("homeos:health-ready", ready["status"] == 200 and ready.get("json", {}).get("status") == "ready",
                  {"status": ready["status"], "json": ready.get("json")})
    config = json_get(f"{homeos_base}/api/v1/public/config")
    checks.expect("homeos:public-config", config["status"] == 200 and isinstance(config.get("json"), dict),
                  {"status": config["status"]})
    index = http_get(f"{homeos_base}/")
    checks.expect("homeos:index-html", index["status"] == 200 and b"<html" in index["body"].lower(),
                  {"status": index["status"], "bytes": index["bytes"]})

    unauth = http_get(f"{homeos_base}/api/v1/projects")
    checks.expect("homeos:auth-required", unauth["status"] in (401, 403),
                  {"status": unauth["status"], "body": unauth["body"][:200].decode("utf-8", "replace")})

    projects = json_get(f"{homeos_base}/api/v1/projects", cookie=cookie)
    checks.expect("homeos:projects-200", projects["status"] == 200, {"status": projects["status"]})
    checks.expect("homeos:projects-shape", isinstance(projects.get("json", {}).get("items"), list),
                  {"keys": list((projects.get("json") or {}).keys())})

    draft_url = f"{homeos_base}/api/v1/projects/{project_id}/draft"
    draft = json_get(draft_url, cookie=cookie)
    draft_json = draft.get("json") or {}
    checks.expect("homeos:draft-200", draft["status"] == 200, {"status": draft["status"]})
    checks.expect("homeos:draft-keys",
                  all(key in draft_json for key in ("projectId", "schemaVersion", "revision",
                                                    "globalPopupRevision", "document", "updatedAt")),
                  {"keys": sorted(draft_json.keys())})
    checks.expect("homeos:draft-project-id", draft_json.get("projectId") == project_id,
                  {"projectId": draft_json.get("projectId")})
    checks.expect("homeos:draft-document-object", isinstance(draft_json.get("document"), dict),
                  {"documentType": type(draft_json.get("document")).__name__})
    _etag_probe(checks, "homeos:draft", draft_url, cookie)

    revision_url = f"{homeos_base}/api/v1/projects/{project_id}/revision"
    revision = json_get(revision_url, cookie=cookie)
    checks.expect("homeos:revision-200", revision["status"] == 200, {"status": revision["status"]})
    checks.expect("homeos:revision-shape", isinstance(revision.get("json", {}).get("revision"), int),
                  {"json": revision.get("json")})

    for asset_name in ("version", "builtin", "user"):
        asset_url = f"{homeos_base}/api/v1/assets/{asset_name}"
        response = json_get(asset_url, cookie=cookie)
        checks.expect(f"homeos:assets-{asset_name}-200", response["status"] == 200,
                      {"status": response["status"]})
        checks.expect(f"homeos:assets-{asset_name}-json", response.get("json") is not None,
                      {"bytes": response["bytes"]})
        _etag_probe(checks, f"homeos:assets-{asset_name}", asset_url, cookie)

    entities = json_get(f"{homeos_base}/api/v1/ha/entities?limit=5", cookie=cookie)
    checks.expect("homeos:ha-entities-200", entities["status"] == 200, {"status": entities["status"]})
    checks.expect("homeos:ha-entities-items", isinstance(entities.get("json", {}).get("items"), list),
                  {"keys": list((entities.get("json") or {}).keys())})

    stage_url = f"{homeos_base}/api/v1/modules/interaction3d/stage.html?sceneId={homeos['sceneId']}&projectId={project_id}"
    stage_unauth = http_get(stage_url)
    checks.expect("homeos:stage-auth-required", stage_unauth["status"] in (401, 403),
                  {"status": stage_unauth["status"]})
    stage = http_get(stage_url, cookie=cookie)
    checks.expect("homeos:stage-200", stage["status"] == 200, {"status": stage["status"]})
    checks.expect("homeos:stage-html", b"interaction3d-stage" in stage["body"],
                  {"bytes": stage["bytes"]})

    store_ready = json_get(f"{store_base}/healthz")
    checks.expect("store:healthz", store_ready["status"] == 200 and store_ready.get("json", {}).get("status") == "ok",
                  {"status": store_ready["status"]})
    products_url = f"{store_base}/store/v1/products"
    products = json_get(products_url)
    checks.expect("store:products-200", products["status"] == 200, {"status": products["status"]})
    checks.expect("store:products-items", isinstance(products.get("json", {}).get("items"), list),
                  {"count": len((products.get("json") or {}).get("items", []))})
    _etag_probe(checks, "store:products", products_url, "")
    store_index = http_get(f"{store_base}/")
    checks.expect("store:index-html", store_index["status"] == 200 and b"<html" in store_index["body"].lower(),
                  {"status": store_index["status"], "bytes": store_index["bytes"]})

    failed = [item for item in checks.items if not item["ok"] and not item["skipped"]]
    output = {
        "label": args.label,
        "passed": len(checks.items) - len(failed),
        "failed": len(failed),
        "skipped": len([item for item in checks.items if item["skipped"]]),
        "items": checks.items,
    }
    write_json(result_dir(args.label) / "contracts.json", output)
    if failed:
        print(f"契约失败 {len(failed)} 项：{json.dumps(failed, ensure_ascii=False)[:4000]}")
        raise SystemExit(1)
    print(f"契约全部通过（{output['passed']} 项，跳过 {output['skipped']} 项）")


if __name__ == "__main__":
    main()
