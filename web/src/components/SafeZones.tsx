import type { CSSProperties, ReactNode } from 'react';

/** Where each app covers the frame, in % of the frame. Approximate; apps change their UI. */
export const SAFE_ZONES = {
  tiktok: { label: 'TikTok', top: 13, bottom: 25, right: 15, rightFrom: 40, left: 0 },
  reels: { label: 'Instagram Reels', top: 14, bottom: 22, right: 14, rightFrom: 42, left: 0 },
  facebook: { label: 'Facebook Reels', top: 12, bottom: 20, right: 12, rightFrom: 44, left: 0 },
  shorts: { label: 'YouTube Shorts', top: 10, bottom: 22, right: 16, rightFrom: 38, left: 0 },
  all: { label: 'All apps (safest)', top: 14, bottom: 25, right: 16, rightFrom: 38, left: 6 },
} as const;
export type SafeZoneId = keyof typeof SAFE_ZONES;

const W = 'rgba(255,255,255,0.82)';
const dim = 'rgba(255,255,255,0.55)';

/** Sizes use `cqw` (1% of the preview width) so the mock UI scales with the frame. */
const cq = (n: number) => `${n}cqw`;

function Icon({ glyph, label, size = 7.5 }: { glyph: ReactNode; label?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: cq(0.6) }}>
      <div style={{ width: cq(size), height: cq(size), display: 'grid', placeItems: 'center', color: W, filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }}>{glyph}</div>
      {label && <span style={{ fontSize: cq(2.6), color: W, textShadow: '0 0 3px rgba(0,0,0,.7)' }}>{label}</span>}
    </div>
  );
}

const svg = (d: string, fill = true): ReactNode => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const HEART = svg('M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.3 4.5c2 0 3.6 1.1 4.4 2.6h2.6c.8-1.5 2.4-2.6 4.4-2.6 3.6 0 5.4 3.9 3.9 7.3C19.5 16.4 12 21 12 21z');
const COMMENT = svg('M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z');
const SHARE = svg('M4 12l16-8-6 17-3-7-7-2z');
const SAVE = svg('M6 3h12v18l-6-4-6 4z');
const DOTS = svg('M5 12h.01M12 12h.01M19 12h.01', false);
const THUMB_DOWN = svg('M10 14V4H4v10zm0 0l4 6c1.6 0 2-1 1.7-2.4L15 15h5l-1-9h-9');
const REMIX = svg('M4 7h12l-3-3M20 17H8l3 3', false);
const SEARCH = svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4-4', false);
const CAMERA = svg('M4 7h3l2-2h6l2 2h3v12H4z', false);

