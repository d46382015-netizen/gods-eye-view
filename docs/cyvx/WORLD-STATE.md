# CYVX World State v1

CYVX World State is the first intelligence primitive added above God's Eye View.

## Pipeline

`source -> normalize -> entity -> event -> persistent state -> API`

## Entity contract

Every normalized entity contains:

- stable `id`
- `type`
- `source`
- `sourceId`
- `observedAt`
- optional geographic position
- confidence from `0..1`
- arbitrary source attributes

## Event contract

Events retain:

- entity identity
- event type
- source
- observation time
- creation time
- confidence
- position
- event attributes

## API

- `GET /api/cyvx/health`
- `GET /api/cyvx/entities`
- `GET /api/cyvx/events`
- `POST /api/cyvx/ingest`

The initial persistence implementation uses an atomic JSON state file so the capability works without native database dependencies on Android/Termux. The storage boundary is intentionally isolated so SQLite/PostgreSQL can replace it later without changing the entity/event contract.

## Safety / data integrity

The system records provenance and observation time rather than presenting inferred intelligence as fact. Confidence is explicit and bounded.

## Next

The next integration connects existing GEV data layers to this store, followed by temporal queries and cross-source correlation.
