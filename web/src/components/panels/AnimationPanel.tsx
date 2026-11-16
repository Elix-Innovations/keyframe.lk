import { useState } from 'react';
import type { AnimationId } from '@/types';
import { useEditor } from '@/store';
import { ANIMATION_LABELS } from '@/render/animations';
import { StylePreview } from '../StylePreview';
import { Row, Section, Slider } from '../controls';

const IDS = Object.keys(ANIMATION_LABELS) as AnimationId[];

export function AnimationPanel() {
  const style = useEditor((s) => s.project!.style);
  const setStyle = useEditor((s) => s.setStyle);
  const [hover, setHover] = useState<string | null>(null);
  const perWord = style.displayMode === 'word-appear' || style.displayMode === 'compact-emphasis';

  // A plain function, not a component: a component defined here would remount every preview tile on each hover change.
  const renderGrid = (field: 'animation' | 'wordAnimation') => (
    <div className="grid grid-cols-2 gap-2">
      {IDS.map((id) => {
        const key = `${field}-${id}`;
        const preview = { ...style, [field]: id, animationSpeed: style.animationSpeed * 0.5 };
        return (
          <button key={id} onClick={() => setStyle((s) => ({ ...s, [field]: id }))}
            onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}
            className={`overflow-hidden rounded-xl border text-left ${style[field] === id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}>
            <div className="checker"><StylePreview style={preview} animate={hover === key} height={64} /></div>
            <div className="px-2 py-1 text-xs">{ANIMATION_LABELS[id]}</div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <Section title="Speed">
        <Row label="Animation speed">
          <Slider value={style.animationSpeed} min={0.25} max={2} step={0.05} onChange={(animationSpeed) => setStyle((s) => ({ ...s, animationSpeed }), 'speed')} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <p className="text-xs text-muted-foreground">Hover a card to preview it at half speed.</p>
      </Section>
      {perWord && (
        <Section title="Word entrance">
          <p className="text-xs text-muted-foreground">Each word animates in as it is spoken.</p>
          {renderGrid('wordAnimation')}
        </Section>
      )}
      <Section title="Caption entrance">
        {renderGrid('animation')}
      </Section>
    </div>
  );
}
