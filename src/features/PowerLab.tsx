import { getCharacter } from '../engine/characters/registry';
import type { PowerTuning } from '../engine/characters/types';
import { getState, setState, tuningFor, useStore } from '../state/store';
import { CharacterPicker, GestureStatus, Panel, PowerBar, PresetPicker, SimControls, Slider, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';

export function PowerLab() {
  const { ref, exp, snap } = useExperience({ camera: true, simulate: true, preset: 'live', suitOnStart: true });
  const cid = useStore((s) => s.characterId);
  useStore((s) => s.tunings); // re-render on tuning change
  const def = getCharacter(cid);
  const set = (pid: string, p: Partial<PowerTuning>) => setState((s) => ({ tunings: { ...s.tunings, [cid]: { ...(s.tunings[cid] ?? {}), [pid]: { ...(s.tunings[cid]?.[pid] ?? {}), ...p } } } }));
  const reset = (pid: string) => setState((s) => { const c = { ...(s.tunings[cid] ?? {}) }; delete c[pid]; return { tunings: { ...s.tunings, [cid]: c } }; });
  return (
    <div className="grid cols-2">
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap}>
          <div className="hud bc"><PowerBar snap={snap} /></div>
        </Viewport>
        <SimControls exp={exp} snap={snap} />
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Panel title="Environment"><div className="spread"><PresetPicker exp={exp} /><button className="btn sm" onClick={() => exp?.world.resetAll()}>Reset targets</button></div></Panel>
          <Panel title="Gesture status"><GestureStatus snap={snap} /></Panel>
        </div>
      </div>
      <div className="stack">
        <Panel title="Character power customization" right={<CharacterPicker />}>
          <p className="sub">Every slider changes the live effect. With the camera off, the mannequin buttons perform gestures that the engine must still recognise.</p>
          {def.powers.map((p) => {
            const t = tuningFor(getState(), cid, p.id);
            return (
              <div key={p.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
                <div className="spread"><h3>{p.name}</h3><button className="btn sm ghost" onClick={() => reset(p.id)}>Reset</button></div>
                <p className="small muted">{p.description} · <span style={{ color: 'var(--cyan2)' }}>{p.hint}</span></p>
                <Slider label="Intensity" value={t.intensity} min={0.2} max={3} onChange={(v) => set(p.id, { intensity: v })} fmt={(v) => `${v.toFixed(2)}×`} />
                <Slider label="Range" value={t.range} min={1} max={25} step={0.5} onChange={(v) => set(p.id, { range: v })} fmt={(v) => `${v.toFixed(1)} sw`} />
                {p.kind !== 'punch' && <Slider label="Speed" value={t.speed} min={2} max={40} step={0.5} onChange={(v) => set(p.id, { speed: v })} fmt={(v) => v.toFixed(1)} />}
                <Slider label="Cooldown" value={t.cooldownMs} min={0} max={3000} step={50} onChange={(v) => set(p.id, { cooldownMs: v })} fmt={(v) => `${v} ms`} />
                {p.kind === 'chargedBlast' && <Slider label="Charge time" value={t.chargeMs} min={200} max={3000} step={50} onChange={(v) => set(p.id, { chargeMs: v })} fmt={(v) => `${v} ms`} />}
                <label className="slider"><span>Color</span><input type="color" value={t.color} onChange={(e) => set(p.id, { color: e.target.value })} /><span className="v">{t.color}</span></label>
              </div>
            );
          })}
          <p className="small muted">"sw" = shoulder widths, so ranges scale with your distance from the camera.</p>
        </Panel>
        <Panel title="Global effects">
          <Slider label="Particle density" value={getState().view.density} min={0} max={2} onChange={(v) => setState((s) => ({ view: { ...s.view, density: v } }))} />
          <Slider label="Aim assist" value={getState().view.aimAssist} min={0} max={1} onChange={(v) => setState((s) => ({ view: { ...s.view, aimAssist: v } }))} />
        </Panel>
        <Panel title="Event log"><div className="events">{snap?.events.map((e, i) => <div key={i}>{e}</div>)}</div></Panel>
      </div>
    </div>
  );
}
