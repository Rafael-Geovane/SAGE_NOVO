import { Link, useLocation } from "wouter";
import { ScanLine, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ConnectDevice } from "../../features/devices/ConnectDevice";
import { useAuth } from "../../features/auth/AuthProvider";
import { Button } from "../ui/Button";
export function WorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const a = useAuth();
  const cache = useQueryClient(),
    [, navigate] = useLocation();
  return (
    <>
      <div className="workspace-header">
        <div>
          <span className="eyebrow">SUA REDE SAGE</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="workspace-actions">
          <Button
            data-navigate
            variant="outline"
            size="sm"
            onClick={() => void a.signOut()}
          >
            <LogOut size={15} />
            Sair
          </Button>
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="Área da conta">
        <Link
          href="/minha-conta"
          aria-current={
            window.location.pathname === "/minha-conta" ? "page" : undefined
          }
        >
          Minha conta
        </Link>
        <Link
          href="/dashboard"
          aria-current={
            window.location.pathname === "/dashboard" ? "page" : undefined
          }
        >
          Acompanhamento
        </Link>
        <Link
          href="/suporte"
          aria-current={
            window.location.pathname === "/suporte" ? "page" : undefined
          }
        >
          Suporte interno
        </Link>
        {a.profile && (
          <ConnectDevice
            mode={a.profile.role === "admin" ? "register" : "pair"}
            trigger={
              <Button variant="ghost">
                <ScanLine size={15} /> Informar código do colete
              </Button>
            }
            onConnected={async (connection, profileComplete) => {
              cache.setQueryData(
                ["selected-device", a.profile!.id],
                connection,
              );
              await cache.invalidateQueries({
                queryKey: ["devices", a.profile!.id],
              });
              if (profileComplete) navigate("/dashboard");
            }}
          />
        )}
        {a.profile?.role === "admin" && (
          <Link
            href="/admin"
            aria-current={
              window.location.pathname === "/admin" ? "page" : undefined
            }
          >
            Administração
          </Link>
        )}
      </nav>
    </>
  );
}
