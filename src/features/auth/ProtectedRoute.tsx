import type { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "./AuthProvider";
import { configured } from "../../lib/supabase";
import { State } from "../../components/ui/State";
export function ProtectedRoute({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const a = useAuth();
  if (!configured)
    return (
      <State title="Conecte sua conta SAGE">
        <p>
          O serviço de contas ainda não foi configurado neste ambiente. As
          instruções estão no README do projeto.
        </p>
        <Link href="/">Voltar ao site</Link>
      </State>
    );
  if (a.status === "loading")
    return <State title="Verificando seu acesso" tone="loading" />;
  if (a.status === "error")
    return (
      <State
        title="Não foi possível verificar seu perfil"
        tone="error"
        retry={a.retry}
      >
        Confira sua conexão. Nenhum dado de acompanhamento foi carregado.
      </State>
    );
  if (a.status === "anonymous")
    return (
      <State title="Entre para continuar">
        <p>Somente pessoas autorizadas podem acessar o acompanhamento.</p>
        <Link
          className="button button-primary"
          href={`/auth?returnTo=${encodeURIComponent(window.location.pathname)}`}
        >
          Acessar minha conta
        </Link>
      </State>
    );
  if (admin && a.profile?.role !== "admin")
    return (
      <State title="Acesso restrito à equipe SAGE" tone="error">
        <Link href="/dashboard">Ir para meu acompanhamento</Link>
      </State>
    );
  return children;
}
