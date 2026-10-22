import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { Template } from '@/types';
import { useEditor } from '@/store';
import { BUILTIN_TEMPLATES, makeStyle } from '@/lib/style';
import * as db from '@/lib/db';
import { StylePreview } from '../StylePreview';
import { downloadBlob } from '@/lib/util';
import { Check, Download, Save, Trash2, Upload } from '@/components/icons';
import { getFont, onFontsChanged } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Section } from '../controls';

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

  const apply = (t: Template) =>
    update((p) => ({
      ...p,
      templateId: t.id,
      // Keep the user's caption position; take everything else from the template.
      style: { ...t.style, layout: { ...t.style.layout, x: p.style.layout.x, y: p.style.layout.y } },
    }));

  const save = async () => {
    const t: Template = { id: nanoid(10), name: name.trim() || `My style ${custom.length + 1}`, builtIn: false, style: project.style, createdAt: Date.now() };
    await db.putTemplate(t);
    setCustom([t, ...custom]);
    update((p) => ({ ...p, templateId: t.id }));
    setName('');
    notify(`Saved "${t.name}".`, 'success');
  };

  const remove = async (t: Template) => {
    await db.deleteTemplate(t.id);
    setCustom(custom.filter((x) => x.id !== t.id));
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
    const active = project.templateId === t.id;
    const font = getFont(t.style.text.sinhalaFont);
    return (
      <div className={cn('group relative overflow-hidden rounded-lg border bg-muted/40 transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/25')}
        onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
        <button className="block w-full text-left" onClick={() => apply(t)} aria-pressed={active}>
          {/* Neutral "video still" backdrop: caption styles are judged against footage, not a blue glow. */}
          <div className="relative" style={{ background: 'radial-gradient(120% 90% at 50% 30%, #3a3f47 0%, #1b1e23 55%, #0d0f12 100%)' }}>
            <StylePreview style={t.style} animate={hover === t.id} height={88} />
            {active && <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>}
          </div>
          <div className="flex items-baseline justify-between gap-2 px-2 py-1.5">
            <span className="truncate text-xs font-medium">{t.name}</span>
            <span className="shrink-0 truncate text-[10px] text-muted-foreground">{font.id === t.style.text.sinhalaFont ? shortFontName(font.label) : ''}</span>
          </div>
        </button>
        {!t.builtIn && (
          <Button variant="secondary" size="icon-xs" onClick={() => remove(t)} className="absolute top-1.5 left-1.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete template"><Trash2 /></Button>
        )}
      </div>
    );
  };

  return (
    <div>
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
        <p className="text-[11px] text-muted-foreground">Hover to preview motion. Your caption position is kept.</p>
        <div className="grid grid-cols-2 gap-2">{BUILTIN_TEMPLATES.map((t) => <Card key={t.id} t={t} />)}</div>
        <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
      </Section>
    </div>
  );
}
