import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "../../api";
import { FlagIcon } from "../../components/FlagIcon";
import type { CountriesResponse, Country } from "./types";

function percentFromRate(taxRate: number): number {
  return taxRate * 100;
}

function rateFromPercent(percent: number): number {
  return percent / 100;
}

export function CountriesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addName, setAddName] = useState("");
  const [addTaxPercent, setAddTaxPercent] = useState("1");
  const [addIsoCode, setAddIsoCode] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTaxPercent, setEditTaxPercent] = useState("");
  const [editIsoCode, setEditIsoCode] = useState("");

  async function loadCountries() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<CountriesResponse>("/api/countries");
      setCountries(data.countries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCountries();
  }, []);

  function startEdit(country: Country) {
    if (country.source === "warera") return;
    setEditingId(country.id);
    setEditName(country.name);
    setEditTaxPercent(String(percentFromRate(country.taxRate)));
    setEditIsoCode(country.isoCode ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditTaxPercent("");
    setEditIsoCode("");
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    const percent = Number(addTaxPercent);
    if (!name) {
      setError("name must be a non-empty string");
      return;
    }
    if (!Number.isFinite(percent)) {
      setError("tax percent must be a number");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await api<{ country: Country }>("/api/countries", {
        method: "POST",
        body: JSON.stringify({
          name,
          taxRate: rateFromPercent(percent),
          isoCode: addIsoCode.trim() === "" ? null : addIsoCode.trim(),
        }),
      });
      setCountries((prev) => [...prev, data.country]);
      setAddName("");
      setAddTaxPercent("1");
      setAddIsoCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;

    const name = editName.trim();
    const percent = Number(editTaxPercent);
    if (!name) {
      setError("name must be a non-empty string");
      return;
    }
    if (!Number.isFinite(percent)) {
      setError("tax percent must be a number");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await api<{ country: Country }>(
        `/api/countries/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            taxRate: rateFromPercent(percent),
            isoCode: editIsoCode.trim() === "" ? null : editIsoCode.trim(),
          }),
        },
      );
      setCountries((prev) => prev.map((c) => (c.id === data.country.id ? data.country : c)));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Countries</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadCountries()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading countries…</p> : null}

      {!loading && countries.length === 0 && !error ? (
        <p className="text-muted-foreground">No countries yet.</p>
      ) : null}

      {countries.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>ISO</TableHead>
              <TableHead>Tax %</TableHead>
              <TableHead>Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((country) => {
              const isWarera = country.source === "warera";
              const editing = !isWarera && editingId === country.id;
              return (
                <TableRow
                  key={country.id}
                  className={editing ? "bg-primary/15" : undefined}
                  data-state={editing ? "selected" : undefined}
                >
                  <TableCell>
                    {editing ? (
                      <Input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={busy}
                        aria-label="Country name"
                      />
                    ) : (
                      <>
                        {country.name}
                        <div className="font-mono text-sm text-muted-foreground">{country.id}</div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {editing ? (
                      <>
                        <Input
                          type="text"
                          value={editIsoCode}
                          onChange={(e) => setEditIsoCode(e.target.value)}
                          disabled={busy}
                          maxLength={2}
                          placeholder="SE"
                          aria-label="ISO country code"
                        />
                        <div className="text-sm text-muted-foreground">
                          Optional ISO 3166-1 alpha-2 (e.g. SE)
                        </div>
                      </>
                    ) : country.isoCode ? (
                      <span className="icon-label">
                        <FlagIcon code={country.isoCode} />
                        {country.isoCode}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {editing ? (
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={editTaxPercent}
                        onChange={(e) => setEditTaxPercent(e.target.value)}
                        disabled={busy}
                        aria-label="Tax percent"
                      />
                    ) : (
                      percentFromRate(country.taxRate).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })
                    )}
                  </TableCell>
                  <TableCell>
                    {isWarera ? (
                      <span className="text-sm text-muted-foreground">Synced</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {editing ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void saveEdit()}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || editingId != null}
                            onClick={() => startEdit(country)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      <h2 className="mt-5 mb-2 text-[1.05rem] font-semibold">Add country</h2>
      <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={(e) => void handleAdd(e)}>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Name
          <Input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Tax %
          <Input
            type="number"
            step="any"
            min="0"
            max="100"
            value={addTaxPercent}
            onChange={(e) => setAddTaxPercent(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          ISO
          <Input
            type="text"
            value={addIsoCode}
            onChange={(e) => setAddIsoCode(e.target.value)}
            disabled={busy}
            maxLength={2}
            placeholder="SE"
            aria-label="ISO country code"
          />
          <span className="text-sm text-muted-foreground">
            Optional ISO 3166-1 alpha-2 (e.g. SE)
          </span>
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          Add
        </Button>
      </form>
    </section>
  );
}
