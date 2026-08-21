# SPEC.md

## Overview

Rebalancer is an automated portfolio management worker for the Base L2 network that maintains a constant-mix portfolio with strict production constraints.

## Architectural Principles

- **Separation of Concerns**: n8n orchestrates, worker executes.
- **Safety First**: Simulation before execution; exact token allowances (no `MaxUint256`); runtime gas estimation.
- **Precision**: Uses `BigInt` for all token balances and quantities.
- **Aggregator**: 0x Swap API v2.
- **EOA Custody**: Standard EVM hot wallet (Externally Owned Account) with hard-coded gas reserve.
- **No Smart Contract Custody**: Gnosis Safe/Zodiac Roles Modifier integration deferred to V2.

## Components

- **Orchestrator**: n8n (Trigger: Cron, hourly).
- **Worker**: Node.js Docker container.
- **Persistence**: SQLite for transaction logs and EOA balance tracking.
- **Security**: Wallet private key stored as encrypted runtime secret.

## Rebalancing Strategy

### Constant-Mix Threshold Rebalancing

The bot maintains a target allocation mix across allowed tokens. Rebalancing triggers only when an asset's current balance deviates from its target allocation by more than ±5%.

### Hysteresis Band

- **Threshold**: Target ±5% (500 basis points).
- **Trigger Condition**: An asset must drift outside the 5% band before any swap is executed.
- **Execution Frequency**: The bot checks on-chain balances frequently, but only swaps when the hysteresis condition is met.

### Example

If target allocation is 20% for MORPHO, and MORPHO balance represents 25% of portfolio value:

- Drift: 25% - 20% = 5% (within band, no action).
- If MORPHO drops to 15%, drift = 5%, still within band.
- If MORPHO drops to 14%, drift = 6% (outside band, trigger rebalance).

## Custody & Signer

### EOA Hot Wallet (MVP)

- **Wallet Type**: Standard EVM Externally Owned Account.
- **Initial Funding**: ETH is deposited to the wallet.
- **Token Storage**: All portfolio tokens are held directly in the EOA (no vault contracts in MVP).

### Gnosis Safe / Zodiac Roles Modifier

- **Deferred to V2**: No multi-signature or role-based access control in MVP.
- **Risk Assumption**: This is an internal or controlled-service hot wallet.

## Hard Gas Reserve

### Reserve Requirements

- **Minimum Amount**: 0.002 ETH (2,000,000,000,000,000 wei).
- **Lock Status**: This reserve is strictly locked and excluded from all portfolio valuation calculations.
- **Enforcement**: Never swapped away under any circumstances.

### Why Hard Reserve?

- Ensures the wallet always has sufficient gas to cover transaction fees.
- Protects against scenarios where portfolio tokens have zero liquidity or extremely high slippage.
- Guarantees the wallet can always recover if a token becomes illiquid.

## Transaction Cost Friction

### Pre-Trade Validation

Before any trade is executed, the engine must:

1. **Estimate Native Gas Cost**: Convert current ETH price to USD (e.g., via Chainlink or 0x price feed).
2. **Factor in 0x API Fees**: Account for routing fees on the 0x API.
3. **Factor in Price Impact/Slippage**: Estimate worst-case slippage for the trade.

### Profitability Check

A swap is ONLY permitted if:

```
Portfolio Value Gain from Rebalance > Round-Trip Transaction Costs
```

Where:

- `Portfolio Value Gain from Rebalance` = (post-rebalance portfolio value) - (pre-rebalance portfolio value).
- `Round-Trip Transaction Costs` = (gas cost in USD) + (0x API fee) + (estimated slippage loss in USD).

### Example

If rebalancing MORPHO requires a swap that costs 0.001 ETH in gas (at $2,000/ETH = $2 USD) and introduces 0.02% slippage ($4 value loss), the net gain must exceed $6 USD for the trade to execute.

## Bot Protection & Slippage

### Exact-Amount Token Approvals

To prevent front-running/sandwich attacks from MEV bots and guarantee the cheapest routing:

- **No MaxUint256 Approvals**: Never approve `MaxUint256` or unbounded allowances.
- **Targeted Approvals**: Approve exact token amounts explicitly targeting the 0x API's `allowanceTarget` address.
- **Workflow**:
  1. Query current allowance.
  2. If allowance < required amount, approve only the required amount.
  3. If allowance > required amount, only decrease to required amount (if supported by ERC-20 interface).

### Max Slippage Configuration

- **Limit**: 0.5% (50 basis points) on all 0x quote requests.
- **Enforcement**: Reject quotes that exceed this slippage threshold.
- **API Parameter**: `maxSlippageBps: 50` in 0x API calls.

### MEV Protection

- **No Block Propagation**: Do not broadcast signed transactions directly to the mempool.
- **Use 0x Relay**: Let the 0x API handle transaction relay and MEV protection through their relayer infrastructure.

## Data Models

### Allocation

Map of token symbols to target percentages in basis points.

### Current Balances

Map of token addresses to current EOA balances (BigInt).

### Hysteresis Band

- **Parameter**: 500 basis points (5%).
- **Usage**: Trigger rebalancing only when an asset drifts outside this band from its target allocation.

### Hard Gas Reserve

- **Parameter**: 0.002 ETH (2,000,000,000,000,000 wei).
- **Lock Status**: Excluded from all portfolio valuation calculations.

### Transaction Costs

- **Gas Cost in USD**: (gas limit × gas price) × ETH price.
- **0x API Fee**: Calculated by 0x API based on volume.
- **Slippage Loss in USD**: (price impact %) × (trade value).

## Security Considerations

### EOA Security

- Private key stored as encrypted runtime secret (no filesystem storage).
- Private key used only during transaction signing.
- Private key never exposed in logs or telemetry.

### Emergency Withdrawal

- V1 design: In case of wallet compromise, emergency ETH withdrawal via a separate admin EOA with time-locked transfers.

### Rate Limiting

- Enforce rate limits on 0x API calls to prevent abuse.
- Implement circuit breaker for external API failures.
