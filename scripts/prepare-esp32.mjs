import { loadEnv } from "vite";
import { connect } from "node:tls";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = loadEnv("development", root, "ESP_");
const publicEnv = loadEnv("development", root, "VITE_");
const url = new URL(
  publicEnv.VITE_SUPABASE_URL || "https://negrojohnpjfwwuokldx.supabase.co",
);
if (url.protocol !== "https:")
  throw new Error("O firmware exige um servidor HTTPS.");
const token = env.ESP_DEVICE_TOKEN ?? "";
if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || /^sb(p)?_/i.test(token))
  throw new Error(
    "Preencha ESP_DEVICE_TOKEN no .env com o token individual do colete, não uma chave Supabase.",
  );
const code = env.ESP_DEVICE_CODE || "SGE-004";
if (!/^SGE-\d{3}$/.test(code))
  throw new Error("ESP_DEVICE_CODE deve usar SGE-000.");
const cert = await new Promise((resolve, reject) => {
  const socket = connect(
    {
      host: url.hostname,
      port: 443,
      servername: url.hostname,
      rejectUnauthorized: true,
    },
    () => {
      if (!socket.authorized) {
        socket.destroy();
        reject(new Error("Certificado do servidor não validado."));
        return;
      }
      let peer = socket.getPeerCertificate(true);
      const seen = new Set();
      while (
        peer.issuerCertificate &&
        peer.fingerprint256 !== peer.issuerCertificate.fingerprint256 &&
        !seen.has(peer.fingerprint256)
      ) {
        seen.add(peer.fingerprint256);
        peer = peer.issuerCertificate;
      }
      if (!peer.raw || peer.subject?.CN !== peer.issuer?.CN) {
        socket.destroy();
        reject(new Error("Não foi possível obter a raiz TLS verificada."));
        return;
      }
      const b64 = peer.raw
        .toString("base64")
        .match(/.{1,64}/g)
        .join("\n");
      socket.end();
      resolve(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`);
    },
  );
  socket.setTimeout(15000, () => {
    socket.destroy();
    reject(new Error("Tempo esgotado ao obter o certificado TLS."));
  });
  socket.on("error", () =>
    reject(new Error("Falha ao validar TLS do Supabase.")),
  );
});
const string = (name, value) => `#define ${name} ${JSON.stringify(value)}\n`;
const header =
  "#pragma once\n// Generated from root .env. Private: do not commit.\n" +
  string("SAGE_LOCAL_ID", env.ESP_LOCAL_ID || "001") +
  string("SAGE_DEVICE_CODE", code) +
  string("SAGE_SUPABASE_URL", url.origin) +
  string("SAGE_DEVICE_TOKEN", token) +
  string("SAGE_WIFI_SSID", env.ESP_WIFI_SSID || "") +
  string("SAGE_WIFI_PASSWORD", env.ESP_WIFI_PASSWORD || "") +
  `#define SAGE_ROOT_CA R"SGE_CERT(${cert})SGE_CERT"\nconstexpr int RED_LED_PIN=25;\nconstexpr int GREEN_LED_PIN=26;\nconstexpr int VEST_CONTACT_PIN=27;\n`;
await writeFile(
  new URL("../firmware/sage_demo/config.h", import.meta.url),
  header,
  { mode: 0o600 },
);
console.log(
  "firmware/sage_demo/config.h gerado com credencial individual e raiz TLS verificada.",
);
if (!env.ESP_WIFI_SSID)
  console.log(
    "Falta preencher ESP_WIFI_SSID e ESP_WIFI_PASSWORD no .env e executar novamente.",
  );
