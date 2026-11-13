#!/usr/bin/env python3
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
"""Apply the Generic SSO / Guardian settings from a filled-in .env.docker to a TrueNAS app's environment.

Run it ON the TrueNAS host (it needs `sudo midclt`). It never prints values, only names, and it makes an owner-only
backup of the app's current configuration before changing anything. Dry run by default.

  sudo python3 scripts/truenas_apply_app_env.py --app oscal-reporter --env-file .env.docker           # show the plan
  sudo python3 scripts/truenas_apply_app_env.py --app oscal-reporter --env-file .env.docker --apply   # apply it

Optional --dns IP [IP ...] also sets the app's DNS servers. Use it when the host's own resolvers rewrite the SSO host to
a private address (the Guardian key fetch then refuses it). Use a resolver that returns the public address, and list
only the servers you want: TrueNAS sorts them and Docker asks the first one that answers.

Guide: docs/GUARDIAN_SSO_DOCKER_DEPLOYMENT.md
"""
import argparse
import ipaddress
import json
import os
import re
import subprocess
import sys
import time

# Only these names are passed on. Secrets (client secret, session secret) are deliberately not on the list.
ALLOWED = re.compile(r"^(OSCAL_GENERIC_SSO_(ISSUER|CLIENT_ID)|OSCAL_GENERIC_OIDC_TLS_RELAXED|OSCAL_GUARDIAN_[A-Z_]+)$")
SECRET_NAME = re.compile(r"SECRET|PASSWORD|PRIVATE", re.I)  # "TOKEN" is not here: MAX_TOKEN_AGE_SECONDS is a setting
PLACEHOLDER = re.compile(r"<[^<>\s][^<>]*>|REPLACE_WITH")


def parse_env_text(text):
    """Return ({name: value}, [skipped names]) from dotenv-style text. Raises ValueError for bad targets JSON."""
    values, skipped = {}, []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if not ALLOWED.match(name) or SECRET_NAME.search(name) or not value or PLACEHOLDER.search(value):
            skipped.append(name)
            continue
        if name == "OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON":
            try:
                if not isinstance(json.loads(value), list):
                    raise ValueError
            except ValueError:
                raise ValueError(f"{name} is not a valid JSON array (TrueNAS passes it literally, so no extra quotes)") from None
        values[name] = value
    return values, skipped


def parse_dns_servers(servers):
    """Validated, de-duplicated list of IP addresses for the app's DNS servers. Raises ValueError otherwise."""
    result = []
    for server in servers:
        try:
            address = str(ipaddress.ip_address(server.strip()))
        except ValueError:
            raise ValueError(f"'{server}' is not an IP address") from None
        if address not in result:
            result.append(address)
    if not result:
        raise ValueError("at least one DNS server is required")
    return result


def merge_envs(existing, new_values):
    """Existing environment list plus new values. Returns (merged, added names, changed names)."""
    current = {e["name"]: e["value"] for e in existing}
    added = [name for name in new_values if name not in current]
    changed = [name for name in new_values if name in current and current[name] != new_values[name]]
    merged = [dict(e, value=new_values[e["name"]]) if e["name"] in new_values else e for e in existing]
    merged += [{"name": name, "value": new_values[name]} for name in added]
    return merged, added, changed


def midclt(*args):
    return subprocess.run(["midclt", *args], capture_output=True, text=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--app", required=True, help="TrueNAS app name, for example oscal-reporter")
    parser.add_argument("--env-file", default=".env.docker")
    parser.add_argument("--dns", nargs="+", metavar="IP", help="set the app's DNS servers (replaces the current list)")
    parser.add_argument("--apply", action="store_true", help="make the change (default is a dry run)")
    parser.add_argument("--backup-dir", default=os.path.join(os.path.expanduser("~"), "oscal-backups"))
    args = parser.parse_args(argv)

    try:
        values, skipped = parse_env_text(open(args.env_file).read()) if os.path.exists(args.env_file) or not args.dns else ({}, [])
        dns_servers = parse_dns_servers(args.dns) if args.dns else None
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if not values and not dns_servers:
        print("error: nothing to apply (empty file, or every value is empty or still a <placeholder>)", file=sys.stderr)
        return 2

    result = midclt("call", "app.config", args.app)
    if result.returncode != 0:
        print(f"error: could not read app '{args.app}': {result.stderr.strip()[:200]}", file=sys.stderr)
        return 1
    config = json.loads(result.stdout)
    if "envs" not in config:
        print("error: this app has no 'envs' setting; it is not an ix-app (Custom App) created from an image", file=sys.stderr)
        return 1
    merged, added, changed = merge_envs(config["envs"], values)
    print(f"app: {args.app}")
    print(f"will add: {added}")
    print(f"will change: {changed}")
    print(f"kept unchanged: {[e['name'] for e in config['envs'] if e['name'] not in values]}")
    print(f"skipped (not allowed, empty or placeholder): {skipped}")
    if dns_servers:
        print(f"DNS servers: {config.get('dns_config', {}).get('nameservers')} -> {dns_servers}")
    if not args.apply:
        print("DRY RUN: nothing changed. Add --apply to make the change.")
        return 0

    os.makedirs(args.backup_dir, mode=0o700, exist_ok=True)
    backup = os.path.join(args.backup_dir, f"app-config-{args.app}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump(config, handle)
    print(f"backup (owner only, holds the app's settings): {backup}")

    new_values = {"envs": merged}
    if dns_servers:
        current_dns = config.get("dns_config", {})
        new_values["dns_config"] = {"nameservers": dns_servers, "options": current_dns.get("options", []), "searches": current_dns.get("searches", [])}
    update = midclt("call", "--job", "app.update", args.app, json.dumps({"values": new_values}))
    if update.returncode != 0:
        print(f"error: app.update failed: {update.stderr.strip()[-300:]}", file=sys.stderr)
        return 1
    print("updated; the app is being redeployed (users are signed out)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
