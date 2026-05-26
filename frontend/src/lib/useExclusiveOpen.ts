'use client';
import { useEffect, useId, useState } from 'react';

const OPEN_EVENT = 'ui:dropdown-open';

/**
 * Hook for "only-one-dropdown-open-at-a-time" behaviour. Each dropdown gets a
 * unique id; when it opens it broadcasts; every other instance listens and
 * closes itself if the broadcast id is not theirs.
 */
export function useExclusiveOpen(): [boolean, (next: boolean) => void] {
  const id = useId();
  const [open, setOpenState] = useState(false);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) {
      window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: id }));
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail !== id) setOpenState(false);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, [id]);

  return [open, setOpen];
}
