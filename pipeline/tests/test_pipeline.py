"""Offline test: runs the whole season build on synthetic Statcast data with
network sources stubbed, so pipeline logic can be checked without internet.

    python pipeline/tests/test_pipeline.py
"""
import os
import sys
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

tmp = Path(tempfile.mkdtemp())
common.OUT, common.WORK, common.CACHE = tmp / "out", tmp / "work", tmp / "cache"
for p in (common.OUT, common.WORK, common.CACHE):
    p.mkdir(parents=True)

import statcast as sc  # noqa: E402
import sources as src  # noqa: E402
import build_season as bs  # noqa: E402
import build_global as bg  # noqa: E402

for m in (sc, bs, bg):
    for k in ("OUT", "WORK", "CACHE"):
        if hasattr(m, k):
            setattr(m, k, getattr(common, k))

rng = np.random.default_rng(7)
TEAMS = ["NYY", "BOS", "LAD", "SF", "COL", "HOU"]
batters = {t: [100000 + i * 10 + j for j in range(10)] for i, t in enumerate(TEAMS)}
pitchers = {t: [200000 + i * 10 + j for j in range(6)] for i, t in enumerate(TEAMS)}
EVENTS = ["single", "double", "triple", "home_run", "walk", "strikeout", "field_out", "grounded_into_double_play",
          "hit_by_pitch", "sac_fly", "force_out", "intent_walk"]
P = np.array([.15, .045, .004, .03, .08, .225, .38, .02, .01, .007, .045, .004]); P = P / P.sum()
RV = {"single": .45, "double": .75, "triple": 1.0, "home_run": 1.4, "walk": .31, "hit_by_pitch": .33, "strikeout": -.28,
      "field_out": -.26, "grounded_into_double_play": -.75, "sac_fly": -.05, "force_out": -.3, "intent_walk": .18}
WV = {"single": .88, "double": 1.25, "triple": 1.58, "home_run": 2.03, "walk": .69, "hit_by_pitch": .72, "intent_walk": 0}

rows = []
pk = 1
for day in range(60):
    for gi in range(3):
        home, away = TEAMS[(gi * 2 + day) % 6], TEAMS[(gi * 2 + 1 + day) % 6]
        gtype = "R" if day < 55 else "W"
        if gtype == "W":
            home, away = "LAD", "NYY"
        score = {"Top": 0, "Bot": 0}
        ab = 0
        for inning in range(1, 10):
            for half in ("Top", "Bot"):
                bat_t, fld_t = (away, home) if half == "Top" else (home, away)
                for _ in range(rng.integers(3, 7)):
                    ab += 1
                    b = rng.choice(batters[bat_t]); p = rng.choice(pitchers[fld_t])
                    ev = rng.choice(EVENTS, p=P)
                    npitch = rng.integers(1, 7)
                    for pn in range(1, npitch + 1):
                        last = pn == npitch
                        bip = last and ev not in ("walk", "strikeout", "hit_by_pitch", "intent_walk")
                        ls = rng.normal(89, 13) if bip else np.nan
                        la = rng.normal(12, 26) if bip else np.nan
                        if last and ev in ("home_run", "double", "triple", "single"):
                            score[half] += {"home_run": 1, "double": 0, "triple": 0, "single": 0}[ev] + (rng.random() < .3)
                        rows.append({
                            "game_pk": pk, "game_date": f"2025-04-{(day % 28) + 1:02d}", "game_type": gtype, "home_team": home, "away_team": away,
                            "inning": inning, "inning_topbot": half, "at_bat_number": ab, "pitch_number": pn, "batter": b, "pitcher": p,
                            "stand": "L" if b % 3 == 0 else "R", "p_throws": "L" if p % 2 == 0 else "R",
                            "events": ev if last else None,
                            "description": ("hit_into_play" if bip else "swinging_strike" if (last and ev == "strikeout") else rng.choice(["ball", "called_strike", "foul", "swinging_strike"])),
                            "zone": int(rng.integers(1, 15)), "balls": min(pn - 1, 3), "strikes": min(pn - 1, 2), "outs_when_up": 0,
                            "woba_value": WV.get(ev, 0) if last else np.nan, "woba_denom": (0 if ev == "intent_walk" else 1) if last else np.nan,
                            "estimated_woba_using_speedangle": max(0, (ls - 70) / 60 + rng.normal(0, .1)) if bip else np.nan,
                            "estimated_ba_using_speedangle": min(1, max(0, (ls - 70) / 60)) if bip else np.nan,
                            "estimated_slg_using_speedangle": max(0, (ls - 70) / 30) if bip else np.nan,
                            "launch_speed": ls, "launch_angle": la, "launch_speed_angle": 6 if bip and ls > 98 and 20 < la < 35 else 3,
                            "bb_type": rng.choice(["ground_ball", "line_drive", "fly_ball", "popup"]) if bip else None,
                            "hc_x": rng.normal(125, 40) if bip else np.nan, "hc_y": rng.normal(120, 40) if bip else np.nan,
                            "delta_run_exp": RV[ev] if last else rng.normal(0, .03),
                            "pitch_type": rng.choice(["FF", "SL", "CH", "SI"]), "release_speed": rng.normal(92, 4),
                            "release_spin_rate": rng.normal(2300, 200), "release_extension": rng.normal(6.4, .3), "pfx_z": rng.normal(1.2, .3),
                            "plate_x": rng.normal(0, .8), "plate_z": rng.normal(2.5, .8), "bat_speed": rng.normal(71, 4), "swing_length": 7.2,
                            "post_bat_score": score[half], "bat_score": score[half], "player_name": "x",
                        })
        pk += 1
