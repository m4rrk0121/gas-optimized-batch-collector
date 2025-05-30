# Deployment Instructions

## Quick Setup for Automated Daily Execution

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd gas-optimized-batch-collector
```

### 2. Run Deployment Script

```bash
chmod +x deploy.sh
./deploy.sh
```

The deployment script will:
- ✅ Install dependencies
- ✅ Create `.env` file from template
- ✅ Set up daily cron job (9:00 AM)
- ✅ Create logs directory
- ✅ Test configuration

### 3. Configure Environment

Edit the `.env` file with your actual values:

```bash
nano .env
```

**Required configuration:**
- `PRIVATE_KEY`: Your wallet private key (without 0x prefix)
- `RPC_URL`: Base chain RPC endpoint
- `CONTRACT_ADDRESS`: Your contract address

### 4. Test the Setup

```bash
# Test run the collector
./run-daily.sh

# Check logs
tail -f logs/batch-collector-*.log
```

### 5. Verify Cron Job

```bash
# View current cron jobs
crontab -l

# Should show:
# 0 9 * * * /path/to/your/project/run-daily.sh
```

## Manual Setup Instructions

### 1. Environment Setup

```bash
npm install
cp env.example .env
# Edit .env with your configuration
```

### 2. Manual Cron Job Setup

```bash
# Edit crontab
crontab -e

# Add this line (replace with your actual path):
0 9 * * * /full/path/to/your/project/run-daily.sh
```

### 3. Create Run Script

```bash
chmod +x run-daily.sh
```

## Configuration Options

### Fast Mode (Recommended - Default)
```env
SKIP_VOLUME_FILTERING=true
BATCH_SIZE=90
```
- ⚡ Processes all positions quickly
- 💰 Maximum fee collection
- 🔧 No API rate limiting issues

### Volume Filtering Mode
```env
SKIP_VOLUME_FILTERING=false
MIN_VOLUME_USD=1000
```
- 🎯 Only high-volume positions
- 💸 More gas efficient
- ⏱️ Slower due to API calls

## Monitoring & Logs

### View Logs
```bash
# Latest log
tail -f logs/batch-collector-$(ls logs/ | tail -1)

# All logs
ls -la logs/

# Search logs
grep "ERROR\|SUCCESS" logs/*.log
```

### Log Files
- **Location**: `logs/batch-collector-YYYYMMDD-HHMMSS.log`
- **Retention**: 30 days (automatic cleanup)
- **Format**: Timestamped entries with status updates

### Success Indicators
Look for these in logs:
- `✅ Processed X positions`
- `Total fees collected: X token0, X token1`
- `Batch collection completed successfully`

## Troubleshooting

### Common Issues

**1. Private Key Error**
```
❌ PRIVATE_KEY not configured in .env file
```
- Solution: Add your private key to `.env` file without 0x prefix

**2. RPC Rate Limiting**
```
⚠️ RPC rate limited for position X
```
- Solution: Consider using Moralis API (`USE_MORALIS=true`)

**3. Gas Price Too High**
```
Gas price exceeds maximum limit
```
- Solution: Adjust `MAX_GAS_PRICE` in `.env`

**4. Cron Job Not Running**
```bash
# Check if cron service is running
sudo service cron status

# Check cron logs
grep CRON /var/log/syslog
```

### Manual Execution

If cron fails, run manually:
```bash
cd /path/to/your/project
./run-daily.sh
```

## Security Notes

### Environment Variables
- ⚠️ **Never commit `.env` file to git**
- 🔒 **Keep private keys secure**
- 🛡️ **Use environment-specific configurations**

### Git Repository
- ✅ `.env` is in `.gitignore`
- ✅ Only public configuration in `env.example`
- ✅ No sensitive data in commits

## Production Recommendations

### Server Setup
1. **Dedicated server** for consistent execution
2. **Backup private keys** securely
3. **Monitor logs** regularly
4. **Set up alerts** for failures

### Gas Optimization
1. **Monitor Base network** gas prices
2. **Adjust gas settings** based on network conditions
3. **Use fast mode** for efficiency

### Maintenance
1. **Update dependencies** regularly
2. **Monitor contract changes**
3. **Review logs** weekly
4. **Test after updates**

## Advanced Configuration

### Multiple Environments
```bash
# Production
cp env.example .env.production

# Staging
cp env.example .env.staging

# Load specific environment
NODE_ENV=production npm start
```

### Custom Scheduling
```bash
# Every 6 hours
0 */6 * * * /path/to/run-daily.sh

# Weekdays only at 9 AM
0 9 * * 1-5 /path/to/run-daily.sh

# Multiple times per day
0 9,15,21 * * * /path/to/run-daily.sh
```

## Support

For issues or questions:
1. Check logs for error messages
2. Review this documentation
3. Test with manual execution
4. Verify environment configuration

---

🎉 **Your automated fee collection is now set up!**

The system will run daily at 9:00 AM and collect fees from all positions efficiently. 