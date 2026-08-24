import type { MobilityItem } from '../types.js';

/**
 * FR-4.1: dynamic only. Static stretching before a run reduces tendon
 * stiffness — exactly the property that protects a beginner's legs.
 */
export const WARMUP: MobilityItem[] = [
  { id: 'wu-brisk-walk', name: 'Brisk walk', amount: 180, unit: 'seconds', perSide: false, cue: 'Purposeful pace. You should feel warmer by the end.' },
  { id: 'wu-ankle-circles', name: 'Ankle circles', amount: 10, unit: 'reps', perSide: true, cue: 'Slow, full circles each direction.' },
  { id: 'wu-leg-swings', name: 'Leg swings, front to back', amount: 12, unit: 'reps', perSide: true, cue: 'Hold something. Relaxed leg, no forcing the range.' },
  { id: 'wu-lateral-swings', name: 'Leg swings, side to side', amount: 10, unit: 'reps', perSide: true, cue: 'Keep hips square and facing forward.' },
  { id: 'wu-calf-raises', name: 'Calf raises', amount: 15, unit: 'reps', perSide: false, cue: 'Up smoothly, down under control. Wakes the Achilles up.' },
  { id: 'wu-walking-lunges', name: 'Walking lunges', amount: 8, unit: 'reps', perSide: true, cue: 'Front knee tracks over the middle of the foot.' },
  { id: 'wu-skips', name: 'Easy skips', amount: 20, unit: 'reps', perSide: false, cue: 'Light and springy — this is a rehearsal, not a workout.' },
];

/** FR-4.4: static holds belong here, after the run, with per-hold timers. */
export const COOLDOWN: MobilityItem[] = [
  { id: 'cd-walk', name: 'Easy walk', amount: 180, unit: 'seconds', perSide: false, cue: 'Let your breathing settle before you stop moving.' },
  { id: 'cd-calf-wall', name: 'Calf stretch at a wall', amount: 30, unit: 'seconds', perSide: true, cue: 'Back leg straight, heel down. Then repeat with the knee softly bent.' },
  { id: 'cd-quad', name: 'Standing quad stretch', amount: 30, unit: 'seconds', perSide: true, cue: 'Knees together, hips forward, no arching the back.' },
  { id: 'cd-hamstring', name: 'Hamstring stretch', amount: 30, unit: 'seconds', perSide: true, cue: 'Heel down, toes up, hinge from the hips with a flat back.' },
  { id: 'cd-hip-flexor', name: 'Kneeling hip flexor stretch', amount: 30, unit: 'seconds', perSide: true, cue: 'Squeeze the back glute and the stretch appears at the front of the hip.' },
  { id: 'cd-glute', name: 'Figure-four glute stretch', amount: 30, unit: 'seconds', perSide: true, cue: 'Sit or lie down. Ankle across the opposite knee, draw the leg in.' },
];

/** FR-4.3: form cues, shown once per session so they teach rather than nag. */
export const RUN_CUES = [
  { title: 'Short, quick steps', body: 'Aim for 170–180 steps a minute. Quick and light beats long and heavy — it cuts the impact through your shins and knees.' },
  { title: 'Conversation pace', body: 'You should be able to speak a full sentence. If you cannot, you are running too fast for this plan, regardless of how the pace feels.' },
  { title: 'Land under your hip', body: 'Let your foot land beneath you, not out in front. Reaching ahead brakes you and loads the shin.' },
  { title: 'Pick your surface', body: 'Even, forgiving ground is kinder than concrete. Avoid the same camber every run — alternate direction on cambered roads.' },
];

/** SR-2: stop rules, reachable at any moment during a session. */
export const STOP_RULES = {
  stop: [
    'Sharp or pinpoint pain',
    'Pain that makes you limp or change how you move',
    'Swelling in a joint or along a bone',
  ],
  normal: [
    'Dull, general ache spread over a muscle',
    'Heavy legs and breathlessness that settle when you walk',
    'Mild soreness for a day or two afterwards',
  ],
};
