Good. We now have enough to lock the **MVP architecture**. And the CoW/Zodiac integration changes one important part of the design: **CoW should be the preferred execution rail for ordinary portfolio trades**, while aggregators remain quote/discovery sources.

The Roles SDK explicitly provides `allowCowOrderSigning()`, `getCowQuote()`, `signCowOrder()`, and `postCowOrder()`. The current v4 architecture also expects the caller to supply the Safe avatar and Roles owner when obtaining the quote. ([Zodiac Roles Modifier][1])

## First: one important correction to the arbitrage design

I would **not** implement:

```text
3-hop arb detected
→ execute swap 1
→ execute swap 2
→ execute swap 3
```

That is fragile.

If leg #2 fails or the price moves after leg #1, you can be left holding the intermediate token.

For an autonomous $1–5k system, that's unacceptable.

Instead:

```text
                QUOTE / DISCOVERY
                        │
       ┌────────────────┼─────────────────┐
       ▼                ▼                 ▼
      CoW              0x              Odos/1inch
       │                │                 │
       └────────────────┼─────────────────┘
                        ▼
                Opportunity Engine
                        │
              ┌─────────┴──────────┐
              │                    │
       ordinary rebalance    atomic arb route
              │                    │
              ▼                    ▼
          CoW order          aggregator/router
              │                    │
              └─────────┬──────────┘
                        ▼
                 Zodiac Roles
                        │
                        ▼
                       Safe
```

**CoW is the default execution mechanism.**

For arbitrage, we only execute if the opportunity can be represented as **one atomic transaction/order**. Otherwise:

> detect → record → don't execute.

That gives us MEV protection without sacrificing the ability to discover opportunities elsewhere.

CoW's order-signing permission is particularly attractive because Roles can constrain the role to specific sell/buy token combinations rather than giving n8n generic contract-call authority. ([Zodiac Roles Modifier][1])

---

# MVP portfolio

We'll encode these as the only tradable assets:

| Token  | Base address                                  | Role           |
| ------ | --------------------------------------------- | -------------- |
| ETH    | native                                        | Core           |
| LINK   | `0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196`  | Oracle         |
| AAVE   | `0x63706e401c06ac8513145b7687a14804d17f814b`  | Lending        |
| UNI    | `0xc3de830ea07524a0761646a6a4e4be0e114a3c83`  | DEX            |
| MORPHO | `0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842`  | Lending        |
| AERO   | `0x940181a94a35a4569e4529a3cdfb74e38fd98631a` | Base liquidity |
| USDC   | canonical Base USDC                           | Reserve        |

One thing I **still need to verify before putting these into executable configuration** is that every supplied address corresponds to the intended current Base asset. I won't blindly turn user-supplied addresses into wallet permissions.

---

# The actual MVP workflow

I would now make this **six n8n workflows**, not five.

### `PF-01 — Portfolio Snapshot`

```text
Cron
  ↓
Read Safe balances
  ↓
Fetch prices
  ↓
Calculate USD NAV
  ↓
Calculate weights
  ↓
Calculate +3% bands
  ↓
Persist snapshot
```

Runs every 15 minutes.

---

### `PF-02 — Market & Quote Scanner`

This is the expensive part.

```text
Cron
  ↓
Current portfolio
  ↓
Market prices
  ↓
CoW quotes
  ↓
0x quotes
  ↓
Odos quotes
  ↓
1inch quotes
  ↓
Liquidity / price impact
  ↓
Normalize quotes
  ↓
Persist
```

The key is **normalization**.

Every quote should become something like:

```json
{
  "sellToken": "ETH",
  "buyToken": "LINK",
  "sellAmount": "1000000000000000",
  "buyAmount": "...",
  "source": "cow",
  "gasUsd": 0,
  "priceImpactBps": 21,
  "expiresAt": "...",
  "quoteId": "...",
  "atomic": true
}
```

Then we can compare apples to apples.

---

# PF-03 — Opportunity Engine

This is where your idea gets interesting.

It creates three classes of opportunities.

### A. Rebalance

```text
ETH overweight
+
LINK underweight
+
good ETH/LINK execution
```

Candidate:

```text
SELL ETH
BUY LINK
```

---

### B. Volatility harvest

Example:

```text
ETH:
+5.2% intraday

position:
+4.1% above target

USDC reserve:
adequate

expected re-entry advantage:
positive
```

Candidate:

```text
SELL small ETH amount → USDC
```

The important thing:

**+5% does not automatically mean sell.**

The engine asks whether the expected inventory benefit exceeds:

```text
fees
+
slippage
+
gas
+
MEV risk
+
opportunity cost
```

---

### C. Arbitrage

Build a graph:

```text
ETH
 ↕
LINK
 ↕
AAVE
 ↕
UNI
 ↕
MORPHO
 ↕
AERO
 ↕
USDC
```

Search:

```text
A → B → A
```

