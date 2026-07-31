import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTaxPercent, setEditTaxPercent] = useState("");

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
    setEditingId(country.id);
    setEditName(country.name);
    setEditTaxPercent(String(percentFromRate(country.taxRate)));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditTaxPercent("");
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
        body: JSON.stringify({ name, taxRate: rateFromPercent(percent) }),
      });
      setCountries((prev) => [...prev, data.country]);
      setAddName("");
      setAddTaxPercent("1");
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
          body: JSON.stringify({ name, taxRate: rateFromPercent(percent) }),
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
    <section className="page">
      <div className="page-header">
        <h1>Countries</h1>
        <button type="button" onClick={() => void loadCountries()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading countries…</p> : null}

      {!loading && countries.length === 0 && !error ? (
        <p className="muted">No countries yet.</p>
      ) : null}

      {countries.length > 0 ? (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tax %</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((country) => {
              const editing = editingId === country.id;
              return (
                <tr key={country.id} className={editing ? "selected" : undefined}>
                  <td>
                    {editing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={busy}
                        aria-label="Country name"
                      />
                    ) : (
                      <>
                        {country.name}
                        <div className="muted small mono">{country.id}</div>
                      </>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
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
                  </td>
                  <td className="actions">
                    {editing ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => void saveEdit()}>
                          Save
                        </button>
                        <button type="button" disabled={busy} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || editingId != null}
                        onClick={() => startEdit(country)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <h2>Add country</h2>
      <form className="country-form" onSubmit={(e) => void handleAdd(e)}>
        <label>
          Name
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label>
          Tax %
          <input
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
        <button type="submit" disabled={busy}>
          Add
        </button>
      </form>
    </section>
  );
}
