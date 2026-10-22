// Shared data model for Keyframe.lk.
// All times are in seconds. Colors are CSS hex strings.

export type Script = 'sinhala' | 'english';

export interface GradientStop { color: string; position: number } // position 0..1
export interface Gradient { angle: number; stops: GradientStop[] } // angle in degrees, 180 = top→bottom

/** A fill is either a solid color or a gradient. */
export interface Fill { color: string; gradient: Gradient | null }

export type ShadowPreset = 'none' | 'soft' | 'default' | 'strong' | 'darker' | 'wideBlur';

export interface Shadow { color: string; opacity: number; blur: number; offsetX: number; offsetY: number }

export interface Glow { enabled: boolean; matchText: boolean; color: string; strength: number; radius: number }

/** Per-script appearance. Fields left undefined inherit from the base TextLook. */
export interface ScriptOverrides {
  fontFamily?: string;
  fill?: Fill;
  bold?: boolean;
  italic?: boolean;
  letterSpacing?: number;
  sizeScale?: number; // multiplier on base font size, e.g. English often needs 0.9
  strokeWidth?: number;
  strokeColor?: string;
  shadowPreset?: ShadowPreset;
  shadow?: Shadow;
  glow?: Glow;
}

/** Letter case for English text. Sinhala has no case and is never changed. */
export type TextCase = 'none' | 'upper' | 'lower' | 'title';

export interface TextLook {
  fontSize: number; // px at 1080-wide reference canvas
  sinhalaFont: string; // font id from the font catalog
  englishFont: string;
  fill: Fill;
  opacity: number;
  bold: boolean;
  italic: boolean;
  uppercaseEnglish: boolean;
  /** Supersedes uppercaseEnglish when set. */
  textCase?: TextCase;
  letterSpacing: number;
  /** Space between words as a multiple of the normal space (1 = normal). */
  wordSpacing?: number;
  lineHeight: number; // multiplier
  strokeWidth: number; // 0 = none
  strokeColor: string;
  shadowPreset: ShadowPreset;
  shadow: Shadow; // used when shadowPreset is set; presets overwrite these values
  glow: Glow;
  /** Background plate behind the whole caption. */
  background: { enabled: boolean; color: string; opacity: number; radius: number; padX: number; padY: number };
  sinhala: ScriptOverrides;
  english: ScriptOverrides;
}

export type DisplayMode =
  | 'natural' // whole segment shown
  | 'word-by-word' // one chunk of N words at a time
  | 'highlight' // active word recolored
  | 'box-highlight' // active word gets a colored box
  | 'word-appear' // words appear cumulatively
  | 'compact-emphasis'; // short chunks, emphasized words enlarged on their own line

export type AnimationId =
  | 'none' | 'fade' | 'softRise' | 'slideUp' | 'slideDown' | 'glideLeft' | 'glideRight'
  | 'softZoom' | 'zoomIn' | 'pop' | 'springPop' | 'bounce' | 'floatIn' | 'typewriter'
  | 'focusIn' | 'slam' | 'drop' | 'stretch' | 'swing' | 'flipUp' | 'jolt';

export interface HighlightStyle {
  fill: Fill; // color of the active word (highlight mode) or text inside the box (box mode)
  boxColor: string;
  boxRadius: number;
  boxPadding: number;
  scale: number; // active word scale, 1 = none
}

export interface EmphasisStyle {
  enabled: boolean;
  fill: Fill;
  scale: number;
  bold: boolean;
  sinhalaFont: string | null; // null = use caption font
  englishFont: string | null;
}

export interface Layout {
  x: number; // 0..100 % of canvas width (center of caption)
  y: number; // 0..100 % of canvas height (center of caption)
  maxWidth: number; // 0..100 % of canvas width
  align: 'left' | 'center' | 'right';
}

/** Everything that defines the look of captions. A template is a named CaptionStyle. */
export interface CaptionStyle {
  text: TextLook;
  displayMode: DisplayMode;
  wordsPerChunk: number; // for word-by-word / compact-emphasis / highlight paging (0 = whole caption)
  animation: AnimationId;
  wordAnimation: AnimationId; // per-word entrance for word-appear / compact-emphasis
  animationSpeed: number; // 0.25..2
  highlight: HighlightStyle;
  emphasis: EmphasisStyle;
  layout: Layout;
}

