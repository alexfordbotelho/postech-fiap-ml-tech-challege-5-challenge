resource "azurerm_kusto_cluster" "adx" {
  name                = "${var.prefix}adx${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags

  sku {
    name     = "Dev(No SLA)_Standard_D11_v2"
    capacity = 1
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_kusto_database" "db" {
  name                = "datathon"
  resource_group_name = var.resource_group_name
  location            = var.location
  cluster_name        = azurerm_kusto_cluster.adx.name
  hot_cache_period    = "P7D"
  soft_delete_period  = "P30D"
}

resource "azurerm_kusto_script" "create_tables" {
  name        = "create-tables-v2"
  database_id = azurerm_kusto_database.db.id

  script_content = <<-KQL
    .create-merge table flag_events (
        decision_id: string,
        policy_name: string,
        arm_selected: string,
        reward: real,
        is_exploration: bool,
        segment: string,
        channel: string,
        flag_snapshot: dynamic,
        timestamp: datetime
    )

    .create-merge table decision_logs (
        decision_id: guid,
        user_id: string,
        arm_id: string,
        policy: string,
        reward: real,
        channel: string,
        features: dynamic,
        timestamp: datetime
    )

    .alter table flag_events policy ingestiontime true

    .create-or-alter table flag_events ingestion json mapping 'flag_events_mapping'
    '[{"column":"decision_id","path":"$.decision_id"},{"column":"policy_name","path":"$.policy_name"},{"column":"arm_selected","path":"$.arm_selected"},{"column":"reward","path":"$.reward"},{"column":"is_exploration","path":"$.is_exploration"},{"column":"segment","path":"$.segment"},{"column":"channel","path":"$.channel"},{"column":"flag_snapshot","path":"$.flag_snapshot"},{"column":"timestamp","path":"$.timestamp"}]'
  KQL

  continue_on_errors_enabled         = false
  force_an_update_when_value_changed = "v2"
}

# ADX Managed Identity needs Data Receiver role on the Event Hub
resource "azurerm_role_assignment" "adx_eventhub_reader" {
  scope                = var.eventhub_namespace_id
  role_definition_name = "Azure Event Hubs Data Receiver"
  principal_id         = azurerm_kusto_cluster.adx.identity[0].principal_id
}

resource "azurerm_kusto_eventhub_data_connection" "offer_events" {
  name                = "offer-events-connection"
  resource_group_name = var.resource_group_name
  location            = var.location
  cluster_name        = azurerm_kusto_cluster.adx.name
  database_name       = azurerm_kusto_database.db.name

  eventhub_id       = var.eventhub_id
  consumer_group    = var.adx_consumer_group
  table_name        = "flag_events"
  mapping_rule_name = "flag_events_mapping"
  data_format       = "JSON"

  depends_on = [
    azurerm_kusto_script.create_tables,
    azurerm_role_assignment.adx_eventhub_reader,
  ]
}

resource "azurerm_key_vault_secret" "kusto_uri" {
  name         = "kusto-cluster-uri"
  value        = azurerm_kusto_cluster.adx.uri
  key_vault_id = var.key_vault_id
}

output "cluster_uri" {
  value = azurerm_kusto_cluster.adx.uri
}

output "database_name" {
  value = azurerm_kusto_database.db.name
}
