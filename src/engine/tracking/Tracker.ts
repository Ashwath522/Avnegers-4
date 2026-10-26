import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { FilterBank } from './smoothing';
import { mapPoint, type CoverMap } from './mapping';
import { palmFacing, type RawLm } from './handMath';
import { simulatePose, type SimAction } from './simulated';
import { JOINTS, POSE_INDEX, emptyJoints, type BodyFrame, type HandState, type Side, type TrackingStatus, dist2 } from './types';

const MP_VERSION = '0.10.35';
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const CDN_MODELS: Record<string, string> = {
  pose_lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  pose_full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};
const LOCAL_MODELS: Record<string, string> = {
  pose_lite: '/models/pose_landmarker_lite.task',
  pose_full: '/models/pose_landmarker_full.task',
  hand: '/models/hand_landmarker.task',
};

export interface TrackerSettings {
  deviceId: string | null;
  mirror: boolean;
  poseModel: 'lite' | 'full';
  handsEnabled: boolean;
  minCutoff: number;
  beta: number;
}

type Listener = () => void;

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

async function localAvailable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    const ct = r.headers.get('content-type') ?? '';
    return r.ok && !ct.includes('text/html');
  } catch { return false; }
}

/**
 * Single shared camera + MediaPipe tracker. Screens acquire()/release() it; the webcam stream is
 * stopped when the last user releases it, so we never run duplicate streams or detectors.
 */
export class Tracker {
  static readonly instance = new Tracker();

  readonly video: HTMLVideoElement;
  status: TrackingStatus = 'idle';
  error = '';
  /** human-readable loading stage, shown while status === 'loading' */
  stage = '';
  settings: TrackerSettings = { deviceId: null, mirror: true, poseModel: 'lite', handsEnabled: true, minCutoff: 1.2, beta: 0.015 };
  inferenceMs = 0;
  detectFps = 0;

  private refs = 0;
  private stream: MediaStream | null = null;
  private pose: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private loadedPoseModel = '';
  private listeners = new Set<Listener>();
  private lastVideoTime = -1;
  private rawPose: RawLm[] | null = null;
  private rawHands: { lm: RawLm[]; score: number; label: string }[] = [];
  private lastPoseSeen = 0;
  private filters = new FilterBank();
  private handLastSeen: Record<Side, number> = { left: 0, right: 0 };
  private frameCount = 0;
  private fpsT0 = 0;
  private cached: BodyFrame | null = null;

  // simulation
  simulate = false;
  simAction: SimAction = 'idle';
  private simActionStart = 0;

