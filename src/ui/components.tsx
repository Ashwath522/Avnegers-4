import type { ReactNode } from 'react';
import type { Experience, ExperienceSnapshot } from '../engine/Experience';
import type { SimAction } from '../engine/tracking/simulated';
import { getCharacter } from '../engine/characters/registry';
import { saveCreation } from '../state/creationsDb';
import { getState, setState, useStore } from '../state/store';

export function Panel({ title, sub, children, right, className = '' }: { title?: string; sub?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && <div className="spread"><h2>{title}</h2>{right}</div>}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="v">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}

export function Bar({ v, green }: { v: number; green?: boolean }) {
  return <div className={`bar ${green ? 'green' : ''}`}><i style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }} /></div>;
}

export const statusTag = (s?: ExperienceSnapshot | null) => {
  if (!s) return <span className="tag">Starting</span>;
  if (s.simulated) return <span className="tag info">Simulated pose</span>;
  switch (s.status) {
    case 'tracking': return <span className="tag ok">Tracking active</span>;
    case 'searching': return <span className="tag warn">Searching for body</span>;
    case 'lost': return <span className="tag bad">Tracking lost</span>;
    case 'loading': return <span className="tag info">Loading models</span>;
    case 'denied': return <span className="tag bad">Camera denied</span>;
    case 'no-camera': return <span className="tag bad">No camera</span>;
    case 'error': return <span className="tag bad">Error</span>;
    default: return <span className="tag">Camera off</span>;
  }
};

/** Webcam + 3D viewport with tracking state overlays. */
export function Viewport({ vref, exp, snap, className = 'tall', allowSim = true, children }: { vref: React.RefObject<HTMLDivElement | null>; exp: Experience | null; snap: ExperienceSnapshot | null; className?: string; allowSim?: boolean; children?: ReactNode }) {
  const dim = useStore((s) => s.view.dim);
  const letterbox = useStore((s) => s.view.letterbox);
  const status = snap?.status;
  const blocked = status === 'denied' || status === 'no-camera' || status === 'error';
  const err = vref.current?.dataset.error;
  return (
    <div className={`viewport ${className}`}>
      <div ref={vref} style={{ position: 'absolute', inset: 0 }} />
      {dim > 0 && <div className="dim" style={{ opacity: dim }} />}
      {letterbox && <div className="letterbox" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
      <div className="hud tl">
        <div className="pill">{statusTag(snap)}
          {snap && !snap.simulated && snap.status === 'tracking' && <>
            <span className={`dot ${snap.hasPose ? 'ok' : ''}`} /> Body <span className={`dot ${snap.handsSeen.left || snap.handsSeen.right ? 'ok' : ''}`} /> Hands
          </>}
        </div>
      </div>
      {snap && <div className="hud tr"><div className="pill">{snap.fps.toFixed(0)} FPS{snap.cameraActive && <> · det {snap.detectFps.toFixed(0)} Hz · {snap.inferenceMs.toFixed(0)} ms</>}</div></div>}
      {err && <div className="overlay-card"><Panel title="Rendering unavailable"><p className="err">{err}</p></Panel></div>}
      {blocked && !snap?.simulated && (
        <div className="overlay-card">
          <Panel title={status === 'denied' ? 'Camera permission needed' : status === 'no-camera' ? 'No camera found' : 'Tracking error'}>
            <p className="muted">{snap?.error}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => exp?.tracker.retry()}>Retry camera</button>
              {allowSim && <button className="btn" onClick={() => { if (exp) exp.tracker.simulate = true; }}>Use simulated mannequin</button>}
            </div>
          </Panel>
        </div>
      )}
      {status === 'loading' && !snap?.simulated && (
        <div className="hint">
          {exp?.tracker.stage || 'Starting camera and loading tracking models…'}<br />
          <span className="muted small">First load downloads ~10 MB of MediaPipe models.</span>
          {allowSim && <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => { if (exp) exp.tracker.simulate = true; }}>Use simulated mannequin meanwhile</button></div>}
        </div>
      )}
      {status === 'searching' && !snap?.simulated && <div className="hint">Step into frame — stand 1.5–2.5 m back so your upper body (ideally full body) is visible.</div>}
      {status === 'lost' && !snap?.simulated && <div className="hint">Tracking lost — step back into the frame.</div>}
      {children}
    </div>
  );
}

const SIM_LABEL: Record<SimAction, string> = { idle: 'Idle', tpose: 'T-pose', palm: 'Open palm', web: 'Web sign', fist: 'Fist', punch: 'Punch', slam: 'Slam', bothPalms: 'Both palms' };

/** Buttons that drive the simulated mannequin's pose — the engine still has to recognise the gesture. */
export function SimControls({ exp, snap }: { exp: Experience | null; snap: ExperienceSnapshot | null }) {
  if (!snap?.simulated) return null;
  const acts: SimAction[] = ['idle', 'palm', 'fist', 'web', 'punch', 'slam', 'bothPalms', 'tpose'];
  return (
    <div className="row small">
      <span className="muted">Mannequin pose:</span>
      {acts.map((a) => <button key={a} className="btn sm" onClick={() => exp?.perform(a)}>{SIM_LABEL[a]}</button>)}
    </div>
  );
}

