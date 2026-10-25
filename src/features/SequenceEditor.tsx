import { getCharacter } from '../engine/characters/registry';
import type { ComponentId, MaterializeEffect, SequenceStep } from '../engine/characters/types';
import { validateSequence } from '../engine/characters/validate';
import { sequenceFor, setState, useStore } from '../state/store';
import { CharacterPicker, Panel, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';
import { niceComp } from './Armory';

const EFFECTS: MaterializeEffect[] = ['particles', 'converge', 'mechanical', 'organic'];

export function SequenceEditor() {
  const cid = useStore((s) => s.characterId);
  const steps = useStore((s) => sequenceFor(s, cid));
  const custom = useStore((s) => !!s.sequences[cid]);
  const def = getCharacter(cid);
  const { ref, exp, snap } = useExperience({ camera: false, simulate: true, preset: 'empty', suitOnStart: true });
  const errors = validateSequence(steps, def.components);
  const covered = new Set(steps.flatMap((s) => s.components));
  const missing = def.components.filter((c) => !covered.has(c));
  const total = Math.max(1, ...steps.map((s) => s.start + s.duration));

  const save = (next: SequenceStep[]) => setState((s) => ({ sequences: { ...s.sequences, [cid]: next } }));
  const upd = (i: number, p: Partial<SequenceStep>) => save(steps.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= steps.length) return;
    const n = steps.map((s) => ({ ...s })); [n[i].start, n[j].start] = [n[j].start, n[i].start]; [n[i], n[j]] = [n[j], n[i]]; save(n);
  };
  const toggleComp = (i: number, c: ComponentId) => {
    // a component belongs to exactly one step
    save(steps.map((s, k) => ({ ...s, components: k === i ? (s.components.includes(c) ? s.components.filter((x) => x !== c) : [...s.components, c]) : s.components.filter((x) => x !== c) })));
  };
  const add = () => save([...steps, { id: `step${Date.now()}`, label: 'New stage', components: [], start: total, duration: 600, effect: 'particles' }]);
  const reset = () => setState((s) => { const n = { ...s.sequences }; delete n[cid]; return { sequences: n }; });

  return (
    <div className="grid cols-2">
      <div className="stack">
        <Panel title="Transformation sequence editor" right={<div className="row"><CharacterPicker />{custom && <span className="tag warn">Custom</span>}</div>}>
          <p className="sub">Edits apply immediately to the real transformation engine used by Live and Transformation modes (stored in this browser).</p>
          <table className="ed">
            <thead><tr><th>#</th><th>Stage</th><th>Start ms</th><th>Duration</th><th>Effect</th><th>Components</th><th></th></tr></thead>
            <tbody>
              {steps.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td><input type="text" value={s.label} onChange={(e) => upd(i, { label: e.target.value })} /></td>
                  <td><input type="number" min={0} step={50} value={s.start} onChange={(e) => upd(i, { start: Math.max(0, +e.target.value) })} /></td>
                  <td><input type="number" min={50} step={50} value={s.duration} onChange={(e) => upd(i, { duration: Math.max(50, +e.target.value) })} /></td>
                  <td><select value={s.effect} onChange={(e) => upd(i, { effect: e.target.value as MaterializeEffect })}>{EFFECTS.map((x) => <option key={x}>{x}</option>)}</select></td>
                  <td><div className="chips">{def.components.map((c) => <span key={c} className={`chip ${s.components.includes(c) ? 'on' : ''}`} onClick={() => toggleComp(i, c)}>{niceComp(c)}</span>)}</div></td>
                  <td><div className="row"><button className="btn sm" onClick={() => move(i, -1)}>↑</button><button className="btn sm" onClick={() => move(i, 1)}>↓</button><button className="btn sm danger" onClick={() => save(steps.filter((_, k) => k !== i))}>✕</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={add}>+ Add stage</button><button className="btn ghost" onClick={reset} disabled={!custom}>Reset to default</button></div>
          {errors.map((e) => <div key={e} className="err">⚠ {e}</div>)}
          {missing.length > 0 && <div className="err">⚠ Not assigned to any stage (will appear immediately): {missing.map(niceComp).join(', ')}</div>}
        </Panel>
        <Panel title="Timeline" sub={`${(total / 1000).toFixed(2)} s total`}>
          {steps.map((s) => (
            <div key={s.id} className="spread small" style={{ marginBottom: 4 }}>
              <span style={{ width: 160 }}>{s.label}</span>
              <div className="timeline" style={{ flex: 1 }}><i style={{ left: `${(s.start / total) * 100}%`, width: `${(s.duration / total) * 100}%` }} /></div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap} className="mid">
          <div className="hud bc row"><button className="btn primary" onClick={() => exp?.startTransformation()}>Preview sequence</button></div>
        </Viewport>
        <Panel title="Preview status">
          <p className="small">{snap?.seq.current ?? (snap?.seq.state === 'complete' ? 'Complete' : 'Idle')} — {Math.round((snap?.seq.progress ?? 0) * 100)}%</p>
        </Panel>
      </div>
    </div>
  );
}
