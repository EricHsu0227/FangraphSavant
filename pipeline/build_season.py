"""Build one season of Platoon data.

    SEASON=2025 python pipeline/build_season.py          # full rebuild of 2025
    SEASON=2026 REFRESH_DAYS=3 python pipeline/build_season.py   # nightly in-season update

Writes public/data/<season>/{batters,pitchers,teams,postseason}.json and
pipeline/work/<season>/{guts,park_raw,xwoba_grid}.json for build_global.py.
"""
from __future__ import annotations

import os
from collections import defaultdict

import numpy as np

from common import OUT, WORK, ABBR, LAST_SEASON, clean_num, env_season, log, write_json
import sources as src
import statcast as sc
import detail as dt
from common import ROOT

SC_RATE_KEYS = ["WPA", "RE24", "Pull Air%", "Weak%", "Topped%", "Under%", "Flare%", "Solid%", "xwOBAcon", "wOBAcon",
                "heart%", "shadow%", "chase%", "waste%", "heartSw%", "shadowSw%", "chaseSw%", "wasteSw%",
                "heartRV", "shadowRV", "chaseRV", "wasteRV", "Edge%", "Meatball%", "MeatballSw%", "Swing RV", "Take RV", "FPSwing%",
                "xwOBA", "xBA", "xSLG", "xISO", "EV", "maxEV", "EV90", "LA", "Barrel%", "HardHit%", "SweetSpot%",
                "GB%", "LD%", "FB%", "PU%", "Pull%", "Straight%", "Oppo%", "Swing%", "Whiff%", "Zone%", "ZSwing%", "Chase%",
                "Contact%", "ZContact%", "FPS%", "CSW%", "BatSpeed", "Squared%", "Blast%", "RV", "BBE", "pitches",
                "FBvelo", "FBspin", "IVB", "Ext"]


def ip_dec(v) -> float:
    w, _, f = str(v or 0).partition(".")
    return float(w or 0) + float(f or 0) / 3


def mlb_line(st: dict, group: str) -> dict:
    g = lambda k: float(st.get(k) or 0)  # noqa: E731
    h, d, t, hr = g("hits"), g("doubles"), g("triples"), g("homeRuns")
    line = {"G": g("gamesPlayed"), "GS": g("gamesStarted"), "PA": g("plateAppearances") or g("battersFaced"),
            "AB": g("atBats"), "H": h, "1B": h - d - t - hr, "2B": d, "3B": t, "HR": hr, "BB": g("baseOnBalls"),
            "IBB": g("intentionalWalks"), "HBP": g("hitByPitch"), "SO": g("strikeOuts"), "SF": g("sacFlies"),
            "SH": g("sacBunts"), "GIDP": g("groundIntoDoublePlay"), "SB": g("stolenBases"), "CS": g("caughtStealing"),
            "R": g("runs"), "RBI": g("rbi")}
    if group == "pitching":
        line.update({"IP": ip_dec(st.get("inningsPitched")), "TBF": g("battersFaced"), "ER": g("earnedRuns"),
                     "W": g("wins"), "L": g("losses"), "SV": g("saves"), "HLD": g("holds"), "Rallowed": g("runs"),
                     "pitches": g("numberOfPitches")})
        line["PA"] = line["TBF"]
    return line


def collapse(splits: list[dict], group: str) -> dict[int, dict]:
    """MLB API rows -> {id: {name, team, teamId, pos, line}}; combines multi-team rows safely."""
    by = defaultdict(list)
    for s in splits:
        if s.get("player", {}).get("id"):
            by[s["player"]["id"]].append(s)
    out = {}
    for pid, rows in by.items():
        total = [r for r in rows if not r.get("team")]
        use = total[:1] or rows
        line = {}
        for r in use:
            for k, v in mlb_line(r.get("stat", {}), group).items():
                line[k] = line.get(k, 0) + v
        last = rows[-1]
        out[pid] = {"name": last["player"].get("fullName"), "teamId": (last.get("team") or {}).get("id"),
                    "pos": (last.get("position") or {}).get("abbreviation"), "line": line, "nteams": len([r for r in rows if r.get("team")])}
    return out


