# V2 Smoke Tests (PowerShell)

This repo contains a quick smoke test runner for the backend v2 endpoints.

File:
- `scripts/v2_smoke_tests.ps1`

## Usage

1) Make sure your backend is deployed and reachable (e.g. `https://halqa-api-k60w.onrender.com`).
2) Obtain a valid student auth token (JWT) for the backend.

Run:

```powershell
pwsh -File scripts/v2_smoke_tests.ps1 -BaseUrl "https://halqa-api-k60w.onrender.com" -AuthToken "<JWT>" -TeacherId "<teacherId>" -SlotId "<slotId>" -PackageId "pkg_3"
```

Notes:
- Some endpoints will fail until your backend implements them.
- `SlotId` must be a real available slot id.
- The script expects `Bearer <token>` auth.
