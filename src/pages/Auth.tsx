// Login/signup flow recovered from _journal.json, replacing legacy tRPC authentication.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { authStorage, db, configured } from "../lib/supabase";
import { useAuth } from "../features/auth/AuthProvider";
import { safeReturnTo } from "../features/auth/redirect";
import { Button } from "../components/ui/Button";
import { Field, PasswordField, focusFirst } from "../components/ui/Field";
import { State } from "../components/ui/State";
export default function Auth() {
  const a = useAuth(),
    [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(
      params.get("mode") === "update" ? "update" : "login",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [failure, setFailure] = useState("");
  const destination = safeReturnTo(params.get("returnTo"));
  useEffect(() => {
    if (a.recovery) setMode("update");
    else if (a.status === "authenticated" && mode !== "update")
      navigate(destination);
  }, [a.status, a.recovery, destination, mode, navigate]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const errs: Record<string, string> = {};
    if (mode !== "update" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Informe um e-mail válido.";
    if (mode !== "recover" && password.length < (mode === "login" ? 1 : 8))
      errs.password =
        mode === "login"
          ? "Informe sua senha."
          : "Use pelo menos 8 caracteres.";
    if (mode === "signup" && !name.trim())
      errs.name = "Informe como podemos chamar você.";
    if (mode === "signup" && !consent)
      errs.consent = "Confirme que entendeu o acesso por autorização.";
    setErrors(errs);
    setFailure("");
    setNotice("");
    if (Object.keys(errs).length) {
      focusFirst(form, errs);
      return;
    }
    if (!configured) return;
    setBusy(true);
    try {
      const client = db();
      if (mode === "login") {
        await authStorage!.signIn(client.auth, async () => {
          const { error } = await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (error) throw error;
        });
      }
      if (mode === "signup") {
        const data = await authStorage!.signIn(client.auth, async () => {
          const { data, error } = await client.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { display_name: name.trim() },
              emailRedirectTo: `${window.location.origin}/auth`,
            },
          });
          if (error) throw error;
          return data;
        });
        if (!data.session)
          setNotice(
            "Confira seu e-mail para confirmar o cadastro. Depois, entre na sua conta.",
          );
      }
      if (mode === "recover") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/auth?mode=update` },
        );
        if (error) throw error;
        setNotice(
          "Se houver uma conta para este e-mail, você receberá as instruções de recuperação.",
        );
      }
      if (mode === "update") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setNotice("Senha atualizada. Entre novamente com sua nova senha.");
        await a.signOut();
        setMode("login");
        setPassword("");
      }
    } catch {
      setFailure(
        mode === "login"
          ? "Não foi possível entrar. Confira e-mail e senha, a confirmação do cadastro e sua conexão."
          : "Não foi possível concluir. Confira sua conexão e tente novamente. Se o link expirou, solicite uma nova recuperação.",
      );
    } finally {
      setBusy(false);
    }
  }
  function change(next: string) {
    setMode(next);
    setErrors({});
    setNotice("");
    setFailure("");
  }
  const title =
    mode === "signup"
      ? "Sua rede de cuidado começa aqui."
      : mode === "recover"
        ? "Vamos recuperar seu acesso."
        : mode === "update"
          ? "Defina uma nova senha."
          : "Bom ter você por perto.";
  return (
    <section className="container auth-grid">
      <aside className="auth-aside">
        <span className="eyebrow">SAGE · CONEXÕES QUE CUIDAM</span>
        <h2>
          Tecnologia
          <br />
          com propósito.
          <br />
          <span>
            Cuidado
            <br />
            com respeito.
          </span>
        </h2>
        <div className="auth-values">
          <ShieldCheck />
          <p>
            Informações protegidas.
            <br />
            Acesso somente com autorização.
          </p>
        </div>
      </aside>
      <div className="auth-form">
        <span className="eyebrow">SUA CONTA SAGE</span>
        <h1>{title}</h1>
        <p>
          {mode === "login"
            ? "Acesse seus coletes e sua rede de acompanhamento."
            : "Seu acesso é pessoal. Cada vínculo de acompanhamento precisa ser autorizado."}
        </p>
        {!configured && (
          <State title="Contas ainda não configuradas">
            Configure a conexão com o Supabase seguindo o README para habilitar
            entrada e recuperação. Nenhuma sessão de demonstração será criada.
          </State>
        )}
        <form noValidate onSubmit={submit}>
          {mode === "signup" && (
            <Field
              name="name"
              label="Seu nome"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
          )}
          {mode !== "update" && (
            <Field
              name="email"
              type="email"
              label="E-mail"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />
          )}
          {mode !== "recover" && (
            <PasswordField
              name="password"
              label={mode === "update" ? "Nova senha" : "Senha"}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
          )}
          {mode === "signup" && (
            <div className="checkbox-field">
              <label>
                <input
                  name="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  aria-invalid={!!errors.consent}
                  aria-describedby={
                    errors.consent ? "consent-error" : undefined
                  }
                />
                Entendo que o acompanhamento exige vínculo autorizado e
                consentimento da pessoa acompanhada.
              </label>
              {errors.consent && (
                <p id="consent-error" className="error-text">
                  {errors.consent}
                </p>
              )}
            </div>
          )}
          {failure && (
            <State title="Confira seu acesso" tone="error">
              {failure}
            </State>
          )}
          {notice && <State title={notice} tone="success" />}
          <Button type="submit" disabled={busy || !configured} aria-busy={busy}>
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar na minha conta"
                : mode === "signup"
                  ? "Criar minha conta"
                  : mode === "recover"
                    ? "Enviar instruções"
                    : "Salvar nova senha"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <button onClick={() => change("recover")}>
                Esqueci minha senha
              </button>
              <p>
                Ainda não tem conta?{" "}
                <button onClick={() => change("signup")}>Criar conta</button>
              </p>
            </>
          ) : (
            <button onClick={() => change("login")}>Voltar para entrar</button>
          )}
        </div>
        <p className="privacy-inline">
          <LockKeyhole size={16} />
          Seus dados de acompanhamento não são públicos.
        </p>
        <Link className="text-link" href="/">
          Voltar ao início
        </Link>
      </div>
    </section>
  );
}
