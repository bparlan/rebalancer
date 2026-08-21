I reviewed the guide as an implementation document rather than taking its architecture at face value. The overall direction is sound, but **I would not deploy the supplied code**. It contains several issues that are harmless in a conceptual diagram but dangerous once the wallet can actually sign transactions.

The good news: the MVP can be substantially simpler than the guide suggests.

## 1. Problem reframe

Your actual MVP requirement is not yet:

> “Build an autonomous portfolio-rebalancing bot.”

It is:

> **Build a controlled Base wallet execution pipeline that can safely quote, approve, simulate, and execute a small real swap, with n8n orchestrating it.**

That distinction matters.

The first milestone should be:

```text
n8n
  │
  │ authenticated HTTP
  ▼
rebalance-worker
  │
  ├── verify Base chain
  ├── read wallet balances
  ├── obtain quote
  ├── verify quote / limits
  ├── approve exact allowance
  ├── simulate transaction
  ├── send transaction
  └── wait + record receipt
```

Only after that works should the allocation engine decide _which_ swaps to execute.

The supplied guide mixes these concerns together.

---

# 2. Critical review of the supplied guide

### What is good

The architecture has the right general shape:

- Base
- EOA wallet for MVP
- Docker worker
- n8n orchestration
- external swap aggregator
- SQLite persistence
- dry-run capability
- explicit allocation configuration
- transaction logging

The original document correctly identifies the core flow as price → allocation → swap → sign → broadcast → receipt.

I would preserve that architecture.

But several implementation details need to change.

---

## 2.1 The 1inch integration is outdated

The guide uses:

```text
https://api.1inch.io/v5.0/<chainId>/swap
```

and builds the transaction directly from that response.

I would **not build the MVP around this API**.

For this implementation I recommend **0x Swap API v2 / AllowanceHolder**.

The current 0x flow is explicitly:

1. API key
2. indicative price
3. allowance
4. firm quote
5. submit transaction

and the v2 quote returns executable transaction data. ([0x][1])

This also eliminates a major mistake in the supplied guide: it assumes the transaction's `to` address should automatically become the ERC-20 approval target.

It should not.

0x explicitly says the allowance must be granted to the `AllowanceHolder` target returned by the API, **not the Settler contract**. ([0x][1])

---

# 2.2 OpenZeppelin cannot be imported into JavaScript like this

The guide contains:

```js
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
```

This is simply wrong for the proposed Node.js application.

`SafeERC20` is a Solidity library. You're not compiling Solidity.

You don't need OpenZeppelin at all for the MVP worker.

Use:

```js
ethers.Contract;
```

with a minimal ERC-20 ABI:

```js
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
```

That's enough.

---

# 2.3 CoinGecko lookup is conceptually broken

The guide does:

```js
https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}
```

So:

```text
WSTETH → wsteth
LINK   → link
AAVE   → aave
```

CoinGecko uses **coin IDs**, not arbitrary token symbols.

More importantly, you don't actually need CoinGecko for the execution MVP.

The swap aggregator already gives you a market quote for the exact:

```text
sellToken
buyToken
sellAmount
```

That is much more relevant than an unrelated USD oracle.

### Recommendation

For MVP:

**Don't build portfolio valuation around CoinGecko.**

Use:

```text
USDC as accounting unit
        ↓
quote each token → USDC
        ↓
portfolio valuation
```

Later you can add independent price sources as a sanity check.

---

# 2.4 `Number()` is unacceptable for token amounts

The guide does:

```js
Number(ethers.formatUnits(raw, meta.decimals));
```

This is dangerous.

ERC-20 values are integer quantities with potentially 6, 8, 18 or more decimals.

JavaScript `Number` loses precision.

Never turn on-chain balances into floating-point numbers for transaction calculations.

Use:

```js
bigint;
```

for token quantities.

Use decimal libraries only when you genuinely need decimal arithmetic for portfolio calculations.

---

# 2.5 The slippage implementation is wrong

The guide calculates:

```js
minOut: amountOut * 0.995;
```

but then doesn't actually use that `minOut` to enforce execution safety.

The real quote must contain the execution constraints.

With 0x v2, request:

```text
slippageBps=50
```

for 0.50%, for example.

0x's current API explicitly supports `slippageBps` and returns quote transaction data. ([0x][2])

---

# 2.6 Unlimited approvals should not be the MVP default

The guide says:

> Approve unlimited (`MaxUint256`) once per token.

and calls that safe.

I disagree.

This is exactly the sort of thing I would **not introduce into an automated wallet MVP**.

Start with:

```text
allowance = exact sell amount
```

or perhaps:

