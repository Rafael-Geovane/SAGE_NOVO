// Route structure recovered from ManusDialog.tsx.
import { useEffect, Component, type ReactNode } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { PublicLayout } from "./components/layout/PublicLayout";
import { State } from "./components/ui/State";
import Home from "./pages/Home";
import HowItWorks from "./pages/HowItWorks";
import Shop from "./pages/Shop";
import Cart from "./pages/Cart";
import Auth from "./pages/Auth";
import Caregiver from "./pages/Caregiver";
import Admin from "./pages/Admin";
import Support from "./pages/Support";
import VestTest from "./pages/VestTest";
import Account from "./pages/Account";
import VestControls from "./pages/VestControls";
import Plans from "./pages/Plans";
import Reports from "./pages/Reports";
import Model from "./pages/Model";
import Payment from "./pages/Payment";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="container section">
        <State title="Não foi possível abrir esta tela" tone="error">
          <a href="/">Voltar ao início</a>
        </State>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Routes() {
  const [path] = useLocation();
  useEffect(() => {
    const names: Record<string, string> = {
      "/": "Cuidado que respeita",
      "/loja": "Smart Vest",
      "/modelo": "Modelo 3D",
      "/como-funciona": "Como funciona",
      "/carrinho": "Sua intenção",
      "/pagamento": "Pagamento demonstrativo",
      "/auth": "Sua conta",
      "/dashboard": "Acompanhamento",
      "/minha-conta": "Minha conta",
      "/teste_colete": "Controle do colete de teste",
      "/planos": "Planos",
      "/relatorios": "Relatórios semanais",
      "/admin": "Administração",
      "/suporte": "Suporte",
      "/teste-colete": "Teste SGE-001",
    };
    document.title = `${names[path] ?? "Página não encontrada"} · SAGE`;
    window.scrollTo(0, 0);
  }, [path]);
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/loja" component={Shop} />
      <Route path="/modelo" component={Model} />
      <Route path="/como-funciona" component={HowItWorks} />
      <Route path="/carrinho" component={Cart} />
      <Route path="/pagamento" component={Payment} />
      <Route path="/auth" component={Auth} />
      <Route path="/teste-colete" component={VestTest} />
      <Route path="/planos" component={Plans} />
      <Route path="/relatorios">
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      </Route>
      <Route path="/teste_colete">
        <ProtectedRoute>
          <VestControls />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <div className="container section">
          <ProtectedRoute>
            <Caregiver />
          </ProtectedRoute>
        </div>
      </Route>
      <Route path="/minha-conta">
        <ProtectedRoute>
          <Account />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <div className="container section">
          <ProtectedRoute admin>
            <Admin />
          </ProtectedRoute>
        </div>
      </Route>
      <Route path="/suporte">
        <div className="container section">
          <ProtectedRoute>
            <Support />
          </ProtectedRoute>
        </div>
      </Route>
      <Route>
        <section className="container section">
          <span className="eyebrow">404</span>
          <h1>Esta página não está por aqui.</h1>
          <Link className="button button-primary" href="/">
            Voltar ao início
          </Link>
        </section>
      </Route>
    </Switch>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PublicLayout>
          <Routes />
        </PublicLayout>
      </AuthProvider>
    </ErrorBoundary>
  );
}
