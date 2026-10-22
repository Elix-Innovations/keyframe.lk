/** Single source for keyboard shortcuts: used by tooltips and the shortcuts dialog. */
export const SHORTCUTS = {
  playPause: { keys: ['Space'], label: 'Play / pause' },
  frameBack: { keys: ['←'], label: 'Back one frame' },
  frameFwd: { keys: ['→'], label: 'Forward one frame' },
  secBack: { keys: ['⇧', '←'], label: 'Back 1 second' },
  secFwd: { keys: ['⇧', '→'], label: 'Forward 1 second' },
  nudge: { keys: ['⌥', '← / →'], label: 'Nudge selected caption ±30 ms' },
  split: { keys: ['S'], label: 'Split caption at playhead' },
  merge: { keys: ['M'], label: 'Merge selected caption with next' },
  del: { keys: ['Del'], label: 'Delete selected caption' },
  save: { keys: ['⌘', 'S'], label: 'Save now (also autosaves every 5 s)' },
  undo: { keys: ['⌘', 'Z'], label: 'Undo' },
  redo: { keys: ['⇧', '⌘', 'Z'], label: 'Redo' },
  panels: { keys: ['1 – 9'], label: 'Switch side panel' },
  converter: { keys: ['⌘', 'K'], label: 'Unicode ⇄ FM converter' },
  help: { keys: ['?'], label: 'Show shortcuts' },
  zoom: { keys: ['⌘', 'scroll'], label: 'Zoom timeline' },
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;
