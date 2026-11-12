import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  ArrowUpRight,
  Menu,
  X,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../features/auth/AuthProvider";
import { NotificationCenter } from "../../features/notifications/NotificationCenter";
import { BrowserNotifications } from "../../features/notifications/BrowserNotifications";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="SAGE — início">
      <span className="logo-symbol">
        <Activity size={23} />
      </span>
      <span>
        SAGE<small>SOLUTIONS</small>
      </span>
    </Link>
  );
}
export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false),
    [path] = useLocation(),
    a = useAuth();
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="public-header">
        <div className="container nav-row">
          <Logo />
          <nav
            id="mobile-nav"
            aria-label="Navegação principal"
            className={open ? "public-nav is-open" : "public-nav"}
          >
            <Link
              href="/"
              aria-current={path === "/" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              Início
            </Link>
            <Link
              href="/loja"
              aria-current={path === "/loja" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              Smart Vest
            </Link>
            <Link
              href="/como-funciona"
              aria-current={path === "/como-funciona" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              Como funciona
            </Link>
            <Link href="/suporte" onClick={() => setOpen(false)}>
              Suporte
            </Link>
          </nav>
          <div className="nav-actions">
            <NotificationCenter />
            <Link
              className="bag-link"
              href="/carrinho"
              aria-label="Ver carrinho"
            >
              <ShoppingBag size={20} />
            </Link>
            <Link
              className="account-link"
              href={a.status === "authenticated" ? "/minha-conta" : "/auth"}
              aria-current={path === "/minha-conta" ? "page" : undefined}
            >
              <UserRound size={17} />
              <span>Minha conta</span>
              <ArrowUpRight size={16} />
            </Link>
            <button
              className="mobile-menu"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Fechar navegação" : "Abrir navegação"}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="conteudo">
        {a.status === "authenticated" &&
        [
          "/dashboard",
          "/minha-conta",
          "/admin",
          "/suporte",
          "/relatorios",
          "/planos",
          "/teste_colete",
        ].includes(path) ? (
          <WorkspaceSidebar>{children}</WorkspaceSidebar>
        ) : (
          children
        )}
      </main>
      {a.status === "authenticated" && a.profile && (
        <BrowserNotifications key={a.profile.id} userId={a.profile.id} />
      )}
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Logo />
            <p>
              Tecnologia que protege,
              <br />
              cuidado que respeita.
            </p>
          </div>
          <div>
            <strong>Conheça a SAGE</strong>
            <Link href="/loja">SAGE Smart Vest</Link>
            <Link href="/como-funciona">Como funciona</Link>
            <a href="/#privacidade">Privacidade no cuidado</a>
          </div>
          <div>
            <strong>Estamos por perto</strong>
            <Link href="/suporte">Conversar com a SAGE</Link>
            <Link href="/auth">Acessar minha conta</Link>
            <a href="/#perguntas">Perguntas frequentes</a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} SAGE Solutions · Projeto acadêmico
          </span>
          <span>
            O SAGE não substitui avaliação profissional ou serviços de
            emergência.
          </span>
        </div>
      </footer>
    </>
  );
}