/** Per-word look, set by selecting words in the caption editor. Unset fields follow the caption style. */
export interface WordStyle {
  scale?: number; // size multiplier, 1 = normal
  color?: string;
  bold?: boolean;
  /** Font id. Applied to the parts of the word whose script the font supports. */
  font?: string;
  textCase?: TextCase;
}

export interface Word {
  id: string;
  text: string;
  start: number;
  end: number;
  emphasize?: boolean;
  style?: WordStyle;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  words: Word[];
  /** Optional per-caption override of the project style (partial deep merge). */
  styleOverride?: DeepPartial<CaptionStyle>;
}

export type HookTemplateId = 'bold' | 'pop' | 'box' | 'outline' | 'minimal';
export interface TextHook {
  enabled: boolean;
  text: string;
  start: number;
  end: number;
  y: number; // % of height
  template: HookTemplateId;
}

export interface BrollItem {
  id: string;
  assetId: string; // key into blob store
  start: number;
  end: number;
  mode: 'fullscreen' | 'pip';
  note?: string;
}

// ---- Audio ----

export type SfxId = 'pop' | 'click' | 'whoosh' | 'riser' | 'ding' | 'swoosh' | 'bass' | 'type'
  | 'airhorn' | 'scratch' | 'shutter' | 'laser' | 'coin' | 'notify' | 'boom' | 'glitch' | 'sparkle' | 'drop';

export interface TrackAnalysis {
  bpm: number | null;
  beats: number[]; // seconds, in the source file
  lufs: number | null; // integrated loudness of the file
  peak: number; // linear 0..1
  waveform: number[]; // normalized peaks, WAVEFORM_RATE per second of the file
}
export const WAVEFORM_RATE = 50;

export interface MusicTrack {
  id: string;
  assetId: string;
  name: string;
  source: 'upload' | 'library';
  /** A short sound effect: never ducked under speech. */
  effect?: boolean;
  license?: string;
  attribution?: string;
  fileDuration: number; // length of the audio file (s)
  start: number; // where it begins on the timeline (s)
  offset: number; // where in the file playback starts (s)
  duration: number; // how long it plays on the timeline (s); may exceed fileDuration when looping
  volume: number; // dB, 0 = unity
  fadeIn: number; // s
  fadeOut: number; // s
  loop: boolean;
  muted?: boolean;
  /** Timeline row, 0 = top. Tracks on different layers may overlap in time. */
  layer?: number;
  analysis?: TrackAnalysis;
}

export interface ProjectAudio {
  original: { volume: number; muted: boolean; enhance: boolean; /** Cleaned copy of the video's audio (WAV asset) that replaces it in preview and export. */ denoise?: { assetId: string; /** The video asset it was made from (default: the primary video). */ sourceAssetId?: string; strength: number; method?: 'rnnoise' | 'spectral' } }; // volume in dB
  tracks: MusicTrack[];
  ducking: { enabled: boolean; amountDb: number; attack: number; release: number };
  normalize: { enabled: boolean; targetLufs: number };
  sfx: { enabled: boolean; volume: number; onWord: SfxId | null; onEmphasis: SfxId | null; onCaption: SfxId | null; onHook: SfxId | null };
  snapToBeats: boolean;
}

// ---- Video layer: filters, transitions, keyframes ----

export interface VideoFilters {
  brightness: number; // 100 = unchanged
  contrast: number; // 100 = unchanged
  saturate: number; // 100 = unchanged
  hue: number; // degrees
  blur: number; // px at 1080-wide reference
  grayscale: number; // 0..100
  sepia: number; // 0..100
  vignette: number; // 0..100
}

