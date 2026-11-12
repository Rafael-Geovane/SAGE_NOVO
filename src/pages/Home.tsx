// Structure and content sections recovered from legacy schema.ts; unsupported claims removed.
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Radio,
  HeartHandshake,
  Wifi,
  LockKeyhole,
  Activity,
  Check,
} from "lucide-react";
import hero from "../../assets/hero_elderly.png";
import vest from "../../assets/vest_product.png";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="small-dot" /> TECNOLOGIA A SERVIÇO DO CUIDADO
            </span>
            <h1>
              Mais presença.
              <br />
              Mais cuidado.
              <br />
              <span>Mais liberdade.</span>
            </h1>
            <p>
              Para quem você ama seguir vivendo.
              <br className="desktop-only" /> Para você acompanhar com mais
              proximidade.
            </p>
            <p className="hero-description">
              Conheça o SAGE Smart Vest: nosso projeto de colete inteligente que
              conecta informações do dia a dia a uma rede de cuidado autorizada.
            </p>
            <div className="button-row">
              <Link href="/loja" className="button button-primary">
                Conheça o Smart Vest <ArrowRight size={18} />
              </Link>
              <Link href="/como-funciona" className="text-link">
                Entenda como funciona <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="hero-assurances">
              <span>
                <ShieldCheck size={17} /> Privacidade em primeiro lugar
              </span>
              <span>
                <HeartHandshake size={17} /> Cuidado com autonomia
              </span>
            </div>
          </div>
          <div className="hero-photo">
            <img
              src={hero}
              alt="Pessoa idosa em um ambiente acolhedor, representando autonomia no dia a dia"
              fetchPriority="high"
            />
            <div className="photo-note">
              <span className="note-icon">
                <HeartHandshake />
              </span>
              <div>
                <strong>
                  O cuidado acompanha.
                  <br />A vida continua.
                </strong>
                <span>Esse é o nosso propósito.</span>
              </div>
            </div>
            <span className="photo-caption">Imagem ilustrativa do projeto</span>
          </div>
        </div>
      </section>
      <div className="principles-bar">
        <div className="container principles">
          <span>
            <ShieldCheck /> Sem câmeras ou microfones
          </span>
          <span>
            <LockKeyhole /> Acesso somente com autorização
          </span>
          <span>
            <Activity /> Informações com contexto
          </span>
        </div>
      </div>
      <section className="section container product-intro" id="produto">
        <div className="product-visual">
          <img
            src={vest}
            alt="Referência conceitual do colete SAGE Smart Vest"
            loading="lazy"
          />
          <span>VISUAL CONCEITUAL · RECURSOS EM VALIDAÇÃO</span>
        </div>
        <div className="section-copy">
          <span className="eyebrow">SAGE SMART VEST</span>
          <h2>
            Um colete.
            <br />
            Uma rede de cuidado.
          </h2>
          <p>
            O SAGE nasce de uma ideia simples: aproximar familiares e
            cuidadores, respeitando a individualidade de quem recebe o cuidado.
          </p>
          <p>
            No protótipo, um ESP32 recebe informações dos sensores e as
            encaminha para um painel protegido. Cada pessoa vê apenas os coletes
            que está autorizada a acompanhar.
          </p>
          <ul className="check-list">
            <li>
              <Check /> Informações organizadas por dispositivo
            </li>
            <li>
              <Check /> Histórico e eventos com data e hora
            </li>
            <li>
              <Check /> Indicação clara de dados desatualizados
            </li>
          </ul>
          <Link href="/loja" className="text-link">
            Explore o Smart Vest <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <section className="section process-section" id="como-funciona">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">DO COLETE ATÉ VOCÊ</span>
              <h2>
                Cuidado conectado,
                <br />
                passo a passo.
              </h2>
            </div>
            <p>
              Uma conexão pensada para ajudar no acompanhamento, com
              transparência em cada etapa.
            </p>
          </div>
          <div className="process-grid">
            {[
              {
                n: "01",
                Icon: Radio,
                title: "O colete coleta",
                text: "Os sensores disponíveis no protótipo enviam informações ao ESP32. As capacidades serão confirmadas com o firmware.",
              },
              {
                n: "02",
                Icon: Wifi,
                title: "A conexão aproxima",
                text: "As leituras seguem para um serviço protegido. Quando a conexão falha, o painel mostra que os dados estão desatualizados.",
              },
              {
                n: "03",
                Icon: HeartHandshake,
                title: "Você acompanha",
                text: "Familiares e cuidadores autorizados consultam leituras, histórico e eventos, cada um dentro das suas permissões.",
              },
            ].map(({ n, Icon, title, text }) => (
              <article className="process-item" key={n}>
                <div className="process-top">
                  <Icon />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section container privacy-section" id="privacidade">
        <div>
          <span className="eyebrow">RESPEITO É PARTE DA TECNOLOGIA</span>
          <h2>
            Estar por perto
            <br />
            sem invadir.
          </h2>
          <p>
            Acompanhamento exige confiança. Por isso, o SAGE é pensado sem
            câmeras ou microfones, com acesso restrito e consentimento no
            vínculo de cuidado.
          </p>
          <Link className="text-link" href="/suporte">
            Tire suas dúvidas sobre privacidade <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="privacy-panel">
          <ShieldCheck size={42} />
          <h3>Quem pode acompanhar?</h3>
          <p>
            Apenas familiares e cuidadores com vínculo autorizado, além da
            equipe SAGE dentro do escopo administrativo.
          </p>
          <div className="privacy-rule" />
          <p>
            Você sabe quais coletes pode visualizar. Sem vínculo, não há acesso
            às leituras.
          </p>
        </div>
      </section>
      <section className="section faq-section" id="perguntas">
        <div className="container faq-grid">
          <div>
            <span className="eyebrow">PODEMOS AJUDAR</span>
            <h2>
              Antes de começar,
              <br />
              vamos conversar.
            </h2>
            <Link className="text-link" href="/suporte">
              Fale com a SAGE <ArrowRight size={18} />
            </Link>
          </div>
          <div className="faq-list">
            {[
              [
                "O Smart Vest já está disponível para compra?",
                "O SAGE Smart Vest está em desenvolvimento acadêmico. Preço, estoque e condições comerciais ainda não foram definidos. Você pode registrar interesse, sem cobrança.",
              ],
              [
                "Quais informações o colete mede?",
                "Os sensores e o firmware ainda precisam ser validados. O painel exibe somente os campos efetivamente recebidos e identifica dados não informados.",
              ],
              [
                "O acompanhamento funciona sem internet?",
                "O envio depende de conexão. O painel destaca o horário da última leitura e sinaliza quando os dados estão desatualizados.",
              ],
              [
                "O SAGE substitui atendimento médico?",
                "Não. O projeto apoia o acompanhamento e não realiza diagnóstico. Em uma emergência, utilize os serviços locais de emergência e procure orientação profissional.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="container closing-section">
        <div>
          <span className="eyebrow">VAMOS CUIDAR, JUNTOS</span>
          <h2>
            Tecnologia que protege.
            <br />
            Cuidado que respeita.
          </h2>
        </div>
        <Link href="/loja" className="button button-primary">
          Conheça o projeto <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
