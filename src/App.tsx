import { useEffect, useState, type ReactElement } from 'react';
import { Home } from './features/Home';
import { Armory } from './features/Armory';
import { Live } from './features/Live';
import { Transform } from './features/Transform';
import { SequenceEditor } from './features/SequenceEditor';
import { PowerLab } from './features/PowerLab';
import { DestructionLab } from './features/DestructionLab';
import { GestureTraining } from './features/GestureTraining';
import { Settings } from './features/Settings';
import { Creations } from './features/Creations';
import { Profile } from './features/Profile';
import { Cinematic } from './features/Cinematic';
import { Tracker } from './engine/tracking/Tracker';

export const ROUTES: { path: string; label: string; el: () => ReactElement }[] = [
  { path: '', label: 'Home', el: () => <Home /> },
  { path: 'armory', label: 'Armory', el: () => <Armory /> },
  { path: 'transform', label: 'Transformation', el: () => <Transform /> },
  { path: 'live', label: 'Live Experience', el: () => <Live /> },
  { path: 'powers', label: 'Power Lab', el: () => <PowerLab /> },
  { path: 'lab', label: 'Destruction Lab', el: () => <DestructionLab /> },
  { path: 'editor', label: 'Sequence Editor', el: () => <SequenceEditor /> },
  { path: 'cinematic', label: 'Cinematic', el: () => <Cinematic /> },
  { path: 'training', label: 'Gestures', el: () => <GestureTraining /> },
  { path: 'creations', label: 'Creations', el: () => <Creations /> },
  { path: 'profile', label: 'Profile', el: () => <Profile /> },
  { path: 'settings', label: 'Settings', el: () => <Settings /> },
];

export const go = (path: string) => { location.hash = `#/${path}`; };
const current = () => location.hash.replace(/^#\/?/, '').split('?')[0];

export function App() {
  const [path, setPath] = useState(current());
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => setPath(current());
    window.addEventListener('hashchange', h);
    const un = Tracker.instance.subscribe(() => force((x) => x + 1));
    return () => { window.removeEventListener('hashchange', h); un(); };
  }, []);
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  const st = Tracker.instance.status;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => go('')}>PROJECT <b>ALTER EGO</b><small>YOUR BODY. YOUR POWERS. YOUR REALITY.</small></div>
        <nav className="nav">
          {ROUTES.map((r) => <a key={r.path} href={`#/${r.path}`} className={r === route ? 'active' : ''}>{r.label}</a>)}
        </nav>
        <div className="sys"><span className={`dot ${Tracker.instance.cameraActive ? 'ok' : ''}`} />Camera {Tracker.instance.cameraActive ? 'on' : 'off'} · {st}</div>
      </header>
      <main className="page" key={route.path}>{route.el()}</main>
    </div>
  );
}
