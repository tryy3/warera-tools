import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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
  const selected = countries.find((c) => c.id === value) ?? null;
  const empty = countries.length === 0;

  return (
    <Combobox
      items={countries}
      value={selected}
      onValueChange={(next) => {
        const country = next as Country | null;
        if (country) onChange(country.id);
      }}
      itemToStringLabel={(item: Country) => labelFor(item)}
      itemToStringValue={(item: Country) => item.id}
      isItemEqualToValue={(a: Country, b: Country) => a.id === b.id}
      disabled={disabled || empty}
    >
      <ComboboxInput
        placeholder={empty ? "No countries" : "Select country"}
        disabled={disabled || empty}
        className="w-full min-w-40"
        showClear={false}
      />
      <ComboboxContent>
        <ComboboxEmpty>No countries</ComboboxEmpty>
        <ComboboxList>
          {(country: Country) => (
            <ComboboxItem key={country.id} value={country}>
              {labelFor(country)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
