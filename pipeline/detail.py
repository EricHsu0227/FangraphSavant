"""Per-player Statcast detail for one season (regular season only).

Everything is split by the opponent's hand: 'all', 'vL', 'vR'
(for hitters vL = vs LHP; for pitchers vL = vs LHB).

Per player:
  arsenal   pitchers: one row per pitch type (usage, velo, spin, HB/IVB, ext, arm angle,
            whiff, chase, CSW, zone, wOBA/xwOBA, RV/100, hard-hit, putaway)
  vsPitch   hitters: results by pitch type the same way (from the hitter's side)
  zones     pitches / swings / whiffs / wOBA num-den / xwOBA num by Gameday zone 1-14
  spray     hitters: [x, y, ev, la, result, pitcherHand] per batted ball (x/y in Savant hc coords)
  rolling   [paIndex, date, wOBA, xwOBA] rolling 100 PA (hitters) / 150 BF (pitchers), every 5 PA
  counts    wOBA / xwOBA / K% after 1-0, after 0-1, two strikes, full count, first pitch
  tto       pitchers: by times through the order
  monthly   PA, wOBA, xwOBA per month
  sits      situational splits (home/away, runners, outs, innings, score, late & close,
            batted-ball type, direction, final pitch group), each with all / vL / vR lines
  games     per-game Statcast line: PA, wOBA/xwOBA num-den, max EV, barrels, hard hits, WPA
            (pitchers also pitches, whiffs, CSW, avg fastball velo)
  plays     every PA: [date, opponentId, inning, outs, result, EV, LA, xwOBA, pitches, WPA, oppHand]
Also returns a compact per-pitch-type summary for the season rows (leaderboards).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from statcast import PT_GROUP

SPLITS = (("all", None), ("vL", "L"), ("vR", "R"))
RES = {"single": 1, "double": 2, "triple": 3, "home_run": 4}


def _r(v, nd=3):
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return None
    return round(float(v), nd)


def _pitch_table(px: pd.DataFrame, pa: pd.DataFrame, role: str) -> list[dict]:
    """Rows by pitch type. px = this player's pitches (one split), pa = his PA-ending pitches."""
    if px.empty:
        return []
    total = len(px)
    out = []
    sign = 1 if role == "batter" else -1
    for pt, x in px.groupby("pitch_type"):
        if not isinstance(pt, str) or not pt:
            continue
        p = pa[pa["pitch_type"] == pt]
        n = len(x)
        sw = x["is_swing"].sum()
        oz = (~x["in_zone"]).sum()
        den = p["woba_denom"].sum()
        bbe = p[p["bbe"]]
        two = x[x["strikes"] == 2]
        row = {
            "pt": pt, "n": int(n), "use": _r(n / total), "velo": _r(x["release_speed"].mean(), 1),
            "spin": _r(x["release_spin_rate"].mean(), 0), "hb": _r(x["pfx_x"].mean() * 12, 1),
            "ivb": _r(x["pfx_z"].mean() * 12, 1), "ext": _r(x["release_extension"].mean(), 1),
            "arm": _r(x["arm_angle"].mean(), 1) if "arm_angle" in x else None,
            "zone": _r(x["in_zone"].mean()), "swing": _r(sw / n), "whiff": _r(x["is_whiff"].sum() / sw) if sw else None,
            "chase": _r(x.loc[~x["in_zone"], "is_swing"].sum() / oz) if oz else None,
            "csw": _r((x["called_strike"].sum() + x["is_whiff"].sum()) / n),
            "pa": int(len(p)), "woba": _r(p["woba_value"].sum() / den) if den else None,
            "xwoba": _r(p["xw_num"].sum() / den) if den else None,
            "rv": _r(sign * x["delta_run_exp"].sum(), 1), "rv100": _r(sign * x["delta_run_exp"].sum() / n * 100, 2),
            "hh": _r(bbe["hard"].mean()) if len(bbe) else None, "ev": _r(bbe["launch_speed"].mean(), 1) if len(bbe) else None,
            "la": _r(bbe["launch_angle"].mean(), 1) if len(bbe) else None,
            "k": int(p["SO"].sum()),
            "putaway": _r(p["SO"].sum() / len(two)) if len(two) else None,
            "rx": _r(x["release_pos_x"].mean(), 2) if "release_pos_x" in x else None,
            "rz": _r(x["release_pos_z"].mean(), 2) if "release_pos_z" in x else None,
        }
        out.append({k: v for k, v in row.items() if v is not None})
    out.sort(key=lambda r: -r["n"])
    return out


