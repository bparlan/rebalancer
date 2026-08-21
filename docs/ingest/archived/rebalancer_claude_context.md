## Reframe

What you're describing isn't a "buy low / sell high" bot — it's a **constant-mix / threshold rebalancing strategy**, harvesting what's sometimes called the "rebalancing premium" or volatility harvesting (Shannon's Demon, in its purest form). It's real. It works by mechanically selling whatever outperformed back to target weight and buying whatever underperformed, which — across assets that are volatile but not permanently diverging — mathematically increases total units held versus static buy-and-hold. That's a sound thesis. Two things in your framing need correcting before you build anything, though.

## Diagnosis

**1. "Daily" is the wrong anchor.** Fixed-interval rebalancing pays transaction costs on pure noise days that never had enough drift to be worth capturing. Threshold-based rebalancing (e.g. rebalance only when an asset's actual weight drifts >X% from target) captures the same premium with far fewer trades. Check drift as often as you want — hourly is fine on Base — but only _execute_ when a band is breached. Daily-as-schedule is the naive version of this strategy; daily-as-check-frequency-with-band-execution is the correct one.

**2. The premium only exists if losses come back.** BTC/ETH/LINK/UNI/MORPHO aren't equally risky components. LINK/UNI/MORPHO carry real structural risk of _permanent_ underperformance (protocol relevance, competitive share, incentive changes) — not just volatility. Rebalancing into an asset that's cyclically down works. Rebalancing into an asset that's structurally declining just bleeds your BTC/ETH into a melting position. MORPHO especially — smaller cap, shorter track record — deserves a wider band and/or a lower target weight than BTC/ETH, not equal treatment. This is a position sizing decision, not a bot logic decision, and you should make it explicitly rather than defaulting to equal weights.

**3. Cost structure on 5 assets, not 2.** Gas on Base is negligible (cents). Your real cost is slippage/spread on the LINK/UNI/MORPHO legs — thinner liquidity than BTC/ETH means naive direct-router swaps will quietly eat your premium. Route through an aggregator (1inch/0x/Odos/CoW), not a single DEX pool.

**4. Predictable bots get front-run.** A cron job that rebalances on a knowable schedule against public mempool liquidity is a sandwich target. Use MEV-protected execution (CoW Swap's batch auctions, or a protected RPC route) rather than firing raw swaps into the public mempool.

**5. One thing you should know before going further:** the obvious "don't build a bot at all, just deposit into a self-rebalancing weighted pool and let arbitrageurs do it for you" option — Balancer-style weighted pools — is not something I'd point you at right now. Balancer Labs, the corporate entity behind the protocol, is shutting down after a 2025 exploit created ongoing legal and financial strain, and total value locked has fallen about 95 percent from a 2021 peak. The protocol itself continues under DAO governance, but that's a live, unresolved restructuring — not where new capital belongs for this. This matters for you specifically because it removes what would otherwise be the "boring, no-code, no-key-management" default recommendation. Also worth noting: Aerodrome, which you already hold veAERO in, doesn't have native N-asset weighted baskets like Balancer did — it's 2-asset pairs, so it can't cleanly express a 5-asset target allocation anyway.

**6. Custody is the actual risk, not the rebalancing logic.** Your VPS already OOM-crashed once running Coolify + WordPress + Ghost + Cal.com + n8n + Uptime Kuma simultaneously. Putting a hot wallet with trade-execution rights on that same box, alongside public-facing services, is the wrong risk surface for something moving your funds — independent of whether the rebalance math is correct.

Given all that: build it yourself, on your existing stack, but with the custody boundary separated from the compute.## Recommendation

Build the DIY bot on n8n/Coolify — it matches your stack and you don't need on-chain trustlessness for a single-owner portfolio. The only non-negotiable change from what you'd naturally build first: **the wallet that signs trades must not be a plain hot key living on the same VPS that runs your public blog stack.**

Use a Safe (multisig, 1-of-1 is fine here) with a **Zodiac Roles Modifier** as the automation signer. Scope it to: swap-only calls, an allow-listed router/aggregator contract, an allow-listed token set (your five assets + one stable for slack), and a per-transaction cap. If the n8n box gets popped, the blast radius is capped by the module, not by "however much is in the wallet." This is standard DeFi ops hygiene for anything moving funds unattended — not scope creep.

## Action

**n8n workflow, concretely:**

1. **Trigger**: Cron, hourly (not per-second — you don't need HFT-grade latency for this).
2. **Fetch state**: On-chain balances (RPC call or a portfolio API) + prices from a real oracle (Chainlink feeds on Base, since it's already one of your held assets and gives you tamper-resistant pricing rather than a scrapeable REST API).
3. **Compute drift** (Function node):

```python
# target weights sum to 1.0 — set MORPHO/UNI/LINK lower than BTC/ETH
# given their structural risk, don't default to equal weight
targets = {"BTC": 0.35, "ETH": 0.30, "LINK": 0.15, "UNI": 0.10, "MORPHO": 0.10}
band = {"BTC": 0.05, "ETH": 0.05, "LINK": 0.06, "UNI": 0.06, "MORPHO": 0.08}  # wider band = fewer, larger trades

portfolio_value = sum(balances[a] * prices[a] for a in targets)
current_weights = {a: (balances[a] * prices[a]) / portfolio_value for a in targets}

trades = []
for a in targets:
    drift = current_weights[a] - targets[a]
    if abs(drift) > band[a]:
        delta_usd = -drift * portfolio_value  # negative drift (underweight) -> buy
        trades.append({"asset": a, "delta_usd": delta_usd})
```

4. **Branch**: if `trades` is empty → log "checked, no action" → end. If not → proceed.
5. **Execute**: call the aggregator's quote+swap API (CoW Swap for MEV protection via batch auctions, or 1inch/Odos with a protected RPC) for each trade, signed through the Roles-Modifier-scoped Safe signer — never a raw EOA private key sitting in an n8n credential.
6. **Log**: every check (executed or skipped), the drift that triggered it, the quote vs. fill price (your realized slippage), to a DB or your Obsidian vault. This is your audit trail and your evidence for whether the strategy is actually working.
7. **Alert**: Telegram node on execution, and separately on any failure — a silent failure in a funds-moving workflow is worse than no automation.

**Isolate the workload**: give this its own container in Coolify with a memory/CPU ceiling, separate from the WordPress/Ghost/Cal.com stack that already OOM'd once. A rebalance that dies mid-execution because Ghost ate the RAM is a bad way to end up with an unbalanced, half-filled position.

## Verification

Before any of this touches real capital:

- **Backtest** the threshold logic against 6–12 months of price history for these five assets, net of realistic Base gas + aggregator slippage, comparing a few band widths (3%, 5%, 8%) against plain buy-and-hold. This tells you whether the premium you're chasing actually exceeds the cost of capturing it — for these specific assets, not in theory.
- **Track the right KPI**: not portfolio USD value (that's just market beta), but _token count relative to what pure buy-and-hold would have given you_. That isolates whether the rebalancing itself is adding value.
- **Dry-run with a small sleeve** of capital live before committing the full position, to get real fill/slippage data instead of quoted estimates.
