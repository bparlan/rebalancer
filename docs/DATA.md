# DATA.md

## Configuration Schema (`config.json`)

```json
{
  "allowedTokens": [
    {
      "symbol": "ETH",
      "address": "0x4200000000000000000000000000000000000006",
      "decimals": 18,
      "name": "Wrapped Ether",
      "isBaseAsset": true
    },
    {
      "symbol": "USDC",
      "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "decimals": 6,
      "name": "USD Coin",
      "isBaseAsset": false
    },
    {
      "symbol": "MORPHO",
      "address": "0x4d6B4b6e1d8F9E4A6b3f5E7D1C2F3A4B5C6D7E8F",
      "decimals": 18,
      "name": "Morpho Blue",
      "isBaseAsset": false
    },
    {
      "symbol": "BIO",
      "address": "0x1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T",
      "decimals": 18,
      "name": "BIO Protocol Token",
      "isBaseAsset": false
    }
  ],
  "targetAllocations": {
    "ETH": 20,
    "USDC": 40,
    "MORPHO": 25,
    "BIO": 15
  },
  "hysteresisBand": 500,
  "minEthGasReserve": 2000000000000000,
  "maxSlippageBps": 50,
  "wallet": {
    "privateKeyEnvVar": "WALLET_PRIVATE_KEY",
    "minGasReserveEth": 0.002
  },
  "network": {
    "chainId": 8453,
    "rpcUrl": "https://mainnet.base.org",
    "explorerUrl": "https://basescan.org"
  }
}
```

### Configuration Parameters

#### `allowedTokens`

- **Type**: Array of token objects.
- **Description**: Hardcoded list of allowed tokens in the portfolio.
- **Requirements**:
  - All tokens must have verified addresses on Base Mainnet.
  - Each token must have decimal precision (18 for most, 6 for USDC).
  - `isBaseAsset: true` for ETH (used for gas calculation and portfolio valuation base).
- **Purpose**: Enforces a whitelist of investable tokens and prevents accidental inclusion of malicious tokens.

#### `targetAllocations`

- **Type**: Object mapping token symbol to allocation in basis points.
- **Format**: `{"TOKEN_SYMBOL": 20}` (where 20 = 20%).
- **Requirements**:
  - All allocations must sum to 10,000 basis points (100%).
  - Values must be integers between 0 and 10,000.
- **Example**:
  - `{"ETH": 20, "USDC": 40, "MORPHO": 25, "BIO": 15}` sums to 100%.

#### `hysteresisBand`

- **Type**: Integer (basis points).
- **Default**: 500 (5%).
- **Usage**: Defines the trigger threshold for rebalancing.
- **Behavior**: A token is rebalanced only if its actual allocation drifts outside `Target ± 500 bps`.

#### `minEthGasReserve`

- **Type**: BigInt (wei).
- **Default**: `2000000000000000` (0.002 ETH).
- **Format**: Integer representing 0.002 ETH in wei.
- **Enforcement**: This reserve is locked and excluded from all portfolio valuation calculations.

#### `maxSlippageBps`

- **Type**: Integer (basis points).
- **Default**: 50 (0.5%).
- **Usage**: Maximum acceptable slippage on 0x quote requests.
- **Behavior**: Quotes with estimated slippage > 50 bps are rejected.

#### `wallet`

- **Type**: Object.
- **Description**: Wallet configuration.
- **Requirements**:
  - `privateKeyEnvVar`: Environment variable name containing the private key (no hardcoded keys).
  - `minGasReserveEth`: Minimum ETH balance to maintain in wei (default: 0.002 ETH).

#### `network`

- **Type**: Object.
- **Description**: Network configuration.
- **Requirements**:
  - `chainId`: Base Mainnet chain ID (8453).
  - `rpcUrl`: Base Mainnet RPC endpoint.
  - `explorerUrl`: Base Mainnet block explorer for transaction verification.

## Database Schema (SQLite)

### `runs` Table

Tracks completed rebalance runs and their outcomes.

```sql
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  total_usd REAL NOT NULL,
  tx_hashes TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'executed', 'failed', 'skipped')),
  pre_balance TEXT NOT NULL,
  post_balance TEXT NOT NULL,
  gas_cost_usd REAL NOT NULL,
  fee_cost_usd REAL NOT NULL,
  slippage_loss_usd REAL NOT NULL,
  net_gain_usd REAL NOT NULL,
  hysteresis_triggered INTEGER NOT NULL,
  error_message TEXT
);
```

#### `runs` Schema Fields

