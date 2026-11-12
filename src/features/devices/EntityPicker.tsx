import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "../../lib/supabase";
import { Pagination } from "../../components/ui/Pagination";
import { State } from "../../components/ui/State";
import { useAuth } from "../auth/AuthProvider";
export function EntityPicker({
  table,
  label,
  value,
  onChange,
  caregivers = false,
  error,
}: {
  table: "people" | "profiles" | "devices";
  label: string;
  value: string;
  onChange: (id: string) => void;
  caregivers?: boolean;
  error?: string;
}) {
  const [page, setPage] = useState(0),
    a = useAuth();
  const q = useQuery({
    queryKey: ["options", a.profile!.id, table, page, caregivers],
    queryFn: async ({ signal }) => {
      let query = db()
        .from(table)
        .select(table === "devices" ? "id,code" : "id,display_name", {
          count: "exact",
        })
        .order(table === "devices" ? "code" : "display_name")
        .range(page * 25, page * 25 + 24)
        .abortSignal(signal);
      if (caregivers) query = query.eq("role", "caregiver");
      const { data, count, error } = await query;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as {
          id: string;
          code?: string;
          display_name?: string;
        }[],
        count: count ?? 0,
      };
    },
  });
  return (
    <div className="select-field">
      <label htmlFor={`picker-${table}`}>{label}</label>
      <select
        name={table}
        aria-invalid={!!error}
        aria-describedby={error ? `picker-${table}-error` : undefined}
        id={`picker-${table}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione uma opção</option>
        {value && !q.data?.rows.some((r) => r.id === value) && (
          <option value={value}>Seleção atual (outra página)</option>
        )}
        {q.data?.rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.display_name ?? r.code}
          </option>
        ))}
      </select>
      {error && (
        <p className="error-text" id={`picker-${table}-error`}>
          {error}
        </p>
      )}
      {q.isError ? (
        <State
          title="Não foi possível carregar as opções"
          tone="error"
          retry={() => void q.refetch()}
        />
      ) : q.isPending ? (
        <small>Carregando opções…</small>
      ) : q.data.count > 25 ? (
        <Pagination page={page} count={q.data.count} setPage={setPage} />
      ) : null}
    </div>
  );
}
