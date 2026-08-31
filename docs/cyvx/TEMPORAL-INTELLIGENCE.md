# CYVX Temporal Intelligence v1

World State now stores both current state and historical observations.

## Model

`entity -> observations -> events -> timeline -> trajectory`

The current entity map answers "what is true now."

The observation history answers:

- When was it first seen?
- When was it last seen?
- Where was it observed?
- What changed?
- How far did it move?
- How did altitude change?
- What events occurred in a time window?

## API

### Entity history

`GET /api/cyvx/entities/:entityId`

Optional:

- `since`
- `until`
- `limit`

### Trajectory

`GET /api/cyvx/trajectory/:entityId`

Optional:

- `since`
- `until`
- `limit`

### Observations

`GET /api/cyvx/observations`

Optional:

- `entityId`
- `source`
- `since`
- `until`
- `limit`

### Timeline

`GET /api/cyvx/timeline`

Optional:

- `entityId`
- `type`
- `since`
- `until`
- `limit`

### Events

`GET /api/cyvx/events`

Now supports:

- `entityId`
- `type`
- `since`
- `until`
- `limit`

## Change detection

Each observation can contain:

- changed fields
- geographic distance from previous observation
- altitude delta

All observations preserve their original `observedAt` timestamp.

## Storage

Version 2 retains current entities while adding bounded observation history.

The store currently keeps:

- 10,000 events
- 50,000 observations

The storage interface is isolated so a future SQLite/PostgreSQL implementation can preserve the API and data contracts.
