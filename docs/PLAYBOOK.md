# PLAYBOOK.md

## Deployment
- Containerize with Docker.
- Orchestrate via Coolify.
- Inject `PRIVATE_KEY` and `BASE_RPC_URL` via environment variables.

## Operational Procedures

### Dry-Run Safety Flag
The bot supports a `--dry-run` command-line flag that simulates transactions without signing. This is useful for testing rebalance logic and validating transaction costs before real execution.

#### Dry-Run Workflow
1. **Start with `--dry-run`**:
   ```bash
   npm start -- --dry-run
   ```

2. **Simulation Steps**:
   - Fetch on-chain balances.
   - Calculate target allocations and detect drift.
   - Request quotes from 0x API.
   - Simulate gas estimation.
   - Validate transaction costs.

3. **Output**:
   - The bot outputs a structured JSON summary:
     ```json
     {
       "dryRun": true,
       "timestamp": 1692137600,
       "proposedTrade": {
         "fromToken": "ETH",
         "toToken": "USDC",
         "amount": "1000000000000000000",
         "estimatedGasCostUSD": "2.50",
         "slippageLossUSD": "3.20",
         "netGainUSD": "5.30"
       },
       "status": "approved",
       "reason": "Portfolio gain exceeds transaction costs"
     }
     ```

4. **Pre-Execution Stop**:
   - The bot halts immediately after the dry-run summary.
   - No transactions are submitted to Base Mainnet.

5. **Safety Guarantees**:
   - **No Signing**: Private key is never used.
   - **No RPC Calls**: No actual transactions are sent to the network.
   - **Exact Simulation**: Uses 0x simulation endpoints for accurate gas estimation.

#### When to Use Dry-Run
- Before a major portfolio reallocation.
- During development and testing.
- When validating new tokens or allocations.
- Before deploying changes to production.

### Failure Recovery

#### Stuck Transaction on Base
If a transaction gets stuck in the mempool (no block confirmation after 30 minutes):

1. **Identify Stuck Transaction**:
   - Check the transaction hash in the database `runs` table.
   - Verify it's still pending in the Base block explorer.

2. **Manual Nonce Override**:
   - Wait for the stuck transaction to expire (typically 30 minutes).
   - Check the wallet's nonce at the time of stuck transaction.
   - Create a new transaction with the same parameters but a higher nonce.

3. **Tools for Manual Override**:
   ```bash
   # Get current nonce using ethers.js
   const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
   const nonce = await provider.getTransactionCount(walletAddress);

   # Manually sign and send the new transaction (use metamask or ethers.js CLI)
   ```
   - Ensure the new transaction has a higher nonce than the stuck one.
   - Use the same parameters (same `to`, `data`, `value`).
   - Send the new transaction after the stuck one expires.

4. **Log the Action**:
   - Record the manual override in the `runs` table as a `skipped` status.
   - Add a note in the `error_message` field explaining the manual intervention.

#### Emergency Shutdown
To instantly freeze the execution loop in production:

1. **Set `TRADING_ENABLED=false`**:
   ```bash
   export TRADING_ENABLED=false
   ```

2. **Implementation**:
   - The worker checks `TRADING_ENABLED` at the start of each execution loop.
   - If false, the worker skips rebalance and logs a warning.
   - No new transactions are submitted.

3. **To Resume Trading**:
   ```bash
   export TRADING_ENABLED=true
   npm start
   ```

4. **Database Verification**:
   - Check the `runs` table for the last execution.
   - Verify the status is `skipped` with reason `trading_disabled`.

#### Common Failure Scenarios

##### 1. Gas Estimation Failure
- **Symptom**: `estimateGas()` throws an error.
- **Cause**: Insufficient gas limit, revert on-chain state, or low balance.
- **Recovery**:
  1. Check wallet balance (must be > 0.002 ETH + estimated gas costs).
  2. Verify token allowances.
  3. Retry the rebalance.

##### 2. Transaction Revert
- **Symptom**: Transaction fails with revert reason.
- **Cause**: Insufficient allowance, out of funds, or slippage too tight.
- **Recovery**:
  1. Check the revert reason in logs.
  2. Increase slippage tolerance.
  3. Verify token balances.

##### 3. 0x API Unavailable
- **Symptom**: HTTP 503/504 from 0x API.
- **Cause**: API rate limit or maintenance.
- **Recovery**:
  1. Log the error and retry after 5 minutes.
  2. If repeated failures, alert the team.

##### 4. Database Lock
- **Symptom**: Database is locked by another process.
- **Cause**: Concurrent execution without run-locks.
- **Recovery**:
  1. Wait for the lock to release.
  2. Check the `runs` table for the lock holder.
  3. If stuck, manually clean up stale locks.

#### Incident Response Checklist
- [ ] Verify wallet balance (must be > 0.002 ETH + gas costs).
- [ ] Check 0x API status and rate limits.
- [ ] Review database logs for error messages.
- [ ] Verify token allowances are sufficient.
- [ ] Test transaction simulation on Base Mainnet.
- [ ] Enable dry-run mode for further investigation.
- [ ] Set `TRADING_ENABLED=false` if safety is at risk.
- [ ] Notify n8n orchestrator and Telegram bot.
- [ ] Document the incident in the `runs` table.