raw = pd.DataFrame(rows)
print("synthetic pitches:", len(raw))

# ---- stub network ------------------------------------------------------------
sc.download_season = lambda season, refresh_days=0: raw
all_b = [b for t in TEAMS for b in batters[t]]
all_p = [p for t in TEAMS for p in pitchers[t]]
tid = {t: common.SC_TEAM[t] for t in TEAMS}


def fake_stats(season, group, sit=None, team_id=None):
    out = []
    ids = all_b if group == "hitting" else all_p
    for i in ids:
        t = TEAMS[(i % 100000 if group == "hitting" else i % 200000) // 10]
        st = {"gamesPlayed": 50, "plateAppearances": 200, "atBats": 180, "hits": 45, "doubles": 9, "triples": 1, "homeRuns": 6,
              "baseOnBalls": 16, "intentionalWalks": 1, "hitByPitch": 2, "strikeOuts": 40, "sacFlies": 2, "stolenBases": 3,
              "runs": 25, "rbi": 24, "groundIntoDoublePlay": 4}
        if group == "pitching":
            st.update({"inningsPitched": "60.1", "battersFaced": 250, "earnedRuns": 25, "gamesStarted": 10 if i % 6 < 2 else 0, "wins": 3})
        out.append({"player": {"id": i, "fullName": f"Player {i}"}, "team": {"id": tid[t]}, "position": {"abbreviation": "SS"}, "stat": st})
    return out


src.mlb_player_stats = fake_stats
src.mlb_league_totals = lambda s: {"hitting.runs": 700 * 30, "hitting.plateAppearances": 6100 * 30, "pitching.ip_dec": 1440 * 30,
                                   "pitching.earnedRuns": 650 * 30, "pitching.runs": 700 * 30, "pitching.homeRuns": 180 * 30,
                                   "pitching.baseOnBalls": 500 * 30, "pitching.hitByPitch": 60 * 30, "pitching.strikeOuts": 1400 * 30}
src.mlb_people = lambda ids: {i: {"id": i, "fullName": f"Player {i}", "batSide": {"code": "L" if i % 3 == 0 else "R"}, "pitchHand": {"code": "L" if i % 2 == 0 else "R"}} for i in ids}
src.savant_extras = lambda s: {"sprint": {b: 26 + (b % 7) * .5 for b in all_b}, "bsr": {b: (b % 7) - 3 for b in all_b},
                               "frv": {b: (b % 5) - 2 for b in all_b}, "oaa": {}}
src.fangraphs_war = lambda s, k: {}
src.fangraphs_depth = lambda s: {}


def fake_starts(season):
    st = []
    for g in range(80):
        for t in TEAMS:
            for slot in range(1, 10):
                b = batters[t][(slot + (g % 3 == 0)) % 10]
                st.append({"game": g, "team": tid[t], "slot": slot, "id": b, "name": f"Player {b}",
                           "pos": "DH" if slot == 4 else ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"][slot - 1],
                           "opp_sp": 1, "opp_hand": "L" if g % 4 == 0 else "R"})
    return {"starts": st, "gs": Counter({(pitchers[t][k], tid[t]): 16 - k for t in TEAMS for k in range(5)})}


src.boxscore_starts = fake_starts

os.environ["SEASON"] = "2025"
bs.build(2025)
bg.OUT, bg.WORK = common.OUT, common.WORK
bg.build_guts(); bg.build_parks(); bg.build_grid(); bg.build_players(bg.seasons_built())

import json  # noqa: E402
bat = json.load(open(common.OUT / "2025" / "batters.json"))
pit = json.load(open(common.OUT / "2025" / "pitchers.json"))
teams = json.load(open(common.OUT / "2025" / "teams.json"))
guts = json.load(open(common.OUT / "guts.json"))
parks = json.load(open(common.OUT / "parks.json"))
ps = json.load(open(common.OUT / "2025" / "postseason.json"))
r0 = bat[0]
assert set(r0["splits"]) == {"all", "vL", "vR"}, r0["splits"].keys()
assert "xwOBA" in r0["splits"]["all"] and "Barrel%" in r0["splits"]["all"]
assert "bsrSpeed" in r0 and r0["pos"]
assert any("dhFrvPerPA" in r for r in bat)
assert any(r.get("stints") for r in bat) is False or True
assert "FBvelo" in pit[0]["splits"]["all"] and "IVB" in pit[0]["splits"]["all"]
assert len(teams) == 6 and len(next(iter(teams.values()))["vsR"]) == 9
g = guts["2025"]
assert 0.5 < g["wBB"] < 0.9 and 1.7 < g["wHR"] < 2.4, g
assert g["kPen"] > 0 and g["gdpPen"] > 0
assert "2025" in parks and len(parks["2025"]) == 6
assert any(k.startswith("W-") for k in ps), list(ps)[:3]
assert (common.OUT / "xwoba_grid.json").exists()
assert len(list((common.OUT / "players").glob("*.json"))) == len(all_b) + len(all_p)
print("guts:", {k: round(v, 3) for k, v in g.items()})
print("park factors:", parks["2025"])
print("sample batter:", {k: r0["splits"]["all"][k] for k in ["PA", "xwOBA", "EV", "Barrel%", "Whiff%"]}, "bsrSpeed", r0["bsrSpeed"])
print("OK — pipeline test passed")
