"""Combine per-season pieces into site-wide files:
guts.json, parks.json (5-year rolling, regressed, L/R by batter hand), xwoba_grid.json,
players/<id>.json + players.json (search index), index.json, prospects/<year>.json.

    python pipeline/build_global.py
    PROSPECTS=1 python pipeline/build_global.py   # also refresh FanGraphs prospect lists
"""
from __future__ import annotations

import os
from collections import defaultdict

from common import FIRST_SEASON, LAST_SEASON, OUT, ROOT, WORK, log, read_json, write_json
import sources as src


def seasons_built() -> list[int]:
    return [s for s in range(FIRST_SEASON, LAST_SEASON + 1) if (OUT / str(s) / "batters.json").exists()]


def build_guts():
    g = {}
    for s in range(FIRST_SEASON, LAST_SEASON + 1):
        piece = read_json(WORK / str(s) / "guts.json")
        if piece:
            g[str(s)] = piece
    write_json(OUT / "guts.json", g, compact=False)
    log(f"guts: {len(g)} seasons")


def build_parks():
    raw = {s: read_json(WORK / str(s) / "park_raw.json") for s in range(FIRST_SEASON, LAST_SEASON + 1)}
    out = {}
    for s in range(FIRST_SEASON, LAST_SEASON + 1):
        window = [y for y in range(s - 4, s + 1) if raw.get(y)]
        if not window:
            continue
        acc = defaultdict(lambda: defaultdict(float))
        for y in window:
            for tid, r in raw[y].items():
                a = acc[tid]
                a["hg"] += r["home_g"]; a["hr"] += r["home_r"]; a["rg"] += r["road_g"]; a["rr"] += r["road_r"]
                for h in ("L", "R"):
                    a[f"hw{h}n"] += r[f"home_w_{h}"][0]; a[f"hw{h}d"] += r[f"home_w_{h}"][1]
                    a[f"rw{h}n"] += r[f"road_w_{h}"][0]; a[f"rw{h}d"] += r[f"road_w_{h}"][1]
        n = len(window)
        season_pf = {}
        for tid, a in acc.items():
            if not a["hg"] or not a["rg"] or not a["rr"]:
                continue
            raw_all = (a["hr"] / a["hg"]) / (a["rr"] / a["rg"])
            full = 1 + (raw_all - 1) * n / (n + 1)
            rec = {"all": round((1 + full) / 2, 3)}
            for h in ("L", "R"):
                if a[f"hw{h}d"] and a[f"rw{h}d"] and a[f"rw{h}n"]:
                    ratio = (a[f"hw{h}n"] / a[f"hw{h}d"]) / (a[f"rw{h}n"] / a[f"rw{h}d"])
                    runs_ratio = ratio ** 2  # runs scale roughly with wOBA squared
                    full_h = 1 + (runs_ratio - 1) * n / (n + 2)
                    rec[h] = round((1 + full_h) / 2, 3)
            season_pf[tid] = rec
        out[str(s)] = season_pf
    write_json(OUT / "parks.json", out, compact=False)
    log(f"parks: {len(out)} seasons")


def build_grid():
    for s in range(LAST_SEASON, FIRST_SEASON - 1, -1):
        g = read_json(WORK / str(s) / "xwoba_grid.json")
        if g and g.get("cells"):
            write_json(OUT / "xwoba_grid.json", g)
            log(f"xwOBA grid from {s}")
            return


def build_players(seasons: list[int]):
    by = defaultdict(lambda: {"hitting": [], "pitching": []})
    idx = {}
    for s in seasons:
        for group, fname in (("hitting", "batters"), ("pitching", "pitchers")):
            rows = read_json(OUT / str(s) / f"{fname}.json", [])
            for r in rows:
                pid = r["id"]
                rec = dict(r)
                rec["season"] = s
                by[pid][group].append(rec)
                e = idx.setdefault(pid, {"id": pid, "name": r["name"], "first": s, "last": s, "pos": r.get("pos")})
                e["first"], e["last"] = min(e["first"], s), max(e["last"], s)
                if group == "hitting" or not e.get("pos"):
                    e["pos"] = r.get("pos") or e.get("pos")
    pdir = OUT / "players"
    # Statcast detail staged by this run's season builds (other seasons keep what the file already has)
    staged = {}
    for s in seasons:
        d = read_json(ROOT / "pipeline" / "staging" / str(s) / "detail.json")
        if d:
            staged[s] = d
    log(f"detail staged for seasons: {sorted(staged)}")
    for pid, rec in by.items():
        # pitchers' token hitting lines (PA < 20 in a season) are dropped from their file
        rec["hitting"] = [r for r in rec["hitting"] if r["splits"]["all"].get("PA", 0) >= 20 or not rec["pitching"]]
        for group in ("hitting", "pitching"):
            for r in rec[group]:
                r.pop("ptg", None)   # lives in detail
        old = read_json(pdir / f"{pid}.json", {}) or {}
        detail = old.get("detail", {"hitting": {}, "pitching": {}})
        for s, d in staged.items():
            for group, role in (("hitting", "batter"), ("pitching", "pitcher")):
                v = d.get(role, {}).get(str(pid))
                if v:
                    detail.setdefault(group, {})[str(s)] = v
                else:
                    detail.setdefault(group, {}).pop(str(s), None)
        write_json(pdir / f"{pid}.json", {"id": pid, **rec, "detail": detail})
    write_json(OUT / "players.json", sorted(idx.values(), key=lambda x: x["name"]))
    log(f"players: {len(by)} files")


def build_prospects():
    for y in range(FIRST_SEASON, LAST_SEASON + 1):
        path = OUT / "prospects" / f"{y}.json"
        if path.exists() and y < LAST_SEASON:
            continue
        lst = src.fangraphs_prospects(y)
        if lst:
            write_json(path, lst)


if __name__ == "__main__":
    seasons = seasons_built()
    log(f"seasons built: {seasons}")
    build_guts()
    build_parks()
    build_grid()
    build_players(seasons)
    if os.environ.get("PROSPECTS"):
        build_prospects()
    if not (OUT / "contracts.json").exists():
        write_json(OUT / "contracts.json", {}, compact=False)
    write_json(OUT / "index.json", {"seasons": seasons, "built": __import__("datetime").datetime.utcnow().isoformat() + "Z"}, compact=False)