def df_to_map(df, id_col: str) -> dict:
    return {int(r[id_col]): r for r in df.to_dict("records") if r.get(id_col) == r.get(id_col)}


def build(season: int):
    refresh = int(os.environ.get("REFRESH_DAYS", "0"))
    raw = sc.download_season(season, refresh_days=refresh)
    if raw.empty:
        log("no statcast data — aborting season build")
        return
    df, pa = sc.prepare(raw)
    agg = sc.aggregate(df, pa)

    # ---------------- league constants
    tot = src.mlb_league_totals(season)
    lw = sc.linear_weights(pa)
    R, PA = tot.get("hitting.runs", 0), tot.get("hitting.plateAppearances", 1)
    IP = tot.get("pitching.ip_dec", 1)
    ER = tot.get("pitching.earnedRuns", 0)
    lgERA = 9 * ER / IP
    fip_core = (13 * tot.get("pitching.homeRuns", 0) + 3 * (tot.get("pitching.baseOnBalls", 0) + tot.get("pitching.hitByPitch", 0))
                - 2 * tot.get("pitching.strikeOuts", 0)) / IP
    reg = pa[pa["game_type"] == "R"]
    fb = (reg["fly_ball"] | reg["popup"]).sum()
    guts = {**lw, "rPA": R / PA, "rW": 9 * (R / IP) * 1.5 + 3, "lgERA": lgERA, "cFIP": lgERA - fip_core,
            "raPerEra": (tot.get("pitching.runs", R) / ER) if ER else 1.085, "lgHRFB": float(reg["HR"].sum() / fb) if fb else 0.12}
    # wOBA of the league with these weights (should ~= OBP by construction)
    write_json(WORK / str(season) / "guts.json", clean_num(guts, 5), compact=False)
    log(f"guts {season}: wOBA {guts['woba']:.3f} scale {guts['scale']:.3f} kPen {guts['kPen']:.3f} gdpPen {guts['gdpPen']:.3f}")

    write_json(WORK / str(season) / "park_raw.json", sc.park_raw(df, pa))
    write_json(WORK / str(season) / "xwoba_grid.json", sc.xwoba_grid(pa))
    write_json(OUT / str(season) / "postseason.json", sc.postseason_by_series(df, pa))

    # ---------------- per-player Statcast detail (staged; merged into players/<id>.json by build_global)
    det, summ = dt.player_detail(df, pa)
    write_json(ROOT / "pipeline" / "staging" / str(season) / "detail.json",
               {"batter": {str(k): v for k, v in det["batter"].items()}, "pitcher": {str(k): v for k, v in det["pitcher"].items()}})
    ars = []
    for pid, d in det["pitcher"].items():
        for split in ("all", "vL", "vR"):
            for r in (d.get("arsenal") or {}).get(split, []):
                if r["n"] >= 25:
                    ars.append({"id": pid, "split": split, **r})
    log(f"detail {season}: {len(det['batter'])} hitters, {len(det['pitcher'])} pitchers, {len(ars)} arsenal rows")

    # team and league Statcast lines (all / vL / vR), for team leaderboards and team pages
    team_stats = {}
    for role, col in (("batter", "bat_team_id"), ("pitcher", "fld_team_id")):
        for split, hand in (("all", None), ("vL", "L"), ("vR", "R")):
            oh = "p_throws" if role == "batter" else "stand"
            rp = pa[pa["game_type"] == "R"]
            rx = df[df["game_type"] == "R"]
            if hand:
                rp, rx = rp[rp[oh] == hand], rx[rx[oh] == hand]
            t = sc._agg(rp, rx, [col], role)
            for rec in t.to_dict("records"):
                if rec.get(col) != rec.get(col):
                    continue
                team_stats.setdefault(str(int(rec[col])), {}).setdefault(role, {})[split] = clean_num(
                    {k: v for k, v in rec.items() if k != col})
            lg = sc._agg(rp.assign(_lg=1), rx.assign(_lg=1), ["_lg"], role)
            team_stats.setdefault("league", {}).setdefault(role, {})[split] = clean_num(
                {k: v for k, v in lg.to_dict("records")[0].items() if k != "_lg"})
    write_json(OUT / str(season) / "team_stats.json", team_stats)

    # ---------------- Savant / FanGraphs extras
    ex = src.savant_extras(season)
    war_bat = src.fangraphs_war(season, "bat")
    war_pit = src.fangraphs_war(season, "pit")

    # ---------------- lineups / positions / DH
    starts = src.boxscore_starts(season)
    poscnt = src.position_counts(starts)
    names = {r["id"]: r["name"] for r in starts["starts"]}
    names.update({str(k): v for k, v in starts.get("sp_names", {}).items()})
    write_json(OUT / str(season) / "lineups.json", {"names": {str(k): v for k, v in names.items()},
                                                   "teams": src.batting_orders(starts)})

    for group, role, fname in [("hitting", "batter", "batters"), ("pitching", "pitcher", "pitchers")]:
        mlb = {s: collapse(src.mlb_player_stats(season, group, sit), group) for s, sit in (("all", None), ("vL", "vl"), ("vR", "vr"))}
        scm = {s: df_to_map(agg[role][s], role) for s in ("all", "vL", "vR")}
        stint_sc = {s: {(int(r[role]), int(r[c])): r for r in agg[role][f"stint_{s}"].to_dict("records")
                        for c in [("bat_team_id" if role == "batter" else "fld_team_id")] if r.get(c) == r.get(c)}
                    for s in ("all", "vL", "vR")}
        ids = set(mlb["all"]) | set(scm["all"])
        people = src.mlb_people(list(ids))
        rows = []
        for pid in ids:
            base = mlb["all"].get(pid)
            person = people.get(pid, {})
            row = {"id": pid, "name": (base or {}).get("name") or person.get("fullName", str(pid)),
                   "teamId": (base or {}).get("teamId"), "bats": person.get("batSide", {}).get("code"),
                   "throws": person.get("pitchHand", {}).get("code"), "splits": {}}
            row["team"] = ABBR.get(row["teamId"], "")
            if person.get("birthDate"):
                by, bm, bd = map(int, person["birthDate"].split("-"))
                row["age"] = season - by - (1 if (bm, bd) > (6, 30) else 0)   # baseball age (as of June 30)
            if person.get("mlbDebutDate", "")[:4] == str(season):
                row["rookie"] = 1
            row["pt"] = summ[role].get(pid, {}).get("all")
            grp = det[role].get(pid, {}).get("groups")
            if grp:
                row["ptg"] = grp
            if role == "batter":
                # games by position, for team pages and the position filter
                pcnt = poscnt.get(pid)
                if pcnt:
                    row["gpos"] = dict(pcnt.most_common())
            for s in ("all", "vL", "vR"):
                line = dict((mlb[s].get(pid) or {}).get("line") or {})
                scr = scm[s].get(pid)
                if not line and scr is not None:  # Statcast-only (e.g. MLB API gap): use Statcast counting
                    line = {k: float(scr.get(k, 0)) for k in ["PA", "AB", "H", "1B", "2B", "3B", "HR", "BB", "IBB", "HBP", "SO", "SF", "SH", "GIDP"]}
                    if group == "pitching":
                        line["TBF"] = line["PA"]
                if scr is not None:
                    for k in SC_RATE_KEYS:
                        if k in scr:
                            line[k] = scr[k]
                    line["FBn"] = float(scr.get("FB%", 0) or 0) * float(scr.get("BBE", 0) or 0) + float(scr.get("PU%", 0) or 0) * float(scr.get("BBE", 0) or 0)
                if line:
                    row["splits"][s] = clean_num(line)
            if not row["splits"].get("all"):
                continue
            row = {k: v for k, v in row.items() if v is not None}
            # per-team stints for traded players (Statcast rates; team pages pull exact counting from the MLB API)
            teams_played = sorted({t for (p, t) in stint_sc["all"] if p == pid})
            if len(teams_played) > 1:
                row["stints"] = [{"teamId": t, "splits": {s: clean_num({k: stint_sc[s][(pid, t)][k] for k in SC_RATE_KEYS + ["PA"]
                                                                       if k in stint_sc[s].get((pid, t), {})})
                                                         for s in ("all", "vL", "vR") if (pid, t) in stint_sc[s]}} for t in teams_played]
            if group == "hitting":
                pc = poscnt.get(pid)
                if pc:
                    row["pos"] = pc.most_common(1)[0][0]
                    row["dhPA"] = int(pc.get("DH", 0))  # DH starts (used with dhFrvPerPA = runs per DH start)
                else:
                    row["pos"] = (base or {}).get("pos")
                for k in ("sprint", "bsr", "frv", "oaa"):
                    v = ex[k].get(pid)
                    if v is not None and v == v:
                        row[k] = round(float(v), 2)
                if pid in war_bat:
                    row["WAR_fg"] = round(war_bat[pid], 1)
            else:
                row["pos"] = "P"
                if pid in war_pit:
                    row["WAR_fg"] = round(war_pit[pid], 1)
            rows.append(row)

        if group == "hitting":
            _expected_baserunning_and_dh(rows, poscnt)
        else:
            pitchers = rows
        write_json(OUT / str(season) / f"{fname}.json", rows)
        if group == "pitching":
            nm = {r["id"]: (r["name"], r.get("teamId"), r.get("throws")) for r in rows}
            for a in ars:
                a["name"], a["teamId"], a["throws"] = nm.get(a["id"], ("", None, None))
            write_json(OUT / str(season) / "arsenal.json", ars)
        log(f"{fname} {season}: {len(rows)} rows")

    # ---------------- depth charts / lineups
    pit_rows = [{"id": r["id"], "name": r["name"], "teamId": r["teamId"], "throws": r.get("throws"),
                 "G": r["splits"]["all"].get("G", 0), "GS": r["splits"]["all"].get("GS", 0)} for r in pitchers]
    depth = src.most_common_depth(starts, season, pit_rows)
    if season == LAST_SEASON:
        fg = src.fangraphs_depth(season)
        depth.update(fg)
    write_json(OUT / str(season) / "teams.json", {str(k): v for k, v in depth.items()})


