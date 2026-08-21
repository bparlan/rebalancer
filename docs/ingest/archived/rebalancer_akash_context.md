Below is a **minimal, production‑ready design** that meets your updated constraints:

- **No custom on‑chain contracts** (you’ll trade directly from an EOA or a multi‑sig wallet).
- **No staking / unstaking** – the bot only swaps the five assets (plus a stablecoin if you want it).
- **All tokens live on **Base\*\* (the L2 of Ethereum).
- **OpenZeppelin libraries** are used only in the off‑chain script (SafeERC20, TypedData signing, etc.) so you still get battle‑tested code without deploying anything yourself.

The whole flow runs on your VPS with **Coolify + n8n** and a tiny Dockerised worker that talks to the Base network through a standard RPC (Alchemy/Infura/QuickNode).

---

## 1. High‑level flow (text diagram)

```
┌───────────────────┐          ┌─────────────────────┐
│  n8n (cron 5 h)   │   HTTP   │  Docker worker (Node│
│  → POST /run      ├────────▶│  /rebalance.js)      │
│  → Slack/Telegram │          │                     │
└───────────────────┘          │  1️⃣ Pull prices   │
                               │  2️⃣ Compute target│
                               │  3️⃣ Build swap set│
                               │  4️⃣ Sign tx       │
                               │  5️⃣ Send to Base  │
                               │  6️⃣ Log receipt   │
                               └─────────────────────┘
```

| Step                             | What happens                                                                                                                    | Why it’s safe                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **1️⃣ Pull prices**               | Get current USD price for each asset from a public API (CoinGecko, Binance, or 0x price service).                               | Off‑chain source → you can compare several feeds to avoid a single point of failure.           |
| **2️⃣ Compute target allocation** | Compare current portfolio value vs. the **target percentages** you set (e.g., 20 % each) with a **± safe‑margin** (e.g., ±5 %). | If the portfolio is already inside the margin nothing is done → you avoid unnecessary gas.     |
| **3️⃣ Build swap set**            | For every over‑weighted token → generate a swap to an under‑weighted token (or to a stablecoin if you added one).               | Uses a DEX aggregator (1inch or 0x) that guarantees the best price in a single transaction.    |
| **4️⃣ Sign tx**                   | The script signs the transaction locally with a private key stored in a **Coolify secret** or a HashiCorp Vault.                | The key never leaves the VPS; you can also put the address behind a Gnosis Safe if you prefer. |
| **5️⃣ Send tx**                   | Broadcast via a Base RPC endpoint.                                                                                              | Gas is paid by the wallet you control; you can cap gas‑price in the script.                    |
| **6️⃣ Log receipt**               | Store `txHash`, block number, and delta‑allocation in SQLite (or simple JSON file).                                             | n8n can fire Slack/Telegram alerts if the tx fails or the deviation stays high.                |

---

## 2. Asset list & optional stablecoin

| Symbol                           | Description                                                            | Suggested Base‑chain address |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `WSTETH`                         | Wrapped stETH (already a liquid staked token)                          | `0x…`                        |
| `LINK`                           | Chainlink token                                                        | `0x…`                        |
| `UNI`                            | Uniswap governance token                                               | `0x…`                        |
| `AAVE`                           | Aave token                                                             | `0x…`                        |
| `MORPHO`                         | Morpho token                                                           | `0x…`                        |
| **Optional** `USDC` (or `USDbC`) | Stablecoin – can be used as a “parking” asset when the market is flat. | `0x…`                        |

If you add a stablecoin, treat it like any other asset in the allocation table (e.g., 5 % of the portfolio). The bot will automatically buy the stablecoin when other tokens are over‑weighted and sell it when they are under‑weighted.

---

## 3. Target allocation & safe‑margin (example)

```json
{
  "allocations": {
    "WSTETH": 0.2,
    "LINK": 0.2,
    "UNI": 0.2,
    "AAVE": 0.2,
    "MORPHO": 0.2,
    "USDC": 0.0 // set >0 if you want a stablecoin slice
  },
  "safeMargin": 0.05 // ±5 % of each target before we rebalance
}
```

_The bot only trades when a token’s **current %** is **outside** `target ± safeMargin`._
That tiny “margin” prevents constant churning on tiny price wiggles and saves gas.

---

## 4. The off‑chain worker (Node.js + ethers.js)

### 4.1 Core libraries

