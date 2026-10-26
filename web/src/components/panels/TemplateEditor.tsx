import { useState } from 'react';
import type { AnimationId, AnimKey, CaptionStyle, CreativeLayout, CreativeLine, ShadowPreset, SfxId, TextCase, TextLoop } from '@/types';
import { ANIMATION_LABELS } from '@/render/animations';
import { SHADOW_PRESETS } from '@/lib/style';
import { SFX, playSfx } from '@/audio/sfx';
import { Plus, Trash2 } from '@/components/icons';
import { Volume } from '@/components/icons-audio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorInput, FillEditor, Row, Section, Segmented, Slider, Toggle } from '../controls';
import { FontPicker } from '../FontPicker';
import { DisplayControls } from './DisplayPanel';

const ANIM_IDS = Object.keys(ANIMATION_LABELS) as AnimationId[];
const LOOPS: { id: TextLoop; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'float', label: 'Float' }, { id: 'wave', label: 'Wave' },
  { id: 'pulse', label: 'Pulse' }, { id: 'shake', label: 'Shake' }, { id: 'flicker', label: 'Flicker' },
];
const SHADOW_LABELS: Record<ShadowPreset, string> = { none: 'None', soft: 'Soft', default: 'Normal', strong: 'Strong', darker: 'Dark', wideBlur: 'Wide' };

function AnimSelect({ value, onChange, allowNone = true }: { value: AnimationId; onChange: (v: AnimationId) => void; allowNone?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AnimationId)}>
      <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
      <SelectContent>{ANIM_IDS.filter((id) => allowNone || id !== 'none').map((id) => <SelectItem key={id} value={id}>{ANIMATION_LABELS[id]}</SelectItem>)}</SelectContent>
    </Select>
  );
}

const KEY_EASES: AnimKey['ease'][] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'];

