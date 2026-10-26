import * as THREE from 'three';
import { Stage } from './rendering/Stage';
import { Particles } from './rendering/Particles';
import { ArmorRig } from './rendering/ArmorRig';
import { ModelRig } from './rendering/ModelRig';
import { World, type WorldPreset } from './world/World';
import { Tracker } from './tracking/Tracker';
import { GestureEngine, type GestureEvent, type GestureSnapshot } from './gestures/GestureEngine';
import { Sequencer, type StepStatus, type SeqState } from './transformations/Sequencer';
import { createController } from './powers/controllers';
import type { PowerController } from './powers/types';
import type { CharacterDef, ComponentId, MaterializeEffect, PowerTuning, SequenceStep } from './characters/types';
import type { BodyFrame, TrackingStatus } from './tracking/types';
import { coverParams } from './tracking/mapping';
import type { SimAction } from './tracking/simulated';

export interface ExperienceOptions {
  camera: boolean;          // acquire the shared webcam tracker
  simulateWhenNoCamera: boolean;
  preset: WorldPreset;
  tuning: (charId: string, powerId: string) => PowerTuning;
  onPowerFired?: (powerId: string) => void;
  onTargetDestroyed?: () => void;
  onTransformComplete?: () => void;
}

export interface ExperienceSnapshot {
  fps: number; renderMs: number; inferenceMs: number; detectFps: number;
  status: TrackingStatus; error: string; simulated: boolean; cameraActive: boolean;
  hasPose: boolean; handsSeen: { left: boolean; right: boolean }; fullBody: boolean;
  gestures: GestureSnapshot;
  seq: { state: SeqState; progress: number; current: string | null; steps: { id: string; label: string; status: StepStatus; progress: number }[] };
  components: Partial<Record<ComponentId, number>>;
  cooldowns: Record<string, number>;
  powerStatus: string;
  events: string[];
  recording: boolean; recordingMs: number;
  targets: { total: number; destroyed: number };
  model: { status: 'procedural' | 'loading' | 'model'; missing: string[] };
}

const BONES: [string, string][] = [['lShoulder', 'rShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'], ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'], ['lShoulder', 'lHip'], ['rShoulder', 'rHip'], ['lHip', 'rHip'], ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle']];
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

export class Experience {
  readonly stage: Stage;
  readonly particles = new Particles(5000);
  readonly world: World;
  readonly gestures = new GestureEngine();
  readonly seq = new Sequencer();
  readonly tracker = Tracker.instance;
  private rig: ArmorRig | null = null;
  private model: ModelRig | null = null;
  modelStatus: 'procedural' | 'loading' | 'model' = 'procedural';
  modelMissing: string[] = [];
  private controller: PowerController | null = null;
  def: CharacterDef | null = null;
  private steps: SequenceStep[] = [];
  private effects = new Map<ComponentId, MaterializeEffect>();
  private raf = 0;
  private last = 0;
  private lastFrameT = -1;
  private frame: BodyFrame | null = null;
  private fps = 0; private fpsAcc = 0; private fpsN = 0; private renderMs = 0;
  private events: string[] = [];
  private listeners = new Set<(s: ExperienceSnapshot) => void>();
  private snapAcc = 0;
  private skeleton: THREE.LineSegments;
  private skelPos = new Float32Array((BONES.length + HAND_BONES.length * 2) * 6);
  showSkeleton = false;
  aimAssist = 0.5;
  autoTransformOnPalms = true;
  grade = 'none';
  letterbox = false;
  private acquired = false;
  private disposed = false;
  private handsSeen = { left: false, right: false };
  // capture
  private composite: HTMLCanvasElement | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private recStart = 0;
  private shotResolve: ((b: Blob | null) => void) | null = null;

