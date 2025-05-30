# GitHub Actions Setup Guide

## 🚀 Automated Fee Collection with GitHub Actions

### 1. Add Required Secrets

Go to: https://github.com/m4rrk0121/gas-optimized-batch-collector

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

#### Required Secrets:
```
PRIVATE_KEY = your_wallet_private_key_without_0x_prefix
RPC_URL = https://mainnet.base.org
CONTRACT_ADDRESS = 0xF3A8E91df4EE6f796410D528d56573B5FB4929B6
NFT_POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
WETH_ADDRESS = 0x4200000000000000000000000000000000000006
```

### 2. Test Manual Run

1. **Actions** tab → **Daily Fee Collection**
2. **Run workflow** → **Run workflow**
3. Monitor execution

### 3. Schedule
- Runs daily at 9:00 AM UTC
- Manual trigger available anytime
- 30-minute timeout protection

## 📊 Monitoring

- **Actions** tab shows all runs
- **Artifacts** contain logs (30-day retention)
- **Email notifications** on failures

## 🎯 Benefits

- ✅ No server required
- ✅ Free on GitHub
- ✅ Secure secrets
- ✅ Automatic logging
- ✅ Reliable scheduling

Your automated fee collection is ready! 🤖💰 