def _expected_baserunning_and_dh(rows: list[dict], poscnt):
    """bsrSpeed: Savant baserunning runs predicted from sprint speed (per-PA regression);
    dhFrvPerPA: fielding runs per start of players who mostly DH, applied to DH starts."""
    xs, ys = [], []
    for r in rows:
        pa_ = r["splits"]["all"].get("PA", 0)
        if pa_ >= 200 and r.get("sprint") is not None and r.get("bsr") is not None:
            xs.append(r["sprint"])
            ys.append(r["bsr"] / pa_)
    if len(xs) >= 30:
        b, a = np.polyfit(xs, ys, 1)
        for r in rows:
            if r.get("sprint") is not None:
                r["bsrSpeed"] = round(float((a + b * r["sprint"]) * r["splits"]["all"].get("PA", 0)), 2)
    frv_sum, starts_sum = 0.0, 0
    for r in rows:
        pc = poscnt.get(r["id"])
        if not pc or r.get("frv") is None:
            continue
        total = sum(pc.values())
        dh = pc.get("DH", 0)
        if total >= 20 and dh / total >= 0.5 and total - dh > 0:
            frv_sum += r["frv"]
            starts_sum += total - dh
    per_start = frv_sum / starts_sum if starts_sum else -0.03
    for r in rows:
        if r.get("dhPA"):
            r["dhFrvPerPA"] = round(per_start, 4)


if __name__ == "__main__":
    s = env_season()
    log(f"=== building {s} ===")
    build(s)