def _zones(px: pd.DataFrame, pa: pd.DataFrame) -> dict:
    z = {}
    for zone, x in px.groupby("zone"):
        if zone != zone:
            continue
        p = pa[pa["zone"] == zone]
        z[str(int(zone))] = [int(len(x)), int(x["is_swing"].sum()), int(x["is_whiff"].sum()),
                             _r(p["woba_value"].sum(), 2), int(p["woba_denom"].sum()), _r(p["xw_num"].sum(), 2),
                             _r(x["delta_run_exp"].sum(), 2)]
    return z


def _rolling(pa: pd.DataFrame, window: int) -> list:
    p = pa.sort_values(["game_date", "game_pk", "at_bat_number"])
    p = p[p["woba_denom"] > 0]
    if len(p) < window:
        return []
    wn = p["woba_value"].rolling(window).sum().to_numpy()
    xn = p["xw_num"].rolling(window).sum().to_numpy()
    dd = p["woba_denom"].rolling(window).sum().to_numpy()
    dates = p["game_date"].astype(str).str[5:10].to_numpy()
    out = []
    for i in range(window - 1, len(p), 5):
        out.append([i + 1, dates[i], _r(wn[i] / dd[i]), _r(xn[i] / dd[i])])
    if out and out[-1][0] != len(p):
        i = len(p) - 1
        out.append([i + 1, dates[i], _r(wn[i] / dd[i]), _r(xn[i] / dd[i])])
    return out


def _line(p: pd.DataFrame) -> dict:
    den = p["woba_denom"].sum()
    if not len(p):
        return {}
    return {"pa": int(len(p)), "woba": _r(p["woba_value"].sum() / den) if den else None,
            "xwoba": _r(p["xw_num"].sum() / den) if den else None, "k": _r(p["SO"].mean()), "bb": _r(p["BB"].mean())}


def _line2(p: pd.DataFrame) -> dict:
    """Richer split line: slash + wOBA/xwOBA + contact quality."""
    if not len(p):
        return {}
    den = p["woba_denom"].sum()
    ab = p["AB"].sum()
    bbe = p[p["bbe"]]
    h = p["H"].sum()
    tb = p["1B"].sum() + 2 * p["2B"].sum() + 3 * p["3B"].sum() + 4 * p["HR"].sum()
    obp_d = ab + p["BB"].sum() + p["HBP"].sum() + p["SF"].sum()
    return {
        "pa": int(len(p)), "avg": _r(h / ab) if ab else None,
        "obp": _r((h + p["BB"].sum() + p["HBP"].sum()) / obp_d) if obp_d else None,
        "slg": _r(tb / ab) if ab else None, "hr": int(p["HR"].sum()),
        "k": _r(p["SO"].mean()), "bb": _r(p["BB"].mean()),
        "woba": _r(p["woba_value"].sum() / den) if den else None,
        "xwoba": _r(p["xw_num"].sum() / den) if den else None,
        "ev": _r(bbe["launch_speed"].mean(), 1) if len(bbe) else None,
        "brl": _r(bbe["barrel"].mean()) if len(bbe) else None,
        "hh": _r(bbe["hard"].mean()) if len(bbe) else None,
        "wpa": _r(p["wpa_bat"].sum(), 2) if "wpa_bat" in p else None,
    }


