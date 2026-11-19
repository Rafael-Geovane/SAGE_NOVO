import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  LockKeyhole,
  QrCode,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { getCart } from "../features/catalog/cart";
import { variants } from "../features/catalog/product";
import { prices } from "../features/catalog/pricing";
import "../styles/payment.css";

const offers = {
  vest: {
    name: "SAGE Smart Vest",
    price: prices.vest,
    period: "Compra demonstrativa",
    description: "Protótipo acadêmico · valor fictício para esta apresentação",
  },
  plus: {
    name: "Cuidado Plus",
    price: prices.plus,
    period: "Mensalidade demonstrativa",
    description: "Exportações CSV e relatório para impressão ou PDF",
  },
  premium: {
    name: "SAGE Premium",
    price: prices.premium,
    period: "Mensalidade demonstrativa",
    description: "Recursos Plus e análise semanal com IA NVIDIA",
  },
} as const;
type Offer = keyof typeof offers;
const currency = (amount: number) =>
  amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Payment() {
  const requested = new URLSearchParams(window.location.search).get("plano");
  const [offer, setOffer] = useState<Offer>(
    requested === "plus" || requested === "vest" ? requested : "premium",
  );
  const [method, setMethod] = useState("pix");
  const [outcome, setOutcome] = useState("approved");
  const [state, setState] = useState<
    "ready" | "processing" | "approved" | "declined"
  >("ready");
  const [reference, setReference] = useState("");
  const [items] = useState(getCart);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const result = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (state === "approved" || state === "declined") result.current?.focus();
  }, [state]);
  const selected = offers[offer];
  const quantity =
    offer === "vest"
      ? Math.max(
          1,
          items.reduce((sum, item) => sum + item.quantity, 0),
        )
      : 1;
  const total = selected.price * quantity;
  const busy = state === "processing";
  const simulate = () => {
    if (busy) return;
    setState("processing");
    timer.current = setTimeout(() => {
      setReference(`DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      setState(outcome === "approved" ? "approved" : "declined");
    }, 1200);
  };

  return (
    <section className="container section payment-page">
      <Link href="/planos" className="text-link payment-back">
        <ArrowLeft size={16} /> Voltar aos planos
      </Link>
      <span className="eyebrow">EXPERIÊNCIA SAGE</span>
      <h1>
        O próximo passo
        <br />
        no seu cuidado.
      </h1>
      <p>
        Conheça a experiência de pagamento do SAGE nesta demonstração
        interativa.
      </p>
      <div className="payment-demo">
        <FlaskConical size={22} />
        <div>
          <strong>Simulação para apresentação acadêmica</strong>
          <p>
            Nenhum valor será cobrado. Não insira dados pessoais ou bancários.
            Não há compra, assinatura financeira ou ativação de plano nesta
            tela.
          </p>
        </div>
      </div>
      <div className="payment-grid">
        <div className="payment-panel">
          {state === "approved" || state === "declined" ? (
            <div className={`payment-result payment-${state}`}>
              {state === "approved" ? (
                <CheckCircle2 size={56} />
              ) : (
                <XCircle size={56} />
              )}
              <h2 ref={result} tabIndex={-1}>
                {state === "approved"
                  ? "Pagamento simulado aprovado!"
                  : "Pagamento simulado recusado"}
              </h2>
              <p>
                {state === "approved"
                  ? "Tudo certo nesta demonstração. Nenhuma cobrança foi realizada e nenhum pedido foi criado."
                  : "Este é o cenário de recusa escolhido. Nenhuma cobrança foi realizada. Você pode tentar novamente ou mudar o cenário."}
              </p>
              <dl>
                <div>
                  <dt>Referência fictícia</dt>
                  <dd>{reference}</dd>
                </div>
                <div>
                  <dt>Forma de pagamento</dt>
                  <dd>
                    {method === "pix" ? "Pix demonstrativo" : "Cartão fictício"}
                  </dd>
                </div>
                <div>
                  <dt>Valor simulado</dt>
                  <dd>{currency(total)}</dd>
                </div>
              </dl>
              <Button variant="outline" onClick={() => setState("ready")}>
                <RotateCcw size={17} /> Simular novamente
              </Button>
              {state === "approved" && offer !== "vest" && (
                <Link href="/planos" className="button button-primary">
                  Experimentar recursos do plano
                </Link>
              )}
              <p className="payment-footnote">
                Os recursos demonstrativos continuam sendo ativados na página de
                planos, após entrar na conta.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                simulate();
              }}
              aria-busy={busy}
            >
              <h2>Como você quer pagar?</h2>
              <fieldset disabled={busy} className="payment-methods">
                <legend>Forma de pagamento fictícia</legend>
                <label className={method === "pix" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="method"
                    value="pix"
                    checked={method === "pix"}
                    onChange={() => setMethod("pix")}
                  />
                  <QrCode size={24} />
                  <span>
                    <strong>Pix</strong>
                    <small>Confirmação demonstrativa</small>
                  </span>
                </label>
                <label className={method === "card" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="method"
                    value="card"
                    checked={method === "card"}
                    onChange={() => setMethod("card")}
                  />
                  <CreditCard size={24} />
                  <span>
                    <strong>Cartão</strong>
                    <small>Usar cartão fictício</small>
                  </span>
                </label>
              </fieldset>
              {method === "pix" ? (
                <div className="payment-pix">
                  <div className="payment-pix-icon">
                    <QrCode size={64} />
                  </div>
                  <div>
                    <strong>Pix de demonstração</strong>
                    <p>
                      Ilustração sem código de pagamento. Use o botão abaixo
                      para representar a confirmação.
                    </p>
                    <span className="badge">
                      Não escaneável · sem transferência
                    </span>
                  </div>
                </div>
              ) : (
                <div className="payment-card">
                  <div>
                    <span>SAGE · CARTÃO FICTÍCIO</span>
                    <CreditCard size={28} />
                  </div>
                  <strong>•••• &nbsp; •••• &nbsp; •••• &nbsp; 4242</strong>
                  <div>
                    <span>PESSOA DEMONSTRATIVA</span>
                    <span>12/30</span>
                  </div>
                  <small>
                    Dados ilustrativos. Nenhum cartão real é solicitado.
                  </small>
                </div>
              )}
              <label className="payment-scenario" htmlFor="payment-outcome">
                Cenário da apresentação
                <select
                  id="payment-outcome"
                  value={outcome}
                  disabled={busy}
                  onChange={(event) => setOutcome(event.target.value)}
                >
                  <option value="approved">Pagamento aprovado</option>
                  <option value="declined">Pagamento recusado</option>
                </select>
              </label>
              <Button type="submit" disabled={busy} className="payment-submit">
                {busy
                  ? "Processando simulação…"
                  : `Simular pagamento de ${currency(total)}`}
                {!busy && <LockKeyhole size={17} />}
              </Button>
              <p role="status" aria-live="polite" className="payment-footnote">
                {busy
                  ? "Aguarde a confirmação fictícia. Nenhum serviço de pagamento está sendo consultado."
                  : "Ambiente demonstrativo · nenhuma cobrança real"}
              </p>
            </form>
          )}
        </div>
        <aside
          className="payment-summary"
          aria-label="Resumo do pagamento demonstrativo"
        >
          <span className="eyebrow">SEU RESUMO</span>
          <h2>Cuidar, com mais clareza.</h2>
          <label htmlFor="payment-offer">
            O que deseja simular?
            <select
              id="payment-offer"
              value={offer}
              disabled={state !== "ready"}
              onChange={(event) => setOffer(event.target.value as Offer)}
            >
              <option value="premium">SAGE Premium</option>
              <option value="plus">Cuidado Plus</option>
              <option value="vest">SAGE Smart Vest</option>
            </select>
          </label>
          <div className="payment-product">
            <div className="payment-product-icon">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.period}</p>
            </div>
          </div>
          <p>{selected.description}</p>
          {offer === "vest" && items.length > 0 && (
            <ul className="payment-cart-items">
              {items.map((item) => (
                <li key={item.variantId}>
                  {
                    variants.find((variant) => variant.id === item.variantId)
                      ?.name
                  }{" "}
                  × {item.quantity}
                </li>
              ))}
            </ul>
          )}
          <dl>
            <div>
              <dt>Valor unitário fictício</dt>
              <dd>{currency(selected.price)}</dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd>{quantity}</dd>
            </div>
            <div>
              <dt>Taxas nesta simulação</dt>
              <dd>{currency(0)}</dd>
            </div>
            <div className="payment-total">
              <dt>Total ilustrativo</dt>
              <dd>{currency(total)}</dd>
            </div>
          </dl>
          <div className="payment-reassurance">
            <Check size={17} />
            <span>Sem cobrança ou renovação automática</span>
          </div>
          <div className="payment-reassurance">
            <Check size={17} />
            <span>Sem coleta de dados bancários</span>
          </div>
          <Link href="/carrinho" className="text-link">
            Revisar seleção de coletes →
          </Link>
        </aside>
      </div>
    </section>
  );
}
