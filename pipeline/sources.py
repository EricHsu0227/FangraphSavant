"""External sources: MLB Stats API, Baseball Savant leaderboards, FanGraphs."""
from __future__ import annotations

import io
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from common import ABBR, TEAM_IDS, get, log

MLB = "https://statsapi.mlb.com/api/v1"


# ------------------------------------------------------------------ MLB Stats API
def mlb_player_stats(season: int, group: str, sit: str | None = None, team_id: int | None = None) -> list[dict]:
    p = {"stats": "statSplits" if sit else "season", "group": group, "season": season, "sportId": 1,
         "playerPool": "All", "limit": 5000, "gameType": "R"}
    if sit:
        p["sitCodes"] = sit
    if team_id:
        p["teamId"] = team_id
    j = get(f"{MLB}/stats", params=p)
    return j.get("stats", [{}])[0].get("splits", []) if j.get("stats") else []


def mlb_league_totals(season: int) -> dict:
    tot = defaultdict(float)
    for group in ("hitting", "pitching"):
        j = get(f"{MLB}/teams/stats", params={"season": season, "group": group, "stats": "season", "sportIds": 1, "gameType": "R"})
        for sp in j.get("stats", [{}])[0].get("splits", []):
            st = sp.get("stat", {})
            for k, v in st.items():
                try:
                    tot[f"{group}.{k}"] += float(v)
                except (TypeError, ValueError):
                    if k == "inningsPitched":
                        w, _, f = str(v).partition(".")
                        tot[f"{group}.ip_dec"] += float(w or 0) + float(f or 0) / 3
    return dict(tot)


def mlb_people(ids: list[int]) -> dict[int, dict]:
    out = {}
    ids = sorted(set(int(i) for i in ids if i))
    for i in range(0, len(ids), 150):
        chunk = ids[i:i + 150]
        j = get(f"{MLB}/people", params={"personIds": ",".join(map(str, chunk))})
        for p in j.get("people", []):
            out[p["id"]] = p
    return out


def mlb_schedule(season: int, game_types: str = "R") -> list[dict]:
    j = get(f"{MLB}/schedule", params={"sportId": 1, "season": season, "gameType": game_types})
    return [g for d in j.get("dates", []) for g in d.get("games", [])]


def boxscore_starts(season: int) -> dict:
    """Every regular-season start: batting order slot, position, and opposing starter.
    Returns {'starts': [...], 'starters': {pitcher_id: team_id}} for lineup + DH logic."""
    games = [g for g in mlb_schedule(season) if g.get("status", {}).get("abstractGameState") == "Final"]
    log(f"boxscores {season}: {len(games)} games")

    def one(g):
        try:
            return g["gamePk"], get(f"{MLB}/game/{g['gamePk']}/boxscore")
        except Exception as e:
            log(f"  boxscore {g['gamePk']} failed: {e}")
            return g["gamePk"], None

    meta = {g["gamePk"]: (g.get("officialDate") or g.get("gameDate", "")[:10],
                          g["teams"]["away"]["team"]["id"], g["teams"]["home"]["team"]["id"],
                          g["teams"]["away"].get("score"), g["teams"]["home"].get("score")) for g in games}
    rows, sp_ids, gs = [], set(), Counter()
    with ThreadPoolExecutor(max_workers=12) as ex:
        for pk, box in ex.map(one, games):
            if not box:
                continue
            teams = box.get("teams", {})
            starters = {}
            for side in ("away", "home"):
                t = teams.get(side, {})
                pids = t.get("pitchers") or []
                if pids:
                    starters[side] = pids[0]
                    sp_ids.add(pids[0])
                    gs[(pids[0], t.get("team", {}).get("id"))] += 1
            for side, opp in (("away", "home"), ("home", "away")):
                t = teams.get(side, {})
                tid = t.get("team", {}).get("id")
                for p in t.get("players", {}).values():
                    bo = p.get("battingOrder")
                    if not bo or int(bo) % 100 != 0:
                        continue
                    pos = (p.get("allPositions") or [p.get("position", {})])[0].get("abbreviation")
                    date, aw, hm, asc, hsc = meta.get(pk, ("", None, None, None, None))
                    rows.append({"game": pk, "team": tid, "slot": int(bo) // 100, "id": p["person"]["id"],
                                 "name": p["person"]["fullName"], "pos": pos, "opp_sp": starters.get(opp),
                                 "date": date, "home": side == "home", "opp": hm if side == "away" else aw,
                                 "rs": hsc if side == "home" else asc, "ra": asc if side == "home" else hsc,
                                 "sp": starters.get(side)})
    people = mlb_people(list(sp_ids))
    hand = {pid: people.get(pid, {}).get("pitchHand", {}).get("code") for pid in sp_ids}
    sp_names = {pid: people.get(pid, {}).get("fullName", "") for pid in sp_ids}
    for r in rows:
        r["opp_hand"] = hand.get(r["opp_sp"])
    return {"starts": rows, "gs": gs, "sp_names": sp_names, "sp_hand": hand}


