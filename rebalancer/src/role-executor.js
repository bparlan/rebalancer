// Automated role execution - no human intervention required
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class AutomatedRoleExecutor {
  constructor(roleSafe, config) {
    this.roleSafe = roleSafe;  // 1/1 Safe owned by Zodiac Role
    this.config = config;
    this.registryPath = path.join(__dirname, '../n8n/rebalancer-roles-registry.json');
    this.registry = this.loadRegistry();
    this.logPath = path.join(__dirname, '../logs/runs.sqlite');
  }
  
  loadRegistry() {
    try {
      const data = fs.readFileSync(this.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load registry:', error.message);
      throw error;
    }
  }
  
  async executeTrade(tokenSymbol, action, amount) {
    // 1. Validate against strict role limits
    const validated = await this.validateTradeAmounts(tokenSymbol, action, amount);
    
    // 2. Build transaction for role-owned Safe
    const tx = await this.buildRoleTransaction(validated);
    
    // 3. Execute via role (no approval needed - 1/1)
    const hash = await this.roleSafe.executeTransaction(tx);
    
    // 4. Log automatically
    await this.logExecution(tokenSymbol, action, amount, hash);
    
    return { success: true, txHash: hash, details: validated };
  }
  
  async validateTradeAmounts(tokenSymbol, action, amount) {
    const validatorPath = path.join(__dirname, 'token-validator.js');
    const validator = require(validatorPath);
    return await validator.validateTrade(tokenSymbol, action, amount, this.registry, this.config);
  }
  
  async buildRoleTransaction(validated) {
    // Build transaction data for role-owned Safe execution
    // This would include the actual contract calls based on execution venue
    return {
      to: validated.targetContract,
      data: validated.calldata,
      value: validated.value || '0x0',
      operation: 0, // Call
    };
  }
  
  async logExecution(tokenSymbol, action, amount, txHash) {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(this.logPath);
    
    const timestamp = Date.now();
    const status = 'EXECUTED';
    const actionSummary = JSON.stringify({
      tokenSymbol,
      action,
      amount,
      txHash,
      executor: this.registry.role.member
    });
    
    db.run(
      'INSERT INTO runs (timestamp, total_portfolio_usd, status, action_summary) VALUES (?, ?, ?, ?)',
      [timestamp, '0', status, actionSummary],
      (err) => {
        if (err) {
          console.error('Failed to log execution:', err.message);
        }
      }
    );
    
    db.close();
  }
  
  async getSafeStatus() {
    return {
      address: this.roleSafe.address,
      balance: await this.roleSafe.getBalance(),
      nonce: await this.roleSafe.getTransactionCount(),
      isOperational: true
    };
  }
  
  async getActivePermissions() {
    return this.registry.tokens.filter(t => t.verified).map(t => ({
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      maxTradeAmount: t.maxTradeAmount || 'unlimited'
    }));
  }
  
  async getRecentExecutions(limit = 10) {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(this.logPath);
    
    return new Promise((resolve, reject) => {
      const executions = [];
      db.each(
        'SELECT * FROM runs WHERE status = ? ORDER BY timestamp DESC LIMIT ?',
        ['EXECUTED', limit],
        (err, row) => {
          if (err) reject(err);
          executions.push(row);
        },
        (err) => {
          if (err) reject(err);
          resolve(executions);
        }
      );
      db.close();
    });
  }
  
  async getSystemHealth() {
    const safeStatus = await this.getSafeStatus();
    const permissions = await this.getActivePermissions();
    
    return {
      safe: safeStatus,
      activePermissions: permissions.length,
      registryVerified: this.registry.role.verified && this.registry.tokens.every(t => t.verified),
      isOperational: safeStatus.isOperational && permissions.length > 0
    };
  }
}

module.exports = AutomatedRoleExecutor;