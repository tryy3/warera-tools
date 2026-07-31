import { useEffect, useId, useRef, useState } from "react";
import { flagEmojiFromIso } from "../../lib/flagEmoji";
import type { Country } from "./types";

type Props = {
  countries: Country[];
  value: string;
  onChange: (countryId: string) => void;
  disabled?: boolean;
};

function labelFor(country: Country): string {
  const flag = flagEmojiFromIso(country.isoCode);
  return flag ? `${flag} ${country.name}` : country.name;
}

export function CountrySelect({ countries, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = countries.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="country-select" ref={rootRef}>
      <button
        type="button"
        className="country-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || countries.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? labelFor(selected) : countries.length === 0 ? "No countries" : "Select country"}
      </button>
      {open ? (
        <ul id={listId} className="country-select-list" role="listbox">
          {countries.map((country) => {
            const isSelected = country.id === value;
            return (
              <li key={country.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={isSelected ? "is-selected" : undefined}
                  onClick={() => {
                    onChange(country.id);
                    setOpen(false);
                  }}
                >
                  {labelFor(country)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
