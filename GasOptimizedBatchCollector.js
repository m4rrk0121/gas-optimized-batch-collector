// GasOptimizedBatchCollector.js
// Script with gas estimation, dynamic batch sizing, and volume filtering for improved efficiency

const Web3 = require('web3');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

// Configuration
const config = {
  rpc: process.env.RPC_URL || "https://mainnet.base.org",  // Base chain RPC
  contractAddress: process.env.CONTRACT_ADDRESS || "0xF3A8E91df4EE6f796410D528d56573B5FB4929B6", // Contract address on Base
  nftPositionManagerAddress: process.env.NFT_POSITION_MANAGER || "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", // Base NFT Position Manager
  moralisApiKey: process.env.MORALIS_API_KEY, // Moralis API key for NFT data
  privateKey: process.env.PRIVATE_KEY, // Load from environment for security
  maxBatchSize: parseInt(process.env.BATCH_SIZE || "90"), // Maximum batch size
  minBatchSize: parseInt(process.env.MIN_BATCH_SIZE || "10"), // Minimum batch size
  maxGasLimit: parseInt(process.env.GAS_LIMIT || "8000000"),
  gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER || "1.1"), // Multiplier for network gas price
  gasBuffer: 1.1, // 10% buffer on gas estimates
  startIndex: parseInt(process.env.START_INDEX || "0"), // Custom start index
  endIndex: parseInt(process.env.END_INDEX || "0"), // Custom end index (0 = all positions)
  minGasPrice: process.env.MIN_GAS_PRICE || '20000000', // 0.02 gwei min
  maxGasPrice: process.env.MAX_GAS_PRICE || '40000000', // 0.1 gwei max
  minVolumeUSD: parseFloat(process.env.MIN_VOLUME_USD || "10"), // Minimum 24h volume in USD
  wethAddress: process.env.WETH_ADDRESS || "0x4200000000000000000000000000000000000006", // Base WETH address
  chainId: process.env.CHAIN_ID || "base", // Chain ID for DexScreener API
  useMoralis: process.env.USE_MORALIS === "true" || false, // Whether to use Moralis API
  skipVolumeFiltering: process.env.SKIP_VOLUME_FILTERING === "true" || true, // Skip volume filtering for speed
  // Rate limiting configuration
  dexScreenerDelay: parseInt(process.env.DEXSCREENER_DELAY || "3000"), // Delay between DexScreener calls (ms)
  dexScreenerMaxRetries: parseInt(process.env.DEXSCREENER_MAX_RETRIES || "3"), // Max retries for rate limited calls
  dexScreenerRetryDelay: parseInt(process.env.DEXSCREENER_RETRY_DELAY || "10000"), // Initial retry delay (ms)
  rpcDelay: parseInt(process.env.RPC_DELAY || "1000"), // Delay between RPC calls (ms)
  rpcMaxRetries: parseInt(process.env.RPC_MAX_RETRIES || "5"), // Max retries for RPC calls
  rpcRetryDelay: parseInt(process.env.RPC_RETRY_DELAY || "5000") // Initial RPC retry delay (ms)
};

// Validate essential configuration
if (!config.privateKey) {
  console.error("ERROR: Private key is required. Set it in the .env file as PRIVATE_KEY.");
  process.exit(1);
}

if (config.useMoralis && !config.moralisApiKey) {
  console.error("ERROR: Moralis API key is required when USE_MORALIS=true. Set it in the .env file as MORALIS_API_KEY.");
  process.exit(1);
}

// Load the contract ABI
const contractABI = JSON.parse(fs.readFileSync('./contractABI.json', 'utf8'));