def batting_orders(starts: dict) -> dict:
    """Baseball-Reference style 'Batting Orders' / 'Defensive Lineups' per team-season.
    {team: [[date, gamePk, opp, home, rs, ra, oppSP, oppSPhand, [[id,pos],...9]], ...]}"""
    by = defaultdict(dict)
    for r in starts["starts"]:
        g = by[r["team"]].setdefault(r["game"], {"meta": r, "slots": {}})
        g["slots"][r["slot"]] = [r["id"], r["pos"]]
    out = {}
    for tid, games in by.items():
        lst = []
        for pk, g in games.items():
            m = g["meta"]
            lst.append([m["date"], pk, m["opp"], 1 if m["home"] else 0, m["rs"], m["ra"], m["opp_sp"],
                        m["opp_hand"], [g["slots"].get(i) for i in range(1, 10)]])
        lst.sort(key=lambda x: (x[0], x[1]))
        out[str(tid)] = lst
    return out


def most_common_depth(starts: dict, season: int, pitch_rows: list[dict]) -> dict:
    """Most common lineup per team vs RHP and vs LHP (greedy by slot frequency), rotation, bullpen."""
    df = pd.DataFrame(starts["starts"])
    out = {}
    if df.empty:
        return out
    people = mlb_people(df["id"].unique().tolist())
    for tid in TEAM_IDS:
        t = df[df["team"] == tid]
        if t.empty:
            continue
        rec = {"source": "most-common"}
        for hand, key in (("R", "vsR"), ("L", "vsL")):
            th = t[t["opp_hand"] == hand]
            n_games = th["game"].nunique() or 1
            cnt = th.groupby(["slot", "id"]).size().reset_index(name="n").sort_values("n", ascending=False)
            used, lineup = set(), {}
            for _, r in cnt.iterrows():
                if r["slot"] in lineup or r["id"] in used or r["slot"] > 9:
                    continue
                lineup[r["slot"]] = r
                used.add(r["id"])
            lst = []
            for slot in range(1, 10):
                r = lineup.get(slot)
                if r is None:
                    continue
                pos = th[th["id"] == r["id"]]["pos"].mode()
                pid = int(r["id"])
                lst.append({"id": pid, "name": people.get(pid, {}).get("fullName", ""), "pos": pos.iloc[0] if len(pos) else "",
                            "bats": people.get(pid, {}).get("batSide", {}).get("code"), "share": round(r["n"] / n_games, 3)})
            rec[key] = lst
        starters_all = set(x["id"] for x in rec.get("vsR", []) + rec.get("vsL", []))
        bench = t[~t["id"].isin(starters_all)].groupby("id").size().sort_values(ascending=False).head(5)
        rec["bench"] = [{"id": int(i), "name": people.get(int(i), {}).get("fullName", ""),
                         "pos": t[t["id"] == i]["pos"].mode().iloc[0], "bats": people.get(int(i), {}).get("batSide", {}).get("code")} for i in bench.index]
        gs = sorted([(n, pid) for (pid, team), n in starts["gs"].items() if team == tid], reverse=True)[:5]
        prow = {(r["id"], r.get("teamId")): r for r in pitch_rows}
        rec["rotation"] = [{"id": pid, "name": (prow.get((pid, tid)) or {}).get("name", ""), "throws": (prow.get((pid, tid)) or {}).get("throws"), "pos": f"{n} GS"} for n, pid in gs]
        relievers = sorted([r for r in pitch_rows if r.get("teamId") == tid and r["G"] - r.get("GS", 0) > 0],
                           key=lambda r: -(r["G"] - r.get("GS", 0)))[:8]
        rec["bullpen"] = [{"id": r["id"], "name": r["name"], "throws": r.get("throws"), "pos": f"{int(r['G'] - r.get('GS', 0))} G"} for r in relievers]
        out[tid] = rec
    return out