```text
allowance = sell amount + small operational buffer
```

That makes the blast radius much smaller.

Once the system is mature, you can make an explicit decision about persistent allowances.

---

# 2.7 Hard-coded gas prices are wrong

The guide has:

```js
maxFeePerGas: ethers.parseUnits("0.0015", "gwei");
maxPriorityFeePerGas: ethers.parseUnits("0.001", "gwei");
```

Don't do this.

Gas pricing is runtime information.

Base's production network is chain ID `8453`; Base explicitly describes its public RPC as rate-limited and recommends a production node provider for production systems. ([Base documentation][3])

For MVP:

```text
quote
 ↓
use quote transaction parameters
 ↓
estimate gas
 ↓
apply conservative ceiling
 ↓
send
```

Do not invent a fixed gas price.

---

# 2.8 The gas-cost estimate is not trustworthy

The supplied:

```text
180k gas
$0.09
```

and:

```text
$1.50–$2/day
```

should not be treated as architecture assumptions.

The actual cost depends on:

- route
- calldata
- L2 gas
- L1 data fee
- current network conditions
- aggregator
- approval transaction
- number of swaps

Calculate actual transaction cost from the receipt.

---

# 2.9 The allocation algorithm should not execute multiple swaps blindly

The guide creates a list:

```text
WSTETH → LINK
WSTETH → AAVE
...
```

and executes them sequentially.

That introduces another problem:

```text
quote 1
execute 1
quote 2
execute 2
quote 3
execute 3
```

The market can change between those transactions.

For MVP I would impose:

```text
max 1 swap / run
```

Then later:

```text
max 2 swaps / run
```

This is a much better operational constraint than trying to build an elegant greedy optimizer immediately.

---

# 2.10 `n8n → docker exec` is fragile

The original guide suggests:

```text
docker exec rebalance-container node /app/rebalance.js
```

I would avoid coupling n8n to the worker's container name/process layout.

Use:

```text
n8n
  ↓ HTTP POST
worker /run
```

with:

```text
Authorization: Bearer <shared-secret>
```

and preferably keep the worker behind the internal Docker/Coolify network rather than exposing it publicly.

This gives you a clean boundary:

```text
n8n = orchestration
worker = blockchain execution
```

That's a much better architecture.

---

# 2.11 Do not put the private key in general application configuration

The guide says Coolify secret or Vault. That's directionally correct.

For your MVP:

```text
PRIVATE_KEY
BASE_RPC_URL
ZEROX_API_KEY
WORKER_AUTH_TOKEN
```

should be runtime secrets.

But the architectural boundary should be:

```text
n8n
  NEVER sees PRIVATE_KEY

worker
  sees PRIVATE_KEY
```

That's important.

---

# 3. Recommended MVP architecture

I would build this:

```text
                         ┌──────────────────┐
                         │      n8n         │
                         │                  │
                         │ Cron / Manual    │
                         │ notification     │
                         └────────┬─────────┘
                                  │
                         POST /run
                         auth token
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   rebalance-worker      │
                    │   Node.js + ethers      │
                    │                         │
                    │  1. chain check         │
                    │  2. wallet check        │
                    │  3. balances            │
                    │  4. allocation          │
                    │  5. quote               │
                    │  6. policy checks       │
                    │  7. allowance           │
                    │  8. simulate            │
                    │  9. send                │
                    │ 10. receipt             │
                    └──────┬──────────┬───────┘
                           │          │
                    Base RPC          │ 0x API
                           │          │
                           ▼          ▼
                       ┌───────┐   ┌──────┐
                       │ Base  │   │ 0x   │
                       │ 8453  │   │ API  │
                       └───────┘   └──────┘
```

And initially:

```text
ONE wallet
ONE chain
ONE stablecoin
ONE or two tokens
ONE swap per run
NO automatic rebalancing
NO unlimited approvals
NO Safe
NO UI
NO profit-taking
NO multi-source oracle
```

That's the correct MVP.

---

# 4. Build order

Do **not** start with the 5-token rebalancer.

Build these milestones:

```text
M0 — wallet + Base connectivity
M1 — read balances
M2 — quote only
M3 — approval
M4 — one real swap
M5 — transaction persistence
M6 — n8n orchestration
M7 — dry-run allocation engine
M8 — controlled automatic rebalance
```

The important milestone is:

> **M4: one small real transaction successfully completes end-to-end.**

Everything before it is infrastructure.

---

# 5. Step 1 — Create a dedicated MVP wallet

Do not use your personal wallet.

Create:

```text
Base Rebalancer MVP EOA
```

Treat it as a disposable hot wallet.

Its purpose:

