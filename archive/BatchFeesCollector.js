// BatchFeesCollector.js
// Script to call protocolCollectFeesBatch in chunks of 500 until all positions are claimed

const Web3 = require('web3');
const fs = require('fs');
require('dotenv').config();

// Configuration
const config = {
  rpc: process.env.RPC_URL || "https://mainnet.base.org",  // Base chain RPC
  contractAddress: process.env.CONTRACT_ADDRESS || "0xF3A8E91df4EE6f796410D528d56573B5FB4929B6", // Contract address on Base
  privateKey: process.env.PRIVATE_KEY, // Load from environment for security
  batchSize: parseInt(process.env.BATCH_SIZE || "500"),
  gasPrice: process.env.GAS_PRICE || '100000000', // 0.1 gwei default for Base
  gasLimit: parseInt(process.env.GAS_LIMIT || "5000000"),
  testMode: process.env.TEST_MODE === 'true' // Test mode flag
};

// Validate essential configuration (skip private key check in test mode)
if (!config.testMode && !config.privateKey) {
  console.error("ERROR: Private key is required. Set it in the .env file as PRIVATE_KEY.");
  process.exit(1);
}

// Load the contract ABI
const contractABI = JSON.parse(fs.readFileSync('./contractABI.json', 'utf8'));

// Setup web3 and contract
const web3 = new Web3(config.rpc);
const contract = new web3.eth.Contract(contractABI, config.contractAddress);

// Setup account only if not in test mode
let account;
if (!config.testMode && config.privateKey) {
  account = web3.eth.accounts.privateKeyToAccount(config.privateKey);
  web3.eth.accounts.wallet.add(account);
}

// Helper function to get position details (for test mode only)
async function getPositionDetails(tokenId) {
  try {
    // Call positions method if it exists in the ABI
    const positionMethodExists = contractABI.some(item => 
      item.name === 'positions' && item.type === 'function');
    
    if (positionMethodExists) {
      return await contract.methods.positions(tokenId).call();
    } else {
      return { tokenId };
    }
  } catch (error) {
    console.error(`Error getting details for position ${tokenId}:`, error.message);
    return { tokenId, error: error.message };
  }
}

async function processAllPositions() {
  try {
    console.log(`Connected to Base chain, using contract at ${config.contractAddress}`);
    
    if (!config.testMode) {
      console.log(`Account address: ${account.address}`);
    } else {
      console.log("Running in TEST MODE (no transactions will be sent)");
    }
    
    // Get the total number of positions
    const allPositions = await contract.methods.getAllPositions().call();
    const totalPositions = allPositions.length;
    
    console.log(`Total positions to process: ${totalPositions}`);
    
    if (config.testMode) {
      // In test mode, just show some sample position data
      console.log(`Testing with the first ${Math.min(5, totalPositions)} positions:`);
      
      for (let i = 0; i < Math.min(5, totalPositions); i++) {
        const tokenId = allPositions[i];
        console.log(`\nPosition ${i+1}/${Math.min(5, totalPositions)}: Token ID ${tokenId}`);
        
        const positionDetails = await getPositionDetails(tokenId);
        console.log("Position details:", JSON.stringify(positionDetails, null, 2));
      }
      
      console.log(`\nTest completed. ${totalPositions} positions found.`);
      console.log("To run with actual transactions, set TEST_MODE=false in .env");
      return;
    }
    
    // Process in batches of config.batchSize
    let startIndex = 0;
    let totalFeesCollected0 = 0n;
    let totalFeesCollected1 = 0n;
    
    while (startIndex < totalPositions) {
      console.log(`Processing batch starting at index ${startIndex}`);
      
      try {
        // Call protocolCollectFeesBatch
        const tx = await contract.methods.protocolCollectFeesBatch(startIndex, config.batchSize).send({
          from: account.address,
          gas: config.gasLimit,
          gasPrice: config.gasPrice
        });
        
        // Extract results from transaction logs or events
        const events = tx.events.ProtocolBatchFeesCollected;
        if (events) {
          const { processedCount, totalAmount0, totalAmount1 } = events.returnValues;
          console.log(`Processed ${processedCount} positions`);
          console.log(`Collected: ${web3.utils.fromWei(totalAmount0, 'ether')} token0, ${web3.utils.fromWei(totalAmount1, 'ether')} token1`);
          
          totalFeesCollected0 += BigInt(totalAmount0);
          totalFeesCollected1 += BigInt(totalAmount1);
        } else {
          console.log("No events found in transaction. Transaction hash:", tx.transactionHash);
        }
      } catch (batchError) {
        console.error(`Error processing batch at index ${startIndex}:`, batchError.message);
        console.log("Continuing with next batch...");
      }
      
      // Move to the next batch
      startIndex += config.batchSize;
      
      // Add a delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log("\n===== COLLECTION SUMMARY =====");
    console.log("All positions processed successfully!");
    console.log(`Total fees collected: ${web3.utils.fromWei(totalFeesCollected0.toString(), 'ether')} token0, ${web3.utils.fromWei(totalFeesCollected1.toString(), 'ether')} token1`);
    
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