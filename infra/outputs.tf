output "projects" {
  description = "Tenant slug => Vercel project id. The release job deploys to these."
  value       = { for slug, c in module.client : slug => c.project_id }
}

output "webhook_tokens" {
  description = "Tokens to paste when registering each company's webhooks. `tofu output -json webhook_tokens`."
  value       = { for slug, c in module.client : slug => c.webhook_tokens }
  sensitive   = true
}
