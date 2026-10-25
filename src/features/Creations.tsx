import { useState } from 'react';
import { getCharacter } from '../engine/characters/registry';
import { deleteCreation } from '../state/creationsDb';
import { Panel } from '../ui/components';
import { CreationThumb, useCreations } from './Home';

export function Creations() {
  const { items, error } = useCreations();
  const [filter, setFilter] = useState<'all' | 'clip' | 'screenshot'>('all');
  const list = (items ?? []).filter((c) => filter === 'all' || c.kind === filter);
  const download = (c: NonNullable<typeof items>[number]) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(c.blob);
    a.download = `${c.title.replace(/\s+/g, '-').toLowerCase()}-${c.createdAt}.${c.kind === 'clip' ? (c.mime.includes('mp4') ? 'mp4' : 'webm') : 'png'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="stack">
      <Panel title="My creations" sub="Clips and screenshots captured in Live and Cinematic modes. Stored locally in this browser." right={
        <div className="row">{(['all', 'clip', 'screenshot'] as const).map((f) => <button key={f} className={`btn sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}</div>}>
        {error && <p className="err">Storage unavailable: {error}</p>}
        {items === null ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No creations yet — press Record or Screenshot in <a href="#/live">Live</a> or <a href="#/cinematic">Cinematic</a> mode.</p> : (
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {list.map((c) => (
              <div key={c.id} className="card" style={{ cursor: 'default' }}>
                <CreationThumb c={c} />
                <div className="spread" style={{ marginTop: 6 }}>
                  <div><b>{c.title}</b><div className="small muted">{getCharacter(c.characterId).name} · {new Date(c.createdAt).toLocaleString()}{c.durationMs ? ` · ${(c.durationMs / 1000).toFixed(1)}s` : ''} · {(c.blob.size / 1e6).toFixed(1)} MB</div></div>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn sm" onClick={() => download(c)}>Download</button>
                  <button className="btn sm danger" onClick={() => deleteCreation(c.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
