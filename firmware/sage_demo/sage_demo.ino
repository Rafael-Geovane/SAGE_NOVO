// SAGE academic demo. All health metrics below are fictional, not sensor reads.
// ESP32 classic / Arduino-ESP32 + ArduinoJson 7.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <time.h>
#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

constexpr uint32_t CONTACT_DEBOUNCE_MS = 60;
constexpr uint32_t SEND_INTERVAL_MS = 3000;
constexpr uint32_t ACK_FRESH_MS = 10000;
portMUX_TYPE sharedMux = portMUX_INITIALIZER_UNLOCKED;
struct DeviceState {
  bool attached = false;
  bool acknowledged = false;
  bool blocked = false;
  uint32_t generation = 0;
  uint32_t lastAccepted = 0;
  uint8_t event = 0; // 0 none, 1 simulated fall, 2 device test
} sharedState;

DeviceState snapshot() {
  portENTER_CRITICAL(&sharedMux);
  DeviceState result = sharedState;
  portEXIT_CRITICAL(&sharedMux);
  return result;
}
void clearAck() {
  portENTER_CRITICAL(&sharedMux);
  sharedState.acknowledged = false;
  portEXIT_CRITICAL(&sharedMux);
}
void setAttached(bool attached) {
  bool changed = false;
  portENTER_CRITICAL(&sharedMux);
  if (sharedState.attached != attached) {
    sharedState.attached = attached;
    sharedState.generation++;
    sharedState.acknowledged = false;
    sharedState.event = 0;
    changed = true;
  }
  portEXIT_CRITICAL(&sharedMux);
  if (changed) Serial.printf("[ID %s | %s] %s\n", SAGE_LOCAL_ID, SAGE_DEVICE_CODE,
    attached ? "Colete conectado; aguardando confirmacao do servidor" : "Colete desconectado; telemetria interrompida");
}
String uuidV4() {
  uint8_t bytes[16]; esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0F) | 0x40;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;
  char result[37];
  snprintf(result, sizeof(result), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
  return String(result);
}
struct HttpResult { int code; bool accepted; };
HttpResult postJson(const char* endpoint, const String& payload) {
  WiFiClientSecure tls;
  tls.setCACert(SAGE_ROOT_CA); // TLS validation is mandatory.
  tls.setHandshakeTimeout(5);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  if (!http.begin(tls, String(SAGE_SUPABASE_URL) + "/functions/v1/" + endpoint)) return {-1, false};
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", SAGE_DEVICE_TOKEN);
  const int code = http.POST(payload);
  bool accepted = false;
  if (code == 200) {
    JsonDocument response;
    if (!deserializeJson(response, http.getString())) accepted = response["accepted"].is<bool>() && response["accepted"].as<bool>();
  }
  http.end();
  return {code, accepted};
}
String makeReading() {
  time_t utc = time(nullptr); struct tm parts; gmtime_r(&utc, &parts);
  char timestamp[25]; strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &parts);
  uint8_t event;
  portENTER_CRITICAL(&sharedMux); event = sharedState.event; sharedState.event = 0; portEXIT_CRITICAL(&sharedMux);
  JsonDocument doc;
  doc["schema_version"] = 1;
  doc["device_code"] = SAGE_DEVICE_CODE;
  doc["message_id"] = uuidV4();
  doc["recorded_at"] = timestamp;
  if (event == 1) doc["event"] = "fall_detected";
  else if (event == 2) doc["event"] = "device_test";
  else doc["event"] = nullptr;
  JsonObject metrics = doc["metrics"].to<JsonObject>();
  metrics["heart_rate_bpm"] = 70 + esp_random() % 7;
  metrics["spo2_percent"] = 97 + esp_random() % 3;
  metrics["temperature_c"] = 36.5;
  metrics["battery_percent"] = 85;
  metrics["gyroscope"] = nullptr;
  JsonObject accel = metrics["accelerometer"].to<JsonObject>();
  accel["x"] = event == 1 ? 3.0 : 0.02;
  accel["y"] = event == 1 ? 2.0 : 0.01;
  accel["z"] = event == 1 ? 15.0 : 9.8;
  accel["unit"] = "m/s2";
  String result; serializeJson(doc, result); return result;
}
void networkTask(void*) {
  if (!strlen(SAGE_WIFI_SSID) || strlen(SAGE_DEVICE_TOKEN) < 32 || !strlen(SAGE_ROOT_CA)) {
    Serial.println("Configuracao incompleta. Preencha o .env e execute npm run esp:prepare.");
    vTaskDelete(nullptr); return;
  }
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(SAGE_WIFI_SSID, SAGE_WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const String bootId = uuidV4();
  uint32_t sequence = 0, lastPresence = 0, lastAttempt = 0, lastReconnect = millis();
  uint32_t presenceGeneration = UINT32_MAX, pendingGeneration = 0, pendingSince = 0;
  uint32_t retryDelay = SEND_INTERVAL_MS;
  bool presenceAccepted = false;
  String pending;
  while (true) {
    if (WiFi.status() != WL_CONNECTED) {
      clearAck(); presenceAccepted = false; presenceGeneration = UINT32_MAX;
      if (millis() - lastReconnect >= 10000) { WiFi.reconnect(); lastReconnect = millis(); }
      vTaskDelay(pdMS_TO_TICKS(100)); continue;
    }
    DeviceState state = snapshot();
    if (pending.length() && (pendingGeneration != state.generation || millis() - pendingSince > 60000)) pending = "";
    if (millis() - lastPresence >= SEND_INTERVAL_MS || presenceGeneration != state.generation) {
      JsonDocument packet;
      packet["device_code"] = SAGE_DEVICE_CODE; packet["boot_id"] = bootId;
      packet["sequence"] = ++sequence; packet["attached"] = state.attached;
      String body; serializeJson(packet, body);
      HttpResult response = postJson("esp-presence", body);
      lastPresence = millis(); presenceGeneration = state.generation;
      presenceAccepted = response.accepted;
      if (!presenceAccepted) { clearAck(); Serial.printf("Presenca nao confirmada, HTTP %d\n", response.code); }
    }
    state = snapshot();
    const bool ready = state.attached && !state.blocked && presenceAccepted && presenceGeneration == state.generation && millis() - lastPresence < ACK_FRESH_MS;
    if (ready && time(nullptr) > 1700000000 && millis() - lastAttempt >= retryDelay) {
      if (!pending.length()) { pending = makeReading(); pendingGeneration = state.generation; pendingSince = millis(); }
      if(digitalRead(VEST_CONTACT_PIN)!=LOW || snapshot().generation!=pendingGeneration){pending="";clearAck();vTaskDelay(pdMS_TO_TICKS(50));continue;}
      lastAttempt = millis();
      HttpResult response = postJson("ingest", pending);
      if (response.accepted) {
        portENTER_CRITICAL(&sharedMux);
        if (sharedState.attached && sharedState.generation == pendingGeneration) {
          sharedState.lastAccepted = millis(); sharedState.acknowledged = true;
        }
        portEXIT_CRITICAL(&sharedMux);
        pending = ""; retryDelay = SEND_INTERVAL_MS;
        Serial.println("Leitura FICTICIA confirmada pelo Supabase.");
      } else {
        clearAck(); Serial.printf("Telemetria nao confirmada, HTTP %d\n", response.code);
        retryDelay = response.code == 429 ? 60000 : min(retryDelay * 2, (uint32_t)15000);
        if (response.code == 400 || response.code == 401 || response.code == 403 || response.code == 409) {
          portENTER_CRITICAL(&sharedMux); sharedState.blocked = true; portEXIT_CRITICAL(&sharedMux);
          Serial.println("Confira credencial, cadastro e relogio. Corrija e reinicie o ESP.");
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}
void setup() {
  pinMode(RED_LED_PIN, OUTPUT); pinMode(GREEN_LED_PIN, OUTPUT);
  digitalWrite(RED_LED_PIN, HIGH); digitalWrite(GREEN_LED_PIN, LOW);
  pinMode(VEST_CONTACT_PIN, INPUT_PULLUP);
  Serial.begin(115200);
  Serial.printf("ID %s | sge_identifier: %s | ESP ligado\n", SAGE_LOCAL_ID, SAGE_DEVICE_CODE);
  Serial.println("F: queda simulada; T: evento de teste. Sem contato com o colete, nenhuma leitura e enviada.");
  if (xTaskCreate(networkTask, "sage-network", 16384, nullptr, 1, nullptr) != pdPASS) Serial.println("Falha ao iniciar rede; LED permanece vermelho.");
}
void loop() {
  static uint32_t contactSince = millis();
  static bool candidate = false;
  const bool contact = digitalRead(VEST_CONTACT_PIN) == LOW;
  if (contact != candidate) { candidate = contact; contactSince = millis(); }
  if (!contact) setAttached(false); // Remove green immediately, even while HTTPS is pending.
  else if (millis() - contactSince >= CONTACT_DEBOUNCE_MS) setAttached(true);
  if (Serial.available()) {
    const char command = Serial.read();
    if ((command == 'f' || command == 'F' || command == 't' || command == 'T') && snapshot().attached) {
      portENTER_CRITICAL(&sharedMux); sharedState.event = command == 'f' || command == 'F' ? 1 : 2; portEXIT_CRITICAL(&sharedMux);
    }
  }
  DeviceState state = snapshot();
  const bool green = state.attached && contact && state.acknowledged && !state.blocked && WiFi.status() == WL_CONNECTED && millis() - state.lastAccepted < ACK_FRESH_MS;
  digitalWrite(GREEN_LED_PIN, green ? HIGH : LOW);
  digitalWrite(RED_LED_PIN, green ? LOW : HIGH);
  delay(10);
}
