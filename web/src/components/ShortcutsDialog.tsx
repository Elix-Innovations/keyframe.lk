import { useEditor } from '@/store';
import { SHORTCUTS, kbd } from '@/lib/shortcuts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

export function Keys({ keys }: { keys: readonly string[] }) {
  return <KbdGroup>{keys.map((k) => <Kbd key={k}>{kbd(k).replace(/\+$/, '')}</Kbd>)}</KbdGroup>;
}

export function ShortcutsDialog() {
  const open = useEditor((s) => s.shortcutsOpen);
  const setOpen = useEditor((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col divide-y">
          {Object.values(SHORTCUTS).map((s) => (
            <div key={s.label} className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{kbd(s.label)}</span>
              <Keys keys={s.keys} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
