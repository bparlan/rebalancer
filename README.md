# Automated Zodiac Role Rebalancer

## Overview
This project implements an autonomous portfolio-rebalancing bot for the Base chain that uses Zodiac Roles for secure, automated execution through a role-owned 1/1 Safe wallet.

## Key Features

### Automated Execution
- **No Human Intervention**: All trades executed through Zodiac Role-owned 1/1 Safe
- **Strict Controls**: Whitelisted tokens only, with configurable amount limits
- **Zodiac Integration**: Uses Zodiac Roles for permission management and routing

### Observational UI
- **Real-time Dashboard**: Live status monitoring of role operations
- **WebSocket Updates**: Auto-refresh every 30 seconds
- **Execution Tracking**: Complete audit trail of all automated trades

### n8n Automation
- **VPS-Ready**: Scheduled workflows for portfolio rebalancing
- **Error Handling**: Automated recovery and alerting
- **Health Monitoring**: System health checks and status reporting

## Project Structure

```
rebalancer/
├── n8n/                          # n8n workflow package
│   └── workflows/              # Automation workflows
├── src/                         # Core automated logic
│   ├── role-executor.js         # Automated execution engine
│   ├── token-validator.js      # Strict amount validation
│   └── status-api.js            # Observational UI API
├── scripts/                     # Utilities
│   └── deploy-config.js         # VPS deployment script
├── dashboard/                  # Observational UI
│   └── status-monitor.html     # Live status display
├── logs/                        # Append-only audit logs
│   └── runs.sqlite             # Execution tracking
├── .env.example                # Environment variables
└── config.json                 # Runtime configuration
```

## Setup Instructions

### Prerequisites
- Node.js 22+ (ESM support)
- PostgreSQL or SQLite for logs
- Base chain access
- Zodiac Safe app configured

### Initial Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment**
```bash
# Copy .env.example to .env
# Set PRIVATE_KEY for role execution
# Set WEB3_PROVIDER for Base chain
# Set N8N_API_URL for workflow integration
```

3. **Initialize Database**
```bash
# Create runs table (see schema.sql)
# Initialize logs directory
```

4. **Deploy to VPS**
```bash
# Using the deployment script
./scripts/deploy-config.js

# Or manually:
systemctl enable rebalancer
systemctl start rebalancer
```

### Starting Services

1. **Core Bot**
```bash
npm start
```

2. **Status API**
```bash
node src/status-api.js
```

3. **VPS Deployment**
```bash
systemctl start rebalancer
journalctl -u rebalancer -f
```

## Configuration

### config.json
```json
{
  "chainId": 8453,
  "minEthGasReserveWei": "2000000000000000",
  "maxSlippageBps": 50,
  "hysteresisBps": 500,
  "tradingEnabled": false,
  "maxSwapUsd": "50",
  "tokens": {
    "ETH": {
      "symbol": "ETH",
      "address": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "decimals": 18,
      "targetAllocationBps": 7300
    },
    "USDC": {
      "symbol": "USDC", 
      "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913",
      "decimals": 6,
      "targetAllocationBps": 1000
    }
  }
}
```

### Environment Variables
```bash
# Core
PRIVATE_KEY=your_private_key_here
WEB3_PROVIDER=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# n8n Integration
N8N_API_URL=http://your-vps-ip:5678
N8N_EXECUTION_TOKEN=your_n8n_token

# Status API
STATUS_API_PORT=3000

# Logging
LOG_LEVEL=info
```

## n8n Workflows

### Trigger Portfolio Analysis
- **Schedule**: Every 6 hours (adjustable)
- **Action**: Calculate portfolio drift vs targets
- **Output**: Trade recommendations with amount validation

### Validate Against Role Limits
- **Input**: Portfolio analysis results
- **Action**: Check each proposed trade against role permissions
- **Output**: Validated trades for execution

### Execute via Zodiac Role
- **Input**: Validated trade list
- **Action**: Send transactions through role-owned 1/1 Safe
- **Output**: Transaction hashes and execution logs

### Log and Monitor
- **Input**: Execution results
- **Action**: Store in audit logs, trigger alerts
- **Output**: Updated status for observational UI

## Observational UI

