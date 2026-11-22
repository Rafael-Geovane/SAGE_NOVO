import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  LoaderCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Play,
  Pause,
} from "lucide-react";
import type {
  ComponentId,
  Playback,
  ProductView,
  ViewerAction,
} from "./components";
import type { ProductViewer as Viewer } from "./scene";
type Props = {
  view: ProductView;
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  onSimulate: () => void;
  onExitAssembly: () => void;
};
export default function ProductViewer({
  view,
  selected,
  onSelect,
  onSimulate,
  onExitAssembly,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<Viewer | null>(null);
  const latest = useRef({ view, selected, onSelect });
  latest.current = { view, selected, onSelect };
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0),
    [alternative, setAlternative] = useState(false);
  const [playback, setPlayback] = useState<Playback>("done");
  const [caption, setCaption] = useState("");
  const simulating = view === "assembly";
  const simulationLabel = !simulating
    ? "Simular"
    : playback === "playing"
      ? "Pausar"
      : playback === "paused"
        ? "Continuar"
        : "Repetir";
  useEffect(() => {
    if (alternative) return;
    let cancelled = false;
    let instance: Viewer | undefined;
    setStatus("loading");
    void import("./scene")
      .then(({ createProductViewer }) => {
        if (cancelled || !host.current) return;
        instance = createProductViewer(
          host.current,
          (id) => latest.current.onSelect(id),
          () => {
            if (!cancelled) setStatus("failed");
          },
          (state, text) => {
            if (!cancelled) {
              setPlayback(state);
              setCaption(text);
            }
          },
        );
        viewer.current = instance;
        instance.update(latest.current.view, latest.current.selected);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      instance?.dispose();
      viewer.current = null;
    };
  }, [attempt, alternative]);
  useEffect(() => {
    viewer.current?.update(view, selected);
  }, [view, selected]);
  const act = (action: ViewerAction) => viewer.current?.act(action);
  const actions = [
    { action: "left", label: "Girar para a esquerda", icon: ArrowLeft },
    { action: "right", label: "Girar para a direita", icon: ArrowRight },
    { action: "up", label: "Inclinar para cima", icon: ArrowUp },
    { action: "down", label: "Inclinar para baixo", icon: ArrowDown },
    { action: "zoom-in", label: "Aproximar modelo", icon: ZoomIn },
    { action: "zoom-out", label: "Afastar modelo", icon: ZoomOut },
    { action: "reset", label: "Centralizar modelo", icon: RotateCcw },
  ] as const;
  return (
    <div className="product-stage">
      <div className="product-stage-top">
        <span className="badge">
          {simulating
            ? "MONTAGEM INTERNA"
            : view === "external"
              ? "01 · VISTA EXTERNA"
              : "02 · VISTA EXPLODIDA"}
        </span>
        <Button
          size="sm"
          disabled={alternative || status !== "ready"}
          onClick={() =>
            simulating ? viewer.current?.togglePlayback() : onSimulate()
          }
        >
          {simulating && playback === "playing" ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}
          {simulationLabel}
        </Button>
      </div>
      <div className="product-canvas-shell">
        {!alternative && (
          <div
            className="product-canvas"
            ref={host}
            style={{ visibility: status === "failed" ? "hidden" : "visible" }}
          />
        )}
        {!alternative && status === "loading" && (
          <div className="product-loading" role="status">
            <LoaderCircle className="spin" size={24} />
            <span>Preparando o modelo 3D…</span>
          </div>
        )}
        {simulating && !alternative && status === "ready" && (
          <p className="assembly-caption" role="status">
            {caption}
          </p>
        )}
        {(alternative || status === "failed") && (
          <figure className="product-fallback">
            <img
              src={
                view === "external"
                  ? "/model/sage-exterior.jpg"
                  : "/model/sage-exploded.jpg"
              }
              alt={
                view === "external"
                  ? "Referência ilustrativa do colete azul-marinho com bolso para caixa eletrônica."
                  : "Referência ilustrativa da caixa aberta, ESP32, bateria, módulos e fiação."
              }
            />
            <figcaption>
              {status === "failed" && !alternative
                ? "Não foi possível iniciar o 3D. Verifique o suporte a WebGL e a aceleração gráfica ou tente novamente."
                : "Apresentação alternativa em imagem 2D, sem interação 3D."}{" "}
              As posições são ilustrativas.
            </figcaption>
          </figure>
        )}
      </div>
      <div
        className="product-tools"
        role="group"
        aria-label="Controles do modelo 3D"
      >
        {actions.map(({ action, label, icon: Icon }) => (
          <Button
            variant="outline"
            size="sm"
            key={action}
            aria-label={label}
            title={label}
            disabled={status !== "ready" || alternative}
            onClick={() => act(action)}
          >
            <Icon size={18} />
            {action === "reset" && <span>Centralizar</span>}
          </Button>
        ))}
      </div>
      <p className="product-gestures">
        Arraste para girar · role ou use dois dedos para aproximar · botão
        direito ou dois dedos para reposicionar. Teclado: setas, +/−, Home;
        Shift + setas reposiciona.
      </p>
      <div className="product-alternative-actions">
        <button
          className="text-link"
          onClick={() => {
            if (simulating) onExitAssembly();
            setAlternative(!alternative);
          }}
        >
          {alternative ? "Voltar ao modelo 3D" : "Ver alternativa em imagens"}
        </button>
        {status === "failed" && !alternative && (
          <button
            className="text-link"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tentar carregar novamente
          </button>
        )}
      </div>
    </div>
  );
}
