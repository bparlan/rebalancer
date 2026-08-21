CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,            -- Unix Epoch Time
    total_portfolio_usd TEXT NOT NULL,     -- BigInt string of portfolio value
    status TEXT NOT NULL,                  -- 'SKIPPED', 'EXECUTED', or 'FAILED'
    action_summary TEXT,                   -- JSON metadata of computed drift
    error_message TEXT                     -- Revert reason or stack trace if failed
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    timestamp INTEGER NOT NULL,
    sell_token TEXT NOT NULL,
    sell_amount TEXT NOT NULL,             -- BigInt string
    buy_token TEXT NOT NULL,
    buy_amount_received TEXT NOT NULL,     -- BigInt string
    tx_hash TEXT NOT NULL,                 -- Evm transaction hash
    gas_used_wei TEXT NOT NULL,            -- BigInt string
    gas_cost_usd TEXT NOT NULL,            -- Cost converted to USD
    FOREIGN KEY(run_id) REFERENCES runs(id)
);