```text
testing
small capital
limited approvals
limited exposure
```

If it gets compromised, the loss should be boring.

### Wallet policy

For the initial test:

```text
$20–100 total capital
```

not thousands.

And keep a small amount of native ETH for Base gas.

---

# 6. Step 2 — Use Base mainnet, but start with a manual transaction

Base mainnet is chain:

```text
8453
```

Base Sepolia is:

```text
84532
```

The official Base documentation confirms both. ([Base documentation][3])

For development you can use Base Sepolia, but there is an important caveat:

**Your real 0x routing universe and your production token liquidity are not necessarily equivalent on testnet.**

Therefore I would use:

### Stage A

Base Sepolia:

```text
wallet
RPC
ERC20
HTTP worker
n8n
```

### Stage B

Base mainnet with:

```text
$10–20 test capital
```

for the first real swap.

That gives you much better confidence than trying to emulate production DeFi liquidity entirely on testnet.

---

# 7. Step 3 — Project structure

Create:

```text
base-rebalancer/
├── src/
│   ├── server.js
│   ├── worker.js
│   ├── config.js
│   ├── chain.js
│   ├── tokens.js
│   ├── balances.js
│   ├── quote.js
│   ├── approvals.js
│   ├── policy.js
│   ├── execute.js
│   └── db.js
│
├── config/
│   └── portfolio.json
│
├── test/
│   ├── policy.test.js
│   └── amounts.test.js
│
├── Dockerfile
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

Don't create 40 abstractions.

This is enough.

---

# 8. Step 4 — Initialize Node

Use Node 22 rather than Node 20 for a new project.

```bash
mkdir -p ~/devcode/base-rebalancer
cd ~/devcode/base-rebalancer

npm init -y

npm install ethers axios express better-sqlite3 dotenv
npm install -D vitest
```

Set:

```json
{
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "run": "node src/worker.js",
    "test": "vitest run"
  }
}
```

Do not install OpenZeppelin.

You don't need it.

---

# 9. Step 5 — Environment variables

Create `.env.example`:

```env
BASE_RPC_URL=https://YOUR_RPC_PROVIDER
BASE_CHAIN_ID=8453

PRIVATE_KEY=replace_me

ZEROX_API_KEY=replace_me

WORKER_AUTH_TOKEN=replace_me

DRY_RUN=true

MAX_SWAP_USD=25
MAX_SLIPPAGE_BPS=50
MIN_SWAP_USD=5
```

Never commit `.env`.

```gitignore
.env
*.db
node_modules/
```

---

# 10. Step 6 — Chain guard

This should be the **first blockchain operation**.

Conceptually:

```js
const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);

const network = await provider.getNetwork();

if (network.chainId !== 8453n) {
  throw new Error(`Wrong chain: expected Base 8453, got ${network.chainId}`);
}
```

Base documents `0x2105` / `8453` as Base mainnet. ([Base documentation][4])

This check is not optional.

You don't want:

```text
production PRIVATE_KEY
+
wrong RPC
+
sign transaction
```

---

# 11. Step 7 — Token registry

Do not start with five tokens.

Start:

```text
USDC
WETH
```

Then add:

```text
WSTETH
LINK
UNI
AAVE
MORPHO
```

one by one.

For native USDC on Base, the address is:

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

and it uses 6 decimals. The current 0x documentation also uses this Base USDC address in its agent/payment example. ([0x][5])

Morpho's official documentation lists Base MORPHO as:

```text
0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842
```

and states MORPHO has 18 decimals. ([Morpho Docs][6])

Uniswap's official developer documentation currently lists Base UNI as:

```text
0xc3De830EA07524a0761646a6a4e4be0e114a3C83
```

([Uniswap Developers][7])

For the remaining assets, **verify against their current official deployment documentation before adding them** rather than copying addresses from a generic token list.

Example:

```js
export const TOKENS = {
  USDC: {
    address: "0x833589fCD6eDbB6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
  },

  // Add verified addresses only.
};
```

And validate metadata at startup:

```text
contract.decimals()
contract.symbol()
```

against your configuration.

If configuration says:

```text
USDC / 6
```

but chain says:

```text
USDC / 18
```

the process must abort.

---

# 12. Step 8 — Wallet startup checks

At startup:

```text
private key exists?
        ↓
wallet address
        ↓
chain == 8453?
        ↓
ETH balance > minimum?
        ↓
token metadata valid?
        ↓
