locals {
  tags = {
    project     = "datathon-7mlet"
    environment = var.environment
    managed_by  = "terraform"
  }
  rg_name = "rg-${var.prefix}-7mlet-${var.environment}"
}

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.location
  tags     = local.tags
}

# ── PostgreSQL Flexible Server ─────────────────────────────────────────────────
resource "azurerm_postgresql_flexible_server" "pg" {
  name                   = "${var.prefix}-pg-${var.environment}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = "datathon_admin"
  administrator_password = var.postgres_admin_password
  sku_name               = "B_Standard_B1ms"
  storage_mb             = 32768
  backup_retention_days  = 7
  tags                   = local.tags

  lifecycle {
    ignore_changes = [zone, high_availability]
  }
}

resource "azurerm_postgresql_flexible_server_database" "db" {
  name      = "datathon_db"
  server_id = azurerm_postgresql_flexible_server.pg.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_database" "langfuse_db" {
  name      = "langfuse_db"
  server_id = azurerm_postgresql_flexible_server.pg.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAllAzureIPs"
  server_id        = azurerm_postgresql_flexible_server.pg.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ── Storage Account (MLflow artifacts + datasets) ─────────────────────────────
resource "azurerm_storage_account" "storage" {
  name                     = "${var.prefix}st7mlet${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = local.tags
}

resource "azurerm_storage_container" "mlflow" {
  name                  = "mlflow-artifacts"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "datasets" {
  name                  = "datasets"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "private"
}

# ── Log Analytics + Application Insights ──────────────────────────────────────
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${var.prefix}-logs-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "appinsights" {
  name                = "${var.prefix}-appinsights-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  workspace_id        = azurerm_log_analytics_workspace.logs.id
  application_type    = "web"
  tags                = local.tags
}

# ── Key Vault ──────────────────────────────────────────────────────────────────
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "kv" {
  name                = "${var.prefix}-kv-7mlet-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  tags                = local.tags
}

resource "azurerm_key_vault_access_policy" "deployer" {
  key_vault_id       = azurerm_key_vault.kv.id
  tenant_id          = data.azurerm_client_config.current.tenant_id
  object_id          = data.azurerm_client_config.current.object_id
  secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
}

# ── Submodules ─────────────────────────────────────────────────────────────────
module "event_hubs" {
  source              = "./modules/event_hubs"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  prefix              = var.prefix
  environment         = var.environment
  tags                = local.tags
}

module "azure_ml" {
  source              = "./modules/azure_ml"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  prefix              = var.prefix
  environment         = var.environment
  storage_account_id  = azurerm_storage_account.storage.id
  app_insights_id     = azurerm_application_insights.appinsights.id
  key_vault_id        = azurerm_key_vault.kv.id
  tags                = local.tags
}

module "ai_foundry" {
  source              = "./modules/ai_foundry"
  resource_group_name = azurerm_resource_group.main.name
  location            = "eastus"
  prefix              = var.prefix
  environment         = var.environment
  key_vault_id        = azurerm_key_vault.kv.id
  tags                = local.tags

  depends_on = [azurerm_key_vault_access_policy.deployer]
}

module "azure_data_explorer" {
  source                = "./modules/azure_data_explorer"
  resource_group_name   = azurerm_resource_group.main.name
  location              = azurerm_resource_group.main.location
  prefix                = var.prefix
  environment           = var.environment
  key_vault_id          = azurerm_key_vault.kv.id
  eventhub_id           = module.event_hubs.eventhub_id
  eventhub_namespace_id = module.event_hubs.eventhub_namespace_id
  adx_consumer_group    = module.event_hubs.adx_consumer_group
  tags                  = local.tags

  depends_on = [
    module.event_hubs,
    azurerm_key_vault_access_policy.deployer,
  ]
}

module "container_apps" {
  source              = "./modules/container_apps"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  prefix              = var.prefix
  environment         = var.environment
  image_tag           = var.image_tag
  key_vault_id        = azurerm_key_vault.kv.id

  acr_login_server                    = module.azure_ml.acr_login_server
  acr_id                              = module.azure_ml.acr_id
  acr_admin_username                  = module.azure_ml.acr_admin_username
  acr_admin_password                  = module.azure_ml.acr_admin_password
  log_analytics_workspace_id          = azurerm_log_analytics_workspace.logs.id
  log_analytics_workspace_primary_key = azurerm_log_analytics_workspace.logs.primary_shared_key

  pg_fqdn     = azurerm_postgresql_flexible_server.pg.fqdn
  pg_password = var.postgres_admin_password

  kafka_connection = module.event_hubs.kafka_connection_string

  openai_endpoint = module.ai_foundry.openai_endpoint
  openai_key      = module.ai_foundry.openai_key

  search_endpoint = module.ai_foundry.ai_search_endpoint
  search_key      = module.ai_foundry.ai_search_key

  kusto_cluster_uri = module.azure_data_explorer.cluster_uri

  app_insights_connection_string = azurerm_application_insights.appinsights.connection_string

  langfuse_secret_key = var.langfuse_secret_key
  langfuse_public_key = var.langfuse_public_key

  tags = local.tags

  depends_on = [
    azurerm_key_vault_access_policy.deployer,
    module.azure_ml,
    module.ai_foundry,
    module.event_hubs,
    module.azure_data_explorer,
  ]
}