/** Keyframes of an imported animation. Each row is one moment; the text eases between rows. Exit keys read entrance-shaped: first row = gone, last row = settled. */
function KeyTable({ title, keys, onChange }: { title: string; keys: AnimKey[]; onChange: (k: AnimKey[]) => void }) {
  const set = (i: number, p: Partial<AnimKey>) => onChange(keys.map((k, j) => (j === i ? { ...k, ...p } : k)).sort((a, b) => a.t - b.t));
  const field = (i: number, label: string, v: number, apply: (n: number) => Partial<AnimKey>, step = 1) => (
    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">{label}
      <Input type="number" step={step} className="h-6 w-14 px-1 text-[11px]" value={Number(v.toFixed(3))} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) set(i, apply(n)); }} />
    </label>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between"><span className="text-xs font-medium">{title}</span>
        <Button size="xs" variant="secondary" onClick={() => onChange([...keys, { ...(keys[keys.length - 1] ?? { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, sx: 1, sy: 1, blur: 0 }), t: Number(((keys[keys.length - 1]?.t ?? 0) + 0.1).toFixed(2)), ease: 'easeOut' }])}><Plus />Key</Button></div>
      {keys.map((k, i) => (
        <div key={i} className="flex flex-wrap items-end gap-1 rounded-md bg-muted/50 p-1.5">
          {field(i, 'Time s', k.t, (t) => ({ t }), 0.05)}
          {field(i, 'Opacity %', k.alpha * 100, (n) => ({ alpha: n / 100 }))}
          {field(i, 'X em', k.dx, (dx) => ({ dx }), 0.1)}
          {field(i, 'Y em', k.dy, (dy) => ({ dy }), 0.1)}
          {field(i, 'Size %', k.scale * 100, (n) => ({ scale: Math.max(0.01, n / 100) }))}
          {field(i, 'Turn °', (k.rot * 180) / Math.PI, (n) => ({ rot: (n * Math.PI) / 180 }))}
          {field(i, 'Blur em', k.blur, (blur) => ({ blur }), 0.05)}
          <Select value={k.ease} onValueChange={(ease) => set(i, { ease: ease as AnimKey['ease'] })}>
            <SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{KEY_EASES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="icon-xs" variant="ghost" className="hover:text-destructive" aria-label="Delete key" disabled={keys.length <= 2} onClick={() => onChange(keys.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
    </div>
  );
}

/**
 * Edits every part of a text template: fonts, colours, outline, glow, shadow, the curve and tilt of the block,
 * each line's size / fill / 3D edge, and the motion (entrance, per-letter kinetic timing, colour split, idle loop).
 * `onStyle` receives the whole new style; `key` merges rapid slider drags into one undo step.
 */
export function TemplateEditor({ style, onStyle, sfx, onSfx }: {
  style: CaptionStyle;
  onStyle: (s: CaptionStyle, key?: string) => void;
  sfx?: SfxId | null;
  onSfx?: (s: SfxId | null) => void;
}) {
  const t = style.text;
  const cr = style.creative ?? null;
  const [sel, setSel] = useState(0);
  const setText = (p: Partial<typeof t>, key?: string) => onStyle({ ...style, text: { ...t, ...p } }, key && `tpl-${key}`);
  const setCr = (p: Partial<CreativeLayout>, key?: string) => cr && onStyle({ ...style, creative: { ...cr, ...p } }, key && `tpl-${key}`);
  const line = cr ? cr.lines[Math.min(sel, cr.lines.length - 1)] : null;
  const lineIdx = cr ? Math.min(sel, cr.lines.length - 1) : 0;
  const setLine = (p: Partial<CreativeLine>, key?: string) => cr && setCr({ lines: cr.lines.map((l, i) => (i === lineIdx ? { ...l, ...p } : l)) }, key);
  const lineName = (l: CreativeLine, i: number) => (l.hero ? 'Key word' : `Line ${i + 1}`);

  return (
    <div>
      {!cr && <DisplayControls style={style} preview={false} setStyle={(fn, key) => onStyle(fn(style), key && `tpl-${key}`)} />}
      <Section title="Fonts">
        <Row label="Sinhala"><div className="min-w-0 flex-1"><FontPicker value={t.sinhalaFont} script="sinhala" onChange={(id) => id && setText({ sinhalaFont: id })} /></div></Row>
        <Row label="English"><div className="min-w-0 flex-1"><FontPicker value={t.englishFont} script="english" onChange={(id) => id && setText({ englishFont: id })} /></div></Row>
        <Row label="Weight"><Segmented size="sm" value={t.bold ? 'b' : 'n'} onChange={(v) => setText({ bold: v === 'b' })} options={[{ value: 'n', label: 'Regular' }, { value: 'b', label: 'Bold' }]} /><Toggle checked={t.italic} onChange={(italic) => setText({ italic })} label="Italic" /></Row>
        <Row label="Case">
          <Segmented size="sm" value={t.textCase ?? (t.uppercaseEnglish ? 'upper' : 'none')} onChange={(textCase: TextCase) => setText({ textCase, uppercaseEnglish: textCase === 'upper' })}
            options={[{ value: 'none', label: 'Aa' }, { value: 'upper', label: 'AA' }, { value: 'lower', label: 'aa' }, { value: 'title', label: 'Aa Bb' }]} />
        </Row>
        <Row label="Size"><Slider value={t.fontSize} min={20} max={160} onChange={(fontSize) => setText({ fontSize }, 'size')} /></Row>
        <Row label="Letter spacing"><Slider value={t.letterSpacing} min={-6} max={20} step={0.5} onChange={(letterSpacing) => setText({ letterSpacing }, 'ls')} /></Row>
        <Row label="Line height"><Slider value={t.lineHeight} min={0.8} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(lineHeight) => setText({ lineHeight }, 'lh')} /></Row>
      </Section>

      <Section title="Colour and effects">
        <FillEditor value={t.fill} onChange={(fill) => setText({ fill }, 'fill')} />
        <Row label="Outline"><Slider value={t.strokeWidth} min={0} max={24} onChange={(strokeWidth) => setText({ strokeWidth }, 'sw')} />{t.strokeWidth > 0 && <ColorInput value={t.strokeColor} onChange={(strokeColor) => setText({ strokeColor })} />}</Row>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(SHADOW_PRESETS) as ShadowPreset[]).map((p) => (
            <Button key={p} variant={t.shadowPreset === p ? 'default' : 'outline'} size="sm" onClick={() => setText({ shadowPreset: p, shadow: { ...SHADOW_PRESETS[p], color: t.shadow.color } })}>{SHADOW_LABELS[p]}</Button>
          ))}
        </div>
        {t.shadowPreset !== 'none' && <Row label="Shadow colour"><ColorInput value={t.shadow.color} onChange={(color) => setText({ shadow: { ...t.shadow, color } })} /></Row>}
        <Row label="Glow">
          <Toggle checked={t.glow.enabled} onChange={(enabled) => setText({ glow: { ...t.glow, enabled } })} label="Glow" />
          {t.glow.enabled && <ColorInput value={t.glow.color} onChange={(color) => setText({ glow: { ...t.glow, matchText: false, color } })} />}
        </Row>
        {t.glow.enabled && <Row label="Glow size"><Slider value={t.glow.radius} min={2} max={60} onChange={(radius) => setText({ glow: { ...t.glow, radius } }, 'gr')} /></Row>}
        <Row label="Plate">
          <Toggle checked={t.background.enabled} onChange={(enabled) => setText({ background: { ...t.background, enabled } })} label="Background plate" />
          {t.background.enabled && <ColorInput value={t.background.color.slice(0, 7)} onChange={(color) => setText({ background: { ...t.background, color } })} />}
        </Row>
        {t.background.enabled && <Row label="Plate opacity"><Slider value={Math.round(t.background.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setText({ background: { ...t.background, opacity: v / 100 } }, 'bgo')} /></Row>}
      </Section>

      <Section title="Placement">
        <Row label="Align"><Segmented size="sm" value={style.layout.align} onChange={(align) => onStyle({ ...style, layout: { ...style.layout, align } })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Row>
        <Row label="Max width"><Slider value={style.layout.maxWidth} min={30} max={100} format={(v) => `${v}%`} onChange={(maxWidth) => onStyle({ ...style, layout: { ...style.layout, maxWidth } }, 'tpl-mw')} /></Row>
        <Row label="Height (Y)"><Slider value={Math.round(style.layout.y)} min={5} max={95} format={(v) => `${v}%`} onChange={(y) => onStyle({ ...style, layout: { ...style.layout, y } }, 'tpl-y')} /></Row>
        {cr && <>
          <Row label="Shape"><Segmented size="sm" value={cr.kind} onChange={(kind) => setCr({ kind, arc: kind === 'arc' ? cr.arc || 60 : cr.arc })} options={[{ value: 'stack', label: 'Stacked' }, { value: 'arc', label: 'Curved' }]} /></Row>
          {cr.kind === 'arc' && <Row label="Curve" hint="Positive bends the lines up like a rainbow, negative bends them down."><Slider value={cr.arc ?? 0} min={-180} max={180} format={(v) => `${v}°`} onChange={(arc) => setCr({ arc }, 'arc')} /></Row>}
          <Row label="Tilt"><Slider value={cr.tilt ?? 0} min={-90} max={90} format={(v) => `${v}°`} onChange={(tilt) => setCr({ tilt }, 'tilt')} /></Row>
          <Row label="Line gap"><Slider value={cr.gap ?? 1} min={0.5} max={2.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(gap) => setCr({ gap }, 'gap')} /></Row>
          <Row label="Single row" hint="Keep all the words on one row. The key word keeps its own colour and glow."><Toggle checked={!!cr.singleLine} onChange={(singleLine) => setCr({ singleLine })} label="Single row" /></Row>
          {!cr.singleLine && <Row label="Words per line"><Slider value={cr.wordsPerLine} min={1} max={4} onChange={(wordsPerLine) => setCr({ wordsPerLine }, 'wpl')} /></Row>}
          <Row label="Words shown"><Slider value={style.wordsPerChunk} min={2} max={10} onChange={(wordsPerChunk) => onStyle({ ...style, wordsPerChunk }, 'tpl-wpc')} /></Row>
        </>}
      </Section>

      {cr && line && (
        <Section title="Lines" right={<Button size="xs" variant="secondary" onClick={() => { setCr({ lines: [...cr.lines, { scale: 0.8, fill: { color: '#FFFFFF', gradient: null } }] }); setSel(cr.lines.length); }}><Plus />Line</Button>}>
          <div className="flex flex-wrap gap-1">
            {cr.lines.map((l, i) => (
              <button key={i} type="button" onClick={() => setSel(i)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] ${i === lineIdx ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                <span className="size-2.5 rounded-full border border-foreground/30" style={{ background: l.fill?.color ?? t.fill.color }} />{lineName(l, i)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">The key word line is used for the standout word; the other lines repeat down the rest.</p>
          <Row label="Size ×"><Slider value={Math.round(line.scale * 100)} min={30} max={300} format={(v) => `${v}%`} onChange={(v) => setLine({ scale: v / 100 }, 'ls')} /></Row>
          <FillEditor value={line.fill ?? t.fill} onChange={(fill) => setLine({ fill }, 'lf')} />
          <Row label="Letter colours" hint="Shade the letters across the line, e.g. white to cyan. Overrides the fill.">
            <Toggle checked={!!line.tint} onChange={(on) => setLine({ tint: on ? ['#FFFFFF', '#19F3D6'] : undefined })} label="Letter colours" />
            {line.tint && <Button size="icon-xs" variant="ghost" aria-label="Add colour" disabled={line.tint.length >= 5} onClick={() => setLine({ tint: [...line.tint!, '#FFFFFF'] })}><Plus /></Button>}
          </Row>
          {line.tint && <div className="flex flex-wrap justify-end gap-1.5">
            {line.tint.map((c, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <ColorInput value={c} onChange={(v) => setLine({ tint: line.tint!.map((x, j) => (j === i ? v : x)) })} />
                {line.tint!.length > 2 && <Button size="icon-xs" variant="ghost" aria-label="Remove colour" onClick={() => setLine({ tint: line.tint!.filter((_, j) => j !== i) })}>✕</Button>}
              </span>
            ))}
          </div>}
          <Row label="Outline"><Slider value={line.strokeWidth ?? t.strokeWidth} min={0} max={24} onChange={(strokeWidth) => setLine({ strokeWidth }, 'lsw')} />{(line.strokeWidth ?? t.strokeWidth) > 0 && <ColorInput value={line.strokeColor ?? t.strokeColor} onChange={(strokeColor) => setLine({ strokeColor })} />}</Row>
          <Row label="Glow">
            <Toggle checked={!!line.glow} onChange={(on) => setLine({ glow: on ? { color: '#18D2FF', strength: 1, radius: 18 } : undefined })} label="Line glow" />
            {line.glow && <ColorInput value={line.glow.color} onChange={(color) => setLine({ glow: { ...line.glow!, color } })} />}
          </Row>
          {line.glow && <>
            <Row label="Glow size"><Slider value={line.glow.radius} min={2} max={60} onChange={(radius) => setLine({ glow: { ...line.glow!, radius } }, 'lgr')} /></Row>
            <Row label="Glow power"><Slider value={line.glow.strength} min={0.2} max={2} step={0.1} format={(v) => v.toFixed(1)} onChange={(strength) => setLine({ glow: { ...line.glow!, strength } }, 'lgs')} /></Row>
          </>}
          <Row label="3D edge">
            <Toggle checked={!!line.extrude} onChange={(on) => setLine({ extrude: on ? { color: '#111111', depth: 6 } : undefined })} label="3D edge" />
            {line.extrude && <ColorInput value={line.extrude.color} onChange={(color) => setLine({ extrude: { ...line.extrude!, color } })} />}
          </Row>
          {line.extrude && <Row label="Depth"><Slider value={line.extrude.depth} min={1} max={24} onChange={(depth) => setLine({ extrude: { ...line.extrude!, depth } }, 'led')} /></Row>}
          <Row label="Tilt"><Slider value={line.rotate ?? 0} min={-30} max={30} format={(v) => `${v}°`} onChange={(rotate) => setLine({ rotate }, 'lr')} /></Row>
          <Row label="Shift"><Slider value={line.shift ?? 0} min={-50} max={50} format={(v) => `${v}%`} onChange={(shift) => setLine({ shift }, 'lsh')} /></Row>
          <Row label="Font" hint="Overrides the template font for this line only.">
            <div className="min-w-0 flex-1"><FontPicker value={line.font ?? null} script="english" allowInherit="Template font" onChange={(font) => setLine({ font: font ?? undefined })} /></div>
          </Row>
          <Row label="Weight"><Segmented size="sm" value={line.bold === undefined ? 'i' : line.bold ? 'b' : 'n'} onChange={(v) => setLine({ bold: v === 'i' ? undefined : v === 'b' })} options={[{ value: 'i', label: 'Template' }, { value: 'n', label: 'Regular' }, { value: 'b', label: 'Bold' }]} /></Row>
          <Row label="Case"><Segmented size="sm" value={line.textCase ?? 'inherit'} onChange={(v) => setLine({ textCase: v === 'inherit' ? undefined : (v as TextCase) })} options={[{ value: 'inherit', label: 'Template' }, { value: 'upper', label: 'AA' }, { value: 'lower', label: 'aa' }, { value: 'title', label: 'Aa Bb' }]} /></Row>
          <div className="flex justify-end"><Button size="xs" variant="ghost" className="hover:text-destructive" disabled={cr.lines.length <= 1} onClick={() => { setCr({ lines: cr.lines.filter((_, i) => i !== lineIdx) }); setSel(0); }}><Trash2 />Remove line</Button></div>
        </Section>
      )}

      <Section title="Motion">
        {cr ? <>
          <Row label="Enter"><AnimSelect value={cr.lineAnim} onChange={(lineAnim) => setCr({ lineAnim })} /></Row>
          <Row label="Exit"><AnimSelect value={cr.outAnim ?? 'none'} onChange={(outAnim) => setCr({ outAnim })} /></Row>
          {cr.lineAnim === 'custom' && cr.customIn && <KeyTable title="Entrance keyframes" keys={cr.customIn} onChange={(customIn) => setCr({ customIn })} />}
          {cr.outAnim === 'custom' && cr.customOut && <KeyTable title="Exit keyframes" keys={cr.customOut} onChange={(customOut) => setCr({ customOut })} />}
          <Row label="Line delay" hint="Seconds between one line entering and the next."><Slider value={cr.stagger} min={0} max={0.6} step={0.01} format={(v) => `${v.toFixed(2)}s`} onChange={(stagger) => setCr({ stagger }, 'stg')} /></Row>
          <Row label="Letter delay" hint="Kinetic type: each letter enters in turn. 0 = the whole line together. Sinhala words enter whole."><Slider value={cr.perLetter ?? 0} min={0} max={0.15} step={0.005} format={(v) => (v ? `${v.toFixed(3)}s` : 'Off')} onChange={(perLetter) => setCr({ perLetter }, 'pl')} /></Row>
          {!!cr.perLetter && <Row label="Letter enter"><AnimSelect value={cr.letterAnim ?? cr.lineAnim} onChange={(letterAnim) => setCr({ letterAnim })} /></Row>}
          <Row label="Idle loop"><Select value={cr.loop ?? 'none'} onValueChange={(loop) => setCr({ loop: loop as TextLoop })}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{LOOPS.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent>
          </Select></Row>
          {cr.loop && cr.loop !== 'none' && <Row label="Idle speed" hint="How fast the float / wave / pulse repeats."><Slider value={cr.loopSpeed ?? 1} min={0.2} max={4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(loopSpeed) => setCr({ loopSpeed }, 'lps')} /></Row>}
          <Row label="Colour split" hint="Red and blue ghosts at the edges, like a glitch or lens fringe."><Slider value={Math.round((cr.split ?? 0) * 100)} min={0} max={15} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => setCr({ split: v / 100 }, 'spl')} /></Row>
          {!!cr.split && <Row label="Keep split"><Toggle checked={!!cr.splitHold} onChange={(splitHold) => setCr({ splitHold })} label="Keep colour split on" /></Row>}
        </> : (
          <Row label="Enter"><AnimSelect value={style.animation} onChange={(animation) => onStyle({ ...style, animation })} /></Row>
        )}
        <Row label="Speed"><Slider value={style.animationSpeed} min={0.25} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(animationSpeed) => onStyle({ ...style, animationSpeed }, 'tpl-spd')} /></Row>
        {onSfx && (
          <Row label="Sound">
            <Select value={sfx ?? 'none'} onValueChange={(v) => onSfx(v === 'none' ? null : (v as SfxId))}>
              <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{SFX.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            {sfx && <Button size="icon-xs" variant="ghost" aria-label="Preview sound" onClick={() => void playSfx(sfx)}><Volume /></Button>}
          </Row>
        )}
      </Section>
    </div>
  );
}
