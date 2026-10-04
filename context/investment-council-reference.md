# Context — Investment Council (reference) + Rebalancer Host Project

**Purpose of this file:** durable ground truth for future development sessions in this repo.
Two subjects: (1) the external reference repo `vikd1000/investment-council`, analyzed 2026-10-04;
(2) the verified current state of the `rebalancer` host project, including defects that block
the documented safety model.

**Evidence convention used throughout:**
- `VERIFIED` — read directly from source in this session, or reproduced by running a command.
- `[INFERENCE]` — reasoned from verified facts, not directly observed.
- Stale-doc claims are labelled as such rather than repeated as fact.

---

## 1. External Reference: `vikd1000/investment-council`

Source: `https://github.com/vikd1000/investment-council` (branch `main`)
At time of analysis: Python, MIT, ~73 stars / 13 forks. No API key required. Not a fork of,
and not related to, this repo — it is an independent project studied as a pattern donor.

### 1.1 What it does

Feeds a list of stock tickers plus a capital figure to a 6-stage pipeline that evaluates each
ticker through 21 investor personas (Buffett, Burry, Lynch, …), aggregates their agreement and
disagreement, sizes positions, issues BUY/PASS/HOLD/ADD/REDUCE/SELL calls, and renders a report
plus an interactive HTML dashboard.

Runs on **Claude Code** as the agent runtime; stages 02–06 are plain markdown `CONTEXT.md`
instructions, not Python. Stage 01 is real Python. This is the single most important
architectural fact about the project.

### 1.2 Pipeline shape

```
setup/questionnaire.md  (user-edited, the only required manual input)
        │
        ▼
01_fetch/fetch.py  +  score.py     ← deterministic Python, no AI
        │  financial_data.json / essential_metrics.json / metadata.json / scorecards/*.json
        ▼
02_analyst_signals                 ← AI, fan-out, 3 investors per batch
03_consensus                        ← AI, heat map + conviction filter
04_risk                             ← AI, position limits
05_decision                         ← AI, trade decisions + tax-aware account selection
06_report                           ← AI, brief_data.json + investment_brief.md
        │
        ▼
06_report/build_dashboard.py        ← deterministic Python, injects JSON into HTML template
        →  output/dashboard.html  (self-contained, no CDN)
```

### 1.3 The central design invariant

**The AI never computes a number.** `score.py` pre-computes the deterministic portion of every
scorecard; stage 02 may only:
- fill `subjective: true` criteria whose `raw` is `null`,
- nudge an already-computed subjective criterion by **±3 points** with a stated reason,
- write prose.

Stage 02's `CONTEXT.md` states this as a hard rule: *"DO NOT recompute the deterministic numbers.
Trust the JSON."* A run-isolation invariant is also enforced: every stage must check the
`run_id` in `metadata.json` against the files it is about to read and stop if they differ.

This is the single most transferable idea for this repo — see §4.

### 1.4 Stage 01 internals (`VERIFIED`)

| Item | Value |
|---|---|
| Data source | `yfinance` (`yf`) + `pandas`; Yahoo Finance; no account/key |
| Dependencies | `requirements.txt` = `yfinance`, `pandas`, **both unpinned** |
| `ESSENTIAL_FIELDS` | **61** keys — the canonical allowlist into `essential_metrics.json` |
| Scorers | `SCORERS` dict, **21** entries ↔ **21** `score_*` functions |
| Scorer signature | `score_X(d: dict) -> (crits, missing, (bull_at, neutral_low))` |
| Extra `score_*` def | `score_one()` — the orchestrator, not a scorer (accounts for 22 defs) |
| `run_id` | `datetime.now().strftime("%Y-%m-%d_%H%M%S")` |
| Macro | `^IRX` (3M T-bill) and `^TNX` (10Y) last closes, once per run |

