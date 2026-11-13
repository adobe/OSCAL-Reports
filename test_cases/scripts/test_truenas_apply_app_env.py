# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
import importlib.util
import json
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "truenas_apply_app_env.py"
spec = importlib.util.spec_from_file_location("truenas_apply_app_env", SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

TARGETS = '[{"provider":"cloudflare","targetId":"T1","label":"L","groups":["G"]}]'


class ParseEnvFile(unittest.TestCase):
    def test_reads_values_strips_matching_quotes_and_skips_comments(self):
        text = "\n".join([
            "# comment",
            "",
            "OSCAL_GENERIC_SSO_CLIENT_ID=abc",
            f"OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON='{TARGETS}'",
            'OSCAL_GUARDIAN_PRIVILEGED_GROUPS="Platform Admin"',
        ])
        values, skipped = tool.parse_env_text(text)
        self.assertEqual(values["OSCAL_GENERIC_SSO_CLIENT_ID"], "abc")
        self.assertEqual(json.loads(values["OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON"])[0]["targetId"], "T1")
        self.assertEqual(values["OSCAL_GUARDIAN_PRIVILEGED_GROUPS"], "Platform Admin")
        self.assertEqual(skipped, [])

    def test_only_oscal_sso_and_guardian_names_are_passed_on(self):
        values, skipped = tool.parse_env_text("PATH=/bin\nOSCAL_GENERIC_OIDC_CLIENT_SECRET=x\nOSCAL_GUARDIAN_ASSESSMENTS_ENABLED=true")
        self.assertEqual(list(values), ["OSCAL_GUARDIAN_ASSESSMENTS_ENABLED"])
        self.assertEqual(sorted(skipped), ["OSCAL_GENERIC_OIDC_CLIENT_SECRET", "PATH"])

    def test_every_name_in_the_template_is_accepted(self):
        names = [line.split("=", 1)[0].lstrip("# ").strip() for line in open(SCRIPT.parent.parent / ".env.docker.example")
                 if line.lstrip("# ").startswith("OSCAL_")]
        self.assertIn("OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS", names)
        for name in names:
            values, skipped = tool.parse_env_text(f"{name}=value-1" if not name.endswith("TARGETS_JSON") else f"{name}=[]")
            self.assertIn(name, values, f"{name} was skipped")

    def test_empty_values_and_unfilled_placeholders_are_skipped(self):
        values, skipped = tool.parse_env_text(
            "OSCAL_GENERIC_SSO_ISSUER=https://<sso-host>/application/o/<slug>/\nOSCAL_GUARDIAN_GENERIC_SSO_SCOPE=\nOSCAL_GENERIC_SSO_CLIENT_ID=ok")
        self.assertEqual(values, {"OSCAL_GENERIC_SSO_CLIENT_ID": "ok"})
        self.assertEqual(sorted(skipped), ["OSCAL_GENERIC_SSO_ISSUER", "OSCAL_GUARDIAN_GENERIC_SSO_SCOPE"])

    def test_invalid_targets_json_is_rejected(self):
        with self.assertRaises(ValueError):
            tool.parse_env_text("OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON=[{provider:cloudflare}]")


class MergeEnvs(unittest.TestCase):
    def test_adds_changes_and_keeps_the_rest_in_order(self):
        existing = [{"name": "NODE_ENV", "value": "beta"}, {"name": "OSCAL_GENERIC_SSO_CLIENT_ID", "value": "old"}]
        merged, added, changed = tool.merge_envs(existing, {"OSCAL_GENERIC_SSO_CLIENT_ID": "new", "OSCAL_GUARDIAN_ASSESSMENTS_ENABLED": "true"})
        self.assertEqual([e["name"] for e in merged], ["NODE_ENV", "OSCAL_GENERIC_SSO_CLIENT_ID", "OSCAL_GUARDIAN_ASSESSMENTS_ENABLED"])
        self.assertEqual(added, ["OSCAL_GUARDIAN_ASSESSMENTS_ENABLED"])
        self.assertEqual(changed, ["OSCAL_GENERIC_SSO_CLIENT_ID"])
        self.assertEqual(merged[1]["value"], "new")


class DnsServers(unittest.TestCase):
    def test_accepts_ip_addresses_only(self):
        self.assertEqual(tool.parse_dns_servers(["192.168.1.200", "2001:4860:4860::8888"]), ["192.168.1.200", "2001:4860:4860::8888"])
        for bad in (["dns.example.com"], ["999.1.1.1"], ["1.1.1.1; rm -rf /"], [""]):
            with self.assertRaises(ValueError):
                tool.parse_dns_servers(bad)

    def test_requires_at_least_one_and_removes_duplicates(self):
        self.assertEqual(tool.parse_dns_servers(["10.0.0.1", "10.0.0.1"]), ["10.0.0.1"])
        with self.assertRaises(ValueError):
            tool.parse_dns_servers([])


if __name__ == "__main__":
    unittest.main()
