---
id: M<N>            # replace with the actual next milestone number in rebalancer-bot/milestones/ — not known from this context
type: milestone
project: rebalancer-bot
derived_from: []
status: draft
---
<!-- Field names above are a best guess at your frontmatter schema (id/type/derived_from pattern
     seen elsewhere) — adjust to match rebalancer-bot's actual milestone template. -->

# Zodiac Roles Permission Scoping for the Rebalancer Bot

## Context

- Safe (avatar/owner/target): `0x96c841D77782E3ED12DDEbBA5246E286fAbE4B97` — Base, chainId 8453, 1-of-1.
- Roles Modifier (v2), deployed and confirmed live: `0x3a0F3035b9CcFc4Efd25C11C34721985172417f4`.
- Transaction unwrapper already configured for both canonical MultiSend variants on Base.
- Data registry for this milestone: `rebalancer-roles-registry.json` (co-located). Treat it as the
  single source of truth for every address and parameter. Do not hand-write a value anywhere else
  that belongs in the registry — reference it.

## Objective

Produce a reviewable, human-signable transaction plan that assigns a scoped role to a dedicated
bot EOA, permitting only:

1. ERC-20 `approve` on the tokens listed in the registry, with `spender` restricted to the
   confirmed execution venue's relayer/router contract and `amount` capped by the allowance.
2. The swap / order-signing call on the confirmed execution venue, with the recipient/receiver
   parameter restricted to the Safe's own address.
3. A per-period spending allowance as a backstop independent of (1) and (2).

No permission broader than this is in scope for this milestone.

## Hard constraints

These are mechanical requirements, not prose reminders — wire them into `generate-verification`
as real script checks, not into a skill's own instructions. Prose-only guardrails already failed
to hold once on this project (M10S1); don't repeat that here with real funds involved.

1. **No address may appear in generated calldata unless its `verified` field in
   `rebalancer-roles-registry.json` is `true`.** A `#NEEDS-CLARIFICATION` value blocks progress at
   `generate-verification`, not at implementation time.
2. **`implement-specification`'s deliverable is a plan, never a submitted transaction.** No skill
   in this milestone signs or broadcasts anything on-chain. Output is: generated calldata (via
   `zodiac-roles-sdk`'s `processPermissions` + `planApplyRole` — not hand-encoded) plus a
   plain-English diff of exactly what will be signed, one transaction at a time, executed manually
   by Baris via the Safe UI. There is intentionally no terminal "execute on-chain" phase in this
   milestone.
3. **No `allowFunction`/`allowTarget` (unconditional) where `scopeFunction` (conditioned) can
   express the same need.** Any exception must be flagged explicitly for human review, never
   defaulted to silently.
4. **Every resolved address needs ≥2 independent sources**, recorded in the registry's `sources`
   field — not just a claim of "confirmed." A single social-media post or a single unverified
   block-explorer label is not sufficient on its own.
5. **If a required fact can't be resolved with confidence, mark it `#NEEDS-CLARIFICATION` and
   stop.** Do not silently substitute a guess, a lookalike address, or a plausible-looking value.

## Deliverables

- `rebalancer-roles-registry.json` updated so every field is either `verified: true` with sources,
  or still explicitly `#NEEDS-CLARIFICATION` (never silently filled).
- Generated calldata for: `assignRoles`, `scopeTarget` (×N targets), `scopeFunction` (×N
  target/function pairs), `setAllowance`.
- A plain-English summary per transaction: contract, function, exact parameter values, and what
  it changes about the role's permissions.
- No private key material — bot EOA or Safe signer — referenced, generated, or requested by any
  skill in this milestone, at any stage.

## Suggested `generate-verification` script checks

- Every `address` field in the registry matches `^0x[a-fA-F0-9]{40}$` AND `verified == true` —
  fail closed otherwise.
- Decode the generated calldata and confirm every referenced address is present in the registry —
  fail if any address appears that isn't.
- Fail if any `allowTarget`/`allowFunction` call is present in the generated plan without a
  corresponding entry + `justification` string in the registry.

## Out of scope

- Runtime execution (`execTransactionWithRole` calls from n8n) — separate, later milestone, and
  blocked entirely until this one is reviewed and the role has been live-tested with trivial
  amounts.
- Choosing between CoW Protocol and an aggregator router — that's a `#NEEDS-CLARIFICATION` in the
  registry, resolve it as this milestone's first task, not an assumption baked into the spec.
