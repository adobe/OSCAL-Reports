# Application Architecture

**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)  
**Organization**: Adobe  
**Version**: 2.0.0  
**Last Updated**: December 2025

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Frontend Architecture](#frontend-architecture)
5. [Backend Architecture](#backend-architecture)
6. [AI Integration (Mistral 7B)](#ai-integration-mistral-7b)
7. [Technology Stack](#technology-stack)
8. [Security Considerations](#security-considerations)
9. [Performance](#performance)
10. [Deployment](#deployment)
11. [Project Structure](#project-structure)
12. [Enhancement History](#enhancement-history)
13. [Future Enhancements](#future-enhancements)

---

## Overview

Keekar's OSCAL SOA/SSP/CCM Generator is a full-stack web application with a React frontend and Node.js backend, designed to simplify the creation of Statement of Applicability (SOA), System Security Plans (SSP), and Cloud Control Matrix (CCM) from OSCAL catalogues.

### Port Configuration

- **Backend Server**: Port `3020` (default, configurable via `PORT` environment variable)
- **Frontend Dev Server**: Port `3021` (configured in `vite.config.js`, proxies API to 3020)
- **Ollama AI Service**: Port `11434` (local AI model server)
- **Production**: Single backend server on port `3020` serves both API and static frontend files

### OSCAL Catalog Support

The application supports a wide range of official OSCAL catalogs and profiles:

#### 🇺🇸 NIST SP 800-53 Rev 5
- Full catalog with all controls
- Baseline profiles: Low, Moderate, High impact levels
- Source: [usnistgov/oscal-content](https://github.com/usnistgov/oscal-content)

#### 🇦🇺 Australian ISM (ACSC)
- Multiple security classification baselines:
  - Non-Classified Baseline
  - Official Sensitive Baseline
  - Protected Baseline
  - Secret Baseline
  - Top Secret Baseline
- Source: [AustralianCyberSecurityCentre/ism-oscal](https://github.com/AustralianCyberSecurityCentre/ism-oscal)

#### 🇸🇬 Singapore IM8
- IM8 Reform catalog for low-risk cloud systems
- Source: [GovTechSG/tech-standards](https://github.com/GovTechSG/tech-standards)

#### 🇨🇦 Canadian CCCS Profiles
- Cloud Medium Security Profile
- ITSP.10.033-01 (User Authentication Guidance)
- ITSP.10.171 (Protected B)
- Medium + PBHVA (Protected B, High Integrity, High Availability)
- PBHVA Overlay Profile
- SaaS FedRAMP Compliance Profile
- Source: [aws-samples/cccs-oscal-samples](https://github.com/aws-samples/cccs-oscal-samples)

#### Custom Catalogs
- Support for any OSCAL-compliant catalog via URL input
- Validates against OSCAL JSON Schema v1.1.2
- Supports both catalog and resolved profile formats

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌─────────────────────────────────────────────────────── ┐ │
│  │              React Frontend (Port 3021)                │ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │ │
│  │  │ Catalogue    │  │ System Info  │  │ Controls    │   │ │
│  │  │ Input        │  │ Form         │  │ List        │   │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘   │ │
│  │                                                        │ │
│  │  └──────────────────────┬────────────────────┘         │ │
│  └─────────────────────────┼──────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP/JSON
                             │ (Axios)
┌────────────────────────────┼────────────────────────────────┐
│                            │                                │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │         Node.js/Express Backend (Port 3020)            │ │
│  │                                                        │ │
│  │  ┌────────────────────────────────────────────────┐    │ │
│  │  │            API Endpoints                       │    │ │
│  │  │                                                 │   │ │
│  │  │  POST /api/fetch-catalogue                      │   │ │
│  │  │  POST /api/generate-ssp                         │   │ │
│  │  │  POST /api/generate-excel                       │   │ │
│  │  │  POST /api/generate-pdf                         │   │ │
│  │  │  POST /api/generate-ccm                         │   │ │
│  │  │  POST /api/import-ccm                           │   │ │
│  │  │  POST /api/extract-catalog-from-ssp             │   │ │
│  │  │  POST /api/compare-ssp                          │   │ │
│  │  │  POST /api/suggest-control                       │   │ │
│  │  │  GET  /api/mistral/status                        │   │ │
│  │  └────────────────────────────────────────────────┘    │ │
│  │                                                        │ │
│  │  ┌─────────────────────────────────────────────────┐   │ │
│  │  │         Processing Modules                      │   │ │
│  │  │                                                 │   │ │
│  │  │  • OSCAL Parser (extractControls)               │   │ │
│  │  │  • SSP Generator                                │   │ │
│  │  │  • Excel Generator (ExcelJS)                    │   │ │
│  │  │  • PDF Generator (PDFKit)                       │   │ │
│  │  │  • CCM Export (ccmExport.js)                    │   │ │
│  │  │  • CCM Import (ccmImport.js)                    │   │ │
│  │  │  • SSP Comparison (sspComparisonV3.js)          │   │ │
│  │  │  • Control Suggestions (controlSuggestionEngine)│   │ │
│  │  │  • Mistral AI Service (mistralService.js)       │   │ │
│  │  └─────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP
                             │ (Axios)
┌────────────────────────────▼─────────────────────────────────┐
│              External OSCAL Catalogues                       │
│                                                              │
│  📚 Supported OSCAL Catalogs:                                │
│                                                              │
│  🇺🇸 NIST SP 800-53 Rev 5:                                    │
│     • Full Catalog                                           │
│     • Low Baseline Profile                                   │
│     • Moderate Baseline Profile                              │
│     • High Baseline Profile                                  │
│                                                              │
│  🇦🇺 Australian ISM (ACSC):                                   │
│     • Non-Classified Baseline                                │
│     • Official Sensitive Baseline                            │
│     • Protected Baseline                                     │
│     • Secret Baseline                                        │
│     • Top Secret Baseline                                    │
│                                                              │
│  🇸🇬 Singapore IM8:                                           │
│     • IM8 Reform (Low Risk Cloud)                            │
│                                                              │
│  🇨🇦 Canadian CCCS Profiles:                                  │
│     • Cloud Medium Profile                                   │
│     • ITSP.10.033-01 (User Authentication)                   │
│     • ITSP.10.171 (Protected B)                              │
│     • Medium + PBHVA Profile                                 │
│     • PBHVA Overlay Profile                                  │
│     • SaaS FedRAMP Profile                                   │
│                                                              │
│  🔧 Custom OSCAL Catalogues:                                 │
│     • User-provided catalog URLs                             │
│     • Any OSCAL-compliant catalog                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Load Catalogue

```
User → CatalogueInput → Select Catalog (Built-in or Custom URL)
                                    ↓
                    POST /api/fetch-catalogue → External OSCAL Catalog URL
                                    ↓
                        Fetch & Parse OSCAL JSON
                                    ↓
                    Validate against OSCAL Schema v1.1.2
                                    ↓
                        Extract Controls Recursively
                                    ↓
                      Return to Frontend (catalogue, controls, metadata)
                                    ↓
                          Store in React State
                                    ↓
                    Auto-save to Browser LocalStorage
```

**Supported Catalog Sources:**
- Pre-configured catalogs (NIST, Australian ISM, Singapore IM8, Canadian CCCS)
- Custom OSCAL catalog URLs
- Resolved profile catalogs
- Full OSCAL catalogs

### 2. Load Existing SSP

```
User Upload → ExistingSSPUpload → POST /api/extract-catalog-from-ssp
                                          ↓
                                Extract Catalog URL
                                          ↓
                    POST /api/extract-controls-from-ssp
                                          ↓
                        Map SSP Data to Controls
                                          ↓
                            Return to Frontend
```

### 3. Update Catalog

```
New Catalog → POST /api/compare-ssp
                    ↓
    Compare Old vs New Catalog
                    ↓
Mark Controls (New/Changed/Unchanged)
                    ↓
      Return to Frontend
```

### 4. Document Controls

```
User Input → ControlsList → ControlItem → Update State
                                          ↓
                                React State Management
                                          ↓
                                  Live Updates
                                          ↓
                                Auto-save to LocalStorage
```

### 5. Export OSCAL SSP

```
Export Button → POST /api/generate-ssp
                    ↓
    Build OSCAL SSP Structure
                    ↓
        Add Metadata & Controls
                    ↓
      Return JSON to Frontend
                    ↓
        Download File
```

### 6. Export Excel

```
Export Button → POST /api/generate-excel
                    ↓
          Create Workbook
                    ↓
    Add System Info Sheet
                    ↓
    Add Controls Sheet
                    ↓
        Format & Style
                    ↓
    Return Buffer to Frontend
                    ↓
        Download File
```

### 7. Export PDF

```
Export Button → POST /api/generate-pdf
                    ↓
      Create PDF Document
                    ↓
    Add Cover & System Info
                    ↓
    Add Control Details
                    ↓
    Return Buffer to Frontend
                    ↓
        Download File
```

### 8. Export/Import CCM

```
Export: Controls → POST /api/generate-ccm → CCM Excel
Import: CCM Excel → POST /api/import-ccm → Controls Data
```

---

## Frontend Architecture

### Component Hierarchy

```
App (Main Container)
├── InitialChoice
│   ├── Start New Report
│   └── Load Existing Report
├── ExistingSSPUpload
│   └── File upload component
├── CatalogChoice
│   ├── Keep Current Catalog
│   └── Update to Latest
├── CatalogueInput
│   └── Sample catalogue cards
├── CCMUpload
│   └── CCM file upload
├── SystemInfoForm
│   └── Form inputs
├── ControlsList
│   ├── Search & Filters
│   ├── Stats Display
│   └── ControlItem (Multiple)
│       └── Expandable forms
├── ExportButtons
│   └── Export options
└── SaveLoadPanel
    ├── Save/Load/Clear buttons
    └── Status indicators
```

### State Management

```javascript
App State:
- step: Current wizard step (1-4)
- initialChoice: 'new' or 'existing'
- existingSSP: Loaded SSP data
- catalogChoice: 'keep' or 'update'
- catalogueUrl: URL of loaded catalogue
- catalogue: Full OSCAL catalogue object
- controls: Array of controls with user input
- systemInfo: System details
- loading: Loading state
- error: Error messages
- isCCMMode: Boolean for CCM import mode
```

### Key Features

1. **Step-based Wizard**: Guides users through 4 clear steps
2. **Dual Workflow**: Support for new and existing reports
3. **Catalog Comparison**: Intelligent comparison of catalog versions
4. **Real-time Filtering**: Search and filter controls dynamically
5. **Bulk Actions**: Update multiple controls at once
6. **Auto-save**: Automatic saving to browser localStorage
7. **Responsive Design**: Works on desktop and mobile
8. **Error Handling**: Clear error messages with user guidance
9. **CCM Import**: Import existing CCM Excel files

---

## Backend Architecture

### API Endpoints

#### POST `/api/fetch-catalogue`
- **Purpose**: Fetch and parse OSCAL catalogue from URL
- **Input**: `{ url: string }`
- **Output**: `{ catalogue, controls, metadata }`
- **Processing**:
  1. Fetch JSON from URL using Axios
  2. Parse OSCAL structure
  3. Extract controls recursively
  4. Return structured data

#### POST `/api/extract-catalog-from-ssp`
- **Purpose**: Extract catalog URL from existing SSP
- **Input**: `{ sspData: object }`
- **Output**: `{ catalogUrl: string }`
- **Processing**:
  1. Parse SSP structure
  2. Extract import-profile href
  3. Return catalog URL

#### POST `/api/extract-controls-from-ssp`
- **Purpose**: Extract controls and data from SSP (keeping same catalog)
- **Input**: `{ catalogControls: array, existingSSP: object }`
- **Output**: `{ controls: array, systemInfo: object }`
- **Processing**:
  1. Map catalog controls to SSP data
  2. Extract implementation details
  3. Extract system information
  4. Return merged data

#### POST `/api/compare-ssp`
- **Purpose**: Compare new catalog with existing SSP
- **Input**: `{ catalogControls: array, existingSSP: object, catalogData: object }`
- **Output**: `{ controls: array, changeStats: object, systemInfo: object }`
- **Processing**:
  1. Compare control IDs
  2. Compare control content
  3. Mark as new/changed/unchanged
  4. Preserve existing data
  5. Return comparison results

#### POST `/api/generate-ssp`
- **Purpose**: Generate OSCAL-compliant SSP
- **Input**: `{ metadata, controls, systemInfo }`
- **Output**: OSCAL SSP JSON
- **Processing**:
  1. Build SSP structure
  2. Add metadata and system characteristics
  3. Add control implementations
  4. Generate UUIDs
  5. Return complete SSP

#### POST `/api/generate-excel`
- **Purpose**: Generate Excel export
- **Input**: `{ controls, systemInfo }`
- **Output**: Excel file (binary)
- **Processing**:
  1. Create workbook with ExcelJS
  2. Add System Information sheet
  3. Add Controls Implementation sheet
  4. Apply styling
  5. Return buffer

#### POST `/api/generate-pdf`
- **Purpose**: Generate PDF report
- **Input**: `{ controls, systemInfo, metadata }`
- **Output**: PDF file (binary)
- **Processing**:
  1. Create PDF document with PDFKit
  2. Add cover page
  3. Add system information
  4. Add control implementations
  5. Format and style
  6. Return buffer

#### POST `/api/generate-ccm`
- **Purpose**: Generate Cloud Control Matrix export
- **Input**: `{ controls, systemInfo }`
- **Output**: Excel file (binary)
- **Processing**:
  1. Create workbook with ExcelJS
  2. Add Summary sheet
  3. Add detailed control sheets
  4. Apply ISM-specific formatting
  5. Return buffer

#### POST `/api/import-ccm`
- **Purpose**: Import CCM Excel file and parse control data
- **Input**: `{ fileData: string (base64) }`
- **Output**: `{ systemInfo, controls, statistics }`
- **Processing**:
  1. Decode base64 to buffer
  2. Parse Excel with ExcelJS
  3. Extract system information
  4. Extract control data
  5. Map to application format
  6. Return parsed data

#### POST `/api/suggest-control`
- **Purpose**: Get AI-powered suggestions for control implementation
- **Input**: `{ control: object, existingControls: array }`
- **Output**: `{ suggestions: object, confidence: number, reasoning: array }`
- **Processing**:
  1. Analyze control using pattern matching
  2. Generate implementation text with Mistral 7B
  3. Combine pattern-matched fields with AI-generated text
  4. Return suggestions with confidence score

#### GET `/api/mistral/status`
- **Purpose**: Check Mistral 7B availability
- **Output**: `{ available: boolean, provider: string, model: string }`
- **Processing**:
  1. Check Mistral configuration
  2. Test connection to Ollama or Mistral API
  3. Return availability status

#### Authentication Endpoints

#### POST `/api/auth/login`
- **Purpose**: Authenticate user and create session
- **Input**: `{ username: string, password: string }`
- **Output**: `{ success: boolean, user: object, sessionToken: string }`
- **Processing**:
  1. Verify password using PBKDF2 (FIPS 140-2 compliant)
  2. Migrate legacy SHA-256 passwords if detected
  3. Check user active status
  4. Generate session token
  5. Return user data and token

#### GET `/api/auth/default-credentials`
- **Purpose**: Get default user passwords (for login UI display)
- **Output**: `{ success: boolean, passwords: object, format: string }`
- **Processing**:
  1. Generate timestamp-based passwords for default users
  2. Return passwords in format: `username#DDMMYYHH`
  3. Include format explanation

#### GET `/api/auth/validate`
- **Purpose**: Validate session token
- **Headers**: `Authorization: Bearer <token>`
- **Output**: `{ valid: boolean, user: object }`

#### POST `/api/auth/logout`
- **Purpose**: Invalidate session token
- **Headers**: `Authorization: Bearer <token>`
- **Output**: `{ success: boolean }`

### OSCAL Parsing

The `extractControls()` function:
- Recursively processes groups and controls
- Handles nested control structures
- Extracts relevant properties
- Maintains parent-child relationships
- Supports both catalogues and profiles

### SSP Comparison

The `sspComparisonV3.js` module:
- Compares catalog versions
- Identifies new controls
- Detects changed controls
- Preserves existing data
- Provides detailed change statistics

---

## AI Integration (Mistral 7B)

### Overview

The application integrates **Mistral 7B** for AI-powered control implementation text generation. This provides intelligent, context-aware suggestions that are unique for each control.

> **Note**: For TrueNAS deployment, see [TRUENAS_DEPLOYMENT.md](TRUENAS_DEPLOYMENT.md#mistral-7b-ai-integration) for deployment-specific instructions.

### Architecture

```
Control Suggestion Request
    ↓
controlSuggestionEngine.js
    ├── Pattern Matching (Status, Responsible Party, etc.)
    ├── Template Matching (Control Family Templates)
    └── Mistral 7B Service (Implementation Text Generation)
            ↓
    mistralService.js
        ├── Load Configuration (config/app/config.json)
        ├── Check Provider (Ollama or Mistral API)
        └── Generate Implementation Text
                ↓
        Ollama (Local) or Mistral API (Cloud)
                ↓
        Return Unique Implementation Text
                ↓
    Combine with Pattern-Matched Fields
                ↓
    Return Complete Suggestions
```

### Deployment Options

#### Option 1: Ollama (Local/Self-hosted) - Recommended

**Benefits:**
- ✅ Data privacy (no data leaves your infrastructure)
- ✅ No API costs
- ✅ Full control over model and data
- ✅ Works offline

**Setup:**

**Using Docker:**
```bash
# Pull and run Ollama
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Pull Mistral 7B model
docker exec -it ollama ollama pull mistral:7b
```

**Using Ollama Binary:**
```bash
# Install Ollama
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# Pull Mistral 7B model
ollama pull mistral:7b
```

**Configuration:**
```json
{
  "mistralConfig": {
    "enabled": true,
    "provider": "ollama",
    "ollamaUrl": "http://localhost:11434",
    "model": "mistral:7b",
    "timeout": 30000,
    "maxRetries": 2,
    "fallbackToPatternMatching": true
  }
}
```

#### Option 2: Mistral AI API (Cloud)

**Benefits:**
- ✅ Fast response times
- ✅ No local resource requirements
- ✅ Automatic model updates

**Setup:**

1. Get API Key from [console.mistral.ai](https://console.mistral.ai)
2. Configure in `config/app/config.json`:
```json
{
  "mistralConfig": {
    "enabled": true,
    "provider": "mistral-api",
    "mistralApiKey": "your-api-key-here",
    "mistralApiUrl": "https://api.mistral.ai/v1/chat/completions",
    "timeout": 30000,
    "maxRetries": 2,
    "fallbackToPatternMatching": true
  }
}
```

**⚠️ Security Note:** Never commit API keys to version control. Use environment variables or secure configuration management in production.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable Mistral integration |
| `provider` | string | `"ollama"` | Provider: `"ollama"` or `"mistral-api"` |
| `ollamaUrl` | string | `"http://localhost:11434"` | Ollama service URL |
| `model` | string | `"mistral:7b"` | Model name (for Ollama) |
| `mistralApiKey` | string | `""` | Mistral AI API key (for cloud) |
| `mistralApiUrl` | string | `"https://api.mistral.ai/v1/chat/completions"` | Mistral API endpoint |
| `timeout` | number | `30000` | Request timeout in milliseconds |
| `maxRetries` | number | `2` | Maximum retry attempts on failure |
| `fallbackToPatternMatching` | boolean | `true` | Fallback to pattern matching if Mistral fails |

### How It Works

#### Integration Flow

1. **User clicks "Get Suggestions"** for a control
2. **System analyzes control** using pattern matching and templates (for status, responsible party, etc.)
3. **Mistral 7B generates** unique implementation text based on:
   - Control ID and title
   - Control description from OSCAL parts
   - Control family (AC, AU, IA, SC, SI, etc.)
4. **Fallback mechanism**: If Mistral is unavailable, uses pattern matching
5. **Combined result**: Pattern-matched fields + AI-generated implementation text

#### Suggestion Strategies

1. **Control Family Templates** (Confidence: 0.8)
   - Matches controls to predefined templates by family (AC, AU, IA, SC, SI, etc.)
   - Provides comprehensive implementation suggestions

2. **Pattern Matching** (Confidence: 0.7)
   - Analyzes control title and description for keywords
   - Matches against known patterns (access, audit, encryption, etc.)

3. **Learning from Existing Controls** (Confidence: 0.6)
   - Finds similar controls from existing implementations
   - Averages implementation details from similar controls

4. **AI-Generated Implementation** (Confidence: 0.7+)
   - Mistral 7B generates unique, context-aware implementation text
   - Based on actual control content and description
   - Professional cybersecurity terminology

5. **Default Suggestions** (Confidence: 0.4)
   - Provides generic but useful suggestions based on control characteristics

### Benefits

- ✅ **Unique implementations** for each control (no duplicates)
- ✅ **Context-aware** text based on actual control content
- ✅ **Professional** cybersecurity terminology
- ✅ **Fallback support** ensures suggestions always work
- ✅ **Privacy-focused** with local Ollama option

### Troubleshooting

#### Ollama Connection Issues

**Error:** `ECONNREFUSED` or `Ollama service not available`

**Solutions:**
1. Verify Ollama is running: `curl http://localhost:11434/api/tags`
2. Check if port 11434 is accessible
3. Verify model is installed: `ollama list`
4. Restart Ollama service

#### Model Not Found

**Error:** `Model mistral:7b not found`

**Solution:**
```bash
ollama pull mistral:7b
```

#### API Key Issues (Mistral API)

**Error:** `Invalid Mistral API key`

**Solutions:**
1. Verify API key is correct in `config/app/config.json`
2. Check API key hasn't expired
3. Verify account has credits/quota available

#### Timeout Issues

**Error:** Request timeout

**Solutions:**
1. Increase `timeout` value in config (default: 30000ms)
2. Check network connectivity
3. For Ollama: Ensure system has enough resources (RAM/CPU)

### Performance Considerations

- **Ollama (Local)**: 
  - Requires ~4GB RAM for Mistral 7B
  - First request may be slower (model loading)
  - Subsequent requests are fast
  - No API costs

- **Mistral API (Cloud)**:
  - Fast response times
  - API rate limits apply
  - Costs per request (check pricing)
  - Requires internet connection

### Security Best Practices

1. **Local Deployment (Ollama)**: 
   - Data never leaves your infrastructure
   - No API keys required
   - Best for sensitive/confidential data

2. **Cloud API (Mistral)**:
   - Use environment variables for API keys
   - Rotate keys regularly
   - Monitor API usage
   - Review Mistral's data retention policies

### Testing

After setup, test the integration:

1. **Check Status:**
   ```bash
   # Check AI service status
   curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
        http://localhost:3020/api/mistral/status
   
   # Check backend health
   curl http://localhost:3020/health
   
   # Check Ollama (if using local AI)
   curl http://localhost:11434/api/tags
   ```

2. **Generate Suggestions:**
   - Open the application
   - Load a catalog
   - Expand any control
   - Click "🤖 Get Suggestions"
   - Verify implementation text is unique and relevant

---

## Technology Stack

### Frontend
- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Axios**: HTTP client
- **CSS3**: Styling with custom properties
- **Lucide React**: Icon library

### Backend
- **Node.js 20**: Runtime environment
- **Express**: Web framework
- **Axios**: HTTP client for fetching catalogues
- **ExcelJS**: Excel file generation and parsing
- **PDFKit**: PDF generation
- **UUID**: Unique identifier generation
- **PBKDF2**: FIPS 140-2 compliant password hashing
- **Crypto**: Node.js built-in cryptographic functions

### AI/ML
- **Mistral 7B**: Large language model for text generation
- **Ollama**: Local LLM runner
- **Mistral AI API**: Cloud-based Mistral service

---

## Security Considerations

### Password Security

1. **FIPS 140-2 Compliant Hashing**
   - **Algorithm**: PBKDF2 (FIPS-approved Key Derivation Function)
   - **Hash Function**: SHA-256 (FIPS 180-4 approved)
   - **Iterations**: 100,000 (meets FIPS recommendations)
   - **Salt**: Random 16 bytes (128 bits) per password
   - **Key Length**: 32 bytes (256 bits)
   - **Storage Format**: `pbkdf2$sha256$iterations$salt$hash`
   - **Migration**: Automatic migration from legacy SHA-256 passwords

2. **Password Generation**
   - Default passwords use timestamp format: `username#DDMMYYHH`
   - Generated based on build/startup timestamp
   - Unique per deployment instance

### Authentication & Authorization

1. **User Management**
   - Role-based access control (Platform Admin, Assessor, User)
   - Session-based authentication
   - Password change functionality
   - User activation/deactivation

2. **Session Management**
   - In-memory session storage
   - 24-hour session expiration
   - Session token validation

### Configuration Security

1. **Centralized Config Directory**
   - Runtime configs: `config/app/` (sensitive data)
   - Build configs: `config/build/` (deployment files)
   - Ready for encryption and access control

2. **File Security**
   - Sensitive config files excluded from version control
   - Automatic migration from legacy locations
   - Script integration for secure deployment

### General Security

1. **Input Validation**: URLs are validated before fetching
2. **Error Handling**: Comprehensive error handling throughout
3. **CORS**: Configured for local development and production
4. **No Data Storage**: No sensitive data is stored on the server
5. **Client-side Storage**: All user data stored in browser localStorage
6. **File Size Limits**: 50MB limit on request body size

---

## Performance

- **Lazy Loading**: Controls are rendered on-demand
- **Optimized State**: Efficient React state updates
- **Streaming**: Large files handled with streams where possible
- **Caching**: Browser caching for static assets
- **Auto-save Throttling**: Saves limited to every 2 seconds
- **AI Caching**: Mistral responses can be cached for similar controls

---

## Deployment

### Local Development
```bash
# Install dependencies
./setup.sh

# Run in development mode (hot reload)
npm run dev
```

### Production (TrueNAS/Server)
```bash
# Build frontend
cd frontend && npm run build

# Copy to backend
cp -r dist ../backend/public

# Start server
cd ../backend && NODE_ENV=production node server.js
```

### Environment Variables
- `NODE_ENV`: Set to `production` for production deployments
- `PORT`: Backend server port (default: 3020)
- `OLLAMA_URL`: Ollama service URL (default: http://localhost:11434)
- `AWS_REGION`: AWS region for Bedrock (e.g., us-east-1)
- `BUILD_TIMESTAMP`: Build timestamp for password generation
- Frontend dev server port: 3021 (configured in `vite.config.js`)

---

## Project Structure

```
OSCAL_Reports/
├── backend/                          # Node.js + Express backend
│   ├── auth/                         # Authentication & authorization
│   │   ├── middleware.js             # Auth middleware (JWT, session)
│   │   ├── passwordGenerator.js      # Password generation utilities
│   │   ├── roles.js                  # Role definitions (Admin, Assessor, User)
│   │   └── userManager.js            # User management & PBKDF2 hashing
│   ├── server.js                     # Main server file (Port 3020)
│   ├── configManager.js              # Configuration management
│   ├── ccmExport.js                  # CCM Excel generation
│   ├── ccmImport.js                  # CCM Excel import/parsing
│   ├── pdfExport.js                  # PDF generation (PDFKit)
│   ├── sspComparisonV3.js            # Catalog comparison logic
│   ├── controlSuggestionEngine.js    # AI suggestion engine
│   ├── mistralService.js             # Mistral AI integration (Ollama/API/Bedrock)
│   ├── integrityService.js           # SSP integrity verification
│   ├── messagingService.js           # Email/notification service
│   ├── oscalValidator.js             # OSCAL validation (Schema-based)
│   ├── oscalValidatorAJV.js          # AJV JSON Schema validator
│   ├── oscal-schema.json             # OSCAL JSON Schema v1.1.2 (243KB)
│   ├── package.json                  # Backend dependencies
│   └── public/                       # Built frontend files (generated by Vite)
│
├── frontend/                         # React frontend
│   ├── src/
│   │   ├── components/               # React components (36 components)
│   │   │   ├── AIIntegration.jsx     # AI provider configuration
│   │   │   ├── CatalogChoice.jsx     # Catalog selection workflow
│   │   │   ├── CatalogueInput.jsx    # Catalog URL input
│   │   │   ├── CCMUpload.jsx         # CCM file upload
│   │   │   ├── ControlEditModal.jsx  # Control editor modal
│   │   │   ├── ControlItem.jsx       # Individual control component
│   │   │   ├── ControlItemCCM.jsx    # CCM control item
│   │   │   ├── ControlsList.jsx      # Controls list view
│   │   │   ├── ControlSuggestions.jsx # AI suggestions UI
│   │   │   ├── ErrorBoundary.jsx     # Error handling boundary
│   │   │   ├── ExistingSSPUpload.jsx # SSP file upload
│   │   │   ├── ExportButtons.jsx     # Export options (JSON/Excel/PDF/CCM)
│   │   │   ├── InitialChoice.jsx     # Workflow choice (New/Existing)
│   │   │   ├── IntegrityWarning.jsx  # Integrity alerts
│   │   │   ├── Login.jsx             # Authentication UI
│   │   │   ├── MessagingConfiguration.jsx # Email config
│   │   │   ├── MultiReportComparison.jsx # Multi-report comparison
│   │   │   ├── SaveLoadBar.jsx       # Quick save/load bar
│   │   │   ├── SaveLoadPanel.jsx     # Full save/load panel
│   │   │   ├── Settings.jsx          # Settings (legacy)
│   │   │   ├── SettingsWithTabs.jsx  # Tabbed settings UI
│   │   │   ├── SSOIntegration.jsx    # SSO configuration
│   │   │   ├── SystemInfoForm.jsx    # System information form
│   │   │   ├── UseCases.jsx          # Use case selector
│   │   │   ├── UserManagement.jsx    # User admin UI
│   │   │   └── ValidationStatus.jsx  # OSCAL validation status
│   │   ├── contexts/                 # React contexts
│   │   │   └── AuthContext.jsx       # Authentication context provider
│   │   ├── services/                 # Frontend services
│   │   │   └── oscalValidator.js     # Client-side OSCAL validation
│   │   ├── utils/                    # Utility functions
│   │   │   ├── buildInfo.js          # Build metadata & timestamps
│   │   │   ├── passwordGenerator.js  # Client password utilities
│   │   │   └── storage.js            # LocalStorage management
│   │   ├── App.jsx                   # Main application component
│   │   ├── App.css                   # Global styles
│   │   ├── index.css                 # Base CSS
│   │   └── main.jsx                  # React entry point
│   ├── index.html                    # HTML template
│   ├── package.json                  # Frontend dependencies
│   └── vite.config.js                # Vite configuration (Port 3021)
│
├── config/                           # Centralized configuration directory
│   ├── app/                          # Application runtime configs (SENSITIVE)
│   │   ├── config.json.example       # Config template (SSO, AI, messaging)
│   │   └── users.json.example        # Users template (PBKDF2 hashes)
│   └── build/                        # Build/deployment configs
│       ├── docker-compose.yml        # Docker Compose configuration
│       ├── Dockerfile                # Docker build instructions
│       └── truenas-app.yaml          # TrueNAS SCALE app config
│
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # This file - Technical architecture
│   ├── DEPLOYMENT.md                 # Deployment guide
│   ├── CONFIGURATION.md              # Configuration documentation
│   └── OSCAL_Compliance_Tool_Demo.pptx # Demo presentation
│
├── sample_output/                    # Sample output files
│   ├── AEMGovAu_ComplianceReport_Sample_2025-11-20.json
│   └── test-ssp-integrity.json
│
├── package.json                      # Root package (dev scripts)
├── setup.sh                          # Setup script
├── build_on_truenas.sh               # TrueNAS build script
├── reactivate-admin.sh               # Admin reactivation utility
├── docker-compose.yml                # Docker Compose (root, includes Ollama)
├── Dockerfile                        # Dockerfile (root)
├── truenas-app.yaml                  # TrueNAS SCALE app config (root)
├── LICENSE                           # MIT License
└── README.md                         # Main documentation
```

---

## Enhancement History

### Recent Enhancements (November-December 2025)

#### 1. **AI-Powered Control Suggestions (Mistral 7B Integration)**

**Date**: December 2025  
**Status**: ✅ Completed

**Description:**  
Integrated Mistral 7B for generating intelligent, context-aware implementation descriptions. The system now provides unique implementation text for each control using AI, while maintaining pattern matching for other fields.

**Features:**
- ✅ Mistral 7B integration (Ollama local or Mistral API cloud)
- ✅ Unique AI-generated implementation text
- ✅ Pattern matching for status, responsible party, etc.
- ✅ Fallback to pattern matching if AI unavailable
- ✅ Configuration via `config/app/config.json`
- ✅ Status endpoint for checking AI availability

**Technical Details:**
- **Backend Service**: `backend/mistralService.js`
- **Integration**: `backend/controlSuggestionEngine.js`
- **API Endpoint**: `GET /api/mistral/status`
- **Configuration**: `config/app/config.json` → `mistralConfig`

**Files Created:**
- `backend/mistralService.js` - Mistral integration service
- `MISTRAL_SETUP.md` - Setup guide (now merged into this document)

**Files Modified:**
- `backend/controlSuggestionEngine.js` - Integrated Mistral for implementation text
- `backend/server.js` - Added `/api/mistral/status` endpoint
- `config/app/config.json` - Added Mistral configuration
- `setup.sh` - Automated Ollama setup
- `build_on_truenas.sh` - Automated Ollama setup for TrueNAS

#### 2. **Automated Control Suggestions (Pattern Matching)**

**Date**: November 27, 2025  
**Status**: ✅ Completed

**Description:**  
Implemented an intelligent control suggestion engine that provides automated recommendations for control implementations based on pattern matching, templates, and learning from existing controls.

**Features:**
- ✅ Pattern matching based on control families (AC, AU, IA, SC, SI, etc.)
- ✅ Template-based suggestions for common control types
- ✅ Learning from similar existing controls
- ✅ Confidence scoring for each suggestion
- ✅ Field-level application (apply individual fields or all at once)
- ✅ Reasoning display (explains why suggestions were made)

**Technical Details:**
- **Backend Engine**: `backend/controlSuggestionEngine.js`
- **API Endpoints**:
  - `POST /api/suggest-control` - Get suggestions for a single control
- **Frontend Component**: `frontend/src/components/ControlSuggestions.jsx`

**Files Created:**
- `backend/controlSuggestionEngine.js` - Core suggestion engine
- `frontend/src/components/ControlSuggestions.jsx` - UI component
- `frontend/src/components/ControlSuggestions.css` - Styling

**Files Modified:**
- `backend/server.js` - Added API endpoints
- `frontend/src/components/ControlItem.jsx` - Integrated suggestions
- `frontend/src/components/ControlItemCCM.jsx` - Integrated suggestions

#### 3. **FIPS 140-2 Compliant Password Hashing**

**Date**: November 27, 2025  
**Status**: ✅ Completed

**Description:**  
Implemented FIPS 140-2 compliant password hashing using PBKDF2 with SHA-256, replacing the previous SHA-256-only implementation.

**Technical Details:**
- **Algorithm**: PBKDF2 (FIPS-approved Key Derivation Function)
- **Hash Function**: SHA-256 (FIPS 180-4 approved)
- **Iterations**: 100,000 (meets FIPS recommendations)
- **Salt**: Random 16 bytes (128 bits) per password
- **Key Length**: 32 bytes (256 bits)
- **Storage Format**: `pbkdf2$sha256$iterations$salt$hash`

**Features:**
- ✅ FIPS 140-2 compliant password storage
- ✅ Automatic migration from legacy SHA-256 passwords
- ✅ Backward compatible with existing passwords
- ✅ Unique salt per password (resistant to rainbow table attacks)

**Files Modified:**
- `backend/auth/userManager.js` - PBKDF2 implementation
- `backend/auth/passwordGenerator.js` - Password generation utilities

#### 4. **Timestamp-Based Default Password Generation**

**Date**: November 27, 2025  
**Status**: ✅ Completed

**Description:**  
Default user passwords now use a timestamp-based format that includes build/startup time, replacing static passwords.

**Password Format:**
```
username#DDMMYYHH
```
Where:
- `DD` = Day (2 digits)
- `MM` = Month (2 digits)
- `YY` = Last 2 digits of year
- `HH` = Hour in 24-hour format (2 digits)

**Features:**
- ✅ Unique passwords based on build/startup timestamp
- ✅ Automatic password generation during setup/build
- ✅ Displayed in login UI for easy access
- ✅ Credentials file generated with all default passwords

**Files Modified:**
- `backend/auth/passwordGenerator.js` - New password generation utility
- `backend/auth/userManager.js` - Updated default user initialization
- `backend/server.js` - Added `/api/auth/default-credentials` endpoint
- `frontend/src/components/Login.jsx` - Display timestamp-based passwords
- `setup.sh` - Generate credentials file with timestamp passwords
- `Dockerfile` - Generate credentials during Docker build

#### 5. **Centralized Configuration Directory Structure**

**Date**: November 27, 2025  
**Status**: ✅ Completed

**Description:**  
Created a centralized `config/` directory structure to organize all configuration files for better security, encryption, and access control management.

**Directory Structure:**
```
config/
├── app/              # Application runtime configs (sensitive data)
│   ├── config.json   # Application settings (SSO, messaging, API gateways, Mistral)
│   └── users.json    # User accounts and authentication data
│
└── build/            # Build and deployment configs
    ├── docker-compose.yml   # Docker Compose configuration
    ├── truenas-app.yaml     # TrueNAS Docker App configuration
    └── Dockerfile            # Docker build instructions
```

**Features:**
- ✅ Centralized configuration management
- ✅ Separation of runtime and build configs
- ✅ Automatic migration from legacy locations
- ✅ Script integration for deployment
- ✅ Security-ready for encryption and access control

**Files Modified:**
- `backend/configManager.js` - Updated to use `config/app/config.json`
- `backend/auth/userManager.js` - Updated to use `config/app/users.json`
- `setup.sh` - Copies config files from `config/` to needed locations
- `Dockerfile` - Copies config files into Docker image

#### 6. **API Gateway Integration**

**Date**: November 14, 2025  
**Status**: ✅ Completed

**Description:**  
Implemented enterprise-grade API Gateway integration to remove all credential storage from the application.

**Features:**
- ✅ AWS API Gateway configuration in Settings
- ✅ Azure API Gateway configuration in Settings
- ✅ All API calls route through configured gateway
- ✅ No credentials stored in browser or application
- ✅ Authentication handled by cloud providers (IAM, Cognito, Azure AD)

**Files Modified:**
- `frontend/src/components/Settings.jsx` - New API Gateway UI
- `frontend/src/components/ControlItem.jsx` - Gateway routing logic
- `frontend/src/components/ControlItemCCM.jsx` - Gateway routing logic

#### 7. **API Data Fetch & History Feature**

**Date**: November 13, 2025  
**Status**: ✅ Completed

**Description:**  
Added ability to fetch real-time compliance data from APIs and maintain historical records.

**Features:**
- "Fetch Data" button for automated controls
- Stores up to 12 daily data entries
- Keeps most recent entry per day
- Displays timestamp and success/failure status
- Shows JSON response data
- Exports history in OSCAL, CCM, and PDF formats

**Files Modified:**
- `frontend/src/components/ControlItem.jsx` - Fetch functionality
- `frontend/src/components/ControlItemCCM.jsx` - CCM fetch functionality
- `backend/server.js` - Proxy endpoint for CORS handling
- `backend/ccmExport.js` - Export API history to Excel
- `backend/pdfExport.js` - Include history in PDF reports

---

## Future Enhancements

### Planned Features

#### 1. **Multi-Catalog Support**
- Support for multiple security frameworks simultaneously
- NIST 800-53, ISO 27001, CIS Controls, PCI-DSS, etc.
- Cross-framework mapping

#### 2. **Dashboard & Analytics**
- Control compliance dashboard
- Status visualization (charts, graphs)
- Risk heatmaps
- Compliance percentage by framework

#### 3. **Workflow & Approvals**
- Multi-user collaboration
- Approval workflows for control implementations
- Comment threads on controls
- Assignment and notifications

#### 4. **Advanced Reporting**
- Custom report templates
- Executive summaries
- Technical deep-dives
- Trend analysis over time

#### 5. **Integration Enhancements**
- JIRA integration for control tracking
- ServiceNow integration
- Slack/Teams notifications
- GitHub/GitLab for evidence artifacts

#### 6. **AI-Powered Features (Enhanced)**
- Automatic evidence analysis
- Risk assessment recommendations
- Compliance gap identification
- Multi-model support (beyond Mistral 7B)

#### 7. **Version Control**
- Track changes to control implementations
- Rollback capability
- Audit trail for all modifications
- Compare versions side-by-side

#### 8. **Mobile Support**
- Responsive design for tablets
- Mobile app for iOS/Android
- Offline capability
- Push notifications

#### 9. **Cryptographic Control Implementation**
- OSCAL Output Integrity Check
- Digital signatures for SSP documents
- Cryptographic verification

#### 10. **Multi-Report Comparison Enhancements**
- Establish links between controls in edit mode
- Track changes across multiple reports
- Visual diff highlighting

---

## Technical Debt & Improvements

### Performance Optimizations
- [ ] Implement lazy loading for large control lists
- [ ] Add caching for API responses
- [ ] Optimize PDF generation speed
- [ ] Database backend instead of localStorage
- [ ] Cache Mistral responses for similar controls

### Code Quality
- [ ] Add comprehensive unit tests
- [ ] Implement E2E testing with Playwright/Cypress
- [ ] Add TypeScript for type safety
- [ ] Improve error handling and validation

### Security Enhancements
- [ ] Add rate limiting for API calls
- [ ] Implement CSP headers
- [ ] Add input sanitization
- [ ] Security audit and penetration testing
- [ ] Encrypt config files at rest

### Documentation
- [ ] Add API documentation (Swagger/OpenAPI)
- [ ] Create video tutorials
- [ ] Add inline code documentation
- [ ] Create troubleshooting guide

---

## Version History

### Version 2.0.0 (December 2025)
- Mistral 7B AI integration for implementation text generation
- Enhanced control suggestions with AI
- Automated Ollama setup in deployment scripts
- Comprehensive TrueNAS deployment guide
- Consolidated documentation

### Version 1.0.0 (November 2025)
- Initial release with complete OSCAL SSP generation
- Support for multiple catalogs (ISM, Essential 8, etc.)
- Excel (CCM) import/export
- PDF report generation
- Real-time API data fetching
- API Gateway integration
- Three use case workflows
- FIPS 140-2 compliant password hashing
- Timestamp-based default passwords

---

## Contributing

### How to Suggest Enhancements

1. **Email**: mukesh.kesharwani@adobe.com
2. **Document Format**:
   ```
   Enhancement Title: [Brief description]
   Problem: [What problem does this solve?]
   Proposed Solution: [How would it work?]
   Benefits: [Why is this valuable?]
   Priority: [High/Medium/Low]
   ```

3. **Technical Requirements**:
   - Maintain OSCAL compliance
   - Follow existing code patterns
   - Include tests
   - Update documentation

---

## Deprecation Notices

### Deprecated Features

#### Credential Storage (Removed November 14, 2025)
- **Reason**: Security concerns with storing credentials in browser
- **Replacement**: API Gateway integration
- **Migration**: Configure API Gateway in Settings

#### Direct API Calls (Removed November 14, 2025)
- **Reason**: CORS issues and lack of centralized authentication
- **Replacement**: Backend proxy + API Gateway
- **Migration**: Automatic - no user action required

---

## AI Telemetry Logging (v1.2.7)

### Overview

All AI interactions are logged following **OpenTelemetry (OTel) Generative AI Semantic Conventions** for full observability, compliance, and debugging.

### Features

- **OTel Compliant**: Follows [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- **JSONL Format**: One JSON object per line for easy parsing
- **Automatic Rotation**: New log file created when size reaches 5MB
- **Detailed Metrics**: Tracks tokens, latency, prompts, responses, and errors
- **Security**: Admin-only access with RBAC permissions

### Log Storage

- **Location**: `logs/` directory in project root
- **Format**: `ai-telemetry-YYYY-MM-DD[-N].jsonl`
- **Rotation**: Automatic at 5MB file size
- **Retention**: Indefinite (manual cleanup via API)

### What's Logged

Each log entry contains:
- **Prompts**: All prompts sent to AI engines (Ollama, Mistral API, AWS Bedrock)
- **Responses**: AI-generated implementation text
- **Performance**: Latency (ms), token usage (input/output/total)
- **Context**: Control ID, family, user/session metadata
- **Errors**: Detailed error information for debugging

### Log Entry Structure

```json
{
  "timestamp": "2025-12-20T10:30:45.123Z",
  "trace_id": "trace-1234567890-abc123",
  "span_id": "span-xyz789",
  "resource": {
    "service.name": "oscal-report-generator",
    "service.version": "1.2.7",
    "deployment.environment": "production"
  },
  "attributes": {
    "gen_ai.system": "ollama",
    "gen_ai.request.model": "mistral:7b",
    "gen_ai.operation.name": "generate",
    "gen_ai.usage.input_tokens": 245,
    "gen_ai.usage.output_tokens": 156,
    "gen_ai.usage.total_tokens": 401,
    "gen_ai.response.latency_ms": 3245,
    "gen_ai.status": "success"
  },
  "events": [
    {
      "name": "gen_ai.content.prompt",
      "attributes": {
        "gen_ai.prompt": "Generate implementation...",
        "gen_ai.prompt.length": 980
      }
    },
    {
      "name": "gen_ai.content.completion",
      "attributes": {
        "gen_ai.completion": "The organization maintains...",
        "gen_ai.completion.length": 624
      }
    }
  ],
  "metadata": {
    "control_id": "AC-1",
    "control_family": "AC",
    "user_id": "admin",
    "session_id": "session-abc123"
  }
}
```

### API Endpoints

#### GET `/api/ai/logs/stats`
Returns log file statistics.

**Authentication**: Required + `VIEW_AI_LOGS` permission (Platform Admin)

**Response**:
```json
{
  "success": true,
  "totalFiles": 5,
  "totalSize": 15728640,
  "totalSizeFormatted": "15.00 MB",
  "files": [
    {
      "filename": "ai-telemetry-2025-12-20.jsonl",
      "size": 5242880,
      "sizeFormatted": "5.00 MB",
      "created": "2025-12-20T08:00:00.000Z",
      "modified": "2025-12-20T12:30:45.123Z"
    }
  ]
}
```

#### POST `/api/ai/logs/cleanup`
Deletes log files older than specified days.

**Authentication**: Required + `MANAGE_AI_LOGS` permission (Platform Admin)

**Request Body**:
```json
{
  "daysToKeep": 30
}
```

**Response**:
```json
{
  "success": true,
  "deletedCount": 3,
  "message": "Deleted 3 log files older than 30 days"
}
```

### Log Analysis

```bash
# Count total interactions
wc -l logs/ai-telemetry-*.jsonl

# Get average latency
cat logs/ai-telemetry-*.jsonl | \
  jq -r '.attributes["gen_ai.response.latency_ms"]' | \
  awk '{sum+=$1; count++} END {print sum/count " ms"}'

# Count by provider
cat logs/ai-telemetry-*.jsonl | \
  jq -r '.attributes["gen_ai.system"]' | \
  sort | uniq -c

# Find errors
cat logs/ai-telemetry-*.jsonl | \
  jq 'select(.attributes["gen_ai.status"] == "error")'
```

### Security Considerations

⚠️ **Log files contain**:
- AI prompts (may include sensitive control information)
- AI responses (implementation details)
- User/session metadata

**Recommendations**:
1. Restrict file system access to `logs/` directory
2. Implement log encryption if required by compliance
3. Regularly audit log access
4. Configure automated cleanup for old logs
5. Exclude logs from backups if they contain sensitive data

---

## Known Issues

### Current Limitations

1. **Browser Storage Limits**
   - Large SSPs (>5MB) may hit localStorage limits
   - **Workaround**: Export to JSON and re-import as needed
   - **Future Fix**: Backend database planned

2. **PDF Generation Speed**
   - Large reports (500+ controls) may take 10-15 seconds
   - **Workaround**: Use CCM Excel export for faster processing
   - **Future Fix**: Background job processing

3. **API Gateway URL Format**
   - Gateway must accept `?targetUrl=` query parameter
   - **Workaround**: Configure gateway to forward query params
   - **Future Fix**: Support multiple gateway formats

4. **Mistral Model Loading**
   - First request after Ollama restart may be slower (model loading)
   - **Workaround**: Keep Ollama running continuously
   - **Future Fix**: Model pre-loading on startup

---

## Acknowledgments

### Key Contributors
- **Mukesh Kesharwani** - Lead Developer & Architect
- **Adobe** - Organizational Support

### Technologies Used
- **Frontend**: React, Vite
- **Backend**: Node.js, Express
- **PDF Generation**: PDFKit
- **Excel**: ExcelJS
- **OSCAL**: NIST SP 800-53
- **AI**: Mistral 7B, Ollama

---

**For questions or enhancement requests:**  
📧 mukesh.kesharwani@adobe.com  
🏢 Adobe

**Last Updated**: December 2025