and:

```text
A → B → C → A
```

with maximum route length **3**.

But the candidate isn't:

> "prices differ."

It must be:

```text
final_amount
-
initial_amount
-
gas
-
all fees
-
slippage
-
risk buffer
> minimum_profit
```

Your minimum:

### `$1 net`

is reasonable for the MVP, but I would also require a **relative return floor**.

For example:

```text
net profit >= $1
AND
net profit >= 3 × estimated execution cost
```

Otherwise you'll discover lots of technically profitable $1.05 opportunities that are effectively noise.

---

# PF-04 — AI Portfolio Controller

This is where your eventual adaptive allocation comes in.

The AI receives:

```text
current portfolio
+
historical portfolio snapshots
+
market regime
+
volatility
+
protocol/news signals
+
quote opportunities
+
recent trades
+
failed opportunities
```

It does **not** construct arbitrary transactions.

It returns something like:

```json
{
  "allocation_adjustments": [
    {
      "asset": "ETH",
      "target_delta": -0.005,
      "reason": "elevated intraday volatility"
    }
  ],
  "opportunity_preferences": {
    "volatility_harvest": 0.82,
    "rebalance": 0.61,
    "arbitrage": 0.93
  },
  "risk_regime": "normal",
  "confidence": 0.84
}
```

Then deterministic code checks it.

---

# PF-05 — Execution Gate

This is the most important workflow.

It should be almost **boringly deterministic**.

```text
Candidate opportunity
       ↓
Token whitelist?
       ↓ yes
Correct chain?
       ↓ yes
Approved execution source?
       ↓ yes
Expected output valid?
       ↓ yes
Liquidity sufficient?
       ↓ yes
Price impact acceptable?
       ↓ yes
Slippage acceptable?
       ↓ yes
Net profit positive?
       ↓ yes
Minimum edge?
       ↓ yes
Turnover limit?
       ↓ yes
Position limits?
       ↓ yes
Cooldown?
       ↓ yes
Quote still fresh?
       ↓ yes
Simulation succeeds?
       ↓ yes
Transaction hash unchanged?
       ↓ yes
CoW/Zodiac permission valid?
       ↓ yes
EXECUTE
```

Any `NO`:

```text
REJECT
```

No AI gets to override it.

---

# PF-06 — Settlement & Verification

After execution:

```text
CoW order / tx
      ↓
wait confirmation
      ↓
read Safe balances
      ↓
compare expected vs actual
      ↓
calculate execution quality
      ↓
update inventory
      ↓
record P&L
      ↓
Telegram
```

And this should detect:

```text
expected LINK: 12.42
actual LINK:   12.39
difference:    -0.03
```

and classify whether that's normal execution variance or an anomaly.

---

# Zodiac configuration

This is where I'd make the system unusually strict.

The automation role should have:

### CoW order signing

Only:

```text
sell:
ETH
LINK
AAVE
UNI
MORPHO
AERO
USDC

buy:
ETH
LINK
AAVE
UNI
MORPHO
AERO
USDC
```

That's already a huge reduction in attack surface.

The Roles SDK's `allowCowOrderSigning()` is designed exactly for this kind of permission generation. ([Zodiac Roles Modifier][1])

Then add allowances/rate limits.

Zodiac supports allowances on calldata values, ETH value, and call rates. ([Zodiac Roles Modifier][2])

I'd have separate limits:

```text
ROLE: portfolio-bot

allowed tokens:
    7

allowed order pairs:
    7 × 7 minus same-token

max daily USDC-equivalent turnover:
    configurable

max order:
    configurable

call-rate limit:
    configurable
```

And **no generic router permission unless absolutely necessary**.

---

# The interesting security property

Suppose the n8n AI is compromised.

It says:

```text
SELL all ETH
BUY random-token-X
```

The transaction never gets through because the Zodiac role doesn't permit that token pair.

Suppose the n8n code is compromised.

It attempts:

```text
Safe → arbitrary contract
```

No permission.

Suppose an aggregator returns malicious calldata.

The execution path doesn't simply say:

> "aggregator said execute this."

We validate:

```text
target
function
token
amount
recipient
order parameters
```

before the order reaches the Safe.

Zodiac's condition system supports granular calldata/value constraints, including exact values, comparisons, calldata matching and allowances. ([Zodiac Roles Modifier][3])

That's the architecture I want.

---

# One more important distinction: CoW vs arbitrage

I would explicitly implement two execution classes.

## `COW_REBALANCE`

For:

```text
ETH → USDC
USDC → LINK
AAVE → UNI
```

Use CoW.

CoW provides the MEV-aware batch-auction execution you want.

---

## `ATOMIC_ARBITRAGE`

For:

```text
ETH → LINK → AAVE → ETH
```

only execute if we have an **atomic route**.

This may use an aggregator/router rather than CoW.

The opportunity scanner can compare:

