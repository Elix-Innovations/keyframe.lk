'use client';

import { ErrorFallback } from '@/components/ErrorBoundary';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="h-dvh bg-background text-foreground"><ErrorFallback title="Something went wrong." error={error} reset={reset} /></div>;
}
