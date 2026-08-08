# ☁️ Cloud Deployment Guide

**OSCAL Report Generator - Cloud Platform Deployment**

This guide explains how to deploy the OSCAL Report Generator to various cloud platforms instead of TrueNAS.

---

## 📋 Table of Contents

1. [Azure Web App](#azure-web-app)
2. [AWS EC2 (Virtual Machine)](#aws-ec2)
3. [AWS ECS (Elastic Container Service)](#aws-ecs)
4. [AWS EKS (Elastic Kubernetes Service)](#aws-eks)
5. [Google Cloud Run](#google-cloud-run)
6. [Heroku](#heroku)
7. [DigitalOcean App Platform](#digitalocean-app-platform)
8. [Comparison Table](#comparison-table)

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
  --deployment-container-image-name ghcr.io/adobe/oscal-report-generator:latest

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

## AWS EC2

### Prerequisites

- AWS account
- SSH key pair
- Basic Linux knowledge
- GitHub repository access

### Overview

AWS EC2 provides virtual machines with full control. Choose EC2 if you:
- Want full control over the server environment
- Need to run additional services alongside the app
- Prefer traditional VM-based deployment
- Want the simplest AWS option without container complexity

### Setup Steps

#### 1. Create EC2 Instance

**Via AWS Console:**

1. Go to **EC2 Dashboard** → **Launch Instance**
2. Configure instance:
   - **Name**: oscal-report-generator
   - **AMI**: Ubuntu 22.04 LTS
   - **Instance type**: Preferred t4g.small (Graviton) or t3a.small (AMD); minimal t3.micro
   - **Key pair**: Create new or select existing
   - **Network**: Default VPC
   - **Security group**: 
     - SSH (22) from your IP
     - HTTP (80) from anywhere
     - Custom TCP (3020) from anywhere
   - **Storage**: 20 GB gp3

3. Click **Launch Instance**

**Via AWS CLI:**

```bash
# Configure AWS CLI
aws configure

# Create security group
aws ec2 create-security-group \
  --group-name oscal-sg \
  --description "OSCAL Report Generator security group" \
  --vpc-id vpc-xxxxxxxx

# Add security group rules
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 3020 --cidr 0.0.0.0/0

# Launch instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.micro \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --block-device-mappings DeviceName=/dev/sda1,Ebs={VolumeSize=20} \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=oscal-report-generator}]'
```

#### 2. Install Docker on EC2

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.compute-1.amazonaws.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Verify installation
docker --version

# Exit and reconnect for group changes
exit
ssh -i your-key.pem ubuntu@ec2-xx-xx-xx-xx.compute-1.amazonaws.com
```

#### 3. Deploy Application

```bash
# Pull Docker image
docker pull ghcr.io/adobe/oscal-report-generator:latest

# Run container
docker run -d \
  --name oscal-report-generator \
  --restart unless-stopped \
  -p 80:3020 \
  -p 3020:3020 \
  -e NODE_ENV=production \
  ghcr.io/adobe/oscal-report-generator:latest

# Verify container is running
docker ps

# Check logs
docker logs oscal-report-generator

# Test locally
curl http://localhost:3020/health
```

#### 4. Optional: Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/oscal << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/oscal /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

#### 5. Optional: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certificate auto-renewal is configured automatically
```

#### 6. Create Update Script

```bash
# Create update script
cat > ~/update-oscal.sh << 'EOF'
#!/bin/bash
echo "Updating OSCAL Report Generator..."

# Pull latest image
docker pull ghcr.io/adobe/oscal-report-generator:latest

# Stop and remove old container
docker stop oscal-report-generator
docker rm oscal-report-generator

# Run new container
docker run -d \
  --name oscal-report-generator \
  --restart unless-stopped \
  -p 80:3020 \
  -p 3020:3020 \
  -e NODE_ENV=production \
  ghcr.io/adobe/oscal-report-generator:latest

# Clean up old images
docker image prune -f

echo "Update complete!"
docker logs --tail 50 oscal-report-generator
EOF

# Make executable
chmod +x ~/update-oscal.sh

# Run update
./update-oscal.sh
```

#### 7. Configure GitHub Actions (Optional)

Create `.github/workflows/deploy-ec2.yml`:

```yaml
name: Deploy to AWS EC2

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy to EC2
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to EC2
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            # Pull latest image
            docker pull ghcr.io/adobe/oscal-report-generator:latest
            
            # Stop and remove old container
            docker stop oscal-report-generator || true
            docker rm oscal-report-generator || true
            
            # Run new container
            docker run -d \
              --name oscal-report-generator \
              --restart unless-stopped \
              -p 80:3020 \
              -p 3020:3020 \
              -e NODE_ENV=production \
              ghcr.io/adobe/oscal-report-generator:latest
            
            # Clean up
            docker image prune -f
            
            # Show status
            docker ps
            docker logs --tail 20 oscal-report-generator

      - name: Verify Deployment
        run: |
          sleep 10
          curl -f http://${{ secrets.EC2_HOST }}/health || exit 1
```

**Required GitHub Secrets:**
- `EC2_HOST`: Your EC2 public IP or domain
- `EC2_SSH_KEY`: Private SSH key content

#### 8. Access Your Application

**Public URL:**
- With Nginx: `http://your-ec2-public-ip` or `http://your-domain.com`
- Direct: `http://your-ec2-public-ip:3020`

**Get Public IP:**
```bash
# From AWS Console
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=oscal-report-generator" \
  --query 'Reservations[*].Instances[*].PublicIpAddress' \
  --output text
```

### Cost Breakdown

**EC2 Instance:**
- **t3.micro** (1 vCPU, 1GB RAM): ~$7.50/month
- **t4g.small** (Graviton, 2 vCPU, 2GB RAM): ~$12/month (preferred)
- **t3a.small** (AMD, 2 vCPU, 2GB RAM): ~$15/month (fallback)
- **t3.medium** (2 vCPU, 4GB RAM): ~$30/month (high performance)

**Storage:**
- 20 GB gp3 EBS volume: ~$1.60/month

**Data Transfer:**
- First 100 GB/month: FREE
- Additional: $0.09/GB

**Elastic IP (optional):**
- FREE while instance running
- $3.60/month if not attached

**Total Estimated Cost:**
- **Minimal (t3.micro)**: ~$9-10/month
- **Recommended (t4g.small Graviton)**: ~$14-17/month
- **High Performance (t3.medium)**: ~$32-35/month

### Pros & Cons

**✅ Pros:**
- Full control over server environment
- Simple, traditional deployment model
- No container orchestration complexity
- Can run multiple services on same instance
- Easy to SSH and debug
- Cost-effective for single applications
- Can use Spot Instances for 70% savings

**❌ Cons:**
- Manual server management required
- No automatic scaling (without additional setup)
- Responsible for security updates
- Single point of failure (without load balancer)
- Need to manage backups manually

### Best Practices

1. **Enable CloudWatch monitoring**
2. **Set up automated backups** (AMI snapshots)
3. **Use Elastic IP** for consistent addressing
4. **Configure auto-start** for Docker containers
5. **Set up log rotation** for Docker logs
6. **Use IAM roles** instead of access keys
7. **Enable AWS Systems Manager** for easier management
8. **Consider Auto Scaling Group** for high availability

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
        image: ghcr.io/adobe/oscal-report-generator:latest
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
  --image ghcr.io/adobe/oscal-report-generator:latest \
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
          image: ghcr.io/adobe/oscal-report-generator:latest
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
4. Enter: `ghcr.io/adobe/oscal-report-generator`
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
      repository: adobe/oscal-report-generator
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
| **AWS EC2** | ~$10-20 | Easy | Full control, traditional VMs |
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

### For Full Control/Traditional VMs
**→ AWS EC2** ($10-20/month, simple VM deployment with full control)

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
