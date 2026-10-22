/** Extra Hugeicons for the audio features (kept separate from icons.tsx to avoid merge churn). */
import { HugeiconsIcon } from '@hugeicons/react';
import { AudioWave01Icon, MinusSignIcon, MusicNote01Icon, Search01Icon, VolumeHighIcon } from '@hugeicons/core-free-icons';

type IconData = Parameters<typeof HugeiconsIcon>[0]['icon'];
interface IconProps { className?: string; strokeWidth?: number }
const make = (icon: IconData) => ({ className, strokeWidth = 1.8 }: IconProps) => <HugeiconsIcon icon={icon} className={className} strokeWidth={strokeWidth} />;

export const Music = make(MusicNote01Icon);
export const Volume = make(VolumeHighIcon);
export const Waveform = make(AudioWave01Icon);
export const Search = make(Search01Icon);
export const Minus = make(MinusSignIcon);

import { Layers01Icon, LockIcon, MagnetIcon, SquareUnlock02Icon, ViewIcon, ViewOffIcon, VolumeOffIcon } from '@hugeicons/core-free-icons';
export const Eye = make(ViewIcon);
export const EyeOff = make(ViewOffIcon);
export const Lock = make(LockIcon);
export const Unlock = make(SquareUnlock02Icon);
export const VolumeOff = make(VolumeOffIcon);
export const Magnet = make(MagnetIcon);
export const Layers = make(Layers01Icon);

import { Link04Icon, ArrowDataTransferHorizontalIcon as RippleIcon } from '@hugeicons/core-free-icons';
export const Link = make(Link04Icon);
export const Ripple = make(RippleIcon);
