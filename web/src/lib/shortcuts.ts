export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
/** Running inside the Keyframe desktop app (Electron) rather than a browser tab. */
export const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);

/** Shortcut glyphs are written Mac-style (⌘ ⌥ ⇧). Off a Mac show them as Ctrl+ / Alt+ / Shift+ instead. */
export function kbd(label: string): string {
  if (isMac) return label;
  // Order on Windows is Ctrl+Alt+Shift+key, whatever order the Mac label used.
  return label.replace(/[⌘⌥⇧]+/g, (m) => ['⌘', '⌥', '⇧'].filter((g) => m.includes(g)).map((g) => ({ '⌘': 'Ctrl+', '⌥': 'Alt+', '⇧': 'Shift+' })[g]).join(''));
}

/** Single source for keyboard shortcuts: used by tooltips and the shortcuts dialog. */
export const SHORTCUTS = {
  playPause: { keys: ['Space'], label: 'Play / pause' },
  frameBack: { keys: ['←'], label: 'Back one frame' },
  frameFwd: { keys: ['→'], label: 'Forward one frame' },
  secBack: { keys: ['⇧', '←'], label: 'Back 1 second' },
  secFwd: { keys: ['⇧', '→'], label: 'Forward 1 second' },
  nudge: { keys: ['⌥', '← / →'], label: 'Nudge selected caption ±30 ms' },
  split: { keys: ['S'], label: 'Split caption at playhead' },
  before: { keys: ['B'], label: 'Preview the original (hold to compare)' },
  merge: { keys: ['M'], label: 'Merge selected caption with next' },
  del: { keys: ['Del'], label: 'Delete selected caption' },
  save: { keys: ['⌘', 'S'], label: 'Save now (also autosaves every 5 s)' },
  undo: { keys: ['⌘', 'Z'], label: 'Undo' },
  redo: { keys: ['⇧', '⌘', 'Z'], label: 'Redo' },
  markIn: { keys: ['I'], label: 'Mark In at the playhead (⌥I clears)' },
  markOut: { keys: ['O'], label: 'Mark Out at the playhead (⌥O clears)' },
  clearMarks: { keys: ['⌥', 'X'], label: 'Clear In and Out' },
  playInOut: { keys: ['⌥', '/'], label: 'Play In to Out' },
  panels: { keys: ['1 – 9'], label: 'Switch side panel' },
  converter: { keys: ['⌘', 'K'], label: 'Unicode ⇄ FM converter' },
  help: { keys: ['?'], label: 'Show shortcuts' },
  zoom: { keys: ['⌘', 'scroll'], label: 'Zoom timeline' },
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;
