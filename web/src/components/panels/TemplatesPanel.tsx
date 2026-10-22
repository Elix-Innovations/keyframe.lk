import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { Caption, Template } from '@/types';
import { useEditor } from '@/store';
import { BUILTIN_TEMPLATES, makeStyle } from '@/lib/style';
import { CREATIVE_TEMPLATES, MOTION_TEMPLATES, PRESET_TEMPLATES, SCENE_TEMPLATES, APPLE_TEMPLATES } from '@/lib/creativeTemplates';
import { addTemplateLayer, applyTemplate, templatePrefs, type SoundChoice } from '@/lib/templateApply';
import { DRAG_MIME, type DragPayload } from '@/lib/timelineGeo';
import { SFX, playSfx } from '@/audio/sfx';
import { currentTime } from '@/lib/player';
import * as db from '@/lib/db';
import { StylePreview } from '../StylePreview';
import { downloadBlob } from '@/lib/util';
import { Check, Download, Pencil, Save, Trash2, Upload } from '@/components/icons';
import { Volume } from '@/components/icons-audio';
import { getFont, onFontsChanged } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, Section, Segmented, Slider } from '../controls';
import { TemplateEditor } from './TemplateEditor';
import { importPremierePack, PACK_ACCEPT } from '@/lib/premiere';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Scope = 'all' | 'caption' | 'range';

/** "Tharu Digital Sinhala Cooper" → "Cooper", "FM Abhaya Bold" → "Abhaya Bold": the card has little room. */
const shortFontName = (label: string) => label.replace(/^(FM|CC|Tharu( Digital| DC)?)\s+/, '').replace(/^Sinhala\s+/, '');

