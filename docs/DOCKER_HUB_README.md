# 🛡️ OSCAL Report Generator

**A comprehensive web application for generating compliance documentation from OSCAL catalogs**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/keekar2022/OSCAL-Reports/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/keekar/oscal_reports)](https://hub.docker.com/r/keekar/oscal_reports)

---

## 🚀 Quick Start

### Pull and Run

```bash
# Pull the latest stable version
docker pull keekar/oscal_reports:latest

# Run the container
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  keekar/oscal_reports:latest

# Access the application
# Open your browser to http://localhost:3020
```

### With Persistent Configuration

```bash
# Create a config directory
mkdir -p ./config

# Run with volume mount for configuration persistence
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  keekar/oscal_reports:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  oscal-app:
    image: keekar/oscal_reports:latest
    container_name: oscal-app
    ports:
      - "3020:3020"
    volumes:
      - ./config:/app/config
    environment:
      - NODE_ENV=production
      - PORT=3020
    restart: unless-stopped
```

Then run:

```bash
docker-compose up -d
```

---

## 🏷️ Available Tags

| Tag | Description | Use Case |
|-----|-------------|----------|
| `latest` | Latest stable release from `main` branch | Production deployments |
| `edge` | Latest development build from `Development` branch | Testing new features |
| `v{version}` | Specific version (e.g., `v1.5.0`) | Version pinning |

### Examples

```bash
# Stable production release
docker pull keekar/oscal_reports:latest

# Latest development build
docker pull keekar/oscal_reports:edge

# Specific version
docker pull keekar/oscal_reports:v1.5.0
```

---

## 📋 Features

- ✨ **Automated Control Suggestions**: AI-powered recommendations for control implementations
- 📊 **AI Telemetry Logging**: OpenTelemetry-compliant logging of all AI interactions
- 📚 **Multiple Frameworks**: NIST SP 800-53, Australian ISM, Singapore IM8
- 📈 **Multiple Export Formats**: OSCAL JSON, Excel, PDF, and CCM
- 🔄 **Smart Catalog Updates**: Automatically detect new/changed controls
- 💾 **Data Persistence**: Browser-based local storage for multi-session work
- ⚡ **Auto-save**: Automatic progress saving
- 🎨 **Modern UI**: Intuitive, responsive interface

---

## 🔐 Default Credentials

The Docker image generates default credentials based on the build timestamp.

### Format

```
Username: [role]
Password: [role]#DDMMYYHH
```

Where:
- `DD` = Day of build (UTC)
- `MM` = Month of build (UTC)
- `YY` = Year (last 2 digits)
- `HH` = Hour of build (UTC)

### Default Roles

- **admin**: Platform administrator
- **user**: Standard user
- **assessor**: Assessor role

### Extracting Credentials

```bash
# Run a temporary container to extract credentials
docker create --name temp-oscal keekar/oscal_reports:latest
docker cp temp-oscal:/app/credentials.txt ./credentials.txt
docker rm temp-oscal

# View credentials
cat credentials.txt
```

⚠️ **IMPORTANT**: Change default passwords immediately after first login for security!

---

## 🌐 Port Configuration

The application runs on **port 3020** by default inside the container.

### Custom Port Mapping

```bash
# Map to different host port (e.g., 8080)
docker run -d \
  --name oscal-app \
  -p 8080:3020 \
  keekar/oscal_reports:latest

# Access at http://localhost:8080
```

---

## 💾 Volume Mounts

### Configuration Directory

Mount `/app/config` to persist user data and configuration:

```bash
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  keekar/oscal_reports:latest
```

### What Gets Persisted

- User credentials and authentication data
- Application settings
- User preferences
- Session data

---

## 🏥 Health Check

The image includes a built-in health check that monitors the `/health` endpoint.

### Check Container Health

```bash
# View health status
docker ps --filter name=oscal-app --format "table {{.Names}}\t{{.Status}}"

# Manual health check
curl http://localhost:3020/health
```

### Expected Response

```json
{
  "status": "healthy",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "uptime": 3600
}
```

---

## 🖥️ Multi-Platform Support

This image supports multiple architectures:

- ✅ **linux/amd64** - Intel/AMD 64-bit processors
- ✅ **linux/arm64** - ARM 64-bit processors (Apple Silicon, ARM servers)

Docker automatically pulls the correct image for your platform.

### Force Specific Platform

```bash
# Force AMD64 (Intel/AMD)
docker pull --platform linux/amd64 keekar/oscal_reports:latest

# Force ARM64 (Apple Silicon)
docker pull --platform linux/arm64 keekar/oscal_reports:latest
```

---

## 🔍 Verifying the Image

### Inspect Image Details

```bash
# View image metadata
docker inspect keekar/oscal_reports:latest

# Check image size
docker images keekar/oscal_reports

# View image history/layers
docker history keekar/oscal_reports:latest
```

### View Container Logs

```bash
# View real-time logs
docker logs -f oscal-app

# View last 100 lines
docker logs --tail 100 oscal-app
```

---

## 🛠️ Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker logs oscal-app

# Check if port is already in use
lsof -i :3020  # On macOS/Linux
netstat -ano | findstr :3020  # On Windows

# Try a different port
docker run -d --name oscal-app -p 8080:3020 keekar/oscal_reports:latest
```

### Cannot Access Application

1. **Check container is running**:
   ```bash
   docker ps | grep oscal-app
   ```

2. **Verify port mapping**:
   ```bash
   docker port oscal-app
   ```

3. **Test health endpoint**:
   ```bash
   curl http://localhost:3020/health
   ```

4. **Check firewall rules** (may block port 3020)

### Exec Format Error

This usually means wrong architecture. Force the correct platform:

```bash
# For Apple Silicon Macs
docker pull --platform linux/arm64 keekar/oscal_reports:latest

# For Intel/AMD systems
docker pull --platform linux/amd64 keekar/oscal_reports:latest
```

---

## 📚 Documentation

- **GitHub Repository**: https://github.com/keekar2022/OSCAL-Reports
- **Full Documentation**: https://github.com/keekar2022/OSCAL-Reports/tree/main/docs
- **Issue Tracker**: https://github.com/keekar2022/OSCAL-Reports/issues

---

## 🔄 Updating

### Update to Latest Version

```bash
# Pull the latest image
docker pull keekar/oscal_reports:latest

# Stop and remove old container
docker stop oscal-app
docker rm oscal-app

# Start new container with same configuration
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  keekar/oscal_reports:latest
```

### Using Docker Compose

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d
```

---

## 🌟 Example Workflows

### Development Testing

```bash
# Pull edge build for testing latest features
docker pull keekar/oscal_reports:edge

# Run on different port to avoid conflicts
docker run -d \
  --name oscal-dev \
  -p 3021:3020 \
  keekar/oscal_reports:edge
```

### Production Deployment

```bash
# Pin to specific version for stability
docker pull keekar/oscal_reports:v1.5.0

# Run with restart policy and resource limits
docker run -d \
  --name oscal-prod \
  -p 3020:3020 \
  -v /opt/oscal/config:/app/config \
  --restart unless-stopped \
  --memory="1g" \
  --cpus="1.0" \
  keekar/oscal_reports:v1.5.0
```

---

## 🤝 Contributing

Contributions are welcome! Please visit the [GitHub repository](https://github.com/keekar2022/OSCAL-Reports) to:

- Report bugs or issues
- Submit feature requests
- Contribute code via pull requests
- Improve documentation

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0).

See [LICENSE](https://github.com/keekar2022/OSCAL-Reports/blob/main/LICENSE) for details.

---

## 👤 Author

**Mukesh Kesharwani**

- Email: mukesh.kesharwani@adobe.com
- GitHub: [@keekar2022](https://github.com/keekar2022)

---

## 🆘 Support

Need help? Here are your options:

1. **Documentation**: Check the [full docs](https://github.com/keekar2022/OSCAL-Reports/tree/main/docs)
2. **Issues**: Open an [issue on GitHub](https://github.com/keekar2022/OSCAL-Reports/issues)
3. **Discussions**: Join [GitHub Discussions](https://github.com/keekar2022/OSCAL-Reports/discussions)

---

## 📊 Image Build Information

- **Base Image**: node:20-alpine
- **Build Process**: Multi-stage build for optimized size
- **Platforms**: linux/amd64, linux/arm64
- **CI/CD**: Automated builds via GitHub Actions
- **Registry**: Docker Hub (public)

---

## ⭐ Star the Project

If you find this tool useful, please consider [starring the repository](https://github.com/keekar2022/OSCAL-Reports) on GitHub!

---

**Last Updated**: January 2026
**Image Version**: 1.5.0
