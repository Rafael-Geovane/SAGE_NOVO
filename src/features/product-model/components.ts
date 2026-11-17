export const productComponents = [
  {
    id: "vest",
    name: "Colete vestível",
    category: "Vestuário conceitual",
    description:
      "Representação de tecido respirável, com recortes, costuras e bolso de suporte. Material, conforto, ajuste e acabamento precisam de validação na peça física.",
  },
  {
    id: "case",
    name: "Caixa eletrônica removível",
    category: "Integração ilustrativa",
    description:
      "Caixa compacta com tampa destacável e suporte no bolso. Formato, fixação e organização interna são conceituais; não representam um arquivo pronto para fabricação.",
  },
  {
    id: "esp32",
    name: "ESP32",
    category: "Controlador do protótipo",
    description:
      "Placa de desenvolvimento representada como controlador do protótipo. Modelo da placa, conectores e encaixe na caixa devem ser confirmados na montagem real.",
  },
  {
    id: "battery",
    name: "Bateria LiPo 3,7 V",
    category: "Alimentação prevista",
    description:
      "Representação de uma bateria LiPo de 3,7 V. Capacidade, dimensões, autonomia e acomodação ainda dependem da seleção e validação do hardware.",
  },
  {
    id: "charger",
    name: "Carga e proteção",
    category: "Referência de protótipo",
    description:
      "Módulo ilustrativo de carga e proteção da bateria. Circuito, compatibilidade e implementação final precisam de validação elétrica.",
  },
  {
    id: "max30102",
    name: "MAX30102",
    category: "Sensor PPG previsto",
    description:
      "Sensor PPG previsto para o protótipo. Placa, contato com a pele, posicionamento e qualidade do sinal ainda precisam ser avaliados no hardware real.",
  },
  {
    id: "max30205",
    name: "MAX30205",
    category: "Temperatura prevista",
    description:
      "Sensor de temperatura previsto. O local de contato e a integração ilustrados não indicam medição clínica validada.",
  },
  {
    id: "bmi160",
    name: "BMI160",
    category: "Movimento previsto",
    description:
      "IMU de movimento com acelerômetro e giroscópio. Orientação, fixação e processamento dos sinais precisam ser definidos no protótipo físico.",
  },
  {
    id: "wires",
    name: "Fiação interna",
    category: "Roteamento ilustrativo",
    description:
      "Fios organizados entre os módulos, visíveis na vista explodida. Cores, trajetos e pontos de conexão não são um esquema elétrico nem definem a pinagem.",
  },
] as const;
export type ComponentId = (typeof productComponents)[number]["id"];
export type ProductView = "external" | "exploded";
export type ViewerAction =
  "left" | "right" | "up" | "down" | "zoom-in" | "zoom-out" | "reset";
export const conceptualNotice =
  "Modelo conceitual para apresentação acadêmica. Componentes, posição dos sensores, caixa e integração ainda precisam ser validados no hardware real.";
