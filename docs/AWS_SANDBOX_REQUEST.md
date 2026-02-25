# AWS Sandbox Account Request

This document records the service request used to obtain a **designated AWS Sandbox account** for deploying the OSCAL Report Generator and Ollama AI server (see [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md)).

---

## Jira Service Request

Use the following ticket when requesting the designated AWS Sandbox account:

| Field | Value |
|-------|--------|
| **Ticket number** | **SVCMREQ-50154** |
| **URL** | https://jira.corp.adobe.com/browse/SVCMREQ-50154 |

---

## Purpose

- **Service**: Designated AWS Sandbox account for OSCAL Report Generator deployment.
- **Use case**: EC2-based deployment (OSCAL Blue/Green + Ollama auto-scaling), S3 for logs and activity state, Lambda for wake/sleep controller, as described in [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md).

---

## Reference

- **Cost and architecture**: [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md)
- **Cloud deployment overview**: [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md)