// Uniswap V3 NonfungiblePositionManager ABI (minimal required methods)
const nftPositionManagerABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "tokenId", "type": "uint256"}],
    "name": "positions",
    "outputs": [
      {"internalType": "uint96", "name": "nonce", "type": "uint96"},
      {"internalType": "address", "name": "operator", "type": "address"},
      {"internalType": "address", "name": "token0", "type": "address"},
      {"internalType": "address", "name": "token1", "type": "address"},
      {"internalType": "uint24", "name": "fee", "type": "uint24"},
      {"internalType": "int24", "name": "tickLower", "type": "int24"},
      {"internalType": "int24", "name": "tickUpper", "type": "int24"},
      {"internalType": "uint128", "name": "liquidity", "type": "uint128"},
      {"internalType": "uint256", "name": "feeGrowthInside0LastX128", "type": "uint256"},
      {"internalType": "uint256", "name": "feeGrowthInside1LastX128", "type": "uint256"},
      {"internalType": "uint128", "name": "tokensOwed0", "type": "uint128"},
      {"internalType": "uint128", "name": "tokensOwed1", "type": "uint128"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Setup web3 and contracts
const web3 = new Web3(config.rpc);
const contract = new web3.eth.Contract(contractABI, config.contractAddress);

console.log(`Debug: Using NFT Position Manager address: ${config.nftPositionManagerAddress}`);
const checksumAddress = web3.utils.toChecksumAddress(config.nftPositionManagerAddress);
console.log(`Debug: Checksum address: ${checksumAddress}`);
const nftPositionManager = new web3.eth.Contract(nftPositionManagerABI, checksumAddress);
const account = web3.eth.accounts.privateKeyToAccount(config.privateKey);
web3.eth.accounts.wallet.add(account);

// Token volume cache to avoid duplicate API calls
const tokenVolumeCache = new Map();

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to get current network gas price
async function getNetworkGasPrice() {
  try {
    const networkGasPrice = await web3.eth.getGasPrice();
    console.log(`Current network gas price: ${web3.utils.fromWei(networkGasPrice, 'gwei')} gwei`);
    
    // Apply multiplier
    const adjustedGasPrice = BigInt(Math.floor(Number(networkGasPrice) * config.gasPriceMultiplier));
    
    // Ensure gas price is within min/max bounds
    const minGasPrice = BigInt(config.minGasPrice);
    const maxGasPrice = BigInt(config.maxGasPrice);
    
    if (adjustedGasPrice < minGasPrice) {
      console.log(`Using minimum gas price: ${web3.utils.fromWei(minGasPrice.toString(), 'gwei')} gwei`);
      return minGasPrice.toString();
    }
    
    if (adjustedGasPrice > maxGasPrice) {
      console.log(`Using maximum gas price: ${web3.utils.fromWei(maxGasPrice.toString(), 'gwei')} gwei`);
      return maxGasPrice.toString();
    }
    
    console.log(`Using adjusted gas price: ${web3.utils.fromWei(adjustedGasPrice.toString(), 'gwei')} gwei (${config.gasPriceMultiplier}x multiplier)`);
    return adjustedGasPrice.toString();
  } catch (error) {
    console.warn(`Error getting network gas price: ${error.message}`);
    console.log(`Using default gas price: ${web3.utils.fromWei(config.minGasPrice, 'gwei')} gwei`);
    return config.minGasPrice;
  }
}

// Helper function to get position details using Moralis API
async function getPositionDetailsViaMoralis(tokenId) {
  try {
    console.log(`Using Moralis API for position ${tokenId}...`);
    
    const response = await axios.get(`https://deep-index.moralis.io/api/v2.2/nft/${config.nftPositionManagerAddress}/${tokenId}`, {
      timeout: 10000,
      headers: {
        'accept': 'application/json',
        'X-API-Key': config.moralisApiKey
      }
    });
    
    if (!response.data || !response.data.metadata) {
      console.warn(`No metadata found for NFT ${tokenId}`);
      return null;
    }
    
    // Parse the metadata to extract Uniswap V3 position data
    const metadata = response.data.metadata;
    
    // For Uniswap V3 positions, the metadata should contain position info
    if (metadata.token0 && metadata.token1) {
      return {
        nonce: metadata.nonce || '0',
        operator: metadata.operator || '0x0000000000000000000000000000000000000000',
        token0: metadata.token0,
        token1: metadata.token1,
        fee: metadata.fee || '3000',
        tickLower: metadata.tickLower || '0',
        tickUpper: metadata.tickUpper || '0',
        liquidity: metadata.liquidity || '0',
        feeGrowthInside0LastX128: metadata.feeGrowthInside0LastX128 || '0',
        feeGrowthInside1LastX128: metadata.feeGrowthInside1LastX128 || '0',
        tokensOwed0: metadata.tokensOwed0 || '0',
        tokensOwed1: metadata.tokensOwed1 || '0',
        source: 'moralis'
      };
    }
    
    console.warn(`NFT ${tokenId} does not appear to be a Uniswap V3 position`);
    return null;
    
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(`Moralis API rate limited for token ${tokenId}. Waiting 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { rateLimited: true };
    }
    
    console.warn(`Error getting position details via Moralis for token ${tokenId}: ${error.message}`);
    return null;
  }
}

// Helper function to get position details from NFT Position Manager
async function getPositionDetails(tokenId) {
  // Use Moralis API if available and enabled
  if (config.useMoralis && config.moralisApiKey) {
    const moralisResult = await getPositionDetailsViaMoralis(tokenId);
    if (moralisResult && !moralisResult.rateLimited) {
      return moralisResult;
    }
    if (moralisResult && moralisResult.rateLimited) {
      return null; // Skip this position due to rate limiting
    }
    // If Moralis fails, fall back to direct RPC
    console.log(`Moralis failed for ${tokenId}, falling back to RPC...`);
  }
  
  let retryCount = 0;
  let retryDelay = config.rpcRetryDelay;

  while (retryCount <= config.rpcMaxRetries) {
    try {
      // Add delay before RPC call (except first call)
      if (retryCount > 0) {
        console.log(`Waiting ${retryDelay}ms before RPC retry...`);
        await sleep(retryDelay);
        retryDelay *= 2; // Exponential backoff
      } else if (retryCount === 0) {
        // Add standard delay before first RPC call to avoid rate limiting
        await sleep(config.rpcDelay);
      }

      const position = await nftPositionManager.methods.positions(tokenId).call();
      return {
        nonce: position.nonce,
        operator: position.operator,
        token0: position.token0,
        token1: position.token1,
        fee: position.fee,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
        tokensOwed0: position.tokensOwed0,
        tokensOwed1: position.tokensOwed1,
        source: 'rpc'
      };
    } catch (error) {
      if (error.message && (error.message.includes('rate limit') || error.message.includes('429'))) {
        retryCount++;
        console.warn(`⚠️  RPC rate limited for position ${tokenId} (attempt ${retryCount}/${config.rpcMaxRetries + 1})`);
        
        if (retryCount > config.rpcMaxRetries) {
          console.error(`❌ Max RPC retries exceeded for position ${tokenId}. Skipping...`);
          return null;
        }
        // Continue to next retry
      } else {
        console.warn(`Error getting position details for token ${tokenId}: ${error.message}`);
        return null;
      }
    }
  }
  
  return null;
}

// Helper function to get non-ETH token from position
function getNonETHToken(token0, token1) {
  const wethLower = config.wethAddress.toLowerCase();
  if (token0.toLowerCase() === wethLower) {
    return token1;
  } else if (token1.toLowerCase() === wethLower) {
    return token0;
  }
  // If neither is WETH, return token0 by default
  return token0;
}

// Helper function to check token volume using DexScreener API with improved rate limiting
async function checkTokenVolume(tokenAddress) {
  // Check cache first
  if (tokenVolumeCache.has(tokenAddress)) {
    const cached = tokenVolumeCache.get(tokenAddress);
    console.log(`Using cached volume data for token ${tokenAddress}: $${cached.volume24h.toLocaleString()}`);
    return cached;
  }

  let retryCount = 0;
  let retryDelay = config.dexScreenerRetryDelay;

  while (retryCount <= config.dexScreenerMaxRetries) {
    try {
      console.log(`Checking volume for token: ${tokenAddress} (attempt ${retryCount + 1}/${config.dexScreenerMaxRetries + 1})`);
      
      // Add delay before API call (except first call)
      if (retryCount > 0) {
        console.log(`Waiting ${retryDelay}ms before retry...`);
        await sleep(retryDelay);
        retryDelay *= 2; // Exponential backoff
      }
      
      // Use DexScreener API to get token pairs
      const response = await axios.get(`https://api.dexscreener.com/token-pairs/v1/${config.chainId}/${tokenAddress}`, {
        timeout: 15000, // Increased timeout
        headers: {
          'User-Agent': 'GasOptimizedBatchCollector/1.0',
          'Accept': 'application/json'
        }
      });
      
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.log(`No trading pairs found for token ${tokenAddress}`);
        const result = { hasVolume: false, volume24h: 0 };
        tokenVolumeCache.set(tokenAddress, result);
        return result;
      }
      
      // Find the pair with highest 24h volume
      let maxVolume = 0;
      let bestPair = null;
      
      for (const pair of response.data) {
        const volume24h = pair.volume?.h24 || 0;
        if (volume24h > maxVolume) {
          maxVolume = volume24h;
          bestPair = pair;
        }
      }
      
      console.log(`Token ${tokenAddress} - Best pair volume (24h): $${maxVolume.toLocaleString()}`);
      
      if (bestPair) {
        console.log(`  Pair: ${bestPair.baseToken?.symbol || 'Unknown'}/${bestPair.quoteToken?.symbol || 'Unknown'}`);
        console.log(`  DEX: ${bestPair.dexId || 'Unknown'}`);
        console.log(`  Liquidity: $${(bestPair.liquidity?.usd || 0).toLocaleString()}`);
      }
      
      const hasVolume = maxVolume >= config.minVolumeUSD;
      const result = { hasVolume, volume24h: maxVolume, pairInfo: bestPair };
      
      // Cache the result
      tokenVolumeCache.set(tokenAddress, result);
      
      // Success - add standard delay before next call
      console.log(`Waiting ${config.dexScreenerDelay}ms before next volume check...`);
      await sleep(config.dexScreenerDelay);
      
      return result;
      
    } catch (error) {
      if (error.response?.status === 429) {
        retryCount++;
        console.warn(`⚠️  DexScreener API rate limited for token ${tokenAddress} (attempt ${retryCount}/${config.dexScreenerMaxRetries + 1})`);
        
        if (retryCount > config.dexScreenerMaxRetries) {
          console.error(`❌ Max retries exceeded for token ${tokenAddress}. Skipping...`);
          const result = { hasVolume: false, volume24h: 0, rateLimited: true };
          return result;
        }
        // Continue to next retry
      } else {
        console.warn(`Error checking volume for token ${tokenAddress}: ${error.message}`);
        const result = { hasVolume: false, volume24h: 0, error: error.message };
        return result;
      }
    }
  }
  
  // Should not reach here, but just in case
  return { hasVolume: false, volume24h: 0, error: 'Max retries exceeded' };
}

