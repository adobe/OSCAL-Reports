# OSCAL Report Generator

**Generate compliance documentation from OSCAL catalogs with ease**

## What is OSCAL Report Generator?

OSCAL Report Generator is a powerful web application designed to simplify the creation of compliance documentation. It helps organizations generate Statement of Applicability (SOA), System Security Plans (SSP), and Cloud Control Matrix (CCM) documents from OSCAL (Open Security Controls Assessment Language) catalogs.

## Key Features

- **🤖 AI-Powered Suggestions**: Automated control implementation recommendations
- **📚 Multiple Frameworks**: Support for NIST SP 800-53, Australian ISM, Singapore IM8
- **📄 Multiple Export Formats**: OSCAL JSON, Excel, PDF, and CCM
- **🔄 Smart Updates**: Automatic detection of new and changed controls
- **💾 Persistent Storage**: Browser-based local storage for multi-session work
- **⚡ Auto-Save**: Never lose your progress
- **🎨 Modern UI**: Intuitive and responsive interface

## Quick Start

After installation:

1. **Access the application** at `http://[your-truenas-ip]:[nodeport]`
2. **Extract default credentials**:
   ```bash
   kubectl exec deployment/oscal-report-generator -- cat /app/credentials.txt
   ```
3. **Login** with the default credentials
4. **Change passwords** immediately for security!

## Default Configuration

- **Port**: 3020 (internal), exposed via NodePort
- **Storage**: Requires persistent volume for config data
- **Resources**: 256Mi RAM minimum, 1Gi recommended

## Security Note

⚠️ **IMPORTANT**: The application generates default credentials during build. These must be changed immediately after first login!

## Documentation

- **Full Guide**: [GitHub Documentation](https://github.com/keekar2022/OSCAL-Reports/tree/main/docs)
- **Docker Hub**: [keekar/oscal_reports](https://hub.docker.com/r/keekar/oscal_reports)
- **Installation Guide**: [TrueNAS Installation](https://github.com/keekar2022/OSCAL-Reports/blob/main/docs/TRUENAS_INSTALLATION.md)

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/keekar2022/OSCAL-Reports/issues)
- **Documentation**: [Comprehensive guides](https://github.com/keekar2022/OSCAL-Reports/tree/main/docs)

## License

GPL-3.0 - See [LICENSE](https://github.com/keekar2022/OSCAL-Reports/blob/main/LICENSE) for details

---

**Author**: Mukesh Kesharwani  
**Version**: 1.6.3  
**Last Updated**: January 2026
