# 💰 AWS EC2 Cost Estimate for OSCAL Report Generator + Ollama

**Configuration:** 3 EC2 Instances (2 for OSCAL Generator Blue/Green + 1 for Ollama with Mistral & Llama)

**Last Updated:** January 29, 2026

---

## 🚀 TL;DR - Quick Answer

### 💎 **BEST SETUP: Auto-Scaling with 4-Hour Idle Timeout**

**Monthly Cost:** **$94.68** | **Annual Cost:** **$1,136**

**What You Get:**
- ✅ Application Load Balancer (high availability)
- ✅ 2x OSCAL instances (Blue/Green deployment, always-on)
- ✅ Ollama AI server (auto-scales based on activity)
  - Shuts down when idle
  - Wakes up in 2-3 minutes when AI query received
  - Stays active for 4 hours after last activity
  - Auto-shuts down again if no activity
- ✅ Lambda automation + CloudWatch monitoring
- ✅ **42% cheaper** than always-on ($68/month savings)

**Perfect for:** 5-10 users, moderate AI usage (20% uptime ~150 hours/month)

---

### 📊 Quick Comparison

| Setup | Monthly | Annual | Ollama Uptime | Best For |
|-------|---------|--------|---------------|----------|
| **Auto-Scale (CPU)** ⭐ | **$94.68** | **$1,136** | 20% | **Most users** |
| Auto-Scale (GPU) | $148.62 | $1,783 | 20% | Fast AI responses |
| Always-On (CPU) | $163.03 | $1,956 | 100% | 24/7 availability |
| Always-On (GPU) | $425.52 | $5,106 | 100% | Enterprise |

**💡 Recommendation:** Start with Auto-Scale CPU setup. Save $820/year!

---

## 📚 Detailed Breakdown Below

Continue reading for:
- Architecture diagrams
- Cost breakdowns by scenario
- Implementation guide (Lambda code, CloudWatch setup)
- Real-world usage examples
- Optimization strategies

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      AWS Cloud (US-East-1)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   EC2 Instance   │      │   EC2 Instance   │            │
│  │  OSCAL - Green   │      │  OSCAL - Blue    │            │
│  │  Port: 3019      │      │  Port: 3020      │            │
│  │  t3.small        │      │  t3.small        │            │
│  │  2 vCPU, 2GB RAM │      │  2 vCPU, 2GB RAM │            │
│  └──────────────────┘      └──────────────────┘            │
│           │                          │                       │
│           └──────────┬───────────────┘                       │
│                      │                                       │
│               ┌──────▼──────────┐                           │
│               │  Load Balancer  │ (Optional)                │
│               │   ALB/ELB       │                           │
│               └─────────────────┘                           │
│                                                               │
│  ┌──────────────────────────────────┐                       │
│  │       EC2 Instance               │                       │
│  │       Ollama AI Server           │                       │
│  │       Port: 11434                │                       │
│  │       g4dn.xlarge                │                       │
│  │       4 vCPU, 16GB RAM, GPU      │                       │
│  │       Models: Mistral 7B + Llama │                       │
│  └──────────────────────────────────┘                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 💵 Detailed Cost Breakdown

### Option 1: Production Setup (Recommended) ⭐

#### 🟢 OSCAL Generator Instances (x2)

**Instance Type:** `t3.small` (2 vCPU, 2 GB RAM)

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance 1 (Green)** | t3.small | $0.0208/hour | **$15.18** |
| **Instance 2 (Blue)** | t3.small | $0.0208/hour | **$15.18** |
| EBS Storage (20 GB each) | gp3 | $0.08/GB-month | $3.20 |
| Data Transfer (within VPC) | First 100 GB | FREE | $0.00 |
| Elastic IP (x2) | While attached | FREE | $0.00 |

**Subtotal for OSCAL Instances:** **$33.56/month**

---

#### 🤖 Ollama AI Server Instance (x1)

**Instance Type:** `g4dn.xlarge` (4 vCPU, 16 GB RAM, NVIDIA T4 GPU)

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance (GPU)** | g4dn.xlarge | $0.526/hour | **$383.96** |
| EBS Storage (100 GB) | gp3 (for models) | $0.08/GB-month | $8.00 |
| Data Transfer (to OSCAL) | Within same region | FREE | $0.00 |

**Note:** Ollama with Mistral 7B + Llama requires:
- Mistral 7B: ~4.5 GB disk space + 4-8 GB RAM when loaded
- Llama 2 7B: ~4 GB disk space + 4-8 GB RAM when loaded
- Running both models simultaneously: 12-16 GB RAM (GPU accelerated)

**Subtotal for Ollama Instance:** **$391.96/month**

---

### 📊 Monthly Cost Summary (Option 1 - Production)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Green Instance (t3.small) | $15.18 |
| OSCAL Blue Instance (t3.small) | $15.18 |
| OSCAL Storage (40 GB total) | $3.20 |
| Ollama Instance (g4dn.xlarge with GPU) | $383.96 |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$425.52** |
| **TOTAL ANNUAL** | **$5,106.24** |

---

## 💡 Option 2: Cost-Optimized Setup (CPU-Only)

If GPU acceleration is not required, you can run Ollama on CPU:

#### 🤖 Ollama AI Server (CPU-Only)

