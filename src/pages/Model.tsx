import { useState } from "react";
import { Box, Layers, Info } from "lucide-react";
import ProductViewer from "../features/product-model/ProductViewer";
import {
  productComponents,
  conceptualNotice,
  type ComponentId,
  type ProductView,
} from "../features/product-model/components";
import "../styles/product-model.css";
export default function Model() {
  const [view, setView] = useState<ProductView>("external");
  const [selected, setSelected] = useState<ComponentId>("vest");
  const component = productComponents.find((item) => item.id === selected)!;
  const select = (id: ComponentId) => {
    setSelected(id);
    if (id !== "vest" && id !== "case") setView("exploded");
  };
  return (
    <div className="model-page container">
      <header className="model-intro">
        <div>
          <span className="eyebrow">POR DENTRO DO PROTÓTIPO</span>
          <h1>
            Conheça o <span>SAGE Smart Vest</span>
          </h1>
        </div>
        <p>
          Explore o colete em 3D e conheça os componentes previstos para o
          protótipo acadêmico. Gire, aproxime e descubra como as partes se
          relacionam.
        </p>
      </header>
      <div
        className="model-view-switch"
        role="group"
        aria-label="Vista do produto"
      >
        <button
          aria-pressed={view === "external"}
          onClick={() => {
            setView("external");
            setSelected("vest");
          }}
        >
          <Box size={18} />
          Vista externa
        </button>
        <button
          aria-pressed={view === "exploded"}
          onClick={() => setView("exploded")}
        >
          <Layers size={18} />
          Vista explodida
        </button>
      </div>
      <div className="model-explorer">
        <ProductViewer view={view} selected={selected} onSelect={select} />
        <aside
          className="model-inspector"
          aria-labelledby="model-components-title"
        >
          <span className="eyebrow">EXPLORE CADA PARTE</span>
          <h2 id="model-components-title">
            Um sistema.
            <br />
            Várias conexões.
          </h2>
          <p>Selecione na lista ou toque em uma peça do modelo.</p>
          <div
            className="model-component-list"
            role="group"
            aria-label="Componentes do protótipo"
          >
            {productComponents.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => select(item.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.name}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <section
            className="model-component-info"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{component.category}</span>
            <h3>{component.name}</h3>
            <p>{component.description}</p>
          </section>
        </aside>
      </div>
      <div className="model-concept-notice">
        <Info size={23} />
        <p>{conceptualNotice}</p>
      </div>
      <section className="model-reference-section">
        <div>
          <span className="eyebrow">DO CONCEITO À MONTAGEM</span>
          <h2>
            Uma referência visual.
            <br />
            Um protótipo em evolução.
          </h2>
          <p>
            A geometria 3D foi construída para esta apresentação a partir das
            referências fornecidas. Não é um desenho de engenharia, uma montagem
            elétrica ou uma indicação de escala final.
          </p>
        </div>
        <figure>
          <img
            src="/model/sage-internal.jpg"
            loading="lazy"
            width="1600"
            height="900"
            alt="Referência ilustrativa do interior do colete com bolso e posições previstas de sensores."
          />
          <figcaption>
            Referência conceitual de montagem interna; posições, contatos e
            encaixes ainda precisam ser validados.
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
