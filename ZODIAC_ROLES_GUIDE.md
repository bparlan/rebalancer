# Zodiac Roles Modifier: Lower Threshold for Routine Transactions

## Overview
This guide summarizes the process for setting up a reduced signing threshold for frequent, low-risk transactions using Zodiac Roles and Zodiac Pilot, based on the Gnosis Guild tutorial.

## Prerequisites
- A 3/5 Safe with existing owners
- A web3 wallet (MetaMask, Rabby, etc.) for signing transactions as one of the Safe owners
- Basic familiarity with Safe operations

## Step-by-Step Guide

### Step 1: Set Up Reduced Threshold Safe
1. Go to https://app.safe.global/new-safe/create
2. Deploy a new Safe on the same chain as your main 3/5 Safe
3. Assign the **same set of owners** as your main Safe
4. Set the threshold to `2` instead of `3`
5. Complete the Safe deployment process

> This new Safe will serve as the execution vehicle for reduced-threshold operations.

### Step 2: Choose a Role Name
1. Pick a descriptive name for your role (e.g., `routine_ops`)
2. Use only these characters: a-z, 0-9, _ (underscore)
3. Convert to bytes32 using the [Deth Tools String to Bytes32 Converter](https://tools.deth.net/string-bytes32-conversion)
4. Record the encoded value (you'll need this in the next step)

**Example:**
- Role name: `routine_ops`
- Encoded value: `0x726f7574696e655f6f7073000000000000000000000000000000000000000000`

### Step 3: Enable Roles Modifier on Main Safe
#### 3.1 Add the Roles Modifier
1. Open your main 3/5 Safe in Safe{Wallet}
2. Navigate to the **Apps** section
3. Find and open the **Zodiac Safe app**
4. Select the **Roles Modifier**
5. Keep all default configuration options
6. Click **Add Module**
7. Have all other main Safe owners confirm this transaction

#### 3.2 Assign Role to Reduced-Threshold Safe
1. Once confirmed, go back into the **Zodiac Safe app**
2. Select the **Roles Modifier (v2)** in the left panel
3. Switch to the **Write Contract** tab
4. Select the **assignRoles** function from the list
5. Fill in the parameters:
   - **`module`**: Enter the address of the Safe you created in Step 1
   - **`roleKeys`**: Enter `["<your_bytes32_encoded_role_key>"]`
     * Example: `["0x726f7574696e655f6f7073000000000000000000000000000000000000000000"]`
   - **`memberOf`**: Enter `[true]`
6. Click **Add this transaction**
7. Click **Bundle Transaction** in the top right
8. Click **Submit Transactions** at the bottom
9. Have all other main Safe owners confirm this transaction

### Step 4: Set Up Zodiac Pilot for Execution
#### 4.1 Install Zodiac Pilot & Add Account
1. Install the [Zodiac Pilot browser extension](https://pilot.gnosisguild.org)
2. Launch the extension and click *Add account* at the bottom of the extension panel
3. Select the chain and enter the address of your main 3/5 Safe. You should also give it a descriptive label.
4. Confirm by clicking *Create*. It should now show the Safe account in the extension panel.

#### 4.2 Configure Execution Routes
1. Click **Complete route setup to sign** at the bottom of the Pilot panel
2. In the **Pilot Signer** field, select your own EOA from the list of Safe owners
3. Under **Selected route**, you’ll see two execution options:
   - **Execution through the role** - requires only 1 additional signature
   - **Direct execution from main 3/5 Safe** - requires 2 additional signatures
4. Select the route through the **2/5 Safe and Roles mod**
5. Click **Save** to confirm the configuration

### Step 5: Whitelist Calls for the Role
#### 5.1 Record Transaction Calls
1. Connect to any dApp with Pilot (just like any other browser wallet)
2. For example, to allow wrapping and unwrapping ETH:
   - Go to https://www.wrapeth.com and ensure Pilot is connected
   - On the **Wrap ETH** tab: