#!/bin/bash

# Reactivate the admin user in production.
# Usage: ./scripts/reactivate-admin.sh [path-to-users.json]
#   Run from repo root, or pass an absolute path to users.json.
# Checks: CONFIG_PATH/USERS_PATH env, /opt/oscal/data (EC2), /data (Docker), config/app (repo).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# If path provided as argument, use it
if [ -n "$1" ]; then
    USERS_FILE="$1"
elif [ -n "$USERS_PATH" ] && [ -f "$USERS_PATH" ]; then
    USERS_FILE="$USERS_PATH"
elif [ -f "/opt/oscal/data/users.json" ]; then
    USERS_FILE="/opt/oscal/data/users.json"
elif [ -f "/data/users.json" ]; then
    USERS_FILE="/data/users.json"
elif [ -f "/app/config/app/users.json" ]; then
    USERS_FILE="/app/config/app/users.json"
elif [ -f "$REPO_ROOT/config/app/users.json" ]; then
    USERS_FILE="$REPO_ROOT/config/app/users.json"
elif [ -f "config/app/users.json" ]; then
    USERS_FILE="config/app/users.json"
elif [ -f "auth/users.json" ]; then
    USERS_FILE="auth/users.json"
else
    USERS_FILE="${1:-$REPO_ROOT/config/app/users.json}"
fi

if [ ! -f "$USERS_FILE" ]; then
    echo "❌ Error: Users file not found at $USERS_FILE"
    exit 1
fi

echo "🔧 Reactivating admin user in $USERS_FILE..."

# Use Python to safely update the JSON file
if python3 << EOF
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
then
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
