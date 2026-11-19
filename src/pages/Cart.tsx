import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { getCart, setCart } from "../features/catalog/cart";
import { variants, product } from "../features/catalog/product";
import { Button } from "../components/ui/Button";
import { useAuth } from "../features/auth/AuthProvider";
export default function Cart() {
  const [items, update] = useState(getCart),
    a = useAuth();
  return (
    <section className="container section cart-page">
      <span className="eyebrow">UM PRIMEIRO PASSO</span>
      <h1>Sua intenção de interesse.</h1>
      <p>
        Converse com a SAGE sobre o Smart Vest. Esta seleção não é um pedido de
        compra e não gera cobrança.
      </p>
      {items.length ? (
        <>
          <div className="cart-list">
            {items.map((item) => {
              const v = variants.find((v) => v.id === item.variantId)!;
              return (
                <article key={v.id} className="cart-item">
                  <img src={v.image} alt={`Referência ${v.name}`} />
                  <div>
                    <h2>SAGE Smart Vest</h2>
                    <p>
                      {v.name} · Quantidade: {item.quantity}
                    </p>
                    <span className="badge">
                      {product.price?.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      por unidade
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const next = items.filter((i) => i.variantId !== v.id);
                      setCart(next);
                      update(next);
                    }}
                    aria-label={`Remover referência ${v.name}`}
                  >
                    <Trash2 size={19} />
                  </Button>
                </article>
              );
            })}
          </div>
          <div className="checkout-box">
            <strong>Pagamento não habilitado</strong>
            <p>
              O próximo passo abre uma solicitação no suporte interno. Revise a
              mensagem antes de enviar.
            </p>
            <Link
              className="button button-primary"
              href={
                a.status === "authenticated"
                  ? "/suporte?intent=vest"
                  : "/auth?returnTo=%2Fsuporte%3Fintent%3Dvest"
              }
            >
              Continuar para contato <ArrowRight size={17} />
            </Link>
            <p>
              <Link className="text-link" href="/pagamento?plano=vest">
                Simular pagamento para apresentação →
              </Link>
            </p>
          </div>
        </>
      ) : (
        <div className="empty-cart">
          <ShoppingBag size={38} />
          <h2>Nenhum colete selecionado</h2>
          <p>Explore as referências de cor para começar.</p>
          <Link className="button button-primary" href="/loja">
            Conhecer o Smart Vest
          </Link>
        </div>
      )}
    </section>
  );
}
