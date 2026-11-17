import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Box,
  FileBarChart2,
  Layers3,
  LifeBuoy,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../features/auth/AuthProvider";
import "../../styles/workspace.css";
export function WorkspaceSidebar({ children }: { children: ReactNode }) {
  const a = useAuth();
  const [path] = useLocation();
  const links = [
    { path: "/dashboard", label: "Acompanhamento", icon: Activity },
    { path: "/relatorios", label: "Relatórios", icon: FileBarChart2 },
    { path: "/planos", label: "Planos", icon: Layers3 },
    { path: "/modelo", label: "Modelo 3D", icon: Box },
    { path: "/minha-conta", label: "Minha conta", icon: Settings },
    { path: "/suporte", label: "Suporte interno", icon: LifeBuoy },
    ...(a.profile?.role === "admin"
      ? [{ path: "/admin", label: "Administração", icon: ShieldCheck }]
      : []),
  ];
  return (
    <div className="workspace-frame">
      <aside className="workspace-sidebar">
        <div className="sidebar-heading">
          <span className="eyebrow">ESPAÇO DE CUIDADO</span>
          <strong>Sua rede, mais próxima.</strong>
        </div>
        <nav aria-label="Menu lateral">
          {links.map(({ path: href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <p>Informações disponíveis apenas à sua rede autorizada.</p>
        </div>
      </aside>
      <div className="workspace-content">{children}</div>
    </div>
  );
}