worker ready
```

Log:

```text
wallet: 0x1234...abcd
chain: Base 8453
ETH: 0.00xx
USDC: xx.xx
mode: DRY_RUN
```

Never log:

```text
PRIVATE_KEY
seed
mnemonic
```

---

# 13. Step 9 — Read balances

Use `bigint`.

Example:

```js
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
```

Then:

```js
const rawBalance = await token.balanceOf(wallet.address);
```

Keep:

```text
rawBalance = bigint
```

through the transaction pipeline.

Only format it for display:

```js
ethers.formatUnits(rawBalance, decimals);
```

---

# 14. Step 10 — Add USDC as the accounting asset

This is one of the biggest architectural changes I recommend.

Don't calculate:

```text
CoinGecko USD price
×
floating-point token balance
```

Instead use:

```text
token → USDC quote
```

For example:

```text
1 WETH → 3,xxx USDC
```

The quote itself represents the executable market value.

Then portfolio valuation becomes:

```text
WETH value
+
WSTETH value
+
LINK value
+
...
+
USDC
```

That makes your accounting much closer to actual execution reality.

---

# 15. Step 11 — Integrate 0x v2

Create:

```text
src/quote.js
```

The current 0x API requires:

```text
0x-api-key
0x-version: v2
```

and uses:

```text
/swap/allowance-holder/price
/swap/allowance-holder/quote
```

for the recommended AllowanceHolder flow. ([0x][1])

For example:

```js
const params = new URLSearchParams({
  chainId: "8453",
  sellToken: sellToken,
  buyToken: buyToken,
  sellAmount: sellAmount.toString(),
  taker: wallet.address,
  slippageBps: "50",
});

const response = await axios.get(
  `https://api.0x.org/swap/allowance-holder/quote?${params}`,
  {
    headers: {
      "0x-api-key": process.env.ZEROX_API_KEY,
      "0x-version": "v2",
    },
  },
);
```

The important thing is that `sellAmount` is the **raw token amount**.

For 10 USDC:

```text
10 × 10^6
```

not:

```text
10
```

---

# 16. Step 12 — Validate the quote before doing anything

This is your policy boundary.

Given:

```text
quote
```

validate:

### Chain

```text
chainId == 8453
```

### Sell token

Must equal requested token.

### Buy token

Must equal requested token.

### Taker

Must equal:

```text
wallet.address
```

### Sell amount

Must equal requested amount.

### Output

Must exceed minimum expected amount.

### Slippage

Must be:

```text
<= configured MAX_SLIPPAGE_BPS
```

### USD value

Must be:

```text
<= MAX_SWAP_USD
```

### Contract destination

Must be a recognized 0x transaction destination returned by the quote.

Don't blindly trust arbitrary configuration.

---

# 17. Step 13 — Approval flow

This is where the supplied guide is particularly dangerous.

The current 0x API exposes the allowance target through:

```text
allowanceTarget
```

or:

```text
issues.allowance.spender
```

and 0x explicitly warns not to approve the Settler contract. ([0x][1])

Your flow should be:

```text
quote
 ↓
read allowance
 ↓
allowance >= sellAmount?
 ├── yes → continue
 └── no
       ↓
 approve allowance target
       ↓
 wait receipt
       ↓
 continue
```

For MVP:

```js
approve(spender, sellAmount);
```

not:

```js
approve(spender, MaxUint256);
```

---

# 18. Step 14 — Simulate before broadcasting

This should happen after approval.

Conceptually:

```text
quote transaction
       ↓
eth_estimateGas
       ↓
success?
 ├── NO → abort
 └── YES
       ↓
sendTransaction()
```

If gas estimation fails:

**do not retry blindly.**

Persist:

```text
quote
error
token
amount
timestamp
```

and notify n8n.

This gives you a useful debugging artifact.

---

# 19. Step 15 — Implement an explicit dry-run mode

Your worker should support:

```env
DRY_RUN=true
```

In dry-run:

```text
read balances
calculate plan
request quote
validate quote
calculate gas
calculate expected result
STOP
```

It must **not**:

```text
approve
send
```

The output should look roughly like:

```text
MODE: DRY_RUN

Wallet:
  0x....

Portfolio:
  USDC   $42.18
  WETH   $57.91

Plan:
  SELL WETH
  BUY USDC

Amount:
  0.00xxxx WETH

Quote:
  xxx USDC

Slippage:
  0.50%

Estimated gas:
  $0.xx

ACTION:
  NO TRANSACTION SENT
