/**
 * AI motion graphics and transitions. Claude writes a small declarative "scene" (shapes, text, lines with keyframes and
 * easing) that the editor's own canvas renderer draws live, so it previews instantly, exports with the video and can be
 * edited again. The scene format is documented to the model in SYSTEM below and validated here with zod.
 */
import { z } from 'zod';
import { generateJSON, aiProvider } from './ai.js';
import { claudeStatus, runClaudeJson } from './claudeCli.js';
import { HttpError } from './errors.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const num = z.number().finite();
const key = <T extends z.ZodType>(v: T) => z.object({ t: num.min(0).max(60), v, ease: z.string().max(60).optional() });
/** A number or colour, or keyframes of it. */
const prop = <T extends z.ZodType>(v: T) => z.union([v, z.object({ keys: z.array(key(v)).min(1).max(40) })]);
const nProp = prop(num);
const cProp = prop(z.string().max(80));

const nodeBase = {
  name: z.string().max(60).optional(),
  start: num.min(0).max(60).optional(), end: num.min(0).max(60).optional(),
  x: nProp.optional(), y: nProp.optional(), w: nProp.optional(), h: nProp.optional(),
  ax: num.min(0).max(1).optional(), ay: num.min(0).max(1).optional(),
  rotation: nProp.optional(), scale: nProp.optional(), scaleX: nProp.optional(), scaleY: nProp.optional(),
  opacity: nProp.optional(), radius: nProp.optional(),
  fill: cProp.optional(),
  gradient: z.object({ angle: num, stops: z.array(z.object({ p: num.min(0).max(1), c: z.string().max(80) })).min(2).max(8) }).optional(),
  stroke: z.string().max(80).optional(), strokeWidth: nProp.optional(),
  blur: nProp.optional(),
  shadow: z.object({ color: z.string().max(80), blur: num.min(0).max(200), x: num.optional(), y: num.optional() }).optional(),
  blend: z.enum(['normal', 'screen', 'multiply', 'overlay', 'lighter', 'difference', 'soft-light']).optional(),
  x2: nProp.optional(), y2: nProp.optional(), trim: nProp.optional(), cap: z.enum(['round', 'butt']).optional(),
  text: z.string().max(240).optional(), size: nProp.optional(), font: z.string().max(60).optional(),
  weight: num.min(100).max(900).optional(), letterSpacing: num.min(-20).max(80).optional(),
  align: z.enum(['left', 'center', 'right']).optional(), italic: z.boolean().optional(), reveal: nProp.optional(),
  clip: z.boolean().optional(),
};
type Node = z.infer<z.ZodObject<typeof nodeBase>> & { type: 'rect' | 'ellipse' | 'line' | 'text' | 'group'; children?: Node[] };
const node: z.ZodType<Node> = z.lazy(() => z.object({ type: z.enum(['rect', 'ellipse', 'line', 'text', 'group']), ...nodeBase, children: z.array(node).max(60).optional() }));

export const motionScene = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(60),
  duration: num.min(0.2).max(30),
  role: z.enum(['graphic', 'transition', 'background']),
  bg: z.string().max(80).nullable().optional(),
  frame: z.object({ w: num, h: num }).optional(),
  layers: z.array(node).min(1).max(60),
});
export type MotionScene = z.infer<typeof motionScene>;

