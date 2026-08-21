# Oh My Pi Rebalancer MVP Implementation Tasks

- [ ] **M1: Basic Provider Connection**
  - [ ] Initialize ethers.js v6 provider for Base Mainnet (Chain ID: 8453).
  - [ ] Set up secure EOA wallet instantiation from `process.env.PRIVATE_KEY` without logging keys.
  - [ ] Implement robust chain guard asserting on-chain ID is exactly 8453.
  - [ ] Read and log on-chain native ETH balance and USDC contract balance.
  - [ ] Subtract 0.002 ETH dynamic gas reserve from native balance to log "Usable ETH Balance" separately.

- [ ] **M2: 0x Swap API v2 Integration**
  - [ ] Fetch indicative price and check token allowance for USDC against 0x v2 `allowanceTarget`.
  - [ ] Implement query for executable quotes with strict 0.5% (50 basis points) max slippage limits.
  - [ ] Implement validation engine to reject quotes with over-limit slippage.

- [ ] **M3: Transaction Cost Policy Utility**
  - [ ] Implement `estimateGasCostInUSD()` converting gas limit and gas price to USD using current execution-time ETH rate.
  - [ ] Implement total-cost accounting validating if `portfolio_value_gain > round_trip_transaction_costs`.

- [ ] **M4: Manual Real Swap Execution (Success Anchor)**
  - [ ] Build execution script supporting a safe `--dry-run` flag.
  - [ ] Execute one real, micro-sized test swap ($1 of ETH to USDC) on Base Mainnet.
  - [ ] Verify exact-amount approval confirms and balance changes match expectations within slippage limits.

- [ ] **M5: Hysteresis Loop Engine**
  - [ ] Calculate target allocation per token based on actual on-chain balances.
  - [ ] Compute current allocations and flag rebalancing execution if drift exceeds ±5% (500 bps).
  - [ ] Enforce the 0.002 ETH gas safety limit preventing swaps if wallet balance falls below reserve.

- [ ] **M6: SQLite Database Logging & Cooldowns**
  - [ ] Deploy SQLite runs and trades schema using string-based `TEXT` fields for BigInt quantities.
  - [ ] Implement run-locks (preventing concurrent rebalances) and enforce a minimum 30-minute trading cooldown between successful executions.

- [ ] **M7: VPS Orchestration & n8n webhook**
  - [ ] Configure n8n webhook HTTP POST node to trigger the worker container.
  - [ ] Integrate a Telegram bot notifier to broadcast structured success summaries or failures.