**Instance Type:** `t3.xlarge` (4 vCPU, 16 GB RAM) - No GPU

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance (CPU)** | t3.xlarge | $0.1664/hour | **$121.47** |
| EBS Storage (100 GB) | gp3 | $0.08/GB-month | $8.00 |

**Subtotal:** **$129.47/month**

### 📊 Monthly Cost Summary (Option 2 - CPU-Only)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Green Instance (t3.small) | $15.18 |
| OSCAL Blue Instance (t3.small) | $15.18 |
| OSCAL Storage (40 GB total) | $3.20 |
| Ollama Instance (t3.xlarge CPU-only) | $121.47 |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$163.03** |
| **TOTAL ANNUAL** | **$1,956.36** |

**⚠️ Note:** CPU-only inference is 5-10x slower than GPU, but functional for moderate usage.

---

## 💎 Option 3: Budget Setup (Single OSCAL Instance)

If you don't need Blue/Green deployment:

### 📊 Monthly Cost Summary (Option 3 - Single OSCAL)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Single Instance (t3.small) | $15.18 |
| OSCAL Storage (20 GB) | $1.60 |
| Ollama Instance (t3.xlarge CPU-only) | $121.47 |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$146.25** |
| **TOTAL ANNUAL** | **$1,755.00** |

---

## 🎯 Cost Optimization Strategies

### 1. Reserved Instances (1-Year Commitment)
Save up to 40% with reserved instances:

| Instance Type | On-Demand | 1-Year Reserved | Savings |
|--------------|-----------|-----------------|---------|
| t3.small (x2) | $30.36/mo | $19.44/mo | **36%** |
| g4dn.xlarge | $383.96/mo | $254.00/mo | **34%** |
| **Total Savings** | **$414.32/mo** | **$273.44/mo** | **$141/mo** |

**Annual Savings:** ~$1,692

### 2. Spot Instances (70-90% Discount)
For non-critical workloads:

| Instance Type | On-Demand | Spot Price | Savings |
|--------------|-----------|------------|---------|
| t3.small | $15.18/mo | $4.50/mo | **70%** |
| g4dn.xlarge | $383.96/mo | $115.00/mo | **70%** |

**⚠️ Warning:** Spot instances can be terminated with 2-minute notice when AWS needs capacity.

### 3. Savings Plans (Flexible Commitment)
- 1-Year Plan: 30-35% discount
- 3-Year Plan: 50-55% discount
- Applies across any instance family

### 4. Auto-Scaling / Scheduled Shutdown
- **Business Hours Only** (8am-6pm, M-F): Save ~70%
- **Development Environment**: Run only when needed
- **Monthly Cost (40 hours/week):**
  - Option 1 (GPU): ~$100/month
  - Option 2 (CPU): ~$35/month

---

## 🚀 Advanced Setup: Load Balancer + Intelligent Auto-Scaling

### 📥 Get PNG Diagrams for Email

**Quick Access:**
- **Interactive HTML:** Open `docs/diagrams/generate-diagram.html` in your browser
- **Mermaid Files:** `docs/diagrams/*.mmd` files
- **Convert to PNG:** See `docs/diagrams/README.md` (Mermaid Live, VS Code, or `mmdc` command line)

**Three Easy Ways to Get PNG:**

1. **Browser (Easiest):** 
   - Open `docs/diagrams/generate-diagram.html`
   - Click "Download Architecture PNG" or "Download Workflow PNG"
   - Or right-click → "Save Image As..."

2. **Online Tool:**
   - Visit https://mermaid.live/
   - Copy contents from `docs/diagrams/aws-auto-scaling-architecture.mmd`
   - Click "Download PNG"

3. **Command Line:**
   ```bash
   cd docs/diagrams
   npm install -g @mermaid-js/mermaid-cli
   for file in *.mmd; do mmdc -i "$file" -o "${file%.mmd}.png" -w 1920 -H 1080 -b white; done
   ```

**Output:** High-resolution PNG images ready for email!

---

### Architecture with ALB and Auto-Scaling (Text Version)

