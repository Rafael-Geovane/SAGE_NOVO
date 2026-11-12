import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ClipboardCheck,
  FlaskConical,
  HeartHandshake,
  LockKeyhole,
  Radio,
} from "lucide-react";
import vest from "../../assets/vest_product.png";
import "../styles/how-it-works.css";

const steps = [
  {
    title: "Vincule o colete à rede de cuidado",
    text: "Acesse sua conta e escolha Adicionar colete. O administrador cadastra o identificador, como SGE-001. Para o cuidador, o vínculo também exige o código de ativação fornecido pela equipe autorizada.",
  },
  {
    title: "Cadastre a pessoa acompanhada",
    text: "Após o código, o administrador informa o nome do idoso e registra a autorização. Endereço, alergias, condições de saúde relatadas e contato podem ser adicionados ao cadastro. O que não foi informado continua identificado dessa forma.",
  },
  {
    title: "Acompanhe as informações recebidas",
    text: "No painel, consulte as leituras disponíveis, a data e a hora do último envio e o histórico do colete. Se a comunicação parar, o site sinaliza os dados desatualizados. Um campo sem leitura permanece sem valor.",
  },
  {
    title: "Verifique os eventos com a pessoa",
    text: "Quando o dispositivo reporta uma possível queda, o site apresenta um aviso. A pessoa autorizada verifica o contexto e registra o acompanhamento e o resultado. O evento é preservado no histórico.",
  },
];
const questions = [
  {
    question: "Preciso de um colete para experimentar?",
    answer:
      "Você pode abrir o teste SGE-001 sem vincular um dispositivo. Ele gera dados aleatórios a cada três segundos e permite testar uma notificação de queda. Tudo é simulado e não é gravado no banco de dados.",
  },
  {
    question: "O que acontece quando a conexão é interrompida?",
    answer:
      "O site mantém as informações já recebidas e mostra o horário do último envio. Dados antigos são sinalizados como desatualizados; a ausência de uma leitura não é substituída por um valor estimado.",
  },
  {
    question: "Quem pode ver os dados do idoso?",
    answer:
      "O administrador e os cuidadores com acesso autorizado ao colete. Conhecer somente o código impresso não permite que um cuidador consulte os dados. O cadastro registra a autorização da pessoa ou responsável.",
  },
  {
    question: "Os avisos chegam com o site fechado?",
    answer:
      "Nesta versão, os avisos aparecem dentro do site, enquanto ele está aberto e conectado. Não há envio por WhatsApp, SMS ou e-mail, nem chamadas automáticas. Ao retornar, consulte as pendências no sino.",
  },
];
export default function HowItWorks() {
  return (
    <div className="how-page">
      <section className="container how-intro">
        <nav className="breadcrumbs" aria-label="Caminho da página">
          <Link href="/">Início</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Como funciona</span>
        </nav>
        <div className="how-intro-grid">
          <div className="how-intro-copy">
            <span className="eyebrow">COMO FUNCIONA</span>
            <h1>
              Do colete à sua <span>rede de cuidado.</span>
            </h1>
            <p className="lead">
              Informações que aproximam. Pessoas que cuidam.
            </p>
            <p>
              O SAGE conecta os dados enviados pelo Smart Vest a um painel de
              acompanhamento. Você vê o que foi recebido e participa do cuidado
              com contexto e autorização.
            </p>
            <div className="button-row">
              <Link href="/dashboard" className="button button-primary">
                Acessar acompanhamento{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#passo-a-passo" className="text-link">
                Conhecer as etapas <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure className="how-vest">
            <span className="how-vest-label">
              <Radio size={17} aria-hidden="true" /> SAGE SMART VEST
            </span>
            <img
              src={vest}
              width={640}
              height={640}
              alt="Referência conceitual do colete SAGE Smart Vest"
            />
            <figcaption>
              Visual conceitual do protótipo. Sensores e recursos dependem da
              validação do hardware e do firmware.
            </figcaption>
          </figure>
        </div>
        <ol className="how-connection" aria-label="Caminho das informações">
          <li>
            <Radio aria-hidden="true" />
            <div>
              <strong>O colete envia</strong>
              <span>Dados disponíveis no dispositivo</span>
            </div>
            <ArrowRight
              className="how-flow-arrow"
              size={18}
              aria-hidden="true"
            />
          </li>
          <li>
            <Activity aria-hidden="true" />
            <div>
              <strong>O site organiza</strong>
              <span>Leituras, histórico e eventos</span>
            </div>
            <ArrowRight
              className="how-flow-arrow"
              size={18}
              aria-hidden="true"
            />
          </li>
          <li>
            <HeartHandshake aria-hidden="true" />
            <div>
              <strong>Você acompanha</strong>
              <span>Acesso à sua rede autorizada</span>
            </div>
          </li>
        </ol>
      </section>

      <section
        className="container section how-steps"
        id="passo-a-passo"
        aria-labelledby="how-steps-title"
      >
        <div className="how-section-intro">
          <span className="eyebrow">PARA COMEÇAR</span>
          <h2 id="how-steps-title">Um vínculo é o primeiro passo.</h2>
          <p>
            Do cadastro à rotina de acompanhamento, cada etapa mantém a pessoa
            no centro do cuidado.
          </p>
          <Link href="/loja" className="text-link">
            Conheça o Smart Vest <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ol className="how-step-list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="how-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="how-fall-section" aria-labelledby="how-fall-title">
        <div className="container section">
          <div className="how-fall-heading">
            <div>
              <span className="eyebrow">ATENÇÃO COM CONTEXTO</span>
              <h2 id="how-fall-title">
                Um aviso de possível queda.
                <br />
                Uma verificação humana.
              </h2>
            </div>
            <p>
              O sinal do dispositivo inicia uma verificação. Ele não confirma,
              sozinho, o que aconteceu com a pessoa.
            </p>
          </div>
          <ol className="how-review-flow">
            <li>
              <Bell aria-hidden="true" />
              <h3>Receba o aviso no site</h3>
              <p>
                O sino reúne os eventos pendentes. Um aviso destaca as possíveis
                quedas enquanto o site está aberto e conectado.
              </p>
            </li>
            <li>
              <ClipboardCheck aria-hidden="true" />
              <h3>Registre a verificação</h3>
              <p>
                Use “Estou verificando” e confira o ocorrido com a pessoa ou
                responsável, utilizando os meios de contato disponíveis.
              </p>
            </li>
            <li>
              <Check aria-hidden="true" />
              <h3>Informe o resultado</h3>
              <p>
                Depois de verificar, escolha “Confirmar ocorrência” ou
                “Descartar alerta”. A avaliação fica registrada no histórico.
              </p>
            </li>
          </ol>
          <div className="how-test-invite">
            <FlaskConical size={24} aria-hidden="true" />
            <div>
              <h3>Veja o fluxo com o SGE-001</h3>
              <p>
                Experimente leituras e alertas simulados. Nenhuma medição real
                ou gravação no banco.
              </p>
            </div>
            <Link href="/teste-colete" className="button button-outline">
              Experimentar o teste <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        className="container section faq-grid how-faq"
        aria-labelledby="how-questions-title"
      >
        <div className="how-section-intro">
          <span className="eyebrow">ANTES DE ACOMPANHAR</span>
          <h2 id="how-questions-title">Dúvidas do dia a dia.</h2>
          <p>
            Saiba como o acesso, a conexão e os avisos funcionam nesta versão do
            SAGE.
          </p>
          <div className="how-privacy-note">
            <LockKeyhole size={20} aria-hidden="true" />
            <p>
              Dados pessoais e de saúde não aparecem nas prévias das
              notificações.
            </p>
          </div>
        </div>
        <div className="faq-list">
          {questions.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="container how-project-note">
        <p>
          O SAGE é um projeto acadêmico em desenvolvimento. Leituras e eventos
          apoiam o acompanhamento e não constituem diagnóstico nem substituem
          avaliação profissional ou serviços de emergência.
        </p>
      </div>
    </div>
  );
}
