import type { SkillBand } from "@/equipment/skills";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  bands: SkillBand[];
  onChange: (bands: SkillBand[]) => void;
  disabled?: boolean;
};

function formatSkillKey(key: string): string {
  if (!key) return key;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function SkillBandControls({ bands, onChange, disabled }: Props) {
  if (bands.length === 0) {
    return (
      <p className="m-0 text-sm text-muted-foreground">No skill rolls observed for this item.</p>
    );
  }

  function patchBand(index: number, patch: Partial<Pick<SkillBand, "target" | "band">>) {
    onChange(bands.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  return (
    <div className="flex flex-wrap gap-4">
      {bands.map((band, index) => (
        <div
          key={band.key}
          className="flex min-w-48 flex-wrap items-end gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2"
        >
          <div className="min-w-20 flex-1">
            <Label htmlFor={`skill-target-${band.key}`} className="mb-1 text-muted-foreground">
              {formatSkillKey(band.key)}
            </Label>
            <Input
              id={`skill-target-${band.key}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={Number.isFinite(band.target) ? band.target : ""}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.valueAsNumber;
                if (!Number.isFinite(next)) return;
                patchBand(index, { target: next });
              }}
            />
          </div>
          <div className="w-20">
            <Label htmlFor={`skill-band-${band.key}`} className="mb-1 text-muted-foreground">
              ± band
            </Label>
            <Input
              id={`skill-band-${band.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={Number.isFinite(band.band) ? band.band : ""}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.valueAsNumber;
                if (!Number.isFinite(next)) return;
                patchBand(index, { band: Math.max(0, next) });
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
