# 🐳 Docker Hub Publishing - Setup Checklist

This checklist will guide you through enabling automated Docker image publishing to Docker Hub.

## ✅ Setup Checklist

### Phase 1: Docker Hub Preparation

- [ ] **1.1** Log in to Docker Hub at https://hub.docker.com/ (username: `keekar`)

- [ ] **1.2** Create a new repository (if not exists):
  - Repository name: `oscal_reports`
  - Visibility: **Public**
  - Description: "OSCAL SOA/SSP/CCM Generator - Compliance documentation tool"

- [ ] **1.3** Generate Docker Hub access token:
  - Go to Account Settings → Security → Access Tokens
  - Click "New Access Token"
  - Description: `OSCAL_GitHub_Actions`
  - Permissions: **Read, Write, Delete**
  - Click "Generate" and **copy the token immediately**

### Phase 2: GitHub Secrets Configuration

- [ ] **2.1** Navigate to GitHub repository settings:
  - Go to: Settings → Secrets and variables → Actions

- [ ] **2.2** Add `DOCKERHUB_USERNAME` secret:
  - Click "New repository secret"
  - Name: `DOCKERHUB_USERNAME`
  - Value: `keekar`
  - Click "Add secret"

- [ ] **2.3** Add `DOCKERHUB_TOKEN` secret:
  - Click "New repository secret"
  - Name: `DOCKERHUB_TOKEN`
  - Value: Paste the access token from step 1.3
  - Click "Add secret"

- [ ] **2.4** Verify both secrets are added:
  - You should see: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` in the secrets list

### Phase 3: Workflow Files (Already Done!)

- [x] **3.1** Updated `.github/workflows/ci-cd.yml` with Docker Hub publishing
- [x] **3.2** Added Docker metadata action for proper tagging
- [x] **3.3** Configured multi-registry push (GHCR + Docker Hub)
- [x] **3.4** Added multi-platform build support (amd64, arm64)

### Phase 4: Documentation (Already Done!)

- [x] **4.1** Created `docs/DOCKER_HUB_SETUP.md` (comprehensive guide)
- [x] **4.2** Created `.github/DOCKER_HUB_SECRETS_SETUP.md` (step-by-step secrets setup)
- [x] **4.3** Created `DOCKER_HUB_README.md` (for Docker Hub description)
- [x] **4.4** Updated main `README.md` with Docker quick start
- [x] **4.5** Updated `docker-compose.yml` to use Docker Hub image by default

### Phase 5: Testing

- [ ] **5.1** Test with Development branch (creates `edge` tag):
  ```bash
  git checkout Development
  git pull origin Development
  git commit --allow-empty -m "Test: Docker Hub publishing"
  git push origin Development
  ```

- [ ] **5.2** Monitor workflow in GitHub Actions:
  - Go to: Actions tab → Latest workflow run
  - Check "Build and Push Docker Image" job
  - Verify "Log in to Docker Hub" step succeeds
  - Verify image is pushed to both registries

- [ ] **5.3** Verify on Docker Hub:
  - Go to: https://hub.docker.com/r/keekar/oscal_reports/tags
  - Should see `edge` tag (from Development branch)

- [ ] **5.4** Test pulling the image:
  ```bash
  docker pull keekar/oscal_reports:edge
  docker run -d --name test-oscal -p 3020:3020 keekar/oscal_reports:edge
  curl http://localhost:3020/health
  docker stop test-oscal && docker rm test-oscal
  ```

- [ ] **5.5** Test with main branch (creates `latest` tag):
  ```bash
  git checkout main
  git pull origin main
  git commit --allow-empty -m "Test: Docker Hub publishing"
  git push origin main
  ```

- [ ] **5.6** Verify `latest` tag on Docker Hub:
  - Go to: https://hub.docker.com/r/keekar/oscal_reports/tags
  - Should see `latest` tag (from main branch)

### Phase 6: Docker Hub Page Configuration

- [ ] **6.1** Update Docker Hub repository description:
  - Go to: https://hub.docker.com/r/keekar/oscal_reports
  - Click "Edit"
  - Copy content from `DOCKER_HUB_README.md`
  - Paste into "Full description"
  - Save changes

- [ ] **6.2** Add repository links:
  - Source repository: `https://github.com/keekar2022/OSCAL-Reports`
  - Website/Documentation: `https://github.com/keekar2022/OSCAL-Reports/tree/main/docs`

- [ ] **6.3** Add repository topics/tags:
  - `oscal`
  - `compliance`
  - `security`
  - `ssp`
  - `soa`
  - `ccm`
  - `nist`

### Phase 7: Verification & Validation

- [ ] **7.1** Verify multi-platform images:
  ```bash
  docker manifest inspect keekar/oscal_reports:latest
  # Should show both linux/amd64 and linux/arm64
  ```

- [ ] **7.2** Test image on different platforms (if available):
  - [ ] Test on Intel/AMD (linux/amd64)
  - [ ] Test on ARM (linux/arm64, e.g., Apple Silicon)

- [ ] **7.3** Verify image size is reasonable:
  ```bash
  docker images keekar/oscal_reports
  # Should be < 500MB
  ```

- [ ] **7.4** Verify credentials extraction works:
  ```bash
  docker create --name temp-oscal keekar/oscal_reports:latest
  docker cp temp-oscal:/app/credentials.txt ./credentials.txt
  cat credentials.txt
  docker rm temp-oscal
  ```

- [ ] **7.5** Verify Docker Hub badges work:
  - Check README.md badges display correctly
  - Verify Docker Hub shields.io badges work

