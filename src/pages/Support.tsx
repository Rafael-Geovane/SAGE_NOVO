import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { db } from "../lib/supabase";
import { useAuth } from "../features/auth/AuthProvider";
import { sendMessage, startConversation } from "../features/support/api";
import { DraftGuard } from "../features/support/DraftGuard";
import { getCart } from "../features/catalog/cart";
import { variants } from "../features/catalog/product";
import { dateTime } from "../domain/connectivity";
import { WorkspaceHeader } from "../components/layout/WorkspaceHeader";
import { Button } from "../components/ui/Button";
import { State } from "../components/ui/State";
import { Field, focusFirst } from "../components/ui/Field";
import { Pagination } from "../components/ui/Pagination";
type Conversation = {
  id: string;
  subject: string;
  status: "open" | "closed";
  requester_id: string;
  created_at: string;
};
type Message = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
};
function intentDraft() {
  if (new URLSearchParams(window.location.search).get("intent") !== "vest")
    return "";
  const items = getCart();
  return items.length
    ? `Olá! Tenho interesse no SAGE Smart Vest. Minha seleção de referência: ${items.map((i) => `${variants.find((v) => v.id === i.variantId)?.name}, quantidade ${i.quantity}`).join("; ")}. Gostaria de saber mais sobre o projeto. Entendo que esta solicitação não confirma compra, preço ou estoque.`
    : "";
}
export default function Support({ embedded = false }: { embedded?: boolean }) {
  const a = useAuth(),
    cache = useQueryClient(),
    [page, setPage] = useState(0),
    [messagePage, setMessagePage] = useState(0),
    [id, setId] = useState<string | null>(null),
    [subject, setSubject] = useState(
      new URLSearchParams(window.location.search).get("intent") === "vest"
        ? "Interesse no SAGE Smart Vest"
        : "",
    ),
    [body, setBody] = useState(intentDraft),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const pending = useRef({
    requestId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    conversationId: null as string | null,
    body: "",
  });
  const q = useQuery({
    queryKey: ["conversations", a.profile!.id, page],
    queryFn: async ({ signal }) => {
      const { data, count, error } = await db()
        .from("support_conversations")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * 25, page * 25 + 24)
        .abortSignal(signal);
      if (error) throw error;
      return { rows: (data ?? []) as Conversation[], count: count ?? 0 };
    },
    refetchInterval: 15000,
  });
  const current = q.data?.rows.find((c) => c.id === id);
  const messages = useQuery({
    queryKey: ["messages", a.profile!.id, id, messagePage],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const { data, count, error } = await db()
        .from("support_messages")
        .select("*", { count: "exact" })
        .eq("conversation_id", id!)
        .order("created_at", { ascending: false })
        .range(messagePage * 25, messagePage * 25 + 24)
        .abortSignal(signal);
      if (error) throw error;
      return { rows: ((data ?? []) as Message[]).reverse(), count: count ?? 0 };
    },
    refetchInterval: 10000,
  });
  function selectConversation(next: string | null) {
    if (busy) return;
    if (body.trim()) {
      setFailure(
        "Envie a mensagem ou descarte o rascunho antes de trocar de conversa.",
      );
      return;
    }
    setId(next);
    setMessagePage(0);
    setFailure("");
    setNotice("");
    pending.current = {
      requestId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      conversationId: next,
      body: "",
    };
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!id && subject.trim().length < 3)
      errs.subject = "Escreva um assunto com pelo menos 3 caracteres.";
    if (!body.trim() || body.length > 5000)
      errs.body = "Escreva uma mensagem de até 5.000 caracteres.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirst(e.currentTarget, errs);
      return;
    }
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      let conversationId = id ?? pending.current.conversationId;
      if (!conversationId) {
        conversationId = await startConversation(
          subject,
          pending.current.requestId,
        );
        pending.current.conversationId = conversationId;
      }
      if (pending.current.body !== body) {
        pending.current.messageId = crypto.randomUUID();
        pending.current.body = body;
      }
      await sendMessage({
        conversationId,
        body,
        clientMessageId: pending.current.messageId,
      });
      setBody("");
      setId(conversationId);
      setMessagePage(0);
      setNotice("Mensagem registrada no suporte interno.");
      pending.current = {
        requestId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        conversationId,
        body: "",
      };
      void cache.invalidateQueries({ queryKey: ["conversations"] });
      void cache.invalidateQueries({ queryKey: ["messages"] });
    } catch {
      setFailure(
        "Não foi possível confirmar o envio. Seu rascunho foi mantido. Tente novamente; o mesmo envio não será duplicado.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus() {
    if (!current || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const { error } = await db()
        .from("support_conversations")
        .update({ status: current.status === "open" ? "closed" : "open" })
        .eq("id", current.id);
      if (error) throw error;
      void cache.invalidateQueries({ queryKey: ["conversations"] });
      setNotice("Estado da conversa atualizado.");
    } catch {
      setFailure("Não foi possível atualizar a conversa. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && (
        <WorkspaceHeader
          title="Vamos conversar."
          description="Mensagens internas com a equipe SAGE. Nenhuma mensagem é enviada por e-mail ou aplicativo externo."
        />
      )}
      <DraftGuard
        dirty={!!body.trim()}
        busy={busy}
        onDiscard={() => setBody("")}
      />
      <div className="support-grid">
        <aside className="panel">
          <div className="panel-heading">
            <h2>Conversas</h2>
            <Button
              size="icon"
              variant="outline"
              aria-label="Nova conversa"
              disabled={busy}
              onClick={() => selectConversation(null)}
            >
              <Plus size={18} />
            </Button>
          </div>
          {q.isPending ? (
            <State title="Carregando conversas" tone="loading" />
          ) : q.isError ? (
            <State
              title="Falha ao consultar conversas"
              tone="error"
              retry={() => void q.refetch()}
            />
          ) : (
            <>
              <div className="conversation-list">
                {q.data.rows.map((c) => (
                  <button
                    disabled={busy}
                    key={c.id}
                    aria-pressed={id === c.id}
                    onClick={() => selectConversation(c.id)}
                  >
                    <strong>{c.subject}</strong>
                    <small>
                      {c.status === "open" ? "Aberta" : "Encerrada"} ·{" "}
                      {dateTime(c.created_at)}
                    </small>
                  </button>
                ))}
              </div>
              {!q.data.count && (
                <p>Nenhuma conversa ainda. Escreva sua primeira mensagem.</p>
              )}
              <Pagination
                busy={busy}
                page={page}
                count={q.data.count}
                setPage={(p) => {
                  if (body.trim()) {
                    setFailure(
                      "Envie ou descarte o rascunho antes de mudar a página.",
                    );
                    return;
                  }
                  setPage(p);
                  selectConversation(null);
                }}
              />
            </>
          )}
        </aside>
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {id
                ? (current?.subject ?? "Conversa selecionada")
                : "Nova conversa"}
            </h2>
            {a.profile?.role === "admin" && current && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void changeStatus()}
              >
                {current.status === "open"
                  ? "Encerrar conversa"
                  : "Reabrir conversa"}
              </Button>
            )}
          </div>
          <p className="status-note">
            Evite incluir dados clínicos ou documentos. Somente você e a equipe
            SAGE podem visualizar esta conversa.
          </p>
          {id &&
            (messages.isPending ? (
              <State title="Consultando mensagens" tone="loading" />
            ) : messages.isError ? (
              <State
                title="Não foi possível consultar mensagens"
                tone="error"
                retry={() => void messages.refetch()}
              />
            ) : (
              <>
                <div className="messages" aria-label="Mensagens da conversa">
                  {messages.data?.rows.map((m) => (
                    <article
                      key={m.id}
                      className={`message ${m.sender_id === a.profile!.id ? "is-own" : ""}`}
                    >
                      <p>{m.body}</p>
                      <small>
                        {m.sender_id === a.profile!.id
                          ? "Você"
                          : "Participante autorizado"}{" "}
                        · {dateTime(m.created_at)}
                      </small>
                    </article>
                  ))}
                </div>
                <Pagination
                  page={messagePage}
                  count={messages.data?.count ?? 0}
                  setPage={setMessagePage}
                />
              </>
            ))}
          {notice && <State title={notice} tone="success" />}
          {failure && <State title={failure} tone="error" />}
          {current?.status === "closed" ? (
            <State title="Esta conversa foi encerrada">
              Abra uma nova conversa se precisar de ajuda novamente.
            </State>
          ) : (
            <form className="support-compose" noValidate onSubmit={submit}>
              {!id && (
                <Field
                  disabled={busy}
                  name="subject"
                  label="Assunto"
                  value={subject}
                  maxLength={160}
                  onChange={(e) => setSubject(e.target.value)}
                  error={errors.subject}
                />
              )}
              <label htmlFor="support-message">Sua mensagem</label>
              <textarea
                disabled={busy}
                className="resize-none"
                id="support-message"
                name="body"
                rows={5}
                maxLength={5000}
                style={{ resize: "none" }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={!!errors.body}
                aria-describedby="message-hint"
              />
              <p
                id="message-hint"
                className={errors.body ? "error-text" : "status-note"}
              >
                {errors.body ??
                  `${body.length}/5.000 caracteres · Rascunho mantido somente nesta tela.`}
              </p>
              <div className="button-row">
                <Button type="submit" disabled={busy} aria-busy={busy}>
                  <Send size={16} />
                  {busy ? "Registrando…" : "Enviar mensagem"}
                </Button>
                {body && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBody("");
                      setFailure("");
                    }}
                  >
                    Descartar rascunho
                  </Button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
