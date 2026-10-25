import { getCharacter } from '../engine/characters/registry';
import { setState, tuningFor, useStore, getState } from '../state/store';
import { Bar, CaptureControls, CharacterPicker, GestureStatus, Panel, Perf, PowerBar, PresetPicker, SimControls, Slider, Toggle, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';

export function Live() {
  const { ref, exp, snap } = useExperience({ camera: true, preset: 'live' });
  const cid = useStore((s) => s.characterId);
  const view = useStore((s) => s.view);
  const auto = useStore((s) => s.autoTransformOnPalms);
  const def = getCharacter(cid);
  const setView = (p: Partial<typeof view>) => setState((s) => ({ view: { ...s.view, ...p } }));
  const seq = snap?.seq;
  return (
    <div className="grid cols-3">
      <div className="stack">
        <Panel title="Live experience" sub="Step into your superhero self">
          <div className="list">
            {def.powers.map((p) => {
              const cd = snap?.cooldowns[p.id] ?? 0;
              return (
                <div key={p.id} className="item">
                  <div style={{ flex: 1 }}>
                    <div className="spread"><span className="title">{p.name}</span>{cd > 0 ? <span className="tag warn">{(cd / 1000).toFixed(1)}s</span> : <span className="tag ok">Ready</span>}</div>
                    <div className="desc">{p.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small" style={{ color: 'var(--cyan2)' }}>{snap?.powerStatus}</p>
        </Panel>
        <Panel title="Suit">
          <div className="spread"><CharacterPicker /><span className={`tag ${seq?.state === 'complete' ? 'ok' : seq?.state === 'running' ? 'info' : ''}`}>{seq?.state === 'complete' ? 'Online' : seq?.state === 'running' ? `${Math.round(seq.progress * 100)}%` : 'Offline'}</span></div>
          <div className="row" style={{ marginTop: 10 }}>
            {seq?.state === 'complete' ? <button className="btn danger" onClick={() => exp?.removeSuit()}>Remove suit</button> :
              <button className="btn primary" disabled={seq?.state === 'running'} onClick={() => exp?.startTransformation()}>Transform</button>}
            <button className="btn" onClick={() => exp?.completeTransformation()}>Skip</button>
          </div>
          <Toggle label="Both palms forward starts transformation" checked={auto} onChange={(v) => setState(() => ({ autoTransformOnPalms: v }))} />
        </Panel>
        <Panel title="Gesture status"><GestureStatus snap={snap} /></Panel>
      </div>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap}>
          <div className="hud bc"><PowerBar snap={snap} /></div>
          {seq?.state === 'idle' && snap?.hasPose && <div className="hud bl"><div className="pill">Hold both palms toward the camera to suit up</div></div>}
        </Viewport>
        <SimControls exp={exp} snap={snap} />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Panel title="Record & capture"><CaptureControls exp={exp} snap={snap} /><p className="small muted">Saved to My Creations (this browser).</p></Panel>
          <Panel title="Effects">
            <Toggle label="Particles" checked={view.particles} onChange={(v) => setView({ particles: v })} />
            <Toggle label="Screen shake" checked={view.shake} onChange={(v) => setView({ shake: v })} />
            <Toggle label="Tracking skeleton" checked={view.skeleton} onChange={(v) => setView({ skeleton: v })} />
            <Slider label="Dim background" value={view.dim} min={0} max={0.8} onChange={(v) => setView({ dim: v })} />
          </Panel>
          <Panel title="Performance"><Perf snap={snap} /></Panel>
        </div>
      </div>
      <div className="stack">
        <Panel title="Power stats" sub="Live values from the Power Lab tuning">
          {def.powers.map((p) => {
            const t = tuningFor(getState(), cid, p.id);
            return (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <h3>{p.name}</h3>
                <div className="kv"><span>Intensity</span><span>{t.intensity.toFixed(2)}×</span></div><Bar v={t.intensity / 2.5} />
                <div className="kv"><span>Range</span><span>{t.range.toFixed(1)} sw</span></div><Bar v={t.range / 20} />
                <div className="kv"><span>Cooldown</span><span>{t.cooldownMs} ms</span></div><Bar v={t.cooldownMs / 2000} />
              </div>
            );
          })}
          <a href="#/powers" className="small">Tune in Power Lab →</a>
        </Panel>
        <Panel title="Environment">
          <div className="spread"><PresetPicker exp={exp} /><button className="btn sm" onClick={() => exp?.world.resetAll()}>Reset targets</button></div>
          <p className="small muted">Targets: {snap ? `${snap.targets.total - snap.targets.destroyed}/${snap.targets.total}` : '—'} standing</p>
          <Slider label="Aim assist" value={view.aimAssist} min={0} max={1} onChange={(v) => setView({ aimAssist: v })} />
        </Panel>
        <Panel title="Event log"><div className="events">{snap?.events.map((e, i) => <div key={i}>{e}</div>)}</div></Panel>
      </div>
    </div>
  );
}
