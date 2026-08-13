"""Statistical engine for bandit experiment analysis.

Provides:
- Bayesian Beta-Binomial test (exact for binary conversion)
- Sequential testing via mSPRT (always-valid — peek any time)
- Minimum detectable effect and sample size calculator
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class BayesianResult:
    prob_treatment_wins: float
    expected_lift: float
    ci_95_lower: float
    ci_95_upper: float
    control_rate: float
    treatment_rate: float


@dataclass
class SequentialResult:
    log_bayes_factor: float
    significant: bool
    alpha: float


@dataclass
class PowerResult:
    min_sample_per_variation: int
    mde: float
    baseline_rate: float


N_SAMPLES = 100_000


def bayesian_test(
    control_n: int,
    control_conversions: int,
    treatment_n: int,
    treatment_conversions: int,
    rng_seed: int = 42,
) -> BayesianResult:
    """Beta-Binomial Thompson Sampling comparison.

    Returns probability that treatment beats control plus 95% credible interval
    on the lift (treatment_rate - control_rate).
    """
    rng = np.random.default_rng(rng_seed)
    ctrl = rng.beta(
        control_conversions + 1,
        max(control_n - control_conversions, 0) + 1,
        N_SAMPLES,
    )
    trt = rng.beta(
        treatment_conversions + 1,
        max(treatment_n - treatment_conversions, 0) + 1,
        N_SAMPLES,
    )
    diff = trt - ctrl
    ci = np.percentile(diff, [2.5, 97.5])
    return BayesianResult(
        prob_treatment_wins=float(np.mean(trt > ctrl)),
        expected_lift=float(np.mean(diff)),
        ci_95_lower=float(ci[0]),
        ci_95_upper=float(ci[1]),
        control_rate=float(np.mean(ctrl)),
        treatment_rate=float(np.mean(trt)),
    )


def sequential_test(
    control_n: int,
    control_conversions: int,
    treatment_n: int,
    treatment_conversions: int,
    alpha: float = 0.05,
) -> SequentialResult:
    """mixture Sequential Probability Ratio Test (mSPRT).

    Always-valid: can be checked at any point without inflating type-I error.
    Equivalent to GrowthBook's sequential testing approach.
    """
    n = control_n + treatment_n
    if n == 0:
        return SequentialResult(log_bayes_factor=0.0, significant=False, alpha=alpha)

    p_ctrl = control_conversions / max(control_n, 1)
    p_trt = treatment_conversions / max(treatment_n, 1)
    obs_lift = p_trt - p_ctrl

    # Pooled variance under null
    p_pool = (control_conversions + treatment_conversions) / n
    variance = p_pool * (1 - p_pool) * (1 / max(control_n, 1) + 1 / max(treatment_n, 1))

    if variance <= 0:
        return SequentialResult(log_bayes_factor=0.0, significant=False, alpha=alpha)

    v0 = 1.0  # diffuse prior variance
    log_bf = 0.5 * np.log(v0 / (v0 + n * variance)) + \
             (n * obs_lift ** 2) / (2 * (v0 + n * variance))
    threshold = -np.log(alpha)
    return SequentialResult(
        log_bayes_factor=float(log_bf),
        significant=bool(log_bf > threshold),
        alpha=alpha,
    )


def power_analysis(
    baseline_rate: float,
    relative_mde: float = 0.10,
    alpha: float = 0.05,
    power: float = 0.80,
    max_sample: int = 15_000,
) -> PowerResult:
    """Calculate minimum sample size per variation for given MDE."""
    z_alpha = 1.96   # two-tailed α=0.05
    z_beta = 0.84    # power=0.80
    p = baseline_rate
    mde_abs = p * relative_mde
    if mde_abs <= 0 or p <= 0 or p >= 1:
        return PowerResult(min_sample_per_variation=0, mde=0.0, baseline_rate=p)
    n = ((z_alpha + z_beta) ** 2 * 2 * p * (1 - p)) / (mde_abs ** 2)
    return PowerResult(
        min_sample_per_variation=min(int(np.ceil(n)), max_sample),
        mde=mde_abs,
        baseline_rate=p,
    )


def bayesian_best_arm(arms: list[dict], rng_seed: int = 42) -> list[dict]:
    """Multi-arm Bayesian comparison using Thompson Sampling.

    For each arm draws N_SAMPLES from its Beta posterior, then computes
    prob_best (share of samples where this arm was the best), expected_lift
    vs the arm with the lowest avg_reward, and 95% CI on that lift.
    """
    if not arms:
        return arms

    rng = np.random.default_rng(rng_seed)
    ns = np.array([int(a.get("n", 0)) for a in arms])
    rewards = np.array([float(a.get("total_reward", 0)) for a in arms])
    alphas = rewards + 1.0
    betas = np.maximum(ns - rewards, 0) + 1.0

    # Draw samples: shape (N_SAMPLES, n_arms)
    samples = rng.beta(alphas, betas, size=(N_SAMPLES, len(arms)))
    best_idx = np.argmax(samples, axis=1)  # (N_SAMPLES,)

    baseline_idx = int(np.argmin([a.get("avg_reward", 0) for a in arms]))
    baseline_samples = samples[:, baseline_idx]

    results = []
    for i, arm in enumerate(arms):
        prob_best = float(np.mean(best_idx == i))
        lift_samples = samples[:, i] - baseline_samples
        ci = np.percentile(lift_samples, [2.5, 97.5])
        results.append({
            **arm,
            "prob_best": round(prob_best, 4),
            "expected_lift": round(float(np.mean(lift_samples)), 4),
            "ci_95": [round(float(ci[0]), 4), round(float(ci[1]), 4)],
            "is_best": prob_best == max(
                float(np.mean(best_idx == j)) for j in range(len(arms))
            ),
        })
    return results


def compute_experiment_results(variations_data: list[dict]) -> list[dict]:
    """Compute Bayesian + sequential results for all variations vs control.

    variations_data: list of {variation_id, n, total_reward, avg_reward, is_control?}
    Returns enriched list with statistical fields added.
    """
    control = next((v for v in variations_data if v.get("is_control")), None)
    if not control:
        control = min(variations_data, key=lambda v: v.get("avg_reward", 0), default=None)

    results = []
    for var in variations_data:
        row = dict(var)
        conversions = int(round(float(var.get("total_reward", 0))))
        n = int(var.get("n", 0))

        if var is control or control is None:
            row["is_control"] = True
            row["prob_beats_control"] = None
            row["expected_lift"] = None
            row["ci_95"] = None
            row["significant"] = None
        else:
            ctrl_n = int(control.get("n", 0))
            ctrl_conv = int(round(float(control.get("total_reward", 0))))
            bay = bayesian_test(ctrl_n, ctrl_conv, n, conversions)
            seq = sequential_test(ctrl_n, ctrl_conv, n, conversions)
            row["is_control"] = False
            row["prob_beats_control"] = round(bay.prob_treatment_wins, 4)
            row["expected_lift"] = round(bay.expected_lift, 4)
            row["ci_95"] = [round(bay.ci_95_lower, 4), round(bay.ci_95_upper, 4)]
            row["significant"] = seq.significant
            row["log_bayes_factor"] = round(seq.log_bayes_factor, 4)

        results.append(row)

    return results
