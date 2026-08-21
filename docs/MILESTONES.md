# MILESTONES.md — Rebalancer Modular Roadmap

## Overview
This document defines the MVP milestone plan for the Oh My Pi rebalancer. The design follows a **modular architecture** (see `docs/MODULARITY.md`). Milestones are ordered for **development convenience**: foundational safety and connection modules come first, followed by cost-policy and execution modules, then persistence and orchestration.

---

## Development Order

### M1: Basic Provider Connection
- **Goal**: Establish a secure Base Mainnet provider connection, derive the EOA wallet from `PRIVATE_KEY`, read native ETH and USDC balances, and enforce a hard gas reserve.
- **Key Safeties**:
  - Provider bound to chainId 8453.
  - Wallet address never logged; masked in messages.
  - BigInt-only financial math.
  - Hard gas reserve `>= 0.002 ETH` enforced before any downstream work.
- **Dependencies**: `BASE_RPC_URL` env var, `PRIVATE_KEY` env var, `config.json` (`minEthGasReserveWei: 2000000000000000`).
- **Out of Scope**: 0x integration, token approvals, swaps, rebalancing logic, database persistence, n8n orchestration.
- **Acceptance**: Provider reports chainId 8453; wallet address derived without key exposure; ETH >= reserve; USDC balance normalized; no key leaks.
- **Modular note**: Establishes extension point `#M1_GAS_RESERVE_CHECK` for future dynamic reserve strategies.

### M2: 0x Swap API v2 Integration
- **Goal**: Integrate 0x API v2 for price quotes, exact-amount allowances, and slippage enforcement.
- **Key Safeties**:
  - Exact allowance granted to 0x `allowanceTarget`, never `MaxUint256`.
  - Quotes validated with `slippageBps: 50` (0.5%).
  - Gas estimation via 0x simulation before submission.
  - BigInt-only token quantities.
- **Dependencies**: `0x API key`, `BASE_RPC_URL`, `PRIVATE_KEY`, config (`maxSlippageBps`).
- **Out of Scope**: Manual swap execution, transaction cost policy, database logging, n8n webhooks.
- **Acceptance**: Quote fetch works; allowance query returns correct value; quotes with >50 bps slippage rejected.
- **Modular note**: Establishes extension point `#M2_QUOTE_VALIDATOR` for regime-adaptive threshold filtering.

### M3: Transaction Cost Policy Utility
- **Goal**: Implement `estimateGasCostInUSD()` converting gas limit and gas price to USD; validate that `portfolio_value_gain > round_trip_transaction_costs`.
- **Key Safeties**:
  - Gas cost calculation uses runtime ETH price, not hardcoded values.
  - Profitability gate: swap is rejected if net gain <= 0.
  - BigInt financial math; USD conversion isolated to presentation layer.
- **Dependencies**: M1 provider & balances, M2 quote integration.
- **Out of Scope**: Manual swap execution, database persistence, n8n orchestration.
- **Acceptance**: Gas cost conversion is accurate; 0x routing fees accounted for; slippage loss calculated; swaps rejected if net gain <= 0.

### M4: Manual Real Swap Execution (Success Anchor)
- **Goal**: Build execution script supporting `--dry-run` flag; execute one real micro-sized swap ($1 of ETH to USDC) on Base Mainnet.
- **Key Safeties**:
  - `--dry-run` flag is mandatory for simulation mode; no signing/broadcasting.
  - Exact-amount approval to 0x `allowanceTarget` only.
  - Slippage enforced to 0.5% (50 bps) max.
- **Dependencies**: M2 quote integration, M3 cost policy.
- **Out of Scope**: Automated rebalancing, database persistence, n8n orchestration.
- **Acceptance**: Swap executes successfully on Base Mainnet; exact approval confirms; balance changes within slippage limits.

