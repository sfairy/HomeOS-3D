"""HA 重连退避抖动与断开原因分类。"""

from __future__ import annotations

import random
import unittest

import httpx
from src.domains.ha.integration.client import (
    HAAuthError,
    HAClientError,
    HAProtocolError,
)
from src.domains.ha.integration.service_live import HALiveMixin
from src.domains.ha.integration.service_support import (
    FAILURE_AUTH,
    FAILURE_NETWORK,
    FAILURE_OFFLINE,
    FAILURE_PROTOCOL,
    FAILURE_UNKNOWN,
    classify_disconnect_reason,
)

CONNECTOR_TUNING = {'haConnector': {'reconnectBaseMs': 1000, 'maxReconnectDelayMs': 10000}}


class _BackoffProbe(HALiveMixin):
    def __init__(self, *, tuning: dict | None = None, seed: int = 7) -> None:
        self._jitter_random = random.Random(seed)
        self.tuning = tuning or CONNECTOR_TUNING
        self._failure_kind = None
        self._failure_logged_at = 0.0
        self._offline_since = None

    def _ha_tuning(self) -> dict:
        return self.tuning


class ReconnectBackoffTest(unittest.TestCase):
    def test_delay_stays_within_increasing_bounds(self) -> None:
        probe = _BackoffProbe()
        for _ in range(200):
            delay = probe._next_backoff(4.0)
            self.assertGreaterEqual(delay, 2.0 - 1e-9)
            self.assertLessEqual(delay, 4.0)

    def test_delay_never_exceeds_configured_maximum(self) -> None:
        probe = _BackoffProbe()
        for _ in range(50):
            delay = probe._next_backoff(600.0)
            self.assertLessEqual(delay, 10.0)
            self.assertGreaterEqual(delay, 5.0 - 1e-9)

    def test_small_base_still_has_floor(self) -> None:
        tuning = {'haConnector': {'reconnectBaseMs': 100, 'maxReconnectDelayMs': 10000}}
        probe = _BackoffProbe(tuning = tuning)
        for _ in range(50):
            delay = probe._next_backoff(0.1)
            self.assertGreaterEqual(delay, 0.05)

    def test_jitter_source_is_injectable_and_deterministic(self) -> None:
        first = _BackoffProbe(seed = 99)
        second = _BackoffProbe(seed = 99)
        left = [first._next_backoff(8.0) for _ in range(10)]
        right = [second._next_backoff(8.0) for _ in range(10)]
        self.assertEqual(left, right)
        self.assertGreater(len(set(left)), 1)

    def test_batch_window_reads_tuning(self) -> None:
        self.assertEqual(_BackoffProbe()._live_event_batch_window(), 0.05)
        explicit = _BackoffProbe(tuning = {'haConnector': {'liveEventBatchWindowMs': 0}})
        self.assertEqual(explicit._live_event_batch_window(), 0.0)
        custom = _BackoffProbe(tuning = {'haConnector': {'liveEventBatchWindowMs': 120}})
        self.assertEqual(custom._live_event_batch_window(), 0.12)
        broken = _BackoffProbe(tuning = {'haConnector': {'liveEventBatchWindowMs': 'oops'}})
        self.assertEqual(broken._live_event_batch_window(), 0.05)


class DisconnectReasonTest(unittest.TestCase):
    def test_auth_failures_are_actionable(self) -> None:
        self.assertEqual(classify_disconnect_reason(HAAuthError('Home Assistant Token 无效或权限不足。')), FAILURE_AUTH)

    def test_protocol_failures_are_separate_from_network(self) -> None:
        self.assertEqual(classify_disconnect_reason(HAProtocolError('Home Assistant WebSocket 未返回鉴权请求。')), FAILURE_PROTOCOL)

    def test_network_failures(self) -> None:
        self.assertEqual(classify_disconnect_reason(httpx.ConnectError('connection refused')), FAILURE_NETWORK)
        self.assertEqual(classify_disconnect_reason(TimeoutError()), FAILURE_NETWORK)
        self.assertEqual(classify_disconnect_reason(OSError('network down')), FAILURE_NETWORK)

    def test_generic_client_error_is_network_but_unknown_exception_is_not(self) -> None:
        self.assertEqual(classify_disconnect_reason(HAClientError('无法连接 Home Assistant：超时')), FAILURE_NETWORK)
        self.assertEqual(classify_disconnect_reason(RuntimeError('boom')), FAILURE_UNKNOWN)

    def test_auth_hint_is_written_to_the_reconnect_line(self) -> None:
        probe = _BackoffProbe()
        with self.assertLogs('homeos.ha_connector', level = 'WARNING') as captured:
            probe._log_cycle_failure(
                HAAuthError('Home Assistant Token 无效或权限不足。'),
                FAILURE_OFFLINE,
                3,
                2.0,
                True,
                reason = FAILURE_AUTH,
            )
        self.assertIn('令牌', captured.output[0])

    def test_unknown_reason_adds_no_hint(self) -> None:
        probe = _BackoffProbe()
        with self.assertLogs('homeos.ha_connector', level = 'WARNING') as captured:
            probe._log_cycle_failure(HAClientError('Home Assistant 连接失败'), FAILURE_OFFLINE, 1, 1.0, True, reason = FAILURE_UNKNOWN)
        self.assertNotIn('令牌', captured.output[0])
