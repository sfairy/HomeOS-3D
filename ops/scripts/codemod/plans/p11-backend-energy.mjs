// P11：后端能源域归属修正 —— domains/logs 里的 9 个 energy_*.py 属于能源域。
export default {
  moves: [
    { from: 'homeos/backend/src/domains/logs/energy_aggregate.py', to: 'homeos/backend/src/domains/energy/aggregate.py' },
    { from: 'homeos/backend/src/domains/logs/energy_backfill.py', to: 'homeos/backend/src/domains/energy/backfill.py' },
    { from: 'homeos/backend/src/domains/logs/energy_cost.py', to: 'homeos/backend/src/domains/energy/cost.py' },
    { from: 'homeos/backend/src/domains/logs/energy_guard.py', to: 'homeos/backend/src/domains/energy/guard.py' },
    { from: 'homeos/backend/src/domains/logs/energy_history.py', to: 'homeos/backend/src/domains/energy/history.py' },
    { from: 'homeos/backend/src/domains/logs/energy_report.py', to: 'homeos/backend/src/domains/energy/report.py' },
    { from: 'homeos/backend/src/domains/logs/energy_sgcc.py', to: 'homeos/backend/src/domains/energy/sgcc.py' },
    { from: 'homeos/backend/src/domains/logs/energy_store.py', to: 'homeos/backend/src/domains/energy/store.py' },
    { from: 'homeos/backend/src/domains/logs/energy_units.py', to: 'homeos/backend/src/domains/energy/units.py' },
  ],
}