def position_counts(starts: dict) -> dict[int, Counter]:
    pc: dict[int, Counter] = defaultdict(Counter)
    for r in starts["starts"]:
        pc[r["id"]][r["pos"]] += 1
    return pc


# ------------------------------------------------------------------ Baseball Savant leaderboards
def savant_csv(url: str, id_cols: list[str], val_cols: list[str]) -> dict[int, float]:
    try:
        txt = get(url, as_json=False)
        df = pd.read_csv(io.StringIO(txt.lstrip("﻿")))
    except Exception as e:
        log(f"  savant leaderboard failed ({url[:80]}…): {e}")
        return {}
    df.columns = [c.strip().strip('"') for c in df.columns]
    idc = next((c for c in id_cols if c in df.columns), None)
    vc = next((c for c in val_cols if c in df.columns), None)
    if not idc or not vc:
        log(f"  savant leaderboard columns not recognized: {list(df.columns)[:12]}")
        return {}
    df = df[[idc, vc]].dropna()
    return df.groupby(idc)[vc].sum().to_dict() if vc != "sprint_speed" else df.groupby(idc)[vc].max().to_dict()


def savant_extras(season: int) -> dict:
    base = "https://baseballsavant.mlb.com/leaderboard"
    return {
        "sprint": savant_csv(f"{base}/sprint_speed?year={season}&position=&team=&min=0&csv=true",
                             ["player_id", "runner_id"], ["sprint_speed"]),
        "bsr": savant_csv(f"{base}/baserunning-run-value?game_type=Regular&season_start={season}&season_end={season}"
                          f"&sortColumn=runner_runs_tot&sortDirection=desc&split=no&n=0&team=&type=Run&with_team_only=1&csv=true",
                          ["player_id", "runner_id", "entity_id"], ["runner_runs_tot", "runs_total", "run_value"]),
        "frv": savant_csv(f"{base}/fielding-run-value?gameType=Regular&seasonStart={season}&seasonEnd={season}"
                          f"&type=fielder&position=&minInnings=0&minResults=1&csv=true",
                          ["player_id", "entity_id", "id"], ["total_runs", "run_value", "frv", "fielding_runs"]),
        "oaa": savant_csv(f"{base}/outs_above_average?type=Fielder&startYear={season}&endYear={season}"
                          f"&split=no&team=&range=year&min=0&pos=&roles=&viz=hide&csv=true",
                          ["player_id", "entity_id"], ["outs_above_average", "oaa"]),
    }


# ------------------------------------------------------------------ FanGraphs
FG_TEAM = {1: 108, 2: 110, 3: 111, 4: 145, 5: 114, 6: 116, 7: 118, 8: 142, 9: 147, 10: 133, 11: 136, 12: 139, 13: 140,
           14: 141, 15: 109, 16: 144, 17: 112, 18: 113, 19: 115, 20: 146, 21: 117, 22: 119, 23: 158, 24: 120, 25: 121,
           26: 143, 27: 134, 28: 138, 29: 135, 30: 137}


