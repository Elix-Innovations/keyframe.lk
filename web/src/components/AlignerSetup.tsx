import { Check, Download, TriangleAlert, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ALIGNER_BUSY, desktopAligner, type AlignerState } from '@/lib/desktop';

/**
 * Install / progress / retry for the desktop app's caption-timing aligner (Python + PyTorch + speech model). Everything it
 * needs is downloaded by the app itself, so this works on a computer with nothing installed. `compact` fits a popover
 * row or a panel; the full form explains what is being installed.
 */
export function AlignerSetup({ state, compact, className }: { state: AlignerState | null; compact?: boolean; className?: string }) {
  const bridge = desktopAligner();
  if (!bridge || !state) return null;
  const busy = ALIGNER_BUSY.includes(state.phase);
  const install = () => { bridge.install().catch(() => {}); };

  if (state.phase === 'ready') {
    return <div className={cn('flex items-center gap-1.5 text-xs text-ok', className)}><Check className="size-3.5" />Accurate caption timing is on</div>;
  }

  if (state.phase === 'unsupported') {
    return <p className={cn('text-xs text-muted-foreground', className)}>{state.message}</p>;
  }

  if (busy) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{state.message || 'Setting up…'}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{state.percent}%</span>
        </div>
        <Progress value={state.percent} />
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{state.detail || (compact ? '' : 'You can keep editing while this runs.')}</span>
          {state.phase !== 'starting' && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bridge.cancel().catch(() => {})}>
              <X className="size-3" />Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-start gap-1.5 text-xs text-warn"><TriangleAlert className="mt-px size-3.5 shrink-0" />{state.message}</div>
        {state.error && (
          <pre className="max-h-28 overflow-auto rounded-md bg-muted/60 p-2 text-[10.5px] leading-snug whitespace-pre-wrap text-muted-foreground">{state.error}</pre>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={install}>Retry</Button>
          {state.link && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bridge.openLink().catch(() => {})}>Get the missing component</Button>}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => bridge.openLog().catch(() => {})}>Show log</Button>
        </div>
      </div>
    );
  }

  // missing
  return (
    <div className={cn('space-y-2', className)}>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Matches every caption word to the voice exactly. Keyframe downloads what it needs (Python, PyTorch and a speech
          model, about 1.5 GB) once. Nothing else has to be installed, and you can keep editing meanwhile.
        </p>
      )}
      <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={install}>
        <Download className="size-3.5" />{state.interrupted ? 'Resume install' : compact ? 'Install' : 'Install accurate caption timing'}
      </Button>
    </div>
  );
}
