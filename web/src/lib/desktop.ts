import { useEffect, useState } from 'react';

/** Caption-timing setup state, as reported by the desktop app (desktop/aligner.js). */
export type AlignerPhase =
  | 'missing' | 'checking' | 'python' | 'packages' | 'verifying' | 'model' | 'starting' | 'ready' | 'failed' | 'unsupported';

export type AlignerState = {
  phase: AlignerPhase;
  /** 0..100 over the whole install. */
  percent: number;
  message: string;
  /** e.g. "512 MB of 1203 MB". */
  detail: string;
  error: string;
  /** A help link for the error (e.g. the Visual C++ runtime download). */
  link?: string;
  /** A previous install was cancelled or the app quit during it; installing again resumes. */
  interrupted: boolean;
  /** Already installed; the service is starting up (no install to offer). */
  booting?: boolean;
  logPath: string;
};

type AlignerBridge = {
  status(): Promise<AlignerState>;
  install(): Promise<AlignerState>;
  cancel(): Promise<AlignerState>;
  openLog(): Promise<void>;
  openLink(): Promise<void>;
  onChange(cb: (s: AlignerState) => void): () => void;
};

declare global {
  interface Window { keyframeDesktop?: { aligner: AlignerBridge } }
}

/** The desktop app's caption-timing installer, or undefined in a browser (where `npm run align:fetch` sets it up). */
export const desktopAligner = (): AlignerBridge | undefined => (typeof window === 'undefined' ? undefined : window.keyframeDesktop?.aligner);

export const ALIGNER_BUSY: AlignerPhase[] = ['checking', 'python', 'packages', 'verifying', 'model', 'starting'];

/** Live installer state (null until known, and always null outside the desktop app). */
export function useAlignerSetup(): AlignerState | null {
  const [state, setState] = useState<AlignerState | null>(null);
  useEffect(() => {
    const bridge = desktopAligner();
    if (!bridge) return;
    let alive = true;
    const off = bridge.onChange((s) => { if (alive) setState(s); });
    bridge.status().then((s) => { if (alive) setState((prev) => prev ?? s); }).catch(() => {});
    return () => { alive = false; off(); };
  }, []);
  return state;
}
