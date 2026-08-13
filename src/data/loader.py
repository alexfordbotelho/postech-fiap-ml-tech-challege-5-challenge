"""Load and clean the bank-additional-full.csv dataset into a processed Parquet file."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).parent.parent.parent
KAGGLE_PATH = ROOT / "datasets" / "kaggle" / "bank_marketing" / "bank-additional-full.csv"
PROCESSED_PATH = ROOT / "datasets" / "processed" / "bank_clean.parquet"

FEATURE_COLS = [
    "age", "job", "marital", "education", "default", "housing", "loan",
    "contact", "month", "day_of_week", "duration", "campaign", "pdays",
    "previous", "poutcome", "emp.var.rate", "cons.price.idx",
    "cons.conf.idx", "euribor3m", "nr.employed",
]
TARGET_COL = "y"


def load_raw(path: Path = KAGGLE_PATH) -> pd.DataFrame:
    return pd.read_csv(path, sep=";")


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df[TARGET_COL] = (df[TARGET_COL] == "yes").astype(int)
    df["balance"] = df.get("balance", 0)  # not in full version; keep for compat
    df["duration"] = df["duration"].clip(upper=3600)
    df = df.rename(columns={"emp.var.rate": "emp_var_rate", "cons.price.idx": "cons_price_idx",
                             "cons.conf.idx": "cons_conf_idx", "nr.employed": "nr_employed"})
    cat_cols = df.select_dtypes("object").columns
    for col in cat_cols:
        df[col] = df[col].str.lower().str.strip()
    df = df.dropna(subset=["age", "job", "education"])
    return df.reset_index(drop=True)


def save_processed(df: pd.DataFrame) -> None:
    PROCESSED_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PROCESSED_PATH, index=False)
    print(f"Saved {len(df):,} rows to {PROCESSED_PATH}")


def load_processed(path: Path = PROCESSED_PATH) -> pd.DataFrame:
    return pd.read_parquet(path)


if __name__ == "__main__":
    raw = load_raw()
    cleaned = clean(raw)
    save_processed(cleaned)
    print(cleaned.dtypes)
    print(cleaned[TARGET_COL].value_counts(normalize=True))
