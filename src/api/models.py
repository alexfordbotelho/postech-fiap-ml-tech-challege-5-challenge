from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from src.config import ARMS_CATALOG


class DecideRequest(BaseModel):
    session_id: UUID = Field(default_factory=uuid4)
    features: dict[str, Any] = Field(
        description="Client features: age, balance, education, housing, job, etc."
    )
    arms: list[str] | None = Field(
        default=None,
        description="Override default arms catalog. If None, uses ARMS_CATALOG.",
    )
    policy: str = Field(
        default="thompson",
        description="Policy to use: baseline | thompson | ucb | contextual_thompson | contextual_ucb",
    )
    channel: str = Field(
        default="web",
        description="Decision channel: web | mobile | email | call_center",
    )


class DecideResponse(BaseModel):
    decision_id: UUID
    offer_id: str
    policy: str
    confidence: float
    is_exploration: bool
    segment: str = "default"


class ExplainResponse(BaseModel):
    decision_id: UUID
    arm_selected: str
    policy: str
    segment: str
    is_exploration: bool
    channel: str
    context_features: dict[str, Any]
    reward: float | None
    reasoning: dict[str, Any]


class RewardRequest(BaseModel):
    decision_id: UUID
    reward: float = Field(ge=0.0, le=1.0, description="Binary reward: 0.0 or 1.0")


class RewardResponse(BaseModel):
    status: str = "ok"
    updated_arm: str
    policy: str


class MetricsResponse(BaseModel):
    policy: str
    total_decisions: int
    cumulative_reward: float
    avg_reward: float
    exploration_rate: float
    arms_catalog: list[str] = Field(default_factory=lambda: ARMS_CATALOG)


class HealthResponse(BaseModel):
    status: str = "ok"
    services: dict[str, str] = Field(default_factory=dict)


class DecisionItem(BaseModel):
    decision_id: str
    policy_name: str
    arm_selected: str
    segment: str | None = None
    channel: str | None = None
    is_exploration: bool
    reward: float | None = None
    created_at: str


class DecisionListResponse(BaseModel):
    total: int
    page: int
    limit: int
    items: list[DecisionItem]


class MlopsRun(BaseModel):
    run_id: str
    arm: str
    reward: float
    cumulative_reward: float
    exploration_rate: float
    total_decisions: int
    created_at: str


class MlopsRunsResponse(BaseModel):
    policy: str
    runs: list[MlopsRun]


class ChannelMetricsItem(BaseModel):
    channel: str
    policy_name: str
    total_decisions: int
    avg_reward: float
    cumulative_reward: float
    exploration_rate: float


class ChannelMetricsResponse(BaseModel):
    items: list[ChannelMetricsItem]


# ── Feature Flags ─────────────────────────────────────────────────────────────

class FeatureFlagRule(BaseModel):
    condition: dict[str, Any] = Field(default_factory=dict)
    value: Any


class FeatureFlagCreate(BaseModel):
    flag_key: str
    description: str = ""
    flag_type: str = Field(default="string", pattern="^(boolean|string|number|json)$")
    default_value: Any = None
    rules: list[FeatureFlagRule] = Field(default_factory=list)
    enabled: bool = True
    tags: list[str] = Field(default_factory=list)


class FeatureFlagResponse(BaseModel):
    flag_key: str
    description: str
    flag_type: str
    default_value: Any
    rules: Any
    enabled: bool
    tags: list[str]
    created_at: str | None = None
    updated_at: str | None = None


class FlagEvaluateRequest(BaseModel):
    context: dict[str, Any] = Field(default_factory=dict)


class FlagEvaluateResponse(BaseModel):
    flag_key: str
    value: Any
    enabled: bool


class SdkPayloadResponse(BaseModel):
    flags: dict[str, Any]


# ── Experiments ───────────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    name: str
    description: str = ""
    hypothesis: str = ""
    metric_primary: str = "avg_reward"
    experiment_policy: str = "contextual_thompson"
    experiment_arms: list[str] = Field(default_factory=list)
    targeting_segments: list[str] = Field(default_factory=list)
    targeting_channels: list[str] = Field(default_factory=list)
    synthetic_data_enabled: bool = False


class ExperimentResponse(BaseModel):
    id: str
    name: str
    description: str
    hypothesis: str
    status: str
    metric_primary: str
    experiment_policy: str
    experiment_arms: list[str]
    targeting_segments: list[str]
    targeting_channels: list[str]
    winner: str | None
    started_at: str | None
    stopped_at: str | None
    created_at: str
    decisions_count: int = 0
    synthetic_data_enabled: bool = False
    synthetic_data_count: int = 0


class SyntheticGenerateResponse(BaseModel):
    experiment_id: str
    generated: int
    total_synthetic: int


class ArmResult(BaseModel):
    arm_id: str
    n: int
    total_reward: float
    avg_reward: float
    explorations: int
    exploration_rate: float
    prob_best: float | None = None
    expected_lift: float | None = None
    ci_95: list[float] | None = None
    is_best: bool = False


class ExperimentResultsResponse(BaseModel):
    experiment_id: str
    name: str
    status: str
    experiment_policy: str
    days_running: float | None
    arms: list[ArmResult]
    recommendation: str
    sample_reached: bool
    min_sample_per_arm: int
    total_decisions: int