```
┌───────────────────────────────────────────────────────────────────┐
│                       AWS Cloud (US-East-1)                        │
├───────────────────────────────────────────────────────────────────┤
│                                                                     │
│                    ┌─────────────────────┐                        │
│         ┌──────────│ Application Load    │──────────┐            │
│         │          │ Balancer (ALB)      │          │            │
│         │          │ Port: 80/443        │          │            │
│         │          └─────────────────────┘          │            │
│         │                                            │            │
│    ┌────▼─────────┐                        ┌────────▼────┐      │
│    │ EC2 Instance │                        │ EC2 Instance│      │
│    │ OSCAL-Green  │◄──Health Check────────►│ OSCAL-Blue  │      │
│    │ Port: 3019   │                        │ Port: 3020  │      │
│    │ t3.small     │                        │ t3.small    │      │
│    └──────┬───────┘                        └──────┬──────┘      │
│           │                                        │              │
│           └────────────────┬───────────────────────┘              │
│                            │ AI API Calls                         │
│                            │                                      │
│                   ┌────────▼──────────┐                          │
│                   │  Lambda Function  │                          │
│                   │  (Wake/Sleep)     │                          │
│                   └────────┬──────────┘                          │
│                            │                                      │
│           ┌────────────────▼──────────────────┐                 │
│           │      Ollama AI Server              │                 │
│           │      Auto-Scaling Group            │                 │
│           │      • Scales 0→1 on demand        │                 │
│           │      • Stays up 4 hours idle       │                 │
│           │      • Auto-shutdown if inactive   │                 │
│           │      g4dn.xlarge or t3.xlarge     │                 │
│           └────────────────────────────────────┘                 │
│                            │                                      │
│                   ┌────────▼──────────┐                          │
│                   │   CloudWatch       │                          │
│                   │   Monitoring       │                          │
│                   │   • Activity logs  │                          │
│                   │   • Idle timer     │                          │
│                   └────────────────────┘                          │
│                                                                     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Breakdown with Load Balancer & Auto-Scaling

### Core Infrastructure Costs

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| **Application Load Balancer** | Base cost | $16.20 |
| **ALB LCU Hours** | ~10 LCU-hours/month (light traffic) | $5.76 |
| **OSCAL Green** | t3.small (24/7) | $15.18 |
| **OSCAL Blue** | t3.small (24/7) | $15.18 |
| **Route 53** | Hosted zone + DNS queries | $1.00 |
| **CloudWatch Logs** | 10 GB/month ingested | $5.00 |
| **Lambda Executions** | 10,000 invocations/month | $0.20 |
| **EBS Storage** | 40 GB (OSCAL) + 100 GB (Ollama) | $11.20 |

**Subtotal (Always-On Infrastructure):** **$69.72/month**

---

### 🤖 Ollama Auto-Scaling Cost Models

#### Scenario 1: Light Usage (20% Uptime) ⭐ **RECOMMENDED**

**Usage Pattern:**
- Active: 4-6 hours/day (wake on demand, 4-hour idle timeout)
- Monthly uptime: ~150 hours (20% of 730 hours)
- Typical for: 5-10 users, 50-100 AI queries/day

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 150 | $78.90 |
| **t3.xlarge (CPU)** | $0.1664 | 150 | $24.96 |

**Total Monthly Cost (Light Usage):**
- **With GPU:** $69.72 (infra) + $78.90 (Ollama) = **$148.62/month** ($1,783/year)
- **With CPU:** $69.72 (infra) + $24.96 (Ollama) = **$94.68/month** ($1,136/year)

**Savings vs Always-On:**
- GPU: Save **$277/month** (65% savings)
- CPU: Save **$68/month** (42% savings)

---

#### Scenario 2: Medium Usage (50% Uptime)

**Usage Pattern:**
- Active: 10-14 hours/day
- Monthly uptime: ~365 hours (50% of 730 hours)
- Typical for: 10-20 users, 200-400 AI queries/day

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 365 | $192.00 |
| **t3.xlarge (CPU)** | $0.1664 | 365 | $60.74 |

**Total Monthly Cost (Medium Usage):**
- **With GPU:** $69.72 + $192.00 = **$261.72/month** ($3,141/year)
- **With CPU:** $69.72 + $60.74 = **$130.46/month** ($1,566/year)

---

#### Scenario 3: Business Hours Only (25% Uptime)

**Usage Pattern:**
- Active: 8am-6pm, Monday-Friday (10 hours × 5 days)
- Monthly uptime: ~180 hours (25% of 730 hours)
- Typical for: Business applications, development environments

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 180 | $94.68 |
| **t3.xlarge (CPU)** | $0.1664 | 180 | $29.95 |

**Total Monthly Cost (Business Hours):**
- **With GPU:** $69.72 + $94.68 = **$164.40/month** ($1,973/year)
- **With CPU:** $69.72 + $29.95 = **$99.67/month** ($1,196/year)

---

## 📊 Complete Cost Comparison Table

| Configuration | Monthly | Annual | Ollama Uptime | Best For |
|--------------|---------|--------|---------------|----------|
| **Basic (No ALB, 24/7)** | $163.03 | $1,956 | 100% | Simple deployments |
| **Auto-Scale Light (CPU)** ⭐ | $94.68 | $1,136 | 20% | 5-10 users, moderate AI use |
| **Auto-Scale Light (GPU)** | $148.62 | $1,783 | 20% | 5-10 users, fast AI responses |
| **Auto-Scale Business (CPU)** | $99.67 | $1,196 | 25% | Office hours only |
| **Auto-Scale Business (GPU)** | $164.40 | $1,973 | 25% | Office hours, high performance |
| **Auto-Scale Medium (CPU)** | $130.46 | $1,566 | 50% | 10-20 users |
| **Auto-Scale Medium (GPU)** | $261.72 | $3,141 | 50% | 10-20 users, high usage |
| **Always-On (CPU)** | $163.03 | $1,956 | 100% | 24/7 availability needed |
| **Always-On (GPU)** | $425.52 | $5,106 | 100% | Enterprise, high availability |

---

## 🎯 **RECOMMENDED: Auto-Scale Light with CPU**

### 💎 Best Value Setup

**Monthly Cost:** **$94.68** | **Annual Cost:** **$1,136**

**What you get:**
- ✅ Application Load Balancer (high availability)
- ✅ Blue/Green OSCAL deployment
- ✅ Intelligent Ollama auto-scaling
- ✅ 4-hour idle timeout
- ✅ Wakes on-demand when AI query received
- ✅ ~20% uptime (150 hours/month)
- ✅ **42% savings** vs always-on

**Savings:** $68/month compared to always-on setup!

---

## 🔧 Implementation: Auto-Scaling Ollama with 4-Hour Idle Timeout

### How It Works: Real-World Example

**Scenario:** A typical workday with your OSCAL application

```
Timeline                      Ollama Status              Cost Impact
─────────────────────────────────────────────────────────────────────

