"""Client segmentation for contextual bandit policies.

Segments are intentionally coarse — fine enough to differentiate arm preferences
without fragmenting state into sub-populations too small to learn from.
"""
from __future__ import annotations

SEGMENTS = [
    "young",
    "mid_low_risk",
    "mid_indebted",
    "senior_high_edu",
    "senior",
    "default",
]

_HIGH_EDU = {"tertiary", "university.degree", "professional.course"}


def classify_segment(features: dict) -> str:
    """Map client feature dict to one of the 6 defined segments.

    Falls back to 'default' for any combination not matched above.
    Features expected: age (int), education (str), housing (str),
    loan (str), balance (float).
    """
    age = int(features.get("age", 35))
    education = str(features.get("education", "secondary")).lower()
    housing = str(features.get("housing", "no")).lower()
    loan = str(features.get("loan", "no")).lower()
    balance = float(features.get("balance", 0))

    high_edu = education in _HIGH_EDU

    if age < 30:
        return "young"

    if age >= 45:
        return "senior_high_edu" if high_edu else "senior"

    # mid-age (30-44)
    if housing == "yes" and loan == "yes":
        return "mid_indebted"

    if balance > 1000:
        return "mid_low_risk"

    return "default"