  private constructor() {
    this.video = typeof document !== 'undefined' ? document.createElement('video') : ({} as HTMLVideoElement);
    if (typeof document !== 'undefined') {
      this.video.playsInline = true; this.video.muted = true; this.video.autoplay = true;
      this.video.className = 'tracker-video';
    }
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit() { for (const l of this.listeners) l(); }
  private setStatus(s: TrackingStatus, err = '') {
    if (this.status === s && this.error === err) return;
    this.status = s; this.error = err; this.emit();
  }

  get cameraActive() { return !!this.stream; }

  setSimAction(a: SimAction) { this.simAction = a; this.simActionStart = performance.now(); }

  updateSettings(p: Partial<TrackerSettings>) {
    const needRestart = (p.deviceId !== undefined && p.deviceId !== this.settings.deviceId);
    const needModel = (p.poseModel !== undefined && p.poseModel !== this.settings.poseModel);
    Object.assign(this.settings, p);
    this.filters.minCutoff = this.settings.minCutoff; this.filters.beta = this.settings.beta;
    if (this.stream && needRestart) void this.startCamera();
    if (this.pose && needModel) void this.loadModels();
    this.emit();
  }

  async acquire(): Promise<void> {
    this.refs++;
    if (this.refs > 1 && (this.stream || this.status === 'loading')) return;
    await this.start();
  }

  release() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0) this.stopCamera();
  }

  async retry() { this.stopCamera(); await this.start(); }

  private setStage(s: string) { this.stage = s; console.info(`[tracker] ${s}`); this.emit(); }

  private async start() {
    this.setStatus('loading');
    this.setStage('Requesting camera…');
    // Camera and models load independently, so the video shows as soon as the camera is ready.
    const cam = this.startCamera().then(() => { if (this.stream && !this.pose) this.setStage('Camera ready — loading tracking models…'); });
    const models = this.loadModels();
    try {
      await Promise.all([cam, models]);
      if (this.stream) { this.setStage(''); this.setStatus('searching'); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[tracker]', e);
      if (this.status !== 'denied' && this.status !== 'no-camera') this.setStatus('error', msg);
    }
  }

  private async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { this.setStatus('no-camera', 'This browser does not support camera access (needs HTTPS or localhost).'); throw new Error('no mediaDevices'); }
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      const req = navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: this.settings.deviceId ? { exact: this.settings.deviceId } : undefined,
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        },
        audio: false,
      });
      const slow = setTimeout(() => this.setStage('Still waiting for the camera — accept the browser permission prompt. On macOS also check System Settings › Privacy & Security › Camera for your browser.'), 6000);
      try { this.stream = await req; } finally { clearTimeout(slow); }
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.stream = null;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setStatus('denied', 'Camera permission was denied. Allow camera access in your browser\'s site settings, then retry.');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.setStatus('no-camera', 'No camera was found (or the selected camera is unavailable).');
      else this.setStatus('error', `Camera failed: ${(e as Error)?.message ?? name}`);
      throw e;
    }
    if (this.refs === 0) { this.stopCamera(); return; } // released while we waited for permission
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);
    this.emit();
  }

  private stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.rawPose = null; this.rawHands = []; this.cached = null;
    this.filters.reset();
    this.setStatus('idle');
  }

  private async loadModels() {
    const posKey = this.settings.poseModel === 'full' ? 'pose_full' : 'pose_lite';
    if (this.pose && this.loadedPoseModel === posKey && (this.hands || !this.settings.handsEnabled)) return;
    const T = 45000;
    const hint = 'Check your internet connection, or run "npm run fetch-models" once and restart the dev server to load models locally.';
    const wasmLocal = await localAvailable('/mediapipe-wasm/vision_wasm_internal.js');
    const wasmBase = wasmLocal ? '/mediapipe-wasm' : CDN_WASM;
    this.setStage(`Loading MediaPipe runtime (${wasmLocal ? 'local' : 'jsDelivr CDN'})…`);
    const vision = await withTimeout(FilesetResolver.forVisionTasks(wasmBase), T, `Timed out loading the MediaPipe runtime from ${wasmBase}. ${hint}`);
    const model = async (k: string) => (await localAvailable(LOCAL_MODELS[k])) ? LOCAL_MODELS[k] : CDN_MODELS[k];
    const make = async <T>(name: string, url: string, fn: (delegate: 'GPU' | 'CPU') => Promise<T>) => {
      this.setStage(`Loading ${name} (${url.startsWith('/') ? 'local' : 'Google CDN'}, GPU)…`);
      try { return await withTimeout(fn('GPU'), T, 'gpu-timeout'); } catch (e) {
        console.warn(`[tracker] ${name} GPU init failed, retrying on CPU`, e);
        this.setStage(`Loading ${name} (CPU fallback)…`);
        return await withTimeout(fn('CPU'), T, `Timed out loading ${name} from ${url}. ${hint}`);
      }
    };
    const poseUrl = await model(posKey);
    const handUrl = await model('hand');
    this.pose?.close();
    this.pose = await make('pose model', poseUrl, (delegate) => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: poseUrl, delegate }, runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    }));
    this.loadedPoseModel = posKey;
    if (!this.hands) {
      this.hands = await make('hand model', handUrl, (delegate) => HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: handUrl, delegate }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      }));
    }
  }

  /** Run detection on the newest video frame (if any) and return a smoothed frame in stage space. */
  process(now: number, W: number, H: number): BodyFrame | null {
    if (this.simulate && (!this.stream || !this.pose)) return this.buildSimFrame(now, W, H);
    const v = this.video;
    if (!this.stream || !this.pose || v.readyState < 2 || !v.videoWidth) return this.cached;
    if (v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const t0 = performance.now();
      try {
        const pr = this.pose.detectForVideo(v, now);
        this.rawPose = pr.landmarks?.[0] ?? null;
        if (this.hands && this.settings.handsEnabled) {
          const hr = this.hands.detectForVideo(v, now) as any;
          const hd = hr.handedness ?? hr.handednesses ?? [];
          this.rawHands = (hr.landmarks ?? []).map((lm: RawLm[], i: number) => ({ lm, score: hd[i]?.[0]?.score ?? 0, label: hd[i]?.[0]?.categoryName ?? '' }));
        } else this.rawHands = [];
      } catch (e) {
        this.setStatus('error', `Tracking failed: ${(e as Error).message}`);
        return this.cached;
      }
      this.inferenceMs = this.inferenceMs * 0.9 + (performance.now() - t0) * 0.1;
      this.frameCount++;
      if (now - this.fpsT0 > 1000) { this.detectFps = this.frameCount * 1000 / (now - this.fpsT0); this.frameCount = 0; this.fpsT0 = now; }
      if (this.rawPose) { this.lastPoseSeen = now; if (this.status !== 'tracking') this.setStatus('tracking'); }
      else if (this.status === 'tracking' && now - this.lastPoseSeen > 600) { this.setStatus('lost'); this.filters.resetPrefix('p.'); }
      const map: CoverMap = { W, H, vw: v.videoWidth, vh: v.videoHeight, mirror: this.settings.mirror };
      this.cached = this.build(now, map, this.rawPose, this.rawHands.map((h) => ({ ...h, side: null as Side | null })), false);
    }
    return this.cached;
  }

  private buildSimFrame(now: number, W: number, H: number): BodyFrame {
    const sim = simulatePose(now, this.simAction, now - this.simActionStart);
    const map: CoverMap = { W, H, vw: 1280, vh: 720, mirror: true };
    return this.build(now, map, sim.pose, sim.hands.map((h) => ({ lm: h.lm, score: 1, label: '', side: h.side })), true);
  }

  private build(now: number, map: CoverMap, pose: RawLm[] | null, hands: { lm: RawLm[]; score: number; label: string; side: Side | null }[], simulated: boolean): BodyFrame {
    const joints = emptyJoints();
    const fb = this.filters;
    if (pose) {
      for (const j of JOINTS) {
        const r = pose[POSE_INDEX[j]];
        const m = mapPoint(map, r.x, r.y, r.z);
        joints[j] = { x: fb.f(`p.${j}.x`, m.x, now), y: fb.f(`p.${j}.y`, m.y, now), z: fb.f(`p.${j}.z`, m.z, now), v: r.visibility ?? 1 };
      }
    }
    // assign detected hands to anatomical sides
    const assigned: Partial<Record<Side, HandState>> = {};
    const used = new Set<Side>();
    const sorted = [...hands].sort((a, b) => b.score - a.score);
    for (const h of sorted) {
      let side: Side | null = h.side;
      if (!side && pose) {
        const w = h.lm[0];
        const dl = dist2(w, pose[POSE_INDEX.lWrist]), dr = dist2(w, pose[POSE_INDEX.rWrist]);
        side = dl < dr ? 'left' : 'right';
      }
      if (!side) side = h.label === 'Left' ? 'right' : 'left'; // MediaPipe labels assume a mirrored image
      if (used.has(side)) side = side === 'left' ? 'right' : 'left';
      if (used.has(side)) continue;
      used.add(side);
      if (now - this.handLastSeen[side] > 300) fb.resetPrefix(`h.${side}.`);
      this.handLastSeen[side] = now;
      const lm = h.lm.map((r, i) => {
        const m = mapPoint(map, r.x, r.y, r.z);
        return { x: fb.f(`h.${side}.${i}.x`, m.x, now), y: fb.f(`h.${side}.${i}.y`, m.y, now), z: m.z, v: 1 };
      });
      const palm = { x: (lm[0].x + lm[5].x + lm[9].x + lm[17].x) / 4, y: (lm[0].y + lm[5].y + lm[9].y + lm[17].y) / 4, z: 0, v: 1 };
      assigned[side] = { side, lm, score: h.score, palm, palmFacing: palmFacing(h.lm, side), size: dist2(lm[0], lm[9]) };
    }
    const sw = pose ? dist2(joints.lShoulder, joints.rShoulder) : 0;
    return { t: now, hasPose: !!pose, joints, hands: assigned, shoulderWidth: sw, simulated };
  }

  /** Raw (unsmoothed) hand landmarks for diagnostics. */
  get rawHandCount() { return this.rawHands.length; }
}