8:00 AM  User logs in         [SLEEPING - Scaled to 0]  $0/hour
         Views reports         

8:15 AM  Clicks "AI Suggest"  [WAKING UP...]            Starting...
         (First AI request)    Lambda triggers scale-up
         
8:18 AM  Ollama responds      [ACTIVE ✅]               $0.1664/hour
         Models loaded         Last activity: 8:18 AM
         
8:30 AM  Another AI request   [ACTIVE ✅]               $0.1664/hour
                               Last activity: 8:30 AM
         
9:45 AM  More AI queries      [ACTIVE ✅]               $0.1664/hour
                               Last activity: 9:45 AM
         
11:00 AM No AI activity       [ACTIVE ✅]               $0.1664/hour
         (Just viewing)        Last activity: 9:45 AM
                               Idle: 1hr 15min
         
12:30 PM Lunch break          [ACTIVE ✅]               $0.1664/hour
         No activity           Last activity: 9:45 AM
                               Idle: 2hr 45min
         
1:45 PM  Back from lunch      [ACTIVE ✅]               $0.1664/hour
         4 hours since last    Last activity: 9:45 AM
         AI query              Idle: 4hr 0min
                               🔍 Idle check: SHUTDOWN!
         
1:46 PM  Ollama shuts down    [SLEEPING - Scaled to 0]  $0/hour
                               Auto-scaled to 0 instances
         
2:00 PM  Views reports        [SLEEPING]                $0/hour
         (No AI needed)
         
3:30 PM  AI request again     [WAKING UP...]            Starting...
                               Lambda triggers scale-up
         
3:33 PM  Ollama active        [ACTIVE ✅]               $0.1664/hour
                               Last activity: 3:33 PM
         
5:00 PM  Last AI query        [ACTIVE ✅]               $0.1664/hour
                               Last activity: 5:00 PM
         
9:00 PM  Auto-shutdown        [SLEEPING]                $0/hour
         (4 hours idle)        Scaled to 0
         
─────────────────────────────────────────────────────────────────────

Daily Summary:
  Active periods: 8:18 AM - 1:46 PM (5.5 hours)
                 3:33 PM - 9:00 PM (5.5 hours)
  Total active: 11 hours
  Total cost: 11 × $0.1664 = $1.83/day
  
Monthly estimate (22 workdays): 22 × $1.83 = $40.26
Plus infrastructure ($69.72) = $110/month total
```

**Key Benefits:**
- ✅ No wasted compute during lunch breaks
- ✅ No cost during nights/weekends
- ✅ Automatic wake-up when needed (2-3 min delay)
- ✅ 4-hour buffer prevents excessive start/stop cycles
- ✅ ~70-80% cost savings vs always-on

---

### Architecture Components

1. **Lambda Function** (Wake/Sleep Controller)
2. **CloudWatch Events** (Idle timeout monitoring)
3. **Auto Scaling Group** (0-1 instance scaling)
4. **Application Load Balancer** (Health checks & routing)
5. **DynamoDB** (Track last activity timestamp)

---

### Lambda Function: Ollama Controller

```python
# lambda/ollama_controller.py
import boto3
import json
from datetime import datetime, timedelta

ec2 = boto3.client('ec2')
asg = boto3.client('autoscaling')
dynamodb = boto3.resource('dynamodb')

OLLAMA_ASG_NAME = 'ollama-ai-server-asg'
IDLE_TIMEOUT_HOURS = 4
ACTIVITY_TABLE = 'ollama-activity-tracking'

def lambda_handler(event, context):
    """
    Handles Ollama instance lifecycle:
    - Wakes up instance when AI query received
    - Monitors activity and shuts down after 4 hours idle
    """
    
    action = event.get('action')
    
    if action == 'wake':
        return wake_ollama_instance()
    elif action == 'check_idle':
        return check_and_shutdown_if_idle()
    else:
        return {'statusCode': 400, 'body': 'Invalid action'}

def wake_ollama_instance():
    """Scale up Ollama ASG to 1 instance"""
    
    # Check if already running
    response = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[OLLAMA_ASG_NAME]
    )
    
    current_capacity = response['AutoScalingGroups'][0]['DesiredCapacity']
    
    if current_capacity == 0:
        print("🚀 Waking up Ollama instance...")
        asg.set_desired_capacity(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            DesiredCapacity=1
        )
        
        # Wait for instance to be ready
        waiter = ec2.get_waiter('instance_running')
        instance_id = get_asg_instance_id()
        if instance_id:
            waiter.wait(InstanceIds=[instance_id])
            print(f"✅ Ollama instance {instance_id} is ready")
    else:
        print("✅ Ollama instance already running")
    
    # Update last activity timestamp
    update_activity_timestamp()
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Ollama instance active'})
    }

