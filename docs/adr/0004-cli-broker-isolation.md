# ADR 0004: The CLI broker isolates agent credentials

Status: accepted

An unrestricted process can read files owned by its own OS identity, so a plain
CLI config file cannot hide credentials from an agent. Domino instead supports a
broker under a distinct identity or sidecar. Only that broker mounts the secret;
the agent sees a Unix socket and structured CLI responses.

The broker never returns credentials and forwards only Domino API operations.
The deployment must keep its credential volume and Docker/Kubernetes control
planes away from the agent. RBAC and revocation are enforced again by the server.