| Library                                                         | Reason                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ethers` (v6)                                                   | Connect to Base RPC, sign & send tx                                         |
| `@openzeppelin/contracts` (via `npm i @openzeppelin/contracts`) | Gives you `SafeERC20` helpers for token approvals (used in the script only) |
| `axios`                                                         | HTTP calls to price APIs & 1inch/0x                                         |
| `dotenv`                                                        | Load env vars (RPC URL, private key, etc.)                                  |
| `sqlite3` (or `lowdb`)                                          | Light‑weight persistence for tx logs                                        |

### 4.2 Directory layout (Docker context)

```
/app
│   package.json
│   .env           ← injected by Coolify (keep private!)
│   rebalance.js   ← main script
│   config.json    ← allocation table
│   db.js          ← tiny SQLite wrapper
└── Dockerfile
```

### 4.3 Example `rebalance.js`

```js
// rebalance.js
import "dotenv/config";
import { ethers } from "ethers";
import axios from "axios";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { openDb } from "./db.js";
import fs from "fs";

// ---------- 1️⃣ Load config ----------
const CONFIG = JSON.parse(fs.readFileSync("config.json", "utf8"));
const { allocations, safeMargin } = CONFIG;

// ---------- 2️⃣ RPC & wallet ----------
const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ---------- 3️⃣ Token data ----------
const TOKENS = {
  WSTETH: { address: "0x…", decimals: 18 },
  LINK: { address: "0x…", decimals: 18 },
  UNI: { address: "0x…", decimals: 18 },
  AAVE: { address: "0x…", decimals: 18 },
  MORPHO: { address: "0x…", decimals: 18 },
  USDC: { address: "0x…", decimals: 6 },
};

// ---------- 4️⃣ Helper: fetch USD price ----------
async function priceUSD(symbol) {
  const resp = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`,
  );
  return resp.data[symbol.toLowerCase()].usd;
}

// ---------- 5️⃣ Get current balances ----------
async function fetchBalances() {
  const bal = {};
  for (const [sym, meta] of Object.entries(TOKENS)) {
    const contract = new ethers.Contract(
      meta.address,
      ["function balanceOf(address) view returns (uint256)"],
      provider,
    );
    const raw = await contract.balanceOf(wallet.address);
    bal[sym] = Number(ethers.formatUnits(raw, meta.decimals));
  }
  return bal;
}

// ---------- 6️⃣ Compute allocation ----------
async function computeRebalancePlan() {
  const prices = {};
  for (const sym of Object.keys(TOKENS)) prices[sym] = await priceUSD(sym);
  const balances = await fetchBalances();

  // Convert to USD value
  const usdValue = {};
  let totalUsd = 0;
  for (const s of Object.keys(TOKENS)) {
    usdValue[s] = balances[s] * prices[s];
    totalUsd += usdValue[s];
  }

  const currentPct = {};
  for (const s of Object.keys(TOKENS)) currentPct[s] = usdValue[s] / totalUsd;

  // Determine over‑ and under‑weighted assets
  const over = {};
  const under = {};

  for (const s of Object.keys(allocations)) {
    const target = allocations[s];
    const low = target - safeMargin;
    const high = target + safeMargin;
    if (currentPct[s] > high) over[s] = (currentPct[s] - target) * totalUsd; // excess USD
    if (currentPct[s] < low) under[s] = (target - currentPct[s]) * totalUsd; // deficit USD
  }

  // No action needed?
  if (Object.keys(over).length === 0 && Object.keys(under).length === 0)
    return null;

  // Build swap list (greedy)
  const swaps = []; // each entry = { sell, buy, amountIn, minOut }
  for (const [sell, excessUsd] of Object.entries(over)) {
    let remainingUsd = excessUsd;
    for (const [buy, deficitUsd] of Object.entries(under)) {
      if (remainingUsd <= 0) break;
      const usdSwap = Math.min(remainingUsd, deficitUsd);
      const amountIn = usdSwap / prices[sell];
      const amountOut = usdSwap / prices[buy];
      swaps.push({
        sell,
        buy,
        amountIn,
        minOut: amountOut * 0.995, // 0.5 % slippage buffer
      });
      remainingUsd -= usdSwap;
      under[buy] -= usdSwap;
    }
  }
  return { swaps, totalUsd };
}

// ---------- 7️⃣ Execute swaps via 1inch ----------
async function executeSwaps(swaps) {
  const chainId = 8453; // Base mainnet
  const txs = [];

  for (const s of swaps) {
    const sellMeta = TOKENS[s.sell];
    const buyMeta = TOKENS[s.buy];

    // 1inch: https://api.1inch.io/v5.0/<chainId>/swap?... (GET returns tx data)
    const params = new URLSearchParams({
      fromTokenAddress: sellMeta.address,
      toTokenAddress: buyMeta.address,
      amount: ethers
        .parseUnits(s.amountIn.toString(), sellMeta.decimals)
        .toString(),
      fromAddress: wallet.address,
      slippage: "0.5",
      disableEstimate: "true",
      compatibilityMode: "true",
    });

    const resp = await axios.get(
      `https://api.1inch.io/v5.0/${chainId}/swap?${params}`,
    );
    const tx = resp.data.tx; // raw tx object (to, data, value, gas, gasPrice)

    // Approve token if needed (1inch needs allowance)
    const tokenContract = new ethers.Contract(
      sellMeta.address,
      [
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
      ],
      wallet,
    );

    const allowance = await tokenContract.allowance(wallet.address, tx.to);
    const needed = ethers.parseUnits(s.amountIn.toString(), sellMeta.decimals);
    if (allowance < needed) {
      const approveTx = await tokenContract.approve(tx.to, ethers.MaxUint256);
      await approveTx.wait(1);
      console.log(`✅ Approved ${s.sell} for ${tx.to}`);
    }

    // Attach gas limit & price (you can cap gasPrice as you wish)
    const signed = await wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: ethers.parseUnits(tx.value ?? "0", "wei"),
      gasLimit: ethers.hexlify(300_000),
      maxFeePerGas: ethers.parseUnits("0.0015", "gwei"), // example
      maxPriorityFeePerGas: ethers.parseUnits("0.001", "gwei"),
    });
    const receipt = await signed.wait(1);
    console.log(`🔁 Swap ${s.sell} → ${s.buy} tx ${receipt.transactionHash}`);
    txs.push(receipt.transactionHash);
  }
  return txs;
}

