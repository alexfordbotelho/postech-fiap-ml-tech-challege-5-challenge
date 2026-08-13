data "azurerm_client_config" "current" {}

# ── Redis interno (Azure Cache for Redis Basic/Standard foi aposentado) ────────
resource "azurerm_container_app" "redis" {
  name                         = "${var.prefix}-redis-${var.environment}"
  resource_group_name          = var.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.env.id
  revision_mode                = "Single"
  tags                         = var.tags

  ingress {
    external_enabled = false
    target_port      = 6379
    transport        = "tcp"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "redis"
      image  = "redis:7-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }
}

resource "azurerm_container_app_environment" "env" {
  name                       = "${var.prefix}-cae-${var.environment}"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  log_analytics_workspace_id = var.log_analytics_workspace_id
  tags                       = var.tags
}

# ── Managed Identity (shared by all Container Apps) ────────────────────────────
resource "azurerm_user_assigned_identity" "api_identity" {
  name                = "${var.prefix}-ca-identity-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags
}

resource "azurerm_key_vault_access_policy" "ca_identity" {
  key_vault_id       = var.key_vault_id
  tenant_id          = data.azurerm_client_config.current.tenant_id
  object_id          = azurerm_user_assigned_identity.api_identity.principal_id
  secret_permissions = ["Get", "List"]
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.api_identity.principal_id
}

# Azure AD pode demorar até 120s para propagar a Managed Identity e os role assignments
resource "time_sleep" "identity_propagation" {
  depends_on      = [azurerm_key_vault_access_policy.ca_identity, azurerm_role_assignment.acr_pull]
  create_duration = "120s"
}

# Secrets são passados como valores diretos no Container App (encriptados pelo Azure).
# Evita o bootstrap circular de Managed Identity + Key Vault na criação inicial.

# ── datathon-api ───────────────────────────────────────────────────────────────
resource "azurerm_container_app" "api" {
  name                         = "${var.prefix}-api-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api_identity.id]
  }

  registry {
    server               = var.acr_login_server
    username             = var.acr_admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = var.acr_admin_password
  }
  secret {
    name  = "pg-password"
    value = var.pg_password
  }
  secret {
    name  = "kafka-conn"
    value = var.kafka_connection
  }
  secret {
    name  = "openai-key"
    value = var.openai_key
  }
  secret {
    name  = "search-key"
    value = var.search_key
  }
  secret {
    name  = "appinsights-conn"
    value = var.app_insights_connection_string
  }
  secret {
    name  = "langfuse-secret-key"
    value = var.langfuse_secret_key
  }
  secret {
    name  = "langfuse-public-key"
    value = var.langfuse_public_key
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 10

    container {
      name   = "datathon-api"
      image  = "${var.acr_login_server}/datathon-api:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name        = "PG_PASSWORD"
        secret_name = "pg-password"
      }
      env {
        name  = "PG_HOST"
        value = var.pg_fqdn
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${var.prefix}-redis-${var.environment}:6379/0"
      }
      env {
        name        = "KAFKA_BOOTSTRAP_SERVERS"
        secret_name = "kafka-conn"
      }
      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = var.openai_endpoint
      }
      env {
        name        = "AZURE_OPENAI_KEY"
        secret_name = "openai-key"
      }
      env {
        name  = "AZURE_OPENAI_DEPLOYMENT"
        value = "gpt-4o"
      }
      env {
        name  = "AZURE_EMBED_DEPLOYMENT"
        value = "text-embedding-3-small"
      }
      env {
        name  = "AZURE_SEARCH_ENDPOINT"
        value = var.search_endpoint
      }
      env {
        name        = "AZURE_SEARCH_KEY"
        secret_name = "search-key"
      }
      env {
        name  = "AZURE_SEARCH_INDEX"
        value = "policy-docs"
      }
      env {
        name  = "KUSTO_CLUSTER_URI"
        value = var.kusto_cluster_uri
      }
      env {
        name  = "KUSTO_DATABASE"
        value = "datathon"
      }
      env {
        name  = "KUSTO_MSI_CLIENT_ID"
        value = azurerm_user_assigned_identity.api_identity.client_id
      }
      env {
        name        = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        secret_name = "appinsights-conn"
      }
      env {
        name  = "ACTIVE_POLICY"
        value = "thompson"
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }
      env {
        name  = "LANGFUSE_ENABLED"
        value = "true"
      }
      env {
        name        = "LANGFUSE_SECRET_KEY"
        secret_name = "langfuse-secret-key"
      }
      env {
        name        = "LANGFUSE_PUBLIC_KEY"
        secret_name = "langfuse-public-key"
      }
      env {
        name  = "LANGFUSE_HOST"
        value = "https://${var.prefix}-langfuse-${var.environment}.${azurerm_container_app_environment.env.default_domain}"
      }
      env {
        name  = "MLFLOW_TRACKING_URI"
        value = "https://${var.prefix}-mlflow-${var.environment}.${azurerm_container_app_environment.env.default_domain}"
      }

      liveness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/healthz"
      }
      readiness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/healthz"
      }
    }
  }

  depends_on = [time_sleep.identity_propagation]
}

