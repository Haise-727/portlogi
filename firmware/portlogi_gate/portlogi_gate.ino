#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "time.h"
#include "secrets.h"

#define SEND_TO_CLOUD 1   // 0 = reader and Wi-Fi only, 1 = also send to Firebase

#define PIN_SS 5
#define PIN_RST 22
#define PIN_OK 25
#define PIN_ERR 26
#define PIN_BUZZ 27

MFRC522 rfid(PIN_SS, PIN_RST);

String idToken;
String refreshToken;
unsigned long tokenExpiresAt = 0;

String lastUid;
unsigned long lastUidAt = 0;
const unsigned long SAME_CARD_PAUSE_MS = 3000;

void beep(int ms) {
  digitalWrite(PIN_BUZZ, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZ, LOW);
}

void signal(bool ok) {
  digitalWrite(ok ? PIN_OK : PIN_ERR, HIGH);
  if (ok) {
    beep(80);
  } else {
    beep(80);
    delay(80);
    beep(80);
  }
  delay(250);
  digitalWrite(PIN_OK, LOW);
  digitalWrite(PIN_ERR, LOW);
}

void connectWifi() {
  Serial.print("Wi-Fi: connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++tries > 40) {
      Serial.println("\nWi-Fi: failed, restarting in 5 s");
      delay(5000);
      ESP.restart();
    }
  }
  Serial.print("\nWi-Fi: connected, IP ");
  Serial.println(WiFi.localIP());
}

// TLS checks the server certificate dates, so the clock must be right.
void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm t;
  int tries = 0;
  while (!getLocalTime(&t, 1000) && tries++ < 8) {
    Serial.print("t");
  }
  if (tries > 8) {
    Serial.println("\nClock: could not sync");
  } else {
    Serial.println("Clock: synced");
  }
}

extern const uint8_t rootca_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t rootca_crt_bundle_end[] asm("_binary_x509_crt_bundle_end");

void useSecureClient(WiFiClientSecure &c) {
  c.setCACertBundle(rootca_crt_bundle_start, rootca_crt_bundle_end - rootca_crt_bundle_start);
}

bool postJson(const String &url, const String &body, String &reply, int &code) {
  WiFiClientSecure tls;
  useSecureClient(tls);
  HTTPClient http;
  if (!http.begin(tls, url)) return false;
  http.addHeader("Content-Type", "application/json");
  code = http.POST(body);
  reply = http.getString();
  http.end();
  return code > 0;
}

bool signIn() {
  String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + API_KEY;
  JsonDocument req;
  req["email"] = GATE_EMAIL;
  req["password"] = GATE_PASS;
  req["returnSecureToken"] = true;
  String body;
  serializeJson(req, body);

  String reply;
  int code = 0;
  if (!postJson(url, body, reply, code)) {
    Serial.println("Sign-in: no connection to Google");
    return false;
  }
  JsonDocument res;
  if (deserializeJson(res, reply) || code != 200) {
    Serial.printf("Sign-in: refused (HTTP %d) %s\n", code, reply.c_str());
    return false;
  }
  idToken = res["idToken"].as<String>();
  refreshToken = res["refreshToken"].as<String>();
  unsigned long secs = String(res["expiresIn"].as<const char *>()).toInt();
  tokenExpiresAt = millis() + (secs > 120 ? secs - 120 : secs) * 1000UL;
  Serial.println("Sign-in: ok");
  return true;
}

bool ensureToken() {
  if (idToken.length() && (long)(tokenExpiresAt - millis()) > 0) return true;
  return signIn();
}

bool postScan(const String &uid) {
  if (!ensureToken()) return false;
  String url = String(DB_URL) + "/scans.json?auth=" + idToken;
  String body = String("{\"uid\":\"") + uid + "\",\"reader\":\"" + READER_ID + "\",\"at\":{\".sv\":\"timestamp\"}}";
  String reply;
  int code = 0;
  if (!postJson(url, body, reply, code)) {
    Serial.println("Scan: no connection");
    return false;
  }
  if (code == 401 || code == 403) {
    idToken = "";
  }
  Serial.printf("Scan: HTTP %d %s\n", code, reply.c_str());
  return code == 200;
}

String readUid() {
  String s;
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) s += "0";
    s += String(rfid.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nPortlogi gate reader");

  pinMode(PIN_OK, OUTPUT);
  pinMode(PIN_ERR, OUTPUT);
  pinMode(PIN_BUZZ, OUTPUT);

  SPI.begin();
  rfid.PCD_Init();
  delay(50);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RFID: reader version 0x%02X %s\n", v, (v == 0x91 || v == 0x92) ? "(ok)" : "(unexpected: check wiring and 3.3V)");

  connectWifi();
#if SEND_TO_CLOUD
  syncClock();
  if (!signIn()) Serial.println("Sign-in failed. Check the device account and password in secrets.h.");
#endif
  Serial.println("Ready. Tap a card.");
}

// A loose wire can make the RC522 forget its setup. Check it once a second and set it up again
// if it stopped answering, so a wobble does not need a re-upload.
bool readerAlive() {
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  return v == 0x91 || v == 0x92;
}

void checkReader() {
  static unsigned long lastCheck = 0;
  static bool wasAlive = true;
  if (millis() - lastCheck < 1000) return;
  lastCheck = millis();
  if (readerAlive()) {
    if (!wasAlive) Serial.println("RFID: reader is back");
    wasAlive = true;
    return;
  }
  if (wasAlive) Serial.println("RFID: reader stopped answering, check the wires. Retrying...");
  wasAlive = false;
  rfid.PCD_Init();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  checkReader();

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(30);
    return;
  }
  String uid = readUid();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  if (uid == lastUid && millis() - lastUidAt < SAME_CARD_PAUSE_MS) return;
  lastUid = uid;
  lastUidAt = millis();

  Serial.print("Card: ");
  Serial.println(uid);

#if SEND_TO_CLOUD
  signal(postScan(uid));
#else
  signal(true);
#endif
}
