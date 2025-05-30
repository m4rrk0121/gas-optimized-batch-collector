# Gas Optimized Batch Collector with Volume Filtering

An enhanced script for collecting fees from Uniswap V3 positions with intelligent volume filtering and gas optimization.

## Features

- **Volume Filtering**: Only processes NFT positions with sufficient trading volume
- **Gas Optimization**: Dynamic batch sizing based on gas estimation
- **DexScreener Integration**: Real-time volume checking using DexScreener API
- **Moralis API Support**: Avoid RPC rate limits by using Moralis for NFT data
- **Non-ETH Token Detection**: Automatically identifies and filters by non-ETH tokens in pairs
- **Rate Limiting**: Built-in protection against API rate limits
- **Comprehensive Logging**: Detailed progress tracking and statistics

## How It Works

1. **Position Discovery**: Retrieves all NFT positions from the contract
2. **Token Analysis**: For each position, gets token pair information from Uniswap V3 Position Manager (via Moralis API or direct RPC)
3. **Volume Checking**: Uses DexScreener API to check 24h trading volume for non-ETH tokens
4. **Filtering**: Only processes positions where the non-ETH token has sufficient volume
5. **Batch Processing**: Processes filtered positions in optimally-sized batches

## Configuration

Create a `.env` file with the following variables:

```env
# RPC Configuration
RPC_URL=https://mainnet.base.org

# Contract Addresses
CONTRACT_ADDRESS=0xF3A8E91df4EE6f796410D528d56573B5FB4929B6
NFT_POSITION_MANAGER=0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
WETH_ADDRESS=0x4200000000000000000000000000000000000006

# Security
PRIVATE_KEY=your_private_key_here

# Moralis API (Recommended to avoid RPC rate limits)
USE_MORALIS=true
MORALIS_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your_moralis_api_key_here

# Batch Processing Configuration
BATCH_SIZE=90
MIN_BATCH_SIZE=10
START_INDEX=0
END_INDEX=0

# Gas Configuration
GAS_LIMIT=8000000
GAS_PRICE_MULTIPLIER=1.1
MIN_GAS_PRICE=20000000
MAX_GAS_PRICE=50000000

# Volume Filtering Configuration
MIN_VOLUME_USD=10
CHAIN_ID=base
SKIP_VOLUME_FILTERING=true

# Rate Limiting Configuration (Advanced)
DEXSCREENER_DELAY=3000
DEXSCREENER_MAX_RETRIES=3
DEXSCREENER_RETRY_DELAY=10000
RPC_DELAY=1000
RPC_MAX_RETRIES=5
RPC_RETRY_DELAY=5000
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure your environment variables in `.env`

3. Ensure you have the contract ABI in `contractABI.json`

## Usage

Run the script:
```bash
npm start
```

Or run directly:
```bash
node GasOptimizedBatchCollector.js
```

## Moralis API Integration

### Why Use Moralis?

- **Higher Rate Limits**: Moralis provides much higher rate limits than public RPC endpoints
- **Reliable Data**: Professional-grade NFT metadata and position data
- **Cost Effective**: Reduces RPC calls and potential gas costs from failed requests

### Setting Up Moralis

1. Sign up at [moralis.io](https://moralis.io)
2. Create a new project
3. Get your API key from the project dashboard
4. Set `USE_MORALIS=true` and `MORALIS_API_KEY=your_key` in your `.env` file

### Fallback Behavior

The script automatically falls back to direct RPC calls if:
- Moralis API is not configured
- Moralis API fails or is rate limited
- NFT metadata is not available via Moralis

## Processing Modes

### Fast Mode (Recommended)

For maximum speed, skip volume filtering and process all positions:

```env
SKIP_VOLUME_FILTERING=true
BATCH_SIZE=90
```

**Benefits:**
- ⚡ **10x faster** - No API calls for volume checking
- 🚀 **Simple processing** - Direct batch fee collection
- 💰 **Maximum revenue** - Collects from all positions
- 🔧 **Reliable** - No rate limiting issues

### Volume Filtering Mode

For selective processing based on trading volume:

```env
SKIP_VOLUME_FILTERING=false
MIN_VOLUME_USD=1000
```

**Benefits:**
- 🎯 **Targeted** - Only high-volume positions
- 💸 **Gas efficient** - Fewer transactions
- 📊 **Analytics** - Detailed volume reporting

## Volume Filtering

The script filters positions based on trading volume:

- **Token Identification**: Identifies the non-ETH token in each position pair
- **Volume Check**: Uses DexScreener API to get 24h trading volume
- **Threshold**: Only processes tokens with volume >= `MIN_VOLUME_USD`
- **Efficiency**: Saves gas and time by skipping low-volume positions

## Gas Optimization

- **Dynamic Batching**: Automatically determines optimal batch sizes
- **Gas Estimation**: Pre-estimates gas usage for each batch
- **Price Management**: Intelligent gas price adjustment with min/max bounds
- **Buffer System**: Adds safety buffer to gas estimates

## API Integration

### Moralis API
- **Endpoint**: `https://deep-index.moralis.io/api/v2.2/nft/{contractAddress}/{tokenId}`
- **Rate Limiting**: Built-in delays and retry logic
- **Data**: Gets NFT metadata including Uniswap V3 position details

