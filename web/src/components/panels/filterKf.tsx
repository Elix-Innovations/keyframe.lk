import { createContext, useContext } from 'react';

/** Keyframe state of one slider: whether a keyframe sits at the playhead, and a toggle to add or remove it. */
export type SliderKf = { on: boolean; toggle: () => void };

/** Lets deeply nested colour controls show a diamond without threading props through every section. */
export const FilterKfContext = createContext<((key: string) => SliderKf) | null>(null);

export function useFilterKf(): (key: string) => SliderKf | undefined {
  const f = useContext(FilterKfContext);
  return (key) => f?.(key);
}
