// VPS deployment script for automated Zodiac Role rebalancer
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OMPSiteDeployer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  
  async generateSecureConfig() {
    // Generate secure environment file
    const envExample = `# Core Configuration
PRIVATE_KEY=${this.generateSecureKey()}
WEB3_PROVIDER=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# n8n Integration
N8N_API_URL=http://localhost:5678
N8N_EXECUTION_TOKEN=${this.generateSecureKey()}

# Status API
STATUS_API_PORT=3000

# Logging
LOG_LEVEL=info

# Database
DATABASE_PATH=${this.projectRoot}/logs/runs.sqlite

# Security
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
HEALTH_CHECK_INTERVAL_MS=30000
METRICS_RETENTION_HOURS=168

# Zodiac Configuration
ROLE_MEMBER_ADDRESS=0xYOUR_ROLE_MEMBER_ADDRESS
ROLE_KEY=0xYOUR_ROLE_BYTES32_KEY
CHAIN_ID=8453
TARGET_SAFE_ADDRESS=0xYOUR_TARGET_SAFE_ADDRESS
`;
    
    const envPath = path.join(this.projectRoot, '.env.example');
    fs.writeFileSync(envPath, envExample);
    console.log(`Generated environment file at ${envPath}`);
    
    // Generate .env file (should be kept secret)
    const env = `# Environment variables - REPLACE WITH ACTUAL VALUES
PRIVATE_KEY=YOUR_ACTUAL_PRIVATE_KEY_HERE
WEB3_PROVIDER=https://base-mainnet.g.alchemy.com/v2/YOUR_ACTUAL_API_KEY
N8N_API_URL=http://localhost:5678
N8N_EXECUTION_TOKEN=YOUR_ACTUAL_N8N_TOKEN
STATUS_API_PORT=3000
LOG_LEVEL=info
DATABASE_PATH=${this.projectRoot}/logs/runs.sqlite
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
HEALTH_CHECK_INTERVAL_MS=30000
METRICS_RETENTION_HOURS=168
ROLE_MEMBER_ADDRESS=0xYOUR_ROLE_MEMBER_ADDRESS
ROLE_KEY=0xYOUR_ROLE_BYTES32_KEY
CHAIN_ID=8453
TARGET_SAFE_ADDRESS=0xYOUR_TARGET_SAFE_ADDRESS
`;
    
    const envPath2 = path.join(this.projectRoot, '.env');
    fs.writeFileSync(envPath2, env);
    console.log(`Generated .env file at ${envPath2} - UPDATE BEFORE DEPLOYMENT!`);
  }
  
  generateSecureKey() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  async createSystemdService() {
    const serviceContent = `# Zodiac Role Rebalancer Service
[Unit]
Description=Zodiac Role Automated Portfolio Rebalancer
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=rebalancer
Group=rebalancer
WorkingDirectory=${this.projectRoot}
Environment=NODE_ENV=production
EnvironmentFile=${this.projectRoot}/.env
ExecStart=/usr/bin/node ${this.projectRoot}/scripts/start-automated.sh
Restart=always
RestartSec=10
StandardOutput=append:${this.projectRoot}/logs/service.log
StandardError=append:${this.projectRoot}/logs/service-error.log

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${this.projectRoot}/logs

[Install]
WantedBy=multi-user.target
`;
    
    const servicePath = '/etc/systemd/system/rebalancer.service';
    fs.writeFileSync(servicePath, serviceContent);
    console.log(`Created systemd service at ${servicePath}`);
  }
  
  async createInitScript() {
    const initScript = `#!/bin/bash
# Zodiac Role Rebalancer Automated Startup Script
set -e

cd ${this.projectRoot}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Create logs directory
mkdir -p logs

# Initialize database
if [ ! -f "logs/runs.sqlite" ]; then
    echo "Initializing database..."
    node scripts/initialize-db.js
fi

# Start services
echo "Starting core rebalancer..."
nodemon --watch src --watch config.json --watch n8n \
    --exec "node src/role-executor.js" &

REBALANCER_PID=$!

echo "Starting status API..."
node src/status-api.js &

STATUS_API_PID=$!

# Store PIDs for management
echo $REBALANCER_PID > logs/pids.txt
echo $STATUS_API_PID >> logs/pids.txt

# Wait for all processes
echo "All services started. Press Ctrl+C to stop."
wait $REBALANCER_PID $STATUS_API_PID
`;
    
    const scriptPath = `${this.projectRoot}/scripts/start-automated.sh`;
    fs.writeFileSync(scriptPath, initScript);
    fs.chmodSync(scriptPath, '755');
    console.log(`Created startup script at ${scriptPath}`);
  }
  
  async createLogrotateConfig() {
    const logrotateConfig = `#
# Zodiac Role Rebalancer Log Rotation
#

${this.projectRoot}/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 644 rebalancer rebalancer
    postrotate
        # Signal services to reopen logs
        if [ -f ${this.projectRoot}/logs/pids.txt ]; then
            kill -HUP $(cat ${this.projectRoot}/logs/pids.txt) 2>/dev/null || true
        fi
    endscript
}

${this.projectRoot}/logs/*.sqlite {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 rebalancer rebalancer
}

/var/log/syslog {
    rotate 7
    weekly
    compress
    missingok
    notifempty
}
`;
    
    const configPath = '/etc/logrotate.d/rebalancer';
    fs.writeFileSync(configPath, logrotateConfig);
    console.log(`Created logrotate config at ${configPath}`);
  }
  
  async createHealthCheck() {
    const healthScript = `#!/bin/bash
# Health Check Script for Zodiac Role Rebalancer

PROJECT_ROOT="${this.projectRoot}"
STATUS_API_URL="http://localhost:3000/api/health"
LOG_FILE="${this.projectRoot}/logs/health.log"

function check_status_api() {
    if curl -s "${STATUS_API_URL}" > /dev/null; then
        echo "$(date): Status API is healthy" >> "$LOG_FILE"
        return 0
    else
        echo "$(date): Status API is down" >> "$LOG_FILE"
        return 1
    fi
}

function check_database() {
    if [ -f "${PROJECT_ROOT}/logs/runs.sqlite" ]; then
        echo "$(date): Database exists" >> "$LOG_FILE"
        return 0
    else
        echo "$(date): Database missing" >> "$LOG_FILE"
        return 1
    fi
}

function check_recent_executions() {
    local recent_count=0
    if [ -f "${PROJECT_ROOT}/logs/runs.sqlite" ]; then
        recent_count=$(sqlite3 "${PROJECT_ROOT}/logs/runs.sqlite" "SELECT COUNT(*) FROM runs WHERE timestamp > ${SECONDS};" 2>/dev/null || echo "0")
    fi
    
    if [ "$recent_count" -gt 0 ]; then
        echo "$(date): Found $recent_count recent executions" >> "$LOG_FILE"
        return 0
    else
        echo "$(date): No recent executions" >> "$LOG_FILE"
        return 1
    fi
}

function main() {
    echo "=== Health Check at $(date) ===" >> "$LOG_FILE"
    
    local all_passed=true
    
    if ! check_status_api; then
        all_passed=false
    fi
    
    if ! check_database; then
        all_passed=false
    fi
    
    if ! check_recent_executions; then
        all_passed=false
    fi
    
    if [ "$all_passed" = true ]; then
        echo "$(date): All health checks passed" >> "$LOG_FILE"
        exit 0
    else
        echo "$(date): Health checks failed" >> "$LOG_FILE"
        exit 1
    fi
}

main "$@"
`;
    
    const scriptPath = `${this.projectRoot}/scripts/health-check.sh`;
    fs.writeFileSync(scriptPath, healthScript);
    fs.chmodSync(scriptPath, '755');
    console.log(`Created health check script at ${scriptPath}`);
  }
  
  async deploy() {
    console.log('Starting Zodiac Role Rebalancer deployment...');
    
    // Generate configuration
    await this.generateSecureConfig();
    
    // Create system files
    await this.createSystemdService();
    await this.createInitScript();
    await this.createLogrotateConfig();
    await this.createHealthCheck();
    
    console.log('\n=== Deployment Summary ===');
    console.log('1. Environment files created (.env.example, .env)');
    console.log('2. Systemd service configured');
    console.log('3. Startup script created');
    console.log('4. Log rotation configured');
    console.log('5. Health check script created');
    
    console.log('\n=== Next Steps ===');
    console.log('1. Update .env with actual values');
    console.log('2. Create rebalancer user: sudo useradd -r -s /bin/bash rebalancer');
    console.log('3. Set up n8n workflows');
    console.log('4. Install and configure logrotate');
    console.log('5. Test deployment: sudo systemctl enable rebalancer');
    console.log('6. Start service: sudo systemctl start rebalancer');
  }
}

async function main() {
  const deployer = new OMPSiteDeployer('/Users/bparlan/devcode/rebalancer');
  await deployer.deploy();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OMPSiteDeployer;