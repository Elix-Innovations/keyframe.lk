import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Star, Trash2, TriangleAlert } from '@/components/icons';
import type { FontDef } from '@/types';
import { allFonts, cssFamily, ensureFont, favoriteFonts, fontKindOf, getFont, onFontsChanged, previewWeight, removeCustomFont, setCustomFontKind, toggleFavoriteFont, type FontKind } from '@/lib/fonts';
import { unicodeToFM } from '@/lib/fm';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SAMPLE_SI = 'සිංහල අකුරු';
const SAMPLE_EN = 'Captions 2026';

/** Sample text as the font expects it: FM fonts need the legacy encoding. */
function sampleFor(def: FontDef, script: 'sinhala' | 'english') {
  if (script === 'english') return SAMPLE_EN;
  return def.legacy ? unicodeToFM(SAMPLE_SI) : SAMPLE_SI;
}

/** Loads the font the first time its row scrolls into view. */
function FontSample({ def, script, className }: { def: FontDef; script: 'sinhala' | 'english'; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [loadedTick, setLoadedTick] = useState(0); // ensureFont does not notify listeners for a single bundled face, so re-check when it settles
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { void ensureFont(def.id).then(() => setLoadedTick((n) => n + 1)); io.disconnect(); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [def.id]);
  // Until the face is ready the browser would draw the sample in a fallback font (FM text = ASCII gibberish), so wait.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // `check()` is true for families that were never registered, so FM fonts (whose text is ASCII gibberish in a fallback) need a loaded face by name.
    const faceLoaded = () => { for (const face of document.fonts) if (face.family.replace(/"/g, '') === def.family && face.status === 'loaded') return true; return false; };
    const check = () => { if (alive) setReady(def.source === 'system' || (def.legacy ? faceLoaded() : document.fonts.check(`${previewWeight(def)} 17px ${cssFamily(def)}`, sampleFor(def, script)))); };
    check();
    const off = onFontsChanged(check);
    return () => { alive = false; off(); };
  }, [def, script, loadedTick]);
  return (
    <span ref={ref} className={cn('truncate text-[17px] leading-tight', className, !ready && 'opacity-30')} style={{ fontFamily: cssFamily(def), fontWeight: previewWeight(def) }}>
      {ready || !def.legacy ? sampleFor(def, script) : '…'}
    </span>
  );
}

const GROUPS: { key: string; label: string; test: (f: FontDef) => boolean }[] = [
  { key: 'unicode', label: 'Sinhala Unicode', test: (f) => f.script === 'sinhala' && !f.legacy && f.source !== 'custom' },
  { key: 'fm', label: 'Sinhala FM (legacy, auto-converted)', test: (f) => !!f.legacy && f.source === 'bundled' },
  { key: 'custom', label: 'My fonts', test: (f) => f.source === 'custom' },
  { key: 'english', label: 'English', test: (f) => f.script === 'english' && f.source !== 'custom' },
  { key: 'system', label: 'System', test: (f) => f.script === 'both' },
];

export function FontPicker({
  value, script, onChange, allowInherit, className,
}: { value: string | null; script: 'sinhala' | 'english'; onChange: (id: string | null) => void; allowInherit?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => onFontsChanged(() => force((n) => n + 1)), []);
  const fonts = allFonts().filter((f) => f.script === script || f.script === 'both' || f.source === 'custom'); // your own fonts are offered in both lists, whatever they were detected as
  const current = value ? getFont(value) : null;
  const fav = favoriteFonts();
  const favList = fonts.filter((f) => fav.has(f.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open}
          className={cn('flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md bg-muted px-2 text-left text-xs hover:bg-accent', className)}>
          <span className="min-w-0 truncate">
            {current ? (
              <span className="flex items-center gap-1.5">
                <span className="truncate">{current.label}</span>
                {current.legacy && <Badge variant="secondary" className="h-4 px-1 text-[10px]">FM</Badge>}
              </span>
            ) : <span className="text-muted-foreground">{allowInherit ?? 'Choose font'}</span>}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search fonts…" />
          <CommandList className="max-h-96">
            <CommandEmpty>No fonts found.</CommandEmpty>
            {allowInherit && (
              <CommandGroup>
                <CommandItem value={`__inherit ${allowInherit}`} onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className={cn('size-4', value === null ? 'opacity-100' : 'opacity-0')} />
                  {allowInherit}
                </CommandItem>
              </CommandGroup>
            )}
            {[{ key: 'fav', label: 'Favorites', test: (f: FontDef) => fav.has(f.id) }, ...GROUPS].map((g) => {
              const list = g.key === 'fav' ? favList : fonts.filter(g.test);
              if (!list.length) return null;
              return (
                <CommandGroup key={g.key} heading={g.label}>
                  {list.map((f) => (
                    <CommandItem key={`${g.key}-${f.id}`} value={`${f.label} ${f.id}`} onSelect={() => { onChange(f.id); setOpen(false); }} className="items-start py-2">
                      <Check className={cn('mt-1 size-4', value === f.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{f.label}</span>
                          {f.legacy && f.licenseKnown === false && (
                            <Tooltip>
                              <TooltipTrigger asChild><TriangleAlert className="size-3 text-warn" /></TooltipTrigger>
                              <TooltipContent>Free download with unclear licence terms. {f.license}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <FontSample def={f} script={script} />
                        {f.source === 'custom' && (
                          <div className="mt-1 flex items-center gap-1" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
                            {([['unicode', 'Unicode සිං'], ['fm', 'FM'], ['english', 'English']] as [FontKind, string][]).map(([k, label]) => (
                              <button key={k} type="button" title={k === 'fm' ? 'Old ASCII-mapped Sinhala font (FM, Tharu…)' : k === 'unicode' ? 'Modern Unicode Sinhala font' : 'Latin letters only'}
                                onClick={() => void setCustomFontKind(f.id, k)}
                                className={cn('rounded px-1.5 py-0.5 text-[10px]', fontKindOf(f) === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent')}>{label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {f.source === 'custom' && (
                        <button type="button" aria-label={`Remove ${f.label}`} title="Remove this font"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); void removeCustomFont(f.id); }}
                          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="size-4" /></button>
                      )}
                      <button type="button" aria-label={fav.has(f.id) ? `Remove ${f.label} from favorites` : `Add ${f.label} to favorites`} aria-pressed={fav.has(f.id)}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteFont(f.id); }}
                        className={cn('mt-0.5 shrink-0 rounded p-0.5 hover:bg-accent', fav.has(f.id) ? 'text-amber-400' : 'text-muted-foreground/50')}>
                        <Star className={cn('size-4', fav.has(f.id) && 'fill-current')} />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
