# Secrets, rotation, and recovery

Generate secrets independently with a cryptographically secure generator. In
containers, use the supported `*_FILE` variables and read-only secret mounts.
Environment value forms exist for development and secret-controller integration,
but values may be exposed through process or orchestration inspection.

| Secret                    | Minimum practice                               | Rotation effect                                                                                                                 |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL password / URL | Unique database role, TLS where remote         | Requires coordinated DB and workload update                                                                                     |
| Domino session secret     | At least 32 random bytes; keep previous backup | Invalidates browser sessions; if also used to derive credential encryption, changing it makes saved Paperless tokens unreadable |
| Credential encryption key | Independent 32+ byte value recommended         | Existing saved integration credentials become unreadable unless re-encrypted first                                              |
| OIDC client secret        | Provider-generated, file mounted               | Active Domino sessions remain, new OIDC flows fail during an uncoordinated change                                               |
| Paperless token           | Least privilege supported by Paperless         | New searches/uploads fail until Domino receives the replacement                                                                 |
| CLI/service credential    | Issued by Domino device flow                   | Revocation is immediate; reauthorize the CLI or broker                                                                          |

For a routine session-secret rotation, schedule a sign-in interruption, change the
secret, restart all replicas together, and ask users to sign in again. Configure a
separate `DOMINO_CREDENTIAL_ENCRYPTION_KEY_FILE` first if the session secret
currently derives the integration key; migrating ciphertext between keys is not
yet automated, so saved Paperless credentials must otherwise be re-entered.

If a service credential is exposed, revoke the service account under Settings,
inspect audit history, then run device authorization again with the smallest
permission and claim preset. If PostgreSQL or encryption secrets are exposed,
rotate affected upstream credentials and treat encrypted integration tokens and
session state as compromised.

Loss of the session secret invalidates sessions. Loss of the credential-encryption
key cannot be recovered from PostgreSQL; restore it from the secret backup or
enter a new Paperless token. Domino never displays a stored token for recovery.
