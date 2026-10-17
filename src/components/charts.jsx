// Small SVG chart kit. Colors come from CSS tokens so both themes read.
import { useState } from 'react';
import { PITCH_COLOR, PITCH_NAME } from '../lib/catalog.js';

const RES_COLOR = ['var(--out)', 'var(--h1)', 'var(--h2)', 'var(--h3)', 'var(--hr)'];
const RES_NAME = ['Out', '1B', '2B', '3B', 'HR'];

/** Diverging color for a value relative to a center (league average). */
export function divColor(v, center, spread, higherIsGood = true) {
  if (v == null || !Number.isFinite(v)) return 'var(--chip)';
  let t = (v - center) / spread;
  if (!higherIsGood) t = -t;
  t = Math.max(-1, Math.min(1, t));
  const a = Math.abs(t) * 0.85 + 0.08;
  return t >= 0 ? `rgba(214, 41, 52, ${a})` : `rgba(29, 95, 168, ${a})`;
}

// ---------------------------------------------------------------- spray chart
export function SprayChart({ points = [], filterHand = 'all', show = 'all', size = 320 }) {
  const [hover, setHover] = useState(null);
  const pts = points.filter((p) => (filterHand === 'all' || (filterHand === 'vL' ? p[5] === 0 : p[5] === 1))
    && (show === 'all' || (show === 'hits' ? p[4] > 0 : show === 'hr' ? p[4] === 4 : show === 'outs' ? p[4] === 0 : true)));
  const hx = 125.42, hy = 198.27;
  const S = 2.5; // ft per hc unit
  const arc = (r) => {
    const a1 = (-135 * Math.PI) / 180, a2 = (-45 * Math.PI) / 180;
    return `M ${hx + r * Math.cos(a1)} ${hy + r * Math.sin(a1)} A ${r} ${r} 0 0 1 ${hx + r * Math.cos(a2)} ${hy + r * Math.sin(a2)}`;
  };
  const counts = [0, 0, 0, 0, 0];
  pts.forEach((p) => counts[p[4]]++);
  return (
    <div className="chart-box">
      <svg viewBox="0 20 250 190" style={{ width: '100%', maxWidth: size }} role="img" aria-label="Spray chart">
        <path d={`M ${hx} ${hy} L ${hx - 115} ${hy - 115} ${arc(400 / S).replace('M', 'L')} L ${hx} ${hy}`} fill="var(--field)" />
        <path d={arc(400 / S)} fill="none" stroke="var(--line)" />
        <path d={arc(300 / S)} fill="none" stroke="var(--line)" strokeDasharray="2 3" />
        <path d={arc(200 / S)} fill="none" stroke="var(--line)" strokeDasharray="2 3" />
        <line x1={hx} y1={hy} x2={hx - 115} y2={hy - 115} stroke="var(--line)" />
        <line x1={hx} y1={hy} x2={hx + 115} y2={hy - 115} stroke="var(--line)" />
        <path d={`M ${hx} ${hy} l -25 -25 l 25 -25 l 25 25 Z`} fill="var(--infield)" stroke="var(--line)" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={p[4] === 4 ? 2.6 : 2} fill={RES_COLOR[p[4]]} fillOpacity={p[4] === 0 ? 0.45 : 0.85}
            stroke={hover === i ? 'var(--ink)' : 'none'} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x="8" y="200" fontSize="7" fill="var(--muted)">{pts.length} BBE</text>
      </svg>
      {hover != null && pts[hover] && (
        <div className="small mono">{RES_NAME[pts[hover][4]]} · EV {pts[hover][2]} · LA {pts[hover][3]}° · vs {pts[hover][5] ? 'RHP' : 'LHP'}</div>
      )}
      <div className="legend">
        {RES_NAME.map((r, i) => <span key={r}><i style={{ background: RES_COLOR[i] }} />{r} {counts[i]}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- zone grid
// Gameday zones from the catcher's view: 1-9 inside (row-major from top-left),
// 11 top-left, 12 top-right, 13 bottom-left, 14 bottom-right outside.
export function ZoneGrid({ zones = {}, metric = 'xwoba', lg = {}, title, size = 210 }) {
  const val = (z) => {
    const c = zones[z];
    if (!c) return { v: null, n: 0 };
    const [n, sw, wh, wn, wd, xn, rv] = c;
    switch (metric) {
      case 'woba': return { v: wd >= 5 ? wn / wd : null, n: wd };
      case 'xwoba': return { v: wd >= 5 ? xn / wd : null, n: wd };
      case 'swing': return { v: n >= 10 ? sw / n : null, n };
      case 'whiff': return { v: sw >= 8 ? wh / sw : null, n: sw };
      case 'freq': return { v: n, n };
      case 'rv': return { v: n >= 10 ? (rv / n) * 100 : null, n };
      default: return { v: null, n };
    }
  };
  const total = Object.values(zones).reduce((a, c) => a + c[0], 0) || 1;
  const cfg = {
    woba: { c: lg.woba ?? 0.315, s: 0.12, hb: true, f: (v) => v.toFixed(3).replace(/^0/, '') },
    xwoba: { c: lg.xwoba ?? 0.315, s: 0.12, hb: true, f: (v) => v.toFixed(3).replace(/^0/, '') },
    swing: { c: 0.47, s: 0.3, hb: true, f: (v) => `${Math.round(v * 100)}%` },
    whiff: { c: 0.25, s: 0.2, hb: true, f: (v) => `${Math.round(v * 100)}%` },
    freq: { c: total / 13, s: total / 13, hb: true, f: (v) => `${((v / total) * 100).toFixed(0)}%` },
    rv: { c: 0, s: 3, hb: true, f: (v) => v.toFixed(1) },
  }[metric];
  const cell = 40, o = 22, W = cell * 3 + o * 2;
  const inner = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const outer = { 11: [0, 0], 12: [1, 0], 13: [0, 1], 14: [1, 1] };
  const label = (z, x, y) => {
    const { v } = val(z);
    return v == null ? null : <text x={x} y={y} fontSize="10" textAnchor="middle" fill="var(--ink)" fontFamily="var(--mono)">{cfg.f(v)}</text>;
  };
  return (
    <div className="chart-box">
      {title && <div className="small muted" style={{ textAlign: 'center' }}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${W}`} style={{ width: '100%', maxWidth: size }} role="img" aria-label="Zone chart">
        {Object.entries(outer).map(([z, [qx, qy]]) => {
          const { v } = val(z);
          return <rect key={z} x={qx * (W / 2)} y={qy * (W / 2)} width={W / 2} height={W / 2} fill={divColor(v, cfg.c, cfg.s, cfg.hb)} stroke="var(--panel)" strokeWidth="1.5" />;
        })}
        {Object.entries(outer).map(([z, [qx, qy]]) => label(z, qx ? W - 14 : 14, qy ? W - 6 : 13))}
        {inner.map((z, i) => {
          const x = o + (i % 3) * cell, y = o + Math.floor(i / 3) * cell;
          const { v } = val(z);
          return (
            <g key={z}>
              <rect x={x} y={y} width={cell} height={cell} fill={divColor(v, cfg.c, cfg.s, cfg.hb)} stroke="var(--panel)" strokeWidth="1.5" />
              {label(z, x + cell / 2, y + cell / 2 + 4)}
            </g>
          );
        })}
        <rect x={o} y={o} width={cell * 3} height={cell * 3} fill="none" stroke="var(--ink)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- movement chart
export function MovementChart({ arsenal = [], throws, size = 300 }) {
  const R = 25; // inches shown each way
  const W = 240, c = W / 2, k = (W / 2 - 16) / R;
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${W}`} style={{ width: '100%', maxWidth: size }} role="img" aria-label="Pitch movement">
        {[-20, -10, 10, 20].map((v) => (
          <g key={v}>
            <line x1={c + v * k} x2={c + v * k} y1="8" y2={W - 8} stroke="var(--line)" />
            <line y1={c - v * k} y2={c - v * k} x1="8" x2={W - 8} stroke="var(--line)" />
            <text x={c + v * k} y={W - 1} fontSize="7" textAnchor="middle" fill="var(--muted)">{v}</text>
            <text x="2" y={c - v * k + 2} fontSize="7" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <line x1={c} x2={c} y1="8" y2={W - 8} stroke="var(--muted)" />
        <line y1={c} y2={c} x1="8" x2={W - 8} stroke="var(--muted)" />
        <text x={W - 10} y={c - 4} fontSize="7" textAnchor="end" fill="var(--muted)">{throws === 'L' ? 'arm side →' : 'glove side →'}</text>
        <text x="12" y={c - 4} fontSize="7" fill="var(--muted)">{throws === 'L' ? '← glove side' : '← arm side'}</text>
        {arsenal.filter((p) => p.hb != null && p.ivb != null).map((p) => (
          <g key={p.pt}>
            <circle cx={c + p.hb * k} cy={c - p.ivb * k} r={4 + Math.sqrt(p.use || 0) * 14} fill={PITCH_COLOR[p.pt] || '#888'} fillOpacity="0.75" stroke="var(--panel)" />
            <text x={c + p.hb * k} y={c - p.ivb * k + 3} fontSize="8" textAnchor="middle" fill="#111" fontWeight="700">{p.pt}</text>
          </g>
        ))}
      </svg>
      <div className="small muted" style={{ textAlign: 'center' }}>Induced vertical break vs horizontal break (in), catcher’s view</div>
    </div>
  );
}

// ---------------------------------------------------------------- line chart
/**
 * series: [{ name, color, points: [[x, y], ...], dash }]
 * refs: [{ y, label }], xLabels: fn(x) -> string
 */
export function LineChart({ series = [], refs = [], height = 200, yFmt = (v) => v, xFmt = (v) => v, yMin, yMax, area = false }) {
  const [hover, setHover] = useState(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div className="muted small">No data.</div>;
  const W = 640, H = height, pl = 40, pr = 10, pt = 10, pb = 22;
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]).filter((v) => v != null);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = yMin ?? Math.min(...ys, ...refs.map((r) => r.y)), y1 = yMax ?? Math.max(...ys, ...refs.map((r) => r.y));
  const padY = (y1 - y0) * 0.08 || 0.01; if (yMin == null) y0 -= padY; if (yMax == null) y1 += padY;
  const X = (v) => pl + ((v - x0) / (x1 - x0 || 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pt - pb);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const xt = Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5);
  const near = hover == null ? null : series.map((s) => s.points.reduce((b, p) => (Math.abs(p[0] - hover) < Math.abs((b?.[0] ?? Infinity) - hover) ? p : b), null));
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(x0 + ((px - pl) / (W - pl - pr)) * (x1 - x0)); }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}><line x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={pl - 4} y={Y(t) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{yFmt(t)}</text></g>
        ))}
        {xt.map((t, i) => <text key={i} x={X(t)} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--muted)">{xFmt(Math.round(t))}</text>)}
        {refs.map((r, i) => (
          <g key={i}><line x1={pl} x2={W - pr} y1={Y(r.y)} y2={Y(r.y)} stroke="var(--muted)" strokeDasharray="4 3" />
            <text x={W - pr - 2} y={Y(r.y) - 3} fontSize="9" textAnchor="end" fill="var(--muted)">{r.label}</text></g>
        ))}
        {series.map((s, si) => {
          const pts = s.points.filter((p) => p[1] != null);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
          return (
            <g key={si}>
              {area && si === 0 && pts.length > 1 && <path d={`${d} L${X(pts[pts.length - 1][0])},${Y(y0)} L${X(pts[0][0])},${Y(y0)} Z`} fill={s.color} opacity="0.08" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || undefined} />
              {pts.length > 0 && <circle cx={X(pts[pts.length - 1][0])} cy={Y(pts[pts.length - 1][1])} r="3" fill={s.color} />}
            </g>
          );
        })}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={pt} y2={H - pb} stroke="var(--muted)" opacity=".4" />}
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name}{near?.[i] ? `: ${yFmt(near[i][1])}${s.labelOf ? ` (${s.labelOf(near[i])})` : ''}` : ''}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- horizontal bars
export function Bars({ items, max, fmtV = (v) => v, color = 'var(--accent)' }) {
  const m = max ?? Math.max(...items.map((i) => Math.abs(i.v || 0)), 0.0001);
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar-row" key={it.label}>
          <span className="lbl">{it.label}</span>
          <div className="bar"><div style={{ width: `${(Math.abs(it.v || 0) / m) * 100}%`, background: it.color || color }} /></div>
          <span className="mono small">{fmtV(it.v)}</span>
        </div>
      ))}
    </div>
  );
}

/** Stacked 100% bar, e.g. pitch mix or batted-ball profile. */
export function StackBar({ parts, height = 16 }) {
  const tot = parts.reduce((a, p) => a + (p.v || 0), 0) || 1;
  return (
    <div className="stack" style={{ height }}>
      {parts.filter((p) => p.v > 0).map((p) => (
        <div key={p.label} title={`${p.label}: ${((p.v / tot) * 100).toFixed(1)}%`} style={{ width: `${(p.v / tot) * 100}%`, background: p.color }}>
          {(p.v / tot) > 0.08 && <span>{p.short || p.label}</span>}
        </div>
      ))}
    </div>
  );
}

export function PitchDot({ pt }) {
  return <span className="pdot" style={{ background: PITCH_COLOR[pt] || '#888' }} title={PITCH_NAME[pt] || pt} />;
}