def _sit_masks(pa: pd.DataFrame, role: str) -> dict:
    """Situation code -> boolean mask over this player's PAs."""
    bat_home = pa["inning_topbot"].eq("Bot")
    home = bat_home if role == "batter" else ~bat_home
    on1 = pa["on_1b"].notna() if "on_1b" in pa else pd.Series(False, index=pa.index)
    on2 = pa["on_2b"].notna() if "on_2b" in pa else pd.Series(False, index=pa.index)
    on3 = pa["on_3b"].notna() if "on_3b" in pa else pd.Series(False, index=pa.index)
    have_runners = "on_1b" in pa
    m = {"home": home, "away": ~home}
    if have_runners:
        m.update({"empty": ~(on1 | on2 | on3), "on": on1 | on2 | on3, "risp": on2 | on3, "loaded": on1 & on2 & on3})
    outs = pa["outs_when_up"]
    m.update({"o0": outs.eq(0), "o1": outs.eq(1), "o2": outs.eq(2)})
    inn = pa["inning"]
    m.update({"i13": inn.between(1, 3), "i46": inn.between(4, 6), "i79": inn.between(7, 9), "ix": inn.ge(10)})
    if "fld_score" in pa and pa["fld_score"].notna().any():
        diff = pd.to_numeric(pa["bat_score"], errors="coerce") - pd.to_numeric(pa["fld_score"], errors="coerce")
        if role == "pitcher":
            diff = -diff
        m.update({"ahead": diff.gt(0), "tied": diff.eq(0), "behind": diff.lt(0),
                  "lateclose": inn.ge(7) & diff.abs().le(1)})
    m.update({"gb": pa["ground_ball"], "ld": pa["line_drive"], "fb": pa["fly_ball"], "pu": pa["popup"],
              "pull": pa["pull"], "cent": pa["straight"], "oppo": pa["oppo"]})
    if "ptg" in pa:
        m.update({"pFB": pa["ptg"].eq("FB"), "pBR": pa["ptg"].eq("BR"), "pOS": pa["ptg"].eq("OS")})
    return m


def _sits(pa: pd.DataFrame, role: str, opp: str) -> dict:
    out = {}
    masks = _sit_masks(pa, role)
    for code, mask in masks.items():
        mask = mask.fillna(False).astype(bool)
        sub = pa[mask]
        if not len(sub):
            continue
        rec = {"all": _line2(sub)}
        for split, hand in SPLITS[1:]:
            h = sub[sub[opp] == hand]
            if len(h):
                rec[split] = _line2(h)
        out[code] = rec
    return out


def _games(px: pd.DataFrame, pa: pd.DataFrame, role: str) -> dict:
    """Per-game Statcast line keyed by game_pk."""
    sign = 1 if role == "batter" else -1
    out = {}
    pg = dict(tuple(px.groupby("game_pk")))
    for gpk, g in pa.groupby("game_pk"):
        bbe = g[g["bbe"]]
        rec = [int(len(g)), _r(g["woba_value"].sum(), 2), int(g["woba_denom"].sum()), _r(g["xw_num"].sum(), 2),
               _r(bbe["launch_speed"].max(), 1) if len(bbe) else None, int(bbe["barrel"].sum()), int(bbe["hard"].sum()),
               _r(sign * g["wpa_bat"].sum(), 3)]
        if role == "pitcher":
            x = pg.get(gpk)
            if x is not None:
                fb = x[x["ptg"] == "FB"]["release_speed"]
                rec += [int(len(x)), int(x["is_whiff"].sum()), int(x["called_strike"].sum() + x["is_whiff"].sum()),
                        _r(fb.mean(), 1) if len(fb) else None]
        out[str(int(gpk))] = rec
    return out


EVCODE = {"single": "1B", "double": "2B", "triple": "3B", "home_run": "HR", "walk": "BB", "intent_walk": "IBB",
          "hit_by_pitch": "HBP", "strikeout": "K", "strikeout_double_play": "K", "field_out": "Out",
          "grounded_into_double_play": "GIDP", "double_play": "DP", "force_out": "FC", "fielders_choice": "FC",
          "fielders_choice_out": "FC", "sac_fly": "SF", "sac_bunt": "SH", "field_error": "E"}


def _plays(pa: pd.DataFrame, px: pd.DataFrame, role: str, opp_col: str, opp_hand: str) -> list:
    sign = 1 if role == "batter" else -1
    npitch = px.groupby(["game_pk", "at_bat_number"]).size()
    p = pa.sort_values(["game_date", "game_pk", "at_bat_number"])
    out = []
    for r in p.itertuples(index=False):
        bbe = bool(r.bbe)
        out.append([str(r.game_date)[5:10], int(getattr(r, opp_col)), int(r.inning), int(r.outs_when_up),
                    EVCODE.get(r.events, r.events), _r(r.launch_speed, 0) if bbe else None,
                    _r(r.launch_angle, 0) if bbe else None, _r(r.xw_num, 3),
                    int(npitch.get((r.game_pk, r.at_bat_number), 0)), _r(sign * r.wpa_bat, 3),
                    getattr(r, opp_hand), int(r.game_pk)])
    return out


def _counts(pa: pd.DataFrame) -> dict:
    return {
        "first": _line(pa[pa["pa_first"]]),
        "a10": _line(pa[(pa["b2"] == 1) & (pa["s2"] == 0)]),
        "a01": _line(pa[(pa["b2"] == 0) & (pa["s2"] == 1)]),
        "two": _line(pa[pa["pa_two_strike"]]),
        "full": _line(pa[pa["pa_full"]]),
    }


