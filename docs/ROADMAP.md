# ROADMAP.md

## MVP Milestones (V1)

### M1: Basic Provider Connection
**Goal**: Establish provider connection and verify balances.
**Tasks**:
- Initialize ethers.js provider for Base Mainnet (chain ID: 8453).
- Create EOA wallet from `process.env.PRIVATE_KEY`.
- Query and display ETH and USDC balances on Base.
- Verify the wallet has sufficient gas to cover basic RPC calls.

**Acceptance Criteria**:
- [ ] Provider connects successfully.
- [ ] Wallet address is derived correctly.
- [ ] ETH balance > 0.002 ETH (gas reserve).
- [ ] USDC balance is readable (even if 0).

---

### M2: 0x Swap API v2 Integration
**Goal**: Integrate 0x API for price quotes and allowances.
**Tasks**:
- Fetch API keys for 0x Swap API v2.
- Query 0x API to fetch ETH/USDC price feed.
- Check current token allowance for USDC against 0x `allowanceTarget`.
- Request executable quotes with 0.5% max slippage.

**Acceptance Criteria**:
- [ ] 0x API v2 integration is functional.
- [ ] Quote endpoint returns valid prices and gas estimates.
- [ ] Allowance query returns correct current allowance.
- [ ] Max slippage parameter is set to 50 bps.

---

### M3: Transaction Cost Policy Utility
**Goal**: Build utility to calculate and validate trade profitability.
**Tasks**:
- Create `TransactionCostPolicy` module.
- Implement `estimateGasCostInUSD()`:
  - Get current ETH price via Chainlink or 0x.
  - Estimate gas limit and gas price.
  - Convert to USD.
- Implement fee and slippage estimation.
- Validate that `portfolio_value_gain > transaction_costs`.

**Acceptance Criteria**:
- [ ] Gas cost conversion is accurate.
- [ ] 0x routing fees are accounted for.
- [ ] Slippage loss is calculated.
- [ ] Swap is rejected if `net_gain <= 0`.

---

### M4: Manual Real Swap Execution
**Goal**: Execute one small real swap on Base Mainnet.
**Tasks**:
- Configure manual trade parameters (e.g., $1 ETH to USDC).
- Perform Step A: Approve exact USDC amount to 0x `allowanceTarget`.
- Perform Step B: Submit swap via 0x relay.
- Verify transaction success and final balance changes.

**Acceptance Criteria**:
- [ ] Swap executes successfully on Base Mainnet.
- [ ] Token approval transaction confirms.
- [ ] Swap transaction confirms.
- [ ] Wallet balances update correctly (ETH down, USDC up).
- [ ] Final balance deviation is within 0.5% slippage tolerance.

---

### M5: Hysteresis Loop & Gas Reserve
**Goal**: Implement 5% hysteresis band and hard gas reserve enforcement.
**Tasks**:
- Calculate target allocation for each token.
- Compute current allocation based on on-chain balances.
- Detect drift from target (>500 bps or <-500 bps).
- Implement 0.002 ETH hard gas reserve check.
  - If balance < 0.002 ETH, skip rebalance and log warning.

**Acceptance Criteria**:
- [ ] Hysteresis band is correctly set to ±5% (500 bps).
- [ ] Drift is calculated and compared against band.
- [ ] Rebalance only triggers when drift > 500 bps.
- [ ] Hard gas reserve (0.002 ETH) is enforced.
- [ ] Wallet never swaps below 0.002 ETH balance.

---

### M6: Database & Concurrency Control
**Goal**: Implement SQLite logging and run-locks.
**Tasks**:
- Create `runs` and `balances` tables per DATA.md schema.
- Implement transaction logging (timestamp, status, tx hashes, costs).
- Implement run-locks to prevent concurrent rebalances.
- Implement trading cooldown (e.g., minimum 30 minutes between runs).

**Acceptance Criteria**:
- [ ] Database tables created and schema is valid.
- [ ] Run logs are recorded for each execution.
- [ ] Run-locks prevent double execution.
- [ ] Cooldown constraint is enforced.

---

### M7: n8n Integration & Notifications
**Goal**: Setup n8n webhook trigger and Telegram notifications.
**Tasks**:
- Configure n8n workflow to trigger worker via HTTP POST.
- Implement Telegram bot to send execution status updates.
- Handle webhook errors and alert n8n orchestrator.
- Test end-to-end pipeline (n8n → worker → database → Telegram).

**Acceptance Criteria**:
- [ ] n8n workflow triggers worker successfully.
- [ ] Worker responds with HTTP 200 on success.
- [ ] Telegram notifications are sent on success/failure.
- [ ] Errors are logged to database and n8n.
- [ ] End-to-end pipeline works as expected.

---

## Long-Term V2 Roadmap

### V2.1: Smart Contract Custody
- Multi-sig wallet (Gnosis Safe) integration.
- Advanced security features (role-based access control via Zodiac Roles Modifier).

### V2.2: Yield Integration
- Liquid yield protocols (Morpho Blue, Aave, Compound) integration.
- Staking/unstaking flows for LP tokens.

### V2.3: Multi-Aggregator Routing
- Price point hunting across multiple DEXs.
- Dynamic venue routing for optimal gas efficiency.
- Multi-hop swap support.

### V2.4: Advanced Monitoring
- Portfolio performance analytics.
- Alerting on abnormal balance drifts.
- Custom reporting dashboards.

### V2.5: Production Hardening
- Comprehensive testing (unit, integration, E2E).
- Rate limiting and circuit breakers.
- Advanced gas optimization strategies.
