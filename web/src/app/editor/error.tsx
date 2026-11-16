'use client';

import { ErrorFallback } from '@/components/ErrorBoundary';

export default function EditorError({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="h-dvh bg-background text-foreground"><ErrorFallback title="The editor hit an error." error={error} reset={reset} /></div>;
}