```

This is your most important debugging tool.

---

# 20. Step 16 — First real transaction

Now switch:

```env
DRY_RUN=false
```

But **do not enable the rebalancer yet**.

Add an explicit operation:

```text
POST /run?mode=test_swap
```

or configuration:

```json
{
  "mode": "single_swap"
}
```

The first transaction should be something trivial.

For example:

```text
USDC → WETH
```

with:

```text
$5–10
```

Then:

```text
quote
→ approval
→ simulation
→ transaction
→ receipt
```

Only one transaction.

---

# 21. Step 17 — Verify the first transaction manually

After sending:

```js
const tx = await wallet.sendTransaction({
  to: quote.transaction.to,
  data: quote.transaction.data,
  value: quote.transaction.value ?? "0x0",
});
```

Then:

```js
const receipt = await tx.wait();
```

Persist:

```text
tx_hash
block_number
status
gas_used
effective_gas_price
timestamp
sell_token
buy_token
sell_amount
expected_buy_amount
```

Then inspect the transaction in Base explorer.

Base's official docs identify Base Mainnet as chain 8453 and provide explorer/network information. ([Base documentation][8])

Do not consider the test successful merely because:

```text
sendTransaction()
```

returned a hash.

Success is:

```text
receipt.status === 1
```

and the wallet's balances actually changed as expected.

---

# 22. Step 18 — Build SQLite persistence

Use something like:

```sql
CREATE TABLE runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    wallet TEXT NOT NULL,
    sell_token TEXT,
    buy_token TEXT,
    sell_amount TEXT,
    expected_buy_amount TEXT,
    tx_hash TEXT,
    block_number INTEGER,
    gas_used TEXT,
    error TEXT
);
```

Notice:

```text
sell_amount TEXT
```

rather than `REAL`.

That's deliberate.

You don't want SQLite floating-point conversion corrupting token quantities.

---

# 23. Step 19 — Add the policy engine

This should be a separate module.

Think:

```text
strategy
    ↓
proposed transaction
    ↓
policy
    ↓
execution
```

The policy should answer:

```text
Can this transaction happen?
```

Example:

```js
function validateTrade(trade, config) {
  if (trade.usdValue > config.maxSwapUsd) {
    throw new Error("MAX_SWAP_USD exceeded");
  }

  if (trade.slippageBps > config.maxSlippageBps) {
    throw new Error("MAX_SLIPPAGE_BPS exceeded");
  }

  if (trade.sellToken === trade.buyToken) {
    throw new Error("Self swap");
  }

  return true;
}
```

This separation is important.

Don't bury risk controls inside the strategy algorithm.

---

# 24. Step 20 — Add the allocation configuration

Only now introduce:

```json
{
  "assets": {
    "USDC": 0.2,
    "WETH": 0.2,
    "WSTETH": 0.2,
    "LINK": 0.2,
    "MORPHO": 0.2
  },

  "rebalanceBand": 0.05,

  "maxSwapUsd": 25,

  "minSwapUsd": 5,

  "maxSlippageBps": 50,

  "maxSwapsPerRun": 1
}
```

But I would **not start at 20% each**.

For testing:

```json
{
  "USDC": 0.5,
  "WETH": 0.5
}
```

Why?

Because you want the simplest possible state transition.

---

# 25. Step 21 — Rebalance calculation

The logic should be:

```text
current holdings
       ↓
valuation
       ↓
current %
       ↓
target %
       ↓
deviation
       ↓
outside band?
       ├── no → SKIP
       └── yes
             ↓
         trade candidate
```

For example:

```text
Target:

USDC 50%
WETH 50%

Current:

USDC 70%
WETH 30%
```

with:

```text
band = ±5 percentage points
```

then:

```text
USDC: +20%
WETH: -20%
```

Candidate:

```text
SELL USDC
BUY WETH
```

But impose:

```text
maxSwapUsd = $25
```

so the bot does not attempt to correct the entire portfolio in one transaction.

---

# 26. Important correction: the margin is percentage points

The supplied guide uses:

```js
target ± safeMargin
```

with:

```text
target = 0.20
safeMargin = 0.05
```

That means:

```text
15% → 25%
```

This is fine.

But call it:

```text
rebalanceBand
```

rather than:

```text
safeMargin
```

because "safe" is misleading.

It is not a safety mechanism.

It is a **trading hysteresis band**.

Actual safety controls are:

```text
maxSwapUsd
maxSlippageBps
maxSwapsPerRun
maxDailyVolume
allowedTokens
allowedSpenders
allowedChainId
```

---

# 27. Step 22 — Add daily limits

This is missing from the original architecture.

Add:

```json
{
  "maxSwapUsd": 25,
  "maxDailyVolumeUsd": 100,
  "maxSwapsPerRun": 1,
  "maxSlippageBps": 50
}
```

Before every trade:

```text
today's executed volume
+
new trade
<
maxDailyVolume
```

If not:

```text
ABORT
```

This protects you from a runaway n8n workflow.

---

# 28. Step 23 — Add a cooldown

Also add:

```text
minimum interval between trades
```

For example:

```text
2 hours
```

This prevents:

```text
n8n duplicate trigger
→ trade
→ second trigger
→ trade back
```

A portfolio bot without idempotency/cooldown is fragile.

---

# 29. Step 24 — Make execution idempotent

Every run gets:

```text
run_id
```

Example:

```text
2026-08-15T13:00:00Z:wallet:rebalance
```

Before executing:

```text
Is there already an EXECUTED/PENDING run for this interval?
```

If yes:

```text
SKIP
```

This protects against n8n retries.

---

# 30. Step 25 — Build the HTTP worker

The worker should expose:

```text
GET /health
POST /run
GET /status
```

### `/health`

No private information.

Return:

```json
{
  "status": "ok",
  "chainId": 8453,
  "mode": "dry_run"
}
```

### `/run`

Require:

```http
Authorization: Bearer ...
```

Then:

```text
request
 ↓
