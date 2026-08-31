# Independent claim review packet

> Assess each fictional entry without using any other fixture material.
> Check the claim against its bound observation and, when present, the
> earlier claim context listed for its supersession link.

## Kind rubric

- `decision`: an explicit resolution, approval, adoption, or selection choosing one rule or option over alternatives.
- `procedure`: a required step, sequence, prerequisite, or method for carrying out work.
- `preference`: an explicit desired format, channel, style, or behavior stated as a preference rather than a mandatory process step.
- An explicit want, dislike, or style preference remains preference even when it names the selected option. Use decision only when the observation frames the act as a resolution, approval, adoption, or selection over alternatives.

## Claim review contract

- A subject key must concisely name the subject expressed by its bound observation; this judgment concerns semantic naming, while cross-entry uniqueness/chain consistency is generator-validated.
- `global` requires a null key and explicit universal wording; every non-global scope key must be established by the bound observation.
- `effectiveAt` must equal the bound observation's `authoredAt`.
- `evidenceIds` must contain exactly the bound observation's neutral ID.
- Future-dated and retroactive changes are prohibited.
- Supersession may reference only an earlier claim with the same kind, subject key, and exact scope.
- Cross-scope guidance coexists and must not be linked as supersession.

## Entry CR-001

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "b84114ccca7168e80e35ebeb591a1ce6705bc25a059938ff761719f8721e5fa3",
  "text": "Northstar Team requires this step before other handling: Northstar Team now files an invoice with `northstar-file` when formal review begins, replacing the no-action step."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-team",
    "level": "team"
  },
  "statement": "Northstar Team requires this step before other handling: Northstar Team now files an invoice with `northstar-file` when formal review begins, replacing the no-action step.",
  "subjectKey": "formal-review",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-07-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "procedure",
      "scope": {
        "key": "northstar-team",
        "level": "team"
      },
      "statement": "Northstar Team requires an omission step when formal review begins: do not call `northstar-note`, and call no catalog action.",
      "subjectKey": "formal-review",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-07-09T09:00:00Z",
      "id": "PO01",
      "sha256": "0c8dbfed8058530d2df388bed0838f857e4d1315260254dff7f6127691a7bc1d",
      "text": "Northstar Team requires an omission step when formal review begins: do not call `northstar-note`, and call no catalog action."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-002

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "80cf8e78236a5ba7ea300e9fbdbb0587ac545674efa74ab31ed92d0a961a3326",
  "text": "Gannet House requires this step before other handling: Gannet House attaches `seabird-note` when a recipient needs special opening instructions."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "gannet-house",
    "level": "organization"
  },
  "statement": "Gannet House requires this step before other handling: Gannet House attaches `seabird-note` when a recipient needs special opening instructions.",
  "subjectKey": "recipient-opening-instructions",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-003

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "545f38b0664043ae89d535a87d9fd202ae7cbb4024936ec75cbb5d49f13adb18",
  "text": "The owners of the status-publishing workflow decided on this rule: A late risk discovered in the status-publishing workflow goes to `mosaic-feed` immediately."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "status-publishing",
    "level": "workflow"
  },
  "statement": "The owners of the status-publishing workflow decided on this rule: A late risk discovered in the status-publishing workflow goes to `mosaic-feed` immediately.",
  "subjectKey": "late-risks",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-004

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "f608a23c192a31abe6e8cbb3d70e94c4fe7ac27bb8065a446512d14aaea5e638",
  "text": "Harborview Project decided on this rule: Harborview Project adds `harbor-note` when a translator needs clarification from the facilitator."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-project",
    "level": "project"
  },
  "statement": "Harborview Project decided on this rule: Harborview Project adds `harbor-note` when a translator needs clarification from the facilitator.",
  "subjectKey": "translator-clarifications",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-005

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "b55c6f34064b4e353ff4ba641660f168bf845b4714c563e523777e7cd9e48e62",
  "text": "Marigold Project wants this approach: Marigold Project uses `marigold-indigo` for investor overview visuals."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-project",
    "level": "project"
  },
  "statement": "Marigold Project wants this approach: Marigold Project uses `marigold-indigo` for investor overview visuals.",
  "subjectKey": "investor-overview-visuals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-006

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "f0738a9c6f2e43721208f088262a76acb1b5056838349322e671eae39e533363",
  "text": "Driftwood Labs decided on this rule: Driftwood Labs records approved archive-window requests with `cedar-log` before access begins."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "driftwood-labs",
    "level": "organization"
  },
  "statement": "Driftwood Labs decided on this rule: Driftwood Labs records approved archive-window requests with `cedar-log` before access begins.",
  "subjectKey": "approved-archive-window-requests",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-007

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "5e1d45a9a2633f698558e5a276d6c0fcd4e6c0d0a2a05eb28004784164cc7c40",
  "text": "Firn Collective requires the next step: Firn Collective runs `northstar-verify` when an invoice uses a currency absent from the order."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "firn-collective",
    "level": "organization"
  },
  "statement": "Firn Collective requires the next step: Firn Collective runs `northstar-verify` when an invoice uses a currency absent from the order.",
  "subjectKey": "absent-order-currency",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-008

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "b1facc76b1a0d1c0c9cc3919457ce72171400e92860f91fc48fbf9a90ebe4409",
  "text": "The owners of the status-publishing workflow approved the recorded choice: The status-publishing workflow uses `mosaic-board` for routine updates."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "status-publishing",
    "level": "workflow"
  },
  "statement": "The owners of the status-publishing workflow approved the recorded choice: The status-publishing workflow uses `mosaic-board` for routine updates.",
  "subjectKey": "routine-status-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-009

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "4567c45ccabbe07c7f30d6c6077e4bcabf4635d5adac1e57eae41a189bfc7862",
  "text": "Ember Guild requires the following method: Ember Guild captures low-severity reports in `comet-form` before the weekly review."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "ember-guild",
    "level": "organization"
  },
  "statement": "Ember Guild requires the following method: Ember Guild captures low-severity reports in `comet-form` before the weekly review.",
  "subjectKey": "low-severity-reports",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-010

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "7bdea1797f1194f70c26bfb9f5f15f4864cf5b8eac2235c35e0aa7447bafbda8",
  "text": "Jasmere Group wants the following channel: Jasmere Group pins leadership alerts with `solstice-pin` until they are acknowledged."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "jasmere-group",
    "level": "organization"
  },
  "statement": "Jasmere Group wants the following channel: Jasmere Group pins leadership alerts with `solstice-pin` until they are acknowledged.",
  "subjectKey": "leadership-alerts",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-011

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "032861fa963b0645edc6a90d55a4f163ca624dd184a4074437adebf6722c2ad4",
  "text": "The asset-handoff workflow uses a required method here: The opening step in the asset-handoff workflow uses `seabird-note` to capture the recipient and purpose before any move."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "asset-handoff",
    "level": "workflow"
  },
  "statement": "The asset-handoff workflow uses a required method here: The opening step in the asset-handoff workflow uses `seabird-note` to capture the recipient and purpose before any move.",
  "subjectKey": "asset-handoff-opening-step",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-012

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "d3233a91a400a39c8c30f5ee9dc364eed2c9e2b373d71de5481724a04d61c942",
  "text": "The release-signoff workflow uses a required method here: The release-signoff workflow adds `willow-note` when an approver explains a late change."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "release-signoff",
    "level": "workflow"
  },
  "statement": "The release-signoff workflow uses a required method here: The release-signoff workflow adds `willow-note` when an approver explains a late change.",
  "subjectKey": "approver-late-change",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-013

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "5c029b38d4194e360cae1a31e26e3f8f0a51477abcdd9a1556c9867cc6869c98",
  "text": "Islet Network prefers this handling: Across Islet Network, weekly briefings are rendered with `juniper-cards`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "islet-network",
    "level": "organization"
  },
  "statement": "Islet Network prefers this handling: Across Islet Network, weekly briefings are rendered with `juniper-cards`.",
  "subjectKey": "weekly-briefings",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-014

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "65e6071db7f9b04269567f8e578c7c8b5eab19196d7a87db01e6a1791f13013e",
  "text": "Mosaic Team adopted this handling for the stated case: Mosaic Team pins routine status updates with `mosaic-pin` so they remain visible during review."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-team",
    "level": "team"
  },
  "statement": "Mosaic Team adopted this handling for the stated case: Mosaic Team pins routine status updates with `mosaic-pin` so they remain visible during review.",
  "subjectKey": "routine-status-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-015

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "8eca2112a06cebecce61e6e6fd048f0a7337f6fcc63f7dff528e13b97c630e35",
  "text": "Comet Project requires the stated sequence: Comet Project now starts a newly reported incident by sending it to `comet-queue`, replacing the form-first step."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-project",
    "level": "project"
  },
  "statement": "Comet Project requires the stated sequence: Comet Project now starts a newly reported incident by sending it to `comet-queue`, replacing the form-first step.",
  "subjectKey": "newly-reported-incidents",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-06-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "procedure",
      "scope": {
        "key": "comet-project",
        "level": "project"
      },
      "statement": "Comet Project requires the next step: Comet Project uses `comet-form` to start newly reported incidents.",
      "subjectKey": "newly-reported-incidents",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-06-09T09:00:00Z",
      "id": "PO01",
      "sha256": "2091dff5a3d5e1aa04460dfc58eed9f9014de4251fcb4c88fa08e62c56d6c67d",
      "text": "Comet Project requires the next step: Comet Project uses `comet-form` to start newly reported incidents."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-016

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "155c8d0f4e22bfd020ab8756dcf35b6660deba5fbaf9a9123ebaf3cf2fca887f",
  "text": "The required order for Firn Collective is explicit: Firn Collective preserves a supplier explanation by adding `northstar-note` to the invoice item."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "firn-collective",
    "level": "organization"
  },
  "statement": "The required order for Firn Collective is explicit: Firn Collective preserves a supplier explanation by adding `northstar-note` to the invoice item.",
  "subjectKey": "supplier-explanations",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-017

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "24a3da36695d074237b11af48318b5309e62722a17a406795ae8460cf0a04da1",
  "text": "The owners of the release-notices workflow approved the stated rule: A withdrawn item in the release-notices workflow moves to `lantern-hold` rather than being republished."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "release-notices",
    "level": "workflow"
  },
  "statement": "The owners of the release-notices workflow approved the stated rule: A withdrawn item in the release-notices workflow moves to `lantern-hold` rather than being republished.",
  "subjectKey": "withdrawn-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-018

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "04ec3e98f18352cd98b6ea5c71791ee1d4d85b9a29b1b315ac93b8872957bcd6",
  "text": "Juniper Team would like the following style: Juniper Team writes emerging-risk context as `juniper-note` rather than compressing it into cells."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-team",
    "level": "team"
  },
  "statement": "Juniper Team would like the following style: Juniper Team writes emerging-risk context as `juniper-note` rather than compressing it into cells.",
  "subjectKey": "emerging-risk-context",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-019

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "c7c45079f9d586a62e3bc306140c94b4dc895384d6a2fa4e91eff2411f1b8d76",
  "text": "Tern Project prefers to use this option: Tern Project keeps unapproved draft minutes in `tern-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-project",
    "level": "project"
  },
  "statement": "Tern Project prefers to use this option: Tern Project keeps unapproved draft minutes in `tern-hold`.",
  "subjectKey": "unapproved-draft-minutes",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-020

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "c6a043231832a8a3f23e69d03acbce50a7207da361c0ad0473995b8daca1da61",
  "text": "Mosaic Team adopted the following option: Mosaic Team moves cancelled-work updates to `mosaic-archive` once the closing note is approved."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-team",
    "level": "team"
  },
  "statement": "Mosaic Team adopted the following option: Mosaic Team moves cancelled-work updates to `mosaic-archive` once the closing note is approved.",
  "subjectKey": "cancelled-work-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-021

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "1e68143468c913baa16443325f65455a48815dbe9e3e641b439cfb9d96cf90d3",
  "text": "Comet Project requires this order of work: Comet Project keeps the aftercare summary on `comet-page` after recovery is complete."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-project",
    "level": "project"
  },
  "statement": "Comet Project requires this order of work: Comet Project keeps the aftercare summary on `comet-page` after recovery is complete.",
  "subjectKey": "aftercare-summaries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-022

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "1eda08c9365c9e5b5cbcfa11ebd6ad133aeb4cf842985e7b5081b10ad10d81c7",
  "text": "The invoice-review workflow requires the stated sequence: The invoice-review workflow places a completed review in `northstar-file` with its receipt."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "invoice-review",
    "level": "workflow"
  },
  "statement": "The invoice-review workflow requires the stated sequence: The invoice-review workflow places a completed review in `northstar-file` with its receipt.",
  "subjectKey": "completed-invoice-reviews",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-023

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "e9a0671a5ae1d6dad728bd38c5d78434fad5b13d976a24af4d6647e412a31c52",
  "text": "Harborview Team approved calling no catalog action for completed feedback bundles and explicitly prohibited `harbor-tag`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-team",
    "level": "team"
  },
  "statement": "Harborview Team approved calling no catalog action for completed feedback bundles and explicitly prohibited `harbor-tag`.",
  "subjectKey": "completed-feedback-bundles",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-024

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "f2ff3e174ec69973b963c80e10e3bd7576e0225bcf803e04e4bf727736c21015",
  "text": "Solstice Team explicitly wants no catalog action for routine morning updates and does not want `solstice-digest` called."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-team",
    "level": "team"
  },
  "statement": "Solstice Team explicitly wants no catalog action for routine morning updates and does not want `solstice-digest` called.",
  "subjectKey": "routine-morning-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-025

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "ffa41116d085b67165b078ad7f684df726e0b1cd0210c9b594e6ea880e1cb6ff",
  "text": "Mosaic Project approved this handling: For Mosaic Project, new dependency-watch items are added to `mosaic-board`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-project",
    "level": "project"
  },
  "statement": "Mosaic Project approved this handling: For Mosaic Project, new dependency-watch items are added to `mosaic-board`.",
  "subjectKey": "dependency-watch-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-026

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "4bd18674e9d773d31cdc7bdf29c4815c76daf5b4d336012ee382b50abf2fdc6c",
  "text": "Hollow Tree Co requires the next step: Hollow Tree Co records executive approval with `willow-sign` on high-visibility releases."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "hollow-tree-co",
    "level": "organization"
  },
  "statement": "Hollow Tree Co requires the next step: Hollow Tree Co records executive approval with `willow-sign` on high-visibility releases.",
  "subjectKey": "high-visibility-releases",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-027

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "7d00e662d06110b374a6bd9038e2a5f443017ce082717e39d33b2634bc78e992",
  "text": "Cedar Project decided that this option should govern: Cedar Project answers closed-collection inquiries with `cedar-notify` and does not open access."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-project",
    "level": "project"
  },
  "statement": "Cedar Project decided that this option should govern: Cedar Project answers closed-collection inquiries with `cedar-notify` and does not open access.",
  "subjectKey": "closed-collection-inquiries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-028

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "6708a7d7eb1ffe028074e4d224c73031eb404520e94526938e7759edfc103b59",
  "text": "Tern Project prefers this current handling: Tern Project now files routine meeting recaps with `tern-file`, replacing the no-action handling."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-project",
    "level": "project"
  },
  "statement": "Tern Project prefers this current handling: Tern Project now files routine meeting recaps with `tern-file`, replacing the no-action handling.",
  "subjectKey": "routine-meeting-recaps",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-08-08T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "preference",
      "scope": {
        "key": "tern-project",
        "level": "project"
      },
      "statement": "Tern Project explicitly wants no catalog action for routine meeting recaps and does not want `tern-note` called.",
      "subjectKey": "routine-meeting-recaps",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-08-08T09:00:00Z",
      "id": "PO01",
      "sha256": "72c76df446c9293efdd33e6d87fa1307d826d523a3ce6f670fdccf07078ba45e",
      "text": "Tern Project explicitly wants no catalog action for routine meeting recaps and does not want `tern-note` called."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-029

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "49eb8211367aad0f432a7f16e690b172d1d48c4f11e93cb6b9de993000f3912b",
  "text": "Participants in the chart-styling workflow prefer to use this option: The chart-styling workflow now uses `marigold-coral` for routine analytical charts, replacing indigo."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "chart-styling",
    "level": "workflow"
  },
  "statement": "Participants in the chart-styling workflow prefer to use this option: The chart-styling workflow now uses `marigold-coral` for routine analytical charts, replacing indigo.",
  "subjectKey": "routine-analytical-charts",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-05-10T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "preference",
      "scope": {
        "key": "chart-styling",
        "level": "workflow"
      },
      "statement": "Participants in the chart-styling workflow prefer this format: Participants in the chart-styling workflow prefer `marigold-indigo` for routine analytical charts.",
      "subjectKey": "routine-analytical-charts",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-05-10T09:00:00Z",
      "id": "PO01",
      "sha256": "e202f07e4fde40f112e27d1960522925b5181fb7f70d12082f22cf1ff0569ac7",
      "text": "Participants in the chart-styling workflow prefer this format: Participants in the chart-styling workflow prefer `marigold-indigo` for routine analytical charts."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-030

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "bd281675312e7a7e2e930c57c42b508904ec5671ae444c2eaeb1778f119d88bc",
  "text": "Harborview Team adopted this handling for the stated case: Harborview Team marks bundles needing an anonymity check with `harbor-tag`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-team",
    "level": "team"
  },
  "statement": "Harborview Team adopted this handling for the stated case: Harborview Team marks bundles needing an anonymity check with `harbor-tag`.",
  "subjectKey": "anonymity-checks",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-031

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "8ef60d2d038aa4a46f8e1e4f4fd48778307c569c6dcd7783d2d00e409763b056",
  "text": "Tern Project would like the following style: Tern Project marks recap items with unresolved owners using `tern-pin`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-project",
    "level": "project"
  },
  "statement": "Tern Project would like the following style: Tern Project marks recap items with unresolved owners using `tern-pin`.",
  "subjectKey": "unresolved-owner-recap-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-032

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "0db2153245aa2c604f1719fc6377080e9397088cc2f19c4fd8efa11a00e621c7",
  "text": "Cedar Team adopted the following option: Cedar Team prepares approved researcher extracts through `cedar-copy`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-team",
    "level": "team"
  },
  "statement": "Cedar Team adopted the following option: Cedar Team prepares approved researcher extracts through `cedar-copy`.",
  "subjectKey": "researcher-extracts",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-033

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "cd5eed1d9c8c03c039f1834449520c4c5f38fa0a34afca0495cac7b7366885ee",
  "text": "Larkspur Circle wants the following channel: Larkspur Circle distributes public-forum recaps with `tern-send`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "larkspur-circle",
    "level": "organization"
  },
  "statement": "Larkspur Circle wants the following channel: Larkspur Circle distributes public-forum recaps with `tern-send`.",
  "subjectKey": "public-forum-recaps",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-034

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "d3270983eed3bab071ec9adf61b190c75b34108de1636ee7c135e5963d46c578",
  "text": "The required step for Comet Team is explicit: Comet Team resolves a confirmed duplicate signal with `comet-close` and links the original case."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-team",
    "level": "team"
  },
  "statement": "The required step for Comet Team is explicit: Comet Team resolves a confirmed duplicate signal with `comet-close` and links the original case.",
  "subjectKey": "duplicate-signals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-035

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "2c4fa4de4adebbfa393d709efa38abad4de29f72de473c81823005f1e169dbc7",
  "text": "The required order for Ember Guild is explicit: Ember Guild creates `comet-page` for incident-exercise records that need a full chronology."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "ember-guild",
    "level": "organization"
  },
  "statement": "The required order for Ember Guild is explicit: Ember Guild creates `comet-page` for incident-exercise records that need a full chronology.",
  "subjectKey": "incident-exercise-records",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-036

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "9970aa0be823f37098c2f0a4479f7b59727f03c9c9a6cc533583ae2c1690b605",
  "text": "Firn Collective requires the following method: Firn Collective attaches `northstar-note` when an invoice enters formal review."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "firn-collective",
    "level": "organization"
  },
  "statement": "Firn Collective requires the following method: Firn Collective attaches `northstar-note` when an invoice enters formal review.",
  "subjectKey": "formal-review",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-037

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "0ec1d21e1f16f8ae4bc8b595b277f29a72339be59a7de5b98cc2f75010b095de",
  "text": "The selection made by the owners of the feedback-bundles workflow is explicit: The feedback-bundles workflow closes consent-withdrawal items with `harbor-close` and sends nothing onward."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "feedback-bundles",
    "level": "workflow"
  },
  "statement": "The selection made by the owners of the feedback-bundles workflow is explicit: The feedback-bundles workflow closes consent-withdrawal items with `harbor-close` and sends nothing onward.",
  "subjectKey": "consent-withdrawal-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-038

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "2091dff5a3d5e1aa04460dfc58eed9f9014de4251fcb4c88fa08e62c56d6c67d",
  "text": "Comet Project requires the next step: Comet Project uses `comet-form` to start newly reported incidents."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-project",
    "level": "project"
  },
  "statement": "Comet Project requires the next step: Comet Project uses `comet-form` to start newly reported incidents.",
  "subjectKey": "newly-reported-incidents",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-039

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "f6943cfb078762c16a8b603fce49cd4f094d1c0a18c185bbea987b558a9ab841",
  "text": "Lantern Project selected the following route: Lantern Project places routine release notices in `lantern-hold` until they are cleared for publication."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-project",
    "level": "project"
  },
  "statement": "Lantern Project selected the following route: Lantern Project places routine release notices in `lantern-hold` until they are cleared for publication.",
  "subjectKey": "routine-release-notices",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-040

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "e2bc63143ce461a671a06db25c84083c5103701b752082c0c3c251dc508eb74d",
  "text": "Tern Team prefers this presentation: Tern Team pins recap items with a near follow-up deadline through `tern-pin`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-team",
    "level": "team"
  },
  "statement": "Tern Team prefers this presentation: Tern Team pins recap items with a near follow-up deadline through `tern-pin`.",
  "subjectKey": "near-follow-up-deadline-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-041

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "0da99daeca0dd6139f3493164b303882d8a276e3e957eec4866b9e590c14a20d",
  "text": "Tern Team wants this approach: Tern Team posts a short quick-sync recap through `tern-note`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-team",
    "level": "team"
  },
  "statement": "Tern Team wants this approach: Tern Team posts a short quick-sync recap through `tern-note`.",
  "subjectKey": "quick-sync-recaps",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-042

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "8f4c0e3c5a8c003652238427c1d8bf82adfa7059bf342f0182d47aa96eebbad6",
  "text": "Juniper Project wants the following channel: Juniper Project wants `juniper-outline` for weekly briefings."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-project",
    "level": "project"
  },
  "statement": "Juniper Project wants the following channel: Juniper Project wants `juniper-outline` for weekly briefings.",
  "subjectKey": "weekly-briefings",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-043

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "0fddb156389efb7ce9fe78e589c2ba98e67a17c572b6e6551f4bb7c86705e49a",
  "text": "A required step for Ember Guild is recorded here: Ember Guild adds `comet-note` when an observer supplies context after intake."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "ember-guild",
    "level": "organization"
  },
  "statement": "A required step for Ember Guild is recorded here: Ember Guild adds `comet-note` when an observer supplies context after intake.",
  "subjectKey": "observer-context",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-044

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "e0a57d668bb054030c5278f797406633ce53c4ed7b1b7019406f0ce807e76efa",
  "text": "The selection made by Lantern Project is explicit: Lantern Project now places routine release notices in `lantern-digest`; this replaces the project holding route."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-project",
    "level": "project"
  },
  "statement": "The selection made by Lantern Project is explicit: Lantern Project now places routine release notices in `lantern-digest`; this replaces the project holding route.",
  "subjectKey": "routine-release-notices",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-06-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "decision",
      "scope": {
        "key": "lantern-project",
        "level": "project"
      },
      "statement": "Lantern Project selected the following route: Lantern Project places routine release notices in `lantern-hold` until they are cleared for publication.",
      "subjectKey": "routine-release-notices",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-06-09T09:00:00Z",
      "id": "PO01",
      "sha256": "f6943cfb078762c16a8b603fce49cd4f094d1c0a18c185bbea987b558a9ab841",
      "text": "Lantern Project selected the following route: Lantern Project places routine release notices in `lantern-hold` until they are cleared for publication."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-045

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "413a750a1261880437e16e46e173601df3a98699db7ac312a613b466c5ad6b49",
  "text": "Participants in the meeting-recaps workflow want this format for the stated case: The meeting-recaps workflow adds an attendee correction with `tern-note`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "meeting-recaps",
    "level": "workflow"
  },
  "statement": "Participants in the meeting-recaps workflow want this format for the stated case: The meeting-recaps workflow adds an attendee correction with `tern-note`.",
  "subjectKey": "attendee-corrections",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-046

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "aee20c6853f247bada951ec72bfdaae21286f497aab0ab9e67dde2b2c7fd0b9d",
  "text": "The incident-intake workflow requires this step before other handling: A severity escalation inside the incident-intake workflow is routed through `comet-queue` immediately."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "incident-intake",
    "level": "workflow"
  },
  "statement": "The incident-intake workflow requires this step before other handling: A severity escalation inside the incident-intake workflow is routed through `comet-queue` immediately.",
  "subjectKey": "severity-escalations",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-047

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "7e6ed15000cedc56b9f775af20c6a32cc1e8fb36104c954856c126c5243b8400",
  "text": "Hollow Tree Co requires this step: Hollow Tree Co records the preflight result with `willow-check` before scheduling a release."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "hollow-tree-co",
    "level": "organization"
  },
  "statement": "Hollow Tree Co requires this step: Hollow Tree Co records the preflight result with `willow-check` before scheduling a release.",
  "subjectKey": "release-preflight-results",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-048

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "d61808be5ed4b3134f9057ec49498a862a8e994b3e8c5b6311caa42fd22525b7",
  "text": "Cedar Project adopted this choice as its current handling: Cedar Project now places approved archive-window requests in `cedar-defer` for scheduled handling, replacing the no-action rule."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-project",
    "level": "project"
  },
  "statement": "Cedar Project adopted this choice as its current handling: Cedar Project now places approved archive-window requests in `cedar-defer` for scheduled handling, replacing the no-action rule.",
  "subjectKey": "approved-archive-window-requests",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-08-08T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "decision",
      "scope": {
        "key": "cedar-project",
        "level": "project"
      },
      "statement": "Cedar Project approved calling no catalog action for approved archive-window requests and explicitly prohibited `cedar-log`.",
      "subjectKey": "approved-archive-window-requests",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-08-08T09:00:00Z",
      "id": "PO01",
      "sha256": "5e78d8a8167416cfd0f959173f2b3c68f939951f6f3f92bfc0b64527519ebc8e",
      "text": "Cedar Project approved calling no catalog action for approved archive-window requests and explicitly prohibited `cedar-log`."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-049

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "5e78d8a8167416cfd0f959173f2b3c68f939951f6f3f92bfc0b64527519ebc8e",
  "text": "Cedar Project approved calling no catalog action for approved archive-window requests and explicitly prohibited `cedar-log`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-project",
    "level": "project"
  },
  "statement": "Cedar Project approved calling no catalog action for approved archive-window requests and explicitly prohibited `cedar-log`.",
  "subjectKey": "approved-archive-window-requests",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-050

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "0f831f7f86eabb6ef75f278f42c8fa66a4b726909fe181e65e6f98f02ad72ef8",
  "text": "The owners of the status-publishing workflow decided that this option should govern: The status-publishing workflow now sends routine updates through `mosaic-feed`, replacing the board placement."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "status-publishing",
    "level": "workflow"
  },
  "statement": "The owners of the status-publishing workflow decided that this option should govern: The status-publishing workflow now sends routine updates through `mosaic-feed`, replacing the board placement.",
  "subjectKey": "routine-status-updates",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-05-10T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "decision",
      "scope": {
        "key": "status-publishing",
        "level": "workflow"
      },
      "statement": "The owners of the status-publishing workflow approved the recorded choice: The status-publishing workflow uses `mosaic-board` for routine updates.",
      "subjectKey": "routine-status-updates",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-05-10T09:00:00Z",
      "id": "PO01",
      "sha256": "b1facc76b1a0d1c0c9cc3919457ce72171400e92860f91fc48fbf9a90ebe4409",
      "text": "The owners of the status-publishing workflow approved the recorded choice: The status-publishing workflow uses `mosaic-board` for routine updates."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-051

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "947fc73242ea8d5911d8367406f18ab3f4f085167be0287362036d0ac251566c",
  "text": "Larkspur Circle would like this handling rather than an alternative: Larkspur Circle sends community-roundtable recaps through `tern-send` after moderation."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "larkspur-circle",
    "level": "organization"
  },
  "statement": "Larkspur Circle would like this handling rather than an alternative: Larkspur Circle sends community-roundtable recaps through `tern-send` after moderation.",
  "subjectKey": "community-roundtable-recaps",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-052

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "8fb88b044a20691204fdd31129ded972ca7eeb1cfb511006fa24efaf65f88bee",
  "text": "Mosaic Project selected this option after review: Mosaic Project posts its milestone snapshot to `mosaic-board` after the Friday review."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-project",
    "level": "project"
  },
  "statement": "Mosaic Project selected this option after review: Mosaic Project posts its milestone snapshot to `mosaic-board` after the Friday review.",
  "subjectKey": "milestone-snapshot",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-053

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "9198f566095470aaec6a64c5c91c855ab9558d919027071e5c6efefabfd076f6",
  "text": "Juniper Project prefers to use this option: Juniper Project preserves a field observation as `juniper-note` when wording matters."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-project",
    "level": "project"
  },
  "statement": "Juniper Project prefers to use this option: Juniper Project preserves a field observation as `juniper-note` when wording matters.",
  "subjectKey": "field-observations",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-054

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "ca3502a3f1114286f67f8bbc2aedde76d7f8e6edd6cba73866be17615971399e",
  "text": "Northstar Project sets a prerequisite before continuing: Northstar Project applies `northstar-flag` when billed goods arrived only in part."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-project",
    "level": "project"
  },
  "statement": "Northstar Project sets a prerequisite before continuing: Northstar Project applies `northstar-flag` when billed goods arrived only in part.",
  "subjectKey": "billed-goods-in-part",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-055

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "9fb563b314b078e8edd0daa5120af36b2cdc33cc7c3c6a7c89b97c9e82130ae5",
  "text": "Acorn Cooperative selected this option after review: Acorn Cooperative records translation requests for release copy with `lantern-log` before assigning them."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "acorn-cooperative",
    "level": "organization"
  },
  "statement": "Acorn Cooperative selected this option after review: Acorn Cooperative records translation requests for release copy with `lantern-log` before assigning them.",
  "subjectKey": "release-copy-translation-requests",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-056

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "687ca84c83dfd36484a0f425c359034a6b054f704c88dbd4ada51de5c23ab4be",
  "text": "Mosaic Team approved this choice: Mosaic Team keeps blocked-work summaries visible with `mosaic-pin` until an owner responds."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-team",
    "level": "team"
  },
  "statement": "Mosaic Team approved this choice: Mosaic Team keeps blocked-work summaries visible with `mosaic-pin` until an owner responds.",
  "subjectKey": "blocked-work-summaries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-057

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "a3a4ce677d63c70669b47abaea1a32434ef8675a2dd11e6ce91284cda3a964a5",
  "text": "The release-signoff workflow requires the stated sequence: The release-signoff workflow captures a reviewer comment through `willow-note`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "release-signoff",
    "level": "workflow"
  },
  "statement": "The release-signoff workflow requires the stated sequence: The release-signoff workflow captures a reviewer comment through `willow-note`.",
  "subjectKey": "reviewer-comments",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-058

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "fd27b2b53b8932f808ea5bd7bf59dd8c3d138c841416a85471e1baf9a83f3252",
  "text": "Bluefin Studio adopted this choice as its current handling: Bluefin Studio attaches a `harbor-note` to facilitator follow-up items that need a written answer."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "bluefin-studio",
    "level": "organization"
  },
  "statement": "Bluefin Studio adopted this choice as its current handling: Bluefin Studio attaches a `harbor-note` to facilitator follow-up items that need a written answer.",
  "subjectKey": "facilitator-follow-up-items",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-059

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "3243346a1d28d3a0c657d84826e7be6f594900774589de4d65f9c6fbc8749610",
  "text": "Juniper Team would like this behavior: Juniper Team formats side-by-side metric comparisons with `juniper-table`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-team",
    "level": "team"
  },
  "statement": "Juniper Team would like this behavior: Juniper Team formats side-by-side metric comparisons with `juniper-table`.",
  "subjectKey": "metric-comparisons",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-060

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "f8a1298b9679aca0a78e3c5d77629e82fb10e90d1ca4766bb173875b41210853",
  "text": "Marigold Team prefers this presentation: Marigold Team leaves visuals with incomplete data in `marigold-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-team",
    "level": "team"
  },
  "statement": "Marigold Team prefers this presentation: Marigold Team leaves visuals with incomplete data in `marigold-hold`.",
  "subjectKey": "incomplete-data-visuals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-061

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "eeb05d15bd2bf92e5e48d8e3426b91180f2310c8c70aa143ae7a9eee5ddbfced",
  "text": "Jasmere Group prefers this current handling: Jasmere Group compiles non-urgent weekly changes in `solstice-digest`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "jasmere-group",
    "level": "organization"
  },
  "statement": "Jasmere Group prefers this current handling: Jasmere Group compiles non-urgent weekly changes in `solstice-digest`.",
  "subjectKey": "non-urgent-weekly-changes",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-062

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "5e567c8e3445182d596f799cee166a6ced6594bf4496095ef4bd84242c435a95",
  "text": "Larkspur Circle prefers to handle this case as follows: Larkspur Circle posts routine meeting recaps with `tern-note`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "larkspur-circle",
    "level": "organization"
  },
  "statement": "Larkspur Circle prefers to handle this case as follows: Larkspur Circle posts routine meeting recaps with `tern-note`.",
  "subjectKey": "routine-meeting-recaps",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-063

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "a8dea1c6402ecee5e3826fd2eedf762c2c43779a79cb70ffbbd44fe85eb1e3a8",
  "text": "Driftwood Labs selected the following route: Driftwood Labs tracks catalogue corrections in `cedar-log` with the original shelf code."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "driftwood-labs",
    "level": "organization"
  },
  "statement": "Driftwood Labs selected the following route: Driftwood Labs tracks catalogue corrections in `cedar-log` with the original shelf code.",
  "subjectKey": "catalogue-corrections",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-064

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "6b9a304c432b1c113a652f2459a6163f38f70b84fef81ba3750b8105a44f39aa",
  "text": "Islet Network wants this approach: Islet Network shows quarterly funding snapshots with `juniper-table` so totals align by program."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "islet-network",
    "level": "organization"
  },
  "statement": "Islet Network wants this approach: Islet Network shows quarterly funding snapshots with `juniper-table` so totals align by program.",
  "subjectKey": "quarterly-funding-snapshots",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-065

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "a663a33ba919635f5c3d7d9613027372c85d052ca4ccb8aea05a0f64e1ebf38c",
  "text": "Cedar Team selected this option after review: Cedar Team makes a `cedar-copy` of a damaged index before restoration work starts."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-team",
    "level": "team"
  },
  "statement": "Cedar Team selected this option after review: Cedar Team makes a `cedar-copy` of a damaged index before restoration work starts.",
  "subjectKey": "damaged-indexes",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-066

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "3078ea1edc40eb1ccb6e297f1eedda526647410ebce15dbcc2eda8505df02d67",
  "text": "Driftwood Labs approved this choice: Driftwood Labs opens confirmed reading-room appointments with `cedar-unlock` at the scheduled time."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "driftwood-labs",
    "level": "organization"
  },
  "statement": "Driftwood Labs approved this choice: Driftwood Labs opens confirmed reading-room appointments with `cedar-unlock` at the scheduled time.",
  "subjectKey": "reading-room-appointments",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-067

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "5d014d8f5a945e040e15a4d9de9606093f148e9e9765bbc1f8ee3eb257eaa81f",
  "text": "Cobalt Works approved the stated rule: Cobalt Works sends maintenance advisories to `mosaic-feed` rather than the planning board."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cobalt-works",
    "level": "organization"
  },
  "statement": "Cobalt Works approved the stated rule: Cobalt Works sends maintenance advisories to `mosaic-feed` rather than the planning board.",
  "subjectKey": "maintenance-advisories",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-068

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "7cfb567813da23531cb290f954dc39907a90565a8fc1528df2042c78377ab071",
  "text": "Participants in the meeting-recaps workflow would like this format rather than an alternative: The meeting-recaps workflow puts cancelled-meeting placeholders in `tern-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "meeting-recaps",
    "level": "workflow"
  },
  "statement": "Participants in the meeting-recaps workflow would like this format rather than an alternative: The meeting-recaps workflow puts cancelled-meeting placeholders in `tern-hold`.",
  "subjectKey": "cancelled-meeting-placeholders",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-069

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "02322cfb272aceb2f27134a0de2a372872d8028b60978a2e1859bfec72fdeed8",
  "text": "Larkspur Circle prefers this handling: Larkspur Circle stores confidential-session summaries with `tern-file` instead of sending them."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "larkspur-circle",
    "level": "organization"
  },
  "statement": "Larkspur Circle prefers this handling: Larkspur Circle stores confidential-session summaries with `tern-file` instead of sending them.",
  "subjectKey": "confidential-session-summaries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-070

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "9e388a62ba723f931965702e4f57561e6ef3c5645fee82a3689aa202ed498509",
  "text": "The owners of the archive-window workflow approved the recorded choice: The archive-window workflow sends `cedar-notify` when two visitors request the same slot."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "archive-window",
    "level": "workflow"
  },
  "statement": "The owners of the archive-window workflow approved the recorded choice: The archive-window workflow sends `cedar-notify` when two visitors request the same slot.",
  "subjectKey": "same-slot-requests",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-071

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "4406491cb2adf239250dd5b1477f6447186decc62980e7b8b79a9a0b6cd078ab",
  "text": "Lantern Project decided on this rule: Lantern Project keeps legal signoff summaries in `lantern-hold` while counsel is still reviewing them."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-project",
    "level": "project"
  },
  "statement": "Lantern Project decided on this rule: Lantern Project keeps legal signoff summaries in `lantern-hold` while counsel is still reviewing them.",
  "subjectKey": "legal-signoff-summaries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-072

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "30634f81039d7eff3c8016615f63ae1e3216cea7176bb8e1ccb445deeba58af2",
  "text": "Harborview Team approved this handling: Responses about accessibility from Harborview Team are retained through `harbor-file`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-team",
    "level": "team"
  },
  "statement": "Harborview Team approved this handling: Responses about accessibility from Harborview Team are retained through `harbor-file`.",
  "subjectKey": "accessibility-responses",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-073

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "91b00ea5ab73cd9ca32875ce1abab98a9bc037cc56d871bf564ffd0c00afd53b",
  "text": "The asset-handoff workflow requires this order of work: The asset-handoff workflow moves an incomplete upload to `seabird-hold` until all parts arrive."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "asset-handoff",
    "level": "workflow"
  },
  "statement": "The asset-handoff workflow requires this order of work: The asset-handoff workflow moves an incomplete upload to `seabird-hold` until all parts arrive.",
  "subjectKey": "incomplete-uploads",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-074

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "efc47926afab4a446270d4ac7163ee474ca0eac61ae26f066d1a0bb50e8f1560",
  "text": "Seabird Project requires the following method: Seabird Project records each asset license in `seabird-index`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-project",
    "level": "project"
  },
  "statement": "Seabird Project requires the following method: Seabird Project records each asset license in `seabird-index`.",
  "subjectKey": "asset-licenses",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-075

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "caf19729ac4b77b5d6cdff4371ba56e3ebc2a80440f8008bf7e393466597695a",
  "text": "Kiteframe Alliance wants the following channel: Kiteframe Alliance uses `marigold-slate` for neutral baseline diagrams."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "kiteframe-alliance",
    "level": "organization"
  },
  "statement": "Kiteframe Alliance wants the following channel: Kiteframe Alliance uses `marigold-slate` for neutral baseline diagrams.",
  "subjectKey": "neutral-baseline-diagrams",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-076

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "63955d16b347ff7fe269f68d7b704f2a671dd83d8bd3de2b9ec53140225b387e",
  "text": "The required step for Willow Project is explicit: Willow Project stores a completed approval sheet through `willow-file`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-project",
    "level": "project"
  },
  "statement": "The required step for Willow Project is explicit: Willow Project stores a completed approval sheet through `willow-file`.",
  "subjectKey": "completed-approval-sheets",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-077

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "c8687933762cbb7604dbc6ef3db485600f3f33cfe3c9a2ca6a74b7dc3b874553",
  "text": "Solstice Project prefers to use this option: Solstice Project keeps draft announcements in `solstice-hold` until wording is approved."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-project",
    "level": "project"
  },
  "statement": "Solstice Project prefers to use this option: Solstice Project keeps draft announcements in `solstice-hold` until wording is approved.",
  "subjectKey": "draft-announcements",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-078

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "ea4472c5a7bcd234fdc981c8e4b5086c493ffaf1cad4feb27a407fdbcc13c36c",
  "text": "Cedar Project adopted this handling for the stated case: Cedar Project moves uncertain rights-review requests to `cedar-defer` pending counsel."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cedar-project",
    "level": "project"
  },
  "statement": "Cedar Project adopted this handling for the stated case: Cedar Project moves uncertain rights-review requests to `cedar-defer` pending counsel.",
  "subjectKey": "rights-review-requests",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-079

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "1502b5748e33f8d9d540cfc3ec215216143af9986ed24e013ea6195f2e8d32f5",
  "text": "The required step for Seabird Team is explicit: The opening step for a standard Seabird Team asset handoff uses `seabird-index`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-team",
    "level": "team"
  },
  "statement": "The required step for Seabird Team is explicit: The opening step for a standard Seabird Team asset handoff uses `seabird-index`.",
  "subjectKey": "asset-handoff-opening-step",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-080

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "f6644d1287a669f98c0ee392d1c8351e3ccf99733691c558c8f85d5c8399f209",
  "text": "The required order for Seabird Team is explicit: Seabird Team packages editable source bundles with `seabird-pack` after the license check."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-team",
    "level": "team"
  },
  "statement": "The required order for Seabird Team is explicit: Seabird Team packages editable source bundles with `seabird-pack` after the license check.",
  "subjectKey": "editable-source-bundles",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-081

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "f65853bba77c333722b30d89903c8602b6a4204e1a9c8e322be4998f5461b6d0",
  "text": "Marigold Team prefers this handling: Marigold Team renders accessibility proofs with `marigold-mono` to check shape and contrast."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-team",
    "level": "team"
  },
  "statement": "Marigold Team prefers this handling: Marigold Team renders accessibility proofs with `marigold-mono` to check shape and contrast.",
  "subjectKey": "accessibility-proofs",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-082

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "e2a80587eda877c1395e2afb902e70dca4247f817a36cfd341fc7705d326e4be",
  "text": "Hollow Tree Co requires this step before other handling: Hollow Tree Co runs `willow-check` to confirm rollback readiness before launch."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "hollow-tree-co",
    "level": "organization"
  },
  "statement": "Hollow Tree Co requires this step before other handling: Hollow Tree Co runs `willow-check` to confirm rollback readiness before launch.",
  "subjectKey": "rollback-readiness-checks",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-083

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "65ec2dbbb2d40284122d94b20a17e9126eb2da0cdf5487ee648c00757c80d6bc",
  "text": "Willow Project requires an omission step when release signoff begins: do not call `willow-hold`, and call no catalog action."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-project",
    "level": "project"
  },
  "statement": "Willow Project requires an omission step when release signoff begins: do not call `willow-hold`, and call no catalog action.",
  "subjectKey": "release-signoff",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-084

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "f57d06d193fa8aec3d14055a5d544818c9e87922fe422933d69cde2e6d8da22f",
  "text": "The selection made by the owners of the status-publishing workflow is explicit: The status-publishing workflow collects review highlights in `mosaic-brief` before circulation."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "status-publishing",
    "level": "workflow"
  },
  "statement": "The selection made by the owners of the status-publishing workflow is explicit: The status-publishing workflow collects review highlights in `mosaic-brief` before circulation.",
  "subjectKey": "review-highlights",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-085

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "17fd2e65c168db3861a51c0f78fce86f623d5f86b3a7d6c49df74010a8bbc94b",
  "text": "A required step for Seabird Team is recorded here: Seabird Team moves an approved master into `seabird-transfer` for the recipient."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-team",
    "level": "team"
  },
  "statement": "A required step for Seabird Team is recorded here: Seabird Team moves an approved master into `seabird-transfer` for the recipient.",
  "subjectKey": "approved-masters",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-086

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "229c42194175e102de06e9d376055768ac1bc1ab0c2f5f96d355062763de7f16",
  "text": "Marigold Project would like this behavior: Marigold Project colors launch-summary visuals with `marigold-coral`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-project",
    "level": "project"
  },
  "statement": "Marigold Project would like this behavior: Marigold Project colors launch-summary visuals with `marigold-coral`.",
  "subjectKey": "launch-summary-visuals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-087

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "47253a1b8bb3e3fc6f57c004cc0c3214f4854c73072cb57534b67fae371fdbcb",
  "text": "Participants in the morning-updates workflow want this format for the stated case: The morning-updates workflow uses `solstice-note` when an update needs a supporting link."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "morning-updates",
    "level": "workflow"
  },
  "statement": "Participants in the morning-updates workflow want this format for the stated case: The morning-updates workflow uses `solstice-note` when an update needs a supporting link.",
  "subjectKey": "supporting-links",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-088

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "e806d8f0fd7aaad8073489b1fc0be15a6c310f56d7f7e150ee3c365989790dd8",
  "text": "The owners of the release-notices workflow approved the recorded choice: The release-notices workflow publishes urgent wording corrections through `lantern-bulletin`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "release-notices",
    "level": "workflow"
  },
  "statement": "The owners of the release-notices workflow approved the recorded choice: The release-notices workflow publishes urgent wording corrections through `lantern-bulletin`.",
  "subjectKey": "urgent-wording-corrections",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-089

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "4ceddae1bcb33ddf0199104bf4a382b01d4b24a0f6b50a5ec025209a2b233113",
  "text": "The asset-handoff workflow sets a prerequisite before continuing: The opening step in the asset-handoff workflow uses `seabird-pack`, replacing the note-first opening step."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "asset-handoff",
    "level": "workflow"
  },
  "statement": "The asset-handoff workflow sets a prerequisite before continuing: The opening step in the asset-handoff workflow uses `seabird-pack`, replacing the note-first opening step.",
  "subjectKey": "asset-handoff-opening-step",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-05-10T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "procedure",
      "scope": {
        "key": "asset-handoff",
        "level": "workflow"
      },
      "statement": "The asset-handoff workflow uses a required method here: The opening step in the asset-handoff workflow uses `seabird-note` to capture the recipient and purpose before any move.",
      "subjectKey": "asset-handoff-opening-step",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-05-10T09:00:00Z",
      "id": "PO01",
      "sha256": "032861fa963b0645edc6a90d55a4f163ca624dd184a4074437adebf6722c2ad4",
      "text": "The asset-handoff workflow uses a required method here: The opening step in the asset-handoff workflow uses `seabird-note` to capture the recipient and purpose before any move."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-090

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "d80780b682155b9420273c5d75ea395abdb63d933633136e092f970eb63e1e83",
  "text": "Harborview Project decided that this option should govern: Harborview Project uses `harbor-tag` to mark interview excerpts that still need coding."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-project",
    "level": "project"
  },
  "statement": "Harborview Project decided that this option should govern: Harborview Project uses `harbor-tag` to mark interview excerpts that still need coding.",
  "subjectKey": "interview-excerpts-coding",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-091

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "e3fe6563d80d857ee9a5bfdadeb2bb8f19be16706c909e8f9fbf947316feb539",
  "text": "A required step for Willow Team is recorded here: Willow Team keeps a release with a failed smoke check in `willow-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-team",
    "level": "team"
  },
  "statement": "A required step for Willow Team is recorded here: Willow Team keeps a release with a failed smoke check in `willow-hold`.",
  "subjectKey": "failed-smoke-check-releases",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-092

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "c040c0ec54def6ee8c432adb155ba0e917cda12c80117445d952944ec9fa12a6",
  "text": "Participants in the morning-updates workflow would like this format rather than an alternative: The morning-updates workflow collects overnight changes in `solstice-digest`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "morning-updates",
    "level": "workflow"
  },
  "statement": "Participants in the morning-updates workflow would like this format rather than an alternative: The morning-updates workflow collects overnight changes in `solstice-digest`.",
  "subjectKey": "overnight-changes",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-093

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "fd58e63082d6818d4f5fffb7c97f99c335bc2fc91ed89be712738213b3d4c762",
  "text": "Gannet House requires the next step: Gannet House adds `seabird-note` when a shared template has an unusual origin."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "gannet-house",
    "level": "organization"
  },
  "statement": "Gannet House requires the next step: Gannet House adds `seabird-note` when a shared template has an unusual origin.",
  "subjectKey": "unusual-template-origins",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-094

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "f5abfeb25b948d5022ad480fdd4f564256566f11d890f872698456a6d20eaa89",
  "text": "Participants in the chart-styling workflow want this format for the stated case: The chart-styling workflow uses `marigold-slate` for comparison grids with many categories."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "chart-styling",
    "level": "workflow"
  },
  "statement": "Participants in the chart-styling workflow want this format for the stated case: The chart-styling workflow uses `marigold-slate` for comparison grids with many categories.",
  "subjectKey": "many-category-comparison-grids",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-095

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "1525846d3fbb322172be6666b40548e3659757443f6b596937744223fac890cb",
  "text": "The required step for Northstar Team is explicit: Northstar Team sends a confirmed duplicate invoice back through `northstar-return`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-team",
    "level": "team"
  },
  "statement": "The required step for Northstar Team is explicit: Northstar Team sends a confirmed duplicate invoice back through `northstar-return`.",
  "subjectKey": "duplicate-invoices",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-096

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "d2651ef6d0f7f1d1aab81c12e0ea5f5ff0d4e859137f75afee68cb2f31179622",
  "text": "Bluefin Studio approved this choice: Bluefin Studio files duplicate feedback submissions with `harbor-file` so the original remains easy to find."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "bluefin-studio",
    "level": "organization"
  },
  "statement": "Bluefin Studio approved this choice: Bluefin Studio files duplicate feedback submissions with `harbor-file` so the original remains easy to find.",
  "subjectKey": "duplicate-feedback-submissions",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-097

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "ccf0ce30dcabe4d3bbf5b76fa054cd65bb6d4cd50569d61d19a9d5aaa8df6af2",
  "text": "Comet Team requires this method: Comet Team closes a verified false alarm through `comet-close` after documenting the check."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-team",
    "level": "team"
  },
  "statement": "Comet Team requires this method: Comet Team closes a verified false alarm through `comet-close` after documenting the check.",
  "subjectKey": "false-alarms",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-098

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "dcd024ae274c61b874f7384aed83564e1f86d3274ad87466728abb556ecb8f0e",
  "text": "The invoice-review workflow uses a required method here: The invoice-review workflow adds `northstar-note` when a reviewer explains a non-obvious exception."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "invoice-review",
    "level": "workflow"
  },
  "statement": "The invoice-review workflow uses a required method here: The invoice-review workflow adds `northstar-note` when a reviewer explains a non-obvious exception.",
  "subjectKey": "reviewer-exception",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-099

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "1c3da4d9ab585a0e467842429e5a6bf320f72f1044b83f93ad532598e732b378",
  "text": "Seabird Project requires this method: Seabird Project keeps an asset with no thumbnail in `seabird-hold` until preview generation succeeds."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-project",
    "level": "project"
  },
  "statement": "Seabird Project requires this method: Seabird Project keeps an asset with no thumbnail in `seabird-hold` until preview generation succeeds.",
  "subjectKey": "assets-no-thumbnail",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-100

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "e202f07e4fde40f112e27d1960522925b5181fb7f70d12082f22cf1ff0569ac7",
  "text": "Participants in the chart-styling workflow prefer this format: Participants in the chart-styling workflow prefer `marigold-indigo` for routine analytical charts."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "chart-styling",
    "level": "workflow"
  },
  "statement": "Participants in the chart-styling workflow prefer this format: Participants in the chart-styling workflow prefer `marigold-indigo` for routine analytical charts.",
  "subjectKey": "routine-analytical-charts",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-101

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "92f319ea0819307bc93111b442171bf9fa27747752c6f7939c165cc9fe27de7c",
  "text": "Lantern Project decided that this option should govern: For Lantern Project, screenshot approvals are recorded in `lantern-log` with the reviewer date."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-project",
    "level": "project"
  },
  "statement": "Lantern Project decided that this option should govern: For Lantern Project, screenshot approvals are recorded in `lantern-log` with the reviewer date.",
  "subjectKey": "screenshot-approvals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-102

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "ae2e109ac4aa3fd5022ef8c79bc2ec532b1ded25821c4d72f2c6f02a541e0471",
  "text": "Willow Team requires the following method: Willow Team moves a release with unfinished localization to `willow-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-team",
    "level": "team"
  },
  "statement": "Willow Team requires the following method: Willow Team moves a release with unfinished localization to `willow-hold`.",
  "subjectKey": "unfinished-localization-releases",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-103

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "82b37f882261aff7e9e75fd9fded43e587c73ce550f878eef5bd760a758d79b1",
  "text": "Participants in the chart-styling workflow prefer to handle this case as follows: The chart-styling workflow highlights warning series with `marigold-coral`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "chart-styling",
    "level": "workflow"
  },
  "statement": "Participants in the chart-styling workflow prefer to handle this case as follows: The chart-styling workflow highlights warning series with `marigold-coral`.",
  "subjectKey": "warning-series",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-104

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "fb85d83311260538c94b5280ad13e382f43ef86a29753bf8d0438aea5e1c422f",
  "text": "Juniper Project wants this format for the stated case: Juniper Project now renders weekly briefings with `juniper-table`, replacing the outline layout."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-project",
    "level": "project"
  },
  "statement": "Juniper Project wants this format for the stated case: Juniper Project now renders weekly briefings with `juniper-table`, replacing the outline layout.",
  "subjectKey": "weekly-briefings",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-06-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "preference",
      "scope": {
        "key": "juniper-project",
        "level": "project"
      },
      "statement": "Juniper Project wants the following channel: Juniper Project wants `juniper-outline` for weekly briefings.",
      "subjectKey": "weekly-briefings",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-06-09T09:00:00Z",
      "id": "PO01",
      "sha256": "8f4c0e3c5a8c003652238427c1d8bf82adfa7059bf342f0182d47aa96eebbad6",
      "text": "Juniper Project wants the following channel: Juniper Project wants `juniper-outline` for weekly briefings."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-105

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "69b875041cb0a0e0a424a198bd69dbcc34d4a49e7211b1f41dcc547eb802ee6a",
  "text": "Jasmere Group prefers this handling: Jasmere Group sends an urgent office-closure update through `solstice-ping`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "jasmere-group",
    "level": "organization"
  },
  "statement": "Jasmere Group prefers this handling: Jasmere Group sends an urgent office-closure update through `solstice-ping`.",
  "subjectKey": "urgent-office-closure-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-106

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "569e876b8579e039a500fafcf7bbee53ecf44630ca898349bb6528fcd48520ee",
  "text": "Participants in the weekly-briefing workflow would like this format rather than an alternative: The weekly-briefing workflow presents team wins with `juniper-cards`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "weekly-briefing",
    "level": "workflow"
  },
  "statement": "Participants in the weekly-briefing workflow would like this format rather than an alternative: The weekly-briefing workflow presents team wins with `juniper-cards`.",
  "subjectKey": "team-wins",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-107

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "1f46b8e005b00f3d5146f4a39db56563ddd0a89b0ae0b3f608a2a6680e6429af",
  "text": "Acorn Cooperative approved this choice: Across Acorn Cooperative, routine release notices are published with `lantern-bulletin`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "acorn-cooperative",
    "level": "organization"
  },
  "statement": "Acorn Cooperative approved this choice: Across Acorn Cooperative, routine release notices are published with `lantern-bulletin`.",
  "subjectKey": "routine-release-notices",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-108

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "fb43e5de25fb38bb80d7db9f2bfd21f2e35127431875e9a54574b7ff5523e305",
  "text": "Marigold Team would like the following style: Marigold Team styles routine analytical charts with `marigold-mono`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-team",
    "level": "team"
  },
  "statement": "Marigold Team would like the following style: Marigold Team styles routine analytical charts with `marigold-mono`.",
  "subjectKey": "routine-analytical-charts",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-109

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "c2b75fbf9bb0d51bee4655e4a714d50dcaf90829d944111f32d23b3465c15e9d",
  "text": "Ember Guild requires this step: Across Ember Guild, a newly reported incident starts with `comet-page` in the response book."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "ember-guild",
    "level": "organization"
  },
  "statement": "Ember Guild requires this step: Across Ember Guild, a newly reported incident starts with `comet-page` in the response book.",
  "subjectKey": "newly-reported-incidents",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-110

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "30584db5cf6912e170b550bbfda5ef47db30193ee9d51071b2fad5cd6355e8de",
  "text": "Solstice Team would like the following style: Solstice Team posts non-urgent calendar reminders with `solstice-note`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-team",
    "level": "team"
  },
  "statement": "Solstice Team would like the following style: Solstice Team posts non-urgent calendar reminders with `solstice-note`.",
  "subjectKey": "non-urgent-calendar-reminders",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-111

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "779b1bd8d7ba8d5f925ee682bfe9fe2ddc440db1ec4feda11011bc4d76ae5785",
  "text": "Juniper Project prefers to handle this case as follows: Juniper Project sends unanswered research questions to `juniper-defer` until owners respond."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "juniper-project",
    "level": "project"
  },
  "statement": "Juniper Project prefers to handle this case as follows: Juniper Project sends unanswered research questions to `juniper-defer` until owners respond.",
  "subjectKey": "unanswered-research-questions",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-112

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "8810c9c09ad9aaf17c756fbdac25727f67b64412f75c577b87cb542f402066c3",
  "text": "Hollow Tree Co requires this order of work: Hollow Tree Co places a release in `willow-hold` when signoff work begins."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "hollow-tree-co",
    "level": "organization"
  },
  "statement": "Hollow Tree Co requires this order of work: Hollow Tree Co places a release in `willow-hold` when signoff work begins.",
  "subjectKey": "release-signoff",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-113

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "1ca331550a9d7f308e64f0b720e1e501be1962b7ed31d0de2fb84c1090136e95",
  "text": "Mosaic Team adopted this choice as its current handling: Mosaic Team puts updates with unverified metrics in `mosaic-archive` until the figures are corrected."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "mosaic-team",
    "level": "team"
  },
  "statement": "Mosaic Team adopted this choice as its current handling: Mosaic Team puts updates with unverified metrics in `mosaic-archive` until the figures are corrected.",
  "subjectKey": "unverified-metric-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-114

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "720efcc2fb2625c98cf37e0c6dcb3ccbef134fef74689c227fbea39e6cbbb155",
  "text": "Acorn Cooperative adopted this choice as its current handling: Acorn Cooperative sends partner-preview invitations through `lantern-relay`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "acorn-cooperative",
    "level": "organization"
  },
  "statement": "Acorn Cooperative adopted this choice as its current handling: Acorn Cooperative sends partner-preview invitations through `lantern-relay`.",
  "subjectKey": "partner-preview-invitations",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-115

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "c96eaf3619dd52fe1363d462a6eb3421333f1f8b344e507db59143e851f6b327",
  "text": "Comet Project sets a prerequisite before continuing: Comet Project records a changed recovery owner with `comet-note` on the open incident."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "comet-project",
    "level": "project"
  },
  "statement": "Comet Project sets a prerequisite before continuing: Comet Project records a changed recovery owner with `comet-note` on the open incident.",
  "subjectKey": "changed-recovery-owner",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-116

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "1246d9b5ab162a7e68f6e8b42ff958c984f40abbed70583ec521eba904797ee4",
  "text": "Acorn Cooperative adopted the following option: At Acorn Cooperative, the quarterly changelog index is assembled in `lantern-digest`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "acorn-cooperative",
    "level": "organization"
  },
  "statement": "Acorn Cooperative adopted the following option: At Acorn Cooperative, the quarterly changelog index is assembled in `lantern-digest`.",
  "subjectKey": "quarterly-changelog-index",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-117

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "c3228d95b5cf8b95f8a9c4e119b5a729ccb623bcb26cd587a563fafecb2fa370",
  "text": "Kiteframe Alliance would like this handling rather than an alternative: Kiteframe Alliance prepares print-handout visuals with `marigold-mono`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "kiteframe-alliance",
    "level": "organization"
  },
  "statement": "Kiteframe Alliance would like this handling rather than an alternative: Kiteframe Alliance prepares print-handout visuals with `marigold-mono`.",
  "subjectKey": "print-handout-visuals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-118

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "e0a6d3e09150b76dcaf5124127eb1605fb208da0a5e5ae3500b562f912d97144",
  "text": "Solstice Project prefers to handle this case as follows: Solstice Project places updates with an unconfirmed date in `solstice-hold`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-project",
    "level": "project"
  },
  "statement": "Solstice Project prefers to handle this case as follows: Solstice Project places updates with an unconfirmed date in `solstice-hold`.",
  "subjectKey": "unconfirmed-date-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-119

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "cddaeedae503a9903026944c8473eac1c47fcd7c0a6eb8da37b98836b394e357",
  "text": "Northstar Team requires this method: Northstar Team returns an invoice with no matching order through `northstar-return`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-team",
    "level": "team"
  },
  "statement": "Northstar Team requires this method: Northstar Team returns an invoice with no matching order through `northstar-return`.",
  "subjectKey": "invoices-no-matching-order",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-120

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "61ba17321036ea6950ed0ccb84def3bc014a520114ea802338a5d8be2ef0b24b",
  "text": "Cobalt Works selected the following route: Cobalt Works compiles the monthly leadership summary with `mosaic-brief`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "cobalt-works",
    "level": "organization"
  },
  "statement": "Cobalt Works selected the following route: Cobalt Works compiles the monthly leadership summary with `mosaic-brief`.",
  "subjectKey": "monthly-leadership-summary",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-121

