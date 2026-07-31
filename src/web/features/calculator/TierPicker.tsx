import { GEAR_TIERS, type GearTierId } from "@/calculator";

const CHEST_SRC = "https://media.warera.io/images/items/chest.png?v=33";

type Props = {
  value: GearTierId;
  onChange: (tier: GearTierId) => void;
};

export function TierPicker({ value, onChange }: Props) {
  return (
    <div className="tier-picker" role="radiogroup" aria-label="Gear tier">
      {GEAR_TIERS.map((tier) => {
        const selected = tier.id === value;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={tier.label}
            className={`tier-tile tier-tile--${tier.id}${selected ? " is-selected" : ""}`}
            onClick={() => onChange(tier.id)}
          >
            <img className="tier-tile-icon" src={CHEST_SRC} alt="" draggable={false} />
            <span className="tier-tile-footer">{tier.scraps}</span>
          </button>
        );
      })}
    </div>
  );
}
