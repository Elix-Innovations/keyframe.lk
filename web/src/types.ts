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
  /** Absolute font size for this script; falls back to the base `fontSize`. `sizeScale` still multiplies it. */
  fontSize?: number;
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
  | 'focusIn' | 'slam' | 'drop' | 'stretch' | 'swing' | 'flipUp' | 'jolt'
  | 'glitch' | 'flicker' | 'whip' | 'spinIn' | 'elastic' | 'wipe' | 'blurRise'
  | 'blurSlide' | 'blurSlideL' | 'blurIn' | 'zoomThrough' | 'dimIn'
  /** Plays the keyframes stored on the template (`customIn` / `customOut`), e.g. from an imported Premiere pack. */
  | 'custom';

/** One keyframe of an imported text animation. Offsets are in em; `alpha`, `scale`, `sx`, `sy` multiply, `rot` is radians, `blur` is em. */
export interface AnimKey { t: number; alpha: number; dx: number; dy: number; scale: number; rot: number; sx: number; sy: number; blur: number; ease: Ease }

/** Motion that keeps playing on a creative text block after it has entered. */
export type TextLoop = 'none' | 'float' | 'wave' | 'pulse' | 'shake' | 'flicker';

export interface HighlightStyle {
  fill: Fill; // color of the active word (highlight mode) or text inside the box (box mode)
  boxColor: string;
  boxRadius: number;
  boxPadding: number;
  /** Per-side box margins; each falls back to `boxPadding` (top/bottom: half of it) when unset. */
  boxPadTop?: number;
  boxPadBottom?: number;
  boxPadLeft?: number;
  boxPadRight?: number;
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

/** How one line of a creative text layout looks. Unset fields follow the caption style. */
export interface CreativeLine {
  /** Size relative to the caption font size. */
  scale: number;
  /** The key line (the emphasised word, else the longest one) uses this entry. */
  hero?: boolean;
  fill?: Fill;
  strokeWidth?: number;
  strokeColor?: string;
  glow?: { color: string; strength: number; radius: number };
  /** Solid 3D-style extrusion behind the text; depth in px at the 1080 reference. */
  extrude?: { color: string; depth: number };
  /** Degrees. */
  rotate?: number;
  /** Horizontal shift, % of the block width (+ right). */
  shift?: number;
  bold?: boolean;
  /** Font id used for this line where it supports the script. */
  font?: string;
  textCase?: TextCase;
  /** Colours spread across the letters of the line (left to right); replaces the fill. */
  tint?: string[];
}

/**
 * Creative text: a caption chunk is split into short lines, each with its own size, colour and effects,
 * stacked or bent along an arc, with the lines animating in one after another.
 */
export interface CreativeLayout {
  kind: 'stack' | 'arc';
  wordsPerLine: number;
  /** Keep the whole chunk on one row; the key word keeps its own look but stays in the row. */
  singleLine?: boolean;
  /** Pattern of line looks; non-hero entries repeat down the lines. */
  lines: CreativeLine[];
  /** Arc sweep in degrees (positive bulges up, negative dips). */
  arc?: number;
  /** Whole-block rotation, degrees. */
  tilt?: number;
  lineAnim: AnimationId;
  /** Seconds between each line's entrance. */
  stagger: number;
  /** Line spacing multiplier. */
  gap?: number;
  /** Seconds between each letter's entrance (kinetic type); 0 / absent = the whole line enters together. Sinhala words enter whole. */
  perLetter?: number;
  /** Entrance used by each letter when `perLetter` is set; defaults to `lineAnim`. */
  letterAnim?: AnimationId;
  /** Exit played in reverse over the last moments of the chunk; absent / 'none' = it just ends. */
  outAnim?: AnimationId;
  /** Keyframes played when `lineAnim` / `letterAnim` is 'custom' (times in seconds at 1× speed). */
  customIn?: AnimKey[];
  /** Per-letter keyframes (entrance-shaped), used with `perLetter` for text-animator style presets; the line keyframes then run separately. */
  customLetterIn?: AnimKey[];
  /** Per-letter exit, entrance-shaped and played in reverse, each letter leaving `perLetter` after the one before. */
  customLetterOut?: AnimKey[];
  /** Keyframes played in reverse over the end when `outAnim` is 'custom'; written entrance-shaped (first key = gone, last key = settled). */
  customOut?: AnimKey[];
  /** Red / blue colour split at the edges, in em; it settles as the line enters. */
  split?: number;
  /** Keep the colour split on after the entrance. */
  splitHold?: boolean;
  /** Idle motion after the entrance. */
  loop?: TextLoop;
  /** Speed of the idle loop, 1 = normal. */
  loopSpeed?: number;
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
  /** Creative multi-line text layout; null / absent = normal captions. */
  creative?: CreativeLayout | null;
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
  /** Starts a new line (typed Enter in the caption text). */
  br?: boolean;
}

export interface Caption {
  id: string;
  /** Items sharing a group id are selected and moved together. */
  groupId?: string;
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
  /** Items sharing a group id are selected and moved together. */
  groupId?: string;
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
  /** Added by a text template, so re-applying or removing the template can replace it. */
  fromTemplate?: boolean;
  /** Timeline row, 0 = top. Tracks on different layers may overlap in time. */
  layer?: number;
  analysis?: TrackAnalysis;
}

export interface ProjectAudio {
  original: { volume: number; muted: boolean; enhance: boolean; /** Cleaned copy of the video's audio (WAV asset) that replaces it in preview and export. */ /** Cleaned audio per video asset, so every clip's file can be cleaned (the single `denoise` above is the older form). */ denoiseBy?: Record<string, { assetId: string; strength: number; method?: 'rnnoise' | 'spectral' }>; denoise?: { assetId: string; /** The video asset it was made from (default: the primary video). */ sourceAssetId?: string; strength: number; method?: 'rnnoise' | 'spectral' } }; // volume in dB
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
  // ---- Colour grading (rendered by the WebGL grade pass; all neutral at 0 unless noted) ----
  exposure: number; // -100..100 (±2 stops)
  temperature: number; // -100 cool .. 100 warm
  tint: number; // -100 green .. 100 magenta
  highlights: number; // -100..100
  shadows: number; // -100..100
  whites: number; // -100..100
  blacks: number; // -100..100
  vibrance: number; // -100..100
  fade: number; // 0..100 lifted blacks
  sharpen: number; // 0..100
  grain: number; // 0..100
  clarity: number; // -100..100 midtone contrast
  /** Levels: input black / white (0..255), gamma (100 = 1.0), output black / white (0..255). */
  lvInBlack: number; lvInWhite: number; lvGamma: number; lvOutBlack: number; lvOutWhite: number;
  /** RGB balance (per-channel gain), -100..100. */
  gainR: number; gainG: number; gainB: number;
  /** Parametric curve: -100..100 per tonal zone. */
  curveShadows: number; curveDarks: number; curveLights: number; curveHighlights: number;
  /** Colour wheels: hue 0..360, amount 0..100. */
  shadowHue: number; shadowAmt: number; midHue: number; midAmt: number; highHue: number; highAmt: number;
  /** Hue/saturation/luminance per colour band. */
  hueRed: number; satRed: number; lumRed: number;
  hueOrange: number; satOrange: number; lumOrange: number;
  hueYellow: number; satYellow: number; lumYellow: number;
  hueGreen: number; satGreen: number; lumGreen: number;
  hueAqua: number; satAqua: number; lumAqua: number;
  hueBlue: number; satBlue: number; lumBlue: number;
  huePurple: number; satPurple: number; lumPurple: number;
  hueMagenta: number; satMagenta: number; lumMagenta: number;
}

export type TransitionId =
  | 'none' | 'fade' | 'flash' | 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'blur'
  | 'spin' | 'spinZoom' | 'bounce' | 'shake' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown' | 'circle' | 'flip' | 'glitch'
  | 'whipLeft' | 'whipRight' | 'whipUp' | 'whipDown' | 'zoomBlur' | 'pushZoom' | 'rollLeft' | 'rollRight' | 'swirl' | 'rgbShift'
  | 'pulse' | 'dolly' | 'strobe' | 'filmBurn' | 'irisOpen' | 'barnDoor' | 'whiteOut' | 'blackOut' | 'jumpCut' | 'tiltDrop'
  | 'fire' | 'lensFlare' | 'lightLeak' | 'anamorphic' | 'sparkle' | 'lightning' | 'prism' | 'sunrise'
  | 'earthquake' | 'dizzy' | 'fastZoom' | 'slam' | 'stretch' | 'fadeBlack' | 'vhsRewind' | 'heartbeat';

/** An effect from the effects library applied to the video, with a 0..1 strength. */
export interface EffectInstance { id: string; effectId: string; intensity: number }

/** Per-row timeline switches. Keys: captions, fx, video, broll. */
export type LaneGroup = 'overlay' | 'adj' | 'video' | 'audio' | 'broll' | 'sound';
export type LaneSize = 'short' | 'default' | 'tall';
export interface LaneState { hidden?: boolean; locked?: boolean; muted?: boolean; /** Track height preset. */ size?: LaneSize; /** Track height in px, set by dragging the header edge (wins over `size`). */ h?: number; /** Audio waveform amplitude. */ wave?: LaneSize }
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

/** A keyframe on one number (an Adjust slider, a volume, …). Time is seconds from the start of whatever owns it. */
export interface PropKf { id: string; t: number; v: number; ease: Ease }

/** Crop as % of the source frame removed from each edge. */
export interface Crop { l: number; t: number; r: number; b: number }

/** Background removal for a video clip: a colour key (green / blue screen) or an AI person cut-out. */
export interface MatteSettings {
  mode: 'none' | 'chroma' | 'ai';
  /** AI cut-out engine: 'precise' (MODNet matting, fine hair detail, slower) or 'fast' (MediaPipe, real time, soft edges). */
  engine?: 'precise' | 'fast';
  /** Chroma key: the colour to remove. */
  keyColor: string;
  /** Chroma key: how far from the key colour still counts as background, 0..100. */
  similarity: number;
  /** Chroma key: width of the soft edge, 0..100. */
  smoothness: number;
  /** Chroma key: how much of the key colour's tint to remove from edges, 0..100. */
  spill: number;
  /** Precise engine: remove small stray blobs the model mistook for a person (default on). */
  cleanup?: boolean;
  /** Soft edge on the cut-out, px at 1080 wide. */
  edge: number;
  /** AI cut-out: grow (+) or shrink (−) the mask, px at 1080 wide. */
  shift: number;
  /** AI cut-out: how sure the model must be before a pixel is kept, 0..100 (higher cuts more). */
  threshold: number;
  /** AI cut-out: keep only the skin (hands, fingers) of the person, so a phone or sleeve in the hand is left out. */
  hands?: boolean;
  /** Keep the background and remove the subject instead. */
  invert: boolean;
  /** What shows where the background was: the layers below, a flat colour, or the same shot blurred. */
  background: 'transparent' | 'color' | 'blur';
  bgColor: string;
  /** Blur of the background, px at 1080 wide. */
  bgBlur: number;
}

/** A blurred (or mosaic) rectangle / ellipse on a clip, e.g. to hide a face or a licence plate. */
export interface RegionBlur {
  id: string;
  shape: 'rect' | 'ellipse';
  look: 'blur' | 'pixelate';
  /** Centre and size, % of the source frame. */
  x: number; y: number; w: number; h: number;
  /** Blur px at 1080 wide, or mosaic block px. */
  amount: number;
  /** Soft edge of the area, 0..100. */
  feather: number;
  /** Blur everything outside the area instead. */
  invert: boolean;
}

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
  /** Keyframes per colour slider (a VideoFilters key). Sliders without an entry use the static value in `filters`. */
  fkf?: Record<string, PropKf[]>;
  effects: EffectInstance[];
  /** Background removal / replacement. */
  matte?: MatteSettings;
  /** Blurred or mosaic areas. */
  regionBlurs?: RegionBlur[];
  speed: number;
  hidden: boolean;
  /** How this layer mixes with what is below it (default normal). */
  blend?: OverlayBlend;
  /** Entrance, exit and idle animations (same ids as overlays). */
  animIn?: { id: OverlayAnimId; duration: number; speed?: number };
  animOut?: { id: OverlayAnimId; duration: number; speed?: number };
  loop?: OverlayLoopId;
}