### Bound observation

```json
{
  "authoredAt": "2025-03-11T09:00:00Z",
  "id": "O01",
  "sha256": "7f1566f1de18a7211ff713f79ccdbf6e5b82ca1819ca8275a740c9c882661cc0",
  "text": "Lantern Team adopted this handling for the stated case: When Lantern Team schedules a launch rehearsal, the reminder travels through `lantern-relay`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-03-11T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-team",
    "level": "team"
  },
  "statement": "Lantern Team adopted this handling for the stated case: When Lantern Team schedules a launch rehearsal, the reminder travels through `lantern-relay`.",
  "subjectKey": "launch-rehearsal-reminders",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-122

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "bd4e1ced4fef2bdc47f4e7b9359f0a9466ea02587b140938191f26d4e40633aa",
  "text": "Participants in the weekly-briefing workflow would like this handling rather than an alternative: The weekly-briefing workflow puts an unfinished appendix in `juniper-defer`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "weekly-briefing",
    "level": "workflow"
  },
  "statement": "Participants in the weekly-briefing workflow would like this handling rather than an alternative: The weekly-briefing workflow puts an unfinished appendix in `juniper-defer`.",
  "subjectKey": "unfinished-appendix",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-123

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "cc9ed5a203c2ca383107c0955d27346d26548678ae21a56e54d06becbfb94393",
  "text": "Islet Network prefers this current handling: Islet Network displays program highlights through `juniper-cards`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "islet-network",
    "level": "organization"
  },
  "statement": "Islet Network prefers this current handling: Islet Network displays program highlights through `juniper-cards`.",
  "subjectKey": "program-highlights",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-124

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "0c8dbfed8058530d2df388bed0838f857e4d1315260254dff7f6127691a7bc1d",
  "text": "Northstar Team requires an omission step when formal review begins: do not call `northstar-note`, and call no catalog action."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-team",
    "level": "team"
  },
  "statement": "Northstar Team requires an omission step when formal review begins: do not call `northstar-note`, and call no catalog action.",
  "subjectKey": "formal-review",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-125

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "9cc7688047f32936a71ad0537ba7d5f62baf16a18f3dd6dbbe6ea40434864e1a",
  "text": "Driftwood Labs approved the stated rule: Driftwood Labs creates a `cedar-copy` before lending a fragile finding aid."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "driftwood-labs",
    "level": "organization"
  },
  "statement": "Driftwood Labs approved the stated rule: Driftwood Labs creates a `cedar-copy` before lending a fragile finding aid.",
  "subjectKey": "fragile-finding-aids",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-126

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "ba4fe8f9e9e34a37bd9d90fee59cf8168f6908195716aab10cc9d5a0628a9626",
  "text": "The required order for Willow Project is explicit: Willow Project now files the release sheet with `willow-file` when signoff work begins, replacing the no-action step."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-project",
    "level": "project"
  },
  "statement": "The required order for Willow Project is explicit: Willow Project now files the release sheet with `willow-file` when signoff work begins, replacing the no-action step.",
  "subjectKey": "release-signoff",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-08-08T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "procedure",
      "scope": {
        "key": "willow-project",
        "level": "project"
      },
      "statement": "Willow Project requires an omission step when release signoff begins: do not call `willow-hold`, and call no catalog action.",
      "subjectKey": "release-signoff",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-08-08T09:00:00Z",
      "id": "PO01",
      "sha256": "65ec2dbbb2d40284122d94b20a17e9126eb2da0cdf5487ee648c00757c80d6bc",
      "text": "Willow Project requires an omission step when release signoff begins: do not call `willow-hold`, and call no catalog action."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-127

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "94d6de955ede831e68f8caa85c1bf735a851620664aee752a0a95194423a3662",
  "text": "Firn Collective requires this step: Firn Collective files a received tax certificate with `northstar-file` beside its invoice."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "firn-collective",
    "level": "organization"
  },
  "statement": "Firn Collective requires this step: Firn Collective files a received tax certificate with `northstar-file` beside its invoice.",
  "subjectKey": "tax-certificates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-128

### Bound observation

```json
{
  "authoredAt": "2025-01-10T09:00:00Z",
  "id": "O01",
  "sha256": "06d8433c08b2e21083426a62f8c5eb01882c8576824b5f8320fa8f6c81f11a46",
  "text": "Seabird Team requires this step: Seabird Team packages licensed font files with `seabird-pack` before external delivery."
}
```

### Claim

```json
{
  "effectiveAt": "2025-01-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "seabird-team",
    "level": "team"
  },
  "statement": "Seabird Team requires this step: Seabird Team packages licensed font files with `seabird-pack` before external delivery.",
  "subjectKey": "licensed-font-files",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-129

