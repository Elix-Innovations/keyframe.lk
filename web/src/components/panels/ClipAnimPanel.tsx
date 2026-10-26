import { Scissors } from '@/components/icons';
import { useEditor } from '@/store';
import { Empty, Section } from '../controls';
import { AnimGrid } from './AnimGrid';
import { TargetBar, useLayer } from './EffectsPanel';

/** Animation tab for the selected video clip: entrance, exit and combo (idle) animations. */
export function ClipAnimPanel() {
  const { layer, set, clip } = useLayer();
  const selected = useEditor((s) => s.selectedClipId);
  if (!clip || !selected) return <Section title="Animation"><Empty icon={<Scissors />} title="No clip selected">Click a video clip on the timeline to animate it.</Empty></Section>;
  return (
    <div>
      <TargetBar pick={(l) => ({ animIn: l.animIn, animOut: l.animOut, loop: l.loop })} label="animations" />
      <AnimGrid value={layer} maxLen={clip.duration} sample={{ kind: 'sticker', text: '🎬' }}
        onChange={(p, key) => set((l) => ({ ...l, ...p }), key)} />
    </div>
  );
}
