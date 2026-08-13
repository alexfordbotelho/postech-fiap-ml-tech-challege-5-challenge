.PHONY: up up-llm down restart logs test test-integration test-all \
        migrate clickhouse-setup optimize eval load-test lint type-check deploy plan fmt-tf \
        stream stream-fast stream-young stream-slow stream-experiments seed eda synthetic fmt fmt-tf destroy create-bucket \
        seed-flags stream-flags \
        azure-check-tools azure-login azure-register-providers \
        azure-bootstrap-state \
        azure-oidc-setup azure-github-secrets \
        azure-tf-init azure-tf-plan azure-tf-apply azure-tf-outputs azure-tf-destroy \
        azure-acr-login azure-build-api azure-build-web azure-build-web-product azure-build-push \
        azure-db-migrate azure-db-seed \
        azure-smoke-test azure-endpoints \
        azure-deploy-all azure-migrate azure-identity-restore \
        azure-upload-datasets azure-simulate \
        azure-pause azure-resume \
        azure-backup azure-purge azure-safe-destroy \
        azure _azure-safe-create

# ── Docker Compose ─────────────────────────────────────────────────────────
up:
	docker compose up -d --build
	@echo "Services started. API at http://localhost:8000"
	@echo "MLflow UI at http://localhost:5000"
	@echo "MinIO Console at http://localhost:9101"
	@echo "HyperDX UI at http://localhost:8080"

up-llm:
	docker compose --profile llm up -d --build

down:
	docker compose down

restart:
	docker compose restart api

logs:
	docker compose logs -f api mlflow

# ── Testing ────────────────────────────────────────────────────────────────
test:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v --timeout=30

test-all:
	uv run pytest -v --timeout=60

load-test:
	uv run locust -f tests/load/locustfile.py --headless -u 10 -r 2 --run-time 30s \
		--host http://localhost:8000

# ── Notebooks ──────────────────────────────────────────────────────────────
eda:
	uv run jupyter nbconvert --to notebook --execute notebooks/01_eda.ipynb \
		--output notebooks/01_eda_executed.ipynb

synthetic:
	uv run jupyter nbconvert --to notebook --execute notebooks/02_synthetic_enrichment.ipynb \
		--output notebooks/02_synthetic_enrichment_executed.ipynb

eval:
	MLFLOW_TRACKING_URI=$${MLFLOW_TRACKING_URI:-http://localhost:5010} \
	uv run jupyter nbconvert --to notebook --execute notebooks/03_offline_evaluation.ipynb \
		--output notebooks/03_offline_evaluation_executed.ipynb
	@echo "MLflow runs logged at http://localhost:5010 (experiment: datathon-bandit)"

# ── Code quality ───────────────────────────────────────────────────────────
lint:
	uv run ruff check src/ tests/

fmt:
	uv run ruff format src/ tests/

type-check:
	uv run mypy src/

# ── Infrastructure ─────────────────────────────────────────────────────────
plan:
	cd infra/terraform && terraform init && terraform plan -var-file=vars/dev.tfvars

deploy:
	cd infra/terraform && terraform init && terraform apply -var-file=vars/dev.tfvars -auto-approve

destroy:
	cd infra/terraform && terraform destroy -var-file=vars/dev.tfvars

fmt-tf:
	terraform fmt -recursive infra/terraform/

# ── Event streaming ────────────────────────────────────────────────────────

# stream:
# 	uv run python scripts/event_stream.py --workers 20

# stream-fast:
# 	uv run python scripts/event_stream.py --workers 50

# stream-young:
# 	uv run python scripts/event_stream.py --workers 10 --segment young

# stream-slow:
# 	uv run python scripts/event_stream.py --workers 4 --rate 10

stream-experiments:
	uv run python scripts/stream_experiments.py --workers-per-exp 20

seed:
	uv run python scripts/seed_bulk.py --rounds 500

# ── Feature Flags ───────────────────────────────────────────────────────────

# Cria/atualiza as feature flags no banco (idempotente — pode rodar várias vezes)
seed-flags:
	uv run python scripts/seed_product_flags.py

# Exercita cada regra das flags ativas: workers dedicados por regra de flag,
# cenários derivados da condição de cada regra para garantir cobertura total.
stream-flags: seed-flags
	uv run python scripts/stream_flags.py --workers 2

# ── ClickHouse ─────────────────────────────────────────────────────────────

# Inject runtime configs and recreate tables (run after every ClickHouse restart)
# Uses clickhouse-client (native protocol) for DDL — avoids CLOSE_WAIT accumulation
# that occurs when curl-based HTTP DDL queries time out.
migrate:
	@echo "Waiting for ClickHouse (native protocol)..."
	@CH=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep clickhouse | head -1) && \
	 until docker exec $$CH clickhouse-client --receive_timeout=3 --query "SELECT 1" >/dev/null 2>&1; do sleep 1; done
	@echo "Applying ClickHouse DDL (via native client)..."
	@CH=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep clickhouse | head -1) && \
	 docker exec $$CH clickhouse-client --receive_timeout=10 \
		--query "CREATE DATABASE IF NOT EXISTS datathon" && echo "  DB OK"
	@CH=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep clickhouse | head -1) && \
	 docker exec $$CH clickhouse-client --receive_timeout=15 \
		--query "CREATE TABLE IF NOT EXISTS datathon.events (decision_id String, timestamp DateTime DEFAULT now(), policy_name LowCardinality(String), arm_selected LowCardinality(String), reward Nullable(Float32), is_exploration UInt8, session_id String, segment LowCardinality(String) DEFAULT 'default', channel LowCardinality(String) DEFAULT 'web') ENGINE = MergeTree() ORDER BY (timestamp, policy_name) PARTITION BY toYYYYMM(timestamp) TTL timestamp + INTERVAL 14 DAY DELETE SETTINGS min_rows_for_wide_part=50000, min_bytes_for_wide_part=52428800" && echo "  events OK"
	@CH=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep clickhouse | head -1) && \
	 docker exec $$CH clickhouse-client --receive_timeout=15 \
		--query "CREATE TABLE IF NOT EXISTS datathon.flag_events (decision_id String, timestamp DateTime DEFAULT now(), policy_name LowCardinality(String), arm_selected LowCardinality(String), reward Nullable(Float32), is_exploration UInt8, segment LowCardinality(String) DEFAULT 'default', channel LowCardinality(String) DEFAULT 'web', flag_snapshot String DEFAULT '{}') ENGINE = MergeTree() ORDER BY (timestamp, policy_name) PARTITION BY toYYYYMM(timestamp) TTL timestamp + INTERVAL 14 DAY DELETE SETTINGS min_rows_for_wide_part=50000, min_bytes_for_wide_part=52428800" && echo "  flag_events OK"
	@echo "Flushing analytics Redis cache (preserving bandit states)..."
	@REDIS=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep redis | head -1) && \
	 docker exec $$REDIS sh -c \
	   'keys=$$(redis-cli --scan --pattern "analytics:*"); [ -n "$$keys" ] && echo $$keys | xargs redis-cli DEL || true' \
	   >/dev/null 2>&1
	@echo "Migration complete."

