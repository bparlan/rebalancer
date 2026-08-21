# Modularity Design Pattern for Rebalancer

## Overview
The rebalancer is architected as a composition of independent, replaceable modules. Each module exposes a well-defined interface and specific contracts. New functionality is added by implementing modules conforming to these contracts, without requiring changes to existing modules.

## Module Boundaries
- **M1: Provider Connection** – Handles environment loading, RPC initialization, wallet derivation, gas reserve enforcement. No on-chain interaction.
- **M2: Quote Integration** – Provides 0x API v2 price quoting, allowance management, and slippage enforcement.
- **M3: Cost Policy** – Estimates gas costs and transaction fees, evaluates net gain against profitability thresholds.
- **M4: Execution Engine** – Manages token approvals, transaction simulations, submission, and receipt handling.
- **M5: Hysteresis & Drift Detection** – Computes target allocations, monitors portfolio drift, triggers rebalancing based on hysteresis band.
- **M6: Persistence & Concurrency** – Manages SQLite logging, run-locks, and trading cooldowns.
- **M7: Orchestration** – Coordinates n8n webhooks, Telegram notifications, and error handling.

## Interface Contracts
Each module implements TypeScript/JavaScript interfaces declaring required inputs/outputs and error codes. Downstream modules depend only on upstream interfaces, not implementations.

## Extension Points
Modules expose extension points for future enhancements:
- `#M1_GAS_RESERVE_CHECK` – Future gas reserve strategies (e.g., dynamic reserves based on network congestion).
- `#M2_QUOTE_VALIDATOR` – Custom quote validation logic (e.g., regime-adaptive thresholds).
- `#M5_DRIFT_EVALUATOR` – Alternative drift calculation methods (e.g., asymmetric bands, Kelly sizing).

## Design Goals
1. **Safety First** – Safety gates in each module abort execution on violations (e.g., gas reserve check in M1).
2. **BigInt-Only Finance** – All monetary values use BigInt for precision.
3. **Exact Approvals** – No `MaxUint256` approvals; approvals scoped to exact quote amounts.
4. **Observability** – Structured logging and metrics for auditability.
5. **Testability** – Interfaces are pure functions for unit testing with mocks.

## Future Integration
- **ADDITION 1: Regime-Adaptive Thresholds** – Plugin to `#M5_DRIFT_EVALUATOR`.
- **ADDITION 2: Asymmetric Rebalancing** – Extend `#M5_DRIFT_EVALUATOR`.
- **ADDITION 5: Fractional-Kelly Sizing** – Hook into `#M3_COST_POLICY`.
- **LONG-TERM: LLM Debate Engine** – New module `#M7_DEBATE_ENGINE`.

## Example: Adding a New Module
1. Define contract in `contracts/` (e.g., `RegimeAdapter.ts`).
2. Implement interface with pure functions.
3. Register in `dependency graph`.
4. Update `ROADMAP.md`.
5. Add `M{X}:<module>` docs.

--- This modular architecture enables incremental evolution with isolated, testable components.