# ESP32 to portlogi through Firebase

The reader only has to report a card's UID. Nothing here needs an AWS account or a library beyond
`WiFiClientSecure` and `HTTPClient`. The page listens to the same database, so a card read shows up as a
container arriving at the gate within a second or two.

```
RFID reader -> ESP32 --(HTTPS, signed in as a device account)--> Firebase Realtime Database
                                                                      |
                                       browser (signed in, feed switched on) <--+  admits that card's container
```

## One-time setup (project owner, in the Firebase console)

1. **Authentication -> Users -> Add user.** Email `gate1@portlogi.example` (any `gateN@portlogi.example`
   works, the rules match that pattern), and a strong password kept in a password manager.
2. **Authentication -> Settings -> User actions:** make sure *Enable create (sign-up)* is off, so only people
   you add can have accounts. (Checked on 2026-10-14: the sign-up endpoint answers `ADMIN_ONLY_OPERATION`.)
3. **Realtime Database -> Rules:** paste the contents of `firebase/database.rules.json` and Publish.
4. Add a second account for people who watch the page (any email), or reuse your own.

What the rules enforce: only `gateN@portlogi.example` accounts can write, only **new** records (nothing is ever
overwritten or deleted), the record must be exactly `{uid, reader, at}`, `uid` must be 8-20 hex characters, and
`at` must equal the server's clock. Reading needs any signed-in account. Everyone else gets "Permission denied".

## What the ESP32 sends

Two HTTPS calls. Replace `API_KEY`, `DB_URL`, the email and the password (the first two are in
`src/lib/firebaseConfig.ts`).

1. **Sign in** (once, then again about every 50 minutes; the token lasts an hour):

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=API_KEY
Content-Type: application/json

{"email":"gate1@portlogi.example","password":"...","returnSecureToken":true}
```
Reply contains `idToken` (use it below) and `refreshToken`. To renew without the password:
`POST https://securetoken.googleapis.com/v1/token?key=API_KEY` with body
`grant_type=refresh_token&refresh_token=...` (form-encoded); the reply has a fresh `id_token`.

2. **Report a scan:**

```
POST DB_URL/scans.json?auth=ID_TOKEN
Content-Type: application/json

{"uid":"04A32F91","reader":"gate-1","at":{".sv":"timestamp"}}
```
`{".sv":"timestamp"}` is literal: it tells Firebase to stamp the time itself. The UID is the card's bytes as
upper-case hex with no separators.

## Test it without the hardware

From a terminal, with your own password typed locally (never paste it into a chat or a file):

```bash
KEY=AIzaSyCVcyNWHcj8WDyHwQt6BiLP3msKa5FN9t0
DB=https://portlogi-2d2e7-default-rtdb.asia-southeast1.firebasedatabase.app
TOKEN=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"gate1@portlogi.example\",\"password\":\"$DEVICE_PASSWORD\",\"returnSecureToken\":true}" \
  | python -c "import sys,json; print(json.load(sys.stdin)['idToken'])")
curl -s -X POST "$DB/scans.json?auth=$TOKEN" -H 'content-type: application/json' \
  -d '{"uid":"04A32F91","reader":"gate-1","at":{".sv":"timestamp"}}'
```
With the page open, signed in, and **Settings -> Run -> Hardware scanner** on, a container arrives.

These should all be refused (and the first two are a good thing to show in a security demo):

```bash
curl -s "$DB/scans.json"                                             # no sign-in      -> Permission denied
curl -s -X POST "$DB/scans.json" -d '{"uid":"DEADBEEF"}'             # no sign-in      -> Permission denied
curl -s -X POST "$DB/scans.json?auth=$TOKEN" -d '{"uid":"zz"}'       # bad UID, no "at" -> Permission denied
```

## Arduino sketch outline (when you get to the hardware)

```cpp
// Read the card with your RFID library (MFRC522 or PN532) and build the hex string.
String uid = "04A32F91";

WiFiClientSecure tls;
tls.setCACert(ROOT_CA);        // pin Google's root CA; do not call setInsecure() outside a quick test
HTTPClient http;
http.begin(tls, String(DB_URL) + "/scans.json?auth=" + idToken);
http.addHeader("Content-Type", "application/json");
int code = http.POST("{\"uid\":\"" + uid + "\",\"reader\":\"gate-1\",\"at\":{\".sv\":\"timestamp\"}}");
// 200 = accepted. 401/403 = token expired or rules refused it; sign in again.
http.end();
```

Beep or light an LED on a 200, and show the UID on the LCD. Store the Wi-Fi and account passwords in the
ESP32's NVS (not in the sketch you commit).
