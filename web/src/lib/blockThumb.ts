import { useEffect, useState } from 'react';
import { getBlob } from './db';
import { imageThumb, probeVideo } from './media';

const cache = new Map<string, Promise<string | null>>();

/** A small still of an image or video asset, for timeline blocks. Cached per asset. */
function thumbOf(assetId: string, kind: 'image' | 'video'): Promise<string | null> {
  const key = `${kind}:${assetId}`;
  let p = cache.get(key);
  if (!p) {
    p = getBlob(assetId)
      .then((b) => (!b ? null : kind === 'image' ? imageThumb(b, 480) : probeVideo(b).then((m) => m.thumbnail)))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

export function useBlockThumb(assetId: string | undefined, kind: 'image' | 'video'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (assetId) void thumbOf(assetId, kind).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [assetId, kind]);
  return url;
}

/** Style that tiles a still along a block at the block's height. */
export const thumbStyle = (url: string | null): React.CSSProperties =>
  url ? { backgroundImage: `url(${url})`, backgroundSize: `auto 100%`, backgroundRepeat: 'repeat-x', backgroundPosition: 'left center' } : {};
