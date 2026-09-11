# Trigger-Based Rebalancing System

## Overview

This document describes the trigger-based tactical rebalancing mechanism that replaces continuous rebalancing in the portfolio decision system. The system uses specific events to determine when to rebalance, rather than continuously monitoring and adjusting portfolio positions.

## Trigger Types

### A. Major Event Approaching

Rebalance is considered when one of these events approaches:

```json
{
  "events": [
    "CPI",           // Consumer Price Index
    "Fed Meeting",   // Federal Reserve meeting
    "Jobs",          // Employment data (NFP, unemployment)
    "Regulatory",    // Major regulatory decisions
    "ETF",           // ETF approval or changes
    "Protocol",      // Major protocol votes/unlocks
    "Unlock",        // Large token unlocks
    "Major",         // Other major events
  ]
}
```

### B. Portfolio Deviation

```json
{
  "trigger": "portfolio_deviation",
  "threshold": 10,  // 10% deviation from strategic weight
  "window": 72,     // Hours to monitor deviation
  "considerations": ["risk_bucket", "confidence", "event_sensitivity"]
}
```

### C. Sentiment Extreme

```json
{
  "trigger": "sentiment_extreme",
  "conditions": {
    "retail": 75,    // Retail sentiment >= 75/100
    "professional": 80,  // Professional sentiment >= 80/100
    "momentum": "overheated"  // Price momentum excessive
  }
}
```

### D. Volatility Spike

```json
{
  "trigger": "volatility_spike",
  "conditions": {
    "atr_increase": 50,     // ATR increase by 50%
    "realized_volatility": 25,  // 25% realized volatility
    "funding_divergence": true  // Significant funding rate divergence
  }
}
```

### E. Relative Strength Rotation

```json
{
  "trigger": "relative_strength_rotation",
  "conditions": {
    "deFi_vs_ETH": 1.2,      // DeFi > ETH by 20%
    "ETH_vs_BTC": 1.1,      // ETH > BTC by 10%
    "BTC_vs_Alts": 0.9      // BTC underperforming altcoins
  }
}
```

## Risk Mode System

### NORMAL Mode

```json
{
  "mode": "NORMAL",
  "max_tactical_deviation": 15,  // 15% deviation from strategic
  "allowed_sectors": ["core_reserve", "infrastructure", "defi_infrastructure"],
  "prohibited_sectors": ["high_beta_narrative"],
  "USD_reserve_min": 5,          // Minimum 5% USD reserve
  "confidence_threshold": 0.7    // Minimum confidence for trades
}
```

### OPPORTUNISTIC Mode

```json
{
  "mode": "OPPORTUNISTIC",
  "max_tactical_deviation": 25,  // 25% deviation from strategic
  "allowed_sectors": ["all"],    // All sectors allowed
  "USD_reserve_min": 10,         // Minimum 10% USD reserve
  "confidence_threshold": 0.8    // Higher confidence threshold
}
```

## Mode Transition Logic

```json
{
  "risk_mode_determination": {
    "market_regime": ["RISK_ON", "TRANSITION"],
    "sentiment": ["MODERATE_GREED", "MODERATE_FEAR"],
    "liquidity": "stable_or_improving",
    "event_risk": "low_negative_probability",
    "technical": ["BTC_above_key_trend", "ETH_relative_strength_positive"],
    "confidence": ">= 0.75",
    "required_conditions": 4,
    "total_conditions": 5
  }
}
```

## Rebalancing Execution Process

### 1. Trigger Detection

```javascript
async function checkForRebalanceTriggers() {
  const triggers = [];
  
  // Check A. Major events
  const majorEvents = await this.checkMajorEvents();
  triggers.push(...majorEvents);
  
  // Check B. Portfolio deviation
  const deviation = await this.checkPortfolioDeviation();
  if (deviation.exists) triggers.push(deviation);
  
  // Check C. Sentiment extremes
  const sentiment = await this.checkSentimentExtremes();
  if (sentiment.exists) triggers.push(sentiment);
  
  // Check D. Volatility spikes
  const volatility = await this.checkVolatilitySpikes();
  if (volatility.exists) triggers.push(volatility);
  
  // Check E. Relative strength rotation
  const rotation = await this.checkRelativeStrengthRotation();
  if (rotation.exists) triggers.push(rotation);
  
  return triggers;
}
```

### 2. Trigger Analysis

```javascript
async function analyzeTrigger(trigger) {
  const analysis = {
    trigger_type: trigger.type,
    urgency: this.calculateTriggerUrgency(trigger),
    impact_assessment: this.assessMarketImpact(trigger),
    portfolio_implications: await this.analyzePortfolioImpact(trigger),
    recommended_actions: []
  };
  
  // Generate recommended trades based on trigger
  analysis.recommended_actions = await this.generateRecommendedTrades(
    analysis.portfolio_implications
  );
  
  return analysis;
}
```

### 3. Action Validation

```javascript
async function validateTriggerActions(actions) {
  const validation = {
    valid_actions: [],
    rejected_actions: [],
    warnings: []
  };
  
  for (const action of actions) {
    const isValid = await this.validateAction(action);
    
    if (isValid.valid) {
      validation.valid_actions.push(action);
    } else {
      validation.rejected_actions.push({
        action,
        reason: isValid.reason
      });
    }
    
    if (isValid.warning) {
      validation.warnings.push(isValid.warning);
    }
  }
  
  return validation;
}
```

### 4. Execution

