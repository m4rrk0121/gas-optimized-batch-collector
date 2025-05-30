#!/bin/bash

# =============================================================================
# Gas Optimized Batch Collector - Deployment Script
# =============================================================================

echo "🚀 Setting up Gas Optimized Batch Collector for daily execution..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp env.example .env
    echo "📝 Please edit .env file with your actual configuration:"
    echo "   - Add your PRIVATE_KEY"
    echo "   - Verify RPC_URL and contract addresses"
    echo "   - Adjust gas and batch settings if needed"
    echo ""
    echo "❗ IMPORTANT: Never commit the .env file to git!"
    echo ""
    read -p "Press Enter after you've configured the .env file..."
fi

# Create logs directory
mkdir -p logs

# Test the configuration
echo "🔍 Testing configuration..."
node -e "
require('dotenv').config();
if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === 'your_private_key_here_without_0x_prefix') {
    console.log('❌ PRIVATE_KEY not configured in .env file');
    process.exit(1);
}
console.log('✅ Configuration looks good');
"

if [ $? -ne 0 ]; then
    echo "❌ Configuration test failed. Please check your .env file."
    exit 1
fi

# Create the cron job script
echo "📅 Setting up daily cron job for 9:00 AM..."

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create the cron job script
cat > "${SCRIPT_DIR}/run-daily.sh" << EOF
#!/bin/bash

# Daily Gas Optimized Batch Collector Runner
# This script runs the fee collection process

cd "${SCRIPT_DIR}"

# Set up logging
LOG_FILE="logs/batch-collector-\$(date +%Y%m%d-%H%M%S).log"

echo "\$(date): Starting Gas Optimized Batch Collector..." >> "\$LOG_FILE"

# Run the collector with timeout (30 minutes max)
timeout 1800 npm start >> "\$LOG_FILE" 2>&1

EXIT_CODE=\$?

if [ \$EXIT_CODE -eq 0 ]; then
    echo "\$(date): ✅ Batch collection completed successfully" >> "\$LOG_FILE"
else
    echo "\$(date): ❌ Batch collection failed with exit code \$EXIT_CODE" >> "\$LOG_FILE"
fi

# Keep only last 30 days of logs
find logs/ -name "*.log" -mtime +30 -delete 2>/dev/null

echo "\$(date): Daily run completed" >> "\$LOG_FILE"
EOF

# Make the script executable
chmod +x "${SCRIPT_DIR}/run-daily.sh"

# Add cron job (runs at 9:00 AM every day)
CRON_JOB="0 9 * * * ${SCRIPT_DIR}/run-daily.sh"

# Check if cron job already exists
if ! crontab -l 2>/dev/null | grep -q "${SCRIPT_DIR}/run-daily.sh"; then
    echo "Adding cron job for daily execution at 9:00 AM..."
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Cron job added successfully"
else
    echo "ℹ️  Cron job already exists"
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "   • Project installed in: $SCRIPT_DIR"
echo "   • Daily execution: 9:00 AM every day"
echo "   • Logs location: $SCRIPT_DIR/logs/"
echo "   • Configuration: $SCRIPT_DIR/.env"
echo ""
echo "🔧 Management commands:"
echo "   • View logs: tail -f $SCRIPT_DIR/logs/batch-collector-*.log"
echo "   • Test run: $SCRIPT_DIR/run-daily.sh"
echo "   • Remove cron: crontab -e (then delete the line)"
echo ""
echo "📊 Monitor your daily fee collection in the logs!" 