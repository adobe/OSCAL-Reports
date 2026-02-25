# Ollama Debug Scripts (scripts/debug/)

Scripts under `scripts/debug/` related to Ollama instance and NLB. All Ollama setup logic lives in **one script** as subcommands (no wrapper scripts).

## Single script: run-install-ollama-on-instance.sh

All wake, volume check, install, and listener logic is in this file. Use the first argument as subcommand:

| Subcommand | What it does |
|------------|---------------|
| **(none)** or **full** | Full flow: wake Lambda → ensure instance (scale ASG or create) → check volume → install Ollama + mistral:7b + gemma3:latest → configure listener (11434 from VPC only, not public). |
| **wake** | Invoke wake Lambda only; wait for instance; print IP. |
| **volume** | Report EBS volume size(s) for the running Ollama instance; warn if root &lt; 150 GB. |
| **listener** [IP] | Configure listener only (OLLAMA_HOST=0.0.0.0, firewalld 11434 from VPC only). Optional IP or set OLLAMA_INSTANCE_IP. |

**Usage (from repo root):**

```bash
./scripts/debug/run-install-ollama-on-instance.sh
./scripts/debug/run-install-ollama-on-instance.sh wake
./scripts/debug/run-install-ollama-on-instance.sh volume
./scripts/debug/run-install-ollama-on-instance.sh listener [IP]
```

## Other scripts in scripts/debug/

| Script | Role |
|--------|------|
| **check-ollama-connectivity.sh** | Diagnostics: Ollama on instance (install, service, models), NLB from instance, Green/Blue → NLB. Read-only. |

## New Ollama instance (target stays Unhealthy)

After scale-up or replace, if the NLB target stays **Unhealthy** (e.g. user_data timed out), run `./scripts/debug/run-install-ollama-on-instance.sh` (full flow) or `./scripts/debug/run-install-ollama-on-instance.sh listener <ip>` to ensure Ollama listens on 0.0.0.0 and firewalld allows 11434; wait 1–2 min for the target to become healthy.

## When to use which

- **Full ensure + install + fix**: `./scripts/debug/run-install-ollama-on-instance.sh`
- **Only wake instance**: `./scripts/debug/run-install-ollama-on-instance.sh wake`
- **Only volume report**: `./scripts/debug/run-install-ollama-on-instance.sh volume`
- **Only fix listener (internal-only)**: `./scripts/debug/run-install-ollama-on-instance.sh listener` or `listener <IP>`
- **Diagnostics**: `./scripts/debug/check-ollama-connectivity.sh`
