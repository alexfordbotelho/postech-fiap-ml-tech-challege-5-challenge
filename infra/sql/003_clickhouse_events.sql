-- ClickHouse DDL: run inside the clickhouse container
-- Applied via docker-entrypoint-initdb.d
CREATE DATABASE IF NOT EXISTS datathon;

CREATE TABLE IF NOT EXISTS datathon.events (
    decision_id    String,
    timestamp      DateTime DEFAULT now(),
    policy_name    LowCardinality(String),
    arm_selected   LowCardinality(String),
    reward         Nullable(Float32),
    is_exploration UInt8,
    session_id     String,
    segment        LowCardinality(String) DEFAULT 'default',
    channel        LowCardinality(String) DEFAULT 'web'
)
ENGINE = MergeTree()
ORDER BY (timestamp, policy_name)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 14 DAY DELETE
SETTINGS min_rows_for_wide_part = 50000,
         min_bytes_for_wide_part = 52428800;

-- Tabela para análise em tempo real por cenário de feature flag
-- Separada de datathon.events para evitar migration na tabela histórica
CREATE TABLE IF NOT EXISTS datathon.flag_events (
    decision_id    String,
    timestamp      DateTime DEFAULT now(),
    policy_name    LowCardinality(String),
    arm_selected   LowCardinality(String),
    reward         Nullable(Float32),
    is_exploration UInt8,
    segment        LowCardinality(String) DEFAULT 'default',
    channel        LowCardinality(String) DEFAULT 'web',
    flag_snapshot  String DEFAULT '{}'
)
ENGINE = MergeTree()
ORDER BY (timestamp, policy_name)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 14 DAY DELETE
SETTINGS min_rows_for_wide_part = 50000,
         min_bytes_for_wide_part = 52428800;
