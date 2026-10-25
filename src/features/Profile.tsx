import { CHARACTERS } from '../engine/characters/registry';
import { setState, useStore } from '../state/store';
import { Bar, Panel, Swatch } from '../ui/components';
import { useCreations } from './Home';

export function Profile() {
  const stats = useStore((s) => s.stats);
  const cid = useStore((s) => s.characterId);
  const calib = useStore((s) => s.calibration);
  const { items } = useCreations();
  const powerNames = Object.fromEntries(CHARACTERS.flatMap((c) => c.powers.map((p) => [p.id, `${p.name} (${c.name})`])));
  const usedSuits = new Set(CHARACTERS.filter((c) => c.powers.some((p) => (stats.byPower[p.id] ?? 0) > 0)).map((c) => c.id));
  const achievements = [
    { name: 'First transformation', got: stats.transformations >= 1, goal: 1, v: stats.transformations },
    { name: 'Power user — fire 50 powers', got: stats.powersFired >= 50, goal: 50, v: stats.powersFired },
    { name: 'Wrecking crew — destroy 25 targets', got: stats.targetsDestroyed >= 25, goal: 25, v: stats.targetsDestroyed },
    { name: 'Shapeshifter — use every suit\'s powers', got: usedSuits.size >= 4, goal: 4, v: usedSuits.size },
    { name: 'Director — save 5 creations', got: (items?.length ?? 0) >= 5, goal: 5, v: items?.length ?? 0 },
    { name: 'Dialed in — complete calibration', got: calib.done, goal: 1, v: calib.done ? 1 : 0 },
  ];
  return (
    <div className="grid cols-2l">
      <div className="stack">
        <Panel title="Profile" sub="Local profile — all numbers are counted on this device.">
          <div className="kv">
            <span>Transformations</span><span>{stats.transformations}</span>
            <span>Powers fired</span><span>{stats.powersFired}</span>
            <span>Targets destroyed</span><span>{stats.targetsDestroyed}</span>
            <span>Creations saved</span><span>{items?.length ?? '…'}</span>
            <span>Calibration</span><span>{calib.done ? 'done' : 'not done'}</span>
          </div>
        </Panel>
        <Panel title="Power usage">
          {Object.keys(stats.byPower).length === 0 ? <p className="muted small">No powers used yet.</p> :
            <div className="kv">{Object.entries(stats.byPower).map(([k, v]) => [<span key={k}>{powerNames[k] ?? k}</span>, <span key={k + 'v'}>{v}</span>])}</div>}
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Suit collection">
          <div className="cards">
            {CHARACTERS.map((c) => (
              <div key={c.id} className={`card ${c.id === cid ? 'sel' : ''}`} onClick={() => setState(() => ({ characterId: c.id }))}>
                <div className="row"><Swatch id={c.id} /><div><b>{c.name}</b><div className="small muted">{c.archetype}</div></div></div>
                <div className="row small" style={{ marginTop: 8 }}><span className="tag ok">Available</span><span className="tag warn">Placeholder model</span>{c.id === cid && <span className="tag info">Equipped</span>}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Achievements" sub={`${achievements.filter((a) => a.got).length} / ${achievements.length} unlocked`}>
          {achievements.map((a) => (
            <div key={a.name} style={{ marginBottom: 8 }}>
              <div className="spread small"><span>{a.got ? '🏆' : '🔒'} {a.name}</span><span className="muted">{Math.min(a.v, a.goal)} / {a.goal}</span></div>
              <Bar v={a.v / a.goal} green={a.got} />
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