def fangraphs_war(season: int, stats: str) -> dict[int, float]:
    """FanGraphs leaderboard JSON -> {mlbam_id: WAR}. stats = 'bat' | 'pit'."""
    url = "https://www.fangraphs.com/api/leaders/major-league/data"
    p = {"age": "", "pos": "all", "stats": stats, "lg": "all", "qual": 0, "season": season, "season1": season,
         "ind": 0, "team": 0, "pageitems": 2000000, "pagenum": 1, "type": 8, "month": 0}
    try:
        j = get(url, params=p)
    except Exception as e:
        log(f"  FanGraphs WAR {stats} {season} failed: {e}")
        return {}
    out = {}
    for r in j.get("data", []):
        mid = r.get("xMLBAMID") or r.get("mlbamid")
        if mid and r.get("WAR") is not None:
            out[int(mid)] = out.get(int(mid), 0) + float(r["WAR"])
    log(f"  FanGraphs WAR {stats} {season}: {len(out)} players")
    return out


def fangraphs_depth(season: int) -> dict:
    """Best effort: FanGraphs Roster Resource depth charts (only meaningful for the current season).
    Returns {team_id: {vsR, vsL, rotation, bullpen, source:'fangraphs'}} or {} if the endpoint is unavailable."""
    out = {}
    for fg_id, tid in FG_TEAM.items():
        try:
            j = get("https://www.fangraphs.com/api/depth-charts/roster", params={"teamid": fg_id}, tries=1)
        except Exception as e:
            log(f"  FanGraphs depth charts unavailable ({e}); using most-common lineups")
            return {}
        rows = j if isinstance(j, list) else j.get("data", [])

        def pick(pred):
            return [{"id": int(r["mlbamid"]), "name": r.get("player") or r.get("Name"), "pos": r.get("position") or r.get("pos", ""),
                     "bats": r.get("bats"), "throws": r.get("throws")} for r in rows if r.get("mlbamid") and pred(r)]
        rec = {
            "source": "fangraphs",
            "vsR": sorted(pick(lambda r: r.get("vRHP") not in (None, "", 0)), key=lambda x: 0),
            "vsL": sorted(pick(lambda r: r.get("vLHP") not in (None, "", 0)), key=lambda x: 0),
            "rotation": pick(lambda r: str(r.get("role", "")).startswith("SP")),
            "bullpen": pick(lambda r: str(r.get("role", "")).startswith(("CL", "SU", "MID", "RP"))),
        }
        if rec["vsR"] or rec["rotation"]:
            out[tid] = rec
    return out


def fangraphs_prospects(year: int) -> list[dict]:
    """Best effort pull of FanGraphs' The Board for a given list year."""
    url = "https://www.fangraphs.com/api/prospects/board/prospects-list-combined"
    try:
        j = get(url, params={"statType": "player", "draft": f"{year}prospect", "valueHeader": "prospect-new"}, tries=2)
    except Exception as e:
        log(f"  FanGraphs prospects {year} failed: {e}")
        return []
    rows = j if isinstance(j, list) else j.get("data", [])
    out = []
    abbr_to_id = {v: k for k, v in ABBR.items()}
    for r in rows:
        tools = {}
        for k, lab in [("Hit", "Hit"), ("Game", "Game Pwr"), ("Raw", "Raw Pwr"), ("Spd", "Spd"), ("Fld", "Fld"), ("Arm", "Arm"),
                       ("FB", "FB"), ("SL", "SL"), ("CB", "CB"), ("CH", "CH"), ("CT", "CT"), ("SPL", "SPL"), ("CMD", "CMD")]:
            pres, fut = r.get(f"p{k}") or r.get(f"{k}"), r.get(f"f{k}")
            if pres or fut:
                tools[lab] = f"{pres or '?'}/{fut or '?'}"
        org = r.get("Team") or r.get("Org")
        out.append({
            "id": int(r["mlbamid"]) if r.get("mlbamid") else None, "name": r.get("playerName") or r.get("PlayerName"),
            "org": org, "orgId": abbr_to_id.get(org), "pos": r.get("Position"), "age": r.get("Age"),
            "rank": r.get("Ovr_Rank"), "orgRank": r.get("Org_Rank"), "fv": r.get("cFV") or r.get("FV_Current"),
            "eta": r.get("ETA_Current") or r.get("ETA"), "level": r.get("mlevel") or r.get("llevel"),
            "tools": tools, "blurb": r.get("Summary") or r.get("Report"),
        })
    log(f"  FanGraphs prospects {year}: {len(out)}")
    return [o for o in out if o["name"]]