### Bound observation

```json
{
  "authoredAt": "2025-04-10T09:00:00Z",
  "id": "O01",
  "sha256": "78f0b41923e54c3e491436195bf95541cb6cf6b57702bededa1fddaddc65db74",
  "text": "Northstar Project requires this order of work: Northstar Project marks invoices with unusual payment terms using `northstar-flag`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-04-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "northstar-project",
    "level": "project"
  },
  "statement": "Northstar Project requires this order of work: Northstar Project marks invoices with unusual payment terms using `northstar-flag`.",
  "subjectKey": "unusual-payment-terms",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-130

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "206e2be9bde60201b3e22e99434b71816f4a8333e670bd49e87e685fc246b15f",
  "text": "The incident-intake workflow uses a required method here: The incident-intake workflow sends reports with a missing timeline to `comet-queue` for clarification."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "incident-intake",
    "level": "workflow"
  },
  "statement": "The incident-intake workflow uses a required method here: The incident-intake workflow sends reports with a missing timeline to `comet-queue` for clarification.",
  "subjectKey": "reports-missing-timelines",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-131

### Bound observation

```json
{
  "authoredAt": "2025-12-06T09:00:00Z",
  "id": "O01",
  "sha256": "2c20187d5ed8f5584eb8c743b8d662da4668a5396f36736936e613ded7bb7320",
  "text": "Marigold Team prefers this current handling: Marigold Team applies `marigold-indigo` to approved brand overview visuals."
}
```

### Claim

```json
{
  "effectiveAt": "2025-12-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "marigold-team",
    "level": "team"
  },
  "statement": "Marigold Team prefers this current handling: Marigold Team applies `marigold-indigo` to approved brand overview visuals.",
  "subjectKey": "approved-brand-overview-visuals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-132

