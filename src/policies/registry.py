from typing import Annotated

from fastapi import Depends

from src.config import ARMS_CATALOG, settings
from src.storage.redis_client import RedisStateClient, get_redis_client

from .base import BanditPolicy
from .baseline import BaselinePolicy
from .contextual_thompson import ContextualThompsonPolicy
from .contextual_ucb import ContextualUCBPolicy
from .thompson import ThompsonSamplingPolicy
from .ucb import UCB1Policy


def build_policy(policy_name: str) -> BanditPolicy:
    match policy_name:
        case "baseline" | "deterministic":
            return BaselinePolicy()
        case "thompson":
            return ThompsonSamplingPolicy(arms=ARMS_CATALOG)
        case "ucb" | "ucb1":
            return UCB1Policy(arms=ARMS_CATALOG, c=settings.ucb_c)
        case "contextual_thompson":
            return ContextualThompsonPolicy(arms=ARMS_CATALOG)
        case "contextual_ucb":
            return ContextualUCBPolicy(arms=ARMS_CATALOG, c=settings.ucb_c)
        case _:
            raise ValueError(f"Unknown policy: {policy_name!r}")


async def get_active_policy(
    redis: Annotated[RedisStateClient, Depends(get_redis_client)],
) -> BanditPolicy:
    policy_name = settings.active_policy
    policy = build_policy(policy_name)
    state = await redis.get_state(policy_name)
    if state:
        policy.load_state(state)
    return policy
