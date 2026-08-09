import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillValueFromLevel } from "@/skills/values";
import { useCompanySim } from "./sim/CompanySimProvider";
import { toHydratePayload } from "./sim/hydrate";
import type { CompanyOverrides } from "./sim/types";
import type { CompanyAdvisorRow } from "./types";

const AE_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
const SKILL_LEVELS = Array.from({ length: 21 }, (_, i) => i);

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground scheme-dark outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function formatBonusPct(fraction: number): string {
  const pct = fraction * 100;
  if (!Number.isFinite(pct)) return "";
  return String(pct);
}

export function CompanyParametersForm({
  companyId,
  companies,
  aeLevel,
  productionBonus,
  entrepreneurshipLevel,
  productionSkillLevel,
  includeSelfWork,
}: {
  companyId: string;
  companies: CompanyAdvisorRow[];
  aeLevel: number;
  /** Fraction (e.g. 0.605), shown as percent in the UI. */
  productionBonus: number;
  entrepreneurshipLevel: number;
  productionSkillLevel: number;
  includeSelfWork: boolean;
}) {
  const { dispatch } = useCompanySim();
  const formId = useId();
  const bonusFocusedRef = useRef(false);
  const [bonusText, setBonusText] = useState(() => formatBonusPct(productionBonus));

  useEffect(() => {
    if (!bonusFocusedRef.current) {
      setBonusText(formatBonusPct(productionBonus));
    }
  }, [productionBonus, companyId]);

  function patch(partial: CompanyOverrides) {
    dispatch({ type: "setCompanyOverride", companyId, patch: partial });
  }

  return (
    <form
      className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-2.5"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-ae`} className="text-foreground">
          AE level
        </Label>
        <select
          id={`${formId}-ae`}
          className={selectClassName}
          value={aeLevel}
          onChange={(e) => patch({ aeLevel: Number(e.target.value) })}
        >
          {AE_LEVELS.map((level) => (
            <option key={level} value={level}>
              AE {level}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-bonus`} className="text-foreground">
          Bonus %
        </Label>
        <Input
          id={`${formId}-bonus`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className="text-foreground"
          value={bonusText}
          onFocus={() => {
            bonusFocusedRef.current = true;
          }}
          onBlur={() => {
            bonusFocusedRef.current = false;
            setBonusText(formatBonusPct(productionBonus));
          }}
          onChange={(e) => {
            const next = e.target.value;
            setBonusText(next);
            const pct = Number(next);
            if (!Number.isFinite(pct)) return;
            patch({ productionBonus: pct / 100 });
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-entre`} className="text-foreground">
          Entrepreneurship
        </Label>
        <select
          id={`${formId}-entre`}
          className={selectClassName}
          value={entrepreneurshipLevel}
          onChange={(e) => patch({ entrepreneurshipLevel: Number(e.target.value) })}
        >
          {SKILL_LEVELS.map((level) => (
            <option key={level} value={level}>
              Lv {level} – {skillValueFromLevel("entrepreneurship", level)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-prod`} className="text-foreground">
          Production skill
        </Label>
        <select
          id={`${formId}-prod`}
          className={selectClassName}
          value={productionSkillLevel}
          onChange={(e) => patch({ productionSkillLevel: Number(e.target.value) })}
        >
          {SKILL_LEVELS.map((level) => (
            <option key={level} value={level}>
              Lv {level} – {skillValueFromLevel("production", level)}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeSelfWork}
            onChange={(e) => patch({ includeSelfWork: e.target.checked })}
            className="size-3.5 accent-primary"
          />
          Include self-work
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            dispatch({
              type: "resetCompany",
              companyId,
              live: toHydratePayload(companies),
            })
          }
        >
          Reset company
        </Button>
      </div>
    </form>
  );
}
