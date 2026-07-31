# ADR 0002: RBAC plus independent claim scope

Status: accepted

Human and service actors receive permissions through household roles. Claim
visibility is an independent dimension: all claims or an explicit ID set. This
allows an inventory agent to create products while seeing no unrelated claims,
or a claim assistant to work only selected cases.

Delegation must be a subset of both the manager's permission set and claim set.
The check is repeated under lock in the write transaction. Claim scope applies to
claims and related projections, notes, documents, and downloads. Missing and
out-of-scope resources both return not found to avoid disclosure.