```javascript
async function executeRebalanceTrigger(triggerAnalysis) {
  if (triggerAnalysis.recommended_actions.length === 0) {
    return {
      success: false,
      reason: "No actionable recommendations"
    };
  }
  
  const executionResults = [];
  
  for (const action of triggerAnalysis.recommended_actions) {
    try {
      const result = await this.executeTrade(
        action.tokenSymbol,
        action.action,
        action.amount
      );
      
      executionResults.push({
        tokenSymbol: action.tokenSymbol,
        action: action.action,
        amount: action.amount,
        success: true,
        txHash: result.txHash,
        execution_time: Date.now()
      });
      
    } catch (error) {
      executionResults.push({
        tokenSymbol: action.tokenSymbol,
        action: action.action,
        amount: action.amount,
        success: false,
        error: error.message,
        execution_time: Date.now()
      });
    }
  }
  
  return {
    success: true,
    trigger_type: triggerAnalysis.trigger_type,
    actions_executed: executionResults.length,
    successful_executions: executionResults.filter(r => r.success).length,
    failed_executions: executionResults.filter(r => !r.success).length,
    results: executionResults
  };
}
```

## Integration Points

### With Portfolio Analyzer

```javascript
// Trigger-based rebalancing uses portfolio analyzer data
async function getPortfolioAnalysisForTrigger() {
  // Get fresh analysis for trigger evaluation
  const analysis = await this.portfolioAnalyzer.generateCompleteAnalysis();
  
  // Extract relevant data for trigger analysis
  return {
    riskMode: analysis.risk_mode,
    marketRegime: analysis.market_regime,
    eventRisk: analysis.event_risk,
    sentiment: analysis.sentiment,
    decisions: analysis.decisions,
    portfolioSummary: analysis.portfolio_summary
  };
}
```

### With Role Executor

```javascript
// Role executor validates and executes trigger-based trades
async function executeTriggerBasedTrade(tokenSymbol, action, amount) {
  // Validate against role limits
  const validation = await this.validateTradeAmounts(tokenSymbol, action, amount);
  
  if (!validation.valid) {
    throw new Error(`Trade validation failed: ${validation.errors.join(', ')}`);
  }
  
  // Check if action aligns with portfolio analyzer recommendations
  const portfolioValidation = await this.validateAgainstPortfolioAnalysis(
    tokenSymbol, action, amount
  );
  
  if (!portfolioValidation.valid) {
    throw new Error(`Portfolio validation failed: ${portfolioValidation.errors.join(', ')}`);
  }
  
  // Execute the trade
  return await this.executeTrade(tokenSymbol, action, amount);
}
```

## Monitoring and Logging

### Trigger Detection Log

```json
{
  "timestamp": "2024-01-15T14:30:00Z",
  "trigger_type": "portfolio_deviation",
  "trigger_details": {
    "token": "SOL",
    "deviation": 12.5,
    "threshold": 10
  },
  "analysis": {
    "risk_assessment": "moderate",
    "urgency": "high",
    "recommended_action": "DECREASE"
  },
  "executed": true,
  "execution_details": {
    "txHash": "0x...",
    "amount": "0.1 ETH",
    "tokenSymbol": "SOL"
  }
}
```

### Risk Mode Change Log

```json
{
  "timestamp": "2024-01-15T12:00:00Z",
  "event": "risk_mode_change",
  "old_mode": "NORMAL",
  "new_mode": "OPPORTUNISTIC",
  "triggering_conditions": [
    "market_regime: TRANSITION",
    "sentiment: MODERATE_GREED",
    "confidence: 0.82"
  ],
  "impact": "max_tactical_deviation increased from 15% to 25%"
}
```

## Configuration

### Trigger Settings

```json
{
  "trigger_settings": {
    "major_events": {
      "enabled": true,
      "importance_threshold": 7,
      "advance_notification_hours": 24
    },
    "portfolio_deviation": {
      "enabled": true,
      "deviation_threshold_percent": 10,
      "monitoring_window_hours": 72
    },
    "sentiment_extremes": {
      "enabled": true,
      "sentiment_threshold": 75,
      "professional_threshold": 80
    },
    "volatility_spikes": {
      "enabled": true,
      "atr_increase_percent": 50,
      "volatility_threshold": 25
    },
    "relative_strength_rotation": {
      "enabled": true,
      "rotation_threshold": 0.1
    }
  }
}
```

### Risk Mode Configuration

```json
{
  "risk_mode_config": {
    "normal_mode": {
      "max_tactical_deviation": 15,
      "min_usd_reserve": 5,
      "allowed_sectors": ["core_reserve", "infrastructure", "defi_infrastructure"],
      "confidence_threshold": 0.7
    },
    "opportunistic_mode": {
      "max_tactical_deviation": 25,
      "min_usd_reserve": 10,
      "allowed_sectors": ["all"],
      "confidence_threshold": 0.8,
      "max_high_beta_exposure": 20
    },
    "transition_logic": {
      "required_conditions": 4,
      "total_conditions": 5,
      "cooldown_period_hours": 24
    }
  }
}
```

## Benefits of Trigger-Based System

1. **Reduced Trading Costs**: Only trades when necessary, not continuously
2. **Higher Quality Trades**: Focuses on meaningful market events
3. **Better Risk Management**: Avoids over-trading during stable periods
4. **Improved Volatility Capture**: Targets specific volatility opportunities
5. **Cleaner Portfolio**: Maintains strategic discipline with tactical flexibility