export function PowerBar({ snap }: { snap: ExperienceSnapshot | null }) {
  const cid = useStore((s) => s.characterId);
  const def = getCharacter(cid);
  return (
    <div className="powerbar">
      {def.powers.map((p) => {
        const cd = snap?.cooldowns[p.id] ?? 0;
        const ready = cd <= 0 && snap?.powerStatus && !snap.powerStatus.startsWith('Suit offline');
        return (
          <div key={p.id} className={`pw ${ready ? 'ready' : ''}`} title={p.hint}>
            <b>{p.name}</b><span className="muted">{p.hint}</span>
            {cd > 0 && <i className="cd" style={{ width: `${Math.min(100, (cd / Math.max(1, getState().tunings[cid]?.[p.id]?.cooldownMs ?? p.tuning.cooldownMs)) * 100)}%` }} />}
          </div>
        );
      })}
    </div>
  );
}

export function CaptureControls({ exp, snap }: { exp: Experience | null; snap: ExperienceSnapshot | null }) {
  const cid = useStore((s) => s.characterId);
  const shot = async () => {
    const b = await exp?.screenshot();
    if (b) await saveCreation({ kind: 'screenshot', characterId: cid, mime: 'image/png', blob: b, title: `${getCharacter(cid).name} capture` });
  };
  const rec = async () => {
    if (!exp) return;
    if (snap?.recording) {
      const r = await exp.stopRecording();
      if (r && r.blob.size) await saveCreation({ kind: 'clip', characterId: cid, mime: r.blob.type, blob: r.blob, durationMs: r.ms, title: `${getCharacter(cid).name} clip` });
    } else exp.startRecording();
  };
  return (
    <div className="row">
      <button className={`btn ${snap?.recording ? 'danger' : ''}`} onClick={rec} disabled={!exp?.canRecord}>{snap?.recording ? `■ Stop ${(snap.recordingMs / 1000).toFixed(1)}s` : '● Record'}</button>
      <button className="btn" onClick={shot}>Screenshot</button>
      {!exp?.canRecord && <span className="small muted">Recording not supported in this browser</span>}
    </div>
  );
}

export function GestureStatus({ snap }: { snap: ExperienceSnapshot | null }) {
  const g = snap?.gestures;
  const active = (side: 'left' | 'right') => {
    if (!g?.hands[side].present) return <span className="muted">not visible</span>;
    const a = Object.entries(g.hands[side].states).find(([, st]) => st === 'active');
    return a ? <span style={{ color: 'var(--green)' }}>{a[0]}</span> : <span className="muted">tracking</span>;
  };
  return (
    <div className="kv">
      <span>Right hand</span><span>{active('right')}</span>
      <span>Left hand</span><span>{active('left')}</span>
      <span>Body</span><span>{snap?.hasPose ? (snap.fullBody ? 'full body' : 'upper body') : '—'}</span>
      <span>Arms raised</span><span>{g ? `${Math.round(g.body.armsUp.score * 100)}%` : '—'}</span>
      <span>Wrist speed R/L</span><span>{g ? `${g.speed.right.toFixed(1)} / ${g.speed.left.toFixed(1)} sw/s` : '—'}</span>
    </div>
  );
}

export function CharacterPicker() {
  const cid = useStore((s) => s.characterId);
  return (
    <select value={cid} onChange={(e) => setState(() => ({ characterId: e.target.value }))}>
      {['apex', 'webrunner', 'titan', 'symbiont'].map((id) => <option key={id} value={id}>{getCharacter(id).name}</option>)}
    </select>
  );
}

export function PresetPicker({ exp }: { exp: Experience | null }) {
  return (
    <select defaultValue={exp?.world.preset ?? 'live'} onChange={(e) => exp?.world.setPreset(e.target.value as any)}>
      <option value="live">Mixed arena</option><option value="dummies">Training dummies</option><option value="blocks">Concrete blocks</option>
      <option value="wall">Walls</option><option value="drones">Drones</option><option value="empty">Empty</option>
    </select>
  );
}

export function Perf({ snap }: { snap: ExperienceSnapshot | null }) {
  return (
    <div className="kv">
      <span>Render FPS</span><span>{snap ? snap.fps.toFixed(0) : '—'}</span>
      <span>Frame CPU time</span><span>{snap ? `${snap.renderMs.toFixed(1)} ms` : '—'}</span>
      <span>Tracking rate</span><span>{snap?.cameraActive ? `${snap.detectFps.toFixed(0)} Hz` : '—'}</span>
      <span>Inference</span><span>{snap?.cameraActive ? `${snap.inferenceMs.toFixed(1)} ms` : '—'}</span>
    </div>
  );
}

export function Swatch({ id }: { id: string }) {
  const p = getCharacter(id).palette;
  return <div className="swatch" style={{ background: `radial-gradient(circle at 50% 40%, ${p.energy} 0 8%, transparent 9%), linear-gradient(135deg, ${p.primary} 0 55%, ${p.secondary} 55% 80%, ${p.trim} 80%)` }} />;
}
