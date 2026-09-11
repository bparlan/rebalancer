// Portfolio Analyzer - 6-layer decision engine for strategic + tactical allocation
// Implements the comprehensive portfolio decision system described in the requirements

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class PortfolioAnalyzer {
  constructor(config) {
    this.config = config;
    this.strategicTargets = this.loadStrategicTargets();
    this.tacticalRanges = this.loadTacticalRanges();
    this.riskBuckets = this.loadRiskBuckets();
    this.fundamentalConvictions = this.loadFundamentalConvictions();
    this.marketRegime = null;
    this.eventRisk = null;
    this.sentiment = null;
    this.relativeStrength = null;
    this.tacticalScore = null;
    this.riskMode = "NORMAL";
    this.maxDeviationFactor = 0.15; // 15% default tactical deviation
  }

  loadStrategicTargets() {
    // Current portfolio structure from guide
    return {
      "BTC": { target: 0.05, weight: "strategic reserve" },
      "ETH": { target: 0.10, weight: "strategic reserve" },
      "LINK": { target: 0.11, weight: "infrastructure core" },
      "AAVE": { target: 0.08, weight: "defi core" },
      "SOL": { target: 0.08, weight: "high beta" },
      "UNI": { target: 0.12, weight: "defi beta" },
      "ONDO": { target: 0.07, weight: "RWA narrative" },
      "MORPHO": { target: 0.05, weight: "growth defi" },
      "ZEC": { target: 0.05, weight: "asymmetric bet" },
      "NEAR": { target: 0.05, weight: "alternative L1" },
      "GRT": { target: 0.04, weight: "web3 infra" },
      "AERO": { target: 0.04, weight: "base ecosystem" },
      "RENDER": { target: 0.05, weight: "ai/deepin compute" },
      "AKT": { target: 0.03, weight: "decentralized compute" },
      "BIO": { target: 0.03, weight: "speculative biotech" },
      "USD": { target: 0.05, weight: "tactical reserve" }
    };
  }

  loadTacticalRanges() {
    // Strategic + tactical ranges for each asset
    return {
      "BTC": { min: 0.04, max: 0.10 }, // 5% strategic → 4-10% tactical
      "ETH": { min: 0.08, max: 0.16 }, // 10% strategic → 8-16% tactical
      "LINK": { min: 0.08, max: 0.15 },
      "AAVE": { min: 0.05, max: 0.12 },
      "SOL": { min: 0.05, max: 0.13 },
      "UNI": { min: 0.07, max: 0.16 },
      "ONDO": { min: 0.04, max: 0.10 },
      "MORPHO": { min: 0.02, max: 0.09 },
      "ZEC": { min: 0.02, max: 0.08 },
      "NEAR": { min: 0.02, max: 0.09 },
      "GRT": { min: 0.02, max: 0.07 },
      "AERO": { min: 0.01, max: 0.07 },
      "RENDER": { min: 0.02, max: 0.09 },
      "AKT": { min: 0.01, max: 0.06 },
      "BIO": { min: 0.00, max: 0.06 }, // Can go to 0%
      "USD": { min: 0.05, max: 0.25 } // 5% strategic → 5-25% tactical
    };
  }

  loadRiskBuckets() {
    return {
      "core_reserve": ["BTC", "ETH"],
      "infrastructure": ["LINK", "NEAR", "GRT", "AKT"],
      "defi_infrastructure": ["AAVE", "UNI", "ONDO", "MORPHO", "AERO", "BIO"],
      "high_beta_narrative": ["SOL", "RENDER", "ZEC"]
    };
  }

  loadFundamentalConvictions() {
    return {
      "BTC": 85,
      "ETH": 92,
      "LINK": 86,
      "AAVE": 88,
      "SOL": 70,
      "UNI": 78,
      "ONDO": 75,
      "MORPHO": 82,
      "ZEC": 65,
      "NEAR": 68,
      "GRT": 72,
      "AERO": 70,
      "RENDER": 74,
      "AKT": 68,
      "BIO": 55
    };
  }

  async analyzeCurrentMarketRegime() {
    // Layer 1: Market Regime Analysis
    const regime = {
      risk_appetite: "moderate",
      confidence: 0.71,
      macro: { score: -0.2 },
      crypto_liquidity: { score: 0.4 },
      trend: { score: 0.5 },
      indicators: {}
    };

    this.marketRegime = regime;
    return regime;
  }

  async analyzeEventRisk() {
    // Layer 2: Event Risk Engine
    const events = {
      "next_72h": [
        { name: "CPI", importance: 8, volatility: "HIGH", pricing: "UNDERPRICED", consensus: "BULLISH" },
        { name: "Fed Meeting", importance: 9, volatility: "HIGH", pricing: "FAIR", consensus: "NEUTRAL" },
        { name: "Jobs Report", importance: 7, volatility: "MEDIUM", pricing: "PRICED_IN", consensus: "BEARISH" }
      ],
      "next_7d": [
        { name: "ETF Events", importance: 6, volatility: "MEDIUM", pricing: "UNDERPRICED", consensus: "BULLISH" },
        { name: "Protocol Votes", importance: 5, volatility: "LOW", pricing: "FAIR", consensus: "MIXED" }
      ]
    };

    const critical_events = events.next_72h.filter(e => e.importance >= 8);
    const negative_probability = critical_events.some(e => e.consensus === "BEARISH" || e.pricing === "PRICED_IN") ? 0.6 : 0.3;

    this.eventRisk = {
      events,
      negative_probability,
      timing: "active"
    };

    return this.eventRisk;
  }

  async analyzeSentiment() {
    // Layer 3: Sentiment Engine (mock implementation)
    const sentiment = {
      retail: 62, // 0-100
      professional: 55,
      positioning: 72,
      narrative: 78,
      contrarian: {
        risk: "MODERATE_GREED",
        indicators: [
          { name: "Funding rates", direction: "positive", intensity: "high" },
          { name: "Social sentiment", direction: "euphoric", intensity: "moderate" },
          { name: "Liquidations", direction: "up", intensity: "elevated" }
        ]
      },
      volatility_opportunity: {
        is_present: true,
        opportunity_score: 0.65,
        indicators: ["high funding divergence", "narrative acceleration", "price exhaustion"]
      }
    };

    this.sentiment = sentiment;
    return sentiment;
  }

  async analyzeRelativeStrength() {
    // Layer 4: Asset Relative Strength Analysis
    const relativeStrength = {};
    
    // Mock prices for demonstration
    const mockPrices = {
      "BTC": 105000,
      "ETH": 3500,
      "SOL": 150,
      "UNI": 8,
      "LINK": 15,
      "AAVE": 250,
      "MORPHO": 2.5,
      "RENDER": 2.2,
      "ZEC": 65,
      "NEAR": 5.5,
      "GRT": 0.45,
      "AERO": 0.35,
      "AKT": 0.8,
      "BIO": 1.2,
      "ONDO": 1.8,
      "USD": 1.0
    };

    const sectorBenchmarks = {
      "BTC": 0,
      "ETH": 0,
      "BTC_DOMINANCE": 0.52,
      "ETH_DOMINANCE": 0.18,
      "TOTAL_CRYPTO": 0.68
    };

    // Calculate relative strength vs USD, BTC, ETH
    for (const [symbol, price] of Object.entries(mockPrices)) {
      const usdStrength = 1.0; // Mock - would be actual calculation
      const btcStrength = symbol === "BTC" ? 1.0 : 0.95; // BTC beats alt
      const ethStrength = symbol === "ETH" ? 1.0 : 0.88;

      // Sector strength
      let sector = "core_reserve";
      if (["LINK", "NEAR", "GRT", "AKT"].includes(symbol)) sector = "infrastructure";
      else if (["AAVE", "UNI", "ONDO", "MORPHO", "AERO", "BIO"].includes(symbol)) sector = "defi_infrastructure";
      else if (["SOL", "RENDER", "ZEC"].includes(symbol)) sector = "high_beta_narrative";

      relativeStrength[symbol] = {
        vs_usd: usdStrength,
        vs_btc: btcStrength,
        vs_eth: ethStrength,
        sector,
        sector_rank: Math.floor(Math.random() * 10),
        overall_score: (btcStrength + ethStrength) / 2
      };
    }

    this.relativeStrength = relativeStrength;
    return relativeStrength;
  }

  async analyzeFundamentalConviction() {
    // Layer 5: Fundamental Conviction (already loaded)
    return this.fundamentalConvictions;
  }

  async calculateTacticalOpportunityScore() {
    // Layer 6: Tactical Opportunity Score
    const convictions = await this.analyzeFundamentalConviction();
    const sentiment = await this.analyzeSentiment();
    const relativeStrength = await this.analyzeRelativeStrength();
    const marketRegime = await this.analyzeCurrentMarketRegime();

    // Check if risk mode is OPPORTUNISTIC
    const canTakeRisk = this.checkRiskMode();
    const maxDeviation = canTakeRisk ? 0.25 : 0.15; // 25% in opportunistic, 15% normal

    const tacticalScores = {};

    for (const [symbol, conviction] of Object.entries(convictions)) {
      if (symbol === "USD") continue; // Skip USD for tactical scoring

      const fundamentals = conviction / 100;
      const sentimentFactor = (sentiment.contrarian.indicators.some(i => i.intensity === "high") ? 0.7 : 1.0);
      const rsFactor = relativeStrength[symbol].overall_score;
      const regimeFactor = marketRegime.risk_appetite === "high" ? 1.2 : marketRegime.risk_appetite === "low" ? 0.8 : 1.0;

      // Base tactical score
      let score = fundamentals * 0.25 + sentimentFactor * 0.25 + rsFactor * 0.25 + regimeFactor * 0.25;

      // Adjust for sector and risk bucket
      const sector = relativeStrength[symbol].sector;
      if (sector === "high_beta_narrative") score *= 1.1; // Higher upside potential
      if (sector === "core_reserve") score *= 0.9; // Lower volatility

      // Convert to actionable range
      const tacticalRange = this.tacticalRanges[symbol];
      const currentPosition = 0.02; // Mock - would need actual position
      const deviation = (currentPosition - tacticalRange.min) / tacticalRange.max;

      // Tactical decision
      let action = "HOLD";
      let confidence = 0;

      if (score > 0.8 && deviation < -0.3) {
        action = "INCREASE";
        confidence = (score - 0.8) * 2;
      } else if (score < 0.3 && deviation > 0.3) {
        action = "DECREASE";
        confidence = (0.3 - score) * 2;
      }

      tacticalScores[symbol] = {
        conviction,
        fundamentals,
        sentiment_factor: sentimentFactor,
        relative_strength: rsFactor,
        regime_factor: regimeFactor,
        sector,
        current_position: currentPosition,
        tactical_range: tacticalRange,
        deviation,
        score,
        action,
        confidence,
        max_deviation: maxDeviation
      };
    }

    this.tacticalScore = tacticalScores;
    return tacticalScores;
  }

  checkRiskMode() {
    // Check if we should enter OPPORTUNISTIC risk mode
    const marketRegime = this.marketRegime;
    const sentiment = this.sentiment;
    const eventRisk = this.eventRisk;

    const conditions = {
      market_regime: ["RISK_ON", "TRANSITION"].includes(marketRegime.risk_appetite) || marketRegime.risk_appetite === "moderate",
      sentiment: sentiment.contrarian.risk === "MODERATE_GREED" || sentiment.contrarian.risk === "MODERATE_FEAR",
      liquidity: true, // Would check actual liquidity
      event_risk: eventRisk.negative_probability < 0.4,
      technical: true, // Would check BTC/ETH trends
      confidence: marketRegime.confidence > 0.75
    };

    const metConditions = Object.values(conditions).filter(Boolean).length;
    const totalConditions = Object.keys(conditions).length;

    if (metConditions >= 4 && totalConditions >= 5) {
      this.riskMode = "OPPORTUNISTIC";
      return true;
    }

    return false;
  }

  generatePortfolioDecision() {
    // Generate final portfolio rebalancing decisions
    const tacticalScores = this.tacticalScore;
    const strategicTargets = this.strategicTargets;
    const tacticalRanges = this.tacticalRanges;

    const decisions = [];
    const currentPortfolioValue = 100; // Mock total portfolio value in USD

    for (const [symbol, score] of Object.entries(tacticalScores)) {
      const strategicTarget = strategicTargets[symbol].target * currentPortfolioValue;
      const tacticalRange = tacticalRanges[symbol];
      const maxDeviation = score.max_deviation;

      let targetAllocation = strategicTarget;

      // Apply tactical adjustments
      if (score.action === "INCREASE" && score.confidence > 0.7) {
        const increasePercent = Math.min(maxDeviation * 0.8, 0.10); // Up to 10% increase
        targetAllocation = strategicTarget * (1 + increasePercent);
      } else if (score.action === "DECREASE" && score.confidence > 0.7) {
        const decreasePercent = Math.min(maxDeviation * 0.8, 0.10); // Up to 10% decrease
        targetAllocation = strategicTarget * (1 - decreasePercent);
      }

      // Ensure within tactical range
      targetAllocation = Math.max(tacticalRange.min * currentPortfolioValue, 
                                Math.min(tacticalRange.max * currentPortfolioValue, targetAllocation));

      const currentAllocation = 0; // Mock current allocation
      const change = targetAllocation - currentAllocation;
      const changePercent = change / currentPortfolioValue;

      decisions.push({
        symbol,
        strategic_target: strategicTarget,
        tactical_target: targetAllocation,
        tactical_range: tacticalRange,
        current_allocation: currentAllocation,
        action: score.action,
        confidence: score.confidence,
        deviation_percent: changePercent * 100,
        reasoning: this.buildReasoning(score),
        risk_bucket: this.getRiskBucket(symbol),
        event_sensitivity: this.getEventSensitivity(symbol),
        invalidation_conditions: this.getInvalidationConditions(symbol)
      });
    }

    return {
      risk_mode: this.riskMode,
      market_regime: this.marketRegime,
      event_risk: this.eventRisk,
      sentiment: this.sentiment,
      decisions,
      portfolio_summary: {
        total_assets: Object.keys(tacticalScores).length - 1, // Exclude USD
        tactical_adjustments: decisions.filter(d => d.action !== "HOLD").length,
        risk_level: this.calculatePortfolioRiskLevel(decisions)
      }
    };
  }

  buildReasoning(score) {
    const reasons = [];
    if (score.action === "INCREASE") {
      reasons.push("High fundamental conviction");
      if (score.relative_strength > 1.0) reasons.push("Strong relative performance");
      if (score.sentiment_factor > 1.0) reasons.push("Positive sentiment momentum");
      if (this.getRiskBucket(score.symbol) === "high_beta_narrative") reasons.push("High-beta asset with upside potential");
    } else if (score.action === "DECREASE") {
      reasons.push("Lower conviction score");
      if (score.relative_strength < 0.9) reasons.push("Underperformance vs peers");
      if (score.sentiment_factor < 0.8) reasons.push("Negative sentiment");
      if (this.getRiskBucket(score.symbol) === "core_reserve" && score.confidence > 0.7) reasons.push("Needed to rebalance core reserves");
    }
    return reasons.join(", ");
  }

  getRiskBucket(symbol) {
    for (const [bucket, assets] of Object.entries(this.riskBuckets)) {
      if (assets.includes(symbol)) return bucket;
    }
    return "unknown";
  }

  getEventSensitivity(symbol) {
    const high_impact_events = this.eventRisk.events.next_72h.filter(e => e.importance >= 8);
    const sensitiveEvents = high_impact_events.map(e => e.name);

    if (["ETH", "BTC", "SOL"].includes(symbol)) {
      return "HIGH"; // Major market impact
    } else if (["AAVE", "UNI", "ONDO"].includes(symbol)) {
      return "MEDIUM"; // DeFi sensitivity
    }
    return "LOW";
  }

  getInvalidationConditions(symbol) {
    return [
      "ETH loses key trend",
      "Yields accelerate higher",
      "Macro data deteriorates unexpectedly",
      "Liquidity conditions deteriorate"
    ];
  }

  calculatePortfolioRiskLevel(decisions) {
    const high_beta_assets = decisions.filter(d => d.risk_bucket === "high_beta_narrative" && d.action === "INCREASE").length;
    const total_tactical_adjustments = decisions.filter(d => d.action !== "HOLD").length;

    if (high_beta_assets >= 3 && total_tactical_adjustments >= 4) return "HIGH";
    if (high_beta_assets >= 2 || total_tactical_adjustments >= 3) return "MODERATE";
    return "LOW";
  }

  async generateCompleteAnalysis() {
    // Run all analysis layers
    await this.analyzeCurrentMarketRegime();
    await this.analyzeEventRisk();
    await this.analyzeSentiment();
    await this.analyzeRelativeStrength();
    await this.calculateTacticalOpportunityScore();

    return this.generatePortfolioDecision();
  }
}

module.exports = PortfolioAnalyzer;