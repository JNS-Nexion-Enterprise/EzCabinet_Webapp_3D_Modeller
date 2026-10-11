variable "vercel_team_id" {
  description = "The Vercel team every company's project lives in."
  type        = string
  default     = "team_e99YHIFwOVbqUGDqr0OXOWiY"
}

variable "state_passphrase" {
  description = "Encrypts the state file. Losing it loses the state; keep it in the password manager."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "The state passphrase must be at least 16 characters."
  }
}

variable "shared_secrets" {
  description = "Env vars every company gets from one shared account (Mux, geocoding). A company's own entry in `secrets` wins."
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "secrets" {
  description = "Per company: tenant slug => env var name => value. Lives in secrets.auto.tfvars, never in git."
  type        = map(map(string))
  sensitive   = true
  default     = {}
}
