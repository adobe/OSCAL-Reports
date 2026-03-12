# BSI Catalogue Integration

**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)  
**Organization**: Adobe  
**Version**: 1.0.0  
**Last Updated**: February 2026  
**Status**: Planned for Release v1.7.0

---

## Table of Contents

1. [Overview](#overview)
2. [BSI Background](#bsi-background)
3. [Available Catalogues](#available-catalogues)
4. [Technical Integration](#technical-integration)
5. [Usage Guide](#usage-guide)
6. [Language Considerations](#language-considerations)
7. [AI Integration](#ai-integration)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [References](#references)

---

## Overview

The OSCAL Report Generator now supports German IT security standards from the **BSI (Bundesamt für Sicherheit in der Informationstechnik)** - the German Federal Office for Information Security. This integration adds Grundschutz++ catalogues to the existing international framework support (NIST, Australian ISM, Canadian CCCS, Singapore IM8).

### Key Features

- ✅ **OSCAL-compliant**: BSI catalogues use standard OSCAL JSON format
- ✅ **Direct integration**: No backend modifications required
- ✅ **German IT security standards**: Comprehensive IT-Grundschutz framework
- ✅ **License compatible**: CC BY-SA 4.0 (compatible with GPL-3.0-or-later)

---

## BSI Background

### What is BSI?

The **Bundesamt für Sicherheit in der Informationstechnik (BSI)** is Germany's federal cyber security authority. BSI develops and maintains IT security standards that are widely used across German government, critical infrastructure, and private organizations.

### IT-Grundschutz and Grundschutz++

**IT-Grundschutz** (IT Baseline Protection) is BSI's comprehensive methodology for IT security management. It provides:

- Security controls for information systems
- Implementation guidance and best practices
- Risk assessment methodologies
- Certification frameworks

**Grundschutz++** is the modernized version of IT-Grundschutz, designed for contemporary IT environments including cloud computing, DevOps, and agile development.

### Stand-der-Technik-Bibliothek

BSI maintains the **Stand-der-Technik-Bibliothek** (State-of-the-Art Library) GitHub repository, which provides German security standards in **OSCAL format** for machine-readable compliance automation.

**Repository**: [github.com/BSI-Bund/Stand-der-Technik-Bibliothek](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek)  
**License**: CC BY-SA 4.0  
**Format**: OSCAL JSON (same as NIST SP 800-53)

---

## Available Catalogues

### Production-Ready Catalogues (Anwenderkataloge)

These catalogues are located in the `/Anwenderkataloge/` folder and are intended for production use.

#### 1. Grundschutz++ Kompendium

**Catalogue Name**: Grundschutz++ Catalog  
**URL**: `https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json`  
**Description**: Modern IT security baseline for contemporary infrastructure  
**Language**: German  
**Classification**: Standard  
**Publisher**: BSI

**Use Cases**:
- Cloud security compliance
- Modern IT infrastructure protection
- DevOps and agile security
- Digital transformation projects

### Catalogue Types

BSI provides two types of catalogues:

1. **Anwenderkataloge** (Application Catalogues) - ✅ **Use these**
   - Production-ready
   - Intended for direct implementation
   - Quality-assured and stable
   
2. **Quellkataloge** (Source Catalogues) - ⚠️ **Not recommended**
   - Development versions
   - For BSI staff and contributors
   - May contain work-in-progress content

---

## Technical Integration

### OSCAL Compatibility

BSI catalogues use **OSCAL 1.x format**, identical to NIST SP 800-53, Australian ISM, and other supported frameworks. This means:

- ✅ No backend code changes required
- ✅ Existing OSCAL parser handles BSI catalogues
- ✅ Standard validation applies
- ✅ All export formats work (JSON, Excel, PDF, CCM)

### Backend Processing

The existing infrastructure handles BSI catalogues automatically:

**Endpoint**: `POST /api/fetch-catalogue`  
**Validator**: `backend/oscalValidator.js`  
**Parser**: Recursive control extraction (same as other catalogues)

### Security Validation

BSI GitHub URLs pass existing security checks:

- **URL Validator**: `backend/utils/urlValidator.js`
- **SSRF Protection**: Public HTTPS URLs allowed
- **GitHub Raw Content**: Whitelisted domain

### Frontend Integration

BSI catalogues are added to the `SAMPLE_CATALOGUES` array in `frontend/src/components/CatalogueInput.jsx`:

```javascript
{
  name: 'BSI Grundschutz++ (Kompendium) 🇩🇪',
  url: 'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json',
  description: 'German IT Security Standards - Grundschutz++ Baseline',
  classification: 'standard',
  publisher: 'BSI'
}
```

---

## Usage Guide

### Loading a BSI Catalogue

1. **Start New Report** or **Load Existing Report**
2. **Select BSI Catalogue** from the dropdown:
   - "BSI Grundschutz++ (Kompendium) 🇩🇪"
3. **Load Catalogue** - The system fetches and parses the OSCAL JSON
4. **Document Controls** - Fill in implementation details (in German or English)
5. **Export** - Generate SSP in OSCAL JSON, Excel, or PDF format

### Working with German Controls

BSI controls are documented in **German language**. When implementing controls:

- **Control IDs**: Alphanumeric (e.g., `APP.1.1.A1`, `SYS.1.2.2.A15`)
- **Control Titles**: German (e.g., "Festlegung einer Sicherheitsrichtlinie")
- **Control Descriptions**: German technical text
- **Implementation Guidance**: German or English acceptable

### Example Control

```json
{
  "id": "APP.1.1.A1",
  "title": "Festlegung einer Sicherheitsrichtlinie für Webanwendungen",
  "description": "Es MUSS eine Sicherheitsrichtlinie für Webanwendungen erstellt werden..."
}
```

**Implementation Tips**:
- You can document implementations in English or German
- Use technical terminology consistently
- Reference BSI IT-Grundschutz Kompendium for guidance
- Include evidence documents in either language

### Export Formats

All export formats support German text:

- **OSCAL JSON**: Native UTF-8 support
- **Excel**: Unicode-compatible (German characters preserved)
- **PDF**: UTF-8 encoding (umlauts and special characters render correctly)
- **CCM**: Full Unicode support

---

## Language Considerations

### Control Language: German

BSI catalogues contain controls in **German language**. This is intentional and reflects BSI's primary user base in German-speaking countries.

### Implementation Language: Flexible

You can document control implementations in:

- **German**: For German organizations and teams
- **English**: For international teams or mixed environments
- **Bilingual**: Include both languages for maximum accessibility

### UI Language Indicator

BSI catalogues are marked with 🇩🇪 (German flag) in the catalogue selection UI to indicate German-language content.

### Translation Resources

For German-to-English translation of control terms:

- **BSI Glossary**: [BSI IT-Grundschutz Glossary](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/IT-Grundschutz-Kompendium/Glossar/glossar_node.html)
- **Machine Translation**: Use Google Translate or DeepL for technical accuracy
- **Community**: EuroSCAL community may provide English translations

### Common German Security Terms

| German | English |
|--------|---------|
| Sicherheitsrichtlinie | Security Policy |
| Anforderung | Requirement |
| Maßnahme | Measure/Control |
| Baustein | Module/Building Block |
| Gefährdung | Threat |
| Schutzbedarf | Protection Need |
| Informationsverbund | Information Domain |

---

## AI Integration

### AI Suggestions with German Controls

The AI-powered control suggestion engine (Mistral 7B) supports German controls with considerations:

#### Mistral AI Support

**Mistral 7B** is a multilingual model that supports German:

- ✅ Can understand German control descriptions
- ✅ Can generate German implementation text
- ✅ Can provide bilingual suggestions

#### Configuration

No special configuration needed. The AI automatically detects German text and responds appropriately.

**Example Prompt** (internal):
```
Control: APP.1.1.A1 - Festlegung einer Sicherheitsrichtlinie für Webanwendungen
Description: Es MUSS eine Sicherheitsrichtlinie für Webanwendungen erstellt werden...

Generate professional implementation text for this German IT security control.
```

#### Suggestion Quality

- **German Controls**: AI provides relevant suggestions in English or German
- **Technical Accuracy**: Mistral 7B understands cybersecurity terminology in German
- **Fallback**: Pattern matching works regardless of language

#### Best Practices

1. **Review AI Suggestions**: German controls may benefit from manual review
2. **Language Consistency**: Decide on German or English for implementations
3. **Technical Terms**: Keep technical terms in original language when appropriate

---

## Testing

Testing procedures for BSI Grundschutz++ integration (catalogue load, OSCAL validation, German character rendering, exports, AI suggestions, cross-catalogue compatibility) are in **[QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md)** — see **Part 3: BSI Catalogue Integration Testing**. Use that section for pre-test checklist, test scenarios, expected results, troubleshooting, and the BSI test report template.

---

## Troubleshooting

### Catalogue Won't Load

**Problem**: "Failed to fetch BSI catalogue"

**Solutions**:
1. Check internet connection
2. Verify GitHub is accessible (not blocked by firewall)
3. Try loading catalogue manually: [BSI Catalogue URL](https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json)
4. Check OSCAL validation errors in browser console

### German Characters Not Displaying

**Problem**: Umlauts (ä, ö, ü) or ß showing as �

**Solutions**:
1. Ensure browser encoding is UTF-8
2. Check PDF export settings (UTF-8 enabled by default)
3. Verify Excel export uses Unicode encoding
4. Update browser to latest version

### AI Suggestions Not Relevant

**Problem**: AI suggestions don't match German control context

**Solutions**:
1. Use pattern matching fallback (already built-in)
2. Manually edit implementation text
3. Reference BSI IT-Grundschutz Kompendium for guidance
4. Consider bilingual implementation (German control + English implementation)

### Catalogue URL Changed

**Problem**: BSI repository structure changed

**Solutions**:
1. Check BSI repository for updated URLs: [BSI Repository](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek)
2. Update `SAMPLE_CATALOGUES` in `CatalogueInput.jsx`
3. Use custom URL input to load updated catalogue
4. Report issue to development team

---

## References

### BSI Resources

- **BSI Website**: [https://www.bsi.bund.de](https://www.bsi.bund.de)
- **IT-Grundschutz**: [https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/it-grundschutz_node.html](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/it-grundschutz_node.html)
- **Stand-der-Technik-Bibliothek**: [https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek)
- **OSCAL Documentation**: [https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek/blob/main/Dokumentation/OSCAL.md](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek/blob/main/Dokumentation/OSCAL.md)

### Contact

- **BSI OSCAL Team**: stand-der-technik@bsi.bund.de
- **EuroSCAL Community**: [https://euroscal.eu/](https://euroscal.eu/)

### Related Standards

- **ISO/IEC 27001**: International information security standard
- **NIST SP 800-53**: US federal security controls (similar structure)
- **C5 (Cloud Computing Compliance Criteria Catalogue)**: BSI cloud security standard

---

## Version History

### Version 1.0.0 (February 2026)
- Initial BSI integration documentation
- Grundschutz++ catalogue support
- German language control guidance
- AI integration notes

---

## Future Enhancements

### Planned for Version 1.8.0

1. **Additional BSI Catalogues**
   - IT-Grundschutz traditional catalogue
   - BSI C5 cloud security controls
   - Sector-specific BSI modules

2. **Enhanced Language Support**
   - German UI translation
   - Bilingual control display (German + English)
   - Translation memory for common terms

3. **Cross-Framework Mapping**
   - Map BSI controls ↔ NIST SP 800-53
   - Map BSI controls ↔ ISO 27001
   - Show control equivalencies in UI

4. **BSI-Specific Features**
   - Grundschutz module grouping
   - BSI assessment methodology templates
   - IT-Grundschutz certification report formats

---

**For questions or suggestions about BSI integration:**  
📧 mukesh.kesharwani@adobe.com  
🏢 Adobe  
🇩🇪 BSI Support: stand-der-technik@bsi.bund.de

**Last Updated**: February 2026
