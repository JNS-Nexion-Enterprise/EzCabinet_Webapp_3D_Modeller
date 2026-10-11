output "project_id" {
  value = vercel_project.this.id
}

output "webhook_tokens" {
  value = {
    easyparcel_callback_token = local.generated.EASYPARCEL_WEBHOOK_TOKEN
    whatsapp_verify_token     = local.generated.WHATSAPP_VERIFY_TOKEN
  }
  sensitive = true
}
