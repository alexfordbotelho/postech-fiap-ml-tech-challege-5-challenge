resource "azurerm_cognitive_account" "openai" {
  name                = "${var.prefix}-openai-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  kind                = "OpenAI"
  sku_name            = "S0"
  tags                = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

resource "azurerm_cognitive_deployment" "gpt4o" {
  name                 = "gpt-4o"
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = "gpt-5-mini"
    version = "2025-08-07"
  }

  scale {
    type     = "GlobalStandard"
    capacity = 10
  }
}

resource "azurerm_cognitive_deployment" "embedding" {
  name                 = "text-embedding-3-small"
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = "text-embedding-3-small"
    version = "1"
  }

  scale {
    type     = "Standard"
    capacity = 120
  }
}

resource "azurerm_search_service" "ai_search" {
  name                = "${var.prefix}-search-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "basic"
  tags                = var.tags
}

# Store secrets in Key Vault so Container Apps can reference them via Managed Identity
resource "azurerm_key_vault_secret" "openai_key" {
  name         = "azure-openai-key"
  value        = azurerm_cognitive_account.openai.primary_access_key
  key_vault_id = var.key_vault_id
}

resource "azurerm_key_vault_secret" "search_key" {
  name         = "azure-search-key"
  value        = azurerm_search_service.ai_search.primary_key
  key_vault_id = var.key_vault_id
}

output "openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}

output "openai_key_secret_id" {
  value     = azurerm_key_vault_secret.openai_key.id
  sensitive = true
}

output "openai_key" {
  value     = azurerm_cognitive_account.openai.primary_access_key
  sensitive = true
}

output "ai_search_endpoint" {
  value = "https://${azurerm_search_service.ai_search.name}.search.windows.net"
}

output "ai_search_key_secret_id" {
  value     = azurerm_key_vault_secret.search_key.id
  sensitive = true
}

output "ai_search_key" {
  value     = azurerm_search_service.ai_search.primary_key
  sensitive = true
}