authentication
 ↓
run lock
 ↓
worker
 ↓
response
```

---

# 31. Step 26 — Add a run lock

You don't want:

```text
n8n run #1
      ↓
slow quote
      ↓
n8n run #2
      ↓
both execute
```

Implement:

```text
RUNNING
```

state.

If another invocation arrives:

```json
{
  "status": "already_running"
}
```

and exit.

---

# 32. Step 27 — n8n workflow

Your n8n workflow becomes very simple:

```text
Cron
 │
 ▼
HTTP Request
 │
 ▼
IF
 ├── executed → notification
 ├── skipped  → optional notification
 └── failed   → alert
```

Start with:

```text
Manual Trigger
```

not Cron.

Then:

```text
Manual
→ Dry Run
```

Then:

```text
Manual
→ Real single swap
```

Then:

```text
Cron
→ Dry Run
```

Then:

```text
Cron
→ Real rebalancing
```

That's the progression.

---

# 33. Step 28 — Don't let n8n contain trading logic

n8n should not calculate:

```text
WETH = 23.7%
LINK = 18.2%
...
```

That belongs in the worker.

n8n's job:

```text
WHEN?
→ call worker

WHAT HAPPENED?
→ notify
```

Worker's job:

```text
WHAT?
→ decide

CAN WE?
→ policy

HOW?
→ quote

EXECUTE?
→ sign/send
```

This separation will save you pain later.

---

# 34. Step 29 — Notification payload

Return something structured:

```json
{
  "runId": "abc123",
  "status": "executed",
  "wallet": "0x...",
  "chainId": 8453,
  "trade": {
    "sell": "USDC",
    "buy": "WETH",
    "sellAmount": "5000000",
    "expectedBuyAmount": "..."
  },
  "transaction": {
    "hash": "0x...",
    "blockNumber": 123456
  }
}
```

Then n8n can turn that into:

```text
✅ Base rebalance

SELL: 5 USDC
BUY: 0.00xxx WETH

TX:
0x....

Status: confirmed
```

---

# 35. Step 30 — Add emergency controls

Have these environment/config switches:

```env
TRADING_ENABLED=false
DRY_RUN=true
```

The worker should require:

```text
TRADING_ENABLED=true
AND
DRY_RUN=false
```

before broadcasting.

That gives you an immediate kill switch.

---

# 36. Step 31 — Add a token allowlist

Never allow the worker to execute arbitrary tokens received through HTTP.

Have:

```js
ALLOWED_TOKENS = {
  USDC: "...",
  WETH: "...",
  WSTETH: "...",
  LINK: "...",
  UNI: "...",
  AAVE: "...",
  MORPHO: "...",
};
```

Then reject:

```text
unknown sell token
unknown buy token
```

This is especially important if the worker's API is ever accidentally exposed.

---

# 37. Step 32 — Add a transaction destination allowlist

Similarly, don't blindly send arbitrary calldata.

At minimum validate the quote's transaction against the expected aggregator contract configuration.

For the MVP, I'd additionally log:

```text
quote.transaction.to
```

on every transaction and make unexpected destinations a hard failure.

---

# 38. Step 33 — Test failure modes before automation

You need to deliberately test:

### Wrong chain

```text
RPC → Ethereum
```

Expected:

```text
ABORT
```

### Missing ETH

Expected:

```text
ABORT
```

### Insufficient token balance

Expected:

```text
ABORT
```

### Quote unavailable

Expected:

```text
ABORT + notification
```

### Slippage > limit

Expected:

```text
ABORT
```

### Trade > maxSwapUsd

Expected:

```text
ABORT
```

### Duplicate run

Expected:

```text
SKIP
```

### Worker already running

Expected:

```text
SKIP
```

### `TRADING_ENABLED=false`

Expected:

```text
DRY-RUN / BLOCKED
```

This is much more important than adding another price source.

---

# 39. Step 34 — Dockerize only after local execution works

Dockerfile:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY config ./config

USER node

CMD ["node", "src/server.js"]
```

