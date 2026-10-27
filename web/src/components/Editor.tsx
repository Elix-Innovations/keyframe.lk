import { useEffect, type ComponentType } from 'react';
import {
  Activity, ArrowLeft, Captions, CloudCheck, Download, Ellipsis, Film, Frame, Highlighter, Keyboard, Languages,
  Coins, LayoutTemplate, Loader2, Redo2, Save, Sparkles, Type, Undo2, WandSparkles,
} from '@/components/icons';
import { useDefaultLayout } from 'react-resizable-panels';
import { groupSelection, allSelectableIds, deleteSelection, splitSelection } from '@/lib/multiSelect';
import { useEditor, selectors, saveNow, LEFT_PANELS, PANELS, INSPECTOR_TABS, inspectorContext, type PanelId } from '@/store';
import { currentTime, playInToOut, seek, togglePlay } from '@/lib/player';
import { splitCaptionAt, mergeCaptions, shiftCaptions } from '@/lib/segment';
import { outputSize } from '@/render/compose';
import { SHORTCUTS, type ShortcutId } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { clipOps } from './ClipLane';
import { Keys } from './ShortcutsDialog';
import { CaptionsPanel } from './panels/CaptionsPanel';
import { TemplatesPanel } from './panels/TemplatesPanel';
import { MotionPanel } from './panels/MotionPanel';
import { StylePanel } from './panels/StylePanel';
import { DisplayPanel } from './panels/DisplayPanel';
import { AnimationPanel } from './panels/AnimationPanel';
import { LayoutPanel } from './panels/LayoutPanel';
import { AIPanel } from './panels/AIPanel';
import { AudioPanel } from './panels/AudioPanel';
import { Music, Volume } from './icons-audio';
import { ExportPanel } from './panels/ExportPanel';
import { UsagePanel } from './panels/UsagePanel';
import { MediaPanel } from './panels/MediaPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { TransitionsPanel } from './panels/TransitionsPanel';
import { ClipPanel, ClipAudioPanel, SpeedPanel } from './panels/ClipPanel';
import { ClipAnimPanel } from './panels/ClipAnimPanel';
import { AdjustPanel } from './panels/AdjustPanel';
import { AdjItemPanel } from './panels/AdjItemPanel';
import { OverlaysPanel } from './panels/OverlaysPanel';
import { SoundsPanel } from './panels/SoundsPanel';
import { OverlayItemPanel } from './panels/OverlayItemPanel';
import { overlayOps } from './OverlayLane';
import { trackOps } from '@/lib/sounds';
import { canCopy, copyEdits, copySelection, cutSelection, hasClipboard, pasteAtPlayhead, pasteAttributes, pasteEdits } from '@/lib/clipboard';
import { adjOps } from './AdjLane';
import { useLibQuery } from '@/lib/libQuery';
import { Search } from '@/components/icons';

const META: Record<PanelId, { label: string; title: string; icon: ComponentType<{ className?: string }> }> = {
  media: { label: 'Media', title: 'Media', icon: Film },
  captions: { label: 'Captions', title: 'Captions', icon: Captions },
  sounds: { label: 'Sounds', title: 'Sound effects', icon: Volume },
  overlays: { label: 'Text', title: 'Text, stickers & images', icon: Type },
  overlay: { label: 'Overlay', title: 'Text, sticker or image overlay', icon: Type },
  transitions: { label: 'Transitions', title: 'Transitions', icon: Activity },
  effects: { label: 'Effects', title: 'Effects', icon: WandSparkles },
  filters: { label: 'Filters', title: 'Filters', icon: Sparkles },
  templates: { label: 'Templates', title: 'Templates', icon: LayoutTemplate },
  motion: { label: 'Graphics', title: 'Motion graphics and transitions', icon: Sparkles },
  style: { label: 'Style', title: 'Text style', icon: Type },
  display: { label: 'Display', title: 'Display mode', icon: Highlighter },
  animation: { label: 'Motion', title: 'Caption motion', icon: Activity },
  layout: { label: 'Layout', title: 'Layout & canvas', icon: Frame },
  clip: { label: 'Video', title: 'Video: transform, crop, keyframes, remove background', icon: Film },
  caudio: { label: 'Audio', title: 'Clip audio: volume, fades, noise', icon: Volume },
  cspeed: { label: 'Speed', title: 'Clip speed and duration', icon: Activity },
  canim: { label: 'Animation', title: 'Clip animation: in, out, combo', icon: Sparkles },
  adjust: { label: 'Adjust', title: 'Colour: basic, HSL, curves, colour wheel', icon: Sparkles },
  layer: { label: 'Filter / FX', title: 'Filter or effect clip', icon: WandSparkles },
  audio: { label: 'Audio', title: 'Music & audio', icon: Music },
  ai: { label: 'AI', title: 'AI tools', icon: Sparkles },
  usage: { label: 'Usage', title: 'API usage & cost', icon: Coins },
  export: { label: 'Export', title: 'Export', icon: Download },
};