function Avatar({ plus, size = 8.5 }: { plus?: boolean; size?: number }) {
  return (
    <div style={{ position: 'relative', width: cq(size), height: cq(size) }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg,#9aa,#566)', border: `${cq(0.5)} solid #fff` }} />
      {plus && <div style={{ position: 'absolute', left: '50%', bottom: cq(-1.6), transform: 'translateX(-50%)', width: cq(3.6), height: cq(3.6), borderRadius: '50%', background: '#fe2c55', color: '#fff', fontSize: cq(3), display: 'grid', placeItems: 'center', lineHeight: 1 }}>+</div>}
    </div>
  );
}

function Disc({ square }: { square?: boolean }) {
  return <div style={{ width: cq(7.5), height: cq(7.5), borderRadius: square ? cq(1.6) : '50%', background: 'conic-gradient(#222,#777,#222,#777,#222)', border: `${cq(0.6)} solid rgba(255,255,255,.8)` }} />;
}

const bar = (w: number, strong = false): CSSProperties => ({ height: cq(strong ? 2.8 : 2.3), width: `${w}%`, borderRadius: cq(1.2), background: strong ? W : dim });

function Rail({ children, bottom, gap = 4.2 }: { children: ReactNode; bottom: number; gap?: number }) {
  return <div style={{ position: 'absolute', right: cq(2.2), bottom: `${bottom}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: cq(gap) }}>{children}</div>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span style={{ border: `${cq(0.4)} solid ${W}`, color: W, fontSize: cq(2.8), padding: `${cq(0.5)} ${cq(2.2)}`, borderRadius: cq(1.4) }}>{children}</span>;
}

/** Bottom-left block: account line, description lines, optional sound line. */
function Caption({ bottom, name, button, sound, lines = [88, 62] }: { bottom: number; name: string; button?: string; sound?: string; lines?: number[] }) {
  return (
    <div style={{ position: 'absolute', left: cq(3.2), bottom: `${bottom}%`, width: '70%', display: 'flex', flexDirection: 'column', gap: cq(1.8) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: cq(2.2), color: W, fontSize: cq(3.4), fontWeight: 700, textShadow: '0 0 3px rgba(0,0,0,.7)' }}>
        <Avatar size={6.4} />{name}{button && <Tag>{button}</Tag>}
      </div>
      {lines.map((w, i) => <div key={i} style={bar(w)} />)}
      {sound && <div style={{ color: W, fontSize: cq(2.8), textShadow: '0 0 3px rgba(0,0,0,.7)' }}>♪ {sound}</div>}
    </div>
  );
}

function TopTabs({ tabs, active, icon }: { tabs: string[]; active: number; icon?: ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: '2.4%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: cq(4.5), color: W, fontSize: cq(3.8), textShadow: '0 0 3px rgba(0,0,0,.7)' }}>
      {tabs.map((t, i) => <span key={t} style={{ fontWeight: i === active ? 700 : 400, opacity: i === active ? 1 : 0.65, borderBottom: i === active ? `${cq(0.5)} solid ${W}` : undefined, paddingBottom: cq(0.6) }}>{t}</span>)}
      {icon && <span style={{ position: 'absolute', right: cq(3), width: cq(6.2), height: cq(6.2) }}>{icon}</span>}
    </div>
  );
}

function BottomNav({ items }: { items: string[] }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '7%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', background: 'rgba(0,0,0,.45)', color: dim, fontSize: cq(2.8) }}>
      {items.map((t, i) => <span key={t} style={{ color: i === 0 ? W : dim, fontWeight: i === 0 ? 700 : 400 }}>{t}</span>)}
    </div>
  );
}

function Mock({ id }: { id: SafeZoneId }) {
  switch (id) {
    case 'tiktok':
      return (
        <>
          <TopTabs tabs={['Following', 'For You']} active={1} icon={SEARCH} />
          <Rail bottom={11}>
            <Avatar plus />
            <Icon glyph={HEART} label="12.4K" /><Icon glyph={COMMENT} label="318" /><Icon glyph={SAVE} label="2.1K" /><Icon glyph={SHARE} label="Share" />
            <Disc />
          </Rail>
          <Caption bottom={10} name="@username" sound="original sound" lines={[86, 58]} />
          <BottomNav items={['Home', 'Friends', '+', 'Inbox', 'Profile']} />
        </>
      );
    case 'reels':
      return (
        <>
          <TopTabs tabs={['Reels', 'Friends']} active={0} icon={CAMERA} />
          <Rail bottom={9}>
            <Icon glyph={HEART} label="12K" /><Icon glyph={COMMENT} label="318" /><Icon glyph={SHARE} label="1.2K" /><Icon glyph={DOTS} />
            <Disc square />
          </Rail>
          <Caption bottom={8} name="username" button="Follow" sound="Original audio" lines={[84, 52]} />
          <BottomNav items={['Home', 'Reels', 'Send', 'Search', 'Profile']} />
        </>
      );
    case 'facebook':
      return (
        <>
          <TopTabs tabs={['Reels']} active={0} icon={SEARCH} />
          <Rail bottom={8}>
            <Icon glyph={HEART} label="12K" /><Icon glyph={COMMENT} label="318" /><Icon glyph={SHARE} label="Share" /><Icon glyph={DOTS} />
          </Rail>
          <Caption bottom={7} name="Page name" button="Follow" lines={[88, 64]} />
          <BottomNav items={['Home', 'Reels', 'Friends', 'Alerts', 'Menu']} />
        </>
      );
    case 'shorts':
      return (
        <>
          <TopTabs tabs={[]} active={0} icon={SEARCH} />
          <Rail bottom={10}>
            <Icon glyph={HEART} label="12K" /><Icon glyph={THUMB_DOWN} label="Dislike" /><Icon glyph={COMMENT} label="318" /><Icon glyph={SHARE} label="Share" /><Icon glyph={REMIX} label="Remix" />
            <Disc square />
          </Rail>
          <Caption bottom={9} name="@channel" button="Subscribe" sound="Original sound" lines={[80, 46]} />
          <BottomNav items={['Home', 'Shorts', '+', 'Subscriptions', 'You']} />
        </>
      );
    default:
      return (
        <>
          <TopTabs tabs={['Following', 'For You']} active={1} icon={SEARCH} />
          <Rail bottom={9}>
            <Avatar plus /><Icon glyph={HEART} label="12K" /><Icon glyph={COMMENT} label="318" /><Icon glyph={SHARE} label="Share" /><Disc />
          </Rail>
          <Caption bottom={8} name="@username" button="Follow" sound="original sound" />
        </>
      );
  }
}

/** The app's own UI drawn over the frame (like CapCut's safe-zone guide), on top of shaded no-go areas. */
export function SafeZoneOverlay({ id }: { id: SafeZoneId }) {
  const z = SAFE_ZONES[id];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" style={{ containerType: 'inline-size' }}>
      <div className="absolute inset-x-0 top-0 bg-destructive/15" style={{ height: `${z.top}%` }} />
      <div className="absolute inset-x-0 bottom-0 bg-destructive/15" style={{ height: `${z.bottom}%` }} />
      <div className="absolute right-0 bg-destructive/15" style={{ width: `${z.right}%`, top: `${z.rightFrom}%`, bottom: `${z.bottom}%` }} />
      {z.left > 0 && <div className="absolute inset-y-0 left-0 bg-destructive/15" style={{ width: `${z.left}%` }} />}
      <Mock id={id} />
      <div className="absolute left-2 top-[6%] rounded bg-black/60 px-1.5 text-[10px] text-white/80">{z.label} UI overlap</div>
    </div>
  );
}