def check_and_shutdown_if_idle():
    """Check if Ollama has been idle for 4 hours and shut down"""
    
    table = dynamodb.Table(ACTIVITY_TABLE)
    response = table.get_item(Key={'id': 'last_activity'})
    
    if 'Item' not in response:
        print("⚠️ No activity recorded, skipping shutdown check")
        return {'statusCode': 200, 'body': 'No activity data'}
    
    last_activity = datetime.fromisoformat(response['Item']['timestamp'])
    now = datetime.utcnow()
    idle_duration = now - last_activity
    
    print(f"⏱️ Idle duration: {idle_duration}")
    
    if idle_duration > timedelta(hours=IDLE_TIMEOUT_HOURS):
        print("😴 Ollama idle for 4+ hours, shutting down...")
        asg.set_desired_capacity(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            DesiredCapacity=0
        )
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Ollama instance shut down due to inactivity'})
        }
    else:
        remaining = timedelta(hours=IDLE_TIMEOUT_HOURS) - idle_duration
        print(f"✅ Still active, {remaining} until auto-shutdown")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Active, {remaining} remaining'})
        }

def update_activity_timestamp():
    """Update last activity timestamp in DynamoDB"""
    table = dynamodb.Table(ACTIVITY_TABLE)
    table.put_item(
        Item={
            'id': 'last_activity',
            'timestamp': datetime.utcnow().isoformat()
        }
    )
    print("📝 Updated activity timestamp")

def get_asg_instance_id():
    """Get instance ID from Auto Scaling Group"""
    response = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[OLLAMA_ASG_NAME]
    )
    instances = response['AutoScalingGroups'][0]['Instances']
    return instances[0]['InstanceId'] if instances else None
```

---

### CloudWatch Events Rules

```yaml
# cloudwatch-rules.yaml

# Rule 1: Check idle status every 30 minutes
OllamaIdleCheckRule:
  Type: AWS::Events::Rule
  Properties:
    Name: ollama-idle-check
    Description: Check if Ollama instance should be shut down
    ScheduleExpression: rate(30 minutes)
    State: ENABLED
    Targets:
      - Arn: !GetAtt OllamaControllerLambda.Arn
        Input: '{"action": "check_idle"}'

# Rule 2: Wake on API Gateway request (triggered by OSCAL app)
OllamaWakeRule:
  Type: AWS::Events::Rule
  Properties:
    Name: ollama-wake-on-request
    Description: Wake Ollama when AI query received
    EventPattern:
      source:
        - oscal.ai.request
      detail-type:
        - AI Query
    State: ENABLED
    Targets:
      - Arn: !GetAtt OllamaControllerLambda.Arn
        Input: '{"action": "wake"}'
```

---

### OSCAL Application Integration

Modify your OSCAL backend to trigger Ollama wake-up:

```javascript
// backend/server.js - AI integration endpoint

const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