  constructor(readonly container: HTMLElement, readonly opts: ExperienceOptions) {
    container.classList.add('experience');
    if (opts.camera) container.appendChild(this.tracker.video);
    this.stage = new Stage(container);
    this.world = new World(this.particles);
    this.world.preset = opts.preset;
    this.stage.root.add(this.world.group, this.particles.points);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.skelPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skeleton = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#33ffcc', transparent: true, opacity: 0.85, depthTest: false }));
    this.skeleton.renderOrder = 50; this.skeleton.frustumCulled = false;
    this.stage.root.add(this.skeleton);
    this.world.onDestroyed = () => { this.log('Target destroyed'); opts.onTargetDestroyed?.(); };
    this.tracker.simulate = opts.simulateWhenNoCamera;
    if (opts.camera) { this.acquired = true; void this.tracker.acquire(); }
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- character & transformation */
  setCharacter(def: CharacterDef, steps: SequenceStep[], keepSuit = true) {
    const wasComplete = this.seq.state === 'complete';
    this.controller?.dispose();
    this.rig?.dispose();
    this.model?.dispose(); this.model = null;
    this.def = def;
    this.rig = new ArmorRig(def, this.particles);
    this.stage.root.add(this.rig.group);
    this.loadModel(def);
    this.setSequence(steps);
    if (keepSuit && wasComplete) this.seq.complete();
    const self = this;
    this.controller = createController({
      def, stage: this.stage, world: this.world, particles: this.particles, rig: this.rig,
      tuning: (pid) => this.opts.tuning(def.id, pid),
      fired: (pid) => { const p = def.powers.find((x) => x.id === pid); this.log(`${p?.name ?? pid} fired`); this.opts.onPowerFired?.(pid); },
      suitReady: () => this.suitReady,
      get aimAssist() { return self.aimAssist; },
    });
  }

  /** Use public/assets/models/<characterId>.glb or .fbx (Mixamo) when present; paint with character palette. */
  private async loadModel(def: CharacterDef) {
    this.modelStatus = 'loading'; this.modelMissing = [];
    const candidates = def.modelUrl
      ? [def.modelUrl]
      : [`/assets/models/${def.id}.glb`, `/assets/models/${def.id}.fbx`];
    let m: ModelRig | null = null;
    for (const url of candidates) {
      m = await ModelRig.load(url, this.particles);
      if (m) break;
    }
    if (this.disposed || this.def !== def) { m?.dispose(); return; }
    if (!m) { this.modelStatus = 'procedural'; return; }
    this.model = m; this.modelMissing = m.missing;
    m.setEnergyColor(def.palette.energy);
    // Recolor Mixamo / generic mesh to this character (Iron Man red-gold, etc.)
    m.applyPalette(def.palette, def.surface);
    this.stage.root.add(m.root);
    if (this.rig) this.rig.proceduralHidden = true;
    this.modelStatus = 'model';
    this.log(`Loaded 3D model for ${def.name} (${def.palette.primary})`);
  }

  setSequence(steps: SequenceStep[]) {
    if (!this.def) return;
    this.steps = steps;
    const state = this.seq.state;
    this.seq.load(steps, this.def.components);
    this.effects.clear();
    for (const s of steps) for (const c of s.components) this.effects.set(c, s.effect);
    if (state === 'complete') this.seq.complete();
  }

  get suitReady() {
    if (this.seq.state === 'complete') return true;
    const p = this.seq.componentProgress();
    return (p.get('lHand') ?? 0) >= 1 && (p.get('rHand') ?? 0) >= 1 && this.seq.state !== 'idle';
  }

  startTransformation() { this.seq.restart(); this.log(`${this.def?.name} transformation started`); }
  completeTransformation() { this.seq.complete(); }
  removeSuit() { this.seq.reset(); this.log('Suit removed'); }

  perform(a: SimAction) { this.tracker.setSimAction(a); }

  /* ---------------- events */
  subscribe(l: (s: ExperienceSnapshot) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private log(msg: string) { this.events.unshift(`${new Date().toLocaleTimeString()}  ${msg}`); this.events.length = Math.min(this.events.length, 8); }

  private handleGesture(e: GestureEvent, f: BodyFrame) {
    if (e.type === 'start') this.log(`Gesture: ${e.gesture}${e.side ? ` (${e.side})` : ''}`);
    if (e.gesture === 'bothPalms' && e.type === 'start' && this.autoTransformOnPalms && this.seq.state === 'idle') this.startTransformation();
    this.controller?.onGesture(e, f);
  }

  /* ---------------- main loop */
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const t0 = performance.now();
    const { W, H } = this.stage;
    if (this.world.W !== W || this.world.H !== H) this.world.resize(W, H);

    const f = this.tracker.process(now, W, H);
    this.frame = f;
    if (f && f.t !== this.lastFrameT) {
      this.lastFrameT = f.t;
      if (f.hands.left) this.handsSeen.left = true;
      if (f.hands.right) this.handsSeen.right = true;
      for (const e of this.gestures.update(f)) this.handleGesture(e, f);
    }
    if (this.tracker.status === 'lost') for (const e of this.gestures.reset(now)) if (f) this.controller?.onGesture(e, f);

    const prevState = this.seq.state;
    this.seq.tick(dt * 1000);
    if (prevState === 'running' && this.seq.state === 'complete') { this.log('Transformation complete'); this.opts.onTransformComplete?.(); }
    this.rig?.update(f && (f.simulated || this.tracker.status === 'tracking') ? f : null, this.seq.componentProgress(), this.effects, now / 1000, dt);
    if (this.model) {
      this.model.progress = this.seq.state === 'complete' ? 1 : this.seq.state === 'idle' ? 0 : this.seq.progress;
      this.model.update(f && (f.simulated || this.tracker.status === 'tracking') ? f : null, this.tracker.settings.mirror, now / 1000);
    }
    this.controller?.update(dt, f, now / 1000);
    this.world.update(dt);
    this.particles.update(dt);
    this.updateSkeleton(f);
    this.stage.render(dt);
    this.captureFrame();
    this.renderMs = this.renderMs * 0.9 + (performance.now() - t0) * 0.1;

    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.snapAcc += dt;
    if (this.snapAcc > 0.15) { this.snapAcc = 0; const s = this.snapshot(); this.listeners.forEach((l) => l(s)); }
  };

  private updateSkeleton(f: BodyFrame | null) {
    this.skeleton.visible = this.showSkeleton && !!f?.hasPose;
    if (!this.skeleton.visible || !f) return;
    let i = 0;
    const put = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      this.skelPos.set([a.x, a.y, 900, b.x, b.y, 900], i); i += 6;
    };
    for (const [a, b] of BONES) put((f.joints as any)[a], (f.joints as any)[b]);
    for (const side of ['left', 'right'] as const) {
      const h = f.hands[side];
      for (const [a, b] of HAND_BONES) h ? put(h.lm[a], h.lm[b]) : put({ x: 0, y: 0 }, { x: 0, y: 0 });
    }
    (this.skeleton.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  snapshot(): ExperienceSnapshot {
    const now = performance.now();
    const f = this.frame;
    const comps: Partial<Record<ComponentId, number>> = {};
    for (const [k, v] of this.seq.componentProgress()) comps[k] = v;
    const j = f?.joints;
    const fullBody = !!(f?.hasPose && j && ['nose', 'lShoulder', 'rShoulder', 'lHip', 'rHip', 'lAnkle', 'rAnkle'].every((k) => (j as any)[k].v > 0.5));
    return {
      fps: this.fps, renderMs: this.renderMs, inferenceMs: this.tracker.inferenceMs, detectFps: this.tracker.detectFps,
      status: this.tracker.status, error: this.tracker.error, simulated: !!f?.simulated, cameraActive: this.tracker.cameraActive,
      hasPose: !!f?.hasPose, handsSeen: { left: !!f?.hands.left, right: !!f?.hands.right }, fullBody,
      gestures: structuredClone(this.gestures.snapshot),
      seq: {
        state: this.seq.state, progress: this.seq.progress, current: this.seq.currentStep()?.label ?? null,
        steps: this.steps.map((s) => ({ id: s.id, label: s.label, status: this.seq.stepStatus(s), progress: this.seq.stepProgress(s) })),
      },
      components: comps,
      cooldowns: this.controller?.cooldowns(now) ?? {},
      powerStatus: this.suitReady ? (this.controller?.status() ?? '') : 'Suit offline — transform to unlock powers',
      events: [...this.events],
      recording: !!this.recorder, recordingMs: this.recorder ? now - this.recStart : 0,
      model: { status: this.modelStatus, missing: this.modelMissing },
      targets: { total: this.world.targets.length, destroyed: this.world.targets.filter((t) => t.state === 'DESTROYED').length },
    };
  }

  /* ---------------- capture: composite video + 3D layer */
  private drawComposite() {
    const { W, H } = this.stage;
    const pr = Math.min(2, window.devicePixelRatio);
    if (!this.composite) this.composite = document.createElement('canvas');
    const c = this.composite;
    if (c.width !== Math.round(W * pr)) { c.width = Math.round(W * pr); c.height = Math.round(H * pr); }
    const g = c.getContext('2d')!;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, c.width, c.height);
    const v = this.tracker.video;
    if (this.tracker.cameraActive && v.videoWidth) {
      const cp = coverParams({ W, H, vw: v.videoWidth, vh: v.videoHeight, mirror: this.tracker.settings.mirror });
      g.save();
      g.filter = gradeFilter(this.grade);
      if (this.tracker.settings.mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
      g.drawImage(v, cp.ox * pr, cp.oy * pr, cp.dw * pr, cp.dh * pr);
      g.restore();
    }
    g.drawImage(this.stage.renderer.domElement, 0, 0, c.width, c.height);
    if (this.letterbox) { g.fillStyle = '#000'; const bh = c.height * 0.1; g.fillRect(0, 0, c.width, bh); g.fillRect(0, c.height - bh, c.width, bh); }
  }

  private captureFrame() {
    if (!this.recorder && !this.shotResolve) return;
    this.drawComposite();
    if (this.shotResolve) { const r = this.shotResolve; this.shotResolve = null; this.composite!.toBlob((b) => r(b), 'image/png'); }
  }

  screenshot(): Promise<Blob | null> { return new Promise((res) => { this.shotResolve = res; }); }

  get canRecord() { return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream; }

  startRecording(): boolean {
    if (this.recorder || !this.canRecord) return false;
    this.drawComposite();
    const stream = this.composite!.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    this.recChunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.recChunks.push(e.data); };
    this.recorder.start(250);
    this.recStart = performance.now();
    return true;
  }

  stopRecording(): Promise<{ blob: Blob; ms: number } | null> {
    const r = this.recorder;
    if (!r) return Promise.resolve(null);
    const ms = performance.now() - this.recStart;
    return new Promise((res) => {
      r.onstop = () => { this.recorder = null; res({ blob: new Blob(this.recChunks, { type: r.mimeType || 'video/webm' }), ms }); };
      r.stop();
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.recorder) { try { this.recorder.stop(); } catch { /* ignore */ } this.recorder = null; }
    this.controller?.dispose(); this.rig?.dispose(); this.model?.dispose(); this.world.dispose();
    this.stage.dispose();
    if (this.acquired) { this.tracker.release(); this.acquired = false; }
    if (this.tracker.video.parentElement === this.container) this.tracker.video.remove();
    this.tracker.setSimAction('idle');
  }
}

export function gradeFilter(g: string) {
  switch (g) {
    case 'cinematic': return 'contrast(1.15) saturate(0.85) brightness(0.9) sepia(0.12)';
    case 'noir': return 'grayscale(1) contrast(1.3) brightness(0.85)';
    case 'heat': return 'saturate(1.4) hue-rotate(-12deg) contrast(1.1)';
    default: return 'none';
  }
}
