"""Shared paths, HTTP helpers and team maps for the Platoon data pipeline."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"          # what the website reads
WORK = ROOT / "pipeline" / "work"        # intermediate per-season pieces (committed, small)
CACHE = ROOT / "pipeline" / "cache"      # raw Statcast parquet (GitHub Actions cache, not committed)
for p in (OUT, WORK, CACHE):
    p.mkdir(parents=True, exist_ok=True)

FIRST_SEASON, LAST_SEASON = 2015, 2026

UA = {"User-Agent": "Mozilla/5.0 (platoon-stats pipeline; personal non-commercial project)"}
SESSION = requests.Session()
SESSION.headers.update(UA)


def get(url: str, params=None, tries: int = 4, timeout: int = 120, as_json: bool = True):
    last = None
    for i in range(tries):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            if r.status_code == 200:
                return r.json() if as_json else r.text
            last = f"HTTP {r.status_code}"
            if r.status_code in (403, 404):
                break
        except requests.RequestException as e:  # network hiccup
            last = str(e)
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"GET failed {url}: {last}")


def write_json(path: Path, obj, compact: bool = True):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"), allow_nan=False, default=_clean)
        else:
            json.dump(obj, f, indent=1, allow_nan=False, default=_clean)


def _clean(o):
    try:
        import numpy as np
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return None if np.isnan(o) else float(o)
    except ImportError:
        pass
    return str(o)


def read_json(path: Path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def clean_num(d: dict, nd: int = 4) -> dict:
    """Round floats, drop NaN/None so the JSON stays small and valid."""
    out = {}
    for k, v in d.items():
        if v is None:
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            out[k] = v
            continue
        if fv != fv or fv in (float("inf"), float("-inf")):
            continue
        out[k] = int(fv) if float(fv).is_integer() and abs(fv) < 1e12 and not isinstance(v, float) else round(fv, nd)
    return out


# Statcast team abbreviations -> MLB team ids
SC_TEAM = {
    "LAA": 108, "AZ": 109, "ARI": 109, "BAL": 110, "BOS": 111, "CHC": 112, "CIN": 113, "CLE": 114, "COL": 115,
    "DET": 116, "HOU": 117, "KC": 118, "LAD": 119, "WSH": 120, "WAS": 120, "NYM": 121, "OAK": 133, "ATH": 133,
    "PIT": 134, "SD": 135, "SEA": 136, "SF": 137, "STL": 138, "TB": 139, "TEX": 140, "TOR": 141, "MIN": 142,
    "PHI": 143, "ATL": 144, "CWS": 145, "CHW": 145, "MIA": 146, "FLA": 146, "NYY": 147, "MIL": 158,
}
TEAM_IDS = sorted(set(SC_TEAM.values()))
ABBR = {108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC", 113: "CIN", 114: "CLE", 115: "COL", 116: "DET",
        117: "HOU", 118: "KC", 119: "LAD", 120: "WSH", 121: "NYM", 133: "ATH", 134: "PIT", 135: "SD", 136: "SEA",
        137: "SF", 138: "STL", 139: "TB", 140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI", 144: "ATL", 145: "CWS",
        146: "MIA", 147: "NYY", 158: "MIL"}


def season_dates(season: int):
    """Generous date window covering spring openers abroad through the World Series."""
    return f"{season}-03-01", f"{season}-11-15"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def env_season() -> int:
    return int(os.environ.get("SEASON", LAST_SEASON))
