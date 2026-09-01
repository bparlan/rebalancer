# Zodiac Role Setup Guide - Automated Execution

## Overview
This guide sets up a fully automated Zodiac Role for your rebalancer bot that executes trades through its own 1/1 Safe wallet with strict amount limitations, eliminating human intervention entirely.

## Prerequisites
- Main 3/5 Safe with existing owners
- Web3 wallet (MetaMask, Rabby, etc.) as one of the main Safe owners
- Base chain access (Chain ID: 8453)
- Zodiac Safe app enabled in main Safe

## Setup Process

### Phase 1: Create Role-Owned 1/1 Safe

#### Step 1: Deploy New Safe for the Role

1. **Access Safe Creation**: Go to <https://app.safe.global/new-safe/create>
2. **Configure Security**:
   - **Chain**: Base (Chain ID: 8453)
   - **Owners**: Same owners as main Safe (copy addresses)
   - **Required Confirmations**: `1` (single-signature)
   - **Purpose**: This Safe will be owned by and controlled exclusively by the Zodiac Role
3. **Deploy**: Complete deployment and record the new Safe address

> **Result**: New 1/1 Safe controlled by Zodiac Role, same ownership as main Safe but single-signature threshold

### Phase 2: Configure Main Safe with Zodiac Roles

#### Step 2: Enable Roles Modifier on Main Safe

1. **Open Main Safe**: Access your 3/5 Safe in Safe{Wallet}
2. **Navigate to Apps**: Go to **Apps** section
3. **Add Zodiac Safe**: Find and open **Zodiac Safe app**
4. **Select Roles Modifier**: Choose **Roles Modifier**
5. **Confirm**: Keep all defaults, click **Add Module**
6. **Approve**: Have other main Safe owners confirm

#### Step 3: Assign Role to Role-Owned Safe

1. **Access Roles Modifier**: Back in Zodiac Safe app, select **Roles Modifier (v2)**
2. **Write Contract**: Switch to **Write Contract** tab
3. **assignRoles Function**: Select from function list
4. **Fill Parameters**:
   - **`module`**: Enter the address of the new 1/1 Safe (from Phase 1)
   - **`roleKeys`**: Enter `["<your_bytes32_encoded_role_key>"]`
     * Use role name: `REBALANCER` → bytes32: `0x726f62616e636572000000000000000000000000000000000000000000000000`
   - **`memberOf`**: Enter `[true]`
5. **Bundle & Submit**: Follow the transaction bundling process
6. **Confirm**: Get 3/5 signatures from main Safe owners

> **Result**: Main Safe assigns the `REBALANCER` role to the new 1/1 Safe

### Phase 3: Configure Role Permissions

#### Step 4: Set Up Zodiac Pilot for Automated Routing

1. **Install Zodiac Pilot**: Install browser extension from https://pilot.gnosisguild.org
2. **Add Main Safe Account**: 
   - Click *Add account*
   - Select Base chain
   - Enter main 3/5 Safe address
   - Give descriptive label (e.g., "Main Safe - Owner")
   - Confirm setup

3. **Configure Automated Routes**:
   - Click **Complete route setup to sign**
   - Select your EOA as Pilot Signer
   - **Route Selection**: Choose **Direct execution** (no role routing needed since role executes via its own Safe)
   - Click **Save**

#### Step 5: Whitelist Token Operations

1. **Access Pilot**: Open Zodiac Pilot extension
2. **Record Calls** (for each token you want to trade):

   **For Each Token Swap**:
   - Connect to your preferred DEX (e.g., CowSwap, 1inch, 0x)
   - Execute a sample swap through Pilot
   - Pilot records exact function calls
   - Click **Request permission** for each operation

3. **Configure Strict Permissions**:
   - Access **View requested permissions** in Pilot panel
   - For each recorded call:
     - Set **allow any** on amount parameters (for flexibility)
     - Set **exact value** on recipient parameters (must be role-owned Safe)
     - Set **exact value** on spender parameters ( execution venue router)
     - Set **exact value** on route parameters (pre-approved DEX)

4. **Apply Permissions**:
   - Review permissions in Roles app
   - Close Pilot panel
   - Click **Execute** in Roles app
   - Get 3/5 signatures from main Safe owners

> **Result**: Role can automatically execute only whitelisted token operations with exact parameters

### Phase 4: Configure Role-Owned Safe Operations

#### Step 6: Set Up Execution Module

1. **Access Role Safe**: Open the new 1/1 Safe in Safe{Wallet}
2. **Add Required Modules**:
   - **Module: `0xB4Cd4bb764C089f20DA18700CE8bc5e49F369efD`** (Transaction Unwrapper)
   - **Module: `0x3a0F3035b9CcFc4Efd25C11C34721985172417f4`** (Roles Modifier - v2)
   - **Module: `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526`** (MultiSend for batch operations)
3. **Configure Modules**: Keep defaults, get signatures as needed

#### Step 7: Set Up Execution Scripts

Create automated scripts for role execution:

