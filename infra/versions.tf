terraform {
  required_version = ">= 1.9"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.21"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Settings come from backend.hcl (gitignored): `tofu init -backend-config=backend.hcl`.
  backend "s3" {}

  # The state holds every company's secrets, so it is encrypted before it
  # leaves this machine. The bucket only ever sees ciphertext.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

# The API token is read from VERCEL_API_TOKEN.
provider "vercel" {
  team = var.vercel_team_id
}
