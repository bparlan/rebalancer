Here's a comprehensive, production-ready prompt you can paste into ChatGPT. It's structured to force architectural thinking, constraint awareness, and actionable output.

---

```
You are a senior blockchain automation architect and quantitative systems designer. I need a complete technical solution guide for building an automated on-chain portfolio rebalancing system.

## INFRASTRUCTURE (Fixed)
- VPS running Coolify (Docker orchestration)
- n8n (workflow automation)
- Can add additional open-source/self-hosted tools or lightweight services if justified

## PORTFOLIO
5 assets: wstETH, LINK, UNI, AAVE, MORPHO
- wstETH represents ETH exposure (already staked, no separate ETH position)
- Portfolio is long-term hold; goal is to increase token counts, not just USD value
- Rebalancing should capture intraday volatility to accumulate more tokens over time

## CORE MECHANICS

### 1. REBALANCE FREQUENCY & TIMING
- Primary window: every 5 hours to 1 day
- Must weight rebalancing intensity around major market open/close hours:
  - Traditional: NYSE (9:30 AM / 4:00 PM ET), London (8:00 AM / 4:30 PM GMT), Tokyo (9:00 AM / 3:00 PM JST)
  - Crypto-specific: CME Bitcoin futures open/close (6:00 PM ET Sun–Fri), options expiry (last Friday of month)
  - Macro events: CPI/FOMC releases (schedule-aware if possible)
- Higher rebalance probability/aggression during high-volatility windows; lower during quiet hours

### 2. ALLOCATION LOGIC
- Target: Equal-weight or momentum-adjusted weighting among the 5 assets
- When an asset outperforms, trim and rotate into underperformers
- Rebalancing should be "soft" — not 100% of drift is corrected, only a portion to leave room for trend continuation
- Goal: each rebalance should theoretically increase total token count if prices revert to mean

### 3. SAFE TRADING MARGIN & STAKING SPLIT
- NOT all liquidity should be active in trading at all times
- Define a "Safe Trading Margin" (e.g., 30-50% of portfolio value is always liquid for rebalancing)
- The remaining portion stays in yield-bearing positions:
  - AAVE: supply to Aave V3 (Ethereum mainnet or L2) for aToken yield
  - LINK: stake via Chainlink Staking v0.2 or compatible pool
  - wstETH: already natively staked via Lido, no extra action needed
  - UNI and MORPHO: no staking in v1; they remain liquid or in trading margin
- When a rebalance requires buying/selling AAVE or LINK, the system pulls from the liquid portion first. If insufficient, it does NOT unstake (v1 constraint: no unstaking logic). The rebalance is partial or skipped for that leg.
- After each rebalance, any AAVE/LINK that falls back into "safe margin" should be checked for staking eligibility and staked if above a threshold.

### 4. EXECUTION LAYER
- On-chain execution on Ethereum mainnet or a single L2 (Arbitrum or Base recommended for gas efficiency)
- DEX aggregation: 1inch, 0x, or CoW Swap API for best execution
- Slippage protection and gas price awareness (skip if gas > threshold)
- Minimum trade size to avoid dust trades

## V1 MVP SCOPE (Explicitly Exclude)
- No unstaking logic (AAVE/LINK once staked stays staked in v1)
- No cross-chain bridging
- No leverage or derivatives
- No complex ML models; use rules + basic indicators (RSI, volatility bands, or simple momentum)
- No tax optimization logic

## DELIVERABLES I NEED

1. **Architecture Diagram** (text-based or Mermaid): Data flow from price feed → n8n → decision engine → on-chain execution → Coolify monitoring
2. **Stack Recommendation**: What to add beyond n8n + Coolify (e.g., Postgres for state, Redis for queues, Tenderly for simulation, The Graph for position data, Python microservice for math, etc.)
3. **Rebalance Algorithm**: Pseudocode or step-by-step logic for:
   - When to trigger
   - How much to rebalance
   - How to split between trading margin and staking
   - How to handle market hours weighting
4. **n8n Workflow Design**: High-level node structure (triggers, HTTP requests, function nodes, error handling, alerting)
5. **Risk Controls & Circuit Breakers**: What stops the bot, max daily loss limits, consecutive failure handling, manual pause mechanism
6. **Data Sources**: Free/reliable APIs for prices, staking APRs, gas oracles
7. **Deployment Guide**: How to containerize and deploy via Coolify, env vars, secrets management
8. **Monitoring & Alerting**: What to track, how to alert (Telegram/Discord/webhook)

## CONSTRAINTS
- Prefer self-hosted / open-source tools
- Minimize cloud service costs
- Security-first: private keys in Coolify secrets or HashiCorp Vault, never in repo
- Gas efficiency matters; batch operations if possible

Give me a complete, implementable guide. Be specific with tool names, API endpoints where relevant, and configuration patterns.
```

---

### Pro Tips for Using This Prompt

1. **If ChatGPT gives vague answers**, append: _"Be specific. Name the exact Docker image, the exact n8n node type, and the exact smart contract address or API endpoint. No placeholders."_

2. **For the market-hours logic**, you may want to separately ask for a follow-up: _"Generate a cron/schedule table for n8n triggers that maps market open/close hours to UTC, with volatility scores for each window."_

3. **If you want code**, follow up with: _"Generate the Python decision engine as a FastAPI microservice and the n8n webhook payload schema."_

Want me to also generate a **shorter "implementation checklist" version** of this prompt, or a **follow-up prompt specifically for the rebalancing math/algorithm**?
