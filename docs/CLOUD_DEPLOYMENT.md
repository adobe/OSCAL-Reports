# ☁️ Cloud Deployment Guide

**OSCAL Report Generator - Cloud Platform Deployment**

This guide explains how to deploy the OSCAL Report Generator to various cloud platforms instead of TrueNAS.

---

## 📋 Table of Contents

1. [Azure Web App](#azure-web-app)
2. [AWS ECS (Elastic Container Service)](#aws-ecs)
3. [AWS EKS (Elastic Kubernetes Service)](#aws-eks)
4. [Google Cloud Run](#google-cloud-run)
5. [Heroku](#heroku)
6. [DigitalOcean App Platform](#digitalocean-app-platform)
7. [Comparison Table](#comparison-table)

---

## Azure Web App

### Prerequisites

- Azure account
- Azure CLI installed locally
- GitHub repository access

### Setup Steps

#### 1. Create Azure Resources

```bash
# Login to Azure
az login

# Create resource group
az group create --name oscal-rg --location eastus

# Create App Service plan
az appservice plan create \
  --name oscal-plan \
  --resource-group oscal-rg \
  --is-linux \
  --sku B1

# Create Web App
az webapp create \
  --resource-group oscal-rg \
  --plan oscal-plan \
  --name oscal-report-generator \
  --deployment-container-image-name ghcr.io/adobemanagedservices/oscal-report-generator:latest

# Configure container settings
az webapp config appsettings set \
  --resource-group oscal-rg \
  --name oscal-report-generator \
  --settings \
    WEBSITES_PORT=3020 \
    NODE_ENV=production
```

#### 2. Configure GitHub Secrets

Go to **Settings** → **Secrets and variables** → **Actions** and add:

**Required Secrets:**
- `AZURE_CREDENTIALS`: Service principal credentials (JSON)
- `AZURE_WEBAPP_NAME`: `oscal-report-generator`

**Get Azure Credentials:**
```bash
az ad sp create-for-rbac \
  --name "oscal-github-actions" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/oscal-rg \
  --sdk-auth
```

Copy the JSON output to `AZURE_CREDENTIALS` secret.

#### 3. Enable Workflow

The workflow `.github/workflows/deploy-azure.yml` is already created.

**Automatic deployment**: Pushes to `main` branch  
**Manual deployment**: Go to Actions → Deploy to Azure Web App → Run workflow

#### 4. Access Your Application

URL: `https://oscal-report-generator.azurewebsites.net`

**Cost**: ~$13/month (B1 plan)

---

## AWS ECS

### Prerequisites

- AWS account
- AWS CLI installed
- GitHub repository access

### Setup Steps

#### 1. Create AWS Resources

```bash
# Configure AWS CLI
aws configure

# Create ECR repository
aws ecr create-repository \
  --repository-name oscal-report-generator \
  --region us-east-1

# Create ECS cluster
aws ecs create-cluster \
  --cluster-name oscal-cluster \
  --region us-east-1

# Create task definition (see below)
aws ecs register-task-definition \
  --cli-input-json file://.aws/task-definition.json

# Create ECS service with load balancer
# (This is complex - use AWS Console or CloudFormation)
```

#### 2. Create Task Definition

Create `.aws/task-definition.json`:

```json
{
  "family": "oscal-report-generator",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "oscal-report-generator",
      "image": "REGISTRY/oscal-report-generator:latest",
      "portMappings": [
        {
          "containerPort": 3020,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3020"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/oscal-report-generator",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### 3. Configure GitHub Secrets

Add these secrets:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_REGION`: `us-east-1` (or your region)
- `ECS_CLUSTER_NAME`: `oscal-cluster`
- `ECS_SERVICE_NAME`: Your ECS service name
- `AWS_LOAD_BALANCER_DNS`: Your ALB DNS name

#### 4. Enable Workflow

The workflow `.github/workflows/deploy-aws.yml` is already created.

#### 5. Access Your Application

URL: `http://your-load-balancer-dns.us-east-1.elb.amazonaws.com`

**Cost**: ~$15-20/month (Fargate + ALB)

---

## AWS EKS

### Prerequisites

- AWS account
- AWS CLI and kubectl installed
- eksctl CLI (optional but recommended)
- GitHub repository access

### Overview

AWS EKS provides managed Kubernetes clusters. Choose EKS if you:
- Already use Kubernetes in your infrastructure
- Need Kubernetes-native features and ecosystem
- Want portability across cloud providers
- Require advanced orchestration capabilities

### Setup Steps

#### 1. Create EKS Cluster

**Option A: Using eksctl (Recommended)**

```bash
# Install eksctl
brew install eksctl

# Create EKS cluster (this takes ~15 minutes)
eksctl create cluster \
  --name oscal-cluster \
  --region us-east-1 \
  --node-type t3.small \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 3 \
  --managed

# Update kubeconfig
aws eks update-kubeconfig --name oscal-cluster --region us-east-1
```

**Option B: Using AWS CLI (Advanced)**

```bash
# Create cluster (control plane only)
aws eks create-cluster \
  --name oscal-cluster \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/eks-cluster-role \
  --resources-vpc-config subnetIds=subnet-xxx,subnet-yyy,securityGroupIds=sg-xxx

# Wait for cluster to be active
aws eks wait cluster-active --name oscal-cluster

# Create node group
aws eks create-nodegroup \
  --cluster-name oscal-cluster \
  --nodegroup-name oscal-nodes \
  --node-role arn:aws:iam::ACCOUNT_ID:role/eks-node-role \
  --subnets subnet-xxx subnet-yyy \
  --instance-types t3.small \
  --scaling-config minSize=1,maxSize=3,desiredSize=2
```

#### 2. Create Kubernetes Deployment Files

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oscal-report-generator
  labels:
    app: oscal-report-generator
spec:
  replicas: 2
  selector:
    matchLabels:
      app: oscal-report-generator
  template:
    metadata:
      labels:
        app: oscal-report-generator
    spec:
      containers:
      - name: oscal-report-generator
        image: ghcr.io/adobemanagedservices/oscal-report-generator:latest
        ports:
        - containerPort: 3020
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3020"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3020
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3020
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: oscal-report-generator
spec:
  type: LoadBalancer
  selector:
    app: oscal-report-generator
  ports:
  - port: 80
    targetPort: 3020
    protocol: TCP
```

#### 3. Deploy to EKS

```bash
# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Check deployment status
kubectl get deployments
kubectl get pods
kubectl get services

# Get Load Balancer URL
kubectl get service oscal-report-generator -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

#### 4. Configure GitHub Secrets

Add these secrets to your GitHub repository:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_REGION`: `us-east-1` (or your region)
- `EKS_CLUSTER_NAME`: `oscal-cluster`

#### 5. Create GitHub Actions Workflow

Create `.github/workflows/deploy-eks.yml`:

```yaml
name: Deploy to AWS EKS

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy to EKS
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Install kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name ${{ secrets.EKS_CLUSTER_NAME }} --region ${{ secrets.AWS_REGION }}

      - name: Deploy to EKS
        run: |
          kubectl apply -f k8s/deployment.yaml
          kubectl rollout status deployment/oscal-report-generator
          kubectl get services oscal-report-generator

      - name: Get service URL
        run: |
          echo "Application URL:"
          kubectl get service oscal-report-generator -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

#### 6. Optional: Use Fargate for Serverless

For serverless pods without managing nodes:

```bash
# Create Fargate profile
eksctl create fargateprofile \
  --cluster oscal-cluster \
  --name oscal-profile \
  --namespace default

# Deploy using same deployment.yaml
kubectl apply -f k8s/deployment.yaml
```

#### 7. Access Your Application

Get the Load Balancer URL:

```bash
kubectl get service oscal-report-generator
```

URL: `http://xxx.us-east-1.elb.amazonaws.com`

### Cost Breakdown

**EKS Control Plane:** $73/month ($0.10/hour × 730 hours)

**Option A: EC2 Worker Nodes**
- 2× t3.small nodes: ~$30/month ($0.0208/hour × 2 × 730 hours)
- Application Load Balancer: ~$16/month
- EBS volumes (20GB each): ~$4/month
- Data transfer: ~$5/month
- **Total: ~$128/month**

**Option B: Fargate (Serverless)**
- vCPU: $0.04048/hour per vCPU
- Memory: $0.004445/hour per GB
- For 0.5 vCPU, 1GB RAM, 2 pods, 24/7:
  - vCPU cost: ~$29.55/month
  - Memory cost: ~$6.50/month
- Application Load Balancer: ~$16/month
- **Total: ~$125/month**

**Option C: Minimal Setup (1 node, t3.micro)**
- 1× t3.micro node: ~$7.50/month
- Application Load Balancer: ~$16/month
- EBS volume (20GB): ~$2/month
- **Total: ~$98/month**

**⚠️ Note:** EKS is more expensive than ECS Fargate (~$15-20/month) but provides:
- Kubernetes portability
- Rich ecosystem and tooling
- Advanced orchestration features
- Multi-cloud strategy support

---

## Google Cloud Run

### Prerequisites

- Google Cloud account
- gcloud CLI installed

### Setup Steps

#### 1. Setup Google Cloud

```bash
# Login
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Deploy from existing image
gcloud run deploy oscal-report-generator \
  --image ghcr.io/adobemanagedservices/oscal-report-generator:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3020 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production
```

#### 2. Configure GitHub Actions

Create `.github/workflows/deploy-gcp.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_CREDENTIALS }}
      
      - name: Deploy to Cloud Run
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: oscal-report-generator
          image: ghcr.io/adobemanagedservices/oscal-report-generator:latest
          region: us-central1
```

#### 3. Configure Secrets

- `GCP_CREDENTIALS`: Service account JSON key

**Create service account:**
```bash
gcloud iam service-accounts create github-actions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Copy `key.json` contents to `GCP_CREDENTIALS` secret.

#### 4. Access Your Application

URL: Provided after deployment (e.g., `https://oscal-report-generator-xxx-uc.a.run.app`)

**Cost**: ~$5-10/month (pay per use)

---

## Heroku

### Setup Steps

#### 1. Install Heroku CLI

```bash
# macOS
brew install heroku/brew/heroku

# Login
heroku login
```

#### 2. Create Heroku App

```bash
# Create app
heroku create oscal-report-generator

# Add container registry
heroku container:login

# Deploy
heroku container:push web --app oscal-report-generator
heroku container:release web --app oscal-report-generator

# Open app
heroku open --app oscal-report-generator
```

#### 3. GitHub Actions Deployment

Create `.github/workflows/deploy-heroku.yml`:

```yaml
name: Deploy to Heroku

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: oscal-report-generator
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          usedocker: true
```

#### 4. Configure Secrets

- `HEROKU_API_KEY`: Get from Heroku account settings
- `HEROKU_EMAIL`: Your Heroku email

**Cost**: Free tier available, then ~$7/month

---

## DigitalOcean App Platform

### Setup Steps

#### 1. Via DigitalOcean Console

1. Go to DigitalOcean → App Platform
2. Click **Create App**
3. Choose **Docker Hub or Container Registry**
4. Enter: `ghcr.io/adobemanagedservices/oscal-report-generator`
5. Configure:
   - Name: `oscal-report-generator`
   - Port: `3020`
   - Instance size: Basic ($5/month)
6. Click **Launch App**

#### 2. Via doctl CLI

```bash
# Install doctl
brew install doctl

# Authenticate
doctl auth init

# Create app spec file
cat > app.yaml << EOF
name: oscal-report-generator
services:
  - name: web
    image:
      registry_type: GHCR
      registry: ghcr.io
      repository: adobemanagedservices/oscal-report-generator
      tag: latest
    http_port: 3020
    instance_count: 1
    instance_size_slug: basic-xxs
EOF

# Create app
doctl apps create --spec app.yaml

# Get app URL
doctl apps list
```

#### 3. GitHub Actions (Optional)

Use DigitalOcean GitHub Action for automated deployments.

**Cost**: ~$5/month (Basic plan)

---

## Comparison Table

| Platform | Cost/Month | Setup Difficulty | Best For |
|----------|------------|------------------|----------|
| **Azure Web App** | ~$13 | Medium | Enterprise, Microsoft ecosystem |
| **AWS ECS** | ~$15-20 | Hard | AWS ecosystem, containerized apps |
| **AWS EKS** | ~$98-128 | Very Hard | Kubernetes users, multi-cloud strategy |
| **Google Cloud Run** | ~$5-10 | Easy | Pay-per-use, serverless |
| **Heroku** | $0-7 | Very Easy | Quick deployments, testing |
| **DigitalOcean** | ~$5 | Easy | Simple, affordable hosting |

---

## Quick Start Recommendations

### For Testing/Development
**→ Heroku** (Free tier) or **Google Cloud Run** (generous free tier)

### For Production (Small)
**→ DigitalOcean App Platform** ($5/month, simple)

### For Production (Enterprise)
**→ Azure Web App** (if using Microsoft) or **AWS ECS** (if using AWS containers)

### For Kubernetes Users
**→ AWS EKS** (if already using Kubernetes or need portability)

### For Serverless/Auto-scaling
**→ Google Cloud Run** (best serverless experience)

---

## Configuration for All Platforms

### Environment Variables

All platforms need these environment variables:

```bash
NODE_ENV=production
PORT=3020
```

### Health Check

Configure health check endpoint: `/health`

### Persistent Storage

**Important**: Docker containers are stateless. For persistent config:

1. **Use environment variables** for configuration
2. **Use cloud storage** (Azure Blob, AWS S3, GCS) for user data
3. **Use managed database** (Azure SQL, RDS, Cloud SQL) if needed

---

## Next Steps

1. **Choose a platform** from the comparison table
2. **Follow the setup steps** for that platform
3. **Configure GitHub secrets** as specified
4. **Push to main branch** or run workflow manually
5. **Access your deployed application** at the provided URL

---

## Support

For issues with cloud deployment:
- Check platform-specific documentation
- Review GitHub Actions workflow logs
- Contact: mukesh.kesharwani@adobe.com

---

**Last Updated**: January 22, 2026
