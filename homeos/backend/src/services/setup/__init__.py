"""首装向导域导出（对齐 ``modules/system/setup`` 与 ``@homeos/shared/setup``）。"""

from __future__ import annotations

from .account_binding import (
    ACCOUNT_BINDING_SOURCE_LABELS,
    COMM_ACCOUNT_BINDING_CATEGORIES,
    ENERGY_ACCOUNT_BINDING_CATEGORIES,
    collect_footer_account_sources,
    collect_required_account_binding_categories,
    format_account_binding_label,
    is_comm_account_binding_category,
    resolve_account_binding_settings_route,
)
from .bindings_gaps import (
    collect_binding_gaps,
    filter_binding_gaps_by_section,
    resolve_binding_gap_section,
)
from .energy_config import has_energy_config, normalize_energy_source
from .hazard_config import (
    build_hazard_binding_map,
    collect_hazard_binding_summary,
    collect_hazard_watched_entity_ids,
    detect_hazard_binding_conflicts,
    format_hazard_binding_summary_text,
    format_security_alarm_message,
    has_any_hazard_sensor_binding,
    parse_hazard_entity_id_list,
    summarize_hazard_action_failures,
)
from .wizard import SetupWizardService

__all__ = [
    "ACCOUNT_BINDING_SOURCE_LABELS",
    "COMM_ACCOUNT_BINDING_CATEGORIES",
    "ENERGY_ACCOUNT_BINDING_CATEGORIES",
    "SetupWizardService",
    "build_hazard_binding_map",
    "collect_binding_gaps",
    "collect_footer_account_sources",
    "collect_hazard_binding_summary",
    "collect_hazard_watched_entity_ids",
    "collect_required_account_binding_categories",
    "detect_hazard_binding_conflicts",
    "filter_binding_gaps_by_section",
    "format_account_binding_label",
    "format_hazard_binding_summary_text",
    "format_security_alarm_message",
    "has_any_hazard_sensor_binding",
    "has_energy_config",
    "is_comm_account_binding_category",
    "normalize_energy_source",
    "parse_hazard_entity_id_list",
    "resolve_account_binding_settings_route",
    "resolve_binding_gap_section",
    "summarize_hazard_action_failures",
]
