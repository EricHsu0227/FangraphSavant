// League constants by season ("guts"). These are fallback values close to the
// published FanGraphs guts table. The data pipeline recomputes them from
// Statcast/league totals and writes public/data/guts.json, which overrides this.
//
// kPen / gdpPen = runs a strikeout / GIDP costs *beyond* an ordinary out
// (used by the Value/Expected stats). The pipeline measures them from
// Statcast delta_run_exp each season.
export const SEASONS = Array.from({ length: 12 }, (_, i) => 2015 + i); // 2015–2026

const row = (woba, scale, wBB, wHBP, w1B, w2B, w3B, wHR, rPA, rW, cFIP, lgERA) => ({
  woba, scale, wBB, wHBP, w1B, w2B, w3B, wHR, rPA, rW, cFIP, lgERA,
  runSB: 0.2, runCS: -0.41, kPen: 0.015, gdpPen: 0.37, raPerEra: 1.085,
});

export const FALLBACK_GUTS = {
  2015: row(0.313, 1.251, 0.687, 0.718, 0.881, 1.256, 1.594, 2.065, 0.113, 9.421, 3.134, 3.96),
  2016: row(0.318, 1.212, 0.691, 0.721, 0.878, 1.242, 1.569, 2.015, 0.118, 9.778, 3.147, 4.18),
  2017: row(0.321, 1.185, 0.693, 0.723, 0.877, 1.232, 1.552, 1.980, 0.122, 10.048, 3.158, 4.36),
  2018: row(0.315, 1.226, 0.690, 0.720, 0.880, 1.247, 1.578, 2.031, 0.117, 9.714, 3.161, 4.15),
  2019: row(0.320, 1.157, 0.690, 0.719, 0.870, 1.217, 1.529, 1.940, 0.126, 10.296, 3.214, 4.51),
  2020: row(0.320, 1.185, 0.699, 0.728, 0.883, 1.238, 1.558, 1.979, 0.124, 10.212, 3.191, 4.44),
  2021: row(0.314, 1.209, 0.692, 0.722, 0.879, 1.242, 1.568, 2.007, 0.121, 9.973, 3.170, 4.26),
  2022: row(0.310, 1.259, 0.689, 0.720, 0.884, 1.261, 1.601, 2.072, 0.115, 9.536, 3.112, 3.97),
  2023: row(0.318, 1.204, 0.696, 0.726, 0.883, 1.244, 1.569, 2.004, 0.122, 9.820, 3.255, 4.33),
  2024: row(0.310, 1.242, 0.689, 0.720, 0.882, 1.254, 1.590, 2.050, 0.117, 9.606, 3.166, 4.08),
  2025: row(0.313, 1.232, 0.691, 0.722, 0.882, 1.252, 1.584, 2.037, 0.119, 9.700, 3.130, 4.15),
  2026: row(0.313, 1.232, 0.691, 0.722, 0.882, 1.252, 1.584, 2.037, 0.119, 9.700, 3.130, 4.15),
};

let override = null;
export function setGutsOverride(obj) { override = obj; }

export function guts(season) {
  const s = Number(season);
  const base = FALLBACK_GUTS[s] || FALLBACK_GUTS[2026];
  const o = override && override[s];
  return o ? { ...base, ...o } : base;
}
