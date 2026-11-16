import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert, X } from '@/components/icons';
import { Home } from './components/Home';
import { Editor } from './components/Editor';
import { ConverterSheet } from './components/ConverterSheet';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { lastProjectId, newProject, rememberLastProject, useEditor } from './store';
import * as db from './lib/db';
import { fontFileLooksFM, loadBundledFMFonts, registerCustomFont } from './lib/fonts';

/** `#/new` (e.g. a link from the separately hosted landing site): make a blank project and go straight into the workspace. */
let creatingBlank: Promise<void> | null = null;
function startBlankProject() {
  // Idempotent while in flight: the hash stays '#/new' until the write finishes, and StrictMode re-runs effects.
  creatingBlank ??= (async () => {
    const p = newProject('Untitled project');
    await db.putProject(p);
    location.replace(`#/p/${p.id}`);
  })().finally(() => { creatingBlank = null; });
  return creatingBlank;
}

function parseHash() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  return m ? m[1] : null;
}

/** On launch with no project in the URL, reopen the project that was open when the app was closed. */
function initialProjectId() {
  const fromHash = parseHash();
  if (location.hash === '#/new') return null; // the mount effect creates the project
  if (fromHash || location.hash) return fromHash;
  return lastProjectId();
}

export function App() {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const load = useEditor((s) => s.load);
  const project = useEditor((s) => s.project);
  const notify = useEditor((s) => s.notify);
  const [blocked, setBlocked] = useState(db.isStorageBlocked());
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => db.onStorageBlocked((b) => {
    setBlocked(b);
    if (!b) { setDismissed(false); notify('Saving works again — all changes saved.', 'success'); }
  }), [notify]);

  useEffect(() => {
    const onHash = () => {
      if (location.hash === '#/new') { startBlankProject().catch(console.error); return; }
      setProjectId(parseHash());
      if (location.hash === '#/convert') useEditor.getState().setConverterOpen(true);
    };
    // Put the reopened project in the URL here, not during render: Next.js turns replaceState into a Router update.
    if (!location.hash && projectId) history.replaceState(null, '', `#/p/${projectId}`);
    onHash();
    window.addEventListener('hashchange', onHash);
    // Fonts (bundled FM + user uploads) and saved templates, once per session.
    loadBundledFMFonts();
    db.listFonts().then(async (fonts) => {
      // One-time fix: FM Sinhala fonts added before they could be recognised were filed as English.
      let fixed = false;
      try { fixed = localStorage.getItem('keyframe.fmFontsChecked') === '1'; } catch { /* storage unavailable */ }
      if (!fixed) {
        let writeFailed = false;
        for (const f of fonts) {
          if (f.def.script === 'english' && !f.def.legacy && await fontFileLooksFM(f.blob).catch(() => false)) {
            f.def = { ...f.def, script: 'sinhala', legacy: true };
            // A failed write must not stop the remaining fonts from being registered below.
            try { await db.putFont(f.def, f.blob); } catch (e) { writeFailed = true; console.error(e); }
          }
        }
        if (!writeFailed) try { localStorage.setItem('keyframe.fmFontsChecked', '1'); } catch { /* storage unavailable */ }
      }
      fonts.forEach((f) => registerCustomFont(f.def, f.blob).catch(() => undefined));
    }).catch(console.error);
    db.listTemplates().then((t) => useEditor.getState().setCustomTemplates(t)).catch(console.error);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!projectId) { useEditor.getState().close(); return; }
    if (project?.id === projectId) return;
    db.getProject(projectId).then((p) => {
      if (p) load(p);
      else { rememberLastProject(null); notify('Project not found', 'error'); location.hash = ''; }
    }).catch((e) => { notify(e?.message || 'Could not open the project', 'error'); location.hash = ''; });
  }, [projectId, project?.id, load, notify]);

  return (
    <TooltipProvider delayDuration={300}>
      {blocked && !dismissed && (
        <div role="alert" className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-warn/40 bg-[color-mix(in_oklch,var(--warn)_22%,var(--background))] px-4 py-2 text-sm text-foreground">
          <TriangleAlert className="size-4 shrink-0 text-warn" />
          <div className="flex-1">
            <b>Chrome didn't accept the last save.</b> Your work is safe in this tab and Keyframe.lk is retrying automatically.
            <span className="text-muted-foreground"> If this keeps showing, free some disk space or clear this site's data in chrome://settings/content/all (search “localhost”).</span>
          </div>
          <button className="rounded-md border border-warn/40 px-2 py-0.5 text-xs hover:bg-warn/15" onClick={async () => {
            const ok = await db.retryStorage();
            notify(ok ? 'Saving works again — all changes saved.' : 'Still blocked. Your work is kept in this tab.', ok ? 'success' : 'error');
          }}>Retry now</button>
          <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}
      {projectId ? (
        project?.id === projectId ? <Editor /> : (
          <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        )
      ) : <Home />}
      <ConverterSheet />
      <ShortcutsDialog />
      <Toaster position="bottom-center" richColors closeButton />
    </TooltipProvider>
  );
}
