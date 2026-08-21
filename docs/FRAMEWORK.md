# FRAMEWORK.md

## Runtime Environment
- **Node.js**: v22.x (LTS).
- **Modules**: ESM (ESM enabled in package.json with `"type": "module"`).
- **Dependencies**: ethers.js v6.x, node-fetch (or similar) for HTTP calls.

## Module Organization
- `/rebalance.js`: Main execution loop with approval + swap pipeline.
- `/db.js`: SQLite storage wrapper.
- `/config.json`: Allocation and asset definitions.
- `/.env`: Environment secrets (injected).

## Operational Workflow
1. **Cron Trigger**: n8n invokes the worker via HTTP POST.
2. **Setup**: Load config, initialize provider and wallet.
3. **Execution Pipeline**:
   - Fetch on-chain balances (ethers.js).
   - Fetch quotes from 0x API v2.
   - Simulate transaction via 0x simulation endpoint.
   - Estimate gas costs.
   - **Step A (Approval)**: Approve exact token amount to 0x's `allowanceTarget`.
   - **Step B (Swap)**: Execute swap call using 0x relay.
   - Log result to database.

## Signer Management
- **Private Key Access**: ONLY via `process.env.PRIVATE_KEY` (environment variable).
- **Key Storage**: Never stored in filesystem, database logs, or error messages.
- **Key Usage**:
  - Load wallet instance from `process.env.PRIVATE_KEY`.
  - Private key is destroyed from memory immediately after wallet instantiation.
- **Logging**: Never log private key or derived address to console, logs, or telemetry.
- **Error Messages**: Mask wallet addresses in error messages (e.g., "Wallet [REDACTED] initialized").

## Exact Approvals (Two-Step Transaction Pipeline)

### Prerequisite
- Must have the 0x API v2 `allowanceTarget` address before approving tokens.

### Step A: Token Approval
```javascript
// Before any swap, approve exact amount to allowanceTarget
const approvalTx = await tokenContract.approve(
  allowanceTarget,           // 0x API's allowanceTarget address
  requiredAmount.toString()  // Exact amount, never MaxUint256
);
await approvalTx.wait();      // Wait for confirmation
```

### Step B: Swap Execution
```javascript
// Use 0x API relayed swap (handles routing and MEV protection)
const swapTx = await 0xRelay.submit({
  slippageToleranceBps: 50,
  // ... other parameters
});
await swapTx.wait();
```

### Why Two-Step?
- **Separation of Concerns**: Approval and swap are atomic operations in their own transactions.
- **Safety**: If swap fails, approval remains valid for the required amount (no waste).
- **Audit Trail**: Separate transactions make debugging and monitoring easier.

## Block Builder & Gas Estimations

### Gas Estimation Before Execution
Before ANY transaction is submitted, the engine must:

1. **Estimate Gas**:
   ```javascript
   const gasEstimate = await provider.estimateGas(transaction);
   const gasPrice = await provider.getFeeData(); // or use tipCap if EIP-1559
   const estimatedCost = gasEstimate * gasPrice;
   ```

2. **Simulate via 0x**:
   - Use 0x's simulation endpoint (`/swap/v2/transaction`) to verify no revert.
   - If simulation fails, abort and log.

3. **Reject High Gas Prices**:
   - Define a high-gwei threshold (e.g., `gasPrice > 100_000_000_000` or `100 gwei`).
   - If gas price spikes above threshold, abort immediately.
   - Log the event with gas price, block number, and timestamp.

### Gas Estimation Failure Handling
If `estimateGas()` fails (revert), abort immediately:

```javascript
try {
  const gasEstimate = await provider.estimateGas(transaction);
  // ... proceed with transaction
} catch (error) {
  log.error(`Gas estimation failed: ${error.message}`);
  alertN8nOrchestrator("gas_estimation_failed", {
    error: error.message,
    blockNumber: blockNumber
  });
  process.exit(1); // Stop the worker
}
```

### Post-Transaction Gas Reporting
- Log actual gas used (`receipt.gasUsed`) and gas price for each transaction.
- Compare actual cost against estimated cost.
- Alert on >20% variance between estimated and actual gas.

## Safety Rules

### General Safety
- **Simulation First**: Never send a transaction without simulating via 0x.
- **Exact Amounts**: Never use `MaxUint256` for approvals or swap amounts.
- **BigInt Only**: All token balances and quantities must be `BigInt` (no floating-point).
- **No Minting**: Never call functions that mint tokens (e.g., `approveMax`, `transferAll`).

### Error Handling
- **Critical Errors**: Abort worker immediately on gas estimation failure, wallet initialization failure, or config validation failure.
- **Non-Critical Errors**: Log to database and continue (e.g., quote fetch timeout, RPC rate limiting).
- **Graceful Degradation**: If 0x API is down, skip rebalance and log a warning.

### Testing Requirements
- All gas estimation logic must be tested with mocked providers.
- All approval logic must be tested with mocked token contracts.
- Transaction simulation must be tested with realistic block gas prices.

## Extension Guidelines
- Add tokens to `config.json`.
- Update `allowedTokens` list and associated addresses.
- Extend `executeSwaps()` logic only for V2 enhancements (multi-aggregator, advanced routing).

## Audit Requirements
- Code review must verify:
  - No hardcoded private keys.
  - All gas estimation paths are covered.
  - All approvals use exact amounts.
  - All logging is safe (no private key exposure).
  - BigInt usage is consistent across all financial calculations.
