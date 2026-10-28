#!/bin/bash
echo "===================================================="
echo "          Starting Lumière Theater Server..."
echo "===================================================="

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH."
    echo "On Android (Termux), run: pkg install nodejs-lts ffmpeg"
    exit 1
fi

node server.js
