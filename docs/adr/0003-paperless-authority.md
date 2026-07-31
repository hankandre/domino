# ADR 0003: Paperless-ngx can be the authoritative document store

Status: accepted

Each household may use local storage or Paperless-ngx. A saved household setting
overrides deployment defaults. When Paperless is selected, Domino uploads there
and stores only its reference and association metadata; it does not retain a
fallback copy. Failure is explicit. Unlinking never deletes the Paperless source.

Saved API tokens are encrypted and bound to household and normalized server URL.
Changing the URL requires a new token. Key continuity is therefore part of backup
and recovery.
