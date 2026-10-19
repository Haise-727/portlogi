# Hardware bring-up: ESP32 + RFID gate

Goal of this stage: tap a card, see it arrive on the web page. Nothing else (no LCD, no keypad). Once that link is solid we can decide what the gate should do next.

## What to buy

Required:
1. **ESP32 dev board** (ESP32-WROOM-32 "DevKit", 30 or 38 pin). Not an ESP32-S3 or C3 for this guide, the pins below are for the classic ESP32.
2. **RC522 RFID module** (MFRC522, 13.56 MHz). Most come with one blue card and one keyfob. Buy 3 to 5 extra cards or tags (Mifare Classic 1K) so you can have several "containers".
3. **USB data cable** for the board (micro-USB or USB-C to match it). Some cables only charge. If the board does not show up as a COM port, try another cable.
4. **7 female-to-female jumper wires**, or a breadboard plus male-to-female wires.
5. **Header pins on the RC522 must be soldered.** Many modules ship with loose pins. Buy one with pins already soldered, or solder them (a basic iron is enough).

Optional (the sketch works without them, it just prints to the serial monitor):
- green LED, red LED, two 220 ohm resistors
- active buzzer (3.3 V or 5 V "active", not "passive")
- breadboard

## Wiring (RC522 to ESP32)

| RC522 | ESP32 |
|---|---|
| SDA (SS) | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 22 |
| 3.3V | 3V3 |
| GND | GND |
| IRQ | not connected |

**Power the RC522 from 3.3V, never 5V.** It can be damaged by 5V.

Optional: green LED to GPIO 25 and red LED to GPIO 26 (each with a 220 ohm resistor to GND), buzzer to GPIO 27.

## Software to install on your PC

1. **Arduino IDE 2.x** from arduino.cc (free).
2. In Arduino IDE, open File > Preferences and paste this into "Additional boards manager URLs":
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. Tools > Board > Boards Manager: search **esp32** and install "esp32 by Espressif Systems" (tested with version 3.3.12).
4. Tools > Manage Libraries: install **MFRC522** (by GithubCommunity) and **ArduinoJson** (by Benoit Blanchon, version 7). `WiFi`, `HTTPClient` and `NetworkClientSecure` come with the ESP32 package.
5. USB driver: most boards need the **CP210x** or **CH340** driver (look at the small chip near the USB port). Windows may install it by itself. If no COM port appears in Tools > Port, install the driver.
6. Select Tools > Board > "ESP32 Dev Module" and the COM port.

The sketch compiles for "ESP32 Dev Module" with the setup above (checked with arduino-cli).

## Firebase setup (once, in the console)

Follow the "One-time setup" in `docs/hardware-firebase.md`. You need:
- the rules from `firebase/database.rules.json` published,
- a device account `gate1@portlogi.example` with a password you choose,
- sign-up switched off.

## Load the sketch

1. Open `firmware/portlogi_gate/portlogi_gate.ino` in Arduino IDE.
2. Copy `secrets.h.example` to `secrets.h` (same folder) and fill in your Wi-Fi name and password, and the device account password. `secrets.h` is ignored by git. Never commit it or paste it in chat.
3. The ESP32 uses **2.4 GHz Wi-Fi only**. A phone hotspot works well if the campus or home wifi blocks devices.

## Bring-up in steps

Open Tools > Serial Monitor at **115200 baud** each time.

**Step 1: reader and Wi-Fi only.**
Set `#define SEND_TO_CLOUD 0`, upload. Expect:
- `RFID: reader version 0x92 (ok)` (0x91 is also fine). If you see `0x00` or `0xFF`, the wiring is wrong, or the RC522 is on 5V or its pins are not soldered well.
- `Wi-Fi: connected, IP ...`
- Tap a card: `Card: 04A32F91` (your own UID). The LED and buzzer respond if fitted.

**Step 2: cloud.**
Set `#define SEND_TO_CLOUD 1`, upload. Expect `Clock: synced`, `Sign-in: ok`, then on each tap `Scan: HTTP 200 {"name":"-Nx..."}`.
Open the web page, sign in with a viewer account, turn on Settings > Run > Hardware scanner, and tap a card. A container should arrive.

## If something fails

| You see | Meaning and fix |
|---|---|
| `reader version 0x00` or `0xFF` | Wiring or power. Check all 7 wires, 3.3V, and soldering. |
| Wi-Fi never connects | Wrong password, 5 GHz only network, or a captive portal. Use a phone hotspot. |
| `Clock: could not sync` or TLS errors | No internet, or NTP blocked. Try a hotspot. |
| `Sign-in: refused (HTTP 400) ... INVALID_LOGIN_CREDENTIALS` | Wrong device email or password, or the account does not exist yet. |
| `Scan: HTTP 401` or `Permission denied` | Rules not published, or the account is not `gateN@portlogi.example`. |
| `Scan: HTTP 200` but nothing on the page | The page is not signed in, or Hardware scanner is off, or the card is a UID the page ignores (it needs 8 to 20 hex characters). |
| Same card taps twice | The sketch ignores the same card for 3 seconds on purpose. |

## Security notes

- The sketch checks the server's certificate using the ESP32's built-in Google root list. It never uses `setInsecure()`.
- The device account can only add new scan records. It cannot read or change anything else (see the rules).
- The Firebase `API_KEY` in the sketch is a public identifier, not a secret. The device password is the secret.
- If you lose a board, delete that device account in the Firebase console.
