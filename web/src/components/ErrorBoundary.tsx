'use client';

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Shared fallback for route error pages and in-editor boundaries. */
export function ErrorFallback({ title, error, reset }: { title: string; error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{error.message || 'Unknown error'}</p>
      <p className="max-w-md text-xs text-muted-foreground">Your project autosaves every few seconds, so trying again keeps almost all of your work.</p>
      <Button size="sm" onClick={reset}>Try again</Button>
    </div>
  );
}

/** Keeps a crash in one part of the editor (e.g. the preview) from blanking the whole page. */
export class ErrorBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (error) return <ErrorFallback title={this.props.title} error={error} reset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