| Field                  | Type    | Description                                                                      |
| ---------------------- | ------- | -------------------------------------------------------------------------------- |
| `id`                   | INTEGER | Primary key (auto-increment).                                                    |
| `timestamp`            | INTEGER | Unix timestamp (seconds) when the run was triggered.                             |
| `total_usd`            | REAL    | Total portfolio value at start of run (USD).                                     |
| `tx_hashes`            | TEXT    | JSON stringified array of transaction hashes (e.g., `["0x123...", "0x456..."]`). |
| `status`               | TEXT    | Run status: `pending`, `executed`, `failed`, or `skipped`.                       |
| `pre_balance`          | TEXT    | JSON stringified object mapping token addresses to pre-rebalance balances.       |
| `post_balance`         | TEXT    | JSON stringified object mapping token addresses to post-rebalance balances.      |
| `gas_cost_usd`         | REAL    | Total gas cost in USD for the run.                                               |
| `fee_cost_usd`         | REAL    | Total 0x API routing fees in USD for the run.                                    |
| `slippage_loss_usd`    | REAL    | Total slippage loss in USD for the run.                                          |
| `net_gain_usd`         | REAL    | Net portfolio value gain in USD (gain - costs).                                  |
| `hysteresis_triggered` | INTEGER | Boolean flag indicating if hysteresis condition was met (1 or 0).                |
| `error_message`        | TEXT    | Error message if run failed (NULL otherwise).                                    |

### `balances` Table

Tracks current EOA token balances and targets for real-time monitoring.

```sql
CREATE TABLE balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT NOT NULL UNIQUE,
  token_symbol TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  current_balance BIGINT NOT NULL,
  target_balance BIGINT NOT NULL,
  current_allocation REAL NOT NULL,
  target_allocation REAL NOT NULL,
  drift_bps REAL NOT NULL,
  last_updated INTEGER NOT NULL
);
```

#### `balances` Schema Fields

| Field                | Type    | Description                                                                               |
| -------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `id`                 | INTEGER | Primary key (auto-increment).                                                             |
| `token_address`      | TEXT    | Token contract address (unique).                                                          |
| `token_symbol`       | TEXT    | Token symbol (e.g., "MORPHO").                                                            |
| `token_decimals`     | INTEGER | Token decimal precision (e.g., 18).                                                       |
| `current_balance`    | BIGINT  | Current balance in the wallet (normalized to 18 decimals for tokens with lower decimals). |
| `target_balance`     | BIGINT  | Target balance derived from portfolio value and target allocation.                        |
| `current_allocation` | REAL    | Current allocation as percentage (e.g., 25.5%).                                           |
| `target_allocation`  | REAL    | Target allocation as percentage (e.g., 25.0%).                                            |
| `drift_bps`          | REAL    | Drift from target in basis points (e.g., 500 bps).                                        |
| `last_updated`       | INTEGER | Unix timestamp (seconds) when this record was last updated.                               |

### `config_version` Table

Tracks configuration changes for auditability.

```sql
CREATE TABLE config_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_hash TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  applied_by TEXT NOT NULL
);
```

#### `config_version` Schema Fields

| Field         | Type    | Description                                                                    |
| ------------- | ------- | ------------------------------------------------------------------------------ |
| `id`          | INTEGER | Primary key (auto-increment).                                                  |
| `config_hash` | TEXT    | SHA-256 hash of the configuration JSON.                                        |
| `config_json` | TEXT    | Full configuration JSON at the time of versioning.                             |
| `applied_at`  | INTEGER | Unix timestamp (seconds) when the configuration was applied.                   |
| `applied_by`  | TEXT    | Username or identifier who applied the configuration (e.g., "admin" or "n8n"). |

## Indexes

```sql
-- Index on runs.timestamp for time-based queries
CREATE INDEX idx_runs_timestamp ON runs(timestamp DESC);

-- Index on balances.token_address for balance lookups
CREATE INDEX idx_balances_token_address ON balances(token_address);

-- Index on balances.last_updated for monitoring queries
CREATE INDEX idx_balances_last_updated ON balances(last_updated DESC);

-- Index on config_version.config_hash for verification queries
CREATE INDEX idx_config_version_config_hash ON config_version(config_hash);
```

## EOA Balance Tracking Workflow

1. **On-Chain Balance Query**:
   - On each run, query EOA balances for all allowed tokens using the wallet's RPC provider.
   - Normalize all balances to 18 decimals (adjust for tokens with different decimals).

2. **Target Calculation**:
   - Compute target balance for each token based on:
     - Current portfolio value (minus hard gas reserve).
     - Token's target allocation.
   - Formula: `target_balance = (portfolio_value × target_allocation) / 100`.

3. **Hysteresis Check**:
   - For each token, calculate current allocation.
   - Compute drift: `current_allocation - target_allocation`.
   - Convert drift to basis points.
   - If drift > 500 bps or drift < -500 bps, trigger rebalancing.

4. **Profitability Check**:
   - Estimate gas cost, 0x API fee, and slippage.
   - Calculate net portfolio value gain.
   - If `net_gain_usd <= 0`, skip the trade.

5. **Approval & Swap**:
   - Approve exact token amounts to 0x API's `allowanceTarget`.
   - Submit swap order to 0x API with `maxSlippageBps: 50`.
   - Wait for transaction confirmation.

6. **Update Balances**:
   - Record post-rebalance balances.
   - Update `balances` table with new current balances.
   - Update `runs` table with execution details.

7. **Log & Archive**:
   - Log run outcome to `runs` table.
   - Version the configuration after successful execution.