```text
CoW
0x
Odos
1inch
```

but the execution engine chooses based on:

```text
net return
+
atomicity
+
MEV protection
+
permission compatibility
```

This is an important architectural boundary.

---

# Don't let "multiple aggregators" become four API dependencies everywhere

I'd normalize them behind one internal interface:

```text
QuoteProvider
├── CoWProvider
├── ZeroXProvider
├── OdosProvider
└── OneInchProvider
```

n8n can call them independently, but downstream nodes receive:

```json
{
  "provider": "...",
  "route": [...],
  "sellAmount": "...",
  "expectedBuyAmount": "...",
  "gasUsd": 0,
  "priceImpactBps": 0,
  "expiresAt": "...",
  "atomic": true,
  "executionType": "cow_order"
}
```

That means adding another aggregator later doesn't require redesigning the opportunity engine.

---

# I would also NOT put the arbitrage graph inside n8n expressions

This is where n8n can become ugly.

Use a **Code node** for the deterministic graph calculation initially.

Eventually, if it becomes substantial:

```text
n8n
 ↓
portfolio orchestration
 ↓
Python/TypeScript execution service
```

But **don't create that service yet**.

For a $1–5k MVP, that's premature infrastructure.

n8n + Code nodes + a small persistent DB is enough.

---

# Initial risk profile

Since you explicitly want higher limits, I'd start around:

| Guard                         |         MVP |
| ----------------------------- | ----------: |
| Max single trade              |  **5% NAV** |
| Max daily turnover            | **20% NAV** |
| Max price impact              |   **0.50%** |
| Max slippage                  |   **0.50%** |
| Minimum arbitrage profit      |      **$1** |
| Profit / execution-cost ratio |     **≥3×** |
| Quote freshness               | **≤10 sec** |
| Route length                  |      **≤3** |
| Unsupported token             |  **REJECT** |
| Unsupported contract          |  **REJECT** |
| Failed simulation             |  **REJECT** |
| Changed transaction           |  **REJECT** |
| Stale quote                   |  **REJECT** |

I would **not** start with 20% daily turnover necessarily being permitted by Zodiac. Make the economic policy configurable and initially conservative, then increase it based on actual execution data.

---

# The +3% tolerance

I'd encode:

```json
{
  "target": 0.25,
  "lower": 0.22,
  "upper": 0.28,
  "rebalance_behavior": "opportunistic"
}
```

Meaning:

```text
22–28%
→ don't trade merely to restore target

>28%
→ sell becomes eligible

<22%
→ buy becomes eligible
```

But:

```text
22–28%
+
strong volatility harvest
+
positive expected inventory gain
```

can still produce a trade.

This is the core of your strategy.

---

# What I still need before I generate the actual workflow JSON

We're down to **four things**.

### 1. n8n version

Give me:

```bash
docker exec <n8n-container> n8n --version
```

This matters for import compatibility.

### 2. Safe address

The Base Safe address that will hold the portfolio.

### 3. Automation member address

The address that will be assigned to the Zodiac Role.

**Do not send a private key or seed phrase.** I only need the public address.

### 4. Persistence

Do you already have Postgres connected to n8n?

If yes, we'll use it.

If not, I recommend initially using **n8n's existing DB for workflow state only if the deployment is already backed up**, otherwise SQLite/Postgres should be deliberately configured rather than making the trading ledger dependent on an opaque application database.

---

## And one final architectural recommendation

I would **not generate the giant importable JSON yet**.

First I would generate:

1. `portfolio-policy.json`
2. `opportunity-schema.json`
3. `execution-policy.json`
4. **Zodiac Roles configuration**
5. then the six n8n workflows.

That gives us versionable contracts between the pieces.

The resulting system becomes:

```text
                 ┌─────────────────────┐
                 │ portfolio-policy    │
                 │ execution-policy    │
                 └──────────┬──────────┘
                            │
                            ▼
Safe ── Zodiac ── Execution Gate ── n8n
                       ▲              │
                       │              ▼
                  deterministic    AI analysis
                       ▲              │
                       │              ▼
                quote / arb engine ← market data
```

And the really good part is that **your long-term portfolio-management module can plug into this later without changing the execution/security layer**.

The AI can eventually move:

```text
ETH target
25% → 24%
```

or:

```text
AERO target
10% → 12%
```

but the same execution policy, token whitelist, Zodiac permissions, quote validation, simulation and post-trade verification remain in force.

That's the separation I'd preserve from day one.

[1]: https://docs.roles.gnosisguild.org/sdk/api?utm_source=chatgpt.com "API Reference - Zodiac Roles Modifier"
[2]: https://docs.roles.gnosisguild.org/general/allowances?utm_source=chatgpt.com "Allowances - Zodiac Roles Modifier"
[3]: https://docs.roles.gnosisguild.org/general/conditions?utm_source=chatgpt.com "Conditions - Zodiac Roles Modifier"
