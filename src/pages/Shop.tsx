import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, ShieldCheck, ShoppingBag } from "lucide-react";
import { variants, product } from "../features/catalog/product";
import { getCart, setCart } from "../features/catalog/cart";
import { Button } from "../components/ui/Button";
export default function Shop() {
  const [selected, setSelected] = useState(variants[0].id as string),
    [quantity, setQuantity] = useState(1),
    [added, setAdded] = useState(false),
    [warning, setWarning] = useState(false);
  const variant = variants.find((v) => v.id === selected)!;
  return (
    <section className="container section">
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <span>Smart Vest</span>
      </div>
      <div className="shop-grid">
        <div>
          <div className="gallery">
            <img
              src={variant.image}
              alt={`Referência visual do colete na cor ${variant.name}`}
            />
          </div>
          <p className="caption">
            Referência visual do protótipo. Marcas e textos presentes nas
            imagens não representam recursos confirmados do SAGE.
          </p>
          <div className="gallery-thumbs">
            {variants.map((v) => (
              <button
                key={v.id}
                aria-label={`Ver referência ${v.name}`}
                aria-pressed={selected === v.id}
                onClick={() => {
                  setSelected(v.id);
                  setAdded(false);
                }}
              >
                <img src={v.image} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="shop-info">
          <span className="eyebrow">
            TECNOLOGIA VESTÍVEL · PROJETO ACADÊMICO
          </span>
          <h1>
            SAGE
            <br />
            <span>Smart Vest.</span>
          </h1>
          <p className="lead">
            Pensado para acompanhar.
            <br />
            Desenvolvido para respeitar.
          </p>
          <p>
            Um colete com sensores e ESP32 para aproximar informações e pessoas
            autorizadas em uma mesma rede de cuidado.
          </p>
          <span className="badge">{product.availabilityLabel}</span>
          <div className="shop-rule" />
          <fieldset className="swatch-field">
            <legend>
              Referência de cor: <strong>{variant.name}</strong>
            </legend>
            <div className="swatches">
              {variants.map((v) => (
                <button
                  key={v.id}
                  style={{ "--swatch": v.color } as React.CSSProperties}
                  aria-label={v.name}
                  aria-pressed={selected === v.id}
                  onClick={() => {
                    setSelected(v.id);
                    setAdded(false);
                  }}
                >
                  {selected === v.id && <Check size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="quantity-label" htmlFor="quantity">
            Quantidade de interesse
          </label>
          <select
            id="quantity"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
          <div className="commerce-note">
            <strong>
              {product.price === null
                ? "Disponibilidade e preço a definir"
                : new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(product.price)}
            </strong>
            <p>
              Sem cobrança ou reserva de estoque. Registre seu interesse para
              conversar com a equipe.
            </p>
          </div>
          <Button
            onClick={() => {
              const items = getCart();
              const saved = setCart([
                ...items.filter((i) => i.variantId !== selected),
                { variantId: selected, quantity },
              ]);
              setWarning(!saved);
              setAdded(true);
            }}
          >
            <ShoppingBag size={18} />
            Adicionar à intenção
          </Button>
          {added && (
            <div role="status" className="added-message">
              <Check size={17} />
              Seleção adicionada.{" "}
              <Link href="/carrinho">
                Revisar intenção <ArrowRight size={15} />
              </Link>
            </div>
          )}
          {warning && (
            <p role="status">
              Seu navegador não permite salvar a seleção. Ela ficará disponível
              enquanto esta página estiver aberta.
            </p>
          )}
          <p className="privacy-inline">
            <ShieldCheck size={17} />
            Apenas sua seleção de produto é guardada neste navegador.
          </p>
          <details className="product-details">
            <summary>O que faz parte do projeto?</summary>
            <p>
              Coleta pelo ESP32, envio protegido de dados, painel com histórico
              e acesso por vínculo autorizado. Sensores, tamanhos, materiais e
              autonomia aguardam validação.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
