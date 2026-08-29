import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { buildHttpieCommand } from "./buildHttpieCommand";
import { parseBatchCapture } from "./parseBatchCapture";
import { rowStatus, type RowStatus } from "./rowStatus";

const statusVariants: Record<RowStatus, "default" | "destructive" | "outline" | "secondary"> = {
  ok: "default",
  error: "destructive",
  "no input": "outline",
  "no response": "secondary",
};

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "undefined";
}

export function TrpcBatchPage() {
  const [url, setUrl] = useState("");
  const [payload, setPayload] = useState("");
  const [response, setResponse] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const parsed = parseBatchCapture(url, payload, response);
  const selected =
    selectedIndex !== null
      ? (parsed.rows.find((row) => row.index === selectedIndex) ?? null)
      : null;

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(`Copied ${label}`);
    } catch {
      setCopyNote(`Could not copy ${label}`);
    }
  }

  return (
    <section className="mx-auto flex max-w-[1100px] flex-col gap-6 rounded-md border border-border bg-card p-4 pb-6">
      <div>
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">tRPC Batch Inspector</h1>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">
          Paste a captured batch request and response to inspect each procedure locally.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="trpc-batch-url">Batch URL</Label>
          <Textarea
            id="trpc-batch-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://api5.warera.io/trpc/procedure.one,procedure.two?batch=1"
            className="min-h-20 font-mono"
            aria-invalid={parsed.urlError ? true : undefined}
          />
          {parsed.urlError ? (
            <p className="m-0 text-sm text-destructive">{parsed.urlError}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="trpc-batch-payload">Payload JSON</Label>
          <Textarea
            id="trpc-batch-payload"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder={'{"0":{"itemId":"example"},"1":{"page":1}}'}
            className="min-h-36 font-mono"
            aria-invalid={parsed.payloadError ? true : undefined}
          />
          {parsed.payloadError ? (
            <p className="m-0 text-sm text-destructive">{parsed.payloadError}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="trpc-batch-response">Response JSON</Label>
          <Textarea
            id="trpc-batch-response"
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            placeholder='[{"result":{"data":{}}},{"error":{"message":"Example"}}]'
            className="min-h-36 font-mono"
            aria-invalid={parsed.responseError ? true : undefined}
          />
          {parsed.responseError ? (
            <p className="m-0 text-sm text-destructive">{parsed.responseError}</p>
          ) : null}
        </div>

        {parsed.warnings.length > 0 ? (
          <ul className="m-0 grid gap-1 pl-5 text-sm text-muted-foreground">
            {parsed.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="m-0 text-[1.05rem] font-semibold">Procedures</h2>
          <span className="text-sm text-muted-foreground">{parsed.rows.length} rows</span>
        </div>

        {parsed.rows.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            Paste a valid batch URL to list its procedures.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Index</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Input keys</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.rows.map((row) => {
                const status = rowStatus(row);
                const inputKeys =
                  row.input && typeof row.input === "object" && !Array.isArray(row.input)
                    ? Object.keys(row.input).join(", ")
                    : "—";
                const isSelected = selectedIndex === row.index;

                return (
                  <TableRow
                    key={`${row.index}-${row.procedure}`}
                    data-state={isSelected ? "selected" : undefined}
                    className={isSelected ? "bg-primary/15" : undefined}
                  >
                    <TableCell className="font-mono text-sm">{row.index}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 font-mono text-sm font-medium"
                        onClick={() => setSelectedIndex(row.index)}
                      >
                        {row.procedure}
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inputKeys || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[status]}>{status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {selected ? (
        <section className="grid gap-4 border-t border-border pt-5">
          <div>
            <h2 className="m-0 text-[1.05rem] font-semibold">
              Row {selected.index}: {selected.procedure}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void copyText("HTTPie command", buildHttpieCommand(selected))}
              >
                Copy HTTPie
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selected.input === null}
                onClick={() => void copyText("input JSON", jsonText(selected.input))}
              >
                Copy input JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selected.response === null}
                onClick={() => void copyText("response JSON", jsonText(selected.response))}
              >
                Copy response JSON
              </Button>
              {copyNote ? (
                <span aria-live="polite" className="text-sm text-muted-foreground">
                  {copyNote}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold">Input</h3>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {jsonText(selected.input)}
              </pre>
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold">Response</h3>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {jsonText(selected.response)}
              </pre>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
