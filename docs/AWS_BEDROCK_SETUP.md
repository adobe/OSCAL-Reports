# Amazon Bedrock Integration – Step-by-Step AWS Setup

This guide walks you through setting up **AWS** so the OSCAL Report Generator’s AI integration can call **Amazon Bedrock** and use supported LLM models (e.g. Mistral, Claude, Gemma) for control implementation suggestions.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Choose an AWS Region](#step-1-choose-an-aws-region)
- [Step 2: Enable Amazon Bedrock and Request Model Access](#step-2-enable-amazon-bedrock-and-request-model-access)
- [Step 3: Create an IAM User and Policy for Bedrock](#step-3-create-an-iam-user-and-policy-for-bedrock)
- [Step 4: Create Access Keys and Store Them Securely](#step-4-create-access-keys-and-store-them-securely)
- [Step 5: Configure the Application](#step-5-configure-the-application)
- [Step 6: Verify the Integration](#step-6-verify-the-integration)
- [Using multiple models (e.g. Gemma)](#using-multiple-models-eg-gemma)
- [Troubleshooting](#troubleshooting)
- [Cross-account and network access](#cross-account-and-network-access)
- [AWS Cloud Shell / CLI Commands](#aws-cloud-shell--cli-commands)
- [References](#references)

---

## Overview

The application uses the **Bedrock Runtime Converse API** (`InvokeModel` via the Converse API). It needs:

- **IAM**: A user (or role) with permission to call `bedrock:InvokeModel` in your chosen region.
- **Credentials**: AWS Access Key ID and Secret Access Key (or equivalent, e.g. role credentials when running on AWS).
- **Config**: `provider: "aws-bedrock"`, `awsRegion`, `bedrockModelId`, and credentials (in app config or via Settings UI).

Supported model families and routing are described in [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md).

---

## Prerequisites

- An **AWS account** with permissions to create IAM users and policies and to use Bedrock.
- **AWS Console** access (or AWS CLI) for the steps below.
- The application already has the Bedrock SDK dependency: `@aws-sdk/client-bedrock-runtime` (see `backend/package.json`).

---

## Step 1: Choose an AWS Region

Bedrock and model availability are **region-specific**. Use a region where the models you want are available.

- **Common regions**: `us-east-1` (N. Virginia), `us-west-2` (Oregon), `eu-west-1` (Ireland).
- Check current offerings: [AWS Console → Amazon Bedrock → Model access](https://console.aws.amazon.com/bedrock/) (left menu: **Model access**), or the [Bedrock user guide](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html).

**Example**: `us-east-1`. Use this value for `awsRegion` in the app config.

---

## Step 2: Enable Amazon Bedrock and Request Model Access

1. **Open Bedrock in the correct region**
   - AWS Console → switch region (top-right) to your chosen region (e.g. **us-east-1**).
   - Search for **Amazon Bedrock** and open it.

2. **Enable Bedrock and request models**
   - In the left menu, go to **Model access** (under **Settings** or **Get started**).
   - **Enable** Amazon Bedrock for your account in this region if prompted.
   - For each **foundation model** you want to use (e.g. Mistral Large, Claude, Gemma), click **Manage model access** (or **Request model access**) and **Enable** the model.
   - Model IDs you’ll use in the app look like:
     - Mistral: `mistral.mistral-large-2402-v1:0`, `mistral.mixtral-8x7b-v0:1`
     - Anthropic Claude: `anthropic.claude-3-sonnet-20240229-v1:0`, `anthropic.claude-3-haiku-20240307-v1:0`
     - Meta Llama: `meta.llama3-70b-instruct-v1:0`
     - Google Gemma: `google.gemma-3-12b-it`, `google.gemma-3-4b-it`
   - Wait until the model status is **Access granted** (can take a few minutes).

3. **Note the exact model ID**
   - Use the **Model ID** shown in the console (e.g. `mistral.mistral-large-2402-v1:0`) as `bedrockModelId` in the app. The router uses names containing `mistral`/`mixtral` for Mistral service and `gemma` for Gemma service; see [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md).

---

## Step 3: Create an IAM User and Policy for Bedrock

Use a dedicated IAM user (or role) with least privilege: only Bedrock invoke in the chosen region.

1. **Create an IAM policy**
   - IAM → **Policies** → **Create policy**.
   - **JSON** tab, use a policy like (replace `REGION` and `ACCOUNT_ID` if you want to restrict further; or use `*` for region/account for simplicity in a single-account setup):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "BedrockInvokeModel",
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:InvokeModelWithResponseStream"
         ],
         "Resource": "arn:aws:bedrock:REGION::foundation-model/*"
       }
     ]
   }
   ```

   - **Example for us-east-1, all foundation models**:  
     `"Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"`
   - Name the policy (e.g. `OSCAL-BedrockInvoke`) and create it.

2. **Create an IAM user**
   - IAM → **Users** → **Create user** (e.g. `oscal-bedrock-app`).
   - **Attach policies directly** → select the policy you created (e.g. `OSCAL-BedrockInvoke`).
   - Create the user.

This user will only be able to call Bedrock’s invoke APIs in the specified region(s), which is sufficient for the app.

**Using Gemma (and other models) with the same user:** The policy uses `arn:aws:bedrock:REGION::foundation-model/*`, so **one user can invoke any foundation model** (Mistral, Gemma, Claude, Llama, etc.) in that region. You do **not** need a new IAM user or policy to add Gemma. You only need to (1) enable the Gemma model in Bedrock (Model access), and (2) set `bedrockModelId` to a Gemma model ID in the app when you want to use Gemma. See [Using multiple models (e.g. Gemma)](#using-multiple-models-eg-gemma) below.

---

## Step 4: Create Access Keys and Store Them Securely

1. **Create access key for the IAM user**
   - IAM → **Users** → select the user (e.g. `oscal-bedrock-app`) → **Security credentials** tab.
   - **Access keys** → **Create access key**.
   - Choose **Application running outside AWS** (or as appropriate).
   - Create the key; **download or copy the Access Key ID and Secret Access Key once**. The secret is not shown again.

2. **Store credentials securely**
   - **Do not** commit keys to git or put them in plain text in config that is committed.
   - Prefer:
     - **Settings UI**: Enter in the AI Integration screen (stored in your app config; ensure config and backups are protected and access is restricted).
     - **Config file**: Use `config/app/config.json` with file permissions restricted, or use pointers to a secret manager (e.g. [pass](https://www.passwordstore.org/) as in [DEPLOYMENT.md](DEPLOYMENT.md): e.g. `"_pass": "OSCAL/ai-aws-access-key-id"` and `"_pass": "OSCAL/ai-aws-secret-access-key"`).
   - For production, use a secret manager (AWS Secrets Manager, HashiCorp Vault, or your org’s standard) and resolve credentials at runtime; the app expects `awsAccessKeyId` and `awsSecretAccessKey` in the config object it receives (see [Step 5](#step-5-configure-the-application)).

---

## Step 5: Configure the Application

Provide Bedrock as the AI provider and the required parameters.

**Option A – Settings UI (recommended for quick setup)**

1. Log in as an admin.
2. Open **Settings** → **AI Integration**.
3. Set:
   - **Provider**: **AWS Bedrock**.
   - **AWS Region**: e.g. `us-east-1`.
   - **Bedrock Model ID**: e.g. `mistral.mistral-large-2402-v1:0` (must match a model you enabled in [Step 2](#step-2-enable-amazon-bedrock-and-request-model-access)).
   - **AWS Access Key ID** and **AWS Secret Access Key**: the keys from [Step 4](#step-4-create-access-keys-and-store-them-securely).
4. Save. The app will persist these in `config/app/config.json` (or your configured config store).

**Option B – Config file**

Edit `config/app/config.json` (or the config that your deployment uses) so that the AI section looks like this (credentials can be replaced by env or secret-manager resolution if your setup supports it):

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "awsAccessKeyId": "YOUR_ACCESS_KEY_ID",
    "awsSecretAccessKey": "YOUR_SECRET_ACCESS_KEY",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "timeout": 120000
  }
}
```

- Use the **exact** `bedrockModelId` from the Bedrock console.
- For **Gemma**-based models, set `bedrockModelId` to a Gemma model ID (e.g. `google.gemma-3-12b-it` or `google.gemma-3-4b-it`); the app will route to the Gemma service. See [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md).

**Option C – Environment variables (if your config layer supports it)**

Some deployments resolve secrets from the environment. The app itself reads from the resolved `aiConfig` (e.g. from `configManager`). If your config builder maps environment variables into `aiConfig`, you could use e.g.:

- `AWS_REGION` or `AWS_DEFAULT_REGION` (documented in [ARCHITECTURE.md](ARCHITECTURE.md))
- AWS credentials: typically `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (if your config populates `aiConfig.awsAccessKeyId` and `aiConfig.awsSecretAccessKey` from these).

Ensure the backend is restarted (or config reloaded) after changes.

**Where Bedrock credentials (Access Key ID and Secret) are stored**

- **Config file** (`config/app/config.json`) never holds the actual secret values when using [pass](https://www.passwordstore.org/). It only holds **pointers** like `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-01" }` for `awsAccessKeyId` and `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-02" }` for `awsSecretAccessKey`. At runtime the backend runs `pass show <entry>` and substitutes the value.
- **Actual storage** is in **pass** at the paths you set:
  - If you use custom pass entries (e.g. `AWS/1590_Oz_Stage/BEDROCK-01` and `BEDROCK-02`), the Access Key ID and Secret are stored only there. They do **not** appear under `OSCAL/` in `pass ls`; they appear under `AWS/1590_Oz_Stage/`.
  - If you **type** credentials in the Settings UI and click **Save**, the app writes them into pass at **`OSCAL/ai-aws-access-key-id`** and **`OSCAL/ai-aws-secret-access-key`** (and updates config to point to those). So after a save from the UI, `pass ls OSCAL/` would show those entries.
- To use credentials that already live in pass under a different path (e.g. `AWS/1590_Oz_Stage/BEDROCK-01`), edit `config/app/config.json` and set `aiConfig.awsAccessKeyId` and `aiConfig.awsSecretAccessKey` to `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-01" }` and `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-02" }` (or your paths). Do not overwrite by saving from the UI with new typed values, or the app will write to `OSCAL/ai-aws-*` and replace the pointers.

---

## Step 6: Verify the Integration

1. **Backend**
   - Restart the backend so it loads the new config (or use your app’s config reload if available).

2. **Status endpoint**
   - Call `GET /api/ai/status` (with auth if required). You should see `provider: "aws-bedrock"` and no error reason; the app may report that credentials are not validated until the first call.

3. **Connection test from the UI**
   - In **Settings** → **AI Integration**, use the **Test connection** (or equivalent) control. It should call Bedrock with a small prompt and report success or a clear error.

4. **Generate a suggestion**
   - Open a control and trigger an AI-generated implementation suggestion. The first successful call confirms that Bedrock and the chosen model are working.

If you see **Access Denied**, check IAM policy and that the correct access key is used. If you see **Model not found**, confirm the model ID and that the model is enabled in that region (Step 2).

---

## Using multiple models (e.g. Gemma)

**IAM:** You do **not** need to create a new user or change the IAM policy. The policy `arn:aws:bedrock:REGION::foundation-model/*` allows invoking **all** foundation models in that region (Mistral, Gemma, Claude, Llama, etc.). The same user can call any of them.

**To use Gemma (or another model family) with the same user:**

1. **Enable the model in Bedrock**  
   In the **Bedrock** console (same region as your `awsRegion`): **Model access** → find the Gemma model(s) you want (e.g. **Gemma 3 12B**, **Gemma 3 4B**) → **Enable** / request access. Wait until access is granted. Note the exact **Model ID** (e.g. `google.gemma-3-12b-it`, `google.gemma-3-4b-it`).

2. **Switch the app to that model**  
   In **Settings** → **AI Integration** (or in `config/app/config.json`):
   - Keep **Provider**: **AWS Bedrock**.
   - Set **Bedrock Model ID** to the Gemma model ID (e.g. `google.gemma-3-12b-it` or `google.gemma-3-4b-it`).
   - Keep the same **AWS Region** and credentials (same user).

3. **No code or IAM change**  
   The app’s router detects the model family from `bedrockModelId`: if it contains `gemma`, requests go to the Gemma service; if it contains `mistral` or `mixtral`, they go to the Mistral service. You can switch between Mistral and Gemma anytime by changing only `bedrockModelId`.

**Summary:** Same user, same credentials; enable the Gemma model in Bedrock, then set `bedrockModelId` to the Gemma model ID when you want to use Gemma.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| **AccessDeniedException** | IAM user has `bedrock:InvokeModel` (and optionally `bedrock:InvokeModelWithResponseStream`) on `arn:aws:bedrock:REGION::foundation-model/*`; correct keys and region in config. |
| **ResourceNotFoundException** | Model ID matches the console exactly; model is **Enabled** in **Model access** in the same region as `awsRegion`. |
| **ThrottlingException** | Request limits for the model in that region; retry with backoff or request a quota increase. |
| **Credentials not configured** | `awsAccessKeyId` and `awsSecretAccessKey` are both set in the config the app reads (Settings or config file / secret resolution). |
| **AWS SDK not installed** | Run `npm install @aws-sdk/client-bedrock-runtime` in the backend directory and restart. |

For more on AI configuration and model families, see [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md) and [AI_ARCHITECTURE_SECURITY.md](AI_ARCHITECTURE_SECURITY.md).

---

## Cross-account and network access

If your **GUI/backend runs in one AWS account** and you want to use **Bedrock in another account** (or you’re unsure what to allow), use this section.

### How Bedrock works across accounts

- **Bedrock is a regional API service.** You don’t “have Bedrock” inside a VPC. Your app (in any account or on-prem) calls the Bedrock endpoint (e.g. `bedrock-runtime.us-east-1.amazonaws.com`) over HTTPS.
- **Billing** goes to the account whose **IAM credentials** are used for the call. So “Bedrock in account B” usually means “use credentials from account B when calling Bedrock.”

You only need two things: **credentials** (who is allowed and who is billed) and **network** (can the app reach the Bedrock API).

---

### 1. Network access (same account or cross-account)

The app must be able to open **outbound HTTPS (port 443)** to the Bedrock API in the chosen region.

| Where the app runs | What you need |
|--------------------|----------------|
| **Public internet or EC2 with public IP / NAT** | No extra config. Default outbound rules usually allow HTTPS. |
| **Private subnet (no internet)** | Either **(a)** a **NAT Gateway** (or similar) so the app can reach the internet, or **(b)** a **VPC endpoint** for Bedrock in the **same account and region** as the app so traffic stays inside AWS. |
| **On-prem or another cloud** | Outbound HTTPS to `bedrock-runtime.<region>.amazonaws.com` allowed (and any proxy/firewall rules). No AWS VPC peering or PrivateLink between accounts is required for Bedrock. |

**No special “network between the two accounts”** is required. Bedrock is not in your VPC; the app always talks to the public (or endpoint) Bedrock hostname. There is no VPC peering or PrivateLink *between* account A and account B for Bedrock.

**If the app runs in a VPC in the GUI account (Account A):**

- Ensure the subnet has a route to the internet (e.g. via NAT) **or** create an interface endpoint in that VPC for **Bedrock Runtime**:
  - Service name: `com.amazonaws.<region>.bedrock-runtime`  
  - Example: `com.amazonaws.us-east-1.bedrock-runtime`
- Security groups must allow **outbound** HTTPS (443) to that endpoint or to the internet, as applicable.

---

### 2. Cross-account: use credentials from the “Bedrock account” (Account B)

If the **GUI/backend is in Account A** and you want **Account B to be billed** and authorized for Bedrock:

1. **In Account B (Bedrock account)**  
   - Create an IAM role (e.g. `OSCAL-BedrockCrossAccount`) with:
     - **Trust policy:** allow Account A (or a specific IAM role/user in A) to assume this role.
     - **Permissions:** same as in [Step 3](#step-3-create-an-iam-user-and-policy-for-bedrock) — `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on `arn:aws:bedrock:<region>::foundation-model/*`.

2. **In Account A (app account)**  
   - Give the app permission to call **STS AssumeRole** on Account B’s role (e.g. attach a policy allowing `sts:AssumeRole` on `arn:aws:iam::B_ACCOUNT_ID:role/OSCAL-BedrockCrossAccount`).

3. **In the application**  
   - Instead of storing long-lived Access Key / Secret Key from B, the app (or a small service in A) **assumes** B’s role, gets temporary credentials, and uses those to call Bedrock. The app still uses the same Bedrock **region** and **model ID**; only the credential source changes.

The OSCAL app today is built to use **static credentials** (Access Key ID + Secret Access Key). To use cross-account cleanly you’d either:

- Run a small credential helper in Account A that assumes the role in B and exposes temporary keys (or an endpoint that the app calls), or  
- Use the same pattern as today but with **temporary** keys from B (e.g. you assume the role in B, get temp credentials, and put them in the app for a limited time — not ideal for production), or  
- Extend the app to support **assuming an IAM role** (e.g. via `AWS_STS_REGIONAL_ENDPOINTS` and the SDK) when `provider` is `aws-bedrock`.

So for **cross-account**, the main work is **IAM (trust + assume role)**; you do **not** need to “allow network access” between the two accounts for Bedrock specifically. The app in A still talks to the Bedrock API endpoint; only the credentials identify (and bill) Account B.

---

### 3. Same account: GUI and Bedrock in one account

If both the app and the Bedrock credentials are in the **same** account:

- **Credentials:** Create the IAM user and policy in that account as in [Step 3](#step-3-create-an-iam-user-and-policy-for-bedrock) and [Step 4](#step-4-create-access-keys-and-store-them-securely).
- **Network:** Ensure the host running the app can reach the Bedrock API (outbound HTTPS, or VPC endpoint for Bedrock in that account as above). No cross-account setup.

---

### Summary

| Scenario | Network | Credentials / IAM |
|----------|---------|-------------------|
| App and Bedrock in **same account** | Outbound HTTPS to Bedrock (or VPC endpoint in that account) | IAM user/role in that account with `bedrock:InvokeModel`. |
| App in **Account A**, Bedrock billing in **Account B** | Same as above (no link between A and B networks). App in A must reach Bedrock API. | Role in B with Bedrock permissions; trust A to assume it. App (or helper in A) assumes B’s role and uses temp credentials. |
| App **on-prem / other cloud** | Allow outbound HTTPS to `bedrock-runtime.<region>.amazonaws.com`. | Use IAM user (or role) credentials from the account that should be billed; no cross-account network. |

So: **you do not need to “allow network access” between two AWS accounts for Bedrock.** You only need the app to reach the Bedrock API (HTTPS or VPC endpoint) and the right credentials (same-account or cross-account assume-role).

---

## AWS Cloud Shell / CLI Commands

You can run the following in **AWS Cloud Shell** (or any environment with AWS CLI configured with sufficient permissions). Set variables at the top, then run each block in order.

### 1. Set variables and list available models

```bash
# Region (e.g. us-east-1, us-west-2, eu-west-1)
export AWS_REGION=us-east-1

# Optional: list TEXT foundation models to see model IDs
aws bedrock list-foundation-models \
  --region "$AWS_REGION" \
  --by-output-modality TEXT \
  --query 'modelSummaries[*].[modelId,modelName,providerName]' \
  --output table
```

### 2. Request model access (enable a foundation model) — optional for many models

Set `BEDROCK_MODEL_ID` to the model you want (e.g. `mistral.mistral-large-2402-v1:0`). Only run the agreement commands if the model uses the offer flow.

```bash
# Model to use (must match a model ID from list-foundation-models)
export BEDROCK_MODEL_ID=mistral.mistral-large-2402-v1:0

# Try to get offer token and create agreement (skip if you see "Agreement not supported")
OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
  --region "$AWS_REGION" \
  --model-id "$BEDROCK_MODEL_ID" \
  --query 'offers[0].offerToken' \
  --output text 2>/dev/null) || true

if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
  aws bedrock create-foundation-model-agreement \
    --region "$AWS_REGION" \
    --model-id "$BEDROCK_MODEL_ID" \
    --offer-token "$OFFER_TOKEN"
else
  echo "Agreement not required for this model (or not supported). Proceed to IAM and invoke."
fi
```

**If you see `ValidationException: Agreement not supported for this model`:**  
That model (e.g. Mistral) does not use the agreement API. You can **skip this step**. In many regions, such models are already available or get access on first invocation. Proceed to [Step 3](#3-create-iam-policy-for-bedrock-invoke) (IAM policy and user).

### 3. Create IAM policy for Bedrock invoke

```bash
# Policy name (change if you prefer)
export POLICY_NAME=OSCAL-BedrockInvoke

# Create the policy (allows InvokeModel in your region)
aws iam create-policy \
  --policy-name "$POLICY_NAME" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "BedrockInvokeModel",
        "Effect": "Allow",
        "Action": [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ],
        "Resource": "arn:aws:bedrock:'"$AWS_REGION"'::foundation-model/*"
      }
    ]
  }' \
  --description "Allow Bedrock InvokeModel for OSCAL Report Generator"
```

Note the returned **Arn** (e.g. `arn:aws:iam::123456789012:policy/OSCAL-BedrockInvoke`). Use your account ID in the next step if you don’t capture it.

### 4. Create IAM user and attach policy

```bash
# User name (change if you prefer)
export BEDROCK_USER_NAME=oscal-bedrock-app

# Create user
aws iam create-user --user-name "$BEDROCK_USER_NAME"

# Get your account ID and attach the policy (replace ACCOUNT_ID if you know it)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-user-policy \
  --user-name "$BEDROCK_USER_NAME" \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
```

### 5. Create access key and show credentials

```bash
# Create access key for the user
OUTPUT=$(aws iam create-access-key --user-name "$BEDROCK_USER_NAME" --output json)

# Display credentials (store securely; secret is shown only once)
echo "=== Store these securely; SecretAccessKey is not shown again ==="
echo "AWS Region (use as awsRegion in app): $AWS_REGION"
echo "Bedrock Model ID (use as bedrockModelId in app): $BEDROCK_MODEL_ID"
echo "AWS Access Key ID: $(echo "$OUTPUT" | jq -r '.AccessKey.AccessKeyId')"
echo "AWS Secret Access Key: $(echo "$OUTPUT" | jq -r '.AccessKey.SecretAccessKey')"
```

Copy **Access Key ID** and **Secret Access Key** into your app config (Settings → AI Integration or `config/app/config.json`). Do not commit them to git.

### 6. Optional: enable more models

For models that use the agreement API (e.g. some Anthropic/Claude models), repeat step 2 with the new model ID. If you get **"Agreement not supported for this model"**, skip the agreement and use the model directly—access may be automatic.

### 6b. Enable Gemma models (Model access) via CLI

Use these commands to **list Gemma models** in your region and **enable** them (request model access) when the agreement API is supported.

**1. List Gemma foundation models and note Model IDs**

```bash
# Same region as your app (e.g. us-east-1)
export AWS_REGION=us-east-1

# List Gemma models (provider = Google)
aws bedrock list-foundation-models \
  --region "$AWS_REGION" \
  --by-provider "Google" \
  --by-output-modality TEXT \
  --query 'modelSummaries[*].[modelId,modelName,providerName]' \
  --output table
```

Note the **Model ID** you want (e.g. `google.gemma-3-12b-it`, `google.gemma-3-4b-it`).

**2. Request model access (enable) for a Gemma model**

Replace `GEMMA_MODEL_ID` with the exact ID from the list (e.g. `google.gemma-3-12b-it`).

```bash
# Gemma model to enable (e.g. Gemma 3 12B)
export GEMMA_MODEL_ID=google.gemma-3-12b-it

# Get offer token and create agreement (skip if "Agreement not supported")
OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
  --region "$AWS_REGION" \
  --model-id "$GEMMA_MODEL_ID" \
  --query 'offers[0].offerToken' \
  --output text 2>/dev/null) || true

if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
  aws bedrock create-foundation-model-agreement \
    --region "$AWS_REGION" \
    --model-id "$GEMMA_MODEL_ID" \
    --offer-token "$OFFER_TOKEN"
  echo "Enabled: $GEMMA_MODEL_ID"
else
  echo "Agreement not supported for $GEMMA_MODEL_ID (may already be available). Use this model ID in the app."
fi
```

**3. Enable multiple Gemma variants (optional)**

```bash
# Example: enable Gemma 3 12B and Gemma 3 4B
for ID in google.gemma-3-12b-it google.gemma-3-4b-it; do
  OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
    --region "$AWS_REGION" --model-id "$ID" \
    --query 'offers[0].offerToken' --output text 2>/dev/null) || true
  if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
    aws bedrock create-foundation-model-agreement \
      --region "$AWS_REGION" --model-id "$ID" --offer-token "$OFFER_TOKEN"
    echo "Enabled: $ID"
  else
    echo "Skip or already available: $ID"
  fi
done
```

If you see **"Agreement not supported for this model"**, the model may be available without this step; use the Model ID in **Settings → AI Integration → Bedrock Model ID** and test.

### 7. Optional: verify from CLI (invoke Bedrock)

```bash
# Quick test (uses default credentials in Cloud Shell; or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
aws bedrock-runtime converse \
  --region "$AWS_REGION" \
  --model-id "$BEDROCK_MODEL_ID" \
  --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' \
  --inference-config '{"maxTokens":10,"temperature":0}'
```

If this succeeds, the same region, model ID, and credentials will work in the OSCAL Report Generator when configured in Settings → AI Integration.

---

## References

- [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md) – Supported models, config, and routing (Mistral vs Gemma).
- [ARCHITECTURE.md](ARCHITECTURE.md) – Environment variables and high-level AI integration.
- [DEPLOYMENT.md](DEPLOYMENT.md) – Secret storage (e.g. pass) for production.
- [AWS Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html)
- [Bedrock Converse API (Mistral example)](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_Converse_Mistral_section.html)
- [Bedrock model IDs and regions](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html)