// Helper function to filter positions by volume
async function filterPositionsByVolume(allPositions) {
  console.log(`\n=== FILTERING ${allPositions.length} POSITIONS BY VOLUME ===`);
  console.log(`Minimum volume threshold: $${config.minVolumeUSD.toLocaleString()}`);
  console.log(`Rate limiting: ${config.dexScreenerDelay}ms delay, ${config.dexScreenerMaxRetries} max retries`);
  
  const validPositions = [];
  const positionDetails = new Map();
  let processedCount = 0;
  let volumeCheckCount = 0;
  let rateLimitedCount = 0;
  let cacheHitCount = 0;
  let duplicateTokens = 0;
  
  for (const tokenId of allPositions) {
    processedCount++;
    console.log(`\n[${processedCount}/${allPositions.length}] Analyzing position ${tokenId}...`);
    
    // Get position details from NFT Position Manager
    const positionDetail = await getPositionDetails(tokenId);
    if (!positionDetail) {
      console.log(`❌ Skipping position ${tokenId} - Could not get position details`);
      continue;
    }
    
    // Check if position has liquidity
    if (positionDetail.liquidity === '0') {
      console.log(`❌ Skipping position ${tokenId} - No liquidity`);
      continue;
    }
    
    // Get the non-ETH token
    const nonETHToken = getNonETHToken(positionDetail.token0, positionDetail.token1);
    console.log(`Position tokens: ${positionDetail.token0} / ${positionDetail.token1}`);
    console.log(`Non-ETH token: ${nonETHToken}`);
    
    // Check if we've already checked this token (cache hit tracking)
    const wasInCache = tokenVolumeCache.has(nonETHToken);
    if (wasInCache) {
      cacheHitCount++;
      duplicateTokens++;
    }
    
    // Check token volume
    volumeCheckCount++;
    const volumeCheck = await checkTokenVolume(nonETHToken);
    
    if (volumeCheck.rateLimited) {
      rateLimitedCount++;
      console.log(`⚠️  Rate limited - skipping position ${tokenId}`);
      continue;
    }
    
    if (volumeCheck.hasVolume) {
      console.log(`✅ Position ${tokenId} qualifies - Volume: $${volumeCheck.volume24h.toLocaleString()}`);
      validPositions.push(tokenId);
      positionDetails.set(tokenId, {
        ...positionDetail,
        nonETHToken,
        volume24h: volumeCheck.volume24h,
        pairInfo: volumeCheck.pairInfo
      });
    } else {
      console.log(`❌ Position ${tokenId} filtered out - Volume: $${volumeCheck.volume24h.toLocaleString()} (below threshold)`);
    }
  }
  
  console.log(`\n=== VOLUME FILTERING COMPLETE ===`);
  console.log(`Total positions analyzed: ${processedCount}`);
  console.log(`Volume checks performed: ${volumeCheckCount}`);
  console.log(`Cache hits: ${cacheHitCount} (${duplicateTokens} duplicate tokens)`);
  console.log(`Rate limited requests: ${rateLimitedCount}`);
  console.log(`Unique tokens checked: ${tokenVolumeCache.size}`);
  console.log(`Positions with sufficient volume: ${validPositions.length}`);
  console.log(`Filter efficiency: ${((validPositions.length / allPositions.length) * 100).toFixed(1)}%`);
  console.log(`Cache efficiency: ${((cacheHitCount / volumeCheckCount) * 100).toFixed(1)}%`);
  
  return { validPositions, positionDetails };
}