Don't put `.env` in the image.

Coolify injects it.

---

# 40. Step 35 — Coolify deployment

Create:

```text
base-rebalancer-worker
```

as a Docker service.

Secrets:

```text
BASE_RPC_URL
PRIVATE_KEY
ZEROX_API_KEY
WORKER_AUTH_TOKEN
```

Configuration:

```text
TRADING_ENABLED=false
DRY_RUN=true
MAX_SWAP_USD=25
MAX_SLIPPAGE_BPS=50
```

Initially:

```text
TRADING_ENABLED=false
DRY_RUN=true
```

Even if somebody accidentally invokes `/run`, no transaction can be broadcast.

---

# 41. Step 36 — Connect n8n

Configure:

```text
Manual Trigger
     ↓
HTTP Request
     ↓
POST /run
     ↓
Authorization: Bearer ...
```

Don't configure Cron yet.

Run manually.

---

# 42. Step 37 — First production dry run

The first VPS run should produce:

```text
wallet verified
chain verified
balances verified
allocation calculated
quote retrieved
quote validated
gas estimated
NO TRANSACTION SENT
```

If any of those fail:

**stop.**

Do not move to live mode until dry-run is clean.

---

# 43. Step 38 — First live transaction

Change only:

```env
TRADING_ENABLED=true
DRY_RUN=false
```

Do **not** simultaneously change:

```text
tokens
allocation
cron
maxSwap
slippage
```

One change at a time.

Run manually.

Expected:

```text
approval tx
     ↓
approval confirmed
     ↓
swap simulation
     ↓
swap tx
     ↓
receipt confirmed
     ↓
balance verification
```

---

# 44. Step 39 — Verify balances after execution

This should be mandatory.

Before:

```text
USDC = X
WETH = Y
```

After:

```text
USDC = X - sell
WETH = Y + buy - fees/rounding
```

The worker should re-read the balances.

Don't trust the quote alone.

---

# 45. Step 40 — Only then enable two-token automatic rebalancing

Your first real strategy should be:

```text
USDC
WETH
```

with:

```text
50 / 50
```

and:

```text
±5%
```

Then:

```text
maxSwapUsd = $25
maxSwapsPerRun = 1
```

Run every:

```text
5 hours
```

only after the manual workflow has survived several successful runs.

---

# 46. Step 41 — Add assets progressively

Then:

### Phase 1

```text
USDC
WETH
```

### Phase 2

```text
USDC
WETH
WSTETH
```

### Phase 3

```text
USDC
WETH
WSTETH
LINK
```

### Phase 4

```text
USDC
WETH
WSTETH
LINK
UNI
AAVE
MORPHO
```

Don't add all five at once.

You need to discover:

```text
liquidity
price impact
quote reliability
gas
approval behavior
routing
```

per asset.

---

# 47. One major strategic objection: don't call this a "profit" engine yet

The original guide says the stablecoin mechanism can:

> “often end the day with a slightly higher USD-denominated portfolio value”

That is not something the architecture guarantees.

A rebalancer is not automatically a profitable strategy.

It creates:

```text
systematic buying/selling
```

It does not create alpha.

Profitability depends on:

```text
volatility
mean reversion
fees
slippage
gas
asset correlations
trend behavior
rebalance frequency
```

A strong bull trend can make a rebalancer continuously sell the outperformer.

So initially call it:

> **Automated portfolio rebalancing infrastructure**

not:

> profit bot.

That's an important conceptual distinction.

---

# 48. Recommended final MVP architecture

I'd therefore freeze the MVP at:

```text
                    ┌───────────────┐
                    │     n8n       │
                    │               │
                    │ manual / cron │
                    └───────┬───────┘
                            │
                         HTTPS
                      Bearer token
                            │
                            ▼
                ┌──────────────────────┐
                │ rebalance-worker     │
                │                      │
                │ ethers v6            │
                │ Express              │
                │ SQLite               │
                └──────────┬───────────┘
                           │
              ┌────────────┼─────────────┐
              ▼            ▼             ▼
          Base RPC       0x API       SQLite
              │            │
              ▼            ▼
          Wallet       Quote/Routing
```

With these hard limits:

