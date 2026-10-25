import { getCharacter } from '../engine/characters/registry';
import type { MaterializeEffect } from '../engine/characters/types';
import { getState, sequenceFor, setState, useStore } from '../state/store';
import { CharacterPicker, Panel, SimControls, Slider, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';
import { niceComp } from './Armory';

const STYLES: { id: MaterializeEffect; label: string }[] = [
  { id: 'particles', label: 'Particle assembly' }, { id: 'converge', label: 'Energy convergence' },
  { id: 'mechanical', label: 'Mechanical deployment' }, { id: 'organic', label: 'Organic growth' },
];

export function Transform() {
  const { ref, exp, snap } = useExperience({ camera: true, preset: 'empty' });
  const cid = useStore((s) => s.characterId);
  const speed = useStore((s) => s.transformSpeed);
  const def = getCharacter(cid);
  const seq = snap?.seq;
  const setStyle = (eff: MaterializeEffect) => {
    const steps = sequenceFor(getState(), cid).map((s) => ({ ...s, effect: eff }));
    setState((s) => ({ sequences: { ...s.sequences, [cid]: steps } }));
  };
  const statusTag = (st: string) => st === 'complete' ? <span className="tag ok">Complete</span> : st === 'active' ? <span className="tag info">In progress</span> : <span className="tag">Waiting</span>;
  return (
    <div className="grid cols-3">
      <div className="stack">
        <Panel title="Materialization sequence" right={<CharacterPicker />}>
          <div className="steps">
            {seq?.steps.map((s, i) => (
              <div key={s.id} className={`st ${s.status === 'active' ? 'active' : ''}`}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <div><b>{s.label}</b><div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${s.progress * 100}%` }} /></div></div>
                {statusTag(s.status)}
              </div>
            ))}
          </div>
          <div className="spread"><h3>Progress</h3><b style={{ fontFamily: 'var(--display)' }}>{Math.round((seq?.progress ?? 0) * 100)}%</b></div>
          <div className="bar"><i style={{ width: `${(seq?.progress ?? 0) * 100}%` }} /></div>
          <p className="small muted">Current stage: {seq?.current ?? (seq?.state === 'complete' ? 'Suit online' : 'Standby')}</p>
        </Panel>
      </div>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap}>
          <div className="hud bc row">
            {seq?.state === 'running' ? <button className="btn" onClick={() => exp?.seq.pause()}>Pause</button> :
              seq?.state === 'paused' ? <button className="btn" onClick={() => exp?.seq.resume()}>Resume</button> : null}
            <button className="btn" onClick={() => exp?.startTransformation()}>{seq?.state === 'idle' ? 'Start' : 'Restart'}</button>
            <button className="btn primary" onClick={() => exp?.completeTransformation()}>Complete</button>
            <button className="btn danger" onClick={() => exp?.removeSuit()}>Reset</button>
          </div>
          {seq?.state === 'idle' && <div className="hud bl"><div className="pill">✋✋ Hold both palms forward to synchronize</div></div>}
        </Viewport>
        <SimControls exp={exp} snap={snap} />
      </div>
      <div className="stack">
        <Panel title="Suit components" sub={def.name}>
          <div className="compgrid">
            {def.components.map((c) => {
              const p = snap?.components[c] ?? 0;
              return <div key={c} className={`comp ${p >= 1 ? 'done' : p > 0 ? 'prog' : ''}`}>{niceComp(c)}<br /><span className="small">{p >= 1 ? 'Complete' : p > 0 ? `${Math.round(p * 100)}%` : 'Waiting'}</span></div>;
            })}
          </div>
        </Panel>
        <Panel title="Materialization style" sub="Applies to every step of this suit (edit per step in the Sequence Editor)">
          <div className="list">{STYLES.map((s) => <button key={s.id} className="btn" onClick={() => setStyle(s.id)}>{s.label}</button>)}</div>
          <Slider label="Sequence speed" value={speed} min={0.25} max={3} onChange={(v) => setState(() => ({ transformSpeed: v }))} fmt={(v) => `${v.toFixed(2)}×`} />
        </Panel>
        <Panel title="Tracking">
          <div className="kv">
            <span>Body</span><span>{snap?.hasPose ? 'tracked' : '—'}</span>
            <span>Left hand</span><span>{snap?.handsSeen.left ? 'tracked' : '—'}</span>
            <span>Right hand</span><span>{snap?.handsSeen.right ? 'tracked' : '—'}</span>
            <span>Both-palms gesture</span><span>{Math.round((snap?.gestures.body.bothPalms.score ?? 0) * 100)}%</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
