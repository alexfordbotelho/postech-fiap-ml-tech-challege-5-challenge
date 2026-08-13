output "api_url" {
  description = "HTTPS URL of the datathon API Container App"
  value       = module.container_apps.api_url
}

output "web_url" {
  description = "HTTPS URL of the admin dashboard (web)"
  value       = module.container_apps.web_url
}

output "web_product_url" {
  description = "HTTPS URL of the product simulator (web-product)"
  value       = module.container_apps.web_product_url
}

output "mlflow_url" {
  description = "HTTPS URL of the MLflow tracking UI"
  value       = module.container_apps.mlflow_url
}

output "langfuse_url" {
  description = "HTTPS URL of the Langfuse LLM tracing UI"
  value       = module.container_apps.langfuse_url
}

output "postgres_fqdn" {
  description = "PostgreSQL Flexible Server FQDN"
  value       = azurerm_postgresql_flexible_server.pg.fqdn
}

output "redis_hostname" {
  description = "Redis container hostname (interno ao Container Apps environment)"
  value       = "${var.prefix}-redis-${var.environment}"
}

output "event_hubs_namespace" {
  description = "Event Hubs namespace FQDN"
  value       = module.event_hubs.namespace_fqdn
}

output "acr_login_server" {
  description = "Azure Container Registry login server (use in build-push.yml)"
  value       = module.azure_ml.acr_login_server
}

output "adx_cluster_uri" {
  description = "Azure Data Explorer cluster URI for KQL queries"
  value       = module.azure_data_explorer.cluster_uri
}

output "openai_endpoint" {
  description = "Azure OpenAI endpoint"
  value       = module.ai_foundry.openai_endpoint
}

output "ai_search_endpoint" {
  description = "Azure AI Search endpoint"
  value       = module.ai_foundry.ai_search_endpoint
}

output "app_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.appinsights.connection_string
  sensitive   = true
}

output "aml_workspace_name" {
  description = "Azure ML workspace name"
  value       = module.azure_ml.workspace_name
}
