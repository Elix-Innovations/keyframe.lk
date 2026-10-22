import { Bold, Italic, RotateCcw } from '@/components/icons';
import type { ScriptOverrides, ShadowPreset, TextLook } from '@/types';
import { useEditor } from '@/store';
import { FontImport } from '../FontImport';
import { SHADOW_PRESETS } from '@/lib/style';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle as UiToggle } from '@/components/ui/toggle';
import { ColorInput, FillEditor, Row, Section, Segmented, Slider, Toggle } from '../controls';
import { FontPicker } from '../FontPicker';

const SHADOW_LABELS: Record<ShadowPreset, string> = { none: 'None', soft: 'Soft', default: 'Default', strong: 'Strong', darker: 'Darker', wideBlur: 'Wide blur' };

export function StylePanel() {
  const style = useEditor((s) => s.project!.style);
  const setStyle = useEditor((s) => s.setStyle);
  const t = style.text;
  const setText = (patch: Partial<TextLook>, key = 'text') => setStyle((s) => ({ ...s, text: { ...s.text, ...patch } }), key);

  return (
    <Tabs defaultValue="text" className="gap-0">
      <div className="px-3 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="effects">Effects</TabsTrigger>
          <TabsTrigger value="script"><span className="sinhala">සිං</span> / En</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="text">
        <Section title="Fonts">
          <Row label="Sinhala"><FontPicker value={t.sinhalaFont} script="sinhala" onChange={(id) => id && setText({ sinhalaFont: id })} /></Row>
          <Row label="English"><FontPicker value={t.englishFont} script="english" onChange={(id) => id && setText({ englishFont: id })} /></Row>
          <FontImport />
        </Section>
        <Section title="Typography">
          <div className="flex items-center gap-1">
            <UiToggle size="sm" variant="outline" pressed={t.bold} onPressedChange={(bold) => setText({ bold })} aria-label="Bold"><Bold /></UiToggle>
            <UiToggle size="sm" variant="outline" pressed={t.italic} onPressedChange={(italic) => setText({ italic })} aria-label="Italic"><Italic /></UiToggle>
          </div>
          <Row label="English case">
            <Segmented size="sm" value={t.textCase ?? (t.uppercaseEnglish ? 'upper' : 'none')}
              onChange={(textCase) => setText({ textCase, uppercaseEnglish: textCase === 'upper' })}
              options={[{ value: 'none', label: 'Aa' }, { value: 'upper', label: 'ABC' }, { value: 'lower', label: 'abc' }, { value: 'title', label: 'Abc' }]} />
          </Row>
          <Row label="Size"><Slider value={t.fontSize} min={20} max={160} onChange={(fontSize) => setText({ fontSize }, 'size')} /></Row>
          <Row label="Letter spacing"><Slider value={t.letterSpacing} min={-6} max={20} step={0.5} onChange={(letterSpacing) => setText({ letterSpacing }, 'ls')} /></Row>
          <Row label="Word spacing" hint="Space between words"><Slider value={t.wordSpacing ?? 1} min={0.2} max={4} step={0.05} onChange={(wordSpacing) => setText({ wordSpacing }, 'ws')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
          <Row label="Line height"><Slider value={t.lineHeight} min={0.8} max={2} step={0.05} onChange={(lineHeight) => setText({ lineHeight }, 'lh')} format={(v) => v.toFixed(2)} /></Row>
          <Row label="Opacity"><Slider value={t.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => setText({ opacity }, 'op')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
        </Section>
        <Section title="Color">
          <FillEditor value={t.fill} onChange={(fill) => setText({ fill }, 'fill')} />
        </Section>
      </TabsContent>

      <TabsContent value="effects">
        <Section title="Stroke">
          <Row label="Width"><Slider value={t.strokeWidth} min={0} max={20} onChange={(strokeWidth) => setText({ strokeWidth }, 'sw')} format={(v) => (v ? `${v}px` : 'Off')} /></Row>
          {t.strokeWidth > 0 && <Row label="Color"><ColorInput value={t.strokeColor} onChange={(strokeColor) => setText({ strokeColor }, 'sc')} /></Row>}
        </Section>
        <Section title="Shadow">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(SHADOW_PRESETS) as ShadowPreset[]).map((p) => (
              <Button key={p} variant="outline" size="sm" onClick={() => setText({ shadowPreset: p, shadow: { ...SHADOW_PRESETS[p], color: t.shadow.color } })}
                className={cn(t.shadowPreset === p && 'border-primary bg-primary/15 text-foreground')}>{SHADOW_LABELS[p]}</Button>
            ))}
          </div>
          {t.shadowPreset !== 'none' && <Row label="Color"><ColorInput value={t.shadow.color} onChange={(color) => setText({ shadow: { ...t.shadow, color } }, 'shc')} /></Row>}
        </Section>
        <Section title="Glow" right={<Toggle checked={t.glow.enabled} onChange={(enabled) => setText({ glow: { ...t.glow, enabled } })} />}>
          {t.glow.enabled ? (
            <>
              <Row label="Match text color"><Toggle checked={t.glow.matchText} onChange={(matchText) => setText({ glow: { ...t.glow, matchText } })} /></Row>
              {!t.glow.matchText && <Row label="Color"><ColorInput value={t.glow.color} onChange={(color) => setText({ glow: { ...t.glow, color } }, 'gc')} /></Row>}
              <Row label="Radius"><Slider value={t.glow.radius} min={2} max={40} onChange={(radius) => setText({ glow: { ...t.glow, radius } }, 'gr')} /></Row>
              <Row label="Strength"><Slider value={t.glow.strength} min={0.1} max={1} step={0.05} onChange={(strength) => setText({ glow: { ...t.glow, strength } }, 'gs')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
            </>
          ) : <p className="text-xs text-muted-foreground">A soft neon halo around the letters.</p>}
        </Section>
        <Section title="Background plate" right={<Toggle checked={t.background.enabled} onChange={(enabled) => setText({ background: { ...t.background, enabled } })} />}>
          {t.background.enabled ? (
            <>
              <Row label="Color"><ColorInput value={t.background.color} onChange={(color) => setText({ background: { ...t.background, color } }, 'bgc')} /></Row>
              <Row label="Opacity"><Slider value={t.background.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => setText({ background: { ...t.background, opacity } }, 'bgo')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
              <Row label="Corner radius"><Slider value={t.background.radius} min={0} max={60} onChange={(radius) => setText({ background: { ...t.background, radius } }, 'bgr')} /></Row>
              <Row label="Padding"><Slider value={t.background.padX} min={0} max={80} onChange={(padX) => setText({ background: { ...t.background, padX, padY: Math.round(padX / 2) } }, 'bgp')} /></Row>
            </>
          ) : <p className="text-xs text-muted-foreground">A box behind the whole caption, like classic TV subtitles.</p>}
        </Section>
      </TabsContent>

      <TabsContent value="script">
        {(['sinhala', 'english'] as const).map((target) => {
          const ov: ScriptOverrides = t[target];
          const setOv = (patch: Partial<ScriptOverrides>, key: string) =>
            setStyle((s) => ({ ...s, text: { ...s.text, [target]: { ...s.text[target], ...patch } } }), `${key}-${target}`);
          return (
            <div key={target}>
              <Section title={target === 'sinhala' ? 'Sinhala words' : 'English words'} right={
                <Button variant="ghost" size="xs" onClick={() => setStyle((s) => ({ ...s, text: { ...s.text, [target]: {} } }))}><RotateCcw />Reset</Button>
              }>
                <Row label="Size"><Slider value={ov.sizeScale ?? 1} min={0.6} max={1.6} step={0.02} onChange={(sizeScale) => setOv({ sizeScale }, 'ov-size')} format={(v) => `${Math.round(v * 100)}%`} /></Row>
                <Row label="Letter spacing"><Slider value={ov.letterSpacing ?? t.letterSpacing} min={-6} max={20} step={0.5} onChange={(letterSpacing) => setOv({ letterSpacing }, 'ov-ls')} /></Row>
                <Row label="Own color"><Toggle checked={!!ov.fill} onChange={(on) => setOv({ fill: on ? t.fill : undefined }, 'ov-fill')} /></Row>
                {ov.fill && <FillEditor value={ov.fill} onChange={(fill) => setOv({ fill }, 'ov-fillv')} />}
                <Row label="Own stroke"><Toggle checked={ov.strokeWidth !== undefined} onChange={(on) => setOv({ strokeWidth: on ? t.strokeWidth : undefined }, 'ov-sw')} /></Row>
                {ov.strokeWidth !== undefined && <Row label="Stroke width"><Slider value={ov.strokeWidth} min={0} max={20} onChange={(strokeWidth) => setOv({ strokeWidth }, 'ov-swv')} /></Row>}
              </Section>
            </div>
          );
        })}
        <p className="px-3 py-3 text-xs text-muted-foreground">Mixed Sinhala + English captions often look best with English slightly smaller (about 90%).</p>
      </TabsContent>
    </Tabs>
  );
}
