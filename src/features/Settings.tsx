import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STATE, setState, useStore } from '../state/store';
import { Panel, Slider, Toggle, Viewport, statusTag } from '../ui/components';
import { useExperience } from '../ui/useExperience';

export function Settings() {
  const { ref, exp, snap } = useExperience({ camera: true, preset: 'empty', skeleton: true });
  const tr = useStore((s) => s.tracker);
  const view = useStore((s) => s.view);
  const calib = useStore((s) => s.calibration);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [holdMs, setHoldMs] = useState(0);
  const lastT = useRef(performance.now());
  const setTr = (p: Partial<typeof tr>) => setState((s) => ({ tracker: { ...s.tracker, ...p } }));
  const setView = (p: Partial<typeof view>) => setState((s) => ({ view: { ...s.view, ...p } }));

  useEffect(() => {
    if (!snap?.cameraActive) return;
    navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'videoinput'))).catch(() => undefined);
  }, [snap?.cameraActive]);

  // Calibration: requires pose + both hands, held for 2 s. Full body is recorded but optional.
  const checks = { pose: !!snap?.hasPose && !snap.simulated, left: !!snap?.handsSeen.left, right: !!snap?.handsSeen.right, full: !!snap?.fullBody };
  const ok = checks.pose && checks.left && checks.right;
  useEffect(() => {
    const now = performance.now(); const dt = now - lastT.current; lastT.current = now;
    if (calib.done) return;
    if (ok) {
      const h = holdMs + dt;
      setHoldMs(h);
      if (h > 2000) setState(() => ({ calibration: { done: true, at: new Date().toISOString(), fullBody: checks.full, handsSeen: true } }));
    } else if (holdMs) setHoldMs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const check = (b: boolean, label: string) => <div className="spread small"><span>{label}</span><span className={`tag ${b ? 'ok' : 'warn'}`}>{b ? 'OK' : 'Waiting'}</span></div>;
  return (
    <div className="grid cols-3">
      <div className="stack">
        <Panel title="Camera" right={statusTag(snap)}>
          <label className="slider" style={{ gridTemplateColumns: '80px 1fr' }}><span>Device</span>
            <select value={tr.deviceId ?? ''} onChange={(e) => setTr({ deviceId: e.target.value || null })}>
              <option value="">Default camera</option>
              {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </label>
          <Toggle label="Mirror view" checked={tr.mirror} onChange={(v) => setTr({ mirror: v })} />
          {snap?.error && <p className="err">{snap.error}</p>}
          <button className="btn" onClick={() => exp?.tracker.retry()}>Restart camera</button>
        </Panel>
        <Panel title="Tracking">
          <label className="slider" style={{ gridTemplateColumns: '110px 1fr' }}><span>Pose model</span>
            <select value={tr.poseModel} onChange={(e) => setTr({ poseModel: e.target.value as 'lite' | 'full' })}><option value="lite">Lite (fast)</option><option value="full">Full (accurate)</option></select>
          </label>
          <Slider label="Smoothing" value={tr.minCutoff} min={0.2} max={4} onChange={(v) => setTr({ minCutoff: v })} fmt={(v) => (v < 1 ? 'heavy' : v < 2 ? 'medium' : 'light') + ` ${v.toFixed(1)}`} />
          <Slider label="Responsiveness" value={tr.beta} min={0} max={0.08} step={0.001} onChange={(v) => setTr({ beta: v })} fmt={(v) => v.toFixed(3)} />
          <p className="small muted">Lower smoothing = less jitter but more lag. Responsiveness reduces lag during fast moves (One-Euro filter).</p>
        </Panel>
        <Panel title="Visual & performance">
          <Toggle label="Particles" checked={view.particles} onChange={(v) => setView({ particles: v })} />
          <Slider label="Particle density" value={view.density} min={0} max={2} onChange={(v) => setView({ density: v })} />
          <Toggle label="Screen shake" checked={view.shake} onChange={(v) => setView({ shake: v })} />
          <Toggle label="Skeleton overlay (Live)" checked={view.skeleton} onChange={(v) => setView({ skeleton: v })} />
          <p className="small muted">For low-end machines: Lite model, particles off or density ≤ 0.5.</p>
        </Panel>
      </div>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap} allowSim={false} />
      </div>
      <div className="stack">
        <Panel title="Tracking calibration" sub="Stand back so your body and both hands are visible, then hold still for 2 seconds.">
          {check(checks.pose, 'Body detected')}
          {check(checks.left, 'Left hand detected')}
          {check(checks.right, 'Right hand detected')}
          {check(checks.full, 'Full body in frame (optional — needed for legs and ground slam)')}
          {!calib.done ? <><div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, holdMs / 20)}%` }} /></div><p className="small muted">Hold: {(holdMs / 1000).toFixed(1)} / 2.0 s</p></> :
            <><p className="small" style={{ color: 'var(--green)' }}>Calibrated {calib.at && new Date(calib.at).toLocaleString()} {calib.fullBody ? '(full body)' : '(upper body)'}</p>
              <button className="btn sm" onClick={() => { setHoldMs(0); setState(() => ({ calibration: { ...DEFAULT_STATE.calibration } })); }}>Recalibrate</button></>}
        </Panel>
        <Panel title="Diagnostics">
          <div className="kv">
            <span>Status</span><span>{snap?.status ?? '—'}</span>
            <span>Tracking rate</span><span>{snap?.cameraActive ? `${snap.detectFps.toFixed(0)} Hz` : '—'}</span>
            <span>Inference</span><span>{snap?.cameraActive ? `${snap.inferenceMs.toFixed(1)} ms` : '—'}</span>
            <span>Render</span><span>{snap ? `${snap.fps.toFixed(0)} fps` : '—'}</span>
          </div>
        </Panel>
        <Panel title="Data">
          <p className="small muted">Settings, tunings, custom sequences and stats are stored in this browser (localStorage). Captures are stored in IndexedDB.</p>
          <button className="btn danger" onClick={() => { if (confirm('Reset all settings, tunings, sequences and stats?')) setState(() => structuredClone(DEFAULT_STATE)); }}>Reset all settings</button>
        </Panel>
      </div>
    </div>
  );
}
