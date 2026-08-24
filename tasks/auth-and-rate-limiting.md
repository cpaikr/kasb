# Decide whether authentication or client-side rate limiting is warranted

## Outcome

The product adopts authentication or request pacing only when provider evidence
or operational requirements justify a concrete policy.

## Current state

The legacy TODO listed authentication and rate limiting without requirements.
Observed public KASB reads require no authentication, while the Rust pilot
already bounds concurrency and transport attempts. Neither feature is part of
the approved read-only v1 product or the rewrite.

## Next action

Collect provider or operational evidence before proposing any public auth,
quota, retry, or pacing contract.
