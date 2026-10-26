import type { Caption, CaptionStyle, Project, SfxId, Template } from '../types';
import { useEditor } from '../store';
import { BUILTIN_TEMPLATES } from './style';
import { CREATIVE_TEMPLATES, MOTION_TEMPLATES, PRESET_TEMPLATES, SCENE_TEMPLATES, APPLE_TEMPLATES } from './creativeTemplates';
import { addSfxTracks } from './sounds';
import { makeOverlay } from './overlays';
import { chunkWords } from '../render/captions';

/** 'template' = the sound that suits the template; 'none' = silent; otherwise a chosen sound. */
export type SoundChoice = 'template' | 'none' | SfxId;

/** The panel's sound dropdown, shared so a template dropped on the timeline uses the same choice. */
export const templatePrefs: { sound: SoundChoice; speed: number } = { sound: 'template', speed: 1 };

/** A template with the panel's animation speed multiplied into its own. */
const sped = (t: Template, speed = templatePrefs.speed): Template =>
  speed === 1 ? t : { ...t, style: { ...t.style, animationSpeed: Math.min(4, Math.max(0.25, t.style.animationSpeed * speed)) } };

export const findTemplate = (id: string): Template | undefined =>
  [...CREATIVE_TEMPLATES, ...MOTION_TEMPLATES, ...PRESET_TEMPLATES, ...SCENE_TEMPLATES, ...APPLE_TEMPLATES, ...BUILTIN_TEMPLATES, ...useEditor.getState().customTemplates].find((t) => t.id === id);

/** Words a template layer shows before the user types their own. */
const SAMPLE_TEXT = 'මේ Effect එක දැකලා තියෙනවා ද';

/**
 * Put a template on the timeline as its own text layer (a block on the text track the user can move, trim,
 * stretch over the whole video, and edit the words of). `text` / `duration` default to a short sample.
 */
export async function addTemplateLayer(tpl: Template, start: number, track = 0, text?: string, duration = 3, sound: SoundChoice = templatePrefs.sound): Promise<string | null> {
  const t = sped(tpl);
  const st = useEditor.getState();
  if (!st.project) return null;
  const o = makeOverlay({
    kind: 'text', text: text?.trim() || SAMPLE_TEXT, start, duration, track,
    apply: { tpl: { id: t.id, style: t.style }, y: t.style.layout.y, animIn: { id: 'none', duration: 0.01 }, animOut: { id: 'none', duration: 0.01 } },
  }, st.project.overlays ?? []);
  st.setOverlays((l) => [...l, o]);
  st.selectOverlay(o.id);
  const sfx = sound === 'template' ? t.sfx ?? null : sound === 'none' ? null : sound;
  if (sfx) await addSfxTracks(sfx, [o.start]).catch(() => undefined);
  st.notify(`Added “${t.name}” as a text layer at ${o.start.toFixed(1)}s.${sfx ? ' Its sound effect is on the Sound layer.' : ''}`, 'success');
  return o.id;
}

/**
 * Apply a template to the whole video (`captions` = 'all') or to some captions, and add the matching sound effects.
 * One undo step for the look; sounds a template added earlier in the same span are replaced.
 */
export async function applyTemplate(tpl: Template, captions: Caption[] | 'all', sound: SoundChoice = templatePrefs.sound): Promise<void> {
  const t = sped(tpl);
  const st = useEditor.getState();
  const project = st.project;
  if (!project) return;
  const hit = captions === 'all' ? project.captions : captions;
  if (!hit.length) {
    // "Whole video" with no captions yet still sets the project look, so the template shows on captions you add later.
    if (captions === 'all') {
      st.update((p) => ({ ...p, templateId: t.id, style: { ...t.style, layout: { ...t.style.layout, x: p.style.layout.x, y: p.style.layout.y } } }));
      st.notify(`Set “${t.name}” as the caption style. It shows on captions you add; drag it onto the timeline to add it as a text layer now.`, 'success');
    } else st.notify('There are no captions to style yet.', 'info');
    return;
  }
  const ids = new Set(hit.map((c) => c.id));
  // Keep the user's caption position; take everything else from the template.
  const keep = (p: Project, s: CaptionStyle): CaptionStyle => ({ ...s, layout: { ...s.layout, x: p.style.layout.x, y: p.style.layout.y } });
  st.update((p) => captions === 'all'
    ? { ...p, templateId: t.id, style: keep(p, t.style), captions: p.captions.map((c) => (c.styleOverride ? { ...c, styleOverride: undefined } : c)) }
    : { ...p, captions: p.captions.map((c) => (ids.has(c.id) ? { ...c, styleOverride: { ...keep(p, t.style), creative: t.style.creative ?? null } } : c)) });

  // Sound effects: one at the start of each line group that appears, replacing sounds an earlier template added there.
  const sfx = sound === 'template' ? t.sfx ?? null : sound === 'none' ? null : sound;
  const span = captions === 'all' ? null : { a: Math.min(...hit.map((c) => c.start)), b: Math.max(...hit.map((c) => c.end)) };
  const inSpan = (x: { start: number }) => !span || (x.start >= span.a - 0.01 && x.start <= span.b);
  const times = sfx ? hit.flatMap((c) => chunkWords(c.words, t.style.creative ? t.style.wordsPerChunk : 0).map((ch, i) => (i === 0 ? c.start : ch[0].start))).slice(0, 150) : [];
  try {
    const had = useEditor.getState().project?.audio.tracks.some((x) => x.fromTemplate && inSpan(x));
    if (sfx || had) await addSfxTracks(sfx ?? 'pop', times, (x) => !!x.fromTemplate && inSpan(x));
  } catch (e) { st.notify((e as Error).message || 'Could not add the sound effect.', 'error'); }
  const where = captions === 'all' ? 'the whole video' : `${hit.length} caption${hit.length > 1 ? 's' : ''}`;
  st.notify(`Applied “${t.name}” to ${where}${times.length ? ` with ${times.length} sound effect${times.length > 1 ? 's' : ''}` : ''}.`, 'success');
}
