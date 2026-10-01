import json, os
REC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
_data = json.load(open(os.path.join(REC, ".work/faith2.json")))
# faith_objects.py 现行输出是 {"objects":[...],"modules":[...],"unmatched":[...]}；
# 旧版是裸 list。两种都兼容，避免这个工具随 schema 变更而静默失效。
rows = _data["objects"] if isinstance(_data, dict) else _data
unmatched = _data.get("unmatched", []) if isinstance(_data, dict) else []
assigned = {
 "backend/app/license/service.py::_mark_revoked","backend/app/license/service.py::stop",
 "backend/app/license/hardware.py::_persistent_fallback_identity","backend/app/license/hardware.py::hardware_identity","backend/app/license/hardware.py::_board_identity",
 "backend/app/admin_account.py::AdminAccountStore._write",
 "backend/app/ha/service.py::_apply_snapshot","backend/app/ha/client.py::HAClient._authenticate","backend/app/ha/percentage_sources.py::percentage_sources",
 "backend/app/api/ha_proxy.py::_refresh_camera_snapshot","backend/app/panel/schema.py::PanelDocument.validate_structure","backend/app/panel/template_entities.py::_entity_replacements",
 "backend/app/modules/interaction3d/config.py::validate_config","backend/app/modules/interaction3d/config.py::validate_config.<locals>.validate_camera",
 "backend/app/modules/interaction3d/device.py::validate_device_bindings","backend/app/modules/interaction3d/device_entities.py::<module>",
 "backend/app/modules/interaction3d/lock.py::validate_lock_bindings","backend/app/modules/interaction3d/access.py::access_grant",
 "backend/app/modules/interaction3d/api.py::snapshot_scene","backend/app/modules/interaction3d/render_cache.py::write_cache",
 "backend/app/api/icons.py::icons","backend/app/api/assets.py::validate_and_sanitize_uploaded_svg","backend/app/api/assets.py::read_effect_variant",
 "backend/app/api/auth.py::login","backend/app/api/studio3d.py::update_studio3d_draft","backend/app/embedding.py::embedded_devices",
 "backend/app/dependencies.py::ViewerPrincipal.displays","backend/app/updates.py::UpdateChecker.__init__","backend/app/updates.py::UpdateChecker.status",
 "backend/app/migrations.py::_migration_config",
}
nz = [r for r in rows if r["delta"] > 0]
print(f"nonzero={len(nz)} of {len(rows)}   unmatched={len(unmatched)}")
for u in unmatched:
    print(f"  UNMATCHED {u['module']}::{u['object']} in={u['in']} n={u['n']}")
un = [r for r in nz if f"{r['module']}::{r['object']}" not in assigned]
print(f"batch1..4 覆盖过的 nonzero={len(nz) - len(un)}（该清单已全部处理，保留作历史）")
print(f"不在批次清单内的 nonzero={len(un)}")
for r in un:
    print(f"  delta={r['delta']:3d} {r['module']}::{r['object']}")
    print(f"      das-only={r['das_only']}")
    print(f"      src-only={r['src_only']}")
