# Morning checklist

Done while you slept: business desk, value-of-information experiment (reports/information.md), ports map, redeploy (31/31 live checks), 90 tests.

Needs you:
1. Firebase (rules not yet published, accounts not created). Either save a service-account key as `.secrets/firebase-admin.json` and run `npm run check:firebase`, or in the console: paste `firebase/database.rules.json`, add `gate1@portlogi.example` and a viewer account, confirm sign-up is off. Delete the key afterwards.
2. Run securityheaders.com and SSL Labs against the live URL yourself (they block automated fetches) and save screenshots to reports/security/.
3. Write the report and poster prose yourself (AI-similarity limit). Facts and numbers: docs/real-world-and-patentability.md, reports/results.md, reports/information.md.
4. ESP32 firmware (hardware step, later).
