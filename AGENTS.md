# Agentic Policy & System Guide - Rebalancer MVP

## 1. Runtime & Environment Policy
- **Language**: Pure JavaScript (ESM) conforming to Node 22 specifications. No TypeScript compilation, tsconfig files, or transpile steps.
- **Module Format**: Use strict ES Module syntax (`import`/`export` with explicit `.js` extensions).
- **Execution Signer**: Executed strictly via a standard EOA Hot Wallet derived from the `PRIVATE_KEY` environment variable.

## 2. Mathematical & Database Precision Contract
- **No Float Math**: Direct floating-point mathematical calculations (using `Number` or `REAL` types) for on-chain balances or token quantities are strictly prohibited to avoid precision loss.
- **BigInt Enforcement**: All token quantities, balances, and values must be represented and stored as string-based `BigInt` (or `TEXT` columns in SQLite) at all boundaries (database, JSON configurations, and API payloads).

## 3. Dynamic Gas & Safety Reserves Policy
- **Reserve Maintenance**: The engine must programmatically query and respect a minimum native asset gas reserve specified in the runtime configuration (`config.json`).
- **Spend Protection**: This gas reserve must be dynamically subtracted from the wallet's total native balance before evaluating portfolio allocations, calculating hysteresis-based drift, or validating trade sizes. The gas reserve is strictly non-spendable.

## 4. Operational Guardrails & Webhook Policy
- **Dynamic Configuration**: All notification dispatches (e.g., n8n, Telegram) and server targets must be dynamically loaded from environment variables (`.env`). Hardcoding localized fallback domains is strictly prohibited.
- **Exact Approvals Only**: Token allowances must be granted strictly for the exact amount needed per swap, targeted explicitly at the `allowanceTarget` address returned by the 0x API. `MaxUint256` or infinite approvals are banned.
- **Dry-Run Enforcement**: The core execution script must support a mandatory `--dry-run` flag that fetches data, evaluates policy thresholds, and simulates transactions on-chain without signing or broadcasting state-changing transactions.
