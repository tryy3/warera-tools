import { useEffect, useMemo, useState } from "react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import { api } from "../../api";
import {
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
  type RecentEconomyPlayer,
} from "../../lib/recentEconomyPlayers";
import type { SearchUsersResponse } from "./types";

export type EconomyPlayerOption = {
  userId: string;
  username: string;
  source: "recent" | "result";
};

type PlayerGroup = {
  value: string;
  items: EconomyPlayerOption[];
};

type Props = {
  selectedUserId: string | null;
  onSelect: (userId: string, username: string) => void;
};

export function EconomyPlayerSearch({ selectedUserId, onSelect }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [recent, setRecent] = useState<RecentEconomyPlayer[]>(() => loadRecentEconomyPlayers());
  const [results, setResults] = useState<SearchUsersResponse["users"]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const data = await api<SearchUsersResponse>(
            `/api/economy/search?q=${encodeURIComponent(q)}`,
          );
          setResults(data.users);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [inputValue]);

  const recentIds = useMemo(() => new Set(recent.map((p) => p.userId)), [recent]);

  const recentOptions: EconomyPlayerOption[] = useMemo(
    () =>
      recent.map((p) => ({
        userId: p.userId,
        username: p.username,
        source: "recent" as const,
      })),
    [recent],
  );

  const resultOptions: EconomyPlayerOption[] = useMemo(
    () =>
      results
        .filter((u) => !recentIds.has(u.userId))
        .map((u) => ({
          userId: u.userId,
          username: u.username,
          source: "result" as const,
        })),
    [results, recentIds],
  );

  const items: PlayerGroup[] = useMemo(() => {
    const groups: PlayerGroup[] = [];
    if (recentOptions.length > 0) {
      groups.push({ value: "recent", items: recentOptions });
    }
    if (resultOptions.length > 0) {
      groups.push({ value: "results", items: resultOptions });
    }
    return groups;
  }, [recentOptions, resultOptions]);

  function handleSelect(option: EconomyPlayerOption | null) {
    if (!option) return;
    onSelect(option.userId, option.username);
    setRecent(rememberEconomyPlayer({ userId: option.userId, username: option.username }));
    setInputValue("");
    setResults([]);
  }

  const emptyMessage = searching
    ? "Searching…"
    : inputValue.trim().length < 2
      ? recent.length === 0
        ? "Type at least 2 characters to search"
        : "Select a recent player or type to search"
      : "No players found";

  return (
    <Combobox
      items={items}
      filter={null}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      value={null}
      onValueChange={(next) => {
        handleSelect(next as EconomyPlayerOption | null);
      }}
      itemToStringLabel={(item: EconomyPlayerOption) => item.username}
      itemToStringValue={(item: EconomyPlayerOption) => item.username}
      isItemEqualToValue={(a: EconomyPlayerOption, b: EconomyPlayerOption) => a.userId === b.userId}
    >
      <ComboboxInput
        id="user-search"
        placeholder="Search by username…"
        autoComplete="off"
        className="w-full"
        showClear={inputValue.length > 0}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(group: PlayerGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value === "recent" ? "Recent" : "Results"}</ComboboxLabel>
              <ComboboxCollection>
                {(item: EconomyPlayerOption) => (
                  <ComboboxItem
                    key={`${item.source}-${item.userId}`}
                    value={item}
                    data-selected={selectedUserId === item.userId ? "" : undefined}
                  >
                    <span className="flex-1">{item.username}</span>
                    {item.source === "result" ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.userId.slice(-6)}
                      </span>
                    ) : null}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {group.value === "recent" && resultOptions.length > 0 ? <ComboboxSeparator /> : null}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
