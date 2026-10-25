// Downloads MediaPipe model files into public/models so the app works without the Google CDN.
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'https://storage.googleapis.com/mediapipe-models';
const files = {
  'pose_landmarker_lite.task': `${base}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  'pose_landmarker_full.task': `${base}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  'hand_landmarker.task': `${base}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
};
await mkdir('public/models', { recursive: true });
for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url);
  if (!res.ok) { console.error(`FAILED ${name}: ${res.status}`); continue; }
  await writeFile(`public/models/${name}`, Buffer.from(await res.arrayBuffer()));
  console.log(`saved public/models/${name}`);
}

// also vendor the WASM runtime so nothing loads from jsDelivr
import { cp } from 'node:fs/promises';
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe-wasm', { recursive: true });
console.log('copied MediaPipe wasm to public/mediapipe-wasm');
