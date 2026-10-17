"""Download a season of pitch-level Statcast data and aggregate it into
batter / pitcher lines with all / vL / vR splits (plus per-team stints),
linear weights ("guts"), park-factor raw totals, and an EV/LA xwOBA grid."""
from __future__ import annotations

import io
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np
import pandas as pd

from common import CACHE, SC_TEAM, get, log, season_dates

COLS = [
    "game_pk", "game_date", "game_type", "home_team", "away_team", "inning", "inning_topbot", "at_bat_number", "pitch_number",
    "batter", "pitcher", "stand", "p_throws", "events", "description", "zone", "balls", "strikes", "outs_when_up",
    "woba_value", "woba_denom", "estimated_woba_using_speedangle", "estimated_ba_using_speedangle", "estimated_slg_using_speedangle",
    "launch_speed", "launch_angle", "launch_speed_angle", "bb_type", "hc_x", "hc_y", "delta_run_exp",
    "pitch_type", "release_speed", "release_spin_rate", "release_extension", "pfx_z", "plate_x", "plate_z",
    "bat_speed", "swing_length", "post_bat_score", "bat_score", "player_name",
]

URL = "https://baseballsavant.mlb.com/statcast_search/csv"


def _fetch_day(d: str) -> pd.DataFrame | None:
    params = {
        "all": "true", "hfGT": "R|F|D|L|W|", "hfSea": f"{d[:4]}|", "player_type": "batter",
        "game_date_gt": d, "game_date_lt": d, "type": "details", "min_pitches": 0, "min_results": 0,
        "group_by": "name", "sort_col": "pitches", "player_event_sort": "api_p_release_speed", "sort_order": "desc",
    }
    txt = get(URL, params=params, as_json=False, timeout=180)
    if not txt or txt.lstrip().startswith("<") or len(txt) < 200:
        return None
    df = pd.read_csv(io.StringIO(txt), low_memory=False)
    keep = [c for c in COLS if c in df.columns]
    return df[keep]


def download_season(season: int, refresh_days: int = 0) -> pd.DataFrame:
    """Day-by-day download with a parquet cache. refresh_days re-pulls the most recent N days."""
    path = CACHE / f"statcast_{season}.parquet"
    have = pd.read_parquet(path) if path.exists() else pd.DataFrame(columns=COLS)
    start, end = season_dates(season)
    end = min(end, date.today().isoformat())
    days = []
    d = date.fromisoformat(start)
    done = set(have["game_date"].astype(str).str[:10].unique()) if len(have) else set()
    cutoff = (date.today() - timedelta(days=refresh_days)).isoformat()
    while d.isoformat() <= end:
        s = d.isoformat()
        if s not in done or s >= cutoff:
            days.append(s)
        d += timedelta(days=1)
    log(f"statcast {season}: {len(done)} cached days, fetching {len(days)}")
    frames = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for s, df in zip(days, ex.map(_safe_fetch, days)):
            if df is not None and len(df):
                frames.append(df)
    if frames:
        new = pd.concat(frames, ignore_index=True)
        new_days = set(new["game_date"].astype(str).str[:10])
        have = have[~have["game_date"].astype(str).str[:10].isin(new_days)] if len(have) else have
        have = pd.concat([have, new], ignore_index=True)
        have.to_parquet(path, index=False)
    log(f"statcast {season}: {len(have):,} pitches")
    return have


def _safe_fetch(d):
    try:
        return _fetch_day(d)
    except Exception as e:  # keep going; a missing day just gets retried next run
        log(f"  day {d} failed: {e}")
        return None


# ---------------------------------------------------------------------------
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "hit_into_play_no_out",
         "hit_into_play_score", "foul_bunt", "missed_bunt", "bunt_foul_tip"}
WHIFF = {"swinging_strike", "swinging_strike_blocked", "missed_bunt"}
NOT_STRIKE = {"ball", "blocked_ball", "hit_by_pitch", "pitchout", "intent_ball", "automatic_ball"}
HIT = {"single", "double", "triple", "home_run"}
NON_AB = {"walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt", "sac_fly_double_play", "sac_bunt_double_play",
          "catcher_interf", "catcher_interference"}