function PanelBody({ id }: { id: PanelId }) {
  const ovlId = useEditor((s) => s.selectedOverlayId);
  switch (id) {
    case 'media': return <MediaPanel />;
    case 'captions': return <CaptionsPanel />;
    case 'overlays': return <OverlaysPanel />;
    case 'sounds': return <SoundsPanel />;
    case 'overlay': return <OverlayItemPanel key={ovlId ?? ''} />;
    case 'transitions': return <TransitionsPanel />;
    case 'effects': return <EffectsPanel />;
    case 'filters': return <FiltersPanel />;
    case 'templates': return <TemplatesPanel />;
    case 'motion': return <MotionPanel />;
    case 'style': return <StylePanel />;
    case 'display': return <DisplayPanel />;
    case 'animation': return <AnimationPanel />;
    case 'layout': return <LayoutPanel />;
    case 'clip': return <ClipPanel />;
    case 'caudio': return <ClipAudioPanel />;
    case 'cspeed': return <SpeedPanel />;
    case 'canim': return <ClipAnimPanel />;
    case 'adjust': return <AdjustPanel />;
    case 'layer': return <AdjItemPanel />;
    case 'audio': return <AudioPanel />;
    case 'ai': return <AIPanel />;
    case 'usage': return <UsagePanel />;
    case 'export': return <ExportPanel />;
  }
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function IconButton({ label, shortcut, onClick, disabled, children }: { label: string; shortcut?: ShortcutId; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">{label}{shortcut && <Keys keys={SHORTCUTS[shortcut].keys} />}</TooltipContent>
    </Tooltip>
  );
}

/** Horizontal icon + label tabs along the top of a pane, like Concat's media and inspector panes. */
function TabStrip({ ids, active, onPick }: { ids: PanelId[]; active: PanelId; onPick: (id: PanelId) => void }) {
  return (
    <div role="tablist" className="flex shrink-0 gap-0.5 overflow-x-auto border-b bg-sidebar p-1.5">
      {ids.map((id) => {
        const M = META[id];
        const on = active === id;
        const n = PANELS.indexOf(id) + 1;
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button role="tab" aria-selected={on} onClick={() => onPick(id)}
                className={cn('flex min-w-14 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] leading-none transition-colors',
                  on ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground')}>
                <M.icon className={cn('size-[17px]', on && 'text-primary')} />
                {M.label}
              </button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">{M.title}{n <= 9 && <Keys keys={[String(n)]} />}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** CapCut-style vertical category rail for the library. */
function LibraryRail({ active, onPick }: { active: PanelId; onPick: (id: PanelId) => void }) {
  return (
    <div role="tablist" aria-orientation="vertical" className="flex w-16 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-sidebar p-1">
      {LEFT_PANELS.map((id) => {
        const M = META[id], on = active === id, n = PANELS.indexOf(id) + 1;
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button role="tab" aria-selected={on} onClick={() => onPick(id)}
                className={cn('flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] leading-none transition-colors', on ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground')}>
                <M.icon className={cn('size-[18px]', on && 'text-primary')} />
                {M.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">{M.title}{n <= 9 && <Keys keys={[String(n)]} />}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Search box shared by the tile libraries; it clears when you switch category. */
function LibrarySearch({ id }: { id: PanelId }) {
  const q = useLibQuery((s) => s.q), set = useLibQuery((s) => s.set);
  useEffect(() => { set(''); }, [id, set]);
  if (id !== 'effects' && id !== 'filters' && id !== 'transitions') return null;
  return (
    <div className="shrink-0 border-b p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => set(e.target.value)} placeholder={`Search ${META[id].label.toLowerCase()}`} className="h-8 pl-7 text-xs" />
      </div>
    </div>
  );
}

export function Editor() {
  const project = useEditor((s) => s.project)!;
  const panel = useEditor((s) => s.panel);
  const setPanel = useEditor((s) => s.setPanel);
  const update = useEditor((s) => s.update);
  const canUndo = useEditor(selectors.canUndo);
  const canRedo = useEditor(selectors.canRedo);
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const savedAt = useEditor((s) => s.savedAt);
  const setConverterOpen = useEditor((s) => s.setConverterOpen);
  const setShortcutsOpen = useEditor((s) => s.setShortcutsOpen);
  const outer = useDefaultLayout({ id: 'kf-editor-v2', storage: localStorage });
  const inner = useDefaultLayout({ id: 'kf-editor-h3', storage: localStorage });
  // Left pane: the library. Right pane: an inspector whose tabs follow what is selected on the timeline, like CapCut.
  const ctx = useEditor((s) => inspectorContext(s));
  const rightTabs = INSPECTOR_TABS[ctx];
  const leftActive: PanelId = LEFT_PANELS.includes(panel) ? panel : (useEditor.getState().lastLeft ?? 'media');
  const lastRight = useEditor.getState().lastRight;
  const rightActive: PanelId = rightTabs.includes(panel) || panel === 'usage' || panel === 'export' ? panel : lastRight && rightTabs.includes(lastRight) ? lastRight : rightTabs[0];
  // Selecting something new brings up its own first tab.
  const sig = useEditor((s) => `${inspectorContext(s)}:${s.selectedOverlayId ?? s.selectedAdjId ?? s.selectedClipId ?? s.selectedCaptionId ?? ''}`);
  useEffect(() => { if (ctx !== 'none') useEditor.getState().setPanel(INSPECTOR_TABS[ctx][0]); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = outputSize(project);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); st.setConverterOpen(!st.converterOpen); return; }
      // Copy / cut / paste on the timeline (⌘C, ⌘X, ⌘V; ⌥⌘V pastes a video clip as an overlay; ⇧⌘V pastes only the look).
      if (mod && !isTyping(e) && !window.getSelection()?.toString()) {
        if (e.altKey && e.code === 'KeyC') { e.preventDefault(); copyEdits(); return; }
        if (e.altKey && e.shiftKey && e.code === 'KeyV') { e.preventDefault(); pasteEdits(); return; }
        if (e.code === 'KeyG') { e.preventDefault(); groupSelection(e.shiftKey ? true : undefined); return; }
        if (e.code === 'KeyA' && st.project) { e.preventDefault(); st.setMulti(allSelectableIds(st.project)); return; }
        if (e.code === 'KeyC' && canCopy()) { e.preventDefault(); copySelection(); return; }
        if (e.code === 'KeyX' && canCopy()) { e.preventDefault(); cutSelection(); return; }
        if (e.code === 'KeyV' && hasClipboard()) { e.preventDefault(); if (e.shiftKey) pasteAttributes(); else pasteAtPlayhead(e.altKey); return; }
      }
      if (isTyping(e) || mod) return;
      const p = st.project;
      if (!p) return;
      const sel = p.captions.find((c) => c.id === st.selectedCaptionId) ?? null;
      if (/^[1-9]$/.test(e.key)) { st.setPanel(PANELS[Number(e.key) - 1]); return; }
      // In / Out preview range, like Premiere: I and O mark at the playhead, ⌥I / ⌥O / ⌥X clear, ⇧/ plays In to Out.
      if (e.code === 'KeyI' || e.code === 'KeyO' || (e.altKey && e.code === 'KeyX') || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        const t = currentTime();
        const { markIn, markOut } = st;
        if (e.code === 'Slash') playInToOut();
        else if (e.code === 'KeyX') st.setMarks(null, null);
        else if (e.code === 'KeyI') {
          if (e.altKey) st.setMarks(null, markOut);
          else st.setMarks(t, markOut !== null && markOut <= t ? null : markOut);
        } else if (e.altKey) st.setMarks(markIn, null);
        else st.setMarks(markIn !== null && markIn >= t ? null : markIn, t);
        return;
      }
      switch (e.key) {
        case '?': st.setShortcutsOpen(true); break;
        case 'b': case 'B': st.setBefore(!st.before); break;
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          if (e.altKey && sel) st.setCaptions(shiftCaptions(p.captions, [sel.id], dir * 0.03), 'nudge');
          else seek(currentTime() + dir * (e.shiftKey ? 1 : 1 / 30));
          break;
        }
        case 's': case 'S': {
          if (splitSelection()) break;
          if (st.selectedTrackId) { trackOps.splitAtPlayhead(); break; }
          if (st.selectedOverlayId) { overlayOps.splitAtPlayhead(); break; }
          if (st.selectedAdjId) { adjOps.splitAtPlayhead(); break; }
          if (st.selectedClipId) { clipOps.splitAtPlayhead(); break; }
          const t = currentTime();
          const target = p.captions.find((c) => t > c.start && t < c.end);
          const parts = target && splitCaptionAt(target, t);
          if (target && parts) st.setCaptions(p.captions.flatMap((c) => (c.id === target.id ? parts : [c])));
          break;
        }
        case 'm': case 'M': {
          if (!sel) break;
          const i = p.captions.findIndex((c) => c.id === sel.id);
          const next = p.captions[i + 1];
          if (next) st.setCaptions([...p.captions.slice(0, i), mergeCaptions(sel, next), ...p.captions.slice(i + 2)]);
          break;
        }
        case 'Delete': case 'Backspace':
          if (deleteSelection()) break;
          if (st.selectedTrackId) { trackOps.remove(st.selectedTrackId); break; }
          if (st.selectedOverlayId) {
            const gone = new Set([st.selectedOverlayId, ...st.extraOverlayIds]); // everything picked in the preview goes together
            st.setOverlays((l) => l.filter((o) => !gone.has(o.id)));
            st.selectOverlay(null);
            break;
          }
          if (st.selectedAdjId) { adjOps.remove(st.selectedAdjId); break; }
          if (st.selectedClipId) { clipOps.remove(st.selectedClipId); break; }
          if (sel) { st.setCaptions(p.captions.filter((c) => c.id !== sel.id)); st.select(null); }
          break;
        case 'Escape': st.select(null); st.selectClip(null); st.selectAdj(null); st.selectOverlay(null); st.selectTrack(null); st.setMulti([]); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-clip bg-stage">
      <header className="relative flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton label="All projects" onClick={() => { location.hash = ''; }}><ArrowLeft /></IconButton>
        <Logo size={24} />
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <Input className="h-8 w-56 border-transparent bg-transparent text-center font-medium shadow-none hover:border-border focus-visible:border-ring dark:bg-transparent"
            value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'rename')} aria-label="Project name" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                {saving ? <Loader2 className="size-3 animate-spin" /> : dirty ? <span className="mx-0.5 size-1.5 rounded-full bg-warn" /> : <CloudCheck className="size-3 text-ok" />}
                {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Autosaves every 5 seconds{savedAt ? ` · last saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Save now" shortcut="save" disabled={!dirty && !saving} onClick={() => void saveNow()}><Save /></IconButton>
          <IconButton label="Undo" shortcut="undo" disabled={!canUndo} onClick={() => useEditor.getState().undo()}><Undo2 /></IconButton>
          <IconButton label="Redo" shortcut="redo" disabled={!canRedo} onClick={() => useEditor.getState().redo()}><Redo2 /></IconButton>
          <IconButton label="Unicode ⇄ FM converter" shortcut="converter" onClick={() => setConverterOpen(true)}><Languages /></IconButton>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More"><Ellipsis /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setConverterOpen(true)}><Languages />Unicode ⇄ FM converter<DropdownMenuShortcut>⌘K</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}><Keyboard />Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPanel('usage')}><Coins />API usage & cost</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { location.hash = ''; }}><ArrowLeft />All projects</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="ml-1 rounded-lg px-3 shadow-md shadow-primary/30" onClick={() => setPanel('export')}><Download />Export</Button>
        </div>
      </header>

      <ResizablePanelGroup orientation="vertical" defaultLayout={outer.defaultLayout} onLayoutChanged={outer.onLayoutChanged} className="min-h-0 flex-1 px-2 pb-2">
        <ResizablePanel id="work" defaultSize="64" minSize="35">
          <ResizablePanelGroup orientation="horizontal" defaultLayout={inner.defaultLayout} onLayoutChanged={inner.onLayoutChanged} className="h-full">
            <ResizablePanel id="library" defaultSize="28" minSize="300px" maxSize="45">
              <div className="pane flex h-full flex-col" data-inspector>
                <div className="flex min-h-0 flex-1">
                  <LibraryRail active={leftActive} onPick={setPanel} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <LibrarySearch id={leftActive} />
                    <ScrollArea className="min-h-0 flex-1"><PanelBody id={leftActive} /></ScrollArea>
                  </div>
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle className="bg-transparent" />
            <ResizablePanel id="stage" minSize="25">
              <div className="pane flex h-full flex-col bg-card">
                <div className="flex h-10 shrink-0 items-center justify-between border-b px-4">
                  <h2 className="text-[13px] font-semibold">Preview</h2>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{out.width} × {out.height}</span>
                </div>
                <div className="min-h-0 flex-1"><Preview /></div>
              </div>
            </ResizablePanel>
            <ResizableHandle className="bg-transparent" />
            <ResizablePanel id="inspector" defaultSize="26" minSize="300px" maxSize="45">
              <div className="pane flex h-full flex-col" data-inspector>
                <TabStrip ids={panel === 'usage' ? [...rightTabs, 'usage'] : rightTabs} active={rightActive} onPick={setPanel} />
                <ScrollArea className="min-h-0 flex-1"><PanelBody id={rightActive} /></ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle className="bg-transparent" />
        <ResizablePanel id="timeline" defaultSize="36" minSize="170px" maxSize="65">
          <div className="pane h-full"><Timeline /></div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
