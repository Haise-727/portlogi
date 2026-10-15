# Live security check

Target: https://psjkcvqmjxpwimkenx7bbmsfky0fxqmj.lambda-url.ap-south-1.on.aws
Run: 2026-10-15T05:26:15.371Z
Result: **31 of 31 checks passed**

This checks what an outside visitor can observe. It is not a penetration test and it does not cover the AWS account itself (IAM, billing) or Firebase rules.

## Headers

| Check | Result | Detail |
|---|---|---|
| HTTP 200 for the app | pass | 200 |
| Content-Security-Policy present | pass |  |
| CSP: scripts only from 'self', no unsafe-inline or eval | pass | script-src 'self' |
| CSP: no plugins (object-src none) | pass |  |
| CSP: cannot be framed (frame-ancestors none) | pass |  |
| CSP: no wildcard default-src | pass |  |
| Strict-Transport-Security, at least 1 year | pass | max-age=31536000 |
| X-Content-Type-Options: nosniff | pass |  |
| X-Frame-Options: DENY | pass |  |
| Referrer-Policy set | pass | strict-origin-when-cross-origin |
| Permissions-Policy disables camera, microphone, location | pass |  |
| Cross-Origin-Opener-Policy set | pass | same-origin-allow-popups |
| Cross-Origin-Resource-Policy: same-origin | pass |  |
| No server or framework version leaked | pass | none |
| Pages are not cached stale (no-cache) | pass | no-cache |
| Compressed (brotli) | pass | br |

## Transport

| Check | Result | Detail |
|---|---|---|
| TLS 1.2 or newer | pass | TLSv1.3, TLS_AES_128_GCM_SHA256 |
| Certificate chain trusted | pass | issuer: Amazon |
| Certificate is not about to expire | pass | 182 days left |
| Plain HTTP (port 80) is not served | pass | port 80: no answer |

## Hostile requests

| Check | Result | Detail |
|---|---|---|
| POST is refused | pass |  |
| PUT is refused | pass |  |
| DELETE is refused | pass |  |
| Raw traversal /../../etc/passwd is refused and leaks nothing | pass | HTTP 400 |
| Raw traversal /%2e%2e/%2e%2e/etc/passwd is refused and leaks nothing | pass | HTTP 400 |
| Raw traversal /..%2f..%2fetc%2fpasswd is refused and leaks nothing | pass | HTTP 400 |
| A tidied-up traversal just gets the app page, never a file | pass |  |
| Null byte in path is refused | pass |  |
| Missing script is a 404, not HTML | pass |  |
| Oversized path does not crash it | pass |  |
| Script in the URL is not reflected back | pass |  |
