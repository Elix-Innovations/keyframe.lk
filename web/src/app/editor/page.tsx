'use client';

import dynamic from 'next/dynamic';

// The editor is browser-only (IndexedDB, File System Access, WebCodecs), so it never renders on the server.
const App = dynamic(() => import('@/App').then((m) => m.App), { ssr: false });

export default function EditorPage() {
  return <App />;
}