### Bound observation

```json
{
  "authoredAt": "2025-05-10T09:00:00Z",
  "id": "O01",
  "sha256": "a018b8d3d8656696cbe83e9ade7794aa3494be0654c315ee2ebb069b3cb4ae4e",
  "text": "The owners of the feedback-bundles workflow approved the recorded choice: In the feedback-bundles workflow, an unreadable attachment is resolved with `harbor-close` after the sender is notified."
}
```

### Claim

```json
{
  "effectiveAt": "2025-05-10T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "feedback-bundles",
    "level": "workflow"
  },
  "statement": "The owners of the feedback-bundles workflow approved the recorded choice: In the feedback-bundles workflow, an unreadable attachment is resolved with `harbor-close` after the sender is notified.",
  "subjectKey": "unreadable-attachments",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-133

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "d23d3ae624f183e1f949ad0adc623698891559ac7446ed0738278292616f5104",
  "text": "Solstice Team would like this behavior: Solstice Team sends service-restored updates immediately with `solstice-ping`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-team",
    "level": "team"
  },
  "statement": "Solstice Team would like this behavior: Solstice Team sends service-restored updates immediately with `solstice-ping`.",
  "subjectKey": "service-restored-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-134

### Bound observation

```json
{
  "authoredAt": "2025-07-09T09:00:00Z",
  "id": "O01",
  "sha256": "ab19e3b2cae45438af04235717925867a7021ae0df0cf7706d9b2b38021eb134",
  "text": "Islet Network prefers this presentation: Islet Network uses `juniper-outline` for short policy summaries."
}
```

### Claim

```json
{
  "effectiveAt": "2025-07-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "islet-network",
    "level": "organization"
  },
  "statement": "Islet Network prefers this presentation: Islet Network uses `juniper-outline` for short policy summaries.",
  "subjectKey": "short-policy-summaries",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-135

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "1716867be9fb466eec0b24641d1afa3d569b39c671968cdc0a82e4f838616741",
  "text": "The selection made by the owners of the archive-window workflow is explicit: A late arrival in the archive-window workflow is moved to `cedar-defer` for rescheduling."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "archive-window",
    "level": "workflow"
  },
  "statement": "The selection made by the owners of the archive-window workflow is explicit: A late arrival in the archive-window workflow is moved to `cedar-defer` for rescheduling.",
  "subjectKey": "late-arrivals",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-136

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "37d82baff576d4eddb37d0510deaa5ef1eedb8402888901cd83a07a950e6792b",
  "text": "Lantern Team approved this handling: Lantern Team posts its weekly stakeholder-question roundup with `lantern-bulletin`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "lantern-team",
    "level": "team"
  },
  "statement": "Lantern Team approved this handling: Lantern Team posts its weekly stakeholder-question roundup with `lantern-bulletin`.",
  "subjectKey": "stakeholder-question-roundup",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-137

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "3107c75d20082ec41e6a7000f93c12b44b948661513782fff910989d00ccfeac",
  "text": "Jasmere Group wants this approach: Jasmere Group adds routine morning updates to `solstice-digest`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "jasmere-group",
    "level": "organization"
  },
  "statement": "Jasmere Group wants this approach: Jasmere Group adds routine morning updates to `solstice-digest`.",
  "subjectKey": "routine-morning-updates",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-138

