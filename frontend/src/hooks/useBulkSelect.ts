import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select for a list, kept behind an explicit switch.
 *
 * A checkbox next to every row on every screen is noise the whole time it is
 * not being used, so selection starts off: `enable()` turns the column on,
 * `cancel()` turns it off and forgets whatever was ticked. The ids survive
 * paging and filtering — only leaving the mode clears them.
 */
export function useBulkSelect<T extends { id: string }>(rows: T[]) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const enable = useCallback(() => setActive(true), []);

  const cancel = useCallback(() => {
    setActive(false);
    setSelected([]);
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  /** "Select all" means every row currently on screen. */
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const everyOne = ids.length > 0 && ids.every((id) => prev.includes(id));
      return everyOne ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });
  }, [ids]);

  return { active, enable, cancel, selected, count: selected.length, toggle, toggleAll, allSelected, clear };
}
