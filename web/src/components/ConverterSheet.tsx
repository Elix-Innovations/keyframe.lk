import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, FileText } from '@/components/icons';
import { useEditor } from '@/store';
import { fmToUnicode, unicodeToFM } from '@/lib/fm';
import { WIJESEKARA_HINTS } from '@/lib/wijesekara';
import { allFonts, cssFamily, ensureFont, getFont, onFontsChanged } from '@/lib/fonts';
import { downloadBlob } from '@/lib/util';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Segmented } from './controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputModeToggle, SinhalaInput } from './SinhalaInput';
import { FmText } from './FmText';

const SAMPLE = 'ශ්‍රී ලංකාවේ හොඳම සිංහල උපසිරැසි';
const TIMING = /^\s*\d+\s*$|-->|^\s*$|^WEBVTT/;

/** Convert only the text lines of an SRT/VTT file; indices and timings are left untouched. */
function convertSubtitleFile(text: string, dir: 'u2fm' | 'fm2u') {
  const fn = dir === 'u2fm' ? unicodeToFM : fmToUnicode;
  return text.replace(/^﻿/, '').split(/\r?\n/).map((l) => (TIMING.test(l) ? l : fn(l))).join('\n');
}

export function ConverterSheet() {
  const open = useEditor((s) => s.converterOpen);
  const setOpen = useEditor((s) => s.setConverterOpen);
  const notify = useEditor((s) => s.notify);
  const [unicode, setUnicode] = useState(SAMPLE);
  const [fm, setFm] = useState(() => unicodeToFM(SAMPLE));
  const [, force] = useState(0);
  const fmFonts = useMemo(() => allFonts().filter((f) => f.legacy), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fontId, setFontId] = useState<string | null>(null);
  const font = fontId ? getFont(fontId) : fmFonts[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const [srtDir, setSrtDir] = useState<'u2fm' | 'fm2u'>('fm2u');

  useEffect(() => onFontsChanged(() => force((n) => n + 1)), []);
  useEffect(() => { if (font) ensureFont(font.id); }, [font]);

  const copy = (t: string, what: string) => navigator.clipboard.writeText(t).then(() => notify(`${what} copied.`, 'success'));

  const onSubtitle = async (f: File) => {
    const out = convertSubtitleFile(await f.text(), srtDir);
    const suffix = srtDir === 'u2fm' ? 'fm' : 'unicode';
    downloadBlob(new Blob(['﻿' + out], { type: 'text/plain;charset=utf-8' }), f.name.replace(/(\.\w+)$/, `.${suffix}$1`));
    notify('Converted subtitle file downloaded.', 'success');
  };

  const [over, setOver] = useState(false);
  useEffect(() => { if (open) fmFonts.forEach((f) => ensureFont(f.id)); }, [open, fmFonts]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-sidebar sm:max-w-md" data-inspector>
        <SheetHeader className="gap-0.5 border-b px-4 py-3">
          <SheetTitle className="text-sm">Unicode ⇄ FM converter</SheetTitle>
          <SheetDescription className="text-xs">Type or paste on either side; the other updates live.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="text" className="gap-0">
          <div className="border-b px-4 py-3">
            <TabsList className="w-full">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="file">Subtitle file</TabsTrigger>
              <TabsTrigger value="keys">Keyboard</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="text" className="flex flex-col">
            <section className="flex flex-col gap-2 px-4 pt-3">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <h3 className="text-xs font-medium">Unicode</h3>
                <div className="flex items-center gap-1">
                  <InputModeToggle />
                  <Button variant="ghost" size="icon-xs" onClick={() => copy(unicode, 'Unicode')} aria-label="Copy Unicode" title="Copy"><Copy /></Button>
                </div>
              </div>
              <SinhalaInput rows={3} value={unicode} onChange={(v) => { setUnicode(v); setFm(unicodeToFM(v)); }}
                className="resize-none border-transparent bg-muted text-base shadow-none dark:bg-muted" />
            </section>
            <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground">
              <span className="h-px flex-1 bg-border" /><ArrowLeftRight className="size-3.5 rotate-90" /><span className="h-px flex-1 bg-border" />
            </div>
            <section className="flex flex-col gap-2 px-4 pb-3">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <h3 className="text-xs font-medium">FM text <span className="font-normal text-muted-foreground">· for legacy fonts</span></h3>
                <Button variant="ghost" size="icon-xs" onClick={() => copy(fm, 'FM text')} aria-label="Copy FM" title="Copy"><Copy /></Button>
              </div>
              <Textarea rows={3} value={fm} spellCheck={false} className="resize-none border-transparent bg-muted font-mono text-xs shadow-none dark:bg-muted"
                onChange={(e) => { setFm(e.target.value); setUnicode(fmToUnicode(e.target.value)); }} />
            </section>

            <section className="flex flex-col gap-2.5 border-t px-4 py-3">
              <div className="flex min-h-6 items-center justify-between">
                <h3 className="text-xs font-medium">Preview</h3>
                {font && <span className="text-[11px] text-muted-foreground">{font.label}</span>}
              </div>
              {font ? (
                <>
                  <div className="min-h-20 rounded-md px-4 py-3" style={{ background: 'radial-gradient(120% 90% at 50% 30%, #3a3f47 0%, #1b1e23 55%, #0d0f12 100%)' }}>
                    <FmText text={fm} font={font} size={30} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {fmFonts.map((f) => (
                      <button key={f.id} type="button" onClick={() => setFontId(f.id)} aria-pressed={f.id === font.id} title={f.label}
                        className={cn('flex flex-col items-center gap-0.5 rounded-md border px-1 pt-1.5 pb-1 transition-colors',
                          f.id === font.id ? 'border-primary bg-primary/10' : 'border-transparent bg-muted hover:border-foreground/20')}>
                        <span className="text-xl leading-tight" style={{ fontFamily: cssFamily(f) }}>{unicodeToFM('සිංහල')}</span>
                        <span className="w-full truncate text-center text-[10px] text-muted-foreground">{f.label.replace(/^FM /, '')}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground">No FM fonts installed. Run <code>npm run fonts:fetch</code>.</p>}
            </section>
          </TabsContent>

          <TabsContent value="file" className="flex flex-col gap-3 px-4 py-3">
            <div className="flex min-h-7 items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">Direction</span>
              <Segmented fill value={srtDir} onChange={setSrtDir} options={[{ value: 'fm2u', label: 'FM → Unicode' }, { value: 'u2fm', label: 'Unicode → FM' }]} />
            </div>
            <button type="button" onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onSubtitle(f); }}
              className={cn('flex flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-8 text-center transition-colors',
                over ? 'border-primary bg-primary/10' : 'hover:border-foreground/25 hover:bg-sidebar-accent/60')}>
              <FileText className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium">{over ? 'Drop to convert' : 'Drop an SRT or VTT file'}</span>
              <span className="text-[11px] text-muted-foreground">or <span className="text-primary">browse</span> · numbers and timings stay untouched</span>
            </button>
            <input ref={fileRef} type="file" accept=".srt,.vtt,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubtitle(f); e.target.value = ''; }} />
          </TabsContent>

          <TabsContent value="keys" className="flex flex-col gap-3 px-4 py-3">
            <p className="text-xs text-muted-foreground">Wijesekara layout: switch any caption box to Wijesekara and type on your normal keyboard.</p>
            <div className="grid grid-cols-6 gap-1">
              {WIJESEKARA_HINTS.map((h) => (
                <div key={h.key + h.u} className="flex flex-col items-center gap-1 rounded-md border-b-2 border-border bg-muted pt-1.5 pb-1">
                  <span className="sinhala text-base leading-none">{h.u}</span>
                  <kbd className="font-mono text-[10px] text-muted-foreground">{h.key}</kbd>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