### Bound observation

```json
{
  "authoredAt": "2025-10-07T09:00:00Z",
  "id": "O01",
  "sha256": "716700c4d35753a9f34c85d75064e095e4e2d9a42075c04b5783fedbfb338d74",
  "text": "The asset-handoff workflow requires the stated sequence: The asset-handoff workflow writes the final checksum into `seabird-index`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-10-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "asset-handoff",
    "level": "workflow"
  },
  "statement": "The asset-handoff workflow requires the stated sequence: The asset-handoff workflow writes the final checksum into `seabird-index`.",
  "subjectKey": "final-checksums",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-139

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "fa2fd997b2e6f3bba6d760c4b25e8086a5317087ac2ecfd5f0fceb595080865b",
  "text": "Harborview Team approved the stated rule: Harborview Team now finishes completed feedback bundles with `harbor-close`, replacing the earlier no-action handling."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "harborview-team",
    "level": "team"
  },
  "statement": "Harborview Team approved the stated rule: Harborview Team now finishes completed feedback bundles with `harbor-close`, replacing the earlier no-action handling.",
  "subjectKey": "completed-feedback-bundles",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-07-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "decision",
      "scope": {
        "key": "harborview-team",
        "level": "team"
      },
      "statement": "Harborview Team approved calling no catalog action for completed feedback bundles and explicitly prohibited `harbor-tag`.",
      "subjectKey": "completed-feedback-bundles",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-07-09T09:00:00Z",
      "id": "PO01",
      "sha256": "e9a0671a5ae1d6dad728bd38c5d78434fad5b13d976a24af4d6647e412a31c52",
      "text": "Harborview Team approved calling no catalog action for completed feedback bundles and explicitly prohibited `harbor-tag`."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-140

### Bound observation

```json
{
  "authoredAt": "2025-06-09T09:00:00Z",
  "id": "O01",
  "sha256": "9afd434177b4e616d8b95ca8fafe907a3bad59da8e9e099010243cee44d75457",
  "text": "Bluefin Studio selected the following route: Bluefin Studio forwards the monthly sentiment summary with `harbor-forward` to its planning desk."
}
```

### Claim

```json
{
  "effectiveAt": "2025-06-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "bluefin-studio",
    "level": "organization"
  },
  "statement": "Bluefin Studio selected the following route: Bluefin Studio forwards the monthly sentiment summary with `harbor-forward` to its planning desk.",
  "subjectKey": "monthly-sentiment-summary",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-141

