# CYVX Anomaly & Change Intelligence v1

The Anomaly Engine evaluates historical observations for unusual changes.

## Pipeline

`temporal history -> behavioral measurement -> threshold evaluation -> evidence -> severity -> anomaly finding`

## Current detectors

### Rapid movement

Compares consecutive geographic observations and calculates an estimated movement rate.

### Rapid altitude change

Compares consecutive altitude observations and calculates an altitude-change rate.

### Observation gap

Detects periods where an entity was not observed longer than the configured continuity threshold.

### Confidence degradation

Flags observations whose source confidence falls below the configured threshold.

## Evidence-first design

An anomaly is not a claim about cause or intent.

Each finding records:

- detector type
- severity
- confidence
- entity identity
- source
- observation timestamp
- measurement
- threshold
- explanation

## Default thresholds

- rapid movement: 900 km/h
- rapid altitude change: 3,000 altitude units/minute
- observation gap: 30 minutes
- low confidence: 0.35

These are configuration defaults, not universal definitions of anomalous behavior.

## API

`POST /api/cyvx/anomaly/run`

`GET /api/cyvx/anomaly/health`

`GET /api/cyvx/anomaly/findings`

Optional query parameters:

- `severity`
- `type`
- `entityId`
- `limit`

`GET /api/cyvx/anomaly/findings/:id`

## Next

The anomaly engine should eventually learn baselines per entity/source rather than relying only on global thresholds. Future versions can also correlate anomalies with Fusion findings and track anomaly lifecycle transitions.
