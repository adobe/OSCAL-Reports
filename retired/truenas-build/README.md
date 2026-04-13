# Retired: TrueNAS Build Assets

**Status:** Retired (moved from root/docs/scripts so they are not mixed with core solution files).

**Contents:**

| File | Original location | Purpose |
|------|-------------------|---------|
| `build_on_truenas.sh` | repo root | Automated build & Blue-Green deploy on TrueNAS |
| `TRUENAS.md` | docs/ | TrueNAS SCALE installation and quick reference |
| `create-truenas-catalog.sh` | scripts/ | TrueNAS SCALE app catalog creation |
| `truenas-app.yaml` | repo root | TrueNAS Docker/Compose app configuration |
| `config-build/` | was `config/build/` | Duplicate Dockerfile + compose + truenas-app (not used by CI) |

**Lifecycle:** These files can be **deleted after 6 months** once the project is fully functional and stable. Until then they remain here for reference or one-off TrueNAS use.

**Core solution:** For deployment, use the main docs and scripts in `docs/` and `scripts/` (e.g. [DEPLOYMENT.md](../../docs/DEPLOYMENT.md), [DOCKER_HUB_GUIDE.md](../../docs/DOCKER_HUB_GUIDE.md), [install_from_dockerhub.sh](../../scripts/install_from_dockerhub.sh)). TrueNAS can still run the app via Docker Hub image and Custom App (see DEPLOYMENT.md).

**Retired:** March 2026 · **Project version:** 1.7.12
