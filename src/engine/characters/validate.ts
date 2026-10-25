import { ALL_COMPONENTS, POWER_KINDS, type CharacterDef, type SequenceStep, type ComponentId } from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateSequence(steps: SequenceStep[], components: ComponentId[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const s of steps) {
    if (ids.has(s.id)) errs.push(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (!(s.duration > 0)) errs.push(`step ${s.id}: duration must be > 0`);
    if (!(s.start >= 0)) errs.push(`step ${s.id}: start must be >= 0`);
    for (const c of s.components) if (!components.includes(c)) errs.push(`step ${s.id}: unknown component ${c}`);
  }
  return errs;
}

export function validateCharacter(c: CharacterDef): string[] {
  const errs: string[] = [];
  if (!c.id) errs.push('missing id');
  for (const [k, v] of Object.entries(c.palette)) if (!HEX.test(v)) errs.push(`palette.${k} is not a #rrggbb colour`);
  for (const comp of c.components) if (!ALL_COMPONENTS.includes(comp)) errs.push(`unknown component ${comp}`);
  const pids = new Set<string>();
  for (const p of c.powers) {
    if (pids.has(p.id)) errs.push(`duplicate power ${p.id}`);
    pids.add(p.id);
    if (!POWER_KINDS.includes(p.kind)) errs.push(`power ${p.id}: unknown kind ${p.kind}`);
    if (!HEX.test(p.tuning.color)) errs.push(`power ${p.id}: bad color`);
    if (p.tuning.cooldownMs < 0) errs.push(`power ${p.id}: negative cooldown`);
  }
  errs.push(...validateSequence(c.sequence, c.components));
  const covered = new Set(c.sequence.flatMap((s) => s.components));
  for (const comp of c.components) if (!covered.has(comp)) errs.push(`component ${comp} never materializes in the sequence`);
  return errs;
}
