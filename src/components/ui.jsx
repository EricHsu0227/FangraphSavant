import { Component, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SEASONS } from '../lib/guts.js';

/** Every player name in the app goes through this, so every name is clickable. */
export function PlayerLink({ id, name, hand, children }) {
  if (!id) return <span>{name || children}</span>;
  return (
    <Link to={`/player/${id}`}>
      {name || children}
      {hand && <Hand h={hand} />}
    </Link>
  );
}

export function TeamLink({ id, season, name, children }) {
  if (!id) return <span>{name || children}</span>;
  return <Link to={`/team/${id}/${season || ''}`}>{name || children}</Link>;
}

export const Hand = ({ h }) => (h ? <span className={`hand ${h}`}>{h}</span> : null);

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <button key={v} className={`${value === v ? 'on' : ''} ${v === 'vL' ? 'vl' : v === 'vR' ? 'vr' : ''}`} onClick={() => onChange(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export const SPLIT_OPTS = [
  { value: 'all', label: 'All' },
  { value: 'vL', label: 'vs LHP' },
  { value: 'vR', label: 'vs RHP' },
];
export const splitOpts = (group) =>
  group === 'pitching'
    ? [{ value: 'all', label: 'All' }, { value: 'vL', label: 'vs LHB' }, { value: 'vR', label: 'vs RHB' }]
    : SPLIT_OPTS;

export function SeasonSelect({ value, onChange, seasons = SEASONS }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[...seasons].reverse().map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

export const Loading = ({ what = '' }) => <div className="loading">Loading {what}…</div>;
export const Err = ({ e }) => <div className="err">Couldn’t load: {String(e?.message || e)}</div>;

/** useAsync(fn, deps) -> { data, error, loading } */
export function useAsync(fn, deps) {
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setSt((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => my === seq.current && setSt({ data, error: null, loading: false }))
      .catch((error) => my === seq.current && setSt({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return st;
}

/** Remember a UI choice per viewer (localStorage, guarded). */
export function usePref(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(`platoon:${key}`); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = (nv) => {
    setV((old) => {
      const val = typeof nv === 'function' ? nv(old) : nv;
      try { localStorage.setItem(`platoon:${key}`, JSON.stringify(val)); } catch { /* storage unavailable */ }
      return val;
    });
  };
  return [v, set];
}

export function SourceNote({ source }) {
  if (source !== 'mlbapi') return null;
  return (
    <div className="notice">
      Statcast layer for this season isn’t built yet — showing MLB Stats API numbers with wOBA/wRC+ computed in-app.
      xwOBA, batted-ball and WAR columns fill in once the data pipeline has run.
    </div>
  );
}

/** Keeps one broken panel from blanking the whole app. */
export class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  componentDidCatch(err, info) { console.error('Panel crashed:', err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="notice" role="alert">
        This section hit an error and couldn’t be shown ({String(this.state.err.message || this.state.err)}). Other parts of the page still work.
      </div>
    );
  }
}
