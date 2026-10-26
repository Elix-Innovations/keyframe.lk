import { useEffect, useState } from 'react';
import { Check, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getKeys, saveKeys, type KeyName, type KeyStatus } from '@/lib/api';
import { useEditor } from '@/store';

const FIELDS: { name: KeyName; label: string; hint: string }[] = [
  { name: 'GEMINI_API_KEY', label: 'Google Gemini', hint: 'Transcription + caption AI' },
  { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs', hint: 'Scribe transcription (best for Sinhala)' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI', hint: 'Whisper transcription' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', hint: 'Claude for caption AI' },
];

/** Add, replace or remove the server's API keys. Keys are saved to server/.env and never sent back to the browser. */
export function ApiKeys({ only, onChange }: { only?: KeyName[]; onChange?: () => void }) {
  const notify = useEditor((s) => s.notify);
  const [status, setStatus] = useState<KeyStatus | null | undefined>(undefined);
  const [draft, setDraft] = useState<Partial<Record<KeyName, string>>>({});
  const [busy, setBusy] = useState<KeyName | null>(null);

  useEffect(() => { getKeys().then(setStatus); }, []);

  async function apply(name: KeyName, value: string | null) {
    setBusy(name);
    try {
      setStatus(await saveKeys({ [name]: value }));
      setDraft((d) => ({ ...d, [name]: '' }));
      notify(value ? 'Key saved.' : 'Key removed.', 'success');
      onChange?.();
    } catch (e) { notify((e as Error).message, 'error'); }
    finally { setBusy(null); }
  }

  if (status === null) return <p className="text-xs text-warn">The server is offline, so keys cannot be saved.</p>;
  if (!status) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {FIELDS.filter((f) => !only || only.includes(f.name)).map((f) => {
        const info = status[f.name];
        const v = draft[f.name] ?? '';
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{f.label}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {info.set ? <><Check className="size-3 text-ok" />{info.hint}</> : 'Not set'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Input type="password" autoComplete="off" spellCheck={false} className="h-8 flex-1 font-mono text-xs"
                placeholder={info.set ? 'Paste a new key to replace' : `Paste ${f.label} key`} value={v}
                onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) void apply(f.name, v.trim()); }} />
              <Button size="sm" className="h-8" disabled={!v.trim() || busy === f.name} onClick={() => apply(f.name, v.trim())}>Save</Button>
              {info.set && <Button size="sm" variant="outline" className="h-8 px-2" aria-label={`Remove ${f.label} key`} disabled={busy === f.name} onClick={() => apply(f.name, null)}><X /></Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">{f.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
