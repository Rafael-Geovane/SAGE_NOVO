import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Check, Sparkles } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { currentPlan, selectPlan, type Plan } from "../features/reports/api";
import { Button } from "../components/ui/Button";
import { State } from "../components/ui/State";
import { prices } from "../features/catalog/pricing";
const plans: {
  id: Plan;
  name: string;
  price: string;
  tag: string;
  features: string[];
}[] = [
  {
    id: "essential",
    name: "Essencial",
    price: "0",
    tag: "O cuidado começa aqui",
    features: [
      "Acompanhamento dos coletes autorizados",
      "Cadastro da pessoa acompanhada",
      "Alertas e avisos do navegador",
      "Relatório semanal na tela",
    ],
  },
  {
    id: "plus",
    name: "Cuidado Plus",
    price: prices.plus.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    tag: "Mais clareza para sua rotina",
    features: [
      "Tudo do Essencial",
      "Exportação do resumo em CSV",
      "Relatório para impressão ou PDF",
      "Exportação de médias, mínimos e máximos",
    ],
  },
  {
    id: "premium",
    name: "SAGE Premium",
    price: prices.premium.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    tag: "Uma visão mais completa da semana",
    features: [
      "Tudo do Cuidado Plus",
      "Relatório semanal com IA NVIDIA exclusivo do Premium",
      "Resumo de cobertura e eventos",
      "Origem dos registros identificada",
    ],
  },
];
export default function Plans() {
  const a = useAuth(),
    cache = useQueryClient();
  const plan = useQuery({
    queryKey: ["plan", a.profile?.id],
    queryFn: currentPlan,
    enabled: !!a.profile,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="container section plans-page">
      <span className="eyebrow">PLANOS SAGE</span>
      <h1>
        Mais contexto.
        <br />
        Mais perto de quem importa.
      </h1>
      <p>Escolha os recursos que deseja experimentar na sua rede de cuidado.</p>
      <div className="demo-plan-note">
        <Sparkles size={20} />
        <span>
          Modo TCC: valores ilustrativos. Selecionar um plano libera recursos
          demonstrativos sem cobrança, cartão ou assinatura financeira.
        </span>
      </div>
      {a.profile && plan.isPending && (
        <State title="Consultando plano" tone="loading" />
      )}
      {plan.isError && (
        <State
          title="Não foi possível consultar o plano"
          tone="error"
          retry={() => void plan.refetch()}
        />
      )}
      {error && <State title={error} tone="error" />}
      <div className="plans-grid">
        {plans.map((item) => (
          <article
            className={`plan-card ${item.id === "premium" ? "plan-featured" : ""}`}
            key={item.id}
          >
            {item.id === "premium" && (
              <span className="badge">EXPERIÊNCIA COMPLETA</span>
            )}
            <h2>{item.name}</h2>
            <p>{item.tag}</p>
            <div className="plan-price">
              <small>R$</small>
              <strong>{item.price}</strong>
              <span>/mês ilustrativo</span>
            </div>
            <ul>
              {item.features.map((feature) => (
                <li key={feature}>
                  <Check size={17} />
                  {feature}
                </li>
              ))}
            </ul>
            {!a.profile ? (
              <Link href="/auth" className="button button-primary">
                Entrar para experimentar
              </Link>
            ) : (
              <Button
                disabled={
                  busy ||
                  plan.isPending ||
                  plan.isError ||
                  plan.data === item.id
                }
                variant={item.id === "premium" ? "default" : "outline"}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await selectPlan(item.id);
                    await cache.invalidateQueries({
                      queryKey: ["plan", a.profile!.id],
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Falha ao alterar plano",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {plan.data === item.id
                  ? "Plano atual"
                  : `Experimentar ${item.name}`}
              </Button>
            )}
            {item.id !== "essential" && (
              <Link href={`/pagamento?plano=${item.id}`} className="text-link">
                Simular pagamento →
              </Link>
            )}
          </article>
        ))}
      </div>
      <p className="status-note">
        O Premium integra IA NVIDIA mediante configuração da chave no backend.
        Uma análise por regras permanece disponível para demonstração sem API.
      </p>
      <Link href="/relatorios" className="text-link">
        Ir para os relatórios semanais →
      </Link>
    </div>
  );
}