# ── datathon-mlflow ────────────────────────────────────────────────────────────
resource "azurerm_container_app" "mlflow" {
  name                         = "${var.prefix}-mlflow-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api_identity.id]
  }

  registry {
    server               = var.acr_login_server
    username             = var.acr_admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = var.acr_admin_password
  }
  secret {
    name  = "pg-password"
    value = var.pg_password
  }

  ingress {
    external_enabled = true
    target_port      = 5000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 2

    container {
      name   = "mlflow"
      image  = "${var.acr_login_server}/datathon-mlflow:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "PG_PASSWORD"
        secret_name = "pg-password"
      }
      env {
        name  = "PG_HOST"
        value = var.pg_fqdn
      }
      env {
        name  = "MLFLOW_ARTIFACT_ROOT"
        value = "wasbs://mlflow-artifacts@${var.prefix}st7mlet${var.environment}.blob.core.windows.net/"
      }
    }
  }

  depends_on = [time_sleep.identity_propagation]
}

# ── datathon-langfuse ──────────────────────────────────────────────────────────
resource "azurerm_container_app" "langfuse" {
  name                         = "${var.prefix}-langfuse-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api_identity.id]
  }

  secret {
    name  = "pg-password"
    value = var.pg_password
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 2

    container {
      name   = "langfuse"
      image  = "langfuse/langfuse:2"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "DATABASE_HOST"
        value = "${var.pg_fqdn}:5432"
      }
      env {
        name  = "DATABASE_USERNAME"
        value = "datathon_admin"
      }
      env {
        name        = "DATABASE_PASSWORD"
        secret_name = "pg-password"
      }
      env {
        name  = "DATABASE_NAME"
        value = "langfuse_db"
      }
      env {
        name  = "DATABASE_ARGS"
        value = "sslmode=require"
      }
      env {
        name  = "NEXTAUTH_URL"
        value = "https://${var.prefix}-langfuse-${var.environment}.${azurerm_container_app_environment.env.default_domain}"
      }
      env {
        name  = "NEXTAUTH_SECRET"
        value = "changeme-secret-at-least-32-chars-azure!"
      }
      env {
        name  = "SALT"
        value = "changeme-salt-azure"
      }
      env {
        name  = "TELEMETRY_ENABLED"
        value = "false"
      }
      env {
        name  = "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES"
        value = "false"
      }
    }
  }

  depends_on = [time_sleep.identity_propagation]
}

# ── datathon-web (Admin Dashboard) ────────────────────────────────────────────
resource "azurerm_container_app" "web" {
  name                         = "${var.prefix}-web-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api_identity.id]
  }

  registry {
    server               = var.acr_login_server
    username             = var.acr_admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = var.acr_admin_password
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "datathon-web"
      image  = "${var.acr_login_server}/datathon-web:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://${azurerm_container_app.api.latest_revision_fqdn}"
      }
    }
  }

  depends_on = [azurerm_container_app.api]
}

# ── datathon-web-product ───────────────────────────────────────────────────────
resource "azurerm_container_app" "web_product" {
  name                         = "${var.prefix}-webprod-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api_identity.id]
  }

  registry {
    server               = var.acr_login_server
    username             = var.acr_admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = var.acr_admin_password
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "datathon-web-product"
      image  = "${var.acr_login_server}/datathon-web-product:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://${azurerm_container_app.api.latest_revision_fqdn}"
      }
    }
  }

  depends_on = [azurerm_container_app.api]
}

# ── Outputs ────────────────────────────────────────────────────────────────────
output "app_url" {
  value = "https://${azurerm_container_app.api.latest_revision_fqdn}"
}
output "api_url" {
  value = "https://${azurerm_container_app.api.latest_revision_fqdn}"
}
output "web_url" {
  value = "https://${azurerm_container_app.web.latest_revision_fqdn}"
}
output "web_product_url" {
  value = "https://${azurerm_container_app.web_product.latest_revision_fqdn}"
}
output "mlflow_url" {
  value = "https://${azurerm_container_app.mlflow.latest_revision_fqdn}"
}
output "langfuse_url" {
  value = "https://${azurerm_container_app.langfuse.latest_revision_fqdn}"
}
