from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ARMS_CATALOG: list[str] = [
    "savings_account",
    "term_deposit_6m",
    "term_deposit_12m",
    "personal_loan",
    "premium_savings",
]

ARM_DISPLAY_NAMES: dict[str, str] = {
    "savings_account": "Conta Poupança",
    "premium_savings": "Poupança Premium",
    "term_deposit_6m": "CDB 6 Meses",
    "term_deposit_12m": "CDB 12 Meses",
    "personal_loan": "Empréstimo Pessoal",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database — can be set directly via DATABASE_URL, or built from components
    # (PG_HOST + PG_PASSWORD + PG_USER + PG_NAME) when using Container Apps
    # secret_name binding to avoid shell-substitution pitfalls with $(secret).
    database_url: str = "postgresql+asyncpg://datathon:datathon_local_pw@postgres:5432/datathon_db"
    pg_host: str = ""
    pg_user: str = "datathon_admin"
    pg_password: str = ""
    pg_name: str = "datathon_db"
    pg_port: int = 5432

    # Redis
    redis_url: str = "redis://redis:6379/0"
    redis_state_ttl: int = 3600

    # Kafka
    kafka_bootstrap_servers: str = "kafka:9092"
    kafka_topic: str = "offer-events"

    # MLflow
    mlflow_tracking_uri: str = "http://mlflow:5000"
    mlflow_experiment: str = "datathon-bandit"

    # S3 / MinIO (local) — used by MLflow artifact store
    mlflow_s3_endpoint_url: str = "http://minio:9100"
    aws_access_key_id: str = "minioadmin"
    aws_secret_access_key: str = "minioadmin"

    # ClickHouse — HTTP interface
    clickhouse_host: str = "clickhouse"
    clickhouse_port: int = 8123
    clickhouse_db: str = "datathon"
    # ClickHouse — native binary protocol (TCP/9000). Analytics uses this to
    # avoid Poco HTTP thread-pool CLOSE_WAIT exhaustion on Docker Desktop.
    clickhouse_native_host: str = "clickhouse"
    clickhouse_native_port: int = 9000

    # HyperDX OTLP
    hyperdx_otlp_endpoint: str = "http://hyperdx:4318"

    # LLM — LM Studio (local) or OpenAI-compatible endpoint
    openai_base_url: str = "http://host.docker.internal:1234/v1"
    openai_api_key: str = "lm-studio"
    llm_model: str = "mistral-nemo-instruct-2407"

    # Qdrant vector store (local)
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    qdrant_collection: str = "bandit_assistant"

    # Embedding model — LM Studio or Ollama (OpenAI-compatible endpoint)
    embed_model: str = "nomic-embed-text"
    embed_base_url: str = "http://host.docker.internal:1234/v1"
    embed_api_key: str = "lm-studio"

    # ── Azure settings (empty = use local services above) ─────────────────────

    # Azure OpenAI — set to enable Azure backend for LLM + embeddings
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-4o"
    azure_embed_deployment: str = "text-embedding-3-small"

    # Azure AI Search — set to enable Azure backend for vector store
    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index: str = "policy-docs"

    # Azure Data Explorer — set to enable KQL analytics instead of ClickHouse
    kusto_cluster_uri: str = ""
    kusto_database: str = "datathon"
    # Client ID of the user-assigned Managed Identity — required for ADX auth
    # when running in Container Apps (system MSI endpoint is not exposed there).
    kusto_msi_client_id: str = ""

    # ── Langfuse observability ────────────────────────────────────────────────
    langfuse_enabled: bool = False
    langfuse_public_key: str = "pk-lf-placeholder"
    langfuse_secret_key: str = "sk-lf-placeholder"
    langfuse_host: str = "http://langfuse:3000"

    # Bandit
    active_policy: str = "thompson"
    ucb_c: float = 1.414
    min_exploration_rate: float = 0.05
    log_level: str = "INFO"

    # Multi-channel
    supported_channels: str = "web,mobile,email,call_center"

    # ── Convenience predicates ────────────────────────────────────────────────

    @model_validator(mode="after")
    def _build_database_url(self) -> "Settings":
        if self.pg_host and self.pg_password:
            self.database_url = (
                f"postgresql+asyncpg://{self.pg_user}:{self.pg_password}"
                f"@{self.pg_host}:{self.pg_port}/{self.pg_name}?sslmode=require"
            )
        return self

    @property
    def use_azure_openai(self) -> bool:
        return bool(self.azure_openai_endpoint)

    @property
    def use_azure_search(self) -> bool:
        return bool(self.azure_search_endpoint)

    @property
    def use_kusto(self) -> bool:
        return bool(self.kusto_cluster_uri)


settings = Settings()
