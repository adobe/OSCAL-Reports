#!/bin/bash

# Script to reactivate the admin user in production
# Usage: ./reactivate-admin.sh [path-to-users.json]
# 
# This script checks multiple possible locations for users.json

# If path provided as argument, use it
if [ -n "$1" ]; then
    USERS_FILE="$1"
elif [ -f "/app/config/app/users.json" ]; then
    USERS_FILE="/app/config/app/users.json"
elif [ -f "/app/auth/users.json" ]; then
    USERS_FILE="/app/auth/users.json"
elif [ -f "config/app/users.json" ]; then
    USERS_FILE="config/app/users.json"
elif [ -f "backend/auth/users.json" ]; then
    USERS_FILE="backend/auth/users.json"
elif [ -f "auth/users.json" ]; then
    USERS_FILE="auth/users.json"
else
    USERS_FILE="${1:-config/app/users.json}"
fi

if [ ! -f "$USERS_FILE" ]; then
    echo "❌ Error: Users file not found at $USERS_FILE"
    exit 1
fi

echo "🔧 Reactivating admin user in $USERS_FILE..."

# Use Python to safely update the JSON file
python3 << EOF
import json
import sys

try:
    with open('$USERS_FILE', 'r') as f:
        users = json.load(f)
    
    admin_found = False
    for user in users:
        if user['username'] == 'admin':
            if not user.get('isActive', True):
                user['isActive'] = True
                admin_found = True
                print(f"✅ Admin user reactivated")
            else:
                print(f"✅ Admin user is already active")
                admin_found = True
            break
    
    if not admin_found:
        print("❌ Admin user not found in users.json")
        sys.exit(1)
    
    with open('$USERS_FILE', 'w') as f:
        json.dump(users, f, indent=2)
    
    print("✅ Users file updated successfully")
    print("📝 Please restart the backend server for changes to take effect")
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Admin user has been reactivated!"
    echo "📝 Next steps:"
    echo "   1. Restart the backend server"
    echo "   2. Check credentials.txt for the current password (format: admin#\$DDMMYYHH)"
    echo "   3. Or use the default credentials from the build timestamp"
else
    echo "❌ Failed to reactivate admin user"
    exit 1
fi