clickhouse-setup: migrate

# Force-merge all MergeTree parts — run after heavy streaming to restore query speed.
# Many small parts (from frequent kafka-consumer flushes) make SELECT queries scan
# each part individually, causing timeouts. FINAL collapses them into one part/month.
optimize:
	@echo "Merging ClickHouse parts (this may take a minute)..."
	@CH=$$(docker ps --filter "name=datathon" --format "{{.Names}}" | grep clickhouse | head -1) && \
	 docker exec $$CH clickhouse-client --receive_timeout=300 \
		--query "OPTIMIZE TABLE datathon.flag_events FINAL" && echo "  flag_events merged" && \
	 docker exec $$CH clickhouse-client --receive_timeout=300 \
		--query "OPTIMIZE TABLE datathon.events FINAL" && echo "  events merged"
	@echo "Optimize complete."

# ── Helpers ────────────────────────────────────────────────────────────────
create-bucket:
	docker compose run --rm minio mc alias set local http://minio:9100 \
		${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin} && \
	docker compose run --rm minio mc mb local/mlflow-artifacts --ignore-existing

# ══════════════════════════════════════════════════════════════════════════════
# ── Azure — Migração e Deploy (MIGRATION_AZURE_PLAN.md) ──────────────────────
# ══════════════════════════════════════════════════════════════════════════════
#
# PONTO DE ENTRADA ÚNICO — sobe o sistema completo do zero:
#
#   make azure-full-deploy PG_PASSWORD=<senha>
#
# Fluxo automatizado (10 fases):
#   1. Valida ferramentas (az, terraform, docker)
#   2. Registra providers + bootstrap Terraform state
#   4a. Terraform: infra base com -target (RG, PG, ACR, KV, ADX, AI...)
#   5. Build + push das 3 imagens Docker → ACR (login único)
#   4b. Terraform: Container Apps (imagens já no ACR — sem MANIFEST_UNKNOWN)
#   6. Migrations PostgreSQL (7 arquivos, exclui 003_clickhouse)
#   7. Seed: policy docs + experimento com 50k sintéticos
#   8. Managed Identity → Container Apps via UPDATE (sem bug do CREATE)
#   9. Smoke tests (health / decide / metrics / RAG)
#   10. Exibe todos os endpoints com cores
#
# Variáveis (podem ser definidas em .env-azure, na linha de comando ou no ambiente):
#   PG_PASSWORD          senha do PostgreSQL admin     [OBRIGATÓRIA]
#   LANGFUSE_SECRET_KEY  chave secreta Langfuse        [opcional]
#   LANGFUSE_PUBLIC_KEY  chave pública Langfuse        [opcional]
#   GIT_SHA              tag das imagens               [default: git short SHA]
#   GITHUB_ORG           organização GitHub            [só para azure-oidc-setup]
#
# Para configurar: cp .env-azure.example .env-azure  e preencha os valores.
# ─────────────────────────────────────────────────────────────────────────────

# Carrega .env-azure se existir (silencioso se ausente)
sinclude .env-azure

# Valores padrão (usados se não definidos em .env-azure ou na linha de comando)
ACR_NAME        ?= datathonacr7mletdev
ACR_SERVER      ?= datathonacr7mletdev.azurecr.io
RG_NAME         ?= rg-datathon-7mlet-dev
STORAGE_ACCOUNT ?= datathonst7mletdev
GITHUB_ORG      ?=
GITHUB_REPO     ?= postech-fiap-ml-tech-challege-5-datathon
# Localização dos recursos — usadas em azure-purge e azure-pause
AZURE_LOCATION  ?= brazilsouth
OPENAI_LOCATION ?= eastus

TF_DIR      := infra/terraform
TF_VARS     := -var-file=vars/dev.tfvars
GIT_SHA     := $(shell git rev-parse --short HEAD 2>/dev/null || echo "latest")

# Canonical API URL (no revision suffix) — baked into Next.js builds at compile time
API_CANONICAL_URL ?= $(shell az containerapp show \
  --name $(TF_PREFIX)-api-$(TF_ENVIRONMENT) \
  --resource-group $(RG_NAME) \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null | \
  sed 's/^/https:\/\//')

TF_PREFIX     ?= datathon
TF_ENVIRONMENT ?= dev

# PG_PASSWORD → variáveis esperadas pelo Terraform e psql
export TF_VAR_postgres_admin_password ?= $(PG_PASSWORD)
export PGPASSWORD                     ?= $(PG_PASSWORD)

# Langfuse — chaves de tracing (opcionais)
LANGFUSE_SECRET_KEY ?=
LANGFUSE_PUBLIC_KEY ?=
export TF_VAR_langfuse_secret_key     ?= $(LANGFUSE_SECRET_KEY)
export TF_VAR_langfuse_public_key     ?= $(LANGFUSE_PUBLIC_KEY)

# Usa psql local se disponível, senão cai para docker
PSQL := $(shell which psql 2>/dev/null)
ifeq ($(PSQL),)
PSQL = docker run --rm -e PGPASSWORD="$(PG_PASSWORD)" -v "$(CURDIR)":/sql -w /sql postgres:16-alpine psql
endif