def player_detail(df: pd.DataFrame, pa: pd.DataFrame):
    """-> (detail: {role: {id: {...}}}, summary: {role: {id: {split: {pt: {...}}}}})"""
    df = df[df["game_type"] == "R"]
    pa = pa[pa["game_type"] == "R"]
    detail = {"batter": {}, "pitcher": {}}
    summary = {"batter": {}, "pitcher": {}}
    for role, id_col, opp in (("batter", "batter", "p_throws"), ("pitcher", "pitcher", "stand")):
        pa_by = dict(tuple(pa.groupby(id_col)))
        for pid, px_all in df.groupby(id_col):
            pa_all = pa_by.get(pid, pa.iloc[0:0])
            if len(pa_all) < 25:
                continue
            d, sm = {}, {}
            for split, hand in SPLITS:
                px = px_all if hand is None else px_all[px_all[opp] == hand]
                pp = pa_all if hand is None else pa_all[pa_all[opp] == hand]
                if px.empty:
                    continue
                table = _pitch_table(px, pp, role)
                key = "arsenal" if role == "pitcher" else "vsPitch"
                d.setdefault(key, {})[split] = table
                d.setdefault("zones", {})[split] = _zones(px, pp)
                d.setdefault("counts", {})[split] = _counts(pp)
                if role == "pitcher":
                    d.setdefault("tto", {})[split] = {str(int(k)) if k < 3 else "3": _line(g) for k, g in
                                                      pp.assign(t=pp["n_thruorder_pitcher"].clip(upper=3)).groupby("t") if k == k}
                sm[split] = {r["pt"]: {k: r.get(k) for k in ("use", "velo", "spin", "hb", "ivb", "whiff", "rv100", "xwoba", "n")}
                             for r in table}
                # pitch-group lines (FB / BR / OS) — used by the matchup model
                grp = {}
                for gname in ("FB", "BR", "OS"):
                    gx = px[px["ptg"] == gname]
                    gp = pp[pp["ptg"] == gname]
                    if len(gx):
                        den = gp["woba_denom"].sum()
                        sgn = 1 if role == "batter" else -1
                        grp[gname] = {"n": int(len(gx)), "use": _r(len(gx) / len(px)),
                                      "xwoba": _r(gp["xw_num"].sum() / den) if den else None,
                                      "woba": _r(gp["woba_value"].sum() / den) if den else None,
                                      "pa": int(len(gp)),
                                      "whiff": _r(gx["is_whiff"].sum() / gx["is_swing"].sum()) if gx["is_swing"].sum() else None,
                                      "rv100": _r(sgn * gx["delta_run_exp"].sum() / len(gx) * 100, 2)}
                d.setdefault("groups", {})[split] = grp
            if role == "batter":
                b = pa_all[pa_all["bbe"] & pa_all["hc_x"].notna()]
                d["spray"] = [[int(round(x)), int(round(y)), _r(ev, 0), _r(la, 0), RES.get(e, 0), 0 if h == "L" else 1]
                              for x, y, ev, la, e, h in zip(b["hc_x"], b["hc_y"], b["launch_speed"], b["launch_angle"], b["events"], b["p_throws"])]
                d["rolling"] = _rolling(pa_all, 100)
            else:
                d["rolling"] = _rolling(pa_all, 150)
            months = {}
            for m, g in pa_all.groupby(pa_all["game_date"].astype(str).str[5:7]):
                months[m] = _line(g)
            d["monthly"] = months
            opp_id = "pitcher" if role == "batter" else "batter"
            d["sits"] = _sits(pa_all, role, opp)
            d["games"] = _games(px_all, pa_all, role)
            d["plays"] = _plays(pa_all, px_all, role, opp_id, opp)
            detail[role][int(pid)] = d
            summary[role][int(pid)] = sm
    return detail, summary


def arsenal_leaderboard(summary_pitch: dict) -> list:
    """Flat rows for the pitch-type leaderboard: one per pitcher x pitch type (all batters)."""
    rows = []
    for pid, sm in summary_pitch.items():
        for pt, r in (sm.get("all") or {}).items():
            rows.append({"id": pid, "pt": pt, "grp": PT_GROUP.get(pt), **r})
    return rows
