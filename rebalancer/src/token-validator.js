// Strict token amount validation - enforces whitelist + specified limits only
const { ethers } = require("ethers");

class TokenValidator {
  constructor(registry, config) {
    this.registry = registry;
    this.config = config;
    this.errors = [];
  }
  
  validateTrade(tokenSymbol, action, amount, registry = this.registry, config = this.config) {
    this.errors = [];
    
    // 1. Must be in whitelist
    const token = registry.tokens.find(t => t.symbol === tokenSymbol);
    if (!token) {
      this.errors.push(`Token ${tokenSymbol} not in role whitelist`);
      return { valid: false, errors: this.errors };
    }
    
    if (!token.verified) {
      this.errors.push(`Token ${tokenSymbol} address not verified: ${token.address}`);
      return { valid: false, errors: this.errors };
    }
    
    // 2. Validate amount within limits
    const amountValidation = this.validateAmountLimits(tokenSymbol, action, amount, token);
    if (!amountValidation.valid) {
      this.errors.push(...amountValidation.errors);
    }
    
    // 3. Validate execution venue configuration
    const venueValidation = this.validateExecutionVenue(registry);
    if (!venueValidation.valid) {
      this.errors.push(...venueValidation.errors);
    }
    
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      token: token,
      maxAmount: this.getMaxAmount(tokenSymbol, action, token)
    };
  }
  
  validateAmountLimits(tokenSymbol, action, amount, token) {
    const errors = [];
    
    // Convert amount to wei for comparison
    const amountWei = ethers.parseUnits(amount, token.decimals);
    
    // Check max trade amount from registry
    if (token.maxTradeAmount) {
      const maxAmountWei = ethers.parseUnits(token.maxTradeAmount, token.decimals);
      if (amountWei > maxAmountWei) {
        errors.push(`Amount ${amount} exceeds max trade limit of ${token.maxTradeAmount} for ${tokenSymbol}`);
      }
    }
    
    // Check config max swap USD
    const configMaxUsd = this.config.maxSwapUsd || "0";
    if (parseFloat(configMaxUsd) > 0) {
      // Approximate USD value check (would need price oracle in real implementation)
      const approximateUsdValue = this.estimateUsdValue(amountWei, tokenSymbol);
      if (approximateUsdValue > parseFloat(configMaxUsd)) {
        errors.push(`Estimated USD value $${approximateUsdValue} exceeds config max $${configMaxUsd}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  validateExecutionVenue(registry) {
    const errors = [];
    
    // Check if execution venue is configured
    if (!registry.executionVenue.type || registry.executionVenue.type === '#NEEDS-CLARIFICATION') {
      errors.push('Execution venue not configured - need to choose between CoW Protocol or DEX aggregator');
    }
    
    // Check vault relayer/router
    if (!registry.executionVenue.vaultRelayerOrRouter || registry.executionVenue.vaultRelayerOrRouter === '#NEEDS-CLARIFICATION') {
      errors.push('Execution venue router not configured');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  getMaxAmount(tokenSymbol, action, token) {
    // Determine maximum allowed amount based on token and action
    const registryToken = this.registry.tokens.find(t => t.symbol === tokenSymbol);
    
    if (registryToken?.maxTradeAmount) {
      return registryToken.maxTradeAmount;
    }
    
    // Fallback to config-based limits
    const configMax = this.config.tokens[tokenSymbol]?.maxSwapUsd;
    if (configMax) {
      // Convert USD to token amount (would need price oracle)
      return `~$${configMax} USD equivalent`;
    }
    
    return 'unlimited (registry only)';
  }
  
  estimateUsdValue(weiAmount, tokenSymbol) {
    // This is a placeholder - real implementation would use price oracle
    // For demo purposes, returns a fake value
    const mockPrices = {
      'WETH': 2000,
      'USDC': 1,
      'BTC-wrapper': 50000,
      'LINK': 15,
      'UNI': 8,
      'MORPHO': 1.2
    };
    
    const decimals = this.registry.tokens.find(t => t.symbol === tokenSymbol)?.decimals || 18;
    const tokenAmount = ethers.formatUnits(weiAmount, decimals);
    const price = mockPrices[tokenSymbol] || 1;
    
    return parseFloat(tokenAmount) * price;
  }
  
  getValidationErrors() {
    return this.errors;
  }
}

module.exports = TokenValidator;