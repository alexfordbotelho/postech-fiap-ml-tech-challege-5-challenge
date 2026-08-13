variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "prefix" { type = string }
variable "environment" { type = string }
variable "image_tag" { type = string }
variable "acr_login_server" { type = string }
variable "acr_id" { type = string }
variable "acr_admin_username" { type = string }
variable "acr_admin_password" {
  type      = string
  sensitive = true
}
variable "log_analytics_workspace_id" { type = string }
variable "key_vault_id" { type = string }
variable "kusto_cluster_uri" { type = string }
variable "openai_endpoint" { type = string }
variable "search_endpoint" { type = string }
variable "pg_fqdn" { type = string }
variable "log_analytics_workspace_primary_key" {
  type      = string
  sensitive = true
}
variable "pg_password" {
  type      = string
  sensitive = true
}
variable "kafka_connection" {
  type      = string
  sensitive = true
}
variable "openai_key" {
  type      = string
  sensitive = true
}
variable "search_key" {
  type      = string
  sensitive = true
}
variable "app_insights_connection_string" {
  type      = string
  sensitive = true
}

variable "langfuse_secret_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_public_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
