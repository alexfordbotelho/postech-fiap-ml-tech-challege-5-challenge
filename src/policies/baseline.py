from .base import BanditPolicy, DecisionContext, PolicyDecision


SEGMENT_RULES: dict[str, str] = {
    # (age_bucket, education_bucket) -> preferred_arm
    "senior_high_edu": "premium_savings",
    "senior_low_edu": "term_deposit_12m",
    "mid_indebted": "personal_loan",
    "mid_balanced": "term_deposit_6m",
    "default": "savings_account",
}


def _classify_segment(features: dict) -> str:
    age = features.get("age", 35)
    education = features.get("education", "secondary")
    housing = features.get("housing", "no")
    high_edu = education in ("tertiary", "university.degree", "professional.course")

    if age >= 45 and high_edu:
        return "senior_high_edu"
    if age >= 45:
        return "senior_low_edu"
    if housing == "yes" and features.get("loan", "no") == "yes":
        return "mid_indebted"
    if features.get("balance", 0) > 1000:
        return "mid_balanced"
    return "default"


class BaselinePolicy(BanditPolicy):
    def select_arm(self, context: DecisionContext, arms: list[str]) -> PolicyDecision:
        segment = _classify_segment(context.features)
        preferred = SEGMENT_RULES.get(segment, "savings_account")
        arm_id = preferred if preferred in arms else arms[0]
        return PolicyDecision(
            arm_id=arm_id,
            confidence=1.0,
            is_exploration=False,
            policy_name="baseline",
        )

    def update(self, arm_id: str, reward: float, segment: str = "default") -> None:
        pass  # deterministic — no state to update

    def get_state(self) -> dict:
        return {}

    def load_state(self, state: dict) -> None:
        pass