app.post('/api/ai/suggest-controls', async (req, res) => {
  try {
    // 1. Wake up Ollama instance if needed
    console.log('🤖 Checking Ollama instance status...');
    
    const wakeResponse = await lambda.invoke({
      FunctionName: 'ollama-controller',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ action: 'wake' })
    }).promise();
    
    const wakeResult = JSON.parse(wakeResponse.Payload);
    
    if (wakeResult.statusCode !== 200) {
      throw new Error('Failed to wake Ollama instance');
    }
    
    // 2. Wait for instance to be ready (if just woken)
    await waitForOllamaReady();
    
    // 3. Make AI request to Ollama
    const aiResponse = await makeOllamaRequest(req.body);
    
    // 4. Return response
    res.json({ success: true, data: aiResponse });
    
  } catch (error) {
    console.error('AI request error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

async function waitForOllamaReady(maxWaitSeconds = 120) {
  const startTime = Date.now();
  const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama-internal:11434';
  
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    try {
      const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
      if (response.status === 200) {
        console.log('✅ Ollama is ready');
        return true;
      }
    } catch (error) {
      console.log('⏳ Waiting for Ollama to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }
  
  throw new Error('Ollama instance failed to become ready');
}
```

---

### Auto Scaling Group Configuration

```bash
# Create Launch Template for Ollama
aws ec2 create-launch-template \
  --launch-template-name ollama-ai-server \
  --version-description "Ollama with Mistral 7B + Llama" \
  --launch-template-data '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "t3.xlarge",
    "KeyName": "your-key-pair",
    "SecurityGroupIds": ["sg-ollama"],
    "UserData": "<base64-encoded-startup-script>",
    "BlockDeviceMappings": [{
      "DeviceName": "/dev/xvda",
      "Ebs": {
        "VolumeSize": 100,
        "VolumeType": "gp3"
      }
    }],
    "TagSpecifications": [{
      "ResourceType": "instance",
      "Tags": [
        {"Key": "Name", "Value": "ollama-ai-server"},
        {"Key": "Purpose", "Value": "AI-Inference"}
      ]
    }]
  }'

# Create Auto Scaling Group (scales 0 to 1)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ollama-ai-server-asg \
  --launch-template LaunchTemplateName=ollama-ai-server \
  --min-size 0 \
  --max-size 1 \
  --desired-capacity 0 \
  --vpc-zone-identifier "subnet-abc123,subnet-def456" \
  --health-check-type EC2 \
  --health-check-grace-period 300 \
  --tags "Key=Name,Value=ollama-ai-server,PropagateAtLaunch=true"
```

---

### DynamoDB Activity Tracking Table

```bash
# Create DynamoDB table for activity tracking
aws dynamodb create-table \
  --table-name ollama-activity-tracking \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Purpose,Value=OllamaActivityTracking
```

---

## 💰 Additional Service Costs (Auto-Scaling Setup)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| **Lambda Executions** | $0.20 | 10,000 invocations @ $0.20/million |
| **Lambda Duration** | $0.02 | 10,000 × 1s @ $0.0000166667/GB-sec |
| **DynamoDB** | $0.25 | On-demand pricing, minimal reads/writes |
| **CloudWatch Logs** | $0.50 | 1 GB ingested @ $0.50/GB |
| **CloudWatch Events** | FREE | First 1M events free |
| **Auto Scaling** | FREE | No additional charge |

**Total Additional Cost:** **~$1.00/month**

---

## 📈 Additional AWS Costs to Consider

### Optional Components

| Service | Use Case | Monthly Cost |
|---------|----------|-------------|
| **Application Load Balancer** | Distribute traffic between Blue/Green | $16.20 + $0.008/LCU-hour |
| **Route 53** | DNS management | $0.50/hosted zone + $0.40/million queries |
| **CloudWatch** | Monitoring & logs | $0.50/GB ingested (first 5GB free) |
| **EBS Snapshots** | Backups | $0.05/GB-month |
| **Data Transfer Out** | Internet egress (after 100GB free) | $0.09/GB |
| **VPC** | Networking | FREE (standard config) |
| **Security Groups** | Firewall rules | FREE |
| **IAM** | Access management | FREE |

### Estimated Additional Costs (Optional)
- **With ALB + Monitoring:** Add ~$20-25/month
- **With backups (100GB snapshots):** Add ~$5/month
- **With high data transfer (500GB/mo):** Add ~$36/month

---

## 🌍 Regional Pricing Variations

Prices shown are for **US East (N. Virginia) - us-east-1**

| Region | Price Difference |
|--------|-----------------|
| US East (Ohio) - us-east-2 | ~Same |
| US West (Oregon) - us-west-2 | +5% |
| EU (Ireland) - eu-west-1 | +10% |
| Asia Pacific (Singapore) | +15% |
| Asia Pacific (Sydney) | +18% |

---

## 📋 Recommended Setup by Use Case

### 🏢 Enterprise Production (Current Your Setup)
**Estimated Cost:** $425/month ($5,106/year)

✅ Blue/Green deployment for zero-downtime updates  
✅ GPU-accelerated AI inference  
✅ High availability  
✅ Best performance

**Instances:**
- 2x t3.small (OSCAL Blue/Green)
- 1x g4dn.xlarge (Ollama with GPU)

---

### 🏗️ Small Team / Startup
**Estimated Cost:** $163/month ($1,956/year)

✅ Blue/Green deployment  
✅ CPU-only AI (slower but functional)  
✅ Cost-effective

**Instances:**
- 2x t3.small (OSCAL Blue/Green)
- 1x t3.xlarge (Ollama CPU-only)

---

### 🧪 Development / Testing
**Estimated Cost:** $146/month ($1,755/year)

✅ Single OSCAL instance  
✅ CPU-only AI  
✅ Lowest cost

**Instances:**
- 1x t3.small (OSCAL)
- 1x t3.xlarge (Ollama CPU-only)

---

### ⚡ Ultra-Budget (Auto-Scaling)
**Estimated Cost:** $35-50/month ($420-600/year)

✅ Runs during business hours only  
✅ Auto-shutdown nights/weekends  
✅ Development environments

**Strategy:**
- Use AWS Lambda + CloudWatch Events for scheduled start/stop
- Run 40-50 hours/week vs 730 hours/month

---

## 🔧 Performance Expectations

### OSCAL Generator (t3.small)
- **Report Generation:** 2-5 seconds
- **AI Control Suggestions:** 5-15 seconds (depends on Ollama)
- **PDF Export:** 3-8 seconds
- **Concurrent Users:** 10-20
- **Memory Usage:** 300-500MB

### Ollama on g4dn.xlarge (GPU)
- **First Request:** 2-5 seconds (model loading)
- **Subsequent Requests:** 0.5-2 seconds
- **Concurrent Requests:** 3-5
- **Model Switch Time:** 3-5 seconds

### Ollama on t3.xlarge (CPU)
- **First Request:** 10-20 seconds
- **Subsequent Requests:** 5-10 seconds
- **Concurrent Requests:** 1-2
- **Model Switch Time:** 10-15 seconds

---

## 📊 Final Cost Comparison Table (Updated with Auto-Scaling)

| Configuration | Monthly | Annual | Ollama Uptime | Best For |
|--------------|---------|--------|---------------|----------|
| **🏆 Auto-Scale Light (CPU + ALB)** | **$94.68** | **$1,136** | 20% | **Most users - Best Value!** |
| **Auto-Scale Business (CPU + ALB)** | $99.67 | $1,196 | 25% | Business hours only |
| **Auto-Scale Light (GPU + ALB)** | $148.62 | $1,783 | 20% | Light usage, fast AI |
| **Budget (Single + CPU, No ALB)** | $146.25 | $1,755 | 100% | Simple deployment |
| **Auto-Scale Business (GPU + ALB)** | $164.40 | $1,973 | 25% | Business hours, high perf |
| **Cost-Optimized (CPU, No ALB)** | $163.03 | $1,956 | 100% | Always-on, moderate usage |
| **Auto-Scale Medium (CPU + ALB)** | $130.46 | $1,566 | 50% | Medium usage |
| **Auto-Scale Medium (GPU + ALB)** | $261.72 | $3,141 | 50% | Heavy usage |
| **Reserved Instances (GPU)** | $273.44 | $3,281 | 100% | Long-term commitment |
| **Production (GPU, No ALB)** | $425.52 | $5,106 | 100% | Enterprise, 24/7 |

---

## 💡 My Recommendations (Updated)

### 🏆 **BEST CHOICE: Auto-Scale Light with ALB + CPU**

**Cost:** **$94.68/month** ($1,136/year) ⭐

**Why This is Best:**
- ✅ **42% cheaper** than always-on setup ($68/month savings)
- ✅ **High Availability** with Application Load Balancer
- ✅ **Blue/Green deployment** maintained
- ✅ **Intelligent scaling** - Ollama wakes on-demand
- ✅ **4-hour idle timeout** - auto-shutdown when inactive
- ✅ **20% uptime** (~150 hours/month) - typical for 5-10 users
- ✅ **Zero waste** - only pay when AI is actually used
- ✅ **Professional setup** with monitoring & automation

**What You Get:**
1. Application Load Balancer (ALB) for traffic distribution
2. 2x OSCAL instances (Blue/Green) running 24/7
3. Ollama instance that auto-scales based on activity:
   - Shuts down when idle
   - Wakes up in ~2-3 minutes when AI query received
   - Stays active for 4 hours after last activity
   - Auto-shuts down again if no activity
4. Lambda functions for orchestration
5. CloudWatch monitoring
6. DynamoDB activity tracking

**Perfect For:** Most deployments with 5-10 users and moderate AI usage

---

### 🥈 **Second Best: Auto-Scale Business Hours**

**Cost:** $99.67/month ($1,196/year)

**Best for:** Teams that only work during business hours (8am-6pm, M-F)
- 25% uptime (180 hours/month)
- Save $63/month vs always-on

---

### 🥉 **Third Best: Traditional Cost-Optimized (No Auto-Scale)**

**Cost:** $163/month ($1,956/year)

**Best for:** Organizations that need 24/7 Ollama availability
- Always-on AI server
- No wake-up delay
- Simpler architecture (no Lambda/auto-scaling)
- CPU-only inference

---

### 💎 **Premium Option: Auto-Scale Light with GPU**

**Cost:** $148.62/month ($1,783/year)

**Best for:** Teams needing fast AI responses but not 24/7
- 10x faster AI inference
- Same auto-scaling benefits
- Only $54/month more than CPU version

---

## 📞 Implementation Steps

### Quick Start: Deploy Auto-Scaling Setup

**Estimated Setup Time:** 2-3 hours

#### Step 1: Deploy Core Infrastructure (30 minutes)

```bash
# 1. Create VPC and subnets (if not exists)
aws cloudformation create-stack \
  --stack-name oscal-vpc \
  --template-body file://cloudformation/vpc.yaml

# 2. Deploy Application Load Balancer
aws cloudformation create-stack \
  --stack-name oscal-alb \
  --template-body file://cloudformation/alb.yaml \
  --parameters ParameterKey=VPCId,ParameterValue=vpc-xxx

# 3. Deploy OSCAL instances (Blue/Green)
aws cloudformation create-stack \
  --stack-name oscal-instances \
  --template-body file://cloudformation/oscal-ec2.yaml
```

#### Step 2: Set Up Ollama Auto-Scaling (45 minutes)

```bash
# 1. Create DynamoDB table for activity tracking
aws dynamodb create-table \
  --table-name ollama-activity-tracking \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# 2. Create Launch Template for Ollama
aws ec2 create-launch-template \
  --launch-template-name ollama-ai-server \
  --launch-template-data file://ollama-launch-template.json

# 3. Create Auto Scaling Group (0-1 instance)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ollama-ai-server-asg \
  --launch-template LaunchTemplateName=ollama-ai-server \
  --min-size 0 \
  --max-size 1 \
  --desired-capacity 0 \
  --vpc-zone-identifier "subnet-abc,subnet-def"
```

#### Step 3: Deploy Lambda Controller (30 minutes)

```bash
# 1. Package Lambda function
cd lambda
zip -r ollama-controller.zip ollama_controller.py

# 2. Create Lambda function
aws lambda create-function \
  --function-name ollama-controller \
  --runtime python3.11 \
  --handler ollama_controller.lambda_handler \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --zip-file fileb://ollama-controller.zip \
  --timeout 300 \
  --memory-size 256

# 3. Grant Lambda permissions
aws lambda add-permission \
  --function-name ollama-controller \
  --statement-id AllowCloudWatchEvents \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com
```

#### Step 4: Configure CloudWatch Events (15 minutes)

```bash
# 1. Create idle check rule (every 30 minutes)
aws events put-rule \
  --name ollama-idle-check \
  --schedule-expression "rate(30 minutes)" \
  --state ENABLED

# 2. Add Lambda target
aws events put-targets \
  --rule ollama-idle-check \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT:function:ollama-controller","Input"='{"action":"check_idle"}'
```

#### Step 5: Update OSCAL Backend (30 minutes)

1. Modify `backend/server.js` to integrate Lambda wake-up
2. Add environment variables:
   ```bash
   OLLAMA_CONTROLLER_LAMBDA=ollama-controller
   OLLAMA_URL=http://ollama-internal.local:11434
   AWS_REGION=us-east-1
   ```
3. Deploy updated OSCAL application
4. Test AI query triggers wake-up

#### Step 6: Configure Monitoring (15 minutes)

```bash
# 1. Create CloudWatch Dashboard
aws cloudwatch put-dashboard \
  --dashboard-name oscal-monitoring \
  --dashboard-body file://cloudwatch-dashboard.json

# 2. Set up billing alerts
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget file://budget-alert.json

# 3. Enable detailed monitoring
aws ec2 monitor-instances \
  --instance-ids i-xxx i-yyy
```

---

### Cost Monitoring & Optimization

1. **Set Up AWS Budget Alerts**
   ```bash
   # Alert when costs exceed $100/month
   aws budgets create-budget \
     --account-id YOUR_ACCOUNT_ID \
     --budget '{
       "BudgetName": "oscal-monthly-budget",
       "BudgetLimit": {
         "Amount": "100",
         "Unit": "USD"
       },
       "TimeUnit": "MONTHLY",
       "BudgetType": "COST"
     }'
   ```

2. **Monitor Ollama Uptime**
   ```bash
   # Check actual vs estimated uptime
   aws cloudwatch get-metric-statistics \
     --namespace AWS/EC2 \
     --metric-name CPUUtilization \
     --dimensions Name=AutoScalingGroupName,Value=ollama-ai-server-asg \
     --start-time 2026-01-01T00:00:00Z \
     --end-time 2026-01-31T23:59:59Z \
     --period 3600 \
     --statistics Average
   ```

3. **Track Monthly Costs**
   - Use AWS Cost Explorer
   - Review monthly statements
   - Adjust auto-scaling parameters based on actual usage

4. **Optimize Based on Usage**
   - If uptime > 50%: Consider always-on setup
   - If uptime < 10%: Increase idle timeout to 6-8 hours
   - Monitor Lambda invocation costs

---

## 📊 Visual Cost Comparison: Auto-Scaling Impact

### Ollama Instance Costs by Uptime

```
┌────────────────────────────────────────────────────────────┐
│          Monthly Cost by Uptime Percentage (CPU)           │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  100% │████████████████████████████████████│ $121.47       │
│       │ (730 hours/month - Always On)       │              │
│       │                                      │              │
│   50% │████████████████│                    │ $60.74       │
│       │ (365 hours/month - Medium Usage)    │              │
│       │                                      │              │
│   25% │████████│                            │ $29.95       │
│       │ (180 hours/month - Business Hours)  │              │
│       │                                      │              │
│   20% │██████│                              │ $24.96 ⭐    │
│       │ (150 hours/month - Light Usage)     │ RECOMMENDED  │
│       │                                      │              │
│   10% │███│                                 │ $12.48       │
│       │ (75 hours/month - Very Light)       │              │
│       │                                      │              │
└────────────────────────────────────────────────────────────┘

💰 Savings vs Always-On (100%):
  • 20% uptime: Save $96/month ($1,157/year) - 79% savings
  • 25% uptime: Save $91/month ($1,097/year) - 75% savings
  • 50% uptime: Save $61/month ($730/year)   - 50% savings
```

### Total Monthly Cost Breakdown

```
┌──────────────────────────────────────────────────────────────┐
│              Component Cost Breakdown (Light Usage)           │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Load Balancer (ALB)        │████████│ $21.96    23.2%       │
│  OSCAL Green (t3.small)     │██████│   $15.18    16.0%       │
│  OSCAL Blue (t3.small)      │██████│   $15.18    16.0%       │
│  Ollama (t3.xlarge @ 20%)   │██████│   $24.96    26.4%       │
│  Storage (EBS)              │████│     $11.20    11.8%       │
│  Monitoring & Lambda        │██│       $6.20      6.6%       │
│                                                                │
│  TOTAL: $94.68/month                                          │
└──────────────────────────────────────────────────────────────┘
```

### Annual Cost Comparison

```
                      Auto-Scale    Always-On      Savings
                      (20% uptime)  (100% uptime)
────────────────────────────────────────────────────────────
CPU-Only Setup:       $1,136        $1,956         $820 ⭐
With GPU:             $1,783        $5,106         $3,323
Business Hours:       $1,196        $1,956         $760

🏆 Best Value: Auto-Scale CPU at $1,136/year (42% savings!)
```

---

## 🔗 Additional Resources

- [AWS EC2 Pricing Calculator](https://calculator.aws/)
- [AWS Cost Management Console](https://console.aws.amazon.com/cost-management/)
- [Ollama GPU vs CPU Performance](https://github.com/ollama/ollama/blob/main/docs/gpu.md)
- [AWS Reserved Instances](https://aws.amazon.com/ec2/pricing/reserved-instances/)
- [AWS Spot Instances](https://aws.amazon.com/ec2/spot/)

---

**Last Updated:** January 29, 2026  
**Author:** Mukesh Kesharwani  
**Pricing Source:** AWS US-East-1 (January 2026)

---

**Note:** All prices are estimates based on AWS pricing as of January 2026. Actual costs may vary based on:
- Regional pricing differences
- Actual usage patterns
- Data transfer volumes
- Additional services used
- Reserved Instance/Savings Plan commitments

Always use [AWS Pricing Calculator](https://calculator.aws/) for precise quotes.
