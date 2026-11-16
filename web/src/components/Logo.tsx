import { cn } from '@/lib/utils';

/** The Keyframe.lk mark (public/logo.png): a "K" with a keyframe diamond on a rose tile (public/logo.svg; PNGs are rendered from it). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img src="/logo.png" width={size} height={size} alt="" aria-hidden="true" draggable={false}
      className={cn('shrink-0 select-none object-contain', className)} />
  );
}

/** Brand lockup: the mark plus an optional "Keyframe.lk" wordmark. */
export function Logo({ size = 28, withWordmark = false, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label="Keyframe.lk">
      <LogoMark size={size} />
      <span className="flex items-baseline leading-none tracking-tight" style={{ fontSize: Math.max(14, size * 0.56) }}>
        <span className="font-semibold">Keyframe</span>
        <span className="font-semibold text-primary">.lk</span>
      </span>
    </span>
  );
}