export type TransitionId =
  | 'none' | 'fade' | 'flash' | 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'blur'
  | 'spin' | 'spinZoom' | 'bounce' | 'shake' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown' | 'circle' | 'flip' | 'glitch'
  | 'whipLeft' | 'whipRight' | 'whipUp' | 'whipDown' | 'zoomBlur' | 'pushZoom' | 'rollLeft' | 'rollRight' | 'swirl' | 'rgbShift'
  | 'pulse' | 'dolly' | 'strobe' | 'filmBurn' | 'irisOpen' | 'barnDoor' | 'whiteOut' | 'blackOut' | 'jumpCut' | 'tiltDrop';

/** An effect from the effects library applied to the video, with a 0..1 strength. */
export interface EffectInstance { id: string; effectId: string; intensity: number }

/** Per-row timeline switches. Keys: captions, fx, video, broll. */
export type LaneGroup = 'overlay' | 'adj' | 'video' | 'audio' | 'broll' | 'sound';
export interface LaneState { hidden?: boolean; locked?: boolean; muted?: boolean }
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

/** Transform at one moment. Between keyframes values are interpolated with the earlier keyframe's ease. */
export interface VideoKeyframe {
  id: string;
  t: number; // seconds
  scale: number; // 1 = fit
  x: number; // % of frame width, 0 = centred
  y: number; // % of frame height
  rotation: number; // degrees
  opacity: number; // 0..1
  ease: Ease;
}

/** Crop as % of the source frame removed from each edge. */
export interface Crop { l: number; t: number; r: number; b: number }

export interface VideoLayer {
  filters: VideoFilters;
  presetId: string | null;
  /** 0..100: how strongly the preset is applied (the sliders below hold the result). */
  presetStrength?: number;
  crop?: Crop;
  flipH?: boolean;
  flipV?: boolean;
  /** Quarter-turn rotation applied after cropping. */
  rot90?: 0 | 90 | 180 | 270;
  /** Static transform used when there are no keyframes. */
  base?: { scale: number; x: number; y: number; rotation: number; opacity: number };
  transitionIn: { id: TransitionId; duration: number };
  transitionOut: { id: TransitionId; duration: number };
  keyframes: VideoKeyframe[];
  effects: EffectInstance[];
  speed: number;
  hidden: boolean;
}

// ---- Timeline clips (video and audio on separate, linkable layers) ----

export interface Clip {
  id: string;
  kind: 'video' | 'audio';
  assetId: string;
  name: string;
  /** Length of the whole source file (s). */
  sourceDuration: number;
  /** Where the clip starts on the timeline (s). */
  start: number;
  /** Source time at the clip's left edge (s). */
  in: number;
  /** Length on the timeline (s). Source seconds played = duration × speed (a freeze holds one frame). */
  duration: number;
  speed: number; // 0.1..8; keeps pitch for audio
  /** Hold the frame at `in` for the whole duration (video only). */
  freeze?: boolean;
  /** Shared by a video clip and its audio clip while they move, trim, split and change speed together. */
  linkId?: string;
  /** Audio clip: gain in dB. */
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted?: boolean;
  /** Audio taken from a video file (so the Original-audio settings and noise removal apply). */
  fromVideo?: boolean;
  width?: number;
  height?: number;
  /** Filters, effects, transitions, crop, transform and keyframes of this video clip. Keyframe times are relative to the clip start. */
  fx?: VideoLayer;
  /** Video track: 0 is the main track, higher numbers are overlays drawn on top. */
  track?: number;
}

/** A filter or effect placed on the timeline over a time range; it applies to everything below its track (like CapCut's filter and effect tracks). */
export interface AdjClip {
  id: string;
  kind: 'filter' | 'effect';
  /** Filter preset id or effect id. */
  refId: string;
  start: number;
  duration: number;
  /** Adjustment track, 0 is the lowest. */
  track: number;
  /** Filter: 0..100 strength. Effect: 0..100 maps to 0..1. */
  intensity: number;
}

// ---- Overlays: text, stickers and images placed over the video ----

export type OverlayAnimId =
  | 'none' | 'fade' | 'pop' | 'bounce' | 'zoom' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
  | 'spin' | 'shake' | 'blurIn' | 'glitch' | 'typewriter' | 'flip'
  | 'wipe' | 'elastic' | 'drop' | 'swing' | 'rubber' | 'blink' | 'wordPop' | 'rise' | 'spinZoom' | 'jelly';