`metadata.json` top-level keys, in source order: `run_id`, `run_date`, `tickers`, `capital`,
`capital_account`, `total_portfolio_value`, `holdings`, `investors`, `portfolio_type`, `notes`,
`macro`, `data_source`, `api_key_required`, `fetch_timestamp`.

`run_id` is stamped **only** into `metadata.json` — not into `financial_data.json` or
`essential_metrics.json`. `archive_run.py` therefore recovers it from `metadata.json` alone,
falling back to a fresh timestamp if that file is unreadable.

Fetched-but-stripped: `float_shares`, `balance_sheet_latest`, `price_history`,
`fetch_timestamp` reach `financial_data.json` but are absent from the allowlist, so they never
reach `essential_metrics.json`. Conversely `recent_news`, `annual_income`, `annual_cashflow`
are *not* in `ESSENTIAL_FIELDS` yet are re-added to `essential_metrics.json` by explicit
post-processing in `main()` — so the allowlist is not the whole story of what downstream sees.

ETF detection: `quoteType == "ETF"`, or unknown sector + description containing
`etf`/`index fund`/`exchange-traded`/`exchange traded`. ETFs short-circuit every scorer to
`{"ticker":…, "is_etf": True, "skipped": True}`.

Questionnaire fields (`VERIFIED`): `TICKERS`, `CAPITAL`, `CAPITAL_ACCOUNT`, `TOTAL_PORTFOLIO_VALUE`,
`DATE`, `INVESTORS`, `PORTFOLIO_TYPE`, `NOTES`, `MACRO_NOTES`, plus a fenced `HOLDINGS:` block of
`TICKER, ACCOUNT, UNITS, BOOK_VALUE, MARKET_VALUE` rows. Account labels and `CAPITAL_ACCOUNT` are
upper-cased at parse time; `HOLDINGS` rows must split into exactly 5 comma-separated parts or the
line is warned-and-skipped.

### 1.5 Stages 02–06 contracts (`VERIFIED`)

| Stage | Reads | Writes |
|---|---|---|
| 02 | persona md, `scorecards/{inv}.json`, `essential_metrics.json`, `metadata.json` | `output/{investor}_signals.md`, `output/etf_evaluator_signals.md` |
| 03 | all of `02/output/`, `essential_metrics.json`, `metadata.json` | `output/consensus_matrix.md` |
| 04 | `consensus_matrix.md`, `financial_data.json`, `metadata.json`, `_config/risk-rules.md` | `output/position_limits.md` |
| 05 | `position_limits.md`, `consensus_matrix.md`, `financial_data.json`, `metadata.json`, `_config/portfolio-rules.md` | `output/trade_decisions.md` |
| 06 | `trade_decisions.md`, `consensus_matrix.md`, `02/output/`, `metadata.json` | `output/investment_brief.md`, `output/brief_data.json`, then `dashboard.html` via script |

Stage 02's operational discipline — worth copying verbatim in spirit:
- **Resume check first.** Any non-empty `{investor}_signals.md` is complete; skip that investor
  and do not spawn a subagent for it. Explicitly to survive socket timeouts mid-run.
- **Batch of 3 investors**, waiting for each batch to confirm writes. 3, not 21, to avoid
  connection-pool exhaustion.
- **Batch of 10 tickers**, appending to the output file after each batch, to avoid generating
  100+ KB in one streaming response.
- Per-investor input isolation: only that persona, its scorecard, and the compact metrics file.

Stage 02 fan-out is a **Claude Code feature**. The README states other agent tools (Cursor,
Aider, Windsurf, Codex CLI) should still work but may need to run investors sequentially, and
points at `stages/02_analyst_signals/CONTEXT.md` for the inline fallback. Our own harness has
`task` fan-out, so this maps cleanly.

### 1.6 Decision rules (`VERIFIED`, from `_config/`)

