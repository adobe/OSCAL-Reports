# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Splunk Universal Forwarder SCC bootstrap (SSAAU-212 NotSendingSyslog).
# See docs/AWS_OPERATIONS.md and Adobe wiki: Getting Your Logs into Security Splunk SCC.

locals {
  oscal_splunk_bootstrap_script_body = var.oscal_splunk_uf_bootstrap_enabled ? templatefile("${path.module}/templates/oscal-splunk-uf-bootstrap.sh.tftpl", {
    deployment_server = var.oscal_splunk_deployment_server
    client_name       = var.oscal_splunk_client_name
    aws_account_id    = var.aws_account_id
    aws_region        = var.aws_region
  }) : ""

  oscal_splunk_bootstrap_install_path = "/usr/local/sbin/oscal-splunk-uf-bootstrap.sh"

  # User-data: install script on disk and run once at first boot.
  oscal_splunk_bootstrap_user_data_fragment = var.oscal_splunk_uf_bootstrap_enabled ? join("\n", [
    "# Splunk UF SCC bootstrap (SSAAU-212)",
    "cat > ${local.oscal_splunk_bootstrap_install_path} << 'OSCAL_SPLUNK_BOOTSTRAP_EOF'",
    local.oscal_splunk_bootstrap_script_body,
    "OSCAL_SPLUNK_BOOTSTRAP_EOF",
    "chmod 755 ${local.oscal_splunk_bootstrap_install_path}",
    "bash ${local.oscal_splunk_bootstrap_install_path} || echo \"oscal-user-data: splunk bootstrap failed (non-fatal)\" >&2",
  ]) : ""

  oscal_ssm_splunk_bootstrap_lines = var.oscal_splunk_uf_bootstrap_enabled ? concat(
    [
      "if [ ! -x ${local.oscal_splunk_bootstrap_install_path} ]; then",
      "  cat > ${local.oscal_splunk_bootstrap_install_path} << 'OSCAL_SPLUNK_BOOTSTRAP_EOF'",
    ],
    split("\n", local.oscal_splunk_bootstrap_script_body),
    [
      "OSCAL_SPLUNK_BOOTSTRAP_EOF",
      "  chmod 755 ${local.oscal_splunk_bootstrap_install_path}",
      "fi",
      "${local.oscal_splunk_bootstrap_install_path} || echo \"oscal-ssm: splunk bootstrap failed (non-fatal)\" >&2",
      "if [ -f /opt/splunkforwarder/var/log/splunk/splunkd.log ]; then",
      "  if grep -q 'DC:HandshakeReplyHandler - Handshake done' /opt/splunkforwarder/var/log/splunk/splunkd.log 2>/dev/null; then",
      "    echo \"oscal-ssm: Splunk UF deployment-server handshake OK\"",
      "  else",
      "    echo \"oscal-ssm: WARNING Splunk UF handshake not seen yet (wait up to 30 min after bootstrap; SSAAU-212)\" >&2",
      "  fi",
      "fi",
    ],
  ) : []
}
