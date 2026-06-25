#!/bin/bash

# Quick Setup Script for Chat Application
# This script helps you set up the application quickly

echo "========================================="
echo "  Chat App - Quick Setup"
echo "========================================="
echo ""

# Check Python
echo "Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✓ Found: $PYTHON_VERSION"
else
    echo "✗ Python 3 not found. Please install Python 3.8 or higher."
    exit 1
fi
#dfsn
# Check MySQL
echo ""
echo "Checking MySQL installation..."
if command -v mysql &> /dev/null; then
    echo "✓ MySQL is installed"
else
    echo "✗ MySQL not found. Please install MySQL Server."
    exit 1
fi

# Install dependencies
echo ""
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

echo ""
echo "========================================="
echo "  Setup Instructions"
echo "========================================="
echo ""
echo "1. Create MySQL database:"
echo "   mysql -u root -p"
echo "   CREATE DATABASE chat_app;"
echo "   EXIT;"
echo ""
echo "2. Update database credentials in app.py:"
echo "   Edit DB_CONFIG section with your MySQL password"
echo ""
echo "3. Update secret key in app.py:"
echo "   Change SECRET_KEY to a random string"
echo ""
echo "4. Run the application:"
echo "   python3 app.py"
echo ""
echo "5. Access at: http://localhost:5000"
echo ""
echo "========================================="
echo "  Remote Testing Options"
echo "========================================="
echo ""
echo "Option 1: ngrok (Recommended)"
echo "  - Download: https://ngrok.com"
echo "  - Run: ngrok http 5000"
echo "  - Share the https URL"
echo ""
echo "Option 2: VS Code Port Forwarding"
echo "  - May have WebRTC limitations"
echo "  - Forward port 5000 and set to Public"
echo ""
echo "Option 3: Cloud Deployment"
echo "  - Heroku, Railway, DigitalOcean, etc."
echo "  - Best for production use"
echo ""
echo "========================================="

# Ask if user wants to create database
echo ""
read -p "Do you want to create the database now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter MySQL root password: " -s MYSQL_PASS
    echo ""
    mysql -u root -p$MYSQL_PASS -e "CREATE DATABASE IF NOT EXISTS chat_app;"
    if [ $? -eq 0 ]; then
        echo "✓ Database created successfully!"
    else
        echo "✗ Failed to create database. Please create it manually."
    fi
fi

echo ""
echo "Setup complete! Don't forget to update app.py with your settings."
echo ""