**Main Execution Script** (`src/execute-role.js`):
```javascript
// Automated role execution - no human intervention
const { ethers } = require("ethers");
const registry = require("./registry");

async function executeWithRole(approvalData, swapData) {
  // Verify amounts against role limits
  const validated = validateAmounts(approvalData, swapData);
  
  // Build transactions through role-owned Safe
  const tx = buildRoleTransaction(validated);
  
  // Execute via role (no approval needed - 1/1)
  return await executeRoleTransaction(tx);
}
```

**Token Validation** (`src/validate-tokens.js`):
```javascript
// Strict token amount validation
function validateAmounts(approvalData, swapData) {
  const config = require("./config");
  
  for (const token of config.tokens) {
    // Check approval amount limits
    if (approvalData.amount > token.maxApproval) {
      throw new Error(`Approval exceeds limit for ${token.symbol}`);
    }
    
    // Check swap amount limits  
    if (swapData.amount > token.maxSwap) {
      throw new Error(`Swap amount exceeds limit for ${token.symbol}`);
    }
  }
  
  return { valid: true };
}
```

### Phase 5: Configure Automation

#### Step 8: Set Up n8n Automation

Create n8n workflows that trigger automatically:

**Trigger Workflow**:
1. **Schedule Trigger**: Time-based trigger (e.g., hourly)
2. **Portfolio Analysis**: Calculate drift vs targets
3. **Token Filtering**: Identify tokens needing rebalancing
4. **Validation**: Check amounts against role limits
5. **Execution**: Send transactions to role-owned Safe
6. **Logging**: Record all actions in audit logs

**Error Handling Workflow**:
1. **Monitor**: Check role Safe transaction status
2. **Alert**: Notify on failures
3. **Recovery**: Auto-retry failed transactions
4. **Audit**: Log all automated executions

#### Step 9: Set Up Observational UI (OMP Support)

Create simple status dashboard:

**Status Monitor** (`dashboard.html`):
```html
<!DOCTYPE html>
<html>
<head>
    <title>Role Status Dashboard</title>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="30">
</head>
<body>
    <h1>Zodiac Role Status</h1>
    
    <h2>Role-Owned Safe</h2>
    <div id="safe-status">
        <!-- Dynamic status display -->
    </div>
    
    <h2>Token Permissions</h2>
    <div id="token-permissions">
        <!-- Display whitelisted tokens and limits -->
    </div>
    
    <h2>Recent Executions</h2>
    <div id="recent-executions">
        <!-- Show last few automated executions -->
    </div>
</body>
</html>
```

**Status API** (`src/status-api.js`):
```javascript
// Simple status endpoint for dashboard
app.get('/api/role-status', (req, res) => {
  res.json({
    safeAddress: roleSafe.address,
    balance: roleSafe.getBalance(),
    pendingTxs: roleSafe.getPendingTxs(),
    lastExecution: roleSafe.getLastExecution(),
    permissions: rolePermissions.getActiveTokens(),
    status: roleSafe.isOperational() ? 'active' : 'inactive'
  });
});
```

## Configuration Files

Update these files with role-specific settings:

**roles-registry.json**:
- Set `"role": { "member": "<role-owned-safe-address>" }`
- Verify all token addresses and execution venue
- Set `"executionModel": { "setup": "Fully automated via role", "runtime": "Unattended execution through role-owned Safe" }`

**config.json**:
- Set `"tradingEnabled": true` (if you want automated trading)
- Configure `"maxSwapUsd": [your maximum total swap value]`
- Set token-specific `targetAllocationBps` for automated rebalancing

**schema.sql** (add execution tracking):
```sql
CREATE TABLE role_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    token_symbol TEXT NOT NULL,
    action TEXT NOT NULL, -- 'BUY' or 'SELL'
    amount TEXT NOT NULL,
    recipient TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    status TEXT NOT NULL, -- 'SUCCESS', 'FAILED', 'PENDING'
);
```

## Execution Model

**Automated Process**:
1. n8n triggers based on schedule or threshold
2. Portfolio analysis calculates required trades
3. Role validation checks amount limits and permissions
4. Role executes transactions through its 1/1 Safe
5. No human signatures required
6. All actions logged for audit

**Safety Controls**:
- Role can only execute whitelisted tokens
- Each trade must be within predefined amount limits
- No multi-signature required (1/1 Safe)
- All transactions logged and auditable

## Monitoring & Observability

**Dashboard Features**:
- Real-time role Safe balance
- Active token permissions list
- Recent execution history
- Transaction status tracking
- Error alerts

**Audit Trail**:
- All automated executions logged
- Token permissions changes recorded
- Transaction failures tracked
- Performance metrics collected

## Next Steps

1. Deploy role-owned 1/1 Safe
2. Configure main Safe with Zodiac Roles
3. Set up pilot and permissions
4. Deploy n8n automation workflows
5. Create status dashboard
6. Test end-to-end automation
7. Enable monitoring and alerting

This setup provides fully automated, secure rebalancing through a dedicated Zodiac Role with strict controls and complete observability.