# CYVX Intelligence Fusion Engine v1

The Fusion Engine correlates independently observed entities across different sources.

## Pipeline

`world state -> candidate pairs -> relationship rules -> spatial score -> temporal score -> finding`

## Why cross-source only?

Two observations from the same source should not automatically become evidence of independent corroboration. The first version therefore requires different sources.

## Scoring

Current scoring:

- spatial proximity: 60%
- temporal proximity: 40%

The score is bounded from `0..1`.

Default thresholds:

- maximum distance: 50 km
- maximum time separation: 900 seconds
- minimum correlation score: 0.25

## Findings

Every finding contains:

- stable deterministic ID
- participating entities
- entity types
- sources
- confidence
- correlation score
- distance
- time separation
- human-readable evidence reasons
- lifecycle status
- timestamps

This makes findings explainable instead of producing an opaque "AI says these are related" result.

## API

### Run fusion

`POST /api/cyvx/fusion/run`

### Health

`GET /api/cyvx/fusion/health`

### Findings

`GET /api/cyvx/fusion/findings`

Query parameters:

- `minConfidence`
- `status`
- `limit`

### Individual finding

`GET /api/cyvx/fusion/findings/:id`

## Current relationship graph

The initial graph intentionally favors physically meaningful relationships:

- aircraft <-> aircraft/vessel/infrastructure/camera
- vessel <-> aircraft/vessel/infrastructure/camera
- satellite <-> satellite/infrastructure/camera
- earthquake <-> infrastructure/camera/fire
- fire <-> infrastructure/camera/earthquake
- camera <-> aircraft/vessel/infrastructure/fire/earthquake

The graph is a policy boundary and can later become configuration/data rather than hard-coded logic.

## Next

The next layer should add anomaly detection and finding lifecycle transitions. Fusion tells CYVX that observations are related; anomaly intelligence should determine when a relationship or observation is unusual relative to historical behavior.
