/**
 * App icon set: Hugeicons (the icon library configured for shadcn/ui in components.json).
 * Wrapped under short names so components read naturally and the library can be swapped in one place.
 */
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon, Alert02Icon, AlignBottomIcon, AlignTopIcon, AlignVerticalCenterIcon, ArrowDataTransferHorizontalIcon,
  ArrowLeft01Icon, ArrowReloadHorizontalIcon, ArrowRight01Icon, AudioWave01Icon, Cancel01Icon, Clock01Icon,
  ClosedCaptionIcon, CloudSavingDone01Icon, Copy01Icon, CropIcon, DashboardSquare02Icon, Delete02Icon,
  Download04Icon, File01Icon, FileImportIcon, Film02Icon, FloppyDiskIcon, GitMergeIcon,
  HighlighterIcon, ImageAdd01Icon, KeyboardIcon, Loading03Icon, MagicWand01Icon, MoreHorizontalIcon,
  PauseIcon, PencilEdit02Icon, PlayIcon, PreviousIcon, Redo02Icon, RotateLeft01Icon,
  ScissorIcon, SmartPhone01Icon, SparklesIcon, Target02Icon, TextAllCapsIcon, TextBoldIcon,
  TextFontIcon, TextIcon, TextItalicIcon, Tick02Icon, TranslateIcon, Undo02Icon,
  UnfoldMoreIcon, Upload04Icon, Video01Icon, WaveIcon, ZoomInAreaIcon, ZoomOutAreaIcon,
} from '@hugeicons/core-free-icons';
import { StarIcon, ClipboardIcon, PictureInPictureIcon, MaximizeScreenIcon, MinimizeScreenIcon } from '@hugeicons/core-free-icons';
export const ClipboardPaste = make(ClipboardIcon, 'ClipboardPaste');
export const PictureInPicture = make(PictureInPictureIcon, 'PictureInPicture');
import { ArrowDown01Icon, ArrowRight02Icon, Coins01Icon, ComputerIcon, GridViewIcon, Menu01Icon, Search01Icon, SecurityCheckIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';

type IconData = Parameters<typeof HugeiconsIcon>[0]['icon'];
export interface IconProps { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }

function make(icon: IconData, name: string) {
  const C = ({ className, strokeWidth = 1.8, ...rest }: IconProps) => <HugeiconsIcon icon={icon} className={className} strokeWidth={strokeWidth} {...rest} />;
  C.displayName = name;
  return C;
}

export const Activity = make(WaveIcon, 'Activity');
export const AlignVerticalJustifyCenter = make(AlignVerticalCenterIcon, 'AlignVerticalJustifyCenter');
export const AlignVerticalJustifyEnd = make(AlignBottomIcon, 'AlignVerticalJustifyEnd');
export const AlignVerticalJustifyStart = make(AlignTopIcon, 'AlignVerticalJustifyStart');
export const ArrowLeft = make(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowLeftRight = make(ArrowDataTransferHorizontalIcon, 'ArrowLeftRight');
export const AudioLines = make(AudioWave01Icon, 'AudioLines');
export const Bold = make(TextBoldIcon, 'Bold');
export const Captions = make(ClosedCaptionIcon, 'Captions');
export const CaseUpper = make(TextAllCapsIcon, 'CaseUpper');
export const Check = make(Tick02Icon, 'Check');
export const ChevronLeft = make(ArrowLeft01Icon, 'ChevronLeft');
export const ChevronRight = make(ArrowRight01Icon, 'ChevronRight');
export const ChevronsUpDown = make(UnfoldMoreIcon, 'ChevronsUpDown');
export const Clapperboard = make(Video01Icon, 'Clapperboard');
export const Clock = make(Clock01Icon, 'Clock');
export const CloudCheck = make(CloudSavingDone01Icon, 'CloudCheck');
export const Copy = make(Copy01Icon, 'Copy');
export const Crosshair = make(Target02Icon, 'Crosshair');
export const Download = make(Download04Icon, 'Download');
export const Ellipsis = make(MoreHorizontalIcon, 'Ellipsis');
export const FileText = make(File01Icon, 'FileText');
export const FileType = make(TextFontIcon, 'FileType');
export const FileUp = make(FileImportIcon, 'FileUp');
export const Film = make(Film02Icon, 'Film');
export const Frame = make(CropIcon, 'Frame');
export const Highlighter = make(HighlighterIcon, 'Highlighter');
export const ImagePlus = make(ImageAdd01Icon, 'ImagePlus');
export const Italic = make(TextItalicIcon, 'Italic');
export const Keyboard = make(KeyboardIcon, 'Keyboard');
export const Languages = make(TranslateIcon, 'Languages');
export const Coins = make(Coins01Icon, 'Coins');
export const ChevronDown = make(ArrowDown01Icon, 'ChevronDown');
export const LayoutTemplate = make(DashboardSquare02Icon, 'LayoutTemplate');
export const Loader2 = make(Loading03Icon, 'Loader2');
export const Merge = make(GitMergeIcon, 'Merge');
export const Pause = make(PauseIcon, 'Pause');
export const Pencil = make(PencilEdit02Icon, 'Pencil');
export const Play = make(PlayIcon, 'Play');
export const Plus = make(Add01Icon, 'Plus');
export const Redo2 = make(Redo02Icon, 'Redo2');
export const Replace = make(ArrowReloadHorizontalIcon, 'Replace');
export const RotateCcw = make(RotateLeft01Icon, 'RotateCcw');
export const Save = make(FloppyDiskIcon, 'Save');
export const Scissors = make(ScissorIcon, 'Scissors');
export const SkipBack = make(PreviousIcon, 'SkipBack');
export const Smartphone = make(SmartPhone01Icon, 'Smartphone');
export const Sparkles = make(SparklesIcon, 'Sparkles');
export const Trash2 = make(Delete02Icon, 'Trash2');
export const TriangleAlert = make(Alert02Icon, 'TriangleAlert');
export const Type = make(TextIcon, 'Type');
export const Undo2 = make(Undo02Icon, 'Undo2');
export const Upload = make(Upload04Icon, 'Upload');
export const WandSparkles = make(MagicWand01Icon, 'WandSparkles');
export const X = make(Cancel01Icon, 'X');
export const ZoomIn = make(ZoomInAreaIcon, 'ZoomIn');
export const ZoomOut = make(ZoomOutAreaIcon, 'ZoomOut');
export const Search = make(Search01Icon, 'Search');
export const LayoutGrid = make(GridViewIcon, 'LayoutGrid');
export const Rows = make(Menu01Icon, 'Rows');
export const ShieldCheck = make(SecurityCheckIcon, 'ShieldCheck');
export const ArrowRight = make(ArrowRight02Icon, 'ArrowRight');
export const Monitor = make(ComputerIcon, 'Monitor');
export const Moon = make(Moon02Icon, 'Moon');
export const Sun = make(Sun03Icon, 'Sun');

export const Star = make(StarIcon, 'Star');
export const Maximize = make(MaximizeScreenIcon, 'Maximize');
export const Minimize = make(MinimizeScreenIcon, 'Minimize');
