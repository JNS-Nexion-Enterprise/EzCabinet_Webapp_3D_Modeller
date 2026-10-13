# One company is one file in ../tenants. The filename is its slug. The app
# reads the same files, so this is the only list of companies there is.
locals {
  tenant_dir = "${path.module}/../tenants"
  tenants = {
    for f in fileset(local.tenant_dir, "*.json") :
    trimsuffix(f, ".json") => jsondecode(file("${local.tenant_dir}/${f}"))
  }
}

module "client" {
  source   = "./modules/client"
  for_each = local.tenants

  slug    = each.key
  tenant  = each.value
  secrets = merge(var.shared_secrets, lookup(var.secrets, each.key, {}))
}

# One rule for the whole fleet, replacing docs/ops/vercel-5xx-alert.json.
resource "vercel_alert_rule" "server_errors" {
  type = "built-in"
  name = "Planner server 5xx anomalies"
  rule_scope = {
    type        = "include"
    project_ids = [for c in module.client : c.project_id]
  }
  triggers = [{
    type   = "error_anomaly"
    filter = "statusGroup:5xx"
  }]
  match_minimum_severity_level = "high"
  notification_settings = {
    enable_team_owner_notifications = true
  }
}
