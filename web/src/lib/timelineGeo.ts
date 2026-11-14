/** Row geometry published by the timeline each render, so clip blocks can turn a pointer position into a track. */
export const geo = {
  /** Adjustment track under a pointer y (a new track, one above the highest, when the pointer is above them all). */
  adjTrackAt: (_clientY: number): number | undefined => undefined,
  /** Overlay track under a pointer y (a new track above the highest when the pointer is above them all). */
  /** Video track under a pointer y (a new overlay when above the highest). */
  videoTrackAt: (_clientY: number): number | undefined => undefined,
  /** Sound layer under a pointer y (a new layer below the last when the pointer is below them all). */
  soundLayerAt: (_clientY: number): number | undefined => undefined,
  timeAt: (_clientX: number): number => 0,
};

/** Drag payloads between the panels and the timeline. */
export const DRAG_MIME = 'application/x-keyframe';
export type DragPayload =
  | { type: 'fx'; kind: 'filter' | 'effect'; refId: string }
  | { type: 'transition'; id: string }
  | { type: 'media'; clipId: string }
  | { type: 'library'; id: string }
  | { type: 'template'; id: string }
  | { type: 'sound'; sound: import('./sounds').SoundSource }
  | { type: 'overlay'; kind: 'text' | 'sticker'; text: string; presetId?: string };