export function TemplatesPanel() {
  const project = useEditor((s) => s.project)!;
  const custom = useEditor((s) => s.customTemplates);
  const setCustom = useEditor((s) => s.setCustomTemplates);
  const update = useEditor((s) => s.update);
  const notify = useEditor((s) => s.notify);
  const [hover, setHover] = useState<string | null>(null);
  const [name, setName] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  useEffect(() => onFontsChanged(() => force((n) => n + 1)), []); // font labels appear once FM fonts register

  const selectedCaption = useEditor((s) => s.selectedCaptionId);
  const [scope, setScope] = useState<Scope>('all');
  const [sound, setSoundState] = useState<SoundChoice>(templatePrefs.sound);
  const setSound = (v: SoundChoice) => { templatePrefs.sound = v; setSoundState(v); }; // a template dropped on the timeline uses the same choice
  const packRef = useRef<HTMLInputElement>(null);
  const [packStatus, setPackStatus] = useState<string | null>(null);
  const [packWarnings, setPackWarnings] = useState<string[]>([]);
  const [editing, setEditing] = useState<Template | null>(null); // a working copy of the template being customised
  const [speed, setSpeedState] = useState(templatePrefs.speed);
  const setSpeed = (v: number) => { templatePrefs.speed = v; setSpeedState(v); };
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(5);

  /** Captions a scope covers. */
  const targets = (): Caption[] => {
    if (scope === 'all') return project.captions;
    if (scope === 'caption') return project.captions.filter((c) => c.id === selectedCaption);
    return project.captions.filter((c) => c.end > from && c.start < to);
  };

  const apply = async (t: Template) => {
    const hit = targets();
    if (!hit.length) { notify(scope === 'caption' ? 'Select a caption on the timeline first.' : 'No captions in that time range.', 'info'); return; }
    await applyTemplate(t, scope === 'all' ? 'all' : hit, sound);
  };

  const save = async () => {
    const t: Template = { id: nanoid(10), name: name.trim() || `My style ${custom.length + 1}`, builtIn: false, style: project.style, createdAt: Date.now() };
    await db.putTemplate(t);
    setCustom([t, ...custom]);
    update((p) => ({ ...p, templateId: t.id }));
    setName('');
    notify(`Saved "${t.name}".`, 'success');
  };

  /** Save the working copy: update a template of your own in place, or add a copy when it was a built-in. */
  const saveEdit = async (asNew: boolean) => {
    if (!editing) return;
    const t: Template = asNew || editing.builtIn ? { ...editing, id: nanoid(10), builtIn: false, createdAt: Date.now(), name: editing.builtIn ? `${editing.name} custom` : `${editing.name} copy` } : editing;
    await db.putTemplate(t);
    setCustom(custom.some((x) => x.id === t.id) ? custom.map((x) => (x.id === t.id ? t : x)) : [t, ...custom]);
    setEditing(t);
    notify(`Saved “${t.name}” to My templates.`, 'success');
  };

  const remove = async (t: Template) => {
    await db.deleteTemplate(t.id);
    setCustom(custom.filter((x) => x.id !== t.id));
  };

  const importPack = async (files: File[]) => {
    setPackWarnings([]);
    setPackStatus('Starting…');
    try {
      const { templates, warnings } = await importPremierePack(files, setPackStatus);
      for (const t of templates) await db.putTemplate(t);
      if (templates.length) setCustom([...templates, ...custom]);
      setPackWarnings(warnings);
      notify(templates.length ? `Imported ${templates.length} text animation${templates.length > 1 ? 's' : ''} into My templates.` : 'No text animations could be imported.', templates.length ? 'success' : 'info');
    } finally { setPackStatus(null); }
  };

  const exportAll = () => {
    const data = JSON.stringify({ kind: 'sincap-templates', version: 1, templates: custom }, null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), 'keyframe-templates.json');
  };

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const list: Template[] = (data.templates ?? []).map((t: Template) => ({ ...t, id: nanoid(10), builtIn: false, style: makeStyle(t.style) }));
      for (const t of list) await db.putTemplate(t);
      setCustom([...list, ...custom]);
      notify(`Imported ${list.length} templates.`, 'success');
    } catch {
      notify('That file is not a Keyframe.lk template export.', 'error');
    }
  };

  const Card = ({ t }: { t: Template }) => {
    const active = project.templateId === t.id && scope === 'all';
    const font = getFont(t.style.text.sinhalaFont);
    return (
      <div className={cn('group relative overflow-hidden rounded-lg border bg-muted/40 transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/25')}
        onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
        <button className="block w-full cursor-grab text-left active:cursor-grabbing" onClick={() => apply(t)} aria-pressed={active}
          draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ type: 'template', id: t.id } satisfies DragPayload)); e.dataTransfer.effectAllowed = 'copy'; }}>
          {/* Neutral "video still" backdrop: caption styles are judged against footage, not a blue glow. */}
          <div className="relative" style={{ background: 'radial-gradient(120% 90% at 50% 30%, #3a3f47 0%, #1b1e23 55%, #0d0f12 100%)' }}>
            <StylePreview style={t.style} animate={hover === t.id} height={t.style.creative ? 124 : 88} />
            {active && <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>}
          </div>
          <div className="flex items-baseline justify-between gap-2 px-2 py-1.5">
            <span className="truncate text-xs font-medium">{t.name}</span>
            <span className="flex shrink-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
              {t.sfx && <Volume className="size-3" aria-label={`Sound: ${SFX.find((s) => s.id === t.sfx)?.label}`} />}
              {t.origin ? (t.approximate ? 'Premiere ≈' : 'Premiere') : t.style.creative ? 'Creative' : font.id === t.style.text.sinhalaFont ? shortFontName(font.label) : ''}
            </span>
          </div>
        </button>
        <Button variant="secondary" size="icon-xs" onClick={() => setEditing({ ...t })} aria-label={`Customise ${t.name}`} title="Edit fonts, colours, curve and motion"
          className="absolute top-1.5 right-7 opacity-0 transition-opacity group-hover:opacity-100"><Pencil /></Button>
        <Button variant="secondary" size="xs" onClick={() => void addTemplateLayer(t, currentTime())} aria-label={`Add ${t.name} to the timeline as a text layer`} title="Add as a text layer at the playhead"
          className="absolute right-1.5 bottom-7 opacity-0 transition-opacity group-hover:opacity-100">+ Layer</Button>
        {!t.builtIn && (
          <Button variant="secondary" size="icon-xs" onClick={() => remove(t)} className="absolute top-1.5 left-1.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete template"><Trash2 /></Button>
        )}
      </div>
    );
  };

  if (editing) {
    return (
      <div>
        <Section title={`Edit “${editing.name}”`} right={<Button variant="ghost" size="xs" onClick={() => setEditing(null)}>Done</Button>}>
          <div className="overflow-hidden rounded-lg border" style={{ background: 'radial-gradient(120% 90% at 50% 30%, #3a3f47 0%, #1b1e23 55%, #0d0f12 100%)' }}>
            <StylePreview style={editing.style} animate height={editing.style.creative ? 150 : 100} />
          </div>
          <Input className="h-7 text-xs" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Template name" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void apply(editing)}>Apply to captions</Button>
            <Button size="sm" variant="secondary" onClick={() => void addTemplateLayer(editing, currentTime())}>+ Layer</Button>
            {!editing.builtIn && custom.some((x) => x.id === editing.id) && <Button size="sm" variant="secondary" onClick={() => void saveEdit(false)}><Save />Update</Button>}
            <Button size="sm" variant="secondary" onClick={() => void saveEdit(true)}><Save />Save as new</Button>
          </div>
        </Section>
        <TemplateEditor style={editing.style} sfx={editing.sfx ?? null}
          onStyle={(style) => setEditing((e) => (e ? { ...e, style } : e))} onSfx={(sfx) => setEditing((e) => (e ? { ...e, sfx } : e))} />
      </div>
    );
  }

  return (
    <div>
      <Section title="Apply to">
        <Segmented fill size="sm" value={scope} onChange={setScope}
          options={[{ value: 'all', label: 'Whole video' }, { value: 'caption', label: 'Selected caption' }, { value: 'range', label: 'Time range' }]} />
        {scope === 'caption' && <p className="text-[11px] text-muted-foreground">{selectedCaption ? 'The selected caption gets the template you click.' : 'Click a caption on the timeline, then pick a template.'}</p>}
        {scope === 'range' && (
          <Row label="From / to (s)">
            <Input type="number" min={0} step={0.1} className="h-7 w-16 text-xs" value={from} onChange={(e) => setFrom(Math.max(0, Number(e.target.value) || 0))} />
            <Input type="number" min={0} step={0.1} className="h-7 w-16 text-xs" value={to} onChange={(e) => setTo(Math.max(0, Number(e.target.value) || 0))} />
            <Button size="xs" variant="secondary" onClick={() => { const t = currentTime(); setFrom(Number(t.toFixed(1))); setTo(Number((t + 5).toFixed(1))); }}>Playhead +5s</Button>
          </Row>
        )}
        <Row label="Sound effect" hint="Plays as each caption appears. Pick “None” for silent. Applying again replaces the sounds a template added.">
          <Select value={sound} onValueChange={(v) => setSound(v as SoundChoice)}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="template">Template's sound</SelectItem>
              <SelectItem value="none">None</SelectItem>
              {SFX.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {sound !== 'none' && sound !== 'template' && <Button size="icon-xs" variant="ghost" aria-label="Preview sound" onClick={() => void playSfx(sound)}><Volume /></Button>}
        </Row>
        <Row label="Animation speed" hint="Multiplies the template's own speed when you apply it or add it as a layer. Fine-tune a single template with the pencil.">
          <Slider value={speed} min={0.25} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={setSpeed} />
        </Row>
      </Section>
      <Section title="Creative text">
        <p className="text-[11px] text-muted-foreground">Stacked, arched and neon lines with a big key word. Hover to preview the entrance, drag one onto the timeline to add it as a text layer, or click to style captions. The speaker icon marks the matching sound.</p>
        <div className="grid grid-cols-2 gap-2">{CREATIVE_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
      </Section>
      <Section title="Motion titles">
        <p className="text-[11px] text-muted-foreground">Kinetic letters, glitch, neon flicker, wipes, whips and elastic bounces. Hover to preview; the pencil opens every setting: fonts, colours, curve, line looks and motion.</p>
        <div className="grid grid-cols-2 gap-2">{MOTION_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
      </Section>
      <Section title="Text presets">
        <p className="text-[11px] text-muted-foreground">Clean rounded type with a soft glow, one preset per motion: slide, scale, bounce, typewriter and an accent word. Edit colours, glow and font with the pencil.</p>
        <div className="grid grid-cols-2 gap-2">{PRESET_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
      </Section>
      <Section title="Text scenes">
        <p className="text-[11px] text-muted-foreground">Neon-glow single-row titles from the Elfko scene pack: typed-on, blur slides, zoom-through, dark glow and two-tone. Letters shade from white to the glow colour.</p>
        <div className="grid grid-cols-2 gap-2">{SCENE_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
      </Section>
      <Section title="Apple style">
        <p className="text-[11px] text-muted-foreground">Apple-website type: Apple Intelligence gradient, titanium, words brightening as you read, and keynote headlines.</p>
        <div className="grid grid-cols-2 gap-2">{APPLE_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
      </Section>
      <Section title="Premiere pack import">
        <p className="text-[11px] text-muted-foreground">Add a text transition pack you own: .mogrt, .prfpset or .prproj give the pack's own keyframes; a preview video (mp4, mov, webm) is measured and is approximate. .aep is binary, so use its preview video. Each text animation becomes an editable template in My templates.</p>
        <Button size="sm" variant="secondary" disabled={!!packStatus} onClick={() => packRef.current?.click()}><Upload />{packStatus ?? 'Choose pack files'}</Button>
        <input ref={packRef} type="file" multiple accept={PACK_ACCEPT} hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void importPack(f); e.target.value = ''; }} />
        {packWarnings.length > 0 && <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">{packWarnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>}
      </Section>
      <Section title="Save current look">
        <div className="flex gap-1.5">
          <Input className="h-7 text-xs" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <Button size="sm" onClick={save}><Save />Save</Button>
        </div>
      </Section>
      {custom.length > 0 && (
        <Section title="My templates" right={<Button variant="ghost" size="xs" onClick={exportAll}><Download />Export</Button>}>
          <div className="grid grid-cols-2 gap-2">{custom.map((t) => <Card key={t.id} t={t} />)}</div>
        </Section>
      )}
      <Section title="Templates" right={<Button variant="ghost" size="xs" onClick={() => importRef.current?.click()}><Upload />Import</Button>}>
        <p className="text-[11px] text-muted-foreground">Hover to preview motion. Click to style captions, or drag one onto the timeline (or press + Layer) to add it as its own text layer. Your caption position is kept.</p>
        <div className="grid grid-cols-2 gap-2">{BUILTIN_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
        <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
      </Section>
    </div>
  );
}