# ── Guardas internas ────────────────────────────────────────────────────────
_az-guard-password:
	@[ -n "$(PG_PASSWORD)" ] || { \
		printf "\n  ERRO: PG_PASSWORD não definido.\n  Uso:  make $(MAKECMDGOALS) PG_PASSWORD=<senha>\n\n"; \
		exit 1; }

_az-guard-login:
	@az account show -o none 2>/dev/null || { \
		echo "ERRO: não autenticado no Azure. Execute: make azure-login"; exit 1; }

# ── Helpers de formatação ────────────────────────────────────────────────────
_az-phase = @printf "\n\033[1;34m━━━  %s  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n" "$(1)"
_az-ok    = @printf "\033[1;32m  ✓  %s\033[0m\n" "$(1)"
_az-step  = @printf "\033[0;36m  →  %s\033[0m\n" "$(1)"

# Aguarda a API responder /healthz (polling até 3 min)
_az-wait-api:
	$(call _az-step,Aguardando API em /healthz (máx 3 min)...)
	@API=$$(az containerapp show --name datathon-api-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	for i in $$(seq 1 18); do \
		if curl -sf "https://$$API/healthz" -o /dev/null 2>/dev/null; then \
			printf "  API online.\n"; break; \
		fi; \
		printf "  [%d/18] aguardando (10s)...\n" $$i; sleep 10; \
	done

# ── Fase 1: Ferramentas ──────────────────────────────────────────────────────
azure-check-tools:
	$(call _az-phase,Fase 1 — Ferramentas)
	@az        --version 2>/dev/null | head -1 || { echo "ERRO: az CLI não encontrado";    exit 1; }
	@terraform --version 2>/dev/null | head -1 || { echo "ERRO: terraform não encontrado"; exit 1; }
	@docker    --version 2>/dev/null            || { echo "ERRO: docker não encontrado";    exit 1; }
	$(call _az-ok,az + terraform + docker OK)

azure-login:
	az login
	@az account show --query "{subscription:name,id:id,tenant:tenantId}" -o table

# ── Fase 2: Providers + State ────────────────────────────────────────────────
_az-register-providers: _az-guard-login
	$(call _az-phase,Fase 2a — Providers Azure)
	@for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.CognitiveServices \
	           Microsoft.Kusto Microsoft.Storage Microsoft.KeyVault \
	           Microsoft.ContainerRegistry Microsoft.ManagedIdentity; do \
		printf "  %-45s" "$$ns"; \
		az provider register --namespace $$ns --output none && echo "OK" || echo "FALHOU"; \
	done
	$(call _az-ok,8 providers registrados)

azure-register-providers: _az-register-providers

_az-bootstrap-state: _az-guard-login
	$(call _az-phase,Fase 2b — Bootstrap Terraform state)
	@if az storage account show --name stdatathonstate7mlet -o none 2>/dev/null; then \
		echo "  Storage account já existe — pulando."; \
	else \
		chmod +x infra/scripts/bootstrap_state.sh && infra/scripts/bootstrap_state.sh brazilsouth; \
	fi
	$(call _az-ok,Terraform state storage pronto)

azure-bootstrap-state: _az-bootstrap-state

# ── Fase 3: GitHub OIDC (opcional — não faz parte do azure-full-deploy) ─────
azure-oidc-setup: _az-guard-login
	@[ -n "$(GITHUB_ORG)" ] || { echo "ERRO: defina GITHUB_ORG=<usuario-ou-org>"; exit 1; }
	$(call _az-phase,Fase 3 — GitHub OIDC)
	$(eval _APP_ID := $(shell az ad app create --display-name datathon-7mlet-github-oidc --query appId -o tsv))
	$(eval _SP_OID := $(shell az ad sp create --id $(_APP_ID) --query id -o tsv))
	$(eval _SUB_ID := $(shell az account show --query id -o tsv))
	$(eval _TEN_ID := $(shell az account show --query tenantId -o tsv))
	@az ad app federated-credential create --id $(_APP_ID) -o none --parameters \
		'{"name":"github-push-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:$(GITHUB_ORG)/$(GITHUB_REPO):ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}'
	@az ad app federated-credential create --id $(_APP_ID) -o none --parameters \
		'{"name":"github-pull-request","issuer":"https://token.actions.githubusercontent.com","subject":"repo:$(GITHUB_ORG)/$(GITHUB_REPO):pull_request","audiences":["api://AzureADTokenExchange"]}'
	@az role assignment create --assignee $(_SP_OID) --role Contributor \
		--scope /subscriptions/$(_SUB_ID) -o none
	@az role assignment create --assignee $(_SP_OID) --role "User Access Administrator" \
		--scope /subscriptions/$(_SUB_ID) -o none
	$(call _az-ok,OIDC configurado — configure estes secrets no GitHub)
	@printf "  ┌─ Secrets → Settings → Secrets → Actions ──────────────┐\n"
	@printf "  │  AZURE_CLIENT_ID       = $(_APP_ID)\n"
	@printf "  │  AZURE_TENANT_ID       = $(_TEN_ID)\n"
	@printf "  │  AZURE_SUBSCRIPTION_ID = $(_SUB_ID)\n"
	@printf "  └───────────────────────────────────────────────────────┘\n"

azure-github-secrets: _az-guard-login
	@[ -n "$(GITHUB_ORG)" ]      || { echo "ERRO: defina GITHUB_ORG";       exit 1; }
	@[ -n "$(PG_PASSWORD)" ]     || { echo "ERRO: defina PG_PASSWORD";       exit 1; }
	@[ -n "$(AZURE_CLIENT_ID)" ] || { echo "ERRO: defina AZURE_CLIENT_ID";   exit 1; }
	$(call _az-phase,GitHub Secrets)
	$(eval _SUB_ID := $(shell az account show --query id -o tsv))
	$(eval _TEN_ID := $(shell az account show --query tenantId -o tsv))
	@gh secret set AZURE_CLIENT_ID       -b "$(AZURE_CLIENT_ID)"   -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set AZURE_TENANT_ID       -b "$(_TEN_ID)"           -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set AZURE_SUBSCRIPTION_ID -b "$(_SUB_ID)"           -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set TF_STATE_SA           -b "stdatathonstate7mlet" -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set PG_ADMIN_PASSWORD     -b "$(PG_PASSWORD)"       -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set ACR_NAME              -b "$(ACR_NAME)"          -R $(GITHUB_ORG)/$(GITHUB_REPO)
	@gh secret set ACR_LOGIN_SERVER      -b "$(ACR_SERVER)"        -R $(GITHUB_ORG)/$(GITHUB_REPO)
	$(call _az-ok,7 secrets configurados em $(GITHUB_ORG)/$(GITHUB_REPO))

# ── Fase 4a: Terraform — infra base com -target (sem Container Apps) ─────────
# Garante que ACR existe ANTES do build das imagens.
# Container Apps aguardam a Fase 4b, após imagens no ACR.
_az-tf-infra: _az-guard-login _az-guard-password
	$(call _az-phase,Fase 4a — Terraform: infra base)
	$(call _az-step,terraform init...)
	@cd $(TF_DIR) && terraform init -upgrade -reconfigure -input=false -no-color 2>&1 | tail -3
	$(call _az-step,terraform apply -target [RG PG Storage KV ACR EventHubs ADX AI]...)
	@cd $(TF_DIR) && terraform apply $(TF_VARS) -auto-approve -input=false \
		-target=azurerm_resource_group.main \
		-target=azurerm_key_vault.kv \
		-target=azurerm_key_vault_access_policy.deployer \
		-target=azurerm_postgresql_flexible_server.pg \
		-target=azurerm_postgresql_flexible_server_database.db \
		-target=azurerm_postgresql_flexible_server_database.langfuse_db \
		-target=azurerm_postgresql_flexible_server_firewall_rule.allow_azure \
		-target=azurerm_storage_account.storage \
		-target=azurerm_storage_container.mlflow \
		-target=azurerm_storage_container.datasets \
		-target=azurerm_log_analytics_workspace.logs \
		-target=azurerm_application_insights.appinsights \
		-target=module.event_hubs \
		-target=module.azure_ml \
		-target=module.ai_foundry \
		-target=module.azure_data_explorer
	$(call _az-ok,Infraestrutura base provisionada)

# ── Fase 5: Build & Push (ACR login único + 3 imagens em sequência) ──────────
_az-build-push: _az-guard-login
	$(call _az-phase,Fase 5 — Build e push das imagens → ACR)
	$(call _az-step,Login ACR $(ACR_NAME)...)
	@az acr login --name $(ACR_NAME)
	$(call _az-step,datathon-api:$(GIT_SHA)...)
	@docker build --platform linux/amd64 -f infra/Dockerfile \
		-t $(ACR_SERVER)/datathon-api:$(GIT_SHA) \
		-t $(ACR_SERVER)/datathon-api:latest .
	@docker push $(ACR_SERVER)/datathon-api:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-api:latest
	$(call _az-step,datathon-web:$(GIT_SHA) [API=$(API_CANONICAL_URL)]...)
	@docker build --platform linux/amd64 -f web/Dockerfile \
		--build-arg NEXT_PUBLIC_API_URL=$(API_CANONICAL_URL) \
		-t $(ACR_SERVER)/datathon-web:$(GIT_SHA) \
		-t $(ACR_SERVER)/datathon-web:latest ./web
	@docker push $(ACR_SERVER)/datathon-web:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-web:latest
	$(call _az-step,datathon-web-product:$(GIT_SHA) [API=$(API_CANONICAL_URL)]...)
	@docker build --platform linux/amd64 -f web-product/Dockerfile \
		--build-arg NEXT_PUBLIC_API_URL=$(API_CANONICAL_URL) \
		-t $(ACR_SERVER)/datathon-web-product:$(GIT_SHA) \
		-t $(ACR_SERVER)/datathon-web-product:latest ./web-product
	@docker push $(ACR_SERVER)/datathon-web-product:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-web-product:latest
	$(call _az-step,datathon-mlflow:$(GIT_SHA)...)
	@docker build --platform linux/amd64 -f infra/Dockerfile.mlflow \
		-t $(ACR_SERVER)/datathon-mlflow:$(GIT_SHA) \
		-t $(ACR_SERVER)/datathon-mlflow:latest .
	@docker push $(ACR_SERVER)/datathon-mlflow:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-mlflow:latest
	$(call _az-ok,4 imagens no ACR — tag $(GIT_SHA))

# Targets públicos de build individual (úteis para re-deploys parciais)
azure-acr-login: _az-guard-login
	@az acr login --name $(ACR_NAME)

azure-build-api: azure-acr-login
	@docker build --platform linux/amd64 -f infra/Dockerfile \
		-t $(ACR_SERVER)/datathon-api:$(GIT_SHA) -t $(ACR_SERVER)/datathon-api:latest .
	@docker push $(ACR_SERVER)/datathon-api:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-api:latest
	$(call _az-ok,datathon-api:$(GIT_SHA))

azure-build-web: azure-acr-login
	@docker build --platform linux/amd64 -f web/Dockerfile \
		--build-arg NEXT_PUBLIC_API_URL=$(API_CANONICAL_URL) \
		-t $(ACR_SERVER)/datathon-web:$(GIT_SHA) -t $(ACR_SERVER)/datathon-web:latest ./web
	@docker push $(ACR_SERVER)/datathon-web:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-web:latest
	$(call _az-ok,datathon-web:$(GIT_SHA))

azure-build-web-product: azure-acr-login
	@docker build --platform linux/amd64 -f web-product/Dockerfile \
		--build-arg NEXT_PUBLIC_API_URL=$(API_CANONICAL_URL) \
		-t $(ACR_SERVER)/datathon-web-product:$(GIT_SHA) -t $(ACR_SERVER)/datathon-web-product:latest ./web-product
	@docker push $(ACR_SERVER)/datathon-web-product:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-web-product:latest
	$(call _az-ok,datathon-web-product:$(GIT_SHA))

azure-build-mlflow: azure-acr-login
	@docker build --platform linux/amd64 -f infra/Dockerfile.mlflow \
		-t $(ACR_SERVER)/datathon-mlflow:$(GIT_SHA) -t $(ACR_SERVER)/datathon-mlflow:latest .
	@docker push $(ACR_SERVER)/datathon-mlflow:$(GIT_SHA)
	@docker push $(ACR_SERVER)/datathon-mlflow:latest
	$(call _az-ok,datathon-mlflow:$(GIT_SHA))

azure-build-push: azure-build-api azure-build-web azure-build-web-product azure-build-mlflow
	$(call _az-ok,4 imagens enviadas — $(ACR_SERVER) tag $(GIT_SHA))

# ── Fase 4b: Terraform — Container Apps (imagens já no ACR) ─────────────────
_az-tf-container-apps: _az-guard-login _az-guard-password
	$(call _az-phase,Fase 4b — Terraform: Container Apps)
	@cd $(TF_DIR) && terraform apply $(TF_VARS) -auto-approve -input=false \
		-target=module.container_apps
	$(call _az-ok,Container Apps provisionados)

# ── Fase 6: Migrations PostgreSQL ────────────────────────────────────────────
_az-db-migrate: _az-guard-password
	$(call _az-phase,Fase 6 — Migrations PostgreSQL)
	$(eval _PG_HOST := $(shell cd $(TF_DIR) && terraform output -raw postgres_fqdn 2>/dev/null))
	@[ -n "$(_PG_HOST)" ] || { echo "ERRO: postgres_fqdn vazio. Execute azure-full-deploy primeiro."; exit 1; }
	$(call _az-step,Host: $(_PG_HOST))
	@for f in \
		infra/sql/001_decision_logs.sql \
		infra/sql/002_bandit_state.sql \
		infra/sql/004_extend_policy_names.sql \
		infra/sql/005_feature_flags.sql \
		infra/sql/006_experiment_synthetic.sql \
		infra/sql/007_ab_test_flags.sql \
		infra/sql/009_bandit_experiments_extended.sql; do \
		printf "  %-52s" "$$f"; \
		$(PSQL) -h $(_PG_HOST) -U datathon_admin -d datathon_db -f $$f -q \
			&& echo "OK" || { echo "FALHOU"; exit 1; }; \
	done
	@printf "  %-52s" "infra/sql/008_langfuse_db.sql (langfuse_db)"
	@$(PSQL) -h $(_PG_HOST) -U datathon_admin -d langfuse_db \
		-f infra/sql/008_langfuse_db.sql -q && echo "OK"
	$(call _az-ok,7 migrations aplicadas — 003_clickhouse ignorado [apenas local])

azure-db-migrate: _az-db-migrate

# ── Fase 7: Seed ─────────────────────────────────────────────────────────────
_az-db-seed:
	$(call _az-phase,Fase 7 — Seed)
	$(eval _API_FQDN := $(shell az containerapp show --name datathon-api-dev \
		--resource-group $(RG_NAME) --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null))
	@[ -n "$(_API_FQDN)" ] || { echo "ERRO: datathon-api-dev não encontrado."; exit 1; }
	$(call _az-step,Criando experimento baseline com registros sintéticos...)
	@curl -sf -X POST "https://$(_API_FQDN)/experiments/" \
		-H "Content-Type: application/json" \
		-d '{"name":"Baseline Azure — CDB vs Poupança","experiment_arms":["savings_account","term_deposit_6m","term_deposit_12m","personal_loan","premium_savings"],"experiment_policy":"contextual_thompson","synthetic_data_enabled":true}' \
		| python3 -m json.tool
	$(call _az-ok,Seed completo)

azure-db-seed: _az-db-seed

# ── Upload de datasets para Azure Blob Storage ────────────────────────────────
azure-upload-datasets: _az-guard-login
	$(call _az-phase,Upload datasets → Azure Blob Storage)
	$(call _az-step,processed/...)
	@az storage blob upload-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--destination datasets \
		--source datasets/processed \
		--destination-path processed \
		--overwrite true --output none
	$(call _az-step,synthetic_enrichment/...)
	@az storage blob upload-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--destination datasets \
		--source datasets/synthetic_enrichment \
		--destination-path synthetic_enrichment \
		--overwrite true --output none
	$(call _az-step,golden_set/...)
	@az storage blob upload-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--destination datasets \
		--source datasets/golden_set \
		--destination-path golden_set \
		--overwrite true --output none
	$(call _az-step,eval_results/...)
	@az storage blob upload-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--destination datasets \
		--source datasets/eval_results \
		--destination-path eval_results \
		--overwrite true --output none
	$(call _az-step,kaggle/ [CSVs originais]...)
	@az storage blob upload-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--destination datasets \
		--source datasets/kaggle \
		--destination-path kaggle \
		--overwrite true --output none
	$(call _az-ok,Todos os datasets enviados para $(STORAGE_ACCOUNT)/datasets)

# ── Simulação de decisões e recompensas contra Azure API ─────────────────────
azure-simulate: _az-guard-login
	$(call _az-phase,Simulação de decisões — populando MLFlow)
	$(eval _API_FQDN := $(shell az containerapp show --name $(TF_PREFIX)-api-$(TF_ENVIRONMENT) \
		--resource-group $(RG_NAME) --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null))
	@[ -n "$(_API_FQDN)" ] || { echo "ERRO: API não encontrada."; exit 1; }
	$(call _az-step,Rodando 200 rounds de decide+reward via simulate.py...)
	@PYTHONPATH=. uv run python scripts/simulate.py \
		--rounds 200 \
		--api "https://$(_API_FQDN)"
	$(call _az-ok,Simulação completa — verifique MLflow para runs criados)

# ── Fase 8: Managed Identity → Container Apps (UPDATE, sem o bug do CREATE) ──
_az-identity-restore:
	$(call _az-phase,Fase 8 — Managed Identity → Container Apps)
	$(eval _IDENTITY_ID := $(shell az identity show --name datathon-ca-identity-dev \
		--resource-group $(RG_NAME) --query id -o tsv 2>/dev/null))
	@[ -n "$(_IDENTITY_ID)" ] || { echo "ERRO: identidade datathon-ca-identity-dev não encontrada."; exit 1; }
	@for app in datathon-api-dev datathon-web-dev datathon-webprod-dev datathon-mlflow-dev datathon-langfuse-dev; do \
		printf "  %-35s" "$$app"; \
		az containerapp identity assign \
			--name $$app --resource-group $(RG_NAME) \
			--user-assigned "$(_IDENTITY_ID)" --output none && echo "OK"; \
	done
	$(call _az-ok,Managed Identity atribuída a 5 Container Apps via UPDATE)

azure-identity-restore: _az-identity-restore

# ── Fase 9: Smoke Tests ──────────────────────────────────────────────────────
_az-smoke-test:
	$(call _az-phase,Fase 9 — Smoke Tests)
	$(eval _API_FQDN := $(shell az containerapp show --name datathon-api-dev \
		--resource-group $(RG_NAME) --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null))
	@[ -n "$(_API_FQDN)" ] || { echo "ERRO: datathon-api-dev não encontrado."; exit 1; }
	$(call _az-step,[1/4] Health...)
	@curl -sf "https://$(_API_FQDN)/healthz" | python3 -m json.tool
	$(call _az-step,[2/4] Decide Thompson...)
	@curl -sf -X POST "https://$(_API_FQDN)/decide/" \
		-H "Content-Type: application/json" \
		-d '{"features":{"age":35,"housing":"yes","job":"technician"},"policy":"thompson"}' \
		| python3 -m json.tool
	$(call _az-step,[3/4] Métricas...)
	@curl -sf "https://$(_API_FQDN)/metrics/?policy=thompson" | python3 -m json.tool
	$(call _az-step,[4/4] Assistente RAG...)
	@curl -sf -X POST "https://$(_API_FQDN)/assistant/ask" \
		-H "Content-Type: application/json" \
		-d '{"query":"Qual o melhor produto para clientes jovens?","mode":"advise"}' \
		| python3 -m json.tool
	$(call _az-ok,Todos os smoke tests passaram)

azure-smoke-test: _az-smoke-test

# ── Fase 10: Endpoints ───────────────────────────────────────────────────────
azure-endpoints:
	@printf "\n\033[1m╔═══════════════════════════════════════════════════════════════════════╗\033[0m\n"
	@printf "\033[1m║             ENDPOINTS — datathon-7mlet / dev                         ║\033[0m\n"
	@printf "\033[1m╠═══════════════════════════════════════════════════════════════════════╣\033[0m\n"
	@API=$$(az containerapp show --name datathon-api-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	printf "║  \033[1;32mAPI (FastAPI)\033[0m        https://$$API\n"; \
	printf "║    ├─ Swagger        https://$$API/docs\n"; \
	printf "║    └─ Health         https://$$API/healthz\n"
	@WEB=$$(az containerapp show --name datathon-web-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	printf "║  \033[1;32mWeb Dashboard\033[0m        https://$$WEB\n"
	@WEBP=$$(az containerapp show --name datathon-webprod-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	printf "║  \033[1;32mWeb Product\033[0m          https://$$WEBP\n"
	@MLF=$$(az containerapp show --name datathon-mlflow-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	printf "║  \033[1;32mMLflow\033[0m               https://$$MLF\n"
	@LFU=$$(az containerapp show --name datathon-langfuse-dev --resource-group $(RG_NAME) \
		--query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null); \
	printf "║  \033[1;32mLangfuse\033[0m             https://$$LFU\n"
	@printf "║\n"
	@ADX=$$(cd $(TF_DIR) && terraform output -raw kusto_cluster_uri 2>/dev/null); \
	printf "║  ADX (Kusto)         $$ADX\n"
	@OAI=$$(cd $(TF_DIR) && terraform output -raw openai_endpoint 2>/dev/null); \
	printf "║  Azure OpenAI        $$OAI\n"
	@SCH=$$(cd $(TF_DIR) && terraform output -raw ai_search_endpoint 2>/dev/null); \
	printf "║  AI Search           $$SCH\n"
	@printf "\033[1m╚═══════════════════════════════════════════════════════════════════════╝\033[0m\n"

# ── Terraform — targets de uso manual ────────────────────────────────────────
azure-tf-init: _az-guard-login
	@cd $(TF_DIR) && terraform init -upgrade -reconfigure

azure-tf-plan: _az-guard-login _az-guard-password
	@cd $(TF_DIR) && terraform plan $(TF_VARS) -out=tfplan

azure-tf-apply: _az-guard-login _az-guard-password
	@cd $(TF_DIR) && terraform apply $(TF_VARS) -auto-approve
	@$(MAKE) azure-tf-outputs

azure-tf-outputs:
	@cd $(TF_DIR) && terraform output 2>/dev/null || echo "(outputs disponíveis após apply)"

azure-tf-destroy: _az-guard-login
	@read -p "  Digite 'destroy' para confirmar destruição de TODA a infra Azure: " c \
		&& [ "$$c" = "destroy" ] || { echo "Cancelado."; exit 1; }
	@cd $(TF_DIR) && terraform destroy $(TF_VARS)

# ════════════════════════════════════════════════════════════════════════════
# PONTO DE ENTRADA ÚNICO
#   make azure-full-deploy PG_PASSWORD=<senha>
#
# Executa as 10 fases em sequência e deixa o sistema 100% operacional.
# ════════════════════════════════════════════════════════════════════════════
azure-full-deploy: _az-guard-password azure-check-tools \
                   _az-register-providers _az-bootstrap-state \
                   _az-tf-infra \
                   _az-build-push \
                   _az-tf-container-apps \
                   _az-db-migrate _az-db-seed \
                   _az-identity-restore _az-wait-api \
                   _az-smoke-test azure-endpoints
	@printf "\n\033[1;32m╔══════════════════════════════════════════════════╗\033[0m\n"
	@printf "\033[1;32m║  Sistema Azure no ar! Tudo verde.                ║\033[0m\n"
	@printf "\033[1;32m╚══════════════════════════════════════════════════╝\033[0m\n"

# alias de compatibilidade
azure-migrate: azure-full-deploy
azure-deploy-all: _az-build-push _az-tf-container-apps _az-db-migrate _az-db-seed \
                  _az-identity-restore _az-wait-api _az-smoke-test azure-endpoints

# ════════════════════════════════════════════════════════════════════════════
# GESTÃO DE CUSTOS — Pause / Resume / Destroy seguro
#
#   make azure-pause          → pausa ADX + Container Apps (0 réplicas)  ~$42/mês
#   make azure-resume         → retoma tudo ao estado normal
#   make azure-backup         → dump PG + download MLflow artifacts
#   make azure-purge          → purge de recursos em soft-delete (pós-destroy)
#   make azure-safe-destroy   → backup + instruções + terraform destroy guiado
#
# Ver análise completa: PLAN_BUILD_DESTROY_AZURE.md
# ════════════════════════════════════════════════════════════════════════════

# ── Pause: ADX + Container Apps em 0 réplicas ────────────────────────────────
azure-pause: _az-guard-login
	$(call _az-phase,Pausando recursos de alto custo)
	$(call _az-step,Pausando cluster ADX '$(TF_PREFIX)adx$(TF_ENVIRONMENT)'...)
	@az kusto cluster stop \
		--name "$(TF_PREFIX)adx$(TF_ENVIRONMENT)" \
		--resource-group $(RG_NAME) \
		--output none 2>/dev/null && echo "  ADX pausado" || echo "  ADX já pausado ou não encontrado"
	$(call _az-step,Escalando Container Apps para 0 réplicas...)
	@for app in \
		$(TF_PREFIX)-api-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-web-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-webprod-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-mlflow-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-langfuse-$(TF_ENVIRONMENT); do \
		printf "  %-38s" "$$app"; \
		az containerapp update --name $$app --resource-group $(RG_NAME) \
			--min-replicas 0 --max-replicas 0 --output none 2>/dev/null \
			&& echo "0 réplicas" || echo "não encontrado"; \
	done
	$(call _az-ok,Stack pausado — custo estimado ~$$42-65/mês [ADX+Search])
	@printf "  Para retomar: make azure-resume\n"

# ── Resume: ADX + Container Apps de volta ao normal ──────────────────────────
azure-resume: _az-guard-login
	$(call _az-phase,Retomando recursos pausados)
	$(call _az-step,Iniciando cluster ADX '$(TF_PREFIX)adx$(TF_ENVIRONMENT)'...)
	@az kusto cluster start \
		--name "$(TF_PREFIX)adx$(TF_ENVIRONMENT)" \
		--resource-group $(RG_NAME) \
		--output none 2>/dev/null && echo "  ADX iniciando (aguarde ~3 min)..." || echo "  ADX não encontrado"
	$(call _az-step,Restaurando Container Apps para 1 réplica...)
	@for app in \
		$(TF_PREFIX)-api-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-web-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-webprod-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-mlflow-$(TF_ENVIRONMENT) \
		$(TF_PREFIX)-langfuse-$(TF_ENVIRONMENT); do \
		printf "  %-38s" "$$app"; \
		az containerapp update --name $$app --resource-group $(RG_NAME) \
			--min-replicas 1 --max-replicas 3 --output none 2>/dev/null \
			&& echo "1-3 réplicas" || echo "não encontrado"; \
	done
	$(call _az-ok,Stack retomado — aguarde ~3 min para o ADX ficar online)
	@$(MAKE) azure-endpoints

# ── Backup: PostgreSQL + MLflow artifacts ────────────────────────────────────
azure-backup: _az-guard-login _az-guard-password
	$(call _az-phase,Backup pré-destroy)
	$(eval _BACKUP_DIR := ./backup/azure-$(shell date +%Y%m%d-%H%M))
	@mkdir -p $(_BACKUP_DIR)
	$(eval _PG_HOST := $(shell az postgres flexible-server show \
		--name $(TF_PREFIX)-pg-$(TF_ENVIRONMENT) \
		--resource-group $(RG_NAME) \
		--query "fullyQualifiedDomainName" -o tsv 2>/dev/null))
	$(call _az-step,Dump PostgreSQL → $(_BACKUP_DIR)/datathon_db.sql)
	@[ -n "$(_PG_HOST)" ] || { echo "ERRO: Postgres não encontrado."; exit 1; }
	@PGPASSWORD=$(PG_PASSWORD) pg_dump \
		-h $(_PG_HOST) -U datathon_admin datathon_db \
		> $(_BACKUP_DIR)/datathon_db.sql \
		&& echo "  datathon_db.sql — OK ($(shell wc -c < $(_BACKUP_DIR)/datathon_db.sql) bytes)" \
		|| { echo "  FALHOU — instale psql ou verifique PG_PASSWORD"; exit 1; }
	$(call _az-step,Dump langfuse_db → $(_BACKUP_DIR)/langfuse_db.sql)
	@PGPASSWORD=$(PG_PASSWORD) pg_dump \
		-h $(_PG_HOST) -U datathon_admin langfuse_db \
		> $(_BACKUP_DIR)/langfuse_db.sql 2>/dev/null \
		&& echo "  langfuse_db.sql — OK" || echo "  langfuse_db não disponível (ignorado)"
	$(call _az-step,Download MLflow artifacts → $(_BACKUP_DIR)/mlflow-artifacts/)
	@az storage blob download-batch \
		--account-name $(STORAGE_ACCOUNT) \
		--source mlflow-artifacts \
		--destination $(_BACKUP_DIR)/mlflow-artifacts \
		--auth-mode login \
		--output none 2>/dev/null \
		&& echo "  mlflow-artifacts — OK" || echo "  mlflow-artifacts vazio ou não encontrado"
	$(call _az-ok,Backup salvo em $(_BACKUP_DIR))
	@printf "  Próximo passo: make azure-safe-destroy PG_PASSWORD=<senha>\n"

# ── Purge: limpa soft-deletes após destroy ────────────────────────────────────
# Executar APÓS terraform destroy para liberar os nomes dos recursos.
# Sem o purge: Key Vault bloqueado 90 dias, OpenAI bloqueado 48h.
azure-purge: _az-guard-login
	$(call _az-phase,Purge de recursos em soft-delete)
	$(call _az-step,Purge Key Vault '$(TF_PREFIX)-kv-7mlet-$(TF_ENVIRONMENT)'...)
	@az keyvault purge \
		--name "$(TF_PREFIX)-kv-7mlet-$(TF_ENVIRONMENT)" \
		--location $(AZURE_LOCATION) 2>/dev/null \
		&& echo "  Key Vault purgado" \
		|| echo "  Key Vault não encontrado em soft-delete (OK)"
	$(call _az-step,Purge Azure OpenAI '$(TF_PREFIX)-openai-$(TF_ENVIRONMENT)'...)
	@az cognitiveservices account purge \
		--name "$(TF_PREFIX)-openai-$(TF_ENVIRONMENT)" \
		--resource-group $(RG_NAME) \
		--location $(OPENAI_LOCATION) 2>/dev/null \
		&& echo "  OpenAI purgado" \
		|| echo "  OpenAI não encontrado em soft-delete (OK)"
	$(call _az-step,Verificando outros soft-deletes...)
	@az keyvault list-deleted --query "[].name" -o tsv 2>/dev/null | \
		grep "$(TF_PREFIX)" | while read kv; do \
			printf "  Key Vault deletado encontrado: $$kv\n"; \
		done
	$(call _az-ok,Purge concluído — nomes liberados para reutilização)

# ── Safe Destroy: backup + purge + terraform destroy ─────────────────────────
azure-safe-destroy: _az-guard-login _az-guard-password
	$(call _az-phase,Destroy seguro — ATENÇÃO: operação irreversível)
	@printf "\033[1;33m"
	@printf "  ╔═══════════════════════════════════════════════════════╗\n"
	@printf "  ║  ATENÇÃO: Esta operação vai destruir TODOS os         ║\n"
	@printf "  ║  recursos Azure do projeto datathon-7mlet.            ║\n"
	@printf "  ║                                                       ║\n"
	@printf "  ║  Dados PERMANENTEMENTE PERDIDOS sem backup:           ║\n"
	@printf "  ║    • PostgreSQL (decision_logs, bandit_state, flags)  ║\n"
	@printf "  ║    • ADX flag_events (~2k+ linhas)                    ║\n"
	@printf "  ║    • MLflow runs e artefatos                          ║\n"
	@printf "  ║    • AI Search índices                                ║\n"
	@printf "  ╚═══════════════════════════════════════════════════════╝\n"
	@printf "\033[0m"
	@read -p "  1/3 — Confirme o backup foi feito (s/N): " b \
		&& [ "$$b" = "s" ] || { echo "  Execute 'make azure-backup PG_PASSWORD=<senha>' primeiro."; exit 1; }
	@read -p "  2/3 — Digite 'destroy' para confirmar: " c \
		&& [ "$$c" = "destroy" ] || { echo "  Cancelado."; exit 1; }
	@read -p "  3/3 — Confirme o nome do projeto [datathon]: " p \
		&& [ "$$p" = "datathon" ] || { echo "  Cancelado."; exit 1; }
	$(call _az-step,Executando terraform destroy...)
	@cd $(TF_DIR) && terraform destroy $(TF_VARS) -auto-approve
	$(call _az-step,Executando purge de soft-deletes...)
	@$(MAKE) azure-purge
	$(call _az-ok,Destroy concluído)
	@printf "  Para recriar: make azure ACTION=create PG_PASSWORD=<senha>\n"
	@printf "  Tempo estimado de rebuild: ~90-120 min\n"
	@printf "  Consulte PLAN_BUILD_DESTROY_AZURE.md para o passo a passo.\n"

# ════════════════════════════════════════════════════════════════════════════
# PONTO DE ENTRADA UNIFICADO — criar ou destruir tudo com um único comando
#
#   make azure ACTION=create  PG_PASSWORD=<senha>   → provisiona do zero
#   make azure ACTION=destroy PG_PASSWORD=<senha>   → destrói com segurança
#
# O target "create" executa um purge automático antes do Terraform para
# evitar bloqueios de soft-delete (Key Vault 90 dias, OpenAI 48h) que
# causariam falha ao recriar recursos com o mesmo nome após um destroy.
# ════════════════════════════════════════════════════════════════════════════

# Cria do zero: purge silencioso de soft-deletes + full deploy
_azure-safe-create: _az-guard-login _az-guard-password
	$(call _az-phase,Pré-create — limpando soft-deletes residuais)
	@az keyvault purge \
		--name "$(TF_PREFIX)-kv-7mlet-$(TF_ENVIRONMENT)" \
		--location $(AZURE_LOCATION) 2>/dev/null \
		&& echo "  Key Vault purgado (estava em soft-delete)" \
		|| echo "  Key Vault sem soft-delete — OK"
	@az cognitiveservices account purge \
		--name "$(TF_PREFIX)-openai-$(TF_ENVIRONMENT)" \
		--resource-group $(RG_NAME) \
		--location $(OPENAI_LOCATION) 2>/dev/null \
		&& echo "  OpenAI purgado (estava em soft-delete)" \
		|| echo "  OpenAI sem soft-delete — OK"
	$(call _az-ok,Soft-deletes limpos — iniciando full deploy)
	@$(MAKE) azure-full-deploy PG_PASSWORD=$(PG_PASSWORD)

azure: _az-guard-login
	@if [ "$(ACTION)" = "create" ]; then \
		$(MAKE) _azure-safe-create PG_PASSWORD=$(PG_PASSWORD); \
	elif [ "$(ACTION)" = "destroy" ]; then \
		$(MAKE) azure-safe-destroy PG_PASSWORD=$(PG_PASSWORD); \
	else \
		printf "\n\033[1;33m  Uso:\033[0m\n"; \
		printf "    make azure ACTION=create  PG_PASSWORD=<senha>"; \
		printf "   → provisiona toda a infra do zero\n"; \
		printf "    make azure ACTION=destroy PG_PASSWORD=<senha>"; \
		printf "   → destrói tudo com segurança\n\n"; \
		printf "  Ambas as ações são idempotentes e tratam soft-deletes automaticamente.\n\n"; \
		exit 1; \
	fi
