import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { PAGE_SIZE } from "../../features/devices/api";
export function Pagination({
  page,
  count,
  setPage,
  busy = false,
}: {
  page: number;
  count: number;
  setPage: (p: number) => void;
  busy?: boolean;
}) {
  return (
    <div className="pagination">
      <span>
        {count === 0
          ? "Nenhum registro"
          : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, count)} de ${count}`}
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={page === 0 || busy}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={(page + 1) * PAGE_SIZE >= count || busy}
        >
          Próxima
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