/** Motion that repeats for as long as the overlay is on screen. */
export type OverlayLoopId = 'none' | 'pulse' | 'float' | 'wiggle' | 'swing' | 'spin' | 'blink' | 'heartbeat' | 'glitch' | 'tada' | 'jelly' | 'shake' | 'breathe';
export type OverlayBlend = 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'difference';

export interface OverlayItem {
  id: string;
  kind: 'text' | 'sticker' | 'image';
  /** Text content, or the emoji / symbol of a sticker. */
  text: string;
  /** Image overlays: key into the blob store. */
  assetId?: string;
  imgW?: number;
  imgH?: number;
  start: number;
  duration: number;
  /** Overlay track, 0 is the lowest. */
  track: number;
  /** Centre, % of the frame. */
  x: number;
  y: number;
  /** 1 = the default size for its kind. */
  scale: number;
  rotation: number;
  opacity: number;
  blend?: OverlayBlend;
  flipH?: boolean;
  // Text look
  fontId?: string;
  color: string;
  bold: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  strokeWidth: number;
  strokeColor: string;
  shadow: boolean;
  glow?: { color: string; radius: number } | null;
  /** Plate behind the text. */
  bg: { color: string; opacity: number; radius: number } | null;
  /** Image / sticker rounded corners, % of the shorter side. */
  corner?: number;
  /** `speed` plays the animation faster (>1) or slower (<1): it plays in `duration / speed` seconds. */
  animIn: { id: OverlayAnimId; duration: number; speed?: number };
  animOut: { id: OverlayAnimId; duration: number; speed?: number };
  loop: OverlayLoopId;
  /** Rate of the loop animation and keyframes, 1 = normal. */
  speed?: number;
  /** Motion over the overlay's time. Times are seconds since the overlay starts; x, y, rotation are offsets from the overlay's own position and scale, opacity are multipliers. */
  keyframes?: VideoKeyframe[];
}

export type AspectRatio = 'original' | '9:16' | '1:1' | '4:5' | '16:9';
export type FitMode = 'contain' | 'cover' | 'blur';

export interface SegmentationOptions {
  maxWords: number;
  maxChars: number;
  maxDuration: number; // seconds
  splitOnPause: number; // seconds of silence that forces a new caption
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  videoAssetId: string | null; // key into blob store
  videoWidth: number;
  videoHeight: number;
  duration: number;
  thumbnail: string | null; // small jpeg data URL
  language: 'si' | 'en' | 'mixed';
  words: Word[]; // raw transcription (source of truth for re-segmentation)
  captions: Caption[];
  style: CaptionStyle;
  templateId: string | null;
  segmentation: SegmentationOptions;
  aspectRatio: AspectRatio;
  fit: FitMode;
  hook: TextHook;
  broll: BrollItem[];
  audio: ProjectAudio;
  /** Filters, transitions and keyframes for the main video. Absent in projects saved before v2. */
  video?: VideoLayer;
  lanes?: Record<string, LaneState>;
  /** Top-to-bottom order of the timeline's track groups (below Captions). Missing = default order. */
  laneOrder?: LaneGroup[];
  /** Timeline clips. Absent in older projects: built from videoAssetId on load. */
  clips?: Clip[];
  /** Filters and effects placed on the timeline. */
  adj?: AdjClip[];
  /** Text, stickers and images placed over the video. */
  overlays?: OverlayItem[];
  description?: { title: string; body: string; hashtags: string[]; language: 'si' | 'en' };
}

export interface Template {
  id: string;
  name: string;
  builtIn: boolean;
  style: CaptionStyle;
  createdAt: number;
}