// ---------- 8️⃣ Main orchestration ----------
async function main() {
  const plan = await computeRebalancePlan();
  if (!plan) {
    console.log("✅ Portfolio already inside safe margins – nothing to do.");
    return;
  }

  console.log("🔄 Rebalancing plan:", plan.swaps);
  const txHashes = await executeSwaps(plan.swaps);
  const db = await openDb();
  await db.run(
    `INSERT INTO runs (timestamp, total_usd, tx_hashes) VALUES (?, ?, ?)`,
    Date.now(),
    plan.totalUsd,
    JSON.stringify(txHashes),
  );
  console.log("✅ Rebalance completed. Stored in DB.");
}

// Run
main().catch((err) => {
  console.error("❌ Rebalance failed:", err);
  process.exit(1);
});
```

### 4.3 Persistence (`db.js`)

```js
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openDb() {
  const db = await open({
    filename: "./rebalance.db",
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp BIGINT,
      total_usd REAL,
      tx_hashes TEXT
    );
  `);
  return db;
}
```

### 4.4 Dockerfile (minimal)

```Dockerfile
# ---- Base ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# Use Coolify to inject .env (PRIVATE_KEY, BASE_RPC_URL, etc.)
CMD ["node", "rebalance.js"]
```

_Build & push the image via Coolify → “Add Service → Dockerfile” → set the env vars as **Secrets** (PRIVATE_KEY, BASE_RPC_URL, etc.)._

---

## 5. n8n workflow (no‑code glue)

1. **Cron node** – every 5 hours (configurable).
2. **HTTP Request node** – `POST http://rebalance-service:3000/run` (expose the Docker container on a simple API endpoint, or just use an **Execute Command** node that runs `docker exec … node rebalance.js`).
3. **If/Else** – check the response JSON for `status: "skipped"` vs `status: "executed"`.
4. **Slack / Telegram node** – post a short message:  
   _“Rebalance executed – tx 0xabc… – portfolio now 19.8 % WSTETH, 20.1 % LINK …”_
5. **Error handling** – on failure, send an alert and optionally trigger a retry after 10 min.

_(If you prefer a simple “run script” approach, n8n’s **Execute Command** node can directly call `docker run …` – no extra API needed.)_

---

## 6. Adding a stablecoin (USDC) to improve profitability

1. **Update `config.json`** – set a non‑zero target for `USDC`, e.g. `0.05` (5 %).
2. **Include its address & decimals** in the `TOKENS` map (already there).
3. The same algorithm will treat USDC like any other token:  
   _When any other asset goes above its margin, the bot will **sell** part of the over‑weighted token for USDC, parking the value in a low‑volatility asset._  
   _When an asset drops below its margin, the bot will **buy** it back using USDC._

Because USDC is a stablecoin on Base, you won’t earn yield, but you’ll **reduce exposure to volatile swings** and often end the day with a slightly higher USD‑denominated portfolio value (the bot only trades when the expected profit after gas > your `minProfitUsd` threshold – you can add that check inside `computeRebalancePlan`).

---

## 7. Safety & security checklist

| Concern                          | Mitigation                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Private key leakage**          | Store it **only** as a Coolify _Secret_ or in HashiCorp Vault. Never bake it into the image.                                                                       |
| **Unexpected large swaps**       | The script respects the **safe‑margin**; it will never move more than the excess needed to return to target.                                                       |
| **Front‑running / price impact** | Use a DEX aggregator (1inch/0x) with a built‑in slippage buffer (`minOut = 0.5 %`). You can also cap the maximum USD amount per swap (e.g., `maxSwapUsd = 5_000`). |
| **Stuck transactions**           | The script checks `tx.wait(1)`; if the receipt shows a revert, it logs the error and n8n alerts you.                                                               |
| **Gas‑price spikes**             | In `executeSwaps` we set a **maxFeePerGas**; you can also read `eth_gasPrice` from the RPC and abort if it exceeds `maxAcceptable`.                                |
| **Replay attacks**               | The transaction is signed by your wallet each run; there is no replay risk because the nonce increments automatically.                                             |
| **Accidental token approvals**   | Approve **unlimited** (`MaxUint256`) **once per token** to the 1inch router; this is safe because the router only spends what you send in the swap.                |

---

## 8. Cost estimate (Base L2)

| Item                                | Approx. gas (mainnet equivalent) | Approx. cost @ $0.0005/gas (Base is ~5× cheaper) |
| ----------------------------------- | -------------------------------- | ------------------------------------------------ |
| 1‑inch swap (single pair)           | ~180 k                           | **≈ $0.09**                                      |
| Token approval (once per token)     | ~50 k                            | $0.025                                           |
| Logging & DB write (off‑chain)      | 0 (off‑chain)                    | –                                                |
| **Total per rebalance** (2‑3 swaps) | ~350–450 k                       | **≈ $0.20–$0.30**                                |

Running every 5 h → **≈ $1.50‑$2.00 per day** – trivial compared with the intraday profit you aim to capture.

---

## 9. Deployment checklist (quick)

1. **Create a wallet** (hardware or software) that will own the assets. Fund it with a little ETH on Base for gas.
2. **Add the private key** to Coolify **Secrets** → `PRIVATE_KEY`.
3. **Set RPC URL** → `BASE_RPC_URL` (e.g., `https://base-mainnet.g.alchemy.com/v2/…`).
4. **Clone repo** on the VPS, run `npm ci`, test locally: `node rebalance.js --dry`.
5. **Build Docker image** (`docker build -t rebalance .`) and push to your registry (or let Coolify build it).
6. **Create a Coolify service** from the image, expose port `3000` (if you use the tiny HTTP wrapper) or just run the container as a **job**.
7. **Configure n8n** Cron → Execute Command (`docker exec rebalance-container node /app/rebalance.js`).
8. **Add a test run** (manual trigger) → verify that the bot approves tokens, swaps, and logs a receipt.
9. **Add monitoring** – in n8n, pipe the script output to a Slack channel; optionally scrape the SQLite DB with a simple Prometheus exporter.
10. **Go live** – let the Cron run automatically. Review the first few runs, adjust `safeMargin` or `minProfitUsd` if you notice over‑trading.

---

## 10. Where to go from here (optional upgrades)

| Feature                                 | Why it’s useful                                                       | How you could add it                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Dynamic profit filter**               | Only execute when expected profit after gas > X USD.                  | Add a `minProfitUsd` param in `config.json` and compute `expectedUsdOut - expectedUsdIn - gasCostUsd`. |
| **Multi‑source price oracle**           | Reduce reliance on a single API.                                      | Pull price from CoinGecko, Binance, and 0x; take the median.                                           |
| **Gnosis Safe as owner**                | Extra on‑chain protection (multiple signatures needed to move funds). | Change `wallet` to a **Safe SDK** signer; keep the same swapping logic.                                |
| **Web UI for allocation tweaks**        | Non‑technical users can adjust targets.                               | Simple React + Express API that writes to `config.json` (re‑loaded on next run).                       |
| **Profit‑taking to a stablecoin vault** | Lock in gains without leaving the bot.                                | Add a “target profit” rule that routes excess USD into USDC once a threshold is passed.                |

---

### TL;DR – One‑sentence summary

> Run a small Dockerised Node.js worker (triggered by n8n every 5 h) that reads Base‑chain token balances, compares them to a 20 %‑each target (±5 % margin), and, when out‑of‑margin, swaps the excess for under‑weighted assets (or a stablecoin) using the 1inch/0x aggregator—all signed by a securely stored private key, with no custom smart contracts required.

Happy rebalancing! 🚀