K_EV = {"strikeout", "strikeout_double_play", "strikeout_triple_play"}


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = df.copy()
    for c in ["launch_speed", "launch_angle", "woba_value", "woba_denom", "estimated_woba_using_speedangle",
              "estimated_ba_using_speedangle", "estimated_slg_using_speedangle", "delta_run_exp", "release_speed",
              "release_spin_rate", "release_extension", "pfx_z", "bat_speed", "hc_x", "hc_y", "zone", "launch_speed_angle"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        else:
            df[c] = np.nan
    df["bat_team"] = np.where(df["inning_topbot"] == "Top", df["away_team"], df["home_team"])
    df["fld_team"] = np.where(df["inning_topbot"] == "Top", df["home_team"], df["away_team"])
    df["bat_team_id"] = df["bat_team"].map(SC_TEAM)
    df["fld_team_id"] = df["fld_team"].map(SC_TEAM)
    df["is_swing"] = df["description"].isin(SWING)
    df["is_whiff"] = df["description"].isin(WHIFF)
    df["in_zone"] = df["zone"].between(1, 9)
    df["is_first"] = (df["balls"] == 0) & (df["strikes"] == 0)
    df["is_strike_call"] = ~df["description"].isin(NOT_STRIKE)
    df["called_strike"] = df["description"].eq("called_strike")
    pa = df[df["events"].notna() & (df["events"] != "")].copy()
    ev = pa["events"]
    pa["PA"] = 1
    pa["AB"] = (~ev.isin(NON_AB)).astype(int)
    pa["H"] = ev.isin(HIT).astype(int)
    pa["1B"] = (ev == "single").astype(int)
    pa["2B"] = (ev == "double").astype(int)
    pa["3B"] = (ev == "triple").astype(int)
    pa["HR"] = (ev == "home_run").astype(int)
    pa["BB"] = ev.isin({"walk", "intent_walk"}).astype(int)
    pa["IBB"] = (ev == "intent_walk").astype(int)
    pa["HBP"] = (ev == "hit_by_pitch").astype(int)
    pa["SO"] = ev.isin(K_EV).astype(int)
    pa["SF"] = ev.isin({"sac_fly", "sac_fly_double_play"}).astype(int)
    pa["SH"] = ev.isin({"sac_bunt", "sac_bunt_double_play"}).astype(int)
    pa["GIDP"] = (ev == "grounded_into_double_play").astype(int)
    pa["bbe"] = pa["launch_speed"].notna() & pa["bb_type"].notna()
    xw = pa["estimated_woba_using_speedangle"]
    pa["xw_num"] = np.where(pa["bbe"] & xw.notna(), xw, pa["woba_value"].fillna(0))
    pa["xba_num"] = np.where(pa["bbe"], pa["estimated_ba_using_speedangle"].fillna(0), 0)
    pa["xslg_num"] = np.where(pa["bbe"], pa["estimated_slg_using_speedangle"].fillna(0), 0)
    pa["barrel"] = (pa["launch_speed_angle"] == 6) & pa["bbe"]
    pa["hard"] = (pa["launch_speed"] >= 95) & pa["bbe"]
    pa["sweet"] = pa["launch_angle"].between(8, 32) & pa["bbe"]
    spray = np.degrees(np.arctan2(pa["hc_x"] - 125.42, 198.27 - pa["hc_y"]))
    pull = np.where(pa["stand"] == "R", spray < -15, spray > 15)
    oppo = np.where(pa["stand"] == "R", spray > 15, spray < -15)
    has_spray = pa["bbe"] & spray.notna()
    pa["pull"] = pull & has_spray
    pa["oppo"] = oppo & has_spray
    pa["straight"] = has_spray & ~pa["pull"] & ~pa["oppo"]
    pa["has_spray"] = has_spray
    for t in ["ground_ball", "line_drive", "fly_ball", "popup"]:
        pa[t] = (pa["bb_type"] == t) & pa["bbe"]
    return df, pa


def _agg(pa: pd.DataFrame, px: pd.DataFrame, keys: list[str], role: str) -> pd.DataFrame:
    g = pa.groupby(keys, dropna=False)
    s = g[["PA", "AB", "H", "1B", "2B", "3B", "HR", "BB", "IBB", "HBP", "SO", "SF", "SH", "GIDP"]].sum()
    s["woba_num"] = g["woba_value"].sum()
    s["woba_den"] = g["woba_denom"].sum()
    s["wOBA"] = s["woba_num"] / s["woba_den"].replace(0, np.nan)
    s["xwOBA"] = g["xw_num"].sum() / s["woba_den"].replace(0, np.nan)
    s["xBA"] = g["xba_num"].sum() / s["AB"].replace(0, np.nan)
    s["xSLG"] = g["xslg_num"].sum() / s["AB"].replace(0, np.nan)
    s["xISO"] = s["xSLG"] - s["xBA"]
    bbe = pa[pa["bbe"]].groupby(keys, dropna=False)
    s["BBE"] = bbe.size()
    s["EV"] = bbe["launch_speed"].mean()
    s["maxEV"] = bbe["launch_speed"].max()
    s["EV90"] = bbe["launch_speed"].quantile(0.9)
    s["LA"] = bbe["launch_angle"].mean()
    n = s["BBE"].replace(0, np.nan)
    s["Barrel%"] = bbe["barrel"].sum() / n
    s["HardHit%"] = bbe["hard"].sum() / n
    s["SweetSpot%"] = bbe["sweet"].sum() / n
    s["GB%"] = bbe["ground_ball"].sum() / n
    s["LD%"] = bbe["line_drive"].sum() / n
    s["FB%"] = bbe["fly_ball"].sum() / n
    s["PU%"] = bbe["popup"].sum() / n
    sp = pa[pa["has_spray"]].groupby(keys, dropna=False)
    ns = sp.size().replace(0, np.nan)
    s["Pull%"] = sp["pull"].sum() / ns
    s["Straight%"] = sp["straight"].sum() / ns
    s["Oppo%"] = sp["oppo"].sum() / ns
    rv = pa.groupby(keys, dropna=False)["delta_run_exp"].sum()
    # pitch-level discipline
    pg = px.groupby(keys, dropna=False)
    pitches = pg.size()
    swings = pg["is_swing"].sum()
    whiffs = pg["is_whiff"].sum()
    zone = pg["in_zone"].sum()
    oz = pitches - zone
    zsw = px[px["in_zone"]].groupby(keys, dropna=False)["is_swing"].sum()
    osw = px[~px["in_zone"]].groupby(keys, dropna=False)["is_swing"].sum()
    zwh = px[px["in_zone"]].groupby(keys, dropna=False)["is_whiff"].sum()
    first = px[px["is_first"]].groupby(keys, dropna=False)
    s["pitches"] = pitches
    s["Swing%"] = swings / pitches
    s["Whiff%"] = whiffs / swings.replace(0, np.nan)
    s["Zone%"] = zone / pitches
    s["ZSwing%"] = zsw / zone.replace(0, np.nan)
    s["Chase%"] = osw / oz.replace(0, np.nan)
    s["Contact%"] = 1 - s["Whiff%"]
    s["ZContact%"] = 1 - zwh / zsw.replace(0, np.nan)
    s["FPS%"] = first["is_strike_call"].sum() / first.size().replace(0, np.nan)
    s["CSW%"] = (pg["called_strike"].sum() + whiffs) / pitches
    # bat tracking (2023+ partial, 2024+ full)
    sw = px[px["is_swing"] & px["bat_speed"].notna() & (px["bat_speed"] > 0)]
    if len(sw):
        bs = sw.groupby(keys, dropna=False)
        # Savant drops the slowest 10% of swings as non-competitive
        s["BatSpeed"] = bs["bat_speed"].apply(lambda x: x[x >= x.quantile(0.1)].mean())
        con = sw[sw["launch_speed"].notna()].copy()
        if len(con):
            denom = 1.23 * con["bat_speed"] + 0.2333 * con["release_speed"]
            con["sq"] = (con["launch_speed"] / denom).clip(upper=1.0)
            con["squared"] = con["sq"] >= 0.8
            con["blast"] = (con["sq"] * 100 + con["bat_speed"]) >= 164
            cg = con.groupby(keys, dropna=False)
            nsw = bs.size().replace(0, np.nan)
            s["Squared%"] = cg["squared"].sum() / nsw
            s["Blast%"] = cg["blast"].sum() / nsw
    if role == "batter":
        s["RV"] = rv
    else:
        s["RV"] = -rv
        fb = px[px["pitch_type"].isin(["FF", "SI", "FA"])].groupby(keys, dropna=False)
        s["FBvelo"] = fb["release_speed"].mean()
        s["FBspin"] = fb["release_spin_rate"].mean()
        ff = px[px["pitch_type"] == "FF"].groupby(keys, dropna=False)
        s["IVB"] = ff["pfx_z"].mean() * 12
        s["Ext"] = pg["release_extension"].mean()
    return s.reset_index()


def aggregate(df: pd.DataFrame, pa: pd.DataFrame, game_types=("R",)):
    """-> dict role -> {'all','vL','vR','stint_all','stint_vL','stint_vR'} DataFrames."""
    df = df[df["game_type"].isin(game_types)]
    pa = pa[pa["game_type"].isin(game_types)]
    out = {}
    for role, id_col, opp_hand, team_col in [("batter", "batter", "p_throws", "bat_team_id"), ("pitcher", "pitcher", "stand", "fld_team_id")]:
        r = {}
        for split, filt in [("all", None), ("vL", "L"), ("vR", "R")]:
            pp = pa if filt is None else pa[pa[opp_hand] == filt]
            xx = df if filt is None else df[df[opp_hand] == filt]
            r[split] = _agg(pp, xx, [id_col], role)
            r[f"stint_{split}"] = _agg(pp, xx, [id_col, team_col], role)
        out[role] = r
    return out


def linear_weights(pa: pd.DataFrame, obp: float | None = None) -> dict:
    """wOBA weights from Statcast run values (delta_run_exp), FanGraphs-style.
    raw weight = mean RV(event) - mean RV(out); scale so league wOBA == league OBP."""
    reg = pa[pa["game_type"] == "R"]
    rv = reg.groupby("events")["delta_run_exp"].mean()
    multi = {"grounded_into_double_play", "double_play", "triple_play", "sac_fly_double_play", "field_error"}
    outs = reg[(reg["AB"] == 1) & (reg["H"] == 0) & (~reg["events"].isin(K_EV)) & (~reg["events"].isin(multi))]  # ordinary outs
    out_rv = outs["delta_run_exp"].mean()
    k_rv = reg[reg["events"].isin(K_EV)]["delta_run_exp"].mean()
    gdp_rv = reg[reg["events"] == "grounded_into_double_play"]["delta_run_exp"].mean()
    all_outs_rv = reg[(reg["AB"] == 1) & (reg["H"] == 0)]["delta_run_exp"].mean()
    raw = {
        "wBB": rv.get("walk", np.nan) - all_outs_rv, "wHBP": rv.get("hit_by_pitch", np.nan) - all_outs_rv,
        "w1B": rv.get("single", np.nan) - all_outs_rv, "w2B": rv.get("double", np.nan) - all_outs_rv,
        "w3B": rv.get("triple", np.nan) - all_outs_rv, "wHR": rv.get("home_run", np.nan) - all_outs_rv,
    }
    t = reg[["AB", "H", "1B", "2B", "3B", "HR", "BB", "IBB", "HBP", "SF", "SO", "GIDP"]].sum()
    den = t["AB"] + t["BB"] - t["IBB"] + t["SF"] + t["HBP"]
    raw_num = raw["wBB"] * (t["BB"] - t["IBB"]) + raw["wHBP"] * t["HBP"] + raw["w1B"] * t["1B"] + raw["w2B"] * t["2B"] + raw["w3B"] * t["3B"] + raw["wHR"] * t["HR"]
    lg_obp = obp if obp else (t["H"] + t["BB"] + t["HBP"]) / (t["AB"] + t["BB"] + t["HBP"] + t["SF"])
    scale = lg_obp / (raw_num / den)
    w = {k: float(v * scale) for k, v in raw.items()}
    lg_woba = float(lg_obp)
    return {
        **w, "scale": float(scale), "woba": lg_woba,
        "kPen": float(out_rv - k_rv), "gdpPen": float(out_rv - gdp_rv),
        "lgKrate": float(t["SO"] / den), "lgGDPrate": float(t["GIDP"] / den),
    }


def park_raw(df: pd.DataFrame, pa: pd.DataFrame) -> dict:
    """Per home team: runs and wOBA (by batter hand) at home vs. those same clubs on the road."""
    reg = pa[pa["game_type"] == "R"].copy()
    # runs per game from the last pitch of each half: use max post_bat_score by batting side
    sc = df[df["game_type"] == "R"].copy()
    sc["post_bat_score"] = pd.to_numeric(sc.get("post_bat_score"), errors="coerce")
    fin = sc.groupby(["game_pk", "home_team", "away_team", "inning_topbot"])["post_bat_score"].max().unstack()
    fin = fin.reset_index().rename(columns={"Top": "away_r", "Bot": "home_r"})
    out = {}
    for t in set(fin["home_team"]).union(fin["away_team"]):
        tid = SC_TEAM.get(t)
        if not tid:
            continue
        h = fin[fin["home_team"] == t]
        a = fin[fin["away_team"] == t]
        rec = {"home_g": int(len(h)), "home_r": float((h["home_r"].fillna(0) + h["away_r"].fillna(0)).sum()),
               "road_g": int(len(a)), "road_r": float((a["home_r"].fillna(0) + a["away_r"].fillna(0)).sum())}
        for hand in ("L", "R"):
            hp = reg[(reg["home_team"] == t) & (reg["stand"] == hand)]
            rp = reg[((reg["home_team"] != t) & ((reg["away_team"] == t))) & (reg["stand"] == hand)]
            rec[f"home_w_{hand}"] = [float(hp["woba_value"].sum()), float(hp["woba_denom"].sum())]
            rec[f"road_w_{hand}"] = [float(rp["woba_value"].sum()), float(rp["woba_denom"].sum())]
        out[tid] = rec
    return out


def xwoba_grid(pa: pd.DataFrame) -> dict:
    b = pa[pa["bbe"] & pa["estimated_woba_using_speedangle"].notna()]
    ev_min, ev_step, la_min, la_step = 40, 2, -60, 4
    ev_bins = np.arange(ev_min, 122 + ev_step, ev_step)
    la_bins = np.arange(la_min, 72 + la_step, la_step)
    ei = np.clip(((b["launch_speed"] - ev_min) // ev_step).astype(int), 0, len(ev_bins) - 2)
    li = np.clip(((b["launch_angle"] - la_min) // la_step).astype(int), 0, len(la_bins) - 2)
    t = pd.DataFrame({"e": ei, "l": li, "x": b["estimated_woba_using_speedangle"]}).groupby(["e", "l"])["x"].mean()
    cells = [[None] * (len(la_bins) - 1) for _ in range(len(ev_bins) - 1)]
    for (e, l), v in t.items():
        cells[e][l] = round(float(v), 3)
    # fill holes from neighbours so every cell has a value
    for e in range(len(cells)):
        for l in range(len(cells[e])):
            if cells[e][l] is None:
                vals = [cells[e2][l2] for e2 in range(max(0, e - 2), min(len(cells), e + 3))
                        for l2 in range(max(0, l - 2), min(len(cells[e]), l + 3)) if cells[e2][l2] is not None]
                cells[e][l] = round(float(np.mean(vals)), 3) if vals else 0.0
    return {"evMin": ev_min, "evStep": ev_step, "laMin": la_min, "laStep": la_step, "cells": cells}


def postseason_by_series(df: pd.DataFrame, pa: pd.DataFrame) -> dict:
    """Statcast aggregates per postseason series key '<type>-<id>-<id>'."""
    ps_pa = pa[pa["game_type"].isin(["F", "D", "L", "W"])].copy()
    ps_px = df[df["game_type"].isin(["F", "D", "L", "W"])].copy()
    if not len(ps_pa):
        return {}
    for d in (ps_pa, ps_px):
        h, a = d["home_team"].map(SC_TEAM), d["away_team"].map(SC_TEAM)
        lo, hi = np.minimum(h, a), np.maximum(h, a)
        d["series"] = d["game_type"] + "-" + lo.astype("Int64").astype(str) + "-" + hi.astype("Int64").astype(str)
    keep = ["xwOBA", "xBA", "xSLG", "EV", "maxEV", "LA", "Barrel%", "HardHit%", "Whiff%", "Chase%", "CSW%", "BBE", "pitches"]
    out = {}
    for role, col, name in [("batter", "batter", "batters"), ("pitcher", "pitcher", "pitchers")]:
        agg = _agg(ps_pa, ps_px, ["series", col], role)
        for _, r in agg.iterrows():
            rec = {k: (None if pd.isna(r.get(k)) else round(float(r[k]), 4)) for k in keep if k in r}
            out.setdefault(r["series"], {}).setdefault(name, {})[str(int(r[col]))] = {k: v for k, v in rec.items() if v is not None}
    return out