### DexScreener API
- **Endpoint**: `https://api.dexscreener.com/token-pairs/v1/{chainId}/{tokenAddress}`
- **Rate Limiting**: Built-in delays and retry logic
- **Data**: Gets trading pairs, volume, liquidity, and DEX information

### Uniswap V3 Position Manager
- **Contract**: Retrieves detailed position information (fallback)
- **Token Pairs**: Gets token0, token1, fee tier, and liquidity data
- **Validation**: Checks position validity and liquidity

## Output

The script provides detailed logging including:

- Data source being used (Moralis vs RPC)
- Position analysis progress
- Volume filtering results
- Gas optimization details
- Batch processing status
- Final collection summary

Example output:
```
Data source: Moralis API
Moralis API key configured: Yes

=== FILTERING 150 POSITIONS BY VOLUME ===
Minimum volume threshold: $1,000

[1/150] Analyzing position 12345...
Using Moralis API for position 12345...
Position tokens: 0x123... / 0x456...
Non-ETH token: 0x456...
Token 0x456... - Best pair volume (24h): $15,420
✅ Position 12345 qualifies - Volume: $15,420

=== PROCESSING 45 VOLUME-FILTERED POSITIONS ===
Processing batch 0 to 9 (10 positions)
  Position 12345: TOKEN/WETH - $15,420 volume (moralis data)
  Position 12346: ANOTHER/WETH - $8,750 volume (rpc data)
✅ Processed 10 positions
```

## Error Handling

- **API Failures**: Graceful handling of Moralis and DexScreener API errors
- **Rate Limiting**: Automatic delays and retry logic for all APIs
- **Gas Estimation**: Fallback strategies for failed estimations
- **Position Errors**: Continues processing despite individual position failures
- **Automatic Fallback**: Falls back from Moralis to RPC when needed

## Performance

- **Efficiency**: Typically filters out 60-80% of positions based on volume
- **Rate Limit Avoidance**: Moralis integration significantly reduces RPC rate limiting
- **Speed**: Parallel processing where possible
- **Memory**: Efficient data structures for large position sets
- **Network**: Optimized API calls with batching and delays

## Requirements

- Node.js >= 14.0.0
- Web3.js for blockchain interaction
- Axios for HTTP requests
- Valid private key with sufficient ETH for gas
- Access to Base chain RPC endpoint
- (Optional) Moralis API key for improved performance

## Security

- Private keys loaded from environment variables
- API keys stored securely in environment variables
- No hardcoded sensitive information
- Gas price limits to prevent excessive costs
- Transaction validation and error handling

## Rate Limiting & Performance

### Advanced Rate Limiting

The script includes sophisticated rate limiting to handle API restrictions:

- **Token Caching**: Duplicate tokens are cached to avoid redundant API calls
- **Exponential Backoff**: Automatic retry with increasing delays when rate limited
- **Configurable Delays**: Customizable delays between API calls
- **Smart Retry Logic**: Intelligent handling of 429 (rate limited) responses
- **RPC Rate Limiting**: Prevents overwhelming blockchain RPC endpoints
- **Dual-Layer Protection**: Separate rate limiting for DexScreener API and RPC calls

### Rate Limiting Configuration

```env
# DexScreener API rate limiting
DEXSCREENER_DELAY=3000          # Delay between API calls (ms)
DEXSCREENER_MAX_RETRIES=3       # Max retries for rate limited calls
DEXSCREENER_RETRY_DELAY=10000   # Initial retry delay (ms)

# RPC rate limiting
RPC_DELAY=1000                  # Delay between RPC calls (ms)
RPC_MAX_RETRIES=5               # Max retries for RPC calls
RPC_RETRY_DELAY=5000           # Initial RPC retry delay (ms)
```

### Performance Optimizations

- **Cache Efficiency**: Tracks and reports cache hit rates
- **Duplicate Detection**: Identifies and skips duplicate token checks
- **Progressive Delays**: Implements exponential backoff (10s → 20s → 40s)
- **Timeout Handling**: Increased timeouts for API reliability

## Volume Filtering 