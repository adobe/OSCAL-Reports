# Configuration Directory

This directory contains all configuration files for the OSCAL Report Generator application.

## Directory Structure

```
config/
├── app/          # Application runtime configuration files
│   ├── config.json    # Application settings (SSO, messaging, API gateways, etc.)
│   └── users.json     # User accounts and authentication data
│
└── build/        # Build and deployment configuration files
    ├── docker-compose.yml   # Docker Compose configuration for local deployment
    ├── truenas-app.yaml     # TrueNAS Docker App configuration
    └── Dockerfile           # Docker build instructions
```

## Security and Access Control

**IMPORTANT**: The `config/app/` directory contains sensitive data including:
- User credentials (FIPS 140-2 compliant PBKDF2 hashed passwords)
- API keys and secrets
- SMTP credentials
- SSO configuration

**Password Storage Format:**
- Passwords are stored using PBKDF2 with SHA-256 (FIPS 140-2 compliant)
- Format: `pbkdf2$sha256$100000$salt$hash`
- 100,000 iterations, random 16-byte salt per password
- Legacy SHA-256 passwords automatically migrate to PBKDF2 on login

**This directory should be encrypted and have restricted access controls applied.**

### Recommended Security Measures

1. **File System Encryption**: Apply encryption at the filesystem level for the `config/app/` directory
2. **Access Control**: Restrict read/write permissions to authorized users only
3. **Backup Encryption**: Ensure backups of this directory are also encrypted
4. **Version Control**: These files are excluded from git (see `.gitignore`)

## File Migration

The application automatically migrates configuration files from legacy locations:
- `backend/config.json` → `config/app/config.json`
- `backend/auth/users.json` → `config/app/users.json`

Migration happens automatically on first run. Legacy files are removed after successful migration.

## Build Scripts

Build and deployment scripts automatically copy configuration files from this directory to their required locations:

- **setup.sh**: Copies config files to runtime locations during setup
- **deploy-to-smb.sh**: Copies config files before deployment, preserving existing configs on destination
- **Dockerfile**: Copies config files into Docker image during build

## Configuration File Locations

### Runtime Locations (for application execution)
- Primary: `config/app/config.json` and `config/app/users.json`
- Legacy (backward compatibility): `backend/config.json` and `backend/auth/users.json`

### Build Locations (for Docker/build processes)
- `docker-compose.yml` (copied from `config/build/docker-compose.yml`)
- `truenas-app.yaml` (copied from `config/build/truenas-app.yaml`)
- `Dockerfile` (copied from `config/build/Dockerfile`)

## Notes

- Configuration files in `config/app/` are preserved during deployments
- Build configuration files in `config/build/` are copied to root directory as needed
- All sensitive files are excluded from version control via `.gitignore`

