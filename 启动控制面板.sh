#!/bin/bash

echo ""
echo "========================================"
echo "   AI Tavern Control Panel"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found"
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    exit 1
fi

echo "Node.js is installed"
echo ""

# Check if root dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "First run detected"
    echo ""
    echo "Installing root dependencies..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install root dependencies"
        echo ""
        echo "Please run manually: npm install"
        echo ""
        exit 1
    fi
    echo ""
    echo "Root dependencies installed successfully"
    echo ""
fi

# Check if express is specifically installed
if [ ! -d "node_modules/express" ]; then
    echo "Express module not found"
    echo ""
    echo "Installing express..."
    echo ""
    npm install express
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install express"
        echo ""
        echo "Please run manually: npm install express"
        echo ""
        exit 1
    fi
    echo ""
    echo "Express installed successfully"
    echo ""
fi

# Check if server dependencies are installed
if [ ! -d "server/node_modules" ]; then
    echo "Installing server dependencies..."
    echo ""
    cd server
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install server dependencies"
        echo ""
        cd ..
        echo "Please run manually: cd server && npm install"
        echo ""
        exit 1
    fi
    cd ..
    echo ""
    echo "Server dependencies installed successfully"
    echo ""
fi

# Start panel server
echo "Starting control panel..."
echo ""

node panel-server.js

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to start panel"
    exit 1
fi
