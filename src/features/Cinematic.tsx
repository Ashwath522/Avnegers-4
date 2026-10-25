import { setState, useStore } from '../state/store';
import { CaptureControls, CharacterPicker, Panel, PresetPicker, SimControls, Slider, Toggle, Viewport } from '../ui/components';
import { useExperience } from '../ui/useExperience';

const GRADES = [['none', 'Natural'], ['cinematic', 'Cinematic'], ['noir', 'Noir'], ['heat', 'Heat']] as const;

export function Cinematic() {
  const { ref, exp, snap } = useExperience({ camera: true, preset: 'live' });
  const view = useStore((s) => s.view);
  const speed = useStore((s) => s.transformSpeed);
  const setView = (p: Partial<typeof view>) => setState((s) => ({ view: { ...s.view, ...p } }));
  return (
    <div className="grid cols-2">
      <div className="stack">
        <Viewport vref={ref} exp={exp} snap={snap} />
        <SimControls exp={exp} snap={snap} />
      </div>
      <div className="stack">
        <Panel title="Cinematic mode" right={<CharacterPicker />}>
          <p className="sub">Compose, perform and record. Recording captures the webcam, colour grade, letterbox and every 3D effect into a WebM clip.</p>
          <CaptureControls exp={exp} snap={snap} />
        </Panel>
        <Panel title="Scene">
          <div className="row">
            <button className="btn primary" onClick={() => exp?.startTransformation()}>Play transformation</button>
            <button className="btn" onClick={() => exp?.removeSuit()}>Reset suit</button>
          </div>
          <Slider label="Transform speed" value={speed} min={0.25} max={3} onChange={(v) => setState(() => ({ transformSpeed: v }))} fmt={(v) => `${v.toFixed(2)}×`} />
          <div className="spread" style={{ marginTop: 6 }}><span>Props</span><PresetPicker exp={exp} /></div>
        </Panel>
        <Panel title="Look">
          <div className="row">{GRADES.map(([id, l]) => <button key={id} className={`btn sm ${view.grade === id ? 'primary' : ''}`} onClick={() => setView({ grade: id })}>{l}</button>)}</div>
          <Toggle label="Letterbox (2.39-style bars)" checked={view.letterbox} onChange={(v) => setView({ letterbox: v })} />
          <Slider label="Dim background" value={view.dim} min={0} max={0.8} onChange={(v) => setView({ dim: v })} />
          <Toggle label="Screen shake" checked={view.shake} onChange={(v) => setView({ shake: v })} />
          <p className="small muted">Not implemented: virtual background environments (needs person segmentation) and free camera moves — the camera is your webcam.</p>
        </Panel>
      </div>
    </div>
  );
}
