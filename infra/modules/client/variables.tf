variable "slug" {
  description = "The tenant file's name without .json."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.slug))
    error_message = "A tenant slug is lower-case letters, digits and hyphens."
  }
}

variable "tenant" {
  description = "The decoded tenant file."
  type = object({
    brand                  = string
    domain                 = string
    emailFrom              = string
    paymentGatewayFallback = optional(string)
    whatsappSalesNumber    = optional(string)
    # "log" counts only; switch to "deny" once real traffic has been seen
    # passing (docs/ops/customer-passkey-runbook.md).
    signInRateLimitAction = optional(string, "log")
    # Mail records (SPF, DKIM, DMARC) copied from the mail provider.
    dnsRecords = optional(list(object({
      zone       = string
      name       = string
      type       = string
      value      = string
      mxPriority = optional(number)
    })), [])
  })

  validation {
    condition     = contains(["log", "deny"], var.tenant.signInRateLimitAction)
    error_message = "signInRateLimitAction is \"log\" or \"deny\"."
  }
}

variable "secrets" {
  description = "Env var name => value, for the secrets a person obtains from a provider."
  type        = map(string)
  sensitive   = true

  validation {
    condition     = length(setsubtract(nonsensitive(keys(var.secrets)), local.secret_names)) == 0
    error_message = "Unknown env var name in secrets. Add it to local.secret_names in modules/client/main.tf if the app reads it."
  }

  validation {
    condition     = contains(nonsensitive(keys(var.secrets)), "DATABASE_URL")
    error_message = "Every company needs DATABASE_URL in its secrets."
  }
}