### Phase 8: Documentation & Communication

- [ ] **8.1** Update CHANGELOG.md with Docker Hub publishing feature

- [ ] **8.2** Announce Docker Hub availability:
  - Update project README
  - Notify team/users
  - Update any external documentation

- [ ] **8.3** Share Docker Hub repository link:
  - https://hub.docker.com/r/keekar/oscal_reports

### Phase 9: Maintenance & Security

- [ ] **9.1** Set calendar reminder to rotate Docker Hub token (every 90 days)

- [ ] **9.2** Enable 2FA on Docker Hub account (if not already enabled)

- [ ] **9.3** Monitor Docker Hub pull statistics regularly

- [ ] **9.4** Set up alerts for workflow failures (optional):
  - GitHub Actions → Repository → Settings → Notifications

- [ ] **9.5** Review and cleanup old Docker Hub tags periodically:
  - Keep last 10 versions
  - Keep all `latest` and `edge` tags
  - Delete old development tags

## 📋 Quick Reference

### Docker Hub URLs

- **Repository**: https://hub.docker.com/r/keekar/oscal_reports
- **Tags**: https://hub.docker.com/r/keekar/oscal_reports/tags

### GitHub URLs

- **Repository**: https://github.com/keekar2022/OSCAL-Reports
- **Actions**: https://github.com/keekar2022/OSCAL-Reports/actions
- **Secrets**: https://github.com/keekar2022/OSCAL-Reports/settings/secrets/actions

### Pull Commands

```bash
# Latest stable
docker pull keekar/oscal_reports:latest

# Latest development
docker pull keekar/oscal_reports:edge

# Specific version
docker pull keekar/oscal_reports:v1.5.0
```

### Run Commands

```bash
# Simple run
docker run -d --name oscal-app -p 3020:3020 keekar/oscal_reports:latest

# With config volume
docker run -d --name oscal-app -p 3020:3020 -v $(pwd)/config:/app/config keekar/oscal_reports:latest

# Docker Compose
docker-compose up -d
```

## 🆘 Troubleshooting

### Issue: Secrets not working

**Solution**: Verify secret names are exactly:
- `DOCKERHUB_USERNAME` (case-sensitive)
- `DOCKERHUB_TOKEN` (case-sensitive)

### Issue: Authentication failed

**Solution**:
1. Regenerate Docker Hub access token
2. Update `DOCKERHUB_TOKEN` secret in GitHub
3. Ensure token has "Write" permissions

### Issue: Image not appearing on Docker Hub

**Solution**:
1. Check workflow succeeded in GitHub Actions
2. Verify branch is `main` or `Development`
3. Check Docker Hub repository name is correct: `keekar/oscal_reports`

### Issue: Wrong architecture

**Solution**:
```bash
# Force correct platform
docker pull --platform linux/amd64 keekar/oscal_reports:latest
# or
docker pull --platform linux/arm64 keekar/oscal_reports:latest
```

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `docs/DOCKER_HUB_SETUP.md` | Comprehensive Docker Hub setup guide |
| `.github/DOCKER_HUB_SECRETS_SETUP.md` | Step-by-step GitHub secrets configuration |
| `DOCKER_HUB_README.md` | Docker Hub repository description |
| `DOCKER_HUB_SETUP_CHECKLIST.md` | This checklist file |
| `.github/workflows/ci-cd.yml` | CI/CD workflow with Docker Hub publishing |

## ✨ What's Changed

### Workflow Enhancements

1. ✅ Added Docker Hub login step
2. ✅ Configured multi-registry publishing (GHCR + Docker Hub)
3. ✅ Implemented proper tagging strategy:
   - `latest` for main branch
   - `edge` for Development branch
   - `v{version}` for all builds
4. ✅ Added multi-platform build (linux/amd64, linux/arm64)
5. ✅ Updated deployment instructions to include Docker Hub

### Benefits

- 🚀 **Faster deployment**: Users can pull pre-built images
- 🌍 **Public access**: Anyone can use `docker pull keekar/oscal_reports:latest`
- 💪 **Multi-platform**: Works on Intel, AMD, and ARM processors
- 🔄 **Automatic**: Builds and publishes on every push to main/Development
- 📦 **No build needed**: End users don't need to build from source

## 🎉 Success Criteria

You're done when:

- [ ] Docker Hub secrets are configured in GitHub
- [ ] Workflow runs successfully on push to Development
- [ ] Image appears on https://hub.docker.com/r/keekar/oscal_reports
- [ ] You can run: `docker pull keekar/oscal_reports:edge`
- [ ] Application starts and is accessible at http://localhost:3020
- [ ] Health check returns success: `curl http://localhost:3020/health`

## 📞 Support

If you need help:

1. Review documentation in `docs/DOCKER_HUB_SETUP.md`
2. Check GitHub Actions workflow logs
3. Verify Docker Hub account and token are valid
4. Test Docker Hub login locally:
   ```bash
   echo "$TOKEN" | docker login -u keekar --password-stdin
   ```

---

**Last Updated**: January 2026
**Author**: Mukesh Kesharwani

---

## Next Steps After Completion

Once everything is working:

1. ✅ Update project documentation
2. ✅ Announce availability to users
3. ✅ Add Docker Hub badge to README
4. ✅ Test pulling and running the image
5. ✅ Share Docker Hub repository link
6. ✅ Set up token rotation reminder (90 days)

🎉 **Congratulations!** Your Docker images are now automatically published to Docker Hub!
