import { AlertCircle, Info, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
export function State({
  title,
  children,
  tone = "info",
  retry,
}: {
  title: string;
  children?: ReactNode;
  tone?: "info" | "error" | "loading" | "success";
  retry?: () => void;
}) {
  const Icon =
    tone === "loading" ? LoaderCircle : tone === "error" ? AlertCircle : Info;
  return (
    <div
      className={`state state-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className={tone === "loading" ? "spin" : ""} size={21} />
      <div>
        <strong>{title}</strong>
        {children && <div>{children}</div>}
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
