import type { CaptionStyle, DisplayMode } from '@/types';
import { useEditor } from '@/store';
import { boxPads } from '@/render/captions';
import { StylePreview } from '../StylePreview';
import { ColorInput, FillEditor, Row, Section, Slider, Toggle } from '../controls';
import { FontPicker } from '../FontPicker';

const MODES: { id: DisplayMode; label: string; desc: string }[] = [
  { id: 'natural', label: 'Natural', desc: 'Whole caption at once, like classic subtitles.' },
  { id: 'highlight', label: 'Highlight active', desc: 'The spoken word lights up.' },
  { id: 'box-highlight', label: 'Box highlight', desc: 'A box slides behind the spoken word.' },
  { id: 'word-by-word', label: 'Word by word', desc: 'Only the current word (or few) on screen.' },
  { id: 'word-appear', label: 'Word appear', desc: 'Words appear as they are spoken.' },
  { id: 'compact-emphasis', label: 'Compact emphasis', desc: 'Words appear as spoken; emphasized words get their own big line.' },
];

export function DisplayPanel() {
  const style = useEditor((s) => s.project!.style);
  const setStyle = useEditor((s) => s.setStyle);
  return <DisplayControls style={style} setStyle={setStyle} />;
}

/** Display mode, active-word look and emphasised-word look for any caption style: the project's, or a template layer's own. */
export function DisplayControls({ style, setStyle, preview = true }: { style: CaptionStyle; setStyle: (fn: (s: CaptionStyle) => CaptionStyle, key?: string) => void; preview?: boolean }) {
  const mode = style.displayMode;
  const usesChunks = mode !== 'natural';
  const usesActive = mode === 'highlight' || mode === 'box-highlight';

  return (
    <div>
      <Section title="Display mode">
        {preview && (
          <div className="overflow-hidden rounded-xl border border-border checker">
            <StylePreview style={style} animate height={110} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setStyle((s) => ({ ...s, displayMode: m.id, wordsPerChunk: m.id === 'word-by-word' ? Math.max(1, s.wordsPerChunk) : s.wordsPerChunk }))}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${mode === m.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/40'}`}>
              <div className="font-medium">{m.label}</div>
              <div className="text-xs text-muted-foreground">{m.desc}</div>
            </button>
          ))}
        </div>
        {usesChunks && (
          <Row label="Words on screen" hint="0 shows the whole caption">
            <Slider value={style.wordsPerChunk} min={mode === 'word-by-word' ? 1 : 0} max={8}
              onChange={(wordsPerChunk) => setStyle((s) => ({ ...s, wordsPerChunk }), 'wpc')} format={(v) => (v === 0 ? 'All' : String(v))} />
          </Row>
        )}
      </Section>

      {usesActive && (
        <Section title="Active word">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">{mode === 'box-highlight' ? 'Text in box' : 'Active word color'}</span>
            <FillEditor value={style.highlight.fill} onChange={(fill) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, fill } }), 'hf')} />
          </div>
          {mode === 'box-highlight' && (
            <>
              <Row label="Box color"><ColorInput value={style.highlight.boxColor} onChange={(boxColor) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, boxColor } }), 'hb')} /></Row>
              <Row label="Box radius"><Slider value={style.highlight.boxRadius} min={0} max={40} onChange={(boxRadius) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, boxRadius } }), 'hr')} /></Row>
              <Row label="Box padding"><Slider value={style.highlight.boxPadding} min={0} max={30} onChange={(boxPadding) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, boxPadding, boxPadTop: undefined, boxPadBottom: undefined, boxPadLeft: undefined, boxPadRight: undefined } }), 'hp')} /></Row>
              {([['Margin top', 'boxPadTop'], ['Margin bottom', 'boxPadBottom'], ['Margin left', 'boxPadLeft'], ['Margin right', 'boxPadRight']] as const).map(([label, key]) => (
                <Row key={key} label={label}>
                  <Slider value={boxPads(style.highlight)[key.slice(6).toLowerCase() as 'top' | 'bottom' | 'left' | 'right']} min={0} max={40}
                    onChange={(v) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, [key]: v } }), key)} />
                </Row>
              ))}
            </>
          )}
          <Row label="Grow"><Slider value={style.highlight.scale} min={1} max={1.5} step={0.01} onChange={(scale) => setStyle((s) => ({ ...s, highlight: { ...s.highlight, scale } }), 'hs')} format={(v) => `×${v.toFixed(2)}`} /></Row>
        </Section>
      )}

      <Section title="Emphasized words" right={<Toggle checked={style.emphasis.enabled} onChange={(enabled) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, enabled } }))} />}>
        <p className="text-xs text-muted-foreground">Mark words in the Captions tab, or let AI pick them (AI tab).</p>
        {style.emphasis.enabled && (
          <>
            <FillEditor value={style.emphasis.fill} onChange={(fill) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, fill } }), 'ef')} />
            <Row label="Size"><Slider value={style.emphasis.scale} min={1} max={2} step={0.05} onChange={(scale) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, scale } }), 'es')} format={(v) => `×${v.toFixed(2)}`} /></Row>
            <Row label="Bold"><Toggle checked={style.emphasis.bold} onChange={(bold) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, bold } }))} /></Row>
            <Row label="Sinhala font"><FontPicker value={style.emphasis.sinhalaFont} script="sinhala" allowInherit="Caption font" onChange={(sinhalaFont) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, sinhalaFont } }))} /></Row>
            <Row label="English font"><FontPicker value={style.emphasis.englishFont} script="english" allowInherit="Caption font" onChange={(englishFont) => setStyle((s) => ({ ...s, emphasis: { ...s.emphasis, englishFont } }))} /></Row>
          </>
        )}
      </Section>
    </div>
  );
}