`risk-rules.md`
- Two denominators that must not be confused: `capital` (this run's deployable cash) vs
  `total_portfolio_value` (net worth). **All % caps use `total_portfolio_value`.**
- Volatility tiers on `volatility_30d`: <15% → 25%; 15–30% → 20%; 30–50% → 15%; >50% → 10%;
  missing → 10%.
- Beta > 1.5 → −5pp; beta < 0.5 → +5pp (never above the 25% hard cap).
- Consensus conviction multiplier 1.0 / 0.75 / 0.50 / 0.0.
- Hard rules: 25% single-position cap; ≤80% of `capital` newly deployed; <3 bullish investors
  caps at 5%; shorts ≤10% each / 20% total.
- Existing holdings use **headroom $** = final max allocation − current position; headroom < 0
  forces a REDUCE on concentration grounds *regardless of consensus*.

`portfolio-rules.md`
- Actions per (position state × consensus): BUY / ADD / HOLD / REDUCE / SELL / PASS.
- Thresholds expressed as **bullish fraction**, so they scale to any panel size 3–19:
  BUY/ADD avg ≥55 and fraction ≥50%; STRONG BUY avg ≥70 and fraction ≥75%; PASS below;
  SELL held at avg <40 or a ≥15-point avg-score drop vs the most recent archived run.
- **Concentration override**: headroom < 0 ⇒ REDUCE even on Strong Bullish; if concentration and
  bearish consensus agree, the action is SELL.
- **Tax-aware account selection** on REDUCE/SELL: recognized tax-sheltered labels (TFSA, RRSP,
  LIRA1/2, RRIF, LRSP, FHSA, 401k, Roth 401k, 403B, IRA variants, HSA, 457B) are drained before
  any taxable lot; unrecognized labels default to **taxable** (conservative). Taxable gains are
  estimated per jurisdiction — Canada `gain × 0.5`, US full gain with short/long-term flag,
  other jurisdictions full gain with an explicit "unknown local treatment" note.

Both files are deliberately written so stages 04 and 05 share the same 50%/75% bars, so sizing
and conviction can never disagree.

### 1.7 `validate.py` — the anti-drift gate (`VERIFIED`)

Three checks, exits non-zero on failure, runnable as a pre-commit/pre-run gate:
1. Every scorer has a persona file and vice versa (`etf_evaluator.md` exempt — no scorer).
2. Each persona's documented BULLISH/NEUTRAL thresholds equal what the scorer actually returns.
   Regexes: `Score\s*≥\s*(\d+)\s*→\s*\*\*BULLISH\*\*` and
   `Score\s*(\d+)\s*[–-]\s*\d+\s*→\s*\*\*NEUTRAL\*\*`.
3. Every `d.get("…")`/`d["…"]` field a scorer reads actually exists in `ESSENTIAL_FIELDS`
   ∪ `{recent_news, annual_income, annual_cashflow, _macro}`.

Check 2 is the important one for this repo: **it makes a markdown doc and the code that
implements it mechanically unable to drift apart.** `docs/MODULARITY.md` in this repo asks for
`contracts/` implementations and `generate-verification` script checks; `validate.py` is a
working reference for exactly that shape.

### 1.8 Stale documentation inside the reference repo (do not trust these)

`VERIFIED` as stale in `stages/01_fetch/score.py`:
- Module docstring advertises per-ticker keys `total` and `signal`; the code emits
  `deterministic_total` and `deterministic_signal` (plus `thresholds: {bullish_at, neutral_low}`).
- Header comment describes a 4-tuple return; all 21 sites return 3-tuples and the call site
  unpacks 3. Confirmed: 21 three-tuple returns, 0 four-tuple returns.
- `stages/01_fetch/CONTEXT.md` lists 4 outputs but does not mention `holdings`,
  `total_portfolio_value`, or `capital_account`, all of which are in `metadata.json`.

Lesson for us: the reference repo has the same doc/code drift problem this repo has, in a milder
form. It is a pattern donor, not a correctness oracle.

### 1.9 `brief_data.json` schema (`VERIFIED`, from stage 06 `CONTEXT.md`)

Top level: `run_id`, `run_date`, `capital`, `portfolio_type`, `investors[]`, `cash_value`,
`cash_pct`, `deployed_value`, `deployed_pct`, `tickers[]`.
Per ticker: `ticker`, `company_name`, `is_etf`, `action`, `shares`, `price`, `value`,
`pct_portfolio`, `conviction`, `avg_score`, `bullish_count`, `verdict`, `signals{investor:
{score, signal}}`, `key_metrics{}`, `rationale`, `bull_quote{investor, text}`,
`bear_quote{investor, text}`.

`signals` must be populated for **every** investor in the run, not just those shown in the
markdown — the dashboard heat map needs the full matrix.

`build_dashboard.py` is 46 lines: read `output/brief_data.json`, read `dashboard_template.html`,
replace the literal token `__DASHBOARD_DATA__` with the JSON, escaping `</` → `<\/` so JSON
strings cannot close the `<script type="application/json">` tag early. Output is a single
self-contained `output/dashboard.html`. No CDN references — it opens offline. That
`</`-escaping is the only non-obvious line in the file and is worth preserving if ported.

---

## 2. Host Project: `rebalancer` — verified current state

Autonomous Base-chain portfolio rebalancer. Node 22+ ESM, `ethers`, `express`, `sqlite3`.
Docs describe milestones M1–M7 (`docs/MILESTONES.md`, `docs/ROADMAP.md`), Zodiac Roles scoping,
and a 6-layer portfolio analyzer.

### 2.1 What actually exists

```
package.json  config.json  schema.sql  .env.example  AGENTS.md  README.md
rebalancer/src/{role-executor,status-api,token-validator,portfolio-analyzer}.js
rebalancer/dashboard/status-monitor.html
n8n/{rebalancer-roles-registry.json, zodiac-roles-scoping-milestone.md, workflows/trigger-portfolio-analysis.n8.json}
docs/{SPEC,FRAMEWORK,DATA,PLAYBOOK,ROADMAP,MILESTONES,MODULARITY}.md
milestones/M1/M1.md
src/constants.ts        ← orphan, see D13
rebalancer/{logs,n8n,scripts}   ← all empty
```

`node_modules` is absent; nothing has been run successfully in this checkout.

### 2.2 Blockers — verified defects

Each was reproduced or read directly. Ordered by how much they block the documented safety model.

| # | Defect | Evidence |
|---|---|---|
| D1 | **ESM/CJS contradiction.** `package.json` sets `"type": "module"`, but all 5 JS sources use `require()`/`module.exports`. Under `type: module` these are parsed as ESM and `require` is undefined. | `node` → `ReferenceError: require is not defined in ES module scope`. Reproduced. Violates `AGENTS.md` §1. |
| D2 | **`--dry-run` is absent.** `AGENTS.md` §4 makes it mandatory; `docs/PLAYBOOK.md` documents it as the safety gate. | No file in `rebalancer/src/` contains `--dry-run`, `process.argv`, or `require.main` — those four modules have no CLI entry point at all. (`scripts/deploy-config.js` does use `require.main`, but it is a VPS deployment helper, not the rebalance worker.) |
| D3 | **Safety model is unimplemented.** Hysteresis band, slippage cap, and the `tradingEnabled` kill switch exist only in `config.json`. | Grep across all 4 sources: `hysteresis` 0 hits, `slippage` 0 hits, `tradingEnabled` 0 hits. Only `maxSwapUsd` appears, in `token-validator.js`. |
| D4 | **Path bug.** `role-executor.js` resolves `../n8n/rebalancer-roles-registry.json` from `rebalancer/src`, i.e. `rebalancer/n8n/…`, which does not exist. Same for `../logs/runs.sqlite`. | Both resolved paths confirmed absent; the registry actually lives at repo-root `n8n/`. Every `loadRegistry()` throws at construction. |
| D5 | **`token-validator` is never instantiated.** `role-executor` does `const validator = require(validatorPath)` then calls `validator.validateTrade(…)`, but the module exports the *class*. | Module ends `module.exports = TokenValidator;`; `new TokenValidator` appears nowhere in `role-executor.js`. `validator.validateTrade` is `undefined`. |
| D6 | **Registry blocks 100% of trades.** All tokens `verified: false`, `role.member` and `executionVenue.type` are `#NEEDS-CLARIFICATION`. | `validateExecutionVenue` rejects on the sentinel string, so `valid` is always false. Also ETH/USDC in `config.json` are absent from the registry entirely. |
| D7 | **Transaction builder reads fields nobody produces.** `buildRoleTransaction` returns `{to: validated.targetContract, data: validated.calldata}`, but `validateTrade` returns only `{valid, errors, token, maxAmount}`. | Verified by field extraction — `targetContract`/`calldata` never set upstream. `to` would be `undefined`. |
| D8 | **Validation fails open.** `validateAgainstPortfolioAnalysis` catches all errors and returns `{valid: true, maxAmount: 'unlimited'}`. | Source comment: `// Fail open for robustness`. A safety gate that passes when broken. |
| D9 | **Hardcoded mock prices drive the money cap.** `estimateUsdValue` uses a literal table (`WETH: 2000`, `MORPHO: 1.2`, …) with the comment *"This is a placeholder - real implementation would use price oracle"*. | `maxSwapUsd` enforcement is therefore meaningless — it is enforced against fake prices. |
| D10 | **Status API surfaces a sentinel string as an address.** `address: this.registry?.role?.member \|\| '0xunknown'` — `role.member` is a long `#NEEDS-CLARIFICATION …` string, which is truthy, so it is served as the address. | Read from `status-api.js:98`. |
| D11 | **Two conflicting sources of truth for allocations.** `config.json` says ETH 7300 bps (73%); `portfolio-analyzer.js` `loadStrategicTargets()` says ETH `0.10` (10%) — and its ETH tactical range is `{min: 0.08, max: 0.16}`. MORPHO (5%) and UNI (12%) agree; USDC exists only in `config.json`, while the analyzer has a `"USD"` tactical reserve and no USDC entry. 13 of the analyzer's 16 assets (AAVE, AERO, AKT, BIO, BTC, GRT, LINK, NEAR, ONDO, RENDER, SOL, USD, ZEC) are absent from `config.json`. | Machine-compared after correct bps→decimal conversion (/10000). |
| D12 | **Analyzer ignores config entirely.** All four loaders (`loadStrategicTargets`, `loadTacticalRanges`, `loadRiskBuckets`, `loadFundamentalConvictions`) are hardcoded literals; none reads `config.json`. | `readFileSync` absent from all four bodies. |
| D13 | **`src/constants.ts` violates `AGENTS.md` §1** (pure JS, no TypeScript) and is an orphan — nothing imports it, and it sits in a second `src/` distinct from `rebalancer/src/`. | Only `.ts` file in the repo. |
| D14 | **`schema.sql` contradicts `docs/DATA.md`.** `schema.sql` = `runs` + `trades`, 0 `REAL` columns (BigInt-safe, and `role-executor` inserts into it). `DATA.md` documents `runs` + `balances` + `config_version`, with 8 `REAL` and 2 `BIGINT` columns across its SQL blocks. | Parsed both, counting only inside `sql` fences. The `DATA.md` schema would violate `AGENTS.md` §2 "No Float Math". `DATA.md`'s token addresses (`0x4d6B…`, `0x1A2B…`) are visibly fabricated placeholders. |
| D15 | **Env-var names disagree across three files.** `.env.example` defines `PRIVATE_KEY`, `RPC_URL`, `MIN_GAS_RESERVE`. `milestones/M1/M1.md` binds `PRIVATE_KEY` + `BASE_RPC_URL`. `docs/PLAYBOOK.md` uses `PRIVATE_KEY` + `BASE_RPC_URL` + `TRADING_ENABLED`. **No source reads any of them** — the only `process.env` access in the entire codebase is `STATUS_API_PORT`. | Extracted per file. |
| D16 | **Three npm scripts point at files that do not exist:** `validate` → `rebalancer/scripts/validate-registry.js`, `test` → `rebalancer/scripts/test-portfolio.js`, `help` → `rebalancer/scripts/help.js`. `rebalancer/scripts/` is empty. | Existence check on each parsed target. (`monitor` also appears broken but its apparent miss was an artifact of quote characters in the `watchmedir` command line, not a real defect.) |
| D17 | **Stale claim in M1.md.** It records "`config.json` allocation sums to 4700 bps". Current `config.json` sums to exactly **10000**. | Summed: 7300 + 1000 + 500 + 1200. |

### 2.3 What is sound

- Every address present in `config.json` and the roles registry matches `^0x[a-fA-F0-9]{40}$`.
- `config.json` allocations sum to exactly 10000 bps.
- `schema.sql` uses `TEXT` for every monetary quantity, consistent with `AGENTS.md` §2.
- `rebalancer-roles-registry.json` has a genuinely good safety design: `_meta.rule` states that
  any field with `verified: false` or a `#NEEDS-CLARIFICATION` value **blocks** use in generated
  calldata and that this must be enforced mechanically rather than by agent memory. Every
  unverified value is loudly marked rather than silently guessed.
- `n8n/zodiac-roles-scoping-milestone.md` encodes hard, checkable constraints: ≥2 independent
  sources per address, no `allowTarget`/`allowFunction` where `scopeTarget`/`scopeFunction`
  suffices, fail-closed `generate-verification` regex checks, and an explicit ban on the
  milestone submitting any transaction.

The registry's `#NEEDS-CLARIFICATION` discipline is the best-engineered thing in this repo and
is worth protecting through any refactor.

### 2.4 Structural note on the roadmap

`docs/MODULARITY.md` assigns `M7: Orchestration` (n8n webhooks + Telegram) and *also* reserves
`#M7_DEBATE_ENGINE` as a long-term LLM debate module. That is a milestone-number collision —
resolve it before either is scheduled.

---

## 3. The link between the two projects

There is **no code or dependency link today.** The connection is architectural: the reference
repo is a candidate donor for two items already planned here.

| Planned here | Where | What the reference repo offers |
|---|---|---|
| **LLM Debate Engine** | `docs/MODULARITY.md` → `LONG-TERM: #M7_DEBATE_ENGINE` | 21 personas, each an independent markdown rubric; fan-out, aggregate, gate on consensus. §1.5 |
| **Multi-Agent Debate Layer** | `docs/ingest/ADDITIONS_and_LONG TERM.md` → idea **9** ("Aggressive Harvester / Capital Preserver / Correlation Skeptic" voting before a rebalance) | Same mechanism, already specified end-to-end. §1.3 |
| Mechanical contract enforcement | `docs/MODULARITY.md` → "Define contract in `contracts/`"; `zodiac-roles-scoping-milestone.md` → "wire into `generate-verification` as real script checks" | `validate.py` is a working 123-line reference for exactly this. §1.7 |
| Drift vs. target as inventory | `n8n/rebalancer-context-chatgpt-01.md` ("drift is inventory and trading opportunity") | Consensus-and-disagreement as a first-class output, rather than a single score. §1.2 |

The structural difference to respect: investment-council's personas score **qualities of a
business**; the rebalancer's proposed personas gate **whether to trade at all**. Port the
*mechanism* (independent rubrics → fan-out → aggregate → deterministic veto), never the rubrics.

The single highest-value transfer is §1.3's invariant plus §1.7's checker, because that is
precisely the failure mode this repo already has 17 times (§2.2).

---

## 4. Recommended sequence before further feature work

Not yet started — recorded so the ordering is not re-derived. Each item is a prerequisite for
the one after it.

1. **Make the tree loadable.** Decide CJS-vs-ESM once and apply it everywhere (D1). Nothing else
   can be tested until a module imports.
2. **Fix the path and instantiation bugs** (D4, D5, D7) so `role-executor` can be constructed.
3. **Implement the safety gates the docs already mandate** (D2, D3): `--dry-run`, hysteresis,
   slippage cap, `tradingEnabled` kill switch. Until these exist, `AGENTS.md` §3–4 and
   `docs/PLAYBOOK.md` describe a system that does not exist.
4. **Close D8/D9** — fail *closed* on analysis errors, and replace mock prices with a real
   quote before `maxSwapUsd` means anything.
5. **Single source of truth for allocations** (D11, D12): pick `config.json` or the analyzer, and
   have the other read it. Also reconcile `USDC` vs `USD` naming.
6. **Reconcile env-var names** across `.env.example`, M1.md, PLAYBOOK.md (D15) and actually read
   `PRIVATE_KEY` / `BASE_RPC_URL`.
7. **Reconcile `schema.sql` vs `docs/DATA.md`** (D14); delete the orphan `src/constants.ts` (D13);
   fix or remove the three broken npm scripts (D16).
8. **Only then** wire stage-01-style deterministic separation and a `validate.py`-equivalent
   parity checker, so config/docs/code stop drifting.

Steps 1–2 are small and mechanical. Steps 3–4 are the ones that decide whether this thing is
safe to point at real funds.

---

## 5. Quick reference — commands and constants

```bash
# investment-council
python3 stages/01_fetch/fetch.py        # deterministic fetch + scoring (~45s)
python3 archive_run.py                  # move prior run to archive/run_<run_id>/
python3 validate.py                     # persona↔scorer parity gate; non-zero on drift
python3 stages/06_report/build_dashboard.py
bash run.sh                             # dep check + stage 01 + prints stage 02–06 checklist
```

```bash
# rebalancer (current state: all of these fail — see §2.2)
npm install
npm start        # → require() under type:module  → D1
npm run validate # → target file missing          → D16
```

Key constants (`config.json`, `VERIFIED`): `chainId` 8453, `minEthGasReserveWei`
`2000000000000000` (0.002 ETH), `maxSlippageBps` 50, `hysteresisBps` 500, `tradingEnabled` false,
`maxSwapUsd` `"50"`. Tokens: ETH `0xeeee…eeee` (18d, 7300bps), USDC `0x833589fCD…02913` (6d,
1000bps), MORPHO `0xbaa5cc21…a0842` (18d, 500bps), UNI `0x327f2C62…12E20B` (18d, 1200bps).

On-chain (`n8n/rebalancer-roles-registry.json`, all `VERIFIED: true`, chain Base 8453):
Safe `0x96c841D77782E3ED12DDEbBA5246E286fAbE4B97` (1-of-1) · Roles Modifier v2
`0x3a0F3035b9CcFc4Efd25C11C34721985172417f4` · unwrapper
`0xB4Cd4bb764C089f20DA18700CE8bc5e49F369efD` · MultiSend
`0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` · MultiSendCallOnly
`0x9641d764fc13c8B624c04430C7356C1C7C8102e2`.
Still unresolved: `role.member`, all token addresses in the registry (including whether
"BTC-wrapper" means WBTC or cbBTC on Base), `executionVenue` (CoW vs aggregator — CoW's batch
auctions are the MEV-safe choice and the Roles SDK has native CoW permission generation), and
`allowance.perTxCap`.

---

*Analysis performed 2026-10-04 by direct source reading plus mechanical verification (address
regex, allocation sums, module-load reproduction, field-extraction cross-checks). Reference repo
read over HTTP; not cloned. Rebalancer findings reproduced locally where noted.*
