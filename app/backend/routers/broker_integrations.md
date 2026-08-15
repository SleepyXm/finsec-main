# Broker chart-data integration

## Implemented path

Broker chart access is user-owned. Broker access and refresh tokens are not application-wide
environment variables and are never sent to the browser.

1. The authenticated user connects IG or Saxo from the profile Connections tab.
2. Go obtains the broker tokens and stores them encrypted in `broker_connections`.
3. The chart UI lists only that user's connected brokers.
4. Go resolves the selected connection by both connection ID and authenticated user ID.
5. Go refreshes an expiring token, then sends it to Python over the internal-secret boundary.
6. Python calls the selected broker's instrument and chart endpoints and returns the existing
   candle contract, retaining volume and provider-specific bid, ask, and last-traded fields.

The ordinary Finsec/yfinance chart source remains available and is not coupled to broker adapters.

## Provider behaviour

### IG

- Connection: `POST /session`, version 3, using the user's identifier, password, and API key.
- Refresh: `POST /session/refresh-token`, version 1.
- Instrument discovery: `GET /markets?searchTerm=...`, retaining the IG EPIC.
- Historical charts: `GET /prices/{epic}`, using the selected resolution and user account ID.
- Authentication model: the password is used only for the connection request. The API key,
  access token, refresh token, and account ID are held by Go; encrypted credentials are stored.

### Saxo

- Connection: OAuth 2.0 Authorization Code Grant through the Saxo login service.
- Refresh: `POST /token` with `grant_type=refresh_token`.
- Instrument discovery: `GET /ref/v1/instruments`, retaining the UIC and AssetType pair.
- Historical charts: `GET /chart/v3/charts` using the UIC, AssetType, and horizon.
- Authentication model: Finsec's Saxo app key and secret remain server-side. User access and
  refresh tokens are encrypted by Go and are never returned to the frontend.

## Required service configuration

Go requires its existing `ENCRYPTION_KEY`, `INTERNAL_SECRET`, and `PYTHON_URL`, plus:

```text
SAXO_APP_KEY
SAXO_APP_SECRET
SAXO_REDIRECT_URI
```

Python requires `INTERNAL_SECRET` with exactly the same value as Go. IG user credentials and
Saxo user tokens do not belong in either service's global environment for the user chart path.
The older broker comparison probe may still use its developer-only IG/Saxo environment values.

## Current limits

- The connected-broker socket returns authenticated historical candles. It does not yet keep an
  IG Lightstreamer or Saxo WebSocket subscription open for live ticks.
- No authenticated live or demo broker call has been made in this repository because broker user
  credentials and the Saxo application registration are not available in the test environment.
- Broker trading and order submission are outside this chart-data integration.
- IBKR remains a developer Client Portal Gateway probe; it is not part of the new per-user
  Connections/OAuth flow.

## Official references

- IG REST API: <https://labs.ig.com/rest-trading-api-reference.html>
- Saxo OAuth code grant: <https://www.developer.saxo/openapi/learn/oauth-authorization-code-grant>
- Saxo instrument reference: <https://www.developer.saxo/openapi/referencedocs/ref/v1/instruments/get__ref>
- Saxo chart reference: <https://www.developer.saxo/openapi/referencedocs/chart/v3/charts/get__chart>