// Helper function to estimate gas for a batch
async function estimateGasForBatch(startIndex, batchSize) {
  try {
    const gasEstimate = await contract.methods.protocolCollectFeesBatch(startIndex, batchSize).estimateGas({
      from: account.address
    });
    return gasEstimate;
  } catch (error) {
    console.warn(`Gas estimation failed for batch starting at ${startIndex} with size ${batchSize}`);
    console.warn(`Error: ${error.message}`);
    return null;
  }
}

// Find optimal batch size based on gas estimation
async function findOptimalBatchSize(startIndex, maxBatchSize, totalPositions) {
  console.log(`Finding optimal batch size for index ${startIndex}...`);
  
  // Cap batch size at remaining positions
  const remainingPositions = totalPositions - startIndex;
  maxBatchSize = Math.min(maxBatchSize, remainingPositions);
  
  // Try to estimate gas for the maximum batch size first
  let gasEstimate = await estimateGasForBatch(startIndex, maxBatchSize);
  
  // If gas estimate is below max limit with buffer, use the max batch size
  if (gasEstimate && gasEstimate * config.gasBuffer < config.maxGasLimit) {
    console.log(`Optimal batch size: ${maxBatchSize} (estimated gas: ${gasEstimate})`);
    return maxBatchSize;
  }
  
  // Binary search for optimal batch size
  let low = config.minBatchSize;
  let high = maxBatchSize;
  let optimalSize = low; // Start with minimum batch size
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    gasEstimate = await estimateGasForBatch(startIndex, mid);
    
    if (!gasEstimate) {
      // If estimation fails, try a smaller size
      high = mid - 1;
      continue;
    }
    
    const estimatedGasWithBuffer = gasEstimate * config.gasBuffer;
    
    if (estimatedGasWithBuffer <= config.maxGasLimit) {
      // This size works, try larger
      optimalSize = mid;
      low = mid + 1;
    } else {
      // Too large, try smaller
      high = mid - 1;
    }
  }
  
  console.log(`Optimal batch size: ${optimalSize} (estimated gas: ${await estimateGasForBatch(startIndex, optimalSize)})`);
  return optimalSize;
}