Access the status dashboard at:
```
http://your-server-ip:3000/dashboard/status-monitor.html
```

Features:
- **Real-time Status**: Role Safe balance, permissions, health
- **Execution History**: Complete audit trail of automated trades
- **System Health**: Registry status, recent failures, overall operational status
- **Auto-refresh**: Updates every 30 seconds

## API Endpoints

### GET /api/role-status
Returns comprehensive role status including:
- Role Safe address and balance
- Active token permissions
- Recent execution history
- System health status

### GET /api/health
Simple health check endpoint for monitoring systems.

### POST /api/execute-trade
Execute a single trade manually (for testing/debugging).

### GET /api/executions
Retrieve execution history with pagination support.

## Security Features

1. **Role-Based Access Control**
   - Only whitelisted tokens can be traded
   - Each trade validated against strict amount limits
   - No multi-signature required (1/1 Safe owned by role)

2. **Audit Trail**
   - All transactions logged with full details
   - Append-only logs prevent tampering
   - Complete execution history for compliance

3. **Error Handling**
   - Automated retry for transient failures
   - Alerting for critical issues
   - Health monitoring with automated recovery

## Monitoring & Observability

### Log Monitoring
```bash
# Core bot logs
tail -f logs/rebalancer.log

# Database queries
sqlite3 logs/runs.sqlite "SELECT * FROM runs ORDER BY timestamp DESC LIMIT 10;"
```

### System Health
```bash
# Check status API
curl http://localhost:3000/api/health

# Check recent executions
curl "http://localhost:3000/api/executions?limit=5"
```

### n8n Workflow Monitoring
- Monitor workflow execution in n8n interface
- Check for failed runs and alert
- Review execution logs for performance analysis

## Performance Optimization

1. **Batch Operations**
   - Multiple trades can be batched through role
   - Reduce gas costs for frequent rebalancing

2. **Gas Management**
   - Dynamic gas reserve calculation
   - Gas optimization through careful transaction sequencing

3. **Error Recovery**
   - Automatic retry for failed transactions
   - Exponential backoff for network issues

## Testing

### Manual Testing
```bash
# Test token validation
node -e "
const validator = require('./src/token-validator.js');
const result = validator.validateTrade('WETH', 'BUY', '0.1');
console.log(result);
"

# Test status API
node src/status-api.js
```

### Automated Testing
```bash
# Run portfolio analysis
node scripts/test-portfolio.js

# Validate against role limits
node scripts/validate-exports.js
```

## Troubleshooting

### Common Issues

1. **Connection Errors**
   ```
   Error: Failed to connect to Web3 provider
   ```
   - Check WEB3_PROVIDER environment variable
   - Verify network connectivity
   - Ensure Base chain access

2. **Validation Failures**
   ```
   Error: Token XYZ not in role whitelist
   ```
   - Add token to registry in n8n/rebalancer-roles-registry.json
   - Verify token address on Base chain
   - Check token verification status

3. **Status API Not Loading**
   ```
   Connection failed - Status API unreachable
   ```
   - Ensure status-api.js is running
   - Check STATUS_API_PORT configuration
   - Verify firewall allows port 3000

### Debug Commands
```bash
# Check service status
systemctl status rebalancer

# View logs
journalctl -u rebalancer --since "1 hour ago"

# Manual validation
node scripts/debug-validations.js

# Reset database (use with caution)
rm logs/runs.sqlite
node scripts/initialize-db.js
```

## Contributing

1. **Development Setup**
   - Fork the repository
   - Create feature branch
   - Follow existing code style and conventions

2. **Code Standards**
   - Use ES Module syntax (.js files)
   - Follow BigInt precision requirements
   - Maintain append-only logs

3. **Testing**
   - Add unit tests for new functionality
   - Test with mainnet configuration
   - Verify VPS deployment

## License

This project is part of the Oh My Pi ecosystem. See CONTRIBUTING.md for contribution guidelines.

## Support

For issues and support, contact the project maintainers through the appropriate channels.

---

*This project is designed for automated, secure portfolio rebalancing through Zodiac Roles. All execution is handled by a dedicated role-owned Safe with comprehensive oversight and audit capabilities.*