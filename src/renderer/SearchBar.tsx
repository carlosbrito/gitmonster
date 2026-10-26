import { forwardRef, useState } from "react";
import type { SearchField } from "../shared/types";

export const FIELD_LABEL: Record<SearchField, string> = {
  message: "Mensagem",
  author: "Autor",
  hash: "Hash",
  file: "Arquivo",
  content: "Conteúdo",
};

export interface SearchBarProps {
  busy: boolean;
  onSearch(field: SearchField, query: string): void;
  onClear(): void;
}

/** Campo de busca de commits na toolbar. Ctrl+F (tratado por quem usa) foca o campo de texto. */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar({ busy, onSearch, onClear }, ref) {
  const [field, setField] = useState<SearchField>("message");
  const [query, setQuery] = useState("");

  return (
    <form
      className="search-bar"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim() !== "") onSearch(field, query.trim());
      }}
    >
      <select aria-label="Campo da busca" value={field} onChange={(e) => setField(e.target.value as SearchField)} disabled={busy}>
        {(Object.keys(FIELD_LABEL) as SearchField[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <input
        ref={ref}
        aria-label="Buscar commits"
        placeholder="Buscar commits (Ctrl+F)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            onClear();
          }
        }}
        disabled={busy}
      />
      <button type="submit" disabled={busy || query.trim() === ""}>
        Buscar
      </button>
    </form>
  );
});
