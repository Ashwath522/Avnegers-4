import { useEffect, useState } from 'react';
import { go } from '../App';
import { CHARACTERS } from '../engine/characters/registry';
import { listCreations, onCreationsChanged, type Creation } from '../state/creationsDb';
import { setState, useStore } from '../state/store';
import { Panel, Swatch } from '../ui/components';
import { Tracker } from '../engine/tracking/Tracker';

export function useCreations() {
  const [items, setItems] = useState<Creation[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => listCreations().then(setItems).catch((e) => { setError(String(e)); setItems([]); });
    load();
    return onCreationsChanged(load);
  }, []);
  return { items, error };
}

export function CreationThumb({ c }: { c: Creation }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const u = URL.createObjectURL(c.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [c]);
  if (!url) return <div className="thumb" />;
  return c.kind === 'clip' ? <video className="thumb" src={url} muted controls /> : <img className="thumb" src={url} alt={c.title} />;
}

export function Home() {
  const stats = useStore((s) => s.stats);
  const calib = useStore((s) => s.calibration);
  const { items } = useCreations();
  const [perm, setPerm] = useState('unknown');
  const [storage, setStorage] = useState('');
  useEffect(() => {
    navigator.permissions?.query({ name: 'camera' as PermissionName }).then((p) => { setPerm(p.state); p.onchange = () => setPerm(p.state); }).catch(() => setPerm('unknown'));
    navigator.storage?.estimate().then((e) => setStorage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used of ${((e.quota ?? 0) / 1e9).toFixed(1)} GB`)).catch(() => undefined);
  }, []);
  const quick = [
    ['armory', 'Armory', 'Choose your suit'], ['transform', 'Transformation', 'Suit up in real time'], ['live', 'Live Experience', 'Full AR superhero mode'],
    ['powers', 'Power Lab', 'Tune and test abilities'], ['lab', 'Destruction Lab', 'Smash virtual targets'], ['training', 'Gesture Training', 'Learn the gestures'],
    ['cinematic', 'Cinematic Mode', 'Record a scene'], ['creations', 'My Creations', 'Clips & screenshots'], ['settings', 'Settings', 'Camera & calibration'],
  ];
  return (
    <div className="grid cols-3">
      <div className="stack">
        <Panel title="Quick access">
          <div className="list">{quick.map(([p, t, d]) => <div key={p} className="item" onClick={() => go(p)}><div><div className="title">{t}</div><div className="desc">{d}</div></div></div>)}</div>
        </Panel>
      </div>
      <div className="stack">
        <div className="hero">
          <div>
            <p>WELCOME TO</p>
            <h1>PROJECT <b>ALTER EGO</b></h1>
            <p>SUIT UP. UNLEASH. CREATE. REPEAT.</p>
            <div className="row">
              <button className="btn primary big" onClick={() => go('transform')}>Start transformation →</button>
              {!calib.done && <button className="btn big" onClick={() => go('settings')}>Calibrate tracking first</button>}
            </div>
          </div>
        </div>
        <Panel title="Featured suits" sub="All four suits are available. Models are procedural placeholders until rigged GLB assets are added.">
          <div className="cards">
            {CHARACTERS.map((c) => (
              <div key={c.id} className="card" onClick={() => { setState(() => ({ characterId: c.id })); go('armory'); }}>
                <div className="row"><Swatch id={c.id} /><div><b>{c.name}</b><div className="small muted">{c.tagline}</div></div></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="System status">
          <div className="statusbar">
            <span><span className={`dot ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'bad' : 'warn'}`} /> Camera permission: {perm}</span>
            <span><span className={`dot ${Tracker.instance.cameraActive ? 'ok' : ''}`} /> Tracker: {Tracker.instance.status}</span>
            <span><span className={`dot ${calib.done ? 'ok' : 'warn'}`} /> Calibration: {calib.done ? `done ${calib.at ? new Date(calib.at).toLocaleDateString() : ''}` : 'not done'}</span>
            {storage && <span>Local storage: {storage}</span>}
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Recent creations" right={<a href="#/creations" className="small">View all</a>}>
          {items === null ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">Nothing captured yet. Use Record or Screenshot in Live or Cinematic mode.</p> :
            <div className="stack">{items.slice(0, 3).map((c) => <div key={c.id}><CreationThumb c={c} /><div className="small muted">{c.title} · {new Date(c.createdAt).toLocaleString()}</div></div>)}</div>}
        </Panel>
        <Panel title="Your stats" sub="Counted locally on this device.">
          <div className="kv">
            <span>Transformations</span><span>{stats.transformations}</span>
            <span>Powers fired</span><span>{stats.powersFired}</span>
            <span>Targets destroyed</span><span>{stats.targetsDestroyed}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
