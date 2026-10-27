import { useState, type ReactNode } from 'react';
import { ChevronDown, Loader2 } from '@/components/icons';
import type { Fill, Gradient } from '@/types';
import { grad } from '@/lib/style';
import { cn } from '@/lib/utils';
import { Slider as UiSlider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress as UiProgress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Thin app-level controls on top of shadcn/ui, so panels stay compact and consistent. */

/** Inspector section: sentence-case header, optional collapse, full-width hairline below. */
export function Section({
  title, children, right, className, collapsible = false, defaultOpen = true,
}: { title: string; children: ReactNode; right?: ReactNode; className?: string; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = <h3 className="truncate text-xs font-medium text-foreground">{title}</h3>;
  return (
    <section className={cn('border-b px-3 py-3', className)}>
      <div className={cn('flex min-h-6 items-center justify-between gap-2', open && 'mb-2.5')}>
        {collapsible ? (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
            className="-ml-1 flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-sidebar-accent">
            <ChevronDown className={cn('size-3 text-muted-foreground transition-transform', !open && '-rotate-90')} />
            {heading}
          </button>
        ) : heading}
        {right}
      </div>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

/** Label | control row. The fixed label column keeps every control on the same vertical line. */
export function Row({ label, children, hint, kf }: { label: string; children: ReactNode; hint?: string; kf?: { on: boolean; toggle: () => void } }) {
  const lbl = (
    <span
      className={cn('w-24 shrink-0 text-xs leading-tight text-muted-foreground', hint && 'cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4')}>
      {label}
    </span>
  );
  return (
    <div className="flex min-h-7 items-center gap-3">
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>{lbl}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-56">{hint}</TooltipContent>
        </Tooltip>
      ) : lbl}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">{children}</div>
      {kf && (
        <button type="button" onClick={kf.toggle} aria-pressed={kf.on} aria-label={kf.on ? 'Remove keyframe here' : 'Add keyframe here'} title={kf.on ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
          className={cn('grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-accent', kf.on ? 'text-primary' : 'text-muted-foreground')}>
          <svg viewBox="0 0 12 12" className="size-3"><path d="M6 1 11 6 6 11 1 6Z" fill={kf.on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </button>
      )}
    </div>
  );
}

/** Slider with a numeric readout box, like an inspector field. */
export function Slider({
  value, min, max, step = 1, onChange, format, width = 'min-w-16 flex-1',
}: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; width?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <UiSlider className={width} min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
      <span className="flex h-6 w-12 shrink-0 items-center justify-end rounded-md bg-muted px-1.5 font-mono text-[11px] tabular-nums text-foreground/90">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />;
}

/** Joined segmented control: muted track, the active option sits raised on it. `fill` stretches to the row. */
export function Segmented<T extends string | number>({
  value, options, onChange, size = 'md', fill = false, className,
}: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; fill?: boolean; className?: string }) {
  return (
    <ToggleGroup type="single" spacing={0} value={String(value)}
      className={cn('gap-0.5 rounded-md bg-muted p-0.5', fill && 'w-full', className)}
      onValueChange={(v) => { if (!v) return; const o = options.find((x) => String(x.value) === v); if (o) onChange(o.value); }}>
      {options.map((o) => (
        <ToggleGroupItem key={String(o.value)} value={String(o.value)}
          className={cn(
            'h-6 min-w-0 rounded-[5px]! border-0 px-2 font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground',
            'data-[state=on]:bg-background data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-foreground/5 dark:data-[state=on]:bg-input',
            size === 'sm' ? 'text-[11px]' : 'text-xs', fill && 'flex-1')}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const SWATCHES = ['#FFFFFF', '#000000', '#FFD400', '#FF8A00', '#FF3B3B', '#FF3CAC', '#3D8BFF', '#5CE1FF', '#39FF14', '#7CFFB2', '#111111', '#2F6BFF'];

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-7 items-center gap-2 rounded-md bg-muted px-2 text-xs hover:bg-accent">
          <span className="size-3.5 rounded-[3px] border border-foreground/20" style={{ background: value }} />
          <span className="font-mono uppercase">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60" align="end">
        <div className="flex flex-col gap-3">
          <input type="color" className="h-24 w-full cursor-pointer rounded-md border-0 bg-transparent p-0" value={value.slice(0, 7)}
            onChange={(e) => onChange(e.target.value.toUpperCase())} />
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => onChange(c)} title={c}
                className={cn('aspect-square rounded-md border border-foreground/15 transition-transform hover:scale-110', value === c && 'ring-2 ring-ring')} style={{ background: c }} />
            ))}
          </div>
          <Input className="h-8 font-mono text-xs uppercase" defaultValue={value} key={value}
            onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase()); }} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function cssFill(fill: Fill) {
  if (!fill.gradient) return fill.color;
  const stops = fill.gradient.stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(', ');
  return `linear-gradient(${fill.gradient.angle}deg, ${stops})`;
}

const GRADIENT_PRESETS: Gradient[] = [
  grad(180, '#FFE259', '#FF8A00', '#F84008'),
  grad(180, '#FFF6B7', '#FFD400', '#E0A100'),
  grad(180, '#FFFFFF', '#D9DDE3', '#9AA3AE'),
  grad(180, '#E0FBFF', '#5CE1FF', '#2A8CFF'),
  grad(90, '#FF3CAC', '#784BA0', '#2B86C5'),
  grad(180, '#B8FF9C', '#39FF14', '#0FA958'),
  grad(180, '#FF9A9E', '#FF3B3B', '#B00020'),
  grad(90, '#F7FF00', '#DB36A4'),
];

/** Solid / gradient fill editor with presets and editable stops. */
export function FillEditor({ value, onChange }: { value: Fill; onChange: (f: Fill) => void }) {
  const g = value.gradient;
  return (
    <div className="flex items-center justify-between gap-2">
      <Segmented size="sm" value={g ? 'gradient' : 'solid'} options={[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]}
        onChange={(m) => onChange(m === 'solid' ? { ...value, gradient: null } : { ...value, gradient: g ?? GRADIENT_PRESETS[0] })} />
      {!g ? (
        <ColorInput value={value.color} onChange={(color) => onChange({ ...value, color })} />
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="h-7 w-24 rounded-md border border-foreground/15" style={{ background: cssFill(value) }} title="Edit gradient" />
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="flex flex-col gap-3">
              <div className="h-8 rounded-md border border-foreground/10" style={{ background: cssFill(value) }} />
              <div className="grid grid-cols-8 gap-1">
                {GRADIENT_PRESETS.map((p, i) => (
                  <button key={i} type="button" className="aspect-square rounded border border-foreground/10 transition-transform hover:scale-110" style={{ background: cssFill({ color: '', gradient: p }) }}
                    onClick={() => onChange({ color: p.stops[Math.floor(p.stops.length / 2)].color, gradient: p })} />
                ))}
              </div>
              <Row label="Angle"><Slider width="w-32" value={g.angle} min={0} max={360} onChange={(angle) => onChange({ ...value, gradient: { ...g, angle } })} format={(v) => `${v}°`} /></Row>
              {g.stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ColorInput value={s.color} onChange={(color) => onChange({ ...value, gradient: { ...g, stops: g.stops.map((x, j) => (j === i ? { ...x, color } : x)) } })} />
                  <UiSlider className="flex-1" min={0} max={1} step={0.01} value={[s.position]}
                    onValueChange={([position]) => onChange({ ...value, gradient: { ...g, stops: g.stops.map((x, j) => (j === i ? { ...x, position } : x)) } })} />
                  <Button variant="ghost" size="icon-xs" disabled={g.stops.length <= 2}
                    onClick={() => onChange({ ...value, gradient: { ...g, stops: g.stops.filter((_, j) => j !== i) } })}>✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => onChange({ ...value, gradient: { ...g, stops: [...g.stops, { color: '#FFFFFF', position: 1 }] } })}>Add stop</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />;
}

export function Progress({ value }: { value: number }) {
  return <UiProgress value={Math.round(value * 100)} className="h-1.5" />;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-3">
      <div className="mt-px text-muted-foreground [&_svg]:size-4">{icon}</div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-xs font-medium">{title}</div>
        {children && <div className="text-xs text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
