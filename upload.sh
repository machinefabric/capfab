#!/bin/bash

# Upload cap and media definitions to CAPDAG registry
# Uses environment variables from .env file

set -e

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Check if admin password is set
if [ -z "$ADMIN_PASSWORD" ]; then
    echo "Error: ADMIN_PASSWORD not set in .env file"
    exit 1
fi

# Set the admin key for the upload script
export CAPDAG_ADMIN_KEY="$ADMIN_PASSWORD"

echo "Loading, validating, and uploading cap definitions..."
node src/capgraph.js

echo ""
echo "OK Done!"
