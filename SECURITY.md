# Security Policy

## 🔒 Sensitive Files and Data Protection

This project contains sensitive configuration files and user data that **MUST NOT** be committed to version control.

### Protected Files

The following files are automatically excluded via `.gitignore`:

#### Critical Sensitive Files
- `credentials.txt` - Contains default passwords (generated during build)
- `config/app/config.json` - Runtime application configuration
- `config/app/users.json` - User accounts with hashed passwords
- `backend/auth/users.json` - Backend user authentication data
- `backend/config.json` - Backend configuration

#### Build Artifacts & Runtime Files
- `*.pid` - Process ID files
- `*.log` - Log files
- `.DS_Store` - macOS system files
- `node_modules/` - Dependencies

### Setting Up Configuration Files

When deploying or running locally, create your configuration files from the provided templates:

```bash
# Copy example templates to actual config files
cp config/app/config.json.example config/app/config.json
cp config/app/users.json.example config/app/users.json
```

Then customize these files with your actual values. These files will be ignored by Git.

### Default Credentials

Default user credentials are generated during setup/build and stored in `credentials.txt`:

- **Format**: `username#DDMMYYHH` (timestamp-based)
- **Users**: admin, user, assessor
- **Location**: `credentials.txt` (auto-generated, gitignored)

**⚠️ IMPORTANT**: Change default passwords immediately after first login!

### Password Security

- All passwords are hashed using **PBKDF2-SHA256** with 100,000 iterations
- Hashing is **FIPS 140-2 compliant**
- Passwords are **never** stored in plain text (except in the temporary `credentials.txt` for initial setup)

### Configuration File Security

1. **Restrict File Permissions**:
   ```bash
   chmod 600 config/app/config.json
   chmod 600 config/app/users.json
   chmod 600 backend/auth/users.json
   ```

2. **Encrypt Sensitive Data**: Consider encrypting the `config/app/` directory on production servers

3. **Use Environment Variables**: For production, use environment variables for sensitive values:
   - `SMTP_PASSWORD`
   - `API_TOKENS`
   - `AWS_CREDENTIALS`

### Reporting a Security Vulnerability

If you discover a security vulnerability, please **DO NOT** create a public GitHub issue.

Instead, please email: **mukesh.kesharwani@adobe.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

### Security Best Practices

1. ✅ **Never commit** `credentials.txt` or any file in `config/app/`
2. ✅ **Change default passwords** immediately after deployment
3. ✅ **Use HTTPS** in production environments
4. ✅ **Restrict file permissions** on sensitive config files (chmod 600)
5. ✅ **Regularly update** dependencies for security patches
6. ✅ **Enable audit logging** for Platform Admin actions
7. ✅ **Use strong passwords** (minimum 12 characters, mixed case, numbers, symbols)
8. ✅ **Backup encrypted** configuration files securely

### File Integrity

This application implements **FIPS 140-2 compliant SHA-256 integrity hashing** for OSCAL exports:

- Every exported OSCAL file contains an integrity hash
- Import validation checks for tampering
- Assessors can update integrity hashes when making authorized changes

### Compliance

This tool is designed for security compliance documentation and follows:

- **OSCAL** (Open Security Controls Assessment Language) standards
- **FIPS 140-2** compliant cryptographic hashing
- **NIST SP 800-53** control framework support
- **Australian ISM** and **Singapore IM8** frameworks

---

## 📝 Version History

- **v1.2.6** (2025-12-16): Enhanced .gitignore, removed sensitive files from version control
- **v1.2.5** (2025-12-15): Added AWS Bedrock integration
- **v1.2.0** (2025-12-13): Fixed password generation timezone issues
- **v1.0.0** (2025-11-24): Initial release

For questions or concerns, contact: **mukesh.kesharwani@adobe.com**

