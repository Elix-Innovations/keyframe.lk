import { forwardRef, useRef, useSyncExternalStore, type KeyboardEvent, type ClipboardEvent, type TextareaHTMLAttributes } from 'react';
import { Keyboard } from '@/components/icons';
import { wijesekaraKey } from '@/lib/wijesekara';
import { fmToUnicode, hasSinhala } from '@/lib/fm';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Input modes shared by every Sinhala text box in the app:
 *  - unicode:    normal typing (use the OS Sinhala keyboard / IME)
 *  - wijesekara: type on a US keyboard with the Wijesekara layout; converted to Unicode live
 *  - fm:         normal typing, but pasted FM (legacy font) text is converted to Unicode
 */
export type InputMode = 'unicode' | 'wijesekara' | 'fm';

const KEY = 'sincap-input-mode';
const subs = new Set<() => void>();
function readMode(): InputMode {
  try { return (localStorage.getItem(KEY) as InputMode) || 'unicode'; } catch { return 'unicode'; }
}
export function setInputMode(m: InputMode) {
  try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export function useInputMode(): InputMode {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, readMode, readMode);
}

/** Heuristic: pasted text with no Sinhala code points but FM-looking ASCII should be converted. */
function looksLikeFM(text: string) {
  return !hasSinhala(text) && /[a-zA-Z;,.\[\]{}|<>]{3,}/.test(text) && /[fl;kqsdaj]/.test(text);
}

export function InputModeToggle({ className }: { className?: string }) {
  const mode = useInputMode();
  return (
    <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => v && setInputMode(v as InputMode)} className={className}>
      <Tooltip>
        <TooltipTrigger asChild><ToggleGroupItem value="unicode" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">සිං</ToggleGroupItem></TooltipTrigger>
        <TooltipContent>Unicode — type with your OS Sinhala keyboard</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><ToggleGroupItem value="wijesekara" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"><Keyboard className="size-3.5" />Wijesekara</ToggleGroupItem></TooltipTrigger>
        <TooltipContent>Type Wijesekara (FM layout) on an English keyboard — converted to Unicode as you type</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><ToggleGroupItem value="fm" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">FM paste</ToggleGroupItem></TooltipTrigger>
        <TooltipContent>Paste text copied from FM-font documents — converted to Unicode</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
};

/** Textarea that understands Wijesekara typing and FM paste, depending on the global input mode. */
export const SinhalaInput = forwardRef<HTMLTextAreaElement, Props>(function SinhalaInput({ value, onChange, onKeyDown, onPaste, className, ...rest }, fwd) {
  const mode = useInputMode();
  const local = useRef<HTMLTextAreaElement | null>(null);

  const replaceSelection = (el: HTMLTextAreaElement, deleteBack: number, insert: string) => {
    const s = el.selectionStart, e = el.selectionEnd;
    const from = Math.max(0, s - deleteBack);
    const next = value.slice(0, from) + insert + value.slice(e);
    const caret = from + insert.length;
    onChange(next);
    requestAnimationFrame(() => { el.setSelectionRange(caret, caret); });
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || mode !== 'wijesekara' || e.nativeEvent.isComposing) return;
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.currentTarget;
    const r = wijesekaraKey(value.slice(0, el.selectionStart), e.key);
    if (!r) return;
    e.preventDefault();
    replaceSelection(el, r.deleteBack, r.insert);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(e);
    if (e.defaultPrevented || mode === 'unicode') return;
    const text = e.clipboardData.getData('text/plain');
    if (!text || !(mode === 'fm' || looksLikeFM(text))) return;
    e.preventDefault();
    replaceSelection(e.currentTarget, 0, fmToUnicode(text));
  };

  return (
    <Textarea
      ref={(el) => { local.current = el; if (typeof fwd === 'function') fwd(el); else if (fwd) fwd.current = el; }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      onPaste={handlePaste}
      className={cn('sinhala min-h-0 resize-none text-[15px] leading-snug', mode === 'wijesekara' && 'border-primary/50', className)}
      spellCheck={false}
      {...rest}
    />
  );
});
