# Former `config/build/` (retired)

These files were copied from **`config/build/`** before that folder was removed. They are **not used** by the core build path:

| File | Purpose |
|------|---------|
| `Dockerfile` | Alternate Dockerfile (uses `npm ci`; root `./Dockerfile` is canonical for CI/publish) |
| `docker-compose.yml` | Compose with Ollama + TrueNAS labels; use root `docker-compose.yml` for current stack |
| `truenas-app.yaml` | Older TrueNAS app snippet; canonical retired copy is `../truenas-app.yaml` |

**Canonical today:** root **`Dockerfile`**, root **`docker-compose.yml`**, `.github/workflows/docker-publish.yml` → `file: ./Dockerfile`.

You can delete this folder with the rest of `retired/truenas-build/` after ~6 months if stable.
