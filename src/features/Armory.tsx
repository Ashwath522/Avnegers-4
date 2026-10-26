import { go } from '../App';
import { CHARACTERS, getCharacter } from '../engine/characters/registry';
import { setState, useStore } from '../state/store';
import { Panel, Swatch, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';

const NICE: Record<string, string> = { head: 'Head', chest: 'Chest', core: 'Core', belt: 'Belt', lShoulder: 'L Shoulder', rShoulder: 'R Shoulder', lUpperArm: 'L Upper arm', rUpperArm: 'R Upper arm', lForearm: 'L Forearm', rForearm: 'R Forearm', lHand: 'L Gauntlet', rHand: 'R Gauntlet', lThigh: 'L Thigh', rThigh: 'R Thigh', lShin: 'L Shin', rShin: 'R Shin', lFoot: 'L Boot', rFoot: 'R Boot', tendrils: 'Tendrils' };
export const niceComp = (c: string) => NICE[c] ?? c;

export function Armory() {
  const cid = useStore((s) => s.characterId);
  const def = getCharacter(cid);
  const { ref, exp, snap } = useExperience({ camera: false, simulate: true, preset: 'empty', suitOnStart: true });
  return (
    <div className="grid cols-3">
      <Panel title="Choose your alter ego">
        <div className="list">
          {CHARACTERS.map((c) => (
            <div key={c.id} className={`item ${c.id === cid ? 'sel' : ''}`} onClick={() => setState(() => ({ characterId: c.id }))}>
              <Swatch id={c.id} />
              <div><div className="title">{c.name}</div><div className="desc">{c.archetype}</div></div>
              {c.id === cid && <span className="tag info" style={{ marginLeft: 'auto' }}>Selected</span>}
            </div>
          ))}
        </div>
      </Panel>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap} className="tall">
          <div className="hud bc row">
            <button className="btn" onClick={() => exp?.perform('tpose')}>T-pose</button>
            <button className="btn" onClick={() => exp?.perform('idle')}>Idle</button>
            <button className="btn primary" onClick={() => exp?.startTransformation()}>Preview transformation</button>
          </div>
        </Viewport>
      </div>
      <div className="stack">
        <Panel title={def.name} sub={def.tagline}>
          <p className="small muted">
            Body model: {snap?.model.status === 'model' ? <span className="tag ok">3D model loaded</span> : snap?.model.status === 'loading' ? <span className="tag info">checking…</span> : <span className="tag warn">procedural placeholder</span>}
            {snap?.model.status !== 'model' && <> — drop a rigged humanoid at <code>public/assets/models/{def.id}.glb</code> to use it instead (see docs/ASSET_MANIFEST.md).</>}
            {snap?.model.missing.length ? <span className="err"> Missing bones: {snap.model.missing.join(', ')}</span> : null}
          </p>
          <h3>Armor components</h3>
          <div className="compgrid">
            {def.components.map((c) => {
              const p = snap?.components[c] ?? 0;
              return <div key={c} className={`comp ${p >= 1 ? 'done' : p > 0 ? 'prog' : ''}`}>{niceComp(c)}</div>;
            })}
          </div>
        </Panel>
        <Panel title="Powers">
          <div className="list">{def.powers.map((p) => <div key={p.id} className="item"><div><div className="title">{p.name}</div><div className="desc">{p.description}</div><div className="small" style={{ color: 'var(--cyan2)' }}>Gesture: {p.hint}</div></div></div>)}</div>
        </Panel>
        <div className="row">
          <button className="btn primary big" onClick={() => go('transform')}>Suit up live</button>
          <button className="btn big" onClick={() => go('powers')}>Customize</button>
        </div>
      </div>
    </div>
  );
}
