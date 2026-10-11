terraform {
  required_providers {
    vercel = { source = "vercel/vercel" }
    random = { source = "hashicorp/random" }
  }
}

locals {
  # Every env var a person supplies. A name outside this list is a typo.
  secret_names = [
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "RESEND_API_KEY",
    "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_APP_SECRET",
    "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET",
    "MUX_TOKEN_ID", "MUX_TOKEN_SECRET",
    "GOOGLE_GEOCODING_API_KEY",
    "LALAMOVE_API_KEY", "LALAMOVE_API_SECRET",
    "EASYPARCEL_CLIENT_ID", "EASYPARCEL_CLIENT_SECRET",
    "GDEX_PRIMARY_API_KEY", "GDEX_SECONDARY_API_SECRET", "GDEX_USER_TOKEN",
    "FEDEX_API_URL", "FEDEX_API_KEY", "FEDEX_API_PASSWORD", "FEDEX_ACCOUNT_NUMBER",
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  ]

  origin = "https://${var.tenant.domain}"

  # Not secret, and different per company.
  config = { for k, v in {
    TENANT                   = var.slug
    BETTER_AUTH_URL          = local.origin
    APP_URL                  = local.origin
    EMAIL_FROM               = var.tenant.emailFrom
    PAYMENT_GATEWAY_FALLBACK = var.tenant.paymentGatewayFallback
    WHATSAPP_SALES_NUMBER    = var.tenant.whatsappSalesNumber
  } : k => v if v != null && v != "" }

  # Made here so no two companies share one and nobody ever types one.
  generated = {
    BETTER_AUTH_SECRET       = random_password.generated["BETTER_AUTH_SECRET"].result
    CRON_SECRET              = random_password.generated["CRON_SECRET"].result
    EASYPARCEL_WEBHOOK_TOKEN = random_password.generated["EASYPARCEL_WEBHOOK_TOKEN"].result
    WHATSAPP_VERIFY_TOKEN    = random_password.generated["WHATSAPP_VERIFY_TOKEN"].result
    FLAGS_SECRET             = random_id.flags_secret.b64_url
  }
}

resource "random_password" "generated" {
  for_each = toset(["BETTER_AUTH_SECRET", "CRON_SECRET", "EASYPARCEL_WEBHOOK_TOKEN", "WHATSAPP_VERIFY_TOKEN"])
  length   = 48
  special  = false
}

# The Flags SDK wants exactly 32 random bytes, base64url.
resource "random_id" "flags_secret" {
  byte_length = 32
}

# Not linked to git: a client project is deployed by the release job only, so
# a pull request never builds one preview per company. Region, build command
# and cron come from vercel.json, which every deployment carries.
resource "vercel_project" "this" {
  name         = "planner-${var.slug}"
  framework    = "nextjs"
  node_version = "24.x"
}

resource "vercel_blob_store" "this" {
  name   = "planner-${var.slug}"
  access = "private"
  region = "sin1"
}

# Sets BLOB_READ_WRITE_TOKEN on the project.
resource "vercel_blob_project_connection" "this" {
  blob_store_id = vercel_blob_store.this.id
  project_id    = vercel_project.this.id
  environments  = ["production"]
}

resource "vercel_project_environment_variable" "config" {
  for_each   = local.config
  project_id = vercel_project.this.id
  key        = each.key
  value      = each.value
  target     = ["production"]
  sensitive  = false
}

resource "vercel_project_environment_variable" "generated" {
  for_each   = toset(keys(local.generated))
  project_id = vercel_project.this.id
  key        = each.key
  value      = local.generated[each.key]
  target     = ["production"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "secret" {
  for_each   = toset(nonsensitive(keys(var.secrets)))
  project_id = vercel_project.this.id
  key        = each.key
  value      = var.secrets[each.key]
  target     = ["production"]
  sensitive  = true
}

# The domain's nameservers must already point at Vercel. Passkeys bind to
# this hostname: once customers enrol, it never changes.
resource "vercel_project_domain" "this" {
  project_id = vercel_project.this.id
  domain     = var.tenant.domain
}

resource "vercel_dns_record" "mail" {
  for_each = { for r in var.tenant.dnsRecords : "${r.type} ${r.name} ${r.value}" => r if r.type != "MX" }
  domain   = each.value.zone
  name     = each.value.name
  type     = each.value.type
  value    = each.value.value
  ttl      = 3600
}

# Separate because the provider accepts mx_priority on an MX record only.
resource "vercel_dns_record" "mail_mx" {
  for_each    = { for r in var.tenant.dnsRecords : "${r.name} ${r.value}" => r if r.type == "MX" }
  domain      = each.value.zone
  name        = each.value.name
  type        = "MX"
  value       = each.value.value
  mx_priority = each.value.mxPriority
  ttl         = 3600
}

# The wall outside the app's own limit on emailed sign-in codes. Ninety an
# hour is three times the app's thirty, so a real customer meets the app's
# message first (docs/ops/customer-passkey-runbook.md).
resource "vercel_firewall_config" "this" {
  project_id = vercel_project.this.id

  rules {
    rule {
      name        = "Sign-in code requests"
      description = "Outer wall for emailed sign-in codes. Looser than the app's 30 per hour per network."
      condition_group = [{
        conditions = [
          { type = "path", op = "eq", value = "/api/auth/email-otp/send-verification-otp" },
          { type = "method", op = "eq", value = "POST" },
        ]
      }]
      action = {
        action = "rate_limit"
        rate_limit = {
          limit  = 90
          window = 3600
          keys   = ["ip"]
          algo   = "fixed_window"
          action = var.tenant.signInRateLimitAction
        }
      }
    }
  }
}
