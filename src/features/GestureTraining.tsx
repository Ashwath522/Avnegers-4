import { useEffect, useRef, useState } from 'react';
import type { HandGesture } from '../engine/gestures/GestureEngine';
import { setState, useStore } from '../state/store';
import { Bar, Panel, SimControls, Slider, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';

const DRILLS: { id: HandGesture | 'bothPalms' | 'armsUp'; label: string; how: string }[] = [
  { id: 'palm', label: 'Open palm', how: 'Spread all fingers, palm facing the camera. Used by Apex repulsor and Symbiont tendrils.' },
  { id: 'fist', label: 'Fist', how: 'Close all four fingers. Used to pull webs and tendrils; fires the charged blast on release.' },
  { id: 'web', label: 'Web sign', how: 'Index and pinky extended, middle and ring folded.' },
  { id: 'point', label: 'Point', how: 'Index finger only.' },
  { id: 'bothPalms', label: 'Both palms', how: 'Both open palms toward the camera for ~0.6 s — starts the transformation.' },
  { id: 'armsUp', label: 'Arms raised', how: 'Both wrists above your head. Drive them down fast to ground-slam.' },
];

export function GestureTraining() {
  const { ref, exp, snap } = useExperience({ camera: true, simulate: true, preset: 'empty', skeleton: true });
  const g = useStore((s) => s.gesture);
  const [drill, setDrill] = useState(0);
  const [done, setDone] = useState<Record<string, number>>({});
  const wasActive = useRef(false);
  const d = DRILLS[drill];
  let score = 0, active = false;
  if (snap) {
    if (d.id === 'bothPalms' || d.id === 'armsUp') { score = snap.gestures.body[d.id].score; active = snap.gestures.body[d.id].state === 'active'; }
    else for (const side of ['left', 'right'] as const) {
      score = Math.max(score, snap.gestures.hands[side].scores[d.id as HandGesture]);
      active ||= snap.gestures.hands[side].states[d.id as HandGesture] === 'active';
    }
  }
  useEffect(() => {
    if (active && !wasActive.current) setDone((x) => ({ ...x, [d.id]: (x[d.id] ?? 0) + 1 }));
    wasActive.current = active;
  }, [active, d.id]);
  const ext = (side: 'left' | 'right') => snap?.gestures.hands[side].ext ?? [0, 0, 0, 0, 0];
  return (
    <div className="grid cols-3">
      <Panel title="Gesture drills">
        <div className="list">
          {DRILLS.map((x, i) => (
            <div key={x.id} className={`item ${i === drill ? 'sel' : ''}`} onClick={() => setDrill(i)}>
              <div style={{ flex: 1 }}><div className="spread"><span className="title">{x.label}</span>{done[x.id] ? <span className="tag ok">✓ {done[x.id]}</span> : null}</div><div className="desc">{x.how}</div></div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap}>
          <div className="hud bc"><div className="pill" style={{ fontSize: 14 }}>{d.label}: {active ? <span style={{ color: 'var(--green)' }}>RECOGNISED</span> : `${Math.round(score * 100)}%`}</div></div>
        </Viewport>
        <SimControls exp={exp} snap={snap} />
      </div>
      <div className="stack">
        <Panel title="Live recognition" sub="Smoothed scores straight from the gesture engine (not decorative)">
          {(['right', 'left'] as const).map((side) => (
            <div key={side} style={{ marginBottom: 10 }}>
              <h3>{side} hand {snap?.gestures.hands[side].present ? '' : '— not visible'}</h3>
              {(['palm', 'fist', 'web', 'point'] as HandGesture[]).map((k) => (
                <div key={k} className="slider" style={{ gridTemplateColumns: '60px 1fr 70px' }}>
                  <span>{k}</span><Bar v={snap?.gestures.hands[side].scores[k] ?? 0} green={snap?.gestures.hands[side].states[k] === 'active'} /><span className="v small">{snap?.gestures.hands[side].states[k]}</span>
                </div>
              ))}
              <div className="small muted">Finger extension T/I/M/R/P: {ext(side).map((e) => e.toFixed(1)).join(' / ')}</div>
            </div>
          ))}
          <h3>Body</h3>
          <div className="kv">
            <span>Both palms</span><span>{Math.round((snap?.gestures.body.bothPalms.score ?? 0) * 100)}%</span>
            <span>Arms raised</span><span>{Math.round((snap?.gestures.body.armsUp.score ?? 0) * 100)}%</span>
            <span>Wrist speed R/L</span><span>{snap ? `${snap.gestures.speed.right.toFixed(1)} / ${snap.gestures.speed.left.toFixed(1)}` : '—'}</span>
          </div>
          <p className="small muted">Punch fires above ~5.5 shoulder-widths/s (÷ sensitivity) with the arm extending. This is a webcam speed estimate, not a force measurement.</p>
        </Panel>
        <Panel title="Calibration">
          <Slider label="Sensitivity" value={g.sensitivity} min={0.6} max={1.6} onChange={(v) => setState((s) => ({ gesture: { ...s.gesture, sensitivity: v } }))} fmt={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Hold time" value={g.holdMs} min={0} max={500} step={10} onChange={(v) => setState((s) => ({ gesture: { ...s.gesture, holdMs: v } }))} fmt={(v) => `${v} ms`} />
          <p className="small muted">Higher sensitivity triggers more easily but risks accidental activations. Hold time filters out brief poses.</p>
        </Panel>
      </div>
    </div>
  );
}