```text
Chain              Base 8453
Wallet             Dedicated EOA
Accounting         USDC
Aggregator         0x Swap API v2
Allowance          AllowanceHolder
Approval           Exact amount
Max swap           $25
Max swaps/run      1
Max slippage       0.50%
Daily volume       $100
Cooldown           2h
Dry-run            supported
Kill switch        supported
Private key        worker only
n8n                no blockchain logic
```

---

# 49. The actual implementation sequence I recommend

If you're going to build this with your agentic coding setup, give it these milestones rather than one giant prompt:

```text
M0
Base wallet + RPC + chain verification

M1
ERC20 registry + balance reader

M2
0x v2 quote integration

M3
Quote validation + policy engine

M4
Exact allowance + approval flow

M5
Gas estimation + transaction simulation

M6
Single real USDC/WETH swap

M7
Receipt + SQLite persistence

M8
HTTP worker API + authentication

M9
n8n manual trigger

M10
Dry-run portfolio valuation

M11
Two-asset rebalance engine

M12
Automated cron execution

M13+
Additional assets and strategy improvements
```

**Do not let the coding agent implement M0–M13 as one task.** That's how you end up with a superficially complete trading bot whose safety boundaries haven't actually been tested.

---

# 50. Your immediate next action

I would **not start by implementing the full guide**.

Start with this exact first vertical slice:

```text
Dedicated Base wallet
        ↓
Base RPC
        ↓
ethers
        ↓
verify chain 8453
        ↓
read ETH balance
        ↓
read USDC balance
        ↓
0x v2 price
        ↓
0x v2 firm quote
        ↓
print quote
        ↓
STOP
```

Then the second slice:

```text
quote
 ↓
allowance
 ↓
exact approval
 ↓
wait
 ↓
STOP
```

Then:

```text
quote
 ↓
approve
 ↓
estimate gas
 ↓
send $5–10 swap
 ↓
wait receipt
 ↓
verify balances
```

Once **that** works, you have the real foundation for the MVP wallet.

Everything else—allocation math, five-token portfolio, n8n cron, profit filters, notifications—is secondary.

The original guide gets the architecture approximately right, but it is **too optimistic about the execution layer**. The biggest corrections are replacing the obsolete 1inch implementation, removing the invalid OpenZeppelin import, eliminating floating-point token arithmetic, using the current 0x v2 allowance/quote model, treating approvals as a security boundary, and making the worker policy-driven rather than allowing the strategy to directly execute transactions. 0x's current documentation supports the v2 AllowanceHolder flow and specifically recommends that model for simpler/safe integrations. ([0x][1])

For Base itself, use a production RPC provider rather than the public endpoint once this is live; Base explicitly labels the public RPC as rate-limited/not for production systems. ([Base documentation][8])

### Definition of MVP success

I would call the MVP complete when this exact sequence works reliably:

```text
n8n Manual Trigger
        ↓
Authenticated worker call
        ↓
Base 8453 verified
        ↓
Dedicated wallet verified
        ↓
USDC/WETH balances read
        ↓
0x firm quote obtained
        ↓
Quote passes policy
        ↓
Exact allowance approved
        ↓
Transaction simulated
        ↓
Small swap broadcast
        ↓
Receipt confirmed
        ↓
Balances re-read
        ↓
SQLite record written
        ↓
n8n reports TX hash + result
```

**Only after that should we turn on autonomous rebalancing.**

That gives you a genuinely testable wallet execution system rather than prematurely building a "trading bot."

[1]: https://docs.0x.org/docs/introduction/quickstart/swap-tokens-with-0x-swap-api?utm_source=chatgpt.com "Get Started with Swap API | 0x Docs"
[2]: https://docs.0x.org/api-reference/evm-ap-is/swap/allowanceholder-getprice?utm_source=chatgpt.com "getPrice (Allowance Holder) | 0x Docs"
[3]: https://docs.base.org/base-chain/api-reference/rpc-overview?utm_source=chatgpt.com "Base RPC Overview - Base Documentation"
[4]: https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId?utm_source=chatgpt.com "eth_chainId - Base Documentation"
[5]: https://docs.0x.org/docs/introduction/develop-with-ai/autonomous-agent-payments?utm_source=chatgpt.com "Autonomous Agent Payments | 0x Docs"
[6]: https://docs.morpho.org/developers/contracts/addresses/?utm_source=chatgpt.com "Addresses | Morpho Docs"
[7]: https://developers.uniswap.org/docs/ecosystem/governance/uni?utm_source=chatgpt.com "UNI Token | Uniswap Developers"
[8]: https://docs.base.org/base-chain/quickstart/connecting-to-base?utm_source=chatgpt.com "Connecting to Base - Base Documentation"