async function processAllPositions() {
  try {
    console.log(`Connected to Base chain, using contract at ${config.contractAddress}`);
    console.log(`Account address: ${account.address}`);
    console.log(`NFT Position Manager: ${config.nftPositionManagerAddress}`);
    console.log(`Data source: ${config.useMoralis ? 'Moralis API' : 'Direct RPC'}`);
    if (config.useMoralis) {
      console.log(`Moralis API key configured: ${config.moralisApiKey ? 'Yes' : 'No'}`);
    }
    console.log(`Gas optimization: Using binary search with buffer ${config.gasBuffer}x`);
    console.log(`Volume filtering: ${config.skipVolumeFiltering ? 'DISABLED (processing all positions)' : `Enabled - Minimum 24h volume $${config.minVolumeUSD.toLocaleString()}`}`);
    console.log(`Batch size: ${config.maxBatchSize} positions per batch`);
    
    // Get the total number of positions
    const allPositions = await contract.methods.getAllPositions().call();
    const totalPositions = allPositions.length;
    
    console.log(`Total positions in contract: ${totalPositions}`);
    
    if (totalPositions === 0) {
      console.log("No positions found in contract.");
      return;
    }
    
    // Determine processing range
    const startProcessingAt = config.startIndex;
    const endProcessingAt = config.endIndex > 0 ? Math.min(config.endIndex, totalPositions) : totalPositions;
    const positionsToProcess = allPositions.slice(startProcessingAt, endProcessingAt);
    
    console.log(`Processing range: ${startProcessingAt} to ${endProcessingAt-1} (${positionsToProcess.length} positions)`);
    
    let validPositions;
    let positionDetails = new Map();
    
    if (config.skipVolumeFiltering) {
      console.log(`\n=== SKIPPING VOLUME FILTERING - PROCESSING ALL ${positionsToProcess.length} POSITIONS ===`);
      validPositions = positionsToProcess;
      
      // Create dummy position details for display purposes
      for (const tokenId of validPositions) {
        positionDetails.set(tokenId, {
          tokenId,
          volume24h: 0,
          source: 'no-filtering'
        });
      }
    } else {
      // Filter positions by volume
      const { validPositions: filtered, positionDetails: details } = await filterPositionsByVolume(positionsToProcess);
      validPositions = filtered;
      positionDetails = details;
      
      if (validPositions.length === 0) {
        console.log("No positions with sufficient trading volume found.");
        return;
      }
    }
    
    console.log(`\n=== PROCESSING ${validPositions.length} POSITIONS IN BATCHES ===`);
    
    // Process in dynamically sized batches
    let currentIndex = 0;
    let totalFeesCollected0 = 0n;
    let totalFeesCollected1 = 0n;
    let processedPositions = 0;
    let successfulBatches = 0;
    let failedBatches = 0;
    
    while (currentIndex < validPositions.length) {
      // Find optimal batch size
      const optimalBatchSize = await findOptimalBatchSize(currentIndex, config.maxBatchSize, validPositions.length);
      const endBatchIndex = Math.min(currentIndex + optimalBatchSize, validPositions.length);
      const batchSize = endBatchIndex - currentIndex;
      
      console.log(`\nProcessing batch ${currentIndex} to ${endBatchIndex-1} (${batchSize} positions)`);
      
      // Show details of positions in this batch (if available)
      for (let i = currentIndex; i < endBatchIndex; i++) {
        const tokenId = validPositions[i];
        const details = positionDetails.get(tokenId);
        if (details && !config.skipVolumeFiltering) {
          console.log(`  Position ${tokenId}: ${details.pairInfo?.baseToken?.symbol || 'Unknown'}/${details.pairInfo?.quoteToken?.symbol || 'Unknown'} - $${details.volume24h.toLocaleString()} volume (${details.source || 'unknown'} data)`);
        } else {
          console.log(`  Position ${tokenId}: Processing without volume check`);
        }
      }
      
      try {
        // Get current network gas price
        const gasPrice = await getNetworkGasPrice();
        
        // Estimate final gas with buffer
        const finalGasEstimate = await estimateGasForBatch(currentIndex, batchSize);
        const gasLimit = Math.min(config.maxGasLimit, Math.ceil(finalGasEstimate * config.gasBuffer));
        
        console.log(`Gas settings: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei, limit ${gasLimit} (${(finalGasEstimate * config.gasBuffer).toFixed(0)} with buffer)`);
        
        // Call protocolCollectFeesBatch
        const tx = await contract.methods.protocolCollectFeesBatch(currentIndex, batchSize).send({
          from: account.address,
          gas: gasLimit,
          gasPrice: gasPrice
        });
        
        // Extract results from transaction logs or events
        const events = tx.events.ProtocolBatchFeesCollected;
        if (events) {
          const { processedCount, totalAmount0, totalAmount1 } = events.returnValues;
          console.log(`✅ Processed ${processedCount || batchSize} positions`);
          console.log(`Collected: ${web3.utils.fromWei(totalAmount0, 'ether')} token0, ${web3.utils.fromWei(totalAmount1, 'ether')} token1`);
          console.log(`Gas used: ${tx.gasUsed} (${((tx.gasUsed / gasLimit) * 100).toFixed(1)}% of limit)`);
          
          totalFeesCollected0 += BigInt(totalAmount0);
          totalFeesCollected1 += BigInt(totalAmount1);
          processedPositions += parseInt(processedCount || batchSize);
          successfulBatches++;
        } else {
          console.log("No events found in transaction. Transaction hash:", tx.transactionHash);
        }
      } catch (batchError) {
        console.error(`❌ Error processing batch at index ${currentIndex}:`, batchError.message);
        failedBatches++;
      }
      
      // Move to the next batch
      currentIndex += batchSize;
      
      // Add a delay between batches to avoid overwhelming the network
      console.log(`Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log("\n===== FEE COLLECTION SUMMARY =====");
    console.log(`Total positions in contract: ${totalPositions}`);
    console.log(`Positions processed: ${processedPositions} (${successfulBatches} successful batches, ${failedBatches} failed)`);
    console.log(`Total fees collected: ${web3.utils.fromWei(totalFeesCollected0.toString(), 'ether')} token0, ${web3.utils.fromWei(totalFeesCollected1.toString(), 'ether')} token1`);
    
    if (!config.skipVolumeFiltering) {
      console.log(`Volume filtering saved ${((totalPositions - validPositions.length) / totalPositions * 100).toFixed(1)}% of processing time`);
    }
    
  } catch (error) {
    console.error("Error processing positions:", error);
  }
}

// Execute the script
processAllPositions().then(() => {
  console.log("Script execution completed");
  process.exit(0);
}).catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 