// ---- Timeline clips (video and audio on separate, linkable layers) ----

/** One point of a speed curve: at source second `x` the clip plays at `s`× speed. */
export interface SpeedPt { x: number; s: number }

export interface Clip {
  id: string;
  /** Volume keyframes (absolute dB, seconds from the clip's start on the timeline). When present they replace `volume`. */
  volKf?: PropKf[];
  /** Items sharing a group id are selected and moved together. */
  groupId?: string;
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
  speed: number; // 0.1..8; keeps pitch for audio. With a `curve` it is the average (source span / duration).
  /** Variable speed over the source file (see lib/speedCurve.ts). Pitch follows speed. */
  curve?: SpeedPt[];
  /** Play the clip backwards. */
  reverse?: boolean;
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
  /** A layer made from a cut-out (subject only): it keeps the main video's framing and can have overlays placed behind it. */
  cutout?: boolean;
  /** Video track: 0 is the main track, higher numbers are overlays drawn on top. */
  track?: number;
}

/** A filter or effect placed on the timeline over a time range; it applies to everything below its track (like CapCut's filter and effect tracks). */
export interface AdjClip {
  id: string;
  /** Items sharing a group id are selected and moved together. */
  groupId?: string;
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
export type OverlayBlend = 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'difference' | 'lighter';

/** One post card in a generated feed. The last post of a feed is the one the scroll stops on (the ad). */
export interface FeedPost {
  id: string;
  text: string;
  assetId?: string;
  imgW?: number;
  imgH?: number;
  likes: number;
  comments: number;
  time: string;
  /** Who posted it; a made-up name is used when empty. */
  author?: string;
}

/** The four corners of the screen in the frame at one moment (% of the frame; order: top-left, top-right, bottom-right, bottom-left). Times are seconds since the layer starts. */
export interface ScreenQuadKf { id: string; t: number; pts: [number, number][]; ease: Ease }

export interface ScreenSpec {
  quad: ScreenQuadKf[];
  feed: { pageName: string; avatarAssetId?: string; posts: FeedPost[] };
  /** The feed scrolls from `start` to `stop` (seconds since the layer starts) and stays on the last post. */
  scroll: { start: number; stop: number; ease: Ease };
  /** Rounded screen corners, % of the screen width. */
  corner: number;
}

export interface OverlayItem {
  id: string;
  /** Items sharing a group id are selected and moved together. */
  groupId?: string;
  kind: 'text' | 'sticker' | 'image' | 'motion' | 'screen';
  /** Motion graphic or transition: the scene this layer plays (its time starts when the layer starts). */
  scene?: MotionScene;
  /** Phone-screen layer: a generated feed that scrolls, pinned to the four corners of a screen in the video. */
  screen?: ScreenSpec;
  /** Text content, or the emoji / symbol of a sticker. */
  text: string;
  /** Image overlays: key into the blob store. */
  assetId?: string;
  imgW?: number;
  imgH?: number;
  start: number;
  duration: number;
  /** Layer row: 1 is the first above the main video; shared with video layers (lib/layers.ts). */
  track: number;
  /** Old projects only: painted just before this video track. Merged into `track` on load. */
  behind?: number;
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
  /** Text laid out with a creative text template (its caption style); the overlay's text, size, position and timing still apply. */
  tpl?: { id: string; style: CaptionStyle };
  /** Motion over the overlay's time. Times are seconds since the overlay starts; x, y, rotation are offsets from the overlay's own position and scale, opacity are multipliers. */
  keyframes?: VideoKeyframe[];
}

export type AspectRatio = 'original' | '9:16' | '1:1' | '4:5' | '16:9';
export type FitMode = 'contain' | 'cover' | 'blur' | 'color';

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
  /** Fill behind the video when `fit` is 'color'. */
  fitColor?: string;
  /** Files imported into the Media panel. They reach the timeline only when added or dragged there. */
  library?: LibraryItem[];
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
  /** Video layers and overlays share one stack of rows (see lib/layers.ts). Set once an older project has been merged. */
  layersV2?: boolean;
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
  /** Sound effect that suits this look (played as each caption appears). Users can turn it off or swap it. */
  sfx?: SfxId | null;
  /** Where an imported template came from, e.g. "Premiere pack: Text Scene.mogrt". */
  origin?: string;
  /** The motion was measured from a preview video, so it only approximates the original. */
  approximate?: boolean;
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

// ---- Motion graphics: a small declarative scene format drawn by the editor's own canvas renderer ----

/** Easing name: linear, in / out / inOut (+ Cubic, Expo), outBack, inBack, outElastic, outBounce, spring, or "bezier(x1,y1,x2,y2)". */
export type SceneEase = string;
export interface SceneKey<T> { t: number; v: T; ease?: SceneEase }
/** A value, or keyframes (times are seconds from the start of the scene) with the easing of the segment that starts at each key. */
export type SceneProp<T> = T | { keys: SceneKey<T>[] };

export interface SceneNode {
  type: 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'group';
  name?: string;
  /** Seconds in the scene when the node appears / disappears (default: the whole scene). */
  start?: number; end?: number;
  /** Position of the node's anchor in design units: the frame is 1080 wide and `scene.frame.h` tall. */
  x?: SceneProp<number>; y?: SceneProp<number>;
  /** Size of a rect / ellipse / clipped group. */
  w?: SceneProp<number>; h?: SceneProp<number>;
  /** Which point of the box sits at (x, y): 0..1 across and down, default 0.5 (centre). 0,0 = top-left corner. */
  ax?: number; ay?: number;
  rotation?: SceneProp<number>; scale?: SceneProp<number>; scaleX?: SceneProp<number>; scaleY?: SceneProp<number>;
  opacity?: SceneProp<number>;
  /** Rect corner radius. */
  radius?: SceneProp<number>;
  fill?: SceneProp<string>;
  gradient?: { angle: number; stops: { p: number; c: string }[] };
  stroke?: string; strokeWidth?: SceneProp<number>;
  blur?: SceneProp<number>;
  shadow?: { color: string; blur: number; x?: number; y?: number };
  blend?: 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighter' | 'difference' | 'soft-light';
  /** Line: end point (the start is x, y) and how much of it is drawn, 0..1. */
  x2?: SceneProp<number>; y2?: SceneProp<number>; trim?: SceneProp<number>; cap?: 'round' | 'butt';
  /** Path: flat [x0,y0,x1,y1,…] points relative to the node origin, drawn as a smooth curve through them. `trim` draws part of it. */
  points?: number[]; closed?: boolean;
  /** Text. */
  text?: string; size?: SceneProp<number>; font?: string; weight?: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; italic?: boolean;
  /** Text: how much of it is shown, 0..1 (type-on). */
  reveal?: SceneProp<number>;
  /** Group. */
  children?: SceneNode[]; clip?: boolean;
}

export interface SceneAdjust {
  /** Degrees, -180..180. */
  hue?: number;
  /** 0..2, 1 = unchanged. */
  sat?: number;
  /** 0.4..1.8, 1 = unchanged. */
  bri?: number;
  /** 0.5..1.8, 1 = unchanged. */
  con?: number;
  /** Playback speed, 0.25..3. */
  speed?: number;
}

export interface MotionScene {
  v: 1;
  name: string;
  /** Seconds. */
  duration: number;
  role: 'graphic' | 'transition' | 'background';
  /** A flat colour behind everything in the scene (usually empty so the video shows through). */
  bg?: string | null;
  /** Whole-scene look: colour shift, tone and speed, applied when the scene is drawn. Defaults are neutral. */
  adjust?: SceneAdjust;
  /** Design frame: width 1080, height depends on the project's aspect ratio. */
  frame?: { w: number; h: number };
  layers: SceneNode[];
}

export interface LibraryItem {
  id: string;
  kind: 'video' | 'audio' | 'image';
  name: string;
  assetId: string;
  duration: number;
  thumb?: string;
  /** Part of the file to use (seconds), set by marking In and Out in the media viewer. */
  range?: { in: number; out: number };
}
