resource "azurerm_eventhub_namespace" "ns" {
  name                = "${var.prefix}-eh-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Standard"
  capacity            = 1
  tags                = var.tags
}

resource "azurerm_eventhub" "offer_events" {
  name                = "offer-events"
  namespace_name      = azurerm_eventhub_namespace.ns.name
  resource_group_name = var.resource_group_name
  partition_count     = 2
  message_retention   = 1
}

resource "azurerm_eventhub_consumer_group" "adx" {
  name                = "adx-ingestion"
  namespace_name      = azurerm_eventhub_namespace.ns.name
  eventhub_name       = azurerm_eventhub.offer_events.name
  resource_group_name = var.resource_group_name
}

resource "azurerm_eventhub_authorization_rule" "api_rule" {
  name                = "api-send-listen"
  namespace_name      = azurerm_eventhub_namespace.ns.name
  eventhub_name       = azurerm_eventhub.offer_events.name
  resource_group_name = var.resource_group_name
  listen              = true
  send                = true
  manage              = false
}

output "namespace_fqdn" {
  value = "${azurerm_eventhub_namespace.ns.name}.servicebus.windows.net"
}

output "kafka_connection_string" {
  value     = azurerm_eventhub_authorization_rule.api_rule.primary_connection_string
  sensitive = true
}

output "eventhub_id" {
  description = "Resource ID of the offer-events Event Hub (needed for ADX data connection)"
  value       = azurerm_eventhub.offer_events.id
}

output "eventhub_namespace_id" {
  description = "Resource ID of the Event Hub namespace (needed for ADX role assignment)"
  value       = azurerm_eventhub_namespace.ns.id
}

output "adx_consumer_group" {
  description = "Consumer group reserved for ADX data connection"
  value       = azurerm_eventhub_consumer_group.adx.name
}