/** A loose JSON Schema for the structured-output call: the deep checks are done with zod afterwards. */
const LOOSE_SCHEMA = {
  type: 'object',
  properties: {
    v: { type: 'integer', enum: [1] },
    name: { type: 'string' },
    duration: { type: 'number' },
    role: { type: 'string', enum: ['graphic', 'transition', 'background'] },
    bg: { type: ['string', 'null'] },
    layers: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  required: ['v', 'name', 'duration', 'role', 'layers'],
  additionalProperties: false,
} as const;

function countNodes(ns: Node[]): number { return ns.reduce((n, x) => n + 1 + countNodes(x.children ?? []), 0); }

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM = `You are a motion designer for a video editor. You answer ONLY with one scene object that the editor's canvas renderer draws. You never explain.

SCENE: { "v": 1, "name": string, "duration": seconds, "role": "graphic" | "transition" | "background", "bg"?: css colour or null, "layers": Node[] }
Layers are drawn bottom to top over the video. Leave "bg" empty so the video shows through, except for backgrounds.

COORDINATES: design units. The frame is 1080 wide and FRAME_H tall (given in the request). Origin is the top-left; x grows right, y grows down.
A node is placed by its anchor point (x, y). Its box (w, h) is positioned around that point by "ax", "ay" (0..1, default 0.5 = centred; ax 0, ay 0 = (x, y) is the top-left corner; ax 0 makes a bar that grows rightwards when w animates).

NODE types:
- "rect": x,y,w,h,ax,ay,radius,fill|gradient,stroke,strokeWidth
- "ellipse": x,y,w,h,fill|gradient,stroke,strokeWidth
- "line": from (x,y) to (x2,y2); "trim" 0..1 draws it on; stroke or fill is the colour; strokeWidth; cap "round"|"butt"
- "text": text (use \\n for lines), x,y (the centre of the text for align "center"), size (px), weight (100-900), font (optional), letterSpacing, align, italic, fill, stroke, strokeWidth, "reveal" 0..1 types the text on
- "group": children (positions are relative to the group's x,y), optional clip:true with w,h to clip children to the box; transforms apply to all children
Common props on every node: start, end (seconds; default whole scene), rotation (degrees), scale, scaleX, scaleY, opacity (0..1), blur (px), shadow {color,blur,x,y}, blend ("normal"|"screen"|"multiply"|"overlay"|"lighter"|"difference"|"soft-light").

ANIMATION: any number or colour prop can be { "keys": [ { "t": seconds, "v": value, "ease"?: name } ] }. "t" is seconds from the start of the scene. Between keys the value interpolates with the ease of the key it starts from. Colours (hex or rgba strings) interpolate too.
Ease names: linear, in, out, inOut, inCubic, outCubic, inOutCubic, inExpo, outExpo, inOutExpo, outBack, inBack, outElastic, outBounce, spring, hold, or "bezier(x1,y1,x2,y2)".

DESIGN RULES
- Entrances ease OUT (outExpo, outCubic, outBack), exits ease IN. Typical moves take 0.3-0.8 s. Stagger related shapes by 0.05-0.15 s. Always animate in AND out unless it is a background that loops.
- Keep text inside the frame with at least 60 units of margin; text size 28-160. Use a readable contrast against video (dark plate or shadow behind light text).
- A "transition" covers the frame completely at its midpoint (duration 0.5-1.4 s): shapes sweep in, cover everything, then sweep away. Use full-frame rects/ellipses sized from the frame (e.g. w = 1080*1.2, h = FRAME_H).
- A "background" fills the frame, has a dark or coloured "bg", and keeps moving smoothly for its whole duration (it should loop: first and last keys equal).
- Use the palette colours if given. Prefer few, well-timed shapes over many. At most 40 nodes.
- "duration" must cover the last key time.`;

interface MotionRequest {
  prompt: string;
  role: 'graphic' | 'transition' | 'background';
  duration?: number;
  frame: { w: number; h: number };
  palette?: string[];
  fonts?: { english?: string; sinhala?: string };
  base?: unknown;
}

function userPrompt(r: MotionRequest, errors?: string): string {
  const lines = [
    `Create a ${r.role} scene.`,
    `Request: ${r.prompt}`,
    `FRAME_H = ${Math.round(r.frame.h)} (the frame is ${r.frame.w} x ${Math.round(r.frame.h)} design units).`,
    r.duration ? `Target duration: about ${r.duration} seconds.` : '',
    r.palette?.length ? `Palette: ${r.palette.join(', ')}.` : '',
    r.fonts?.english ? `Default font id for text: ${r.fonts.english} (omit "font" to use it).` : '',
    r.base ? `Edit this existing scene instead of starting over, keep what the request does not mention:\n${JSON.stringify(r.base)}` : '',
    errors ? `Your previous answer was rejected: ${errors}\nFix it and answer again.` : '',
    'Reply with the scene only.',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface MotionResult { scene: MotionScene; via: 'claude-cli' | 'claude' | 'gemini'; costUsd: number | null; ms: number }

export async function generateMotion(req: MotionRequest, signal?: AbortSignal): Promise<MotionResult> {
  const cli = await claudeStatus();
  const useCli = cli.found && cli.loggedIn;
  if (!useCli && !aiProvider()) {
    throw new HttpError(503, cli.found
      ? 'Claude Code is installed but not signed in. Run `claude` in a terminal and sign in, then try again.'
      : 'Connect Claude first: install Claude Code (npm i -g @anthropic-ai/claude-code) and sign in, or set ANTHROPIC_API_KEY in server/.env.');
  }
  const started = Date.now();
  let errors: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = userPrompt(req, errors);
    let raw: unknown, costUsd: number | null = null;
    if (useCli) {
      const r = await runClaudeJson<unknown>({ system: SYSTEM, prompt, schema: LOOSE_SCHEMA as unknown as Record<string, unknown>, signal });
      raw = r.data; costUsd = r.costUsd;
    } else {
      raw = await generateJSON<unknown>({ system: SYSTEM, content: prompt, schema: LOOSE_SCHEMA as unknown as Record<string, unknown>, thinking: false });
    }
    const parsed = motionScene.safeParse(raw);
    if (parsed.success) {
      const scene = parsed.data;
      if (countNodes(scene.layers as Node[]) > 160) { errors = 'too many nodes (limit 160)'; continue; }
      return { scene: { ...scene, role: req.role, frame: { w: req.frame.w, h: req.frame.h } }, via: useCli ? 'claude-cli' : aiProvider() === 'gemini' ? 'gemini' : 'claude', costUsd, ms: Date.now() - started };
    }
    errors = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(scene)'}: ${i.message}`).join('; ');
  }
  throw new HttpError(502, `Claude's scene was not valid after two tries (${errors}). Try rephrasing the request.`);
}

export const motionRequest = z.object({
  prompt: z.string().min(2).max(1500),
  role: z.enum(['graphic', 'transition', 'background']).default('graphic'),
  duration: num.min(0.3).max(20).optional(),
  frame: z.object({ w: num.min(100).max(4000), h: num.min(100).max(8000) }).default({ w: 1080, h: 1920 }),
  palette: z.array(z.string().max(30)).max(8).optional(),
  fonts: z.object({ english: z.string().max(60).optional(), sinhala: z.string().max(60).optional() }).optional(),
  base: motionScene.optional(),
});
