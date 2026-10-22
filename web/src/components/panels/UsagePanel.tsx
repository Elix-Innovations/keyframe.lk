import { useCallback, useEffect, useState } from 'react';
import type { UsageRecord, UsageResponse } from '@/types';
import { useEditor } from '@/store';
import { resetUsage, usage } from '@/lib/api';
import { RotateCcw, Trash2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Empty, Section, Spinner } from '../controls';
import { Coins } from '@/components/icons';

const FEATURE_LABELS: Record<string, string> = {
  transcribe: 'Generate captions',
  proofread: 'Proofread',
  english: 'English words',
  emphasis: 'Emphasis',
  hook: 'Hook text',
  description: 'Description',
  broll: 'B-roll plan',
  'music-mood': 'Music mood',
};
const featureLabel = (f: string) => FEATURE_LABELS[f] ?? f;

/** Small amounts need more decimals to be meaningful. */
export function usd(v: number) {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}
const LKR_PER_USD = 300; // rough rate for a quick rupee view
const lkr = (v: number) => `Rs ${(v * LKR_PER_USD).toFixed(v * LKR_PER_USD < 10 ? 2 : 0)}`;
const num = (n: number) => n.toLocaleString();

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-muted/30 p-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-base font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function detail(r: UsageRecord) {
  if (r.audioSeconds !== undefined && !r.inputTokens) return `${Math.round(r.audioSeconds)}s audio`;
  const parts = [`${num(r.inputTokens ?? 0)} in`, `${num(r.outputTokens ?? 0)} out`];
  if (r.thinkingTokens) parts.push(`${num(r.thinkingTokens)} thinking`);
  if (r.audioTokens) parts.push(`${num(r.audioTokens)} audio`);
  return parts.join(' · ');
}

export function UsagePanel() {
  const notify = useEditor((s) => s.notify);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await usage()); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !data) return <Empty icon={<Coins />} title="Usage unavailable">{error}</Empty>;
  if (!data) return <div className="flex justify-center p-6"><Spinner /></div>;

  const t = data.total;
  const features = Object.entries(data.byFeature).sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].requests - a[1].requests);
  const days = Object.entries(data.byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="pb-6">
      <Section title="Totals" right={
        <Button variant="ghost" size="xs" onClick={load} disabled={loading}>{loading ? <Spinner /> : <RotateCcw />}Refresh</Button>
      }>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="API requests" value={num(t.requests)} sub={t.failed ? `${num(t.failed)} failed` : undefined} />
          <Stat label="Estimated cost" value={usd(t.costUsd)} sub={`≈ ${lkr(t.costUsd)}`} />
          <Stat label="Today" value={usd(data.byDay[today]?.costUsd ?? 0)} sub={`${num(data.byDay[today]?.requests ?? 0)} requests`} />
          <Stat label="Tokens" value={num(t.inputTokens + t.outputTokens)} sub={t.audioSeconds ? `${Math.round(t.audioSeconds / 60)} min audio` : undefined} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {data.since ? `Counting since ${new Date(data.since).toLocaleString()}. ` : 'Nothing counted yet. '}
          Costs are estimates from list prices. A free tier can make the real bill $0; check your provider's billing page for the exact amount.
        </p>
      </Section>

      {features.length > 0 && (
        <>
          <Section title="By feature">
            <div className="flex flex-col text-xs">
              {features.map(([f, v]) => (
                <div key={f} className="flex items-center justify-between border-b py-1.5 last:border-0">
                  <span>{featureLabel(f)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{num(v.requests)} req · <span className="text-foreground">{usd(v.costUsd)}</span></span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="By day">
            <div className="flex flex-col text-xs">
              {days.map(([d, v]) => (
                <div key={d} className="flex items-center justify-between border-b py-1.5 last:border-0">
                  <span className="font-mono">{d}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{num(v.requests)} req · <span className="text-foreground">{usd(v.costUsd)}</span></span>
                </div>
              ))}
            </div>
          </Section>
          <Section title={`Recent requests · ${data.recent.length}`}>
            <div className="flex flex-col text-xs">
              {data.recent.map((r) => (
                <div key={r.id} className="flex flex-col gap-0.5 border-b py-1.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className={r.ok ? '' : 'text-destructive'}>{featureLabel(r.feature)}{r.ok ? '' : ' · failed'}</span>
                    <span className="font-mono tabular-nums">{r.costUsd === null ? 'no price' : usd(r.costUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{new Date(r.time).toLocaleTimeString()} · {r.model}</span>
                    <span className="font-mono">{detail(r)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title="Prices used (USD)">
        <div className="flex flex-col text-[11px] text-muted-foreground">
          {Object.entries(data.prices.tokens).map(([m, p]) => (
            <div key={m} className="flex justify-between py-0.5">
              <span className="font-mono">{m}</span>
              <span className="font-mono">${p.in}{p.audioIn ? ` ($${p.audioIn} audio)` : ''} in · ${p.out} out / 1M tokens</span>
            </div>
          ))}
          {Object.entries(data.prices.perMinute).map(([m, p]) => (
            <div key={m} className="flex justify-between py-0.5">
              <span className="font-mono">{m}</span>
              <span className="font-mono">${p.toFixed(4)} / audio minute</span>
            </div>
          ))}
        </div>
      </Section>

      {t.requests > 0 && (
        <div className="px-3">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive"><Trash2 />Reset usage log</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the usage log?</AlertDialogTitle>
                <AlertDialogDescription>Request counts and costs start again from zero. This can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={async () => { await resetUsage(); await load(); notify('Usage log reset.', 'success'); }}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