export interface FontDef {
  id: string;
  label: string;
  family: string; // CSS font-family name
  script: Script | 'both';
  source: 'google' | 'system' | 'custom' | 'bundled';
  /** For bundled fonts: URL of the font file under /fonts. */
  url?: string;
  /** Licence note for bundled third-party fonts; `licenseKnown: false` shows a warning badge. */
  license?: string;
  licenseKnown?: boolean;
  /** Legacy ASCII-mapped Sinhala font (FM / Tharu etc). Text is converted Unicode→FM before drawing. */
  legacy?: boolean;
  /** Installed fonts: the file was checked and maps Sinhala letters. */
  hasSinhala?: boolean;
  weights?: number[];
  /** Weight used when text is bold (default 700, else the heaviest listed). */
  boldWeight?: number;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// ---- Server API contracts (see server/src/index.ts) ----

export interface TranscribeResponse {
  provider: string;
  language: string;
  duration: number;
  words: { text: string; start: number; end: number }[];
}

export interface HealthResponse {
  ok: true;
  transcription: { elevenlabs: boolean; openai: boolean; gemini: boolean };
  ai: boolean;
  aiProvider: 'claude' | 'gemini' | null;
  music: boolean; // JAMENDO_CLIENT_ID configured
  ffmpeg: boolean;
}

export interface LibraryTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  previewUrl: string; // same-origin proxied URL: /api/music/file?id=...
  image: string | null;
  license: string; // e.g. "CC BY 4.0"
  licenseUrl: string;
  attribution: string; // ready-to-paste credit line
  tags: string[];
}
export interface MusicSearchResponse { configured: boolean; tracks: LibraryTrack[] }

export interface SfxResult {
  id: string;
  name: string;
  creator: string;
  duration: number; // seconds
  previewUrl: string; // same-origin proxied URL: /api/sfx/file?id=...
  license: string; // e.g. "CC0 1.0"
  licenseUrl: string;
  attribution: string;
  landingUrl: string;
  tags: string[];
}
export interface SfxSearchResponse { results: SfxResult[]; page: number; pageCount: number }

export interface MusicMoodRequest { transcript: string; language: 'si' | 'en' }
export interface MusicMoodResponse { moods: string[]; genres: string[]; bpmMin: number; bpmMax: number; searchQuery: string; reason: string }

/** Python service: POST /api/sinhala/audio/analyze (multipart field "file"). */
export interface AudioAnalyzeResponse {
  duration: number;
  sampleRate: number;
  bpm: number | null;
  beats: number[];
  lufs: number | null;
  peak: number;
  waveform: number[]; // WAVEFORM_RATE per second, normalized 0..1
}

export interface EmphasisRequest { words: string[]; language: 'si' | 'en' | 'mixed' }
export interface EmphasisResponse { indices: number[] }

export interface HookRequest { transcript: string; language: 'si' | 'en' }
export interface HookResponse { hooks: string[] }

export interface DescriptionRequest { transcript: string; language: 'si' | 'en' }
export interface DescriptionResponse { title: string; body: string; hashtags: string[] }

export interface ProofreadRequest { words: string[]; language: 'si' | 'en' | 'mixed'; mode?: 'proofread' | 'english' }
/** Same length as the request; each entry is the corrected word (may be unchanged). */
export interface ProofreadResponse { words: string[] }

export interface BrollPlanRequest {
  segments: { index: number; start: number; end: number; text: string }[];
  images: { id: string; dataUrl: string }[]; // small jpeg thumbnails
}
export interface BrollPlanResponse { placements: { imageId: string; start: number; end: number; reason: string }[] }

/** One paid API request, as logged by the server (server/data/usage.json). */
export interface UsageRecord {
  id: string;
  time: number; // ms epoch
  feature: string; // transcribe, proofread, english, emphasis, hook, description, broll, music-mood
  provider: 'gemini' | 'claude' | 'elevenlabs' | 'openai';
  model: string;
  inputTokens?: number;
  audioTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  audioSeconds?: number;
  /** Estimated from list prices; null when the model has no known price. */
  costUsd: number | null;
  ok: boolean;
}
export interface UsageResponse {
  since: number | null;
  total: { requests: number; failed: number; costUsd: number; inputTokens: number; outputTokens: number; audioSeconds: number };
  byFeature: Record<string, { requests: number; costUsd: number }>;
  byDay: Record<string, { requests: number; costUsd: number }>;
  recent: UsageRecord[];
  prices: { tokens: Record<string, { in: number; audioIn?: number; out: number }>; perMinute: Record<string, number> };
}
