import { setState, useStore } from '../state/store';
import { CharacterPicker, Panel, PowerBar, SimControls, Slider, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';
import type { WorldPreset } from '../engine/world/World';

const PRESETS: { id: WorldPreset; label: string; desc: string }[] = [
  { id: 'blocks', label: 'Concrete blocks', desc: '80 HP · cracks where hit, shatters into ~20 shards' },
  { id: 'dummies', label: 'Training dummies', desc: '100 HP · knockback, cracks, shatters' },
  { id: 'wall', label: 'Walls', desc: '300–400 HP brick · ~34 shards' },
  { id: 'drones', label: 'Hover drones', desc: '40 HP, fall when grabbed' },
  { id: 'live', label: 'Mixed arena', desc: 'A bit of everything' },
];

export function DestructionLab() {
  const { ref, exp, snap } = useExperience({ camera: true, simulate: true, preset: 'blocks', suitOnStart: true });
  const phys = useStore((s) => s.physics);
  const stats = useStore((s) => s.stats);
  const setP = (p: Partial<typeof phys>) => setState((s) => ({ physics: { ...s.physics, ...p } }));
  return (
    <div className="grid cols-2">
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap}><div className="hud bc"><PowerBar snap={snap} /></div></Viewport>
        <SimControls exp={exp} snap={snap} />
      </div>
      <div className="stack">
        <Panel title="Destruction & physics lab" right={<CharacterPicker />}>
          <p className="sub">Targets are rigid bodies with HP. Hits only register when a projectile, web, tendril or shockwave actually reaches them. Hits crack the surface where they land and knock off chips; destroyed targets shatter into irregular Voronoi shards (smaller near the impact) that tumble, bounce and settle as rubble.</p>
          <div className="list">{PRESETS.map((p) => <div key={p.id} className="item" onClick={() => exp?.world.setPreset(p.id)}><div><div className="title">{p.label}</div><div className="desc">{p.desc}</div></div></div>)}</div>
          <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => exp?.world.resetAll()}>Respawn all</button></div>
        </Panel>
        <Panel title="Physics">
          <Slider label="Gravity" value={phys.gravity} min={0.1} max={2.5} onChange={(v) => setP({ gravity: v })} fmt={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Bounciness" value={phys.restitution} min={0} max={0.9} onChange={(v) => setP({ restitution: v })} />
          <Slider label="Auto respawn" value={phys.respawnMs} min={0} max={10000} step={250} onChange={(v) => setP({ respawnMs: v })} fmt={(v) => (v ? `${(v / 1000).toFixed(1)} s` : 'off')} />
        </Panel>
        <Panel title="Results">
          <div className="kv">
            <span>Standing targets</span><span>{snap ? snap.targets.total - snap.targets.destroyed : '—'}</span>
            <span>Destroyed (all time)</span><span>{stats.targetsDestroyed}</span>
          </div>
          <div className="events" style={{ marginTop: 8 }}>{snap?.events.map((e, i) => <div key={i}>{e}</div>)}</div>
        </Panel>
      </div>
    </div>
  );
}