### Bound observation

```json
{
  "authoredAt": "2025-08-08T09:00:00Z",
  "id": "O01",
  "sha256": "72c76df446c9293efdd33e6d87fa1307d826d523a3ce6f670fdccf07078ba45e",
  "text": "Tern Project explicitly wants no catalog action for routine meeting recaps and does not want `tern-note` called."
}
```

### Claim

```json
{
  "effectiveAt": "2025-08-08T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "tern-project",
    "level": "project"
  },
  "statement": "Tern Project explicitly wants no catalog action for routine meeting recaps and does not want `tern-note` called.",
  "subjectKey": "routine-meeting-recaps",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-142

### Bound observation

```json
{
  "authoredAt": "2025-09-07T09:00:00Z",
  "id": "O01",
  "sha256": "03275cd2f463dcf2b28834b39bbbb95fd8ffdaa112bcd4effa295658c186bc30",
  "text": "Willow Project sets a prerequisite before continuing: Willow Project archives the final checksum sheet with `willow-file`."
}
```

### Claim

```json
{
  "effectiveAt": "2025-09-07T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "procedure",
  "scope": {
    "key": "willow-project",
    "level": "project"
  },
  "statement": "Willow Project sets a prerequisite before continuing: Willow Project archives the final checksum sheet with `willow-file`.",
  "subjectKey": "final-checksum-sheets",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-143

### Bound observation

```json
{
  "authoredAt": "2025-02-09T09:00:00Z",
  "id": "O01",
  "sha256": "ef35f191e2fb695743a306834955373c4df47f926b21e8f75864f22d3f1ceddf",
  "text": "Bluefin Studio selected this option after review: Bluefin Studio applies `harbor-tag` when a completed feedback bundle is ready for triage."
}
```

### Claim

```json
{
  "effectiveAt": "2025-02-09T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "decision",
  "scope": {
    "key": "bluefin-studio",
    "level": "organization"
  },
  "statement": "Bluefin Studio selected this option after review: Bluefin Studio applies `harbor-tag` when a completed feedback bundle is ready for triage.",
  "subjectKey": "completed-feedback-bundles",
  "supersedesClaimIds": []
}
```

### Earlier claim context

```json
[]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:

## Entry CR-144

### Bound observation

```json
{
  "authoredAt": "2025-11-06T09:00:00Z",
  "id": "O01",
  "sha256": "547f0b032f2909676521e6bd5f39947ff2edbf4fe7d594270bf96545f2deb028",
  "text": "Solstice Team would like this handling rather than an alternative: Solstice Team now pins routine morning updates with `solstice-pin`, replacing the no-action handling."
}
```

### Claim

```json
{
  "effectiveAt": "2025-11-06T09:00:00Z",
  "evidenceIds": [
    "O01"
  ],
  "id": "C01",
  "kind": "preference",
  "scope": {
    "key": "solstice-team",
    "level": "team"
  },
  "statement": "Solstice Team would like this handling rather than an alternative: Solstice Team now pins routine morning updates with `solstice-pin`, replacing the no-action handling.",
  "subjectKey": "routine-morning-updates",
  "supersedesClaimIds": [
    "P01"
  ]
}
```

### Earlier claim context

```json
[
  {
    "claim": {
      "effectiveAt": "2025-07-09T09:00:00Z",
      "evidenceIds": [
        "PO01"
      ],
      "id": "P01",
      "kind": "preference",
      "scope": {
        "key": "solstice-team",
        "level": "team"
      },
      "statement": "Solstice Team explicitly wants no catalog action for routine morning updates and does not want `solstice-digest` called.",
      "subjectKey": "routine-morning-updates",
      "supersedesClaimIds": []
    },
    "observation": {
      "authoredAt": "2025-07-09T09:00:00Z",
      "id": "PO01",
      "sha256": "f2ff3e174ec69973b963c80e10e3bd7576e0225bcf803e04e4bf727736c21015",
      "text": "Solstice Team explicitly wants no catalog action for routine morning updates and does not want `solstice-digest` called."
    }
  }
]
```

### Reviewer fields

- Statement support:
- Kind:
- Subject key:
- Exact scope:
- Effective time and evidence binding:
- Supersession:
- Ambiguity:
