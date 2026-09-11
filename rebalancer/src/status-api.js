// Observational UI API - provides real-time status for dashboard
const express = require('express');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const PortfolioAnalyzer = require('./portfolio-analyzer.js');

class StatusAPI {
  constructor(config) {
    this.app = express();
    this.config = config;
    this.port = process.env.STATUS_API_PORT || 3000;
    this.registryPath = path.join(__dirname, '../n8n/rebalancer-roles-registry.json');
    this.registry = this.loadRegistry();
    this.logsPath = path.join(__dirname, '../logs/runs.sqlite');
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  loadRegistry() {
    try {
      const data = fs.readFileSync(this.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load registry:', error.message);
      return null;
    }
  }
  
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../dashboard')));
  }
  
  setupRoutes() {
    // Main status endpoint
    this.app.get('/api/role-status', async (req, res) => {
      try {
        const roleStatus = await this.getRoleStatus();
        const permissions = await this.getActivePermissions();
        const recentExecutions = await this.getRecentExecutions();
        const health = await this.getSystemHealth();
        
        res.json({
          timestamp: Date.now(),
          role: roleStatus,
          permissions,
          recentExecutions,
          health
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Health check endpoint
    this.app.get('/api/health', async (req, res) => {
      try {
        const health = await this.getSystemHealth();
        res.json({
          status: health.isOperational ? 'operational' : 'degraded',
          timestamp: Date.now(),
          details: health
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Manual execution trigger (for testing)
    this.app.post('/api/execute-trade', async (req, res) => {
      try {
        const { tokenSymbol, action, amount } = req.body;
        const result = await this.executeTrade(tokenSymbol, action, amount);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });
    
    // Get execution history
    this.app.get('/api/executions', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const executions = await this.getRecentExecutions(limit);
        res.json(executions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
  
  async getRoleStatus() {
    // Simulate role Safe status - in real implementation, this would query the actual role Safe
    return {
      address: this.registry?.role?.member || '0xunknown',
      chainId: this.registry?.chain?.chainId || 8453,
      network: this.registry?.chain?.name || 'base',
      threshold: '1-of-1', // 1/1 Safe owned by role
      isOperational: true,
      lastChecked: Date.now()
    };
  }
  
  async getActivePermissions() {
    if (!this.registry) return [];
    
    return this.registry.tokens
      .filter(token => token.verified)
      .map(token => ({
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        maxTradeAmount: token.maxTradeAmount || 'unlimited',
        verified: token.verified
      }));
  }
  
  async getRecentExecutions(limit = 10) {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(this.logsPath);
    
    return new Promise((resolve, reject) => {
      const executions = [];
      db.each(
        'SELECT id, timestamp, status, action_summary FROM runs WHERE status IN (?, ?) ORDER BY timestamp DESC LIMIT ?',
        ['EXECUTED', 'FAILED', limit],
        (err, row) => {
          if (err) reject(err);
          try {
            const summary = JSON.parse(row.action_summary || '{}');
            executions.push({
              id: row.id,
              timestamp: row.timestamp,
              status: row.status,
              tokenSymbol: summary.tokenSymbol || 'unknown',
              action: summary.action || 'unknown',
              amount: summary.amount || '0',
              txHash: summary.txHash || 'pending',
              executor: summary.executor || 'unknown'
            });
          } catch (parseError) {
            executions.push({
              id: row.id,
              timestamp: row.timestamp,
              status: row.status,
              tokenSymbol: 'parse-error',
              error: parseError.message
            });
          }
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
    const roleStatus = await this.getRoleStatus();
    const permissions = await this.getActivePermissions();
    const recentExecutions = await this.getRecentExecutions(5);
    
    const hasRecentFailures = recentExecutions.some(e => e.status === 'FAILED');
    const registryComplete = this.registry && 
      this.registry.role.verified && 
      this.registry.tokens.every(t => t.verified) &&
      this.registry.executionVenue.type !== '#NEEDS-CLARIFICATION';
    
    return {
      role: roleStatus,
      activePermissions: permissions.length,
      recentExecutions: recentExecutions.length,
      hasRecentFailures,
      registryComplete,
      isOperational: roleStatus.isOperational && 
                   permissions.length > 0 && 
                   registryComplete &&
                   !hasRecentFailures
    };
  }
  
  async executeTrade(tokenSymbol, action, amount) {
    // This would integrate with the actual role executor
    // For now, returns a mock response
    return {
      success: true,
      message: `Trade execution triggered for ${tokenSymbol} ${action} ${amount}`,
      estimatedGas: '21000',
      gasCostUsd: '5.25'
    };
  }
  
  start() {
    this.app.listen(this.port, () => {
      console.log(`Status API running on port ${this.port}`);
      console.log(`Observational UI available at http://localhost:${this.port}/dashboard/status-monitor.html`);
    });
  }
}

module.exports = StatusAPI;