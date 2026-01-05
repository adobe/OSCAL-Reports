# 🛡️ Keekar's OSCAL SOA/SSP/CCM Generator

**A comprehensive web application for generating compliance documentation from OSCAL catalogs**

Version 1.3.0 | December 2025

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

---

## 📖 Overview

**Keekar's OSCAL SOA/SSP/CCM Generator** is a powerful tool for creating **Statement of Applicability (SOA)**, **System Security Plans (SSP)**, and **Cloud Control Matrix (CCM)** documents from OSCAL (Open Security Controls Assessment Language) catalogs.

### 🎯 Key Features

- ✨ **New Workflow**: Load existing reports first, then update catalogs intelligently
- 🤖 **Automated Control Suggestions**: AI-powered recommendations for control implementations
- 📊 **AI Telemetry Logging**: OpenTelemetry-compliant logging of all AI interactions
- 📚 **Multiple Frameworks**: NIST SP 800-53, Australian ISM, Singapore IM8
- 📈 **Multiple Export Formats**: OSCAL JSON, Excel, PDF, and CCM
- 🔄 **Smart Catalog Updates**: Automatically detect new/changed controls
- 💾 **Data Persistence**: Browser-based local storage for multi-session work
- ⚡ **Auto-save**: Automatic progress saving
- 🎨 **Modern UI**: Intuitive, responsive interface

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ (for local development)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Local Development Setup

```bash
# Clone or download the repository
cd OSCAL_Reports

# Run the setup script
chmod +x setup.sh
./setup.sh

# Start the application in development mode
npm run dev

# Or start the production server
cd backend
node server.js

# Access the application (production)
open http://localhost:3020

# Or access frontend dev server
open http://localhost:3021
```

### TrueNAS Server Deployment

#### Automated Blue-Green Deployment (Recommended)

For automated deployments on **nas.keekar.com** or other TrueNAS servers with auto-updates from GitHub:

```bash
# Quick setup (see docs/TRUENAS_QUICK_SETUP.md for details)
cd /mnt/pool1/Documents/KACI-Apps

# Clone for Blue instance (Port 3020)
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Blue
cd OSCAL-Report-Generator-Blue
chmod +x build_on_truenas.sh
./build_on_truenas.sh

# Clone for Green instance (Port 3019)
cd ..
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Green
cd OSCAL-Report-Generator-Green
chmod +x build_on_truenas.sh
./build_on_truenas.sh

# Setup cron for monthly staggered updates
crontab -e
# Green (1st, 3rd, 5th Sunday at 2 AM):
# 0 2 1-7,15-21,29-31 * 0 cd /path/to/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1
# Blue (2nd, 4th Sunday at 2 AM):
# 0 2 8-14,22-28 * 0 cd /path/to/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

**Features:**
- 🔄 Auto-detects Blue/Green instance from directory name
- 📊 Compares versions (local, running, GitHub)
- 🚀 Only builds/deploys if version changes
- ⏰ Monthly staggered updates (Green: 1st/3rd/5th Sun, Blue: 2nd/4th Sun)
- 🔌 Separate ports (Blue: 3020, Green: 3019)
- 🛡️ High availability (never updates both simultaneously)

**Documentation:**
- **Quick Start**: [docs/TRUENAS_QUICK_SETUP.md](docs/TRUENAS_QUICK_SETUP.md)
- **Complete Guide**: [docs/TRUENAS_DEPLOYMENT.md](docs/TRUENAS_DEPLOYMENT.md)

#### Manual TrueNAS Deployment

For manual deployment without Docker:

1. **Build the Frontend**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Copy Built Files**
   ```bash
   cp -r frontend/dist backend/public
   ```

3. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

4. **Start the Server**
   ```bash
   cd backend
   NODE_ENV=production node server.js
   ```

5. **Access from Network**
   - Open browser to `http://nas.keekar.com:3020`
   - Or use the server's IP address: `http://<server-ip>:3020`

---

## 🔒 OSCAL & Metaschema Framework Compliance

This tool follows **OSCAL (Open Security Controls Assessment Language)** standards and implements validation using the **Metaschema Framework**.

**Key Standards:**
- ✅ OSCAL Catalog Layer - Reads official catalogs
- ✅ OSCAL Profile Layer - Supports resolved profiles  
- ✅ OSCAL SSP Layer - Generates System Security Plans
- ✅ **JSON Schema Validation** - Integrated AJV v8 with official OSCAL JSON Schema v1.1.2
- ✅ **Real-time Validation** - Validates documents against Metaschema Framework standards

**Validation powered by:**
- Official OSCAL JSON Schema (v1.1.2, 243KB) from [oscal-editor](https://github.com/metaschema-framework/oscal-editor)
- AJV v8 JSON Schema Validator with format validation
- Multi-tier validation strategy (Schema → Basic → CLI future)

**For detailed validation features, Metaschema Framework integration, and permissive validation strategy, see:**  
📖 **[ENHANCEMENTS.md - Metaschema Framework & OSCAL Validation](ENHANCEMENTS.md#metaschema-framework--oscal-validation)**

---

## 📋 How It Works

### New Workflow (Version 2.0)

#### 1️⃣ **Initial Choice**
Choose your starting point:
- **📂 Load Existing Report**: Continue working on a previous compliance report
- **✨ Start New Report**: Begin from scratch with a fresh catalog

#### 2️⃣ **Catalog Selection**

**If loading existing report:**
- System extracts your current catalog
- Choose to:
  - ✅ Keep current catalog version (all data pre-populated)
  - 🔄 Update to latest version (identifies new/changed controls)

**If starting fresh:**
- Select from built-in catalogs or provide custom URL

#### 3️⃣ **System Information**
Document your system details:
- System name, ID, description
- Data/System classification level
- Security impact levels (CIA)
- System status

#### 4️⃣ **Control Implementation**
For each control, document:
- **Implementation Status**: 7 status options with color coding
- **Implementation Details**: How the control is implemented
- **Responsible Party**: Shared, Consumer, CSP
- **Consumer Guidance**: Instructions for configuration/implementation
- **Cloud Provider Responsibility**: Inherited, Implementer, Option Provider
- **Control Type**: Policy, Process, Orchestrated, or Automated
- **Testing & Evidence**: Methods, frequency, last test date
- **Risk Assessment**: Rating and compensating controls

#### 5️⃣ **Export Documentation**
Generate reports in multiple formats:
- **OSCAL JSON**: Standard OSCAL SSP format
- **Excel**: Detailed spreadsheet
- **PDF**: Formatted compliance report
- **CCM**: Cloud Control Matrix (Australian ISM)

---

## 🎨 Features in Detail

### Supported OSCAL Catalogs

1. **Australian ISM (ACSC)**
   - Non-Classified Baseline
   - Official Sensitive Baseline
   - Protected Baseline
   - Secret Baseline
   - Top Secret Baseline

2. **NIST SP 800-53 Rev 5**
   - Full catalog with all control families

3. **Singapore IM8 Reform**
   - GovTech Singapore standards

4. **Custom Catalogs**
   - Provide any OSCAL-compliant catalog URL

### Implementation Status Options

- 🔴 **Not Assessed**: Control not yet reviewed
- 🟢 **Effective**: Control is working as intended
- 🔵 **Alternate Control**: Alternative implementation in place
- 🟠 **Ineffective**: Control not meeting objectives
- ⚪ **No Visibility**: Cannot assess effectiveness
- 🟣 **Not Implemented**: Control not yet deployed
- ⚫ **Not Applicable**: Control not relevant to system

### Search and Filter

- Search by control ID or title
- Filter by control group/domain
- Filter by implementation status
- Filter by change status (new/changed/unchanged)
- Bulk actions for status updates

### Data Management

- **Auto-save**: Saves every 2 seconds
- **Manual save**: Save progress on demand
- **Load saved data**: Resume from browser storage
- **Clear data**: Start fresh when needed
- **Export/Import**: Download and upload SSP JSON files

---

## 📊 AI Telemetry Logging (New in v1.2.7!)

All AI interactions are logged following **OpenTelemetry (OTel) Generative AI Semantic Conventions** for full observability and compliance:

### Features
- **OTel Compliant**: Follows [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- **JSONL Format**: One JSON object per line for easy parsing
- **Automatic Rotation**: New log file created when size reaches 5MB
- **Detailed Metrics**: Tracks tokens, latency, prompts, responses, and errors
- **Security**: Admin-only access with RBAC permissions

### What's Logged
- **Prompts**: All prompts sent to AI engines
- **Responses**: AI-generated implementation text
- **Performance**: Latency, token usage, model information
- **Context**: Control ID, family, user/session metadata
- **Errors**: Detailed error information for debugging

### API Endpoints
- `GET /api/ai/logs/stats` - View log statistics
- `POST /api/ai/logs/cleanup` - Clean up old logs

See [ARCHITECTURE.md - AI Telemetry Logging](docs/ARCHITECTURE.md#ai-telemetry-logging-v127) for complete documentation.

---

## 🤖 Automated Control Suggestions

The application includes an intelligent control suggestion engine that provides automated recommendations for control implementations.

### AI Provider Support

The application supports multiple AI providers for enhanced control suggestions:

- **🏠 Ollama** (Local/Self-hosted) - Run AI models locally with full data privacy
- **☁️ Mistral API** (Cloud) - Direct access to Mistral AI cloud service
- **🚀 AWS Bedrock** (Cloud) - Enterprise-grade managed AI from Amazon with access to Mistral, Claude, and Llama models

**See**: [AWS_BEDROCK_INTEGRATION.md](AWS_BEDROCK_INTEGRATION.md) for detailed AWS Bedrock configuration guide.

### Features

- **Pattern Matching**: Analyzes control families (AC, AU, IA, SC, SI, etc.) and keywords
- **Template Library**: Pre-built templates for common control types
- **Machine Learning**: Learns from your existing control implementations
- **Confidence Scoring**: Each suggestion includes a confidence level (High/Medium/Low)
- **Field-Level Application**: Apply individual fields or all suggestions at once
- **Reasoning Display**: Explains why each suggestion was made

### How to Use

1. Expand any control in the controls list
2. Click the **"🤖 Get Suggestions"** button
3. Review the suggested implementation details with confidence scores
4. Apply individual fields using the "Apply" button next to each field
5. Or apply all suggestions at once using "✅ Apply All Suggestions"

### Suggestion Strategies

The engine uses multiple strategies to provide the best suggestions:

1. **Control Family Templates** (High Confidence)
   - Matches controls to predefined templates by family
   - Provides comprehensive implementation suggestions

2. **Pattern Matching** (Medium Confidence)
   - Analyzes control title and description for keywords
   - Matches against known patterns (access, audit, encryption, etc.)

3. **Learning from Existing Controls** (Medium Confidence)
   - Finds similar controls from existing implementations
   - Averages implementation details from similar controls

4. **Default Suggestions** (Low Confidence)
   - Provides generic but useful suggestions based on control characteristics

### Supported Fields

The suggestion engine can provide recommendations for:
- Implementation Status
- Implementation Description
- Responsible Party
- Control Type
- Testing Method
- Testing Frequency
- Risk Rating

---

## 📊 Export Formats

### 1. OSCAL SSP JSON

Standard OSCAL 1.1.2 format with:
- System characteristics
- Control implementation statements
- Responsible roles and parties
- Implementation status and remarks
- Original catalog metadata

### 2. Excel Export

Comprehensive spreadsheet with:
- Control details and descriptions
- Implementation information
- Status and dates
- Testing and evidence
- Risk assessments
- Color-coded status indicators

### 3. PDF Report

Professional compliance report including:
- Cover page
- System information summary
- Control assessment overview
- Detailed control implementations
- Status indicators and formatting

### 4. Cloud Control Matrix (CCM)

Australian ISM-specific format with:
- ACSC ISM control mappings
- Cloud provider responsibilities
- Consumer guidance
- Technical controls
- Policy and process controls
- Summary statistics sheet

---

## 🔧 Configuration

### Configuration Directory Structure

All configuration files are centralized in the `config/` directory:

```
config/
├── app/              # Application runtime configs (sensitive)
│   ├── config.json   # Application settings (SSO, messaging, API gateways)
│   └── users.json    # User accounts (FIPS 140-2 compliant passwords)
└── build/            # Build/deployment configs
    ├── docker-compose.yml
    ├── truenas-app.yaml
    └── Dockerfile
```

**Security Note**: The `config/app/` directory contains sensitive data and should be encrypted and have restricted access controls applied.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment mode |
| `PORT` | `3020` | Backend server port (default) |
| `FRONTEND_DEV_PORT` | `3021` | Frontend dev server port (vite) |
| `BUILD_TIMESTAMP` | Current time | Build timestamp for password generation |

### Port Configuration

The application uses the following ports:

- **Backend Server**: `3020` (default, configurable via `PORT` env var)
- **Frontend Dev Server**: `3021` (configured in `vite.config.js`)
- **Ollama AI Service**: `11434` (if using local AI)

Change the backend port by setting the `PORT` environment variable:

```bash
PORT=8080 node server.js
```

### Default Credentials

Default user passwords are generated using timestamp format: `username#$DDMMYYHH`

- **Format**: `username#$DDMMYYHH` (DD=Day, MM=Month, YY=Year, HH=Hour)
- **Example**: `user#$27112514` (November 27, 2025 at 14:00)
- **Location**: Check `credentials.txt` file after setup/build
- **Login UI**: Default passwords displayed on login page

---

## 🛠️ Development

### Project Structure

```
OSCAL_Reports/
├── backend/                      # Node.js + Express backend
│   ├── auth/                     # Authentication & authorization
│   │   ├── middleware.js         # Auth middleware
│   │   ├── passwordGenerator.js  # Password utilities
│   │   ├── roles.js              # Role definitions (Admin, Assessor, User)
│   │   └── userManager.js        # User management & PBKDF2 hashing
│   ├── server.js                 # Main server file (Port 3020)
│   ├── configManager.js          # Configuration management
│   ├── ccmExport.js              # CCM Excel generation
│   ├── ccmImport.js              # CCM import functionality
│   ├── pdfExport.js              # PDF generation
│   ├── sspComparisonV3.js        # Catalog comparison logic
│   ├── controlSuggestionEngine.js # AI suggestion engine
│   ├── mistralService.js         # Mistral AI integration
│   ├── integrityService.js       # SSP integrity checking
│   ├── messagingService.js       # Email/notification service
│   ├── oscalValidator.js         # OSCAL validation
│   ├── oscalValidatorAJV.js      # AJV-based validation
│   ├── oscal-schema.json         # OSCAL JSON Schema v1.1.2
│   ├── package.json              # Backend dependencies
│   └── public/                   # Built frontend files (generated)
│
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── AIIntegration.jsx         # AI provider config
│   │   │   ├── CatalogChoice.jsx         # Catalog selection
│   │   │   ├── CatalogueInput.jsx        # Catalog input
│   │   │   ├── CCMUpload.jsx             # CCM file upload
│   │   │   ├── ControlEditModal.jsx      # Control editor
│   │   │   ├── ControlItem.jsx           # Individual control
│   │   │   ├── ControlItemCCM.jsx        # CCM control item
│   │   │   ├── ControlsList.jsx          # Controls list view
│   │   │   ├── ControlSuggestions.jsx    # AI suggestions UI
│   │   │   ├── ErrorBoundary.jsx         # Error handling
│   │   │   ├── ExistingSSPUpload.jsx     # SSP upload
│   │   │   ├── ExportButtons.jsx         # Export options
│   │   │   ├── InitialChoice.jsx         # Workflow choice
│   │   │   ├── IntegrityWarning.jsx      # Integrity alerts
│   │   │   ├── Login.jsx                 # Authentication UI
│   │   │   ├── MessagingConfiguration.jsx # Email config
│   │   │   ├── MultiReportComparison.jsx # Report comparison
│   │   │   ├── SaveLoadBar.jsx           # Save/load bar
│   │   │   ├── SaveLoadPanel.jsx         # Save/load panel
│   │   │   ├── Settings.jsx              # Settings (legacy)
│   │   │   ├── SettingsWithTabs.jsx      # Tabbed settings
│   │   │   ├── SSOIntegration.jsx        # SSO configuration
│   │   │   ├── SystemInfoForm.jsx        # System info form
│   │   │   ├── UseCases.jsx              # Use case selector
│   │   │   ├── UserManagement.jsx        # User admin UI
│   │   │   └── ValidationStatus.jsx      # OSCAL validation
│   │   ├── contexts/                 # React contexts
│   │   │   └── AuthContext.jsx       # Authentication context
│   │   ├── services/                 # Frontend services
│   │   │   └── oscalValidator.js     # Client-side OSCAL validation
│   │   ├── utils/                    # Utility functions
│   │   │   ├── buildInfo.js          # Build metadata
│   │   │   ├── passwordGenerator.js  # Client password utilities
│   │   │   └── storage.js            # LocalStorage management
│   │   ├── App.jsx                   # Main application component
│   │   ├── App.css                   # Global styles
│   │   ├── index.css                 # Base CSS
│   │   └── main.jsx                  # Entry point
│   ├── index.html                    # HTML template
│   ├── package.json                  # Frontend dependencies
│   └── vite.config.js                # Vite config (Port 3021)
│
├── config/                           # Configuration directory
│   ├── app/                          # Application configs (sensitive)
│   │   ├── config.json.example       # Config template
│   │   └── users.json.example        # Users template
│   └── build/                        # Build/deployment configs
│       ├── docker-compose.yml        # Docker Compose
│       ├── Dockerfile                # Docker build
│       └── truenas-app.yaml          # TrueNAS config
│
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # Technical architecture & AI telemetry
│   ├── DEPLOYMENT.md                 # Deployment guide (Docker, TrueNAS, SMB)
│   ├── CONFIGURATION.md              # Configuration documentation
│   └── OSCAL_Compliance_Tool_Demo.pptx # Demo presentation
│
├── sample_output/                    # Sample outputs
│   ├── AEMGovAu_ComplianceReport_Sample_2025-11-20.json
│   └── test-ssp-integrity.json
│
├── logs/                             # AI telemetry logs (OTel GenAI format)
│   └── ai-telemetry-YYYY-MM-DD.jsonl # Log files (auto-rotated at 5MB)
│
├── package.json                      # Root package (dev scripts)
├── setup.sh                          # Setup script
├── build_on_truenas.sh               # TrueNAS build script
├── reactivate-admin.sh               # Admin reactivation
├── docker-compose.yml                # Docker Compose (root)
├── Dockerfile                        # Dockerfile (root)
├── truenas-app.yaml                  # TrueNAS config (root)
├── LICENSE                           # GPL-3.0-or-later License
└── README.md                         # This file
```

### Tech Stack

**Backend:**
- Node.js 20
- Express.js
- ExcelJS (Excel generation)
- PDFKit (PDF generation)
- Axios (HTTP client)
- PBKDF2 (FIPS 140-2 compliant password hashing)
- Crypto (Node.js built-in cryptographic functions)

**Frontend:**
- React 18
- Vite (build tool)
- CSS3 (styling)
- Local Storage API (data persistence)
- Axios (HTTP client for API calls)

### Development Commands

```bash
# Run both backend and frontend in development mode
npm run dev

# Backend only (with auto-reload)
cd backend
npm run dev

# Frontend only (with hot reload)
cd frontend
npm run dev

# Build frontend for production
cd frontend
npm run build
```

---

## 📚 API Endpoints

### Health Check
```
GET /health
Response: {"status":"healthy","service":"Keekar's OSCAL SOA/SSP/CCM Generator"}
```

### Fetch OSCAL Catalog
```
POST /api/fetch-catalogue
Body: { "url": "https://example.com/catalog.json" }
```

### Extract Catalog from SSP
```
POST /api/extract-catalog-from-ssp
Body: { "sspData": {...} }
```

### Extract Controls from SSP
```
POST /api/extract-controls-from-ssp
Body: { "catalogControls": [...], "existingSSP": {...} }
```

### Compare SSP with Catalog
```
POST /api/compare-ssp
Body: { "catalogControls": [...], "existingSSP": {...}, "catalogData": {...} }
```

### Generate SSP
```
POST /api/generate-ssp
Body: { "metadata": {...}, "controls": [...], "systemInfo": {...} }
```

### Generate Excel
```
POST /api/generate-excel
Body: { "controls": [...], "systemInfo": {...} }
Response: Excel file (binary)
```

### Generate PDF
```
POST /api/generate-pdf
Body: { "metadata": {...}, "controls": [...], "systemInfo": {...} }
Response: PDF file (binary)
```

### Generate CCM
```
POST /api/generate-ccm
Body: { "controls": [...], "systemInfo": {...} }
Response: Excel file (binary)
```

### Import CCM
```
POST /api/import-ccm
Body: { "fileData": "<base64-encoded-excel>" }
Response: { "systemInfo": {...}, "controls": [...], "statistics": {...} }
```

### Authentication Endpoints

```
POST /api/auth/login
Body: { "username": "user", "password": "user#$27112514" }
Response: { "success": true, "user": {...}, "sessionToken": "..." }

GET /api/auth/default-credentials
Response: { "success": true, "passwords": {...}, "format": "username#$DDMMYYHH" }

GET /api/auth/validate
Headers: { "Authorization": "Bearer <token>" }
Response: { "valid": true, "user": {...} }

POST /api/auth/logout
Headers: { "Authorization": "Bearer <token>" }
Response: { "success": true }
```

---

## 🔐 Security Considerations

### Password Security

- **FIPS 140-2 Compliant Hashing**: All passwords use PBKDF2 with SHA-256
  - 100,000 iterations (meets FIPS recommendations)
  - Random 16-byte salt per password
  - 32-byte (256-bit) key length
  - Format: `pbkdf2$sha256$iterations$salt$hash`
- **Timestamp-Based Default Passwords**: Default credentials use format `username#$DDMMYYHH`
  - Generated based on build/startup timestamp
  - More secure than static default passwords
  - Displayed in login UI and credentials file
- **Automatic Password Migration**: Legacy SHA-256 passwords automatically migrate to PBKDF2 on login

### Configuration Security

- **Centralized Config Directory**: All configuration files stored in `config/` directory
  - Runtime configs in `config/app/` (sensitive data)
  - Build configs in `config/build/` (deployment files)
  - Ready for folder-level encryption and access control
- **Sensitive Files Excluded**: Config files excluded from version control via `.gitignore`

### Data Storage

- All data is stored in browser local storage (client-side)
- No sensitive data is stored on the server
- Catalog URLs are fetched server-side to avoid CORS issues
- Health check endpoint for monitoring
- User authentication and authorization system in place

---

## 🐛 Troubleshooting

### Common Issues

**1. Port already in use**
```bash
# Find and kill process on port 3020 (backend)
lsof -i :3020
kill -9 <PID>

# Or port 3021 (frontend dev)
lsof -i :3021
kill -9 <PID>
```

**2. Frontend not loading**
```bash
# Rebuild frontend
cd frontend && npm run build
cp -r dist ../backend/public
```

**3. Health check fails**
```bash
# Check if server is running
curl http://localhost:3020/health

# Check logs
cd backend
tail -f server.log
```

**4. Cannot access from network (TrueNAS)**
- Ensure the server is listening on `0.0.0.0` (not just `localhost`)
- Check firewall settings on the server
- Verify port 3020 is open and forwarded correctly
- Test with: `curl http://<server-ip>:3020/health`

---

## 📈 Roadmap

### Version 2.1 (Planned)
- [ ] User authentication and multi-user support
- [ ] Database backend for persistent storage
- [ ] Collaborative editing
- [ ] Version control for SSP documents
- [ ] API key management for external catalogs
- [ ] Scheduled compliance reporting

### Version 3.0 (Future)
- [ ] Assessment and POA&M module
- [ ] Integration with GRC tools
- [ ] Automated control testing
- [ ] Compliance dashboard
- [ ] Multi-tenant support

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later). See [LICENSE](LICENSE) file for details.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

**Copyright (C) 2025 Mukesh Kesharwani**

---

## 👨‍💻 Author

**Mukesh Kesharwani**
- Email: mukesh.kesharwani@adobe.com
- Affiliation: Adobe

---

## 🙏 Acknowledgments

- **NIST** for the OSCAL standard and reference implementations
- **Australian Cyber Security Centre (ACSC)** for ISM OSCAL catalogs
- **GovTech Singapore** for IM8 standards
- **Open source community** for the amazing tools and libraries

---

## 📚 Documentation

This project maintains comprehensive documentation:

1. **[README.md](README.md)** - This file - Overview, quick start, and features
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical architecture, API endpoints, AI telemetry
3. **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide (Docker, general deployment)
4. **[docs/TRUENAS_DEPLOYMENT.md](docs/TRUENAS_DEPLOYMENT.md)** - TrueNAS automated Blue-Green deployment
5. **[docs/TRUENAS_QUICK_SETUP.md](docs/TRUENAS_QUICK_SETUP.md)** - TrueNAS quick start (5 minutes)
6. **[docs/CRON_SETUP.md](docs/CRON_SETUP.md)** - Cron configuration reference
7. **[docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md)** - Best practices and implementation guidelines
8. **[docs/QUALITY_ASSURANCE.md](docs/QUALITY_ASSURANCE.md)** - QA processes and testing

### Quick Links

- **TrueNAS Setup**: [docs/TRUENAS_QUICK_SETUP.md](docs/TRUENAS_QUICK_SETUP.md)
- **TrueNAS Deployment**: [docs/TRUENAS_DEPLOYMENT.md](docs/TRUENAS_DEPLOYMENT.md)
- **Cron Configuration**: [docs/CRON_SETUP.md](docs/CRON_SETUP.md)
- **AI Telemetry Logging**: [ARCHITECTURE.md - AI Telemetry](docs/ARCHITECTURE.md#ai-telemetry-logging-v127)
- **API Documentation**: [ARCHITECTURE.md - API Endpoints](docs/ARCHITECTURE.md)
- **Deployment Guides**: [DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Testing**: [tests/docs/TESTING.md](tests/docs/TESTING.md)

---

## 📞 Support

For issues, questions, or feature requests:

- **GitHub Issues**: Open an issue on the repository
- **Documentation**: See above for all available documentation
- **Server**: Access at nas.keekar.com:3020
- **Email**: mukesh.kesharwani@adobe.com

---

## 📊 Statistics

- **7 Implementation Status Options** with color coding
- **5 Australian ISM Baseline Levels** supported
- **4 Export Formats** (OSCAL JSON, Excel, PDF, CCM)
- **3 Built-in Framework Catalogs** (NIST, ACSC, Singapore)
- **1 Powerful Tool** for compliance documentation

---

**Made with Passion by Mukesh Kesharwani**

*Simplifying compliance documentation, one control at a time.*
# OSCAL-Reports