### M5: Hysteresis Loop Engine & Drift Detection
- **Goal**: Implement threshold-based rebalancing with ±5% (500 bps) hysteresis band and hard gas reserve enforcement.
- **Key Safeties**:
  - Rebalancing triggers only when an asset drifts outside ±5% from target.
  - Hard gas reserve `0.002 ETH` never swapped away; if balance falls below, rebalance skipped.
  - Profitability check: `portfolio_value_gain > round_trip_transaction_costs` (reuses M3).
  - BigInt financial calculations throughout.
- **Dependencies**: M1 provider & balances, M2 quote integration, M3 cost policy, `config.json` (`hysteresisBps: 500`, `targetAllocationBps`).
- **Out of Scope**: Database persistence, n8n orchestration, multi-aggregator routing.
- **Acceptance**: Hysteresis band correctly set; rebalances only on drift >500 bps; gas reserve check aborts when insufficient; net gain > costs condition enforced.
- **Modular note**: Enables extension point `#M5_DRIFT_EVALUATOR` for regime-adaptive, asymmetric, or Kelly sizing strategies.

### M6: SQLite Database Logging & Cooldowns
- **Goal**: Deploy SQLite runs and trades schema; implement run-locks and 30-minute cooldown.
- **Key Safeties**:
  - All BigInt quantities stored as TEXT (no REAL/floating-point).
  - Run-locks prevent concurrent rebalances; enforced via database-level locking.
  - Cooldown prevents trading within 30 minutes of last successful execution.
- **Dependencies**: M5 hysteresis engine, `schema.sql`.
- **Out of Scope**: n8n orchestration, Telegram notifications.
- **Acceptance**: Tables created per schema; run logs recorded; run-locks prevent double execution; 30-min cooldown enforced.

### M7: VPS Orchestration & n8n Webhook
- **Goal**: Configure n8n webhook HTTP POST node to trigger the worker; integrate a Telegram bot notifier for structured summaries/failures.
- **Key Safeties**:
  - All notification targets and server URLs loaded from environment variables (no hardcoded fallback domains).
  - Worker responds with HTTP 200 on success; errors logged to database and surfaced to n8n.
- **Dependencies**: M6 database logging, n8n workflow configuration, Telegram bot token.
- **Acceptance**: n8n workflow triggers worker successfully; Telegram notifications sent on success/failure; end-to-end pipeline tested.

---

## Modularity Annotations

Each milestone is an **independent module** with defined interfaces (environment variables, config fields, function signatures). Downstream milestones depend only on upstream interfaces, not implementations.

| Milestone | Core Interfaces Exported | Extension Points |
|:----------|:-------------------------|:-----------------|
| M1 | Provider, Wallet, `config.json`, `BASE_RPC_URL`, `PRIVATE_KEY` | `#M1_GAS_RESERVE_CHECK` |
| M2 | 0x quote client, `allowanceTarget`, `slippageBps` | `#M2_QUOTE_VALIDATOR` |
| M3 | `estimateGasCostInUSD()`, profitability gate | (none) |
| M4 | `--dry-run` flag, swap execution pipeline | (none) |
| M5 | Drift engine, hysteresis band, rebalance triggers | `#M5_DRIFT_EVALUATOR` |
| M6 | SQLite schema, run-lock logic, cooldown timer | (none) |
| M7 | n8n webhook handler, Telegram notifier | (none) |

**Future strategic additions** (from `docs/ingest/ADDITIONS_and_LONG_TERM.md`):
- **ADDITION 1 — Regime-Adaptive Thresholds**: plugs into `#M5_DRIFT_EVALUATOR`
- **ADDITION 2 — Asymmetric Rebalancing**: extends `#M5_DRIFT_EVALUATOR`
- **ADDITION 5 — Fractional-Kelly Sizing**: hooks into `#M3_COST_POLICY`
- All other additions remain long-term roadmap items.

---
*Roadmap version: 2026-08-18 — modular SDD pipeline with development-ordered milestones.*