# ADR 0005: Distroless non-root runtimes and separate migrations

Status: accepted

First-party application, migration, CLI, and broker containers start directly as
numeric UID/GID 10001. Runtime filesystems are read-only except for declared
temporary and data mounts. Images contain no shell, package manager, privilege
dropper, or root initialization phase.

Database migrations execute as a separate Compose service or versioned Kubernetes
Job before rollout. Application and migration images are atomic artifacts of one
app release; migration code is never fetched at container startup.
