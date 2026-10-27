import type { AspectRatio, FitMode } from '@/types';
import { useEditor } from '@/store';
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorInput, Row, Section, Segmented, Slider } from '../controls';

const RATIOS: { value: AspectRatio; label: string }[] = [
  { value: 'original', label: 'Original' }, { value: '9:16', label: '9:16' }, { value: '4:5', label: '4:5' }, { value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' },
];

export function LayoutPanel() {
  const project = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const setStyle = useEditor((s) => s.setStyle);
  const L = project.style.layout;
  const setL = (patch: Partial<typeof L>, key = 'layout') => setStyle((s) => ({ ...s, layout: { ...s.layout, ...patch } }), key);

  return (
    <div>
      <Section title="Caption position">
        <p className="text-xs text-muted-foreground">Tip: drag the caption directly on the video.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([['Top', 18, AlignVerticalJustifyStart], ['Middle', 50, AlignVerticalJustifyCenter], ['Bottom', 76, AlignVerticalJustifyEnd]] as const).map(([label, y, Icon]) => (
            <Button key={label} variant="outline" size="sm" className={cn(Math.abs(L.y - y) < 1 && L.x === 50 && 'border-primary bg-primary/15')} onClick={() => setL({ x: 50, y })}><Icon />{label}</Button>
          ))}
        </div>
        <Row label="Horizontal"><Slider value={L.x} min={0} max={100} step={0.5} onChange={(x) => setL({ x }, 'lx')} format={(v) => `${v}%`} /></Row>
        <Row label="Vertical"><Slider value={L.y} min={0} max={100} step={0.5} onChange={(y) => setL({ y }, 'ly')} format={(v) => `${v}%`} /></Row>
        <Row label="Max width"><Slider value={L.maxWidth} min={30} max={100} onChange={(maxWidth) => setL({ maxWidth }, 'lw')} format={(v) => `${v}%`} /></Row>
        <Row label="Align">
          <Segmented size="sm" value={L.align} onChange={(align) => setL({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
        </Row>
      </Section>
      <Section title="Canvas">
        <Row label="Aspect ratio">
          <Select value={project.aspectRatio} onValueChange={(v) => update((p) => ({ ...p, aspectRatio: v as AspectRatio }))}>
            <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{RATIOS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Video fit">
          <Segmented size="sm" value={project.fit} onChange={(fit: FitMode) => update((p) => ({ ...p, fit }))}
            options={[{ value: 'blur', label: 'Blur' }, { value: 'color', label: 'Color' }, { value: 'contain', label: 'Fit' }, { value: 'cover', label: 'Fill' }]} />
        </Row>
        {project.fit === 'color' && <Row label="Background"><ColorInput value={project.fitColor ?? '#000000'} onChange={(fitColor) => update((p) => ({ ...p, fitColor }), 'fit-color')} /></Row>}
        <p className="text-xs text-muted-foreground">Turn a landscape or square clip into a 9:16 Reel — "Blur fill" puts a blurred copy of the video behind it; "Color" uses a solid colour instead. Both show behind the video during transitions.</p>
      </Section>
    </div>
  );
}
