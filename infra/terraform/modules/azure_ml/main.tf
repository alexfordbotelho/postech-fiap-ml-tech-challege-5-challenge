resource "azurerm_container_registry" "acr" {
  name                = "${var.prefix}acr7mlet${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Basic"
  admin_enabled       = true
  tags                = var.tags
}

resource "azurerm_machine_learning_workspace" "aml" {
  name                    = "${var.prefix}-aml2-${var.environment}"
  resource_group_name     = var.resource_group_name
  location                = var.location
  application_insights_id = var.app_insights_id
  key_vault_id            = var.key_vault_id
  storage_account_id      = var.storage_account_id
  container_registry_id   = azurerm_container_registry.acr.id
  tags                    = var.tags

  identity {
    type = "SystemAssigned"
  }
}

output "acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "acr_id" {
  value = azurerm_container_registry.acr.id
}

output "acr_admin_username" {
  value = azurerm_container_registry.acr.admin_username
}

output "acr_admin_password" {
  value     = azurerm_container_registry.acr.admin_password
  sensitive = true
}

output "workspace_name" {
  value = azurerm_machine_learning_workspace.aml.name
}
