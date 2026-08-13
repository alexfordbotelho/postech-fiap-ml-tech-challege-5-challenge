"""Seed feature flags for /product page. Idempotent — safe to run multiple times."""
import time
import requests
import sys

BASE = "http://localhost:8001"
TIMEOUT = 30   # per-request timeout — generous when stream is running

NEW_FLAGS = [
    {
        "flag_key": "show_rate_simulator",
        "flag_type": "boolean",
        "default_value": True,
        "enabled": True,
        "description": "Exibe simulador de rentabilidade na página de produto",
        "tags": ["page:product"],
        "rules": [],
    },
    {
        "flag_key": "simplified_checkout",
        "flag_type": "boolean",
        "default_value": False,
        "enabled": True,
        "description": "Pula etapa de suitability no checkout do produto (2 steps vs 3)",
        "tags": ["page:product"],
        "rules": [],
    },
]

ADD_PAGE_ALL_TO = ["adaptive_policy_enabled", "bandit_arms_enabled", "exploration_boost"]


def _get(url: str) -> requests.Response:
    return requests.get(url, timeout=TIMEOUT)

def _post(url: str, json: object = None) -> requests.Response:
    return requests.post(url, json=json, timeout=TIMEOUT)  # type: ignore[arg-type]

def _put(url: str, json: object = None) -> requests.Response:
    return requests.put(url, json=json, timeout=TIMEOUT)  # type: ignore[arg-type]


def wait_for_api(retries: int = 5, delay: float = 3.0) -> None:
    for attempt in range(1, retries + 1):
        try:
            requests.get(f"{BASE}/flags/", timeout=TIMEOUT)
            return
        except Exception as e:
            if attempt == retries:
                print(f"ERROR: API not reachable at {BASE} — {e}")
                sys.exit(1)
            print(f"  API não respondeu (tentativa {attempt}/{retries}), aguardando {delay}s...")
            time.sleep(delay)


def upsert_flag(flag: dict) -> None:
    r = _post(f"{BASE}/flags/", json=flag)  # type: ignore[arg-type]
    print(f"  POST /flags/{flag['flag_key']} → {r.status_code}")
    if r.status_code not in (200, 201):
        print(f"    WARN: {r.text[:200]}")


def add_tag(flag_key: str, new_tag: str) -> None:
    r = _get(f"{BASE}/flags/{flag_key}")
    if r.status_code == 404:
        print(f"  WARN: {flag_key} not found — skipping")
        return
    current = r.json()
    tags: list = list(current.get("tags") or [])
    if new_tag in tags:
        print(f"  {flag_key} already has tag '{new_tag}' — skip")
        return
    tags.append(new_tag)
    payload = {
        "flag_key": current["flag_key"],
        "flag_type": current["flag_type"],
        "default_value": current["default_value"],
        "rules": current.get("rules", []),
        "enabled": current["enabled"],
        "description": current.get("description", ""),
        "tags": tags,
    }
    r2 = _put(f"{BASE}/flags/{flag_key}", json=payload)  # type: ignore[arg-type]
    print(f"  PUT /flags/{flag_key} tags={tags} → {r2.status_code}")
    if r2.status_code not in (200, 201):
        print(f"    WARN: {r2.text[:200]}")


if __name__ == "__main__":
    wait_for_api()

    print("→ Creating/upserting new product flags...")
    for f in NEW_FLAGS:
        upsert_flag(f)

    print("→ Adding 'page:all' tag to existing flags...")
    for key in ADD_PAGE_ALL_TO:
        add_tag(key, "page:all")

    print("✓ Seed complete")
