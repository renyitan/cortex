#!/usr/bin/env python3
"""Build and validate the lossless-memory formation fixture artifacts."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


EPISODE_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = EPISODE_DIR / "artifacts" / "fixture-source.json"
REVIEW_PATH = EPISODE_DIR / "artifacts" / "fixture-review-packet.md"
CLAIM_REVIEW_PATH = EPISODE_DIR / "artifacts" / "fixture-claim-review-packet.md"
MANIFEST_PATH = EPISODE_DIR / "artifacts" / "fixture-manifest.json"
BEHAVIOR_LABELS_PATH = (
    EPISODE_DIR / "artifacts" / "fixture-review-labels.blind.json"
)
CLAIM_LABELS_PATH = (
    EPISODE_DIR / "artifacts" / "fixture-claim-review-labels.blind.json"
)
BEHAVIOR_ADJUDICATION_PATH = (
    EPISODE_DIR / "artifacts" / "fixture-review-adjudication.json"
)
CLAIM_ADJUDICATION_PATH = (
    EPISODE_DIR / "artifacts" / "fixture-claim-review-adjudication.json"
)

SCHEMA_VERSION = 1
REVIEW_DATE = "2026-08-31"
MEMORY_TYPES = ("decision", "procedure", "preference")
MECHANISMS = ("action-substitution", "require-prohibit-reversal")
QUERY_TYPES = ("current_in_scope", "adjacent_scope", "historical_as_of")
SCOPE_LEVELS = ("global", "organization", "team", "project", "workflow")
SCOPE_PRECEDENCE = {level: index for index, level in enumerate(SCOPE_LEVELS)}
POSITION_PATTERNS = {
    "pattern-1": (1, 6, 10),
    "pattern-2": (2, 7, 11),
    "pattern-3": (3, 5, 9),
    "pattern-4": (4, 8, 12),
}
SOURCE_KEYS = {
    "schemaVersion",
    "split",
    "provenance",
    "reviewStatus",
    "shuffleSeed",
    "positionPatterns",
    "streams",
}
CLAIM_KEYS = {
    "id",
    "kind",
    "subjectKey",
    "statement",
    "scope",
    "effectiveAt",
    "evidenceIds",
    "supersedesClaimIds",
}
TASK_KEYS = {
    "id",
    "queryType",
    "queryAt",
    "scopePath",
    "conversation",
    "targetQuery",
    "governingClaimIds",
    "requiredActionIds",
    "prohibitedActionIds",
}
VISIBLE_BANNED_PATTERNS = {
    "gold": re.compile(r"\bgold\b", re.IGNORECASE),
    "target": re.compile(r"\btarget\b", re.IGNORECASE),
    "distractor": re.compile(r"\bdistractor\b", re.IGNORECASE),
    "applicable": re.compile(r"\bapplicable\b", re.IGNORECASE),
    "oracle": re.compile(r"\boracle\b", re.IGNORECASE),
    "raw_direct": re.compile(r"\braw[_ -]direct\b", re.IGNORECASE),
    "oracle_enriched_direct": re.compile(
        r"\boracle[_ -]enriched[_ -]direct\b", re.IGNORECASE
    ),
    "model_enriched_direct": re.compile(
        r"\bmodel[_ -]enriched[_ -]direct\b", re.IGNORECASE
    ),
    "decision": re.compile(r"\bdecision\b", re.IGNORECASE),
    "procedure": re.compile(r"\bprocedure\b", re.IGNORECASE),
    "preference": re.compile(r"\bpreference\b", re.IGNORECASE),
}
KEBAB_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
SUBJECT_KEY_STOPWORDS = frozenset(
    {"a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "by"}
)
REVIEW_ENTRY_RE = re.compile(r"^### Entry (RV-\d{3})$", re.MULTILINE)
REVIEW_PAIR_RE = re.compile(r"^### Pair (RP-\d{3})$", re.MULTILINE)
REVIEW_PAIR_ENTRIES_RE = re.compile(
    r"^- Entry IDs: `(?P<first>RV-\d{3})`, `(?P<second>RV-\d{3})`$",
    re.MULTILINE,
)
CLAIM_REVIEW_ENTRY_RE = re.compile(r"^## Entry (CR-\d{3})$", re.MULTILINE)
READER_PROTOCOL_LINES = (
    "- Use only information effective at or before `queryAt`.",
    "- Guidance is comparable only when it concerns the same subject. Guidance about a different subject coexists and never overrides it.",
    "- Among comparable guidance, apply only scopes present in `scopePath`, with `workflow > project > team > organization > global` precedence.",
    "- For the same subject and exact scope, use the latest effective state and honor explicit supersession.",
    "- Derived claims are additive organization; exact observations remain authoritative.",
    "- Call an action only if targetQuery explicitly requests it or governing standing guidance requires or prefers it.",
    "- Governing guidance overrides a conflicting request; an explicit prohibition or explicit desire not to use an action means it must not be called.",
    "- Do not call unrelated catalog actions.",
)
CLAIM_KIND_RUBRIC_LINES = (
    "- `decision`: an explicit resolution, approval, adoption, or selection choosing one rule or option over alternatives.",
    "- `procedure`: a required step, sequence, prerequisite, or method for carrying out work.",
    "- `preference`: an explicit desired format, channel, style, or behavior stated as a preference rather than a mandatory process step.",
    "- An explicit want, dislike, or style preference remains preference even when it names the selected option. Use decision only when the observation frames the act as a resolution, approval, adoption, or selection over alternatives.",
)
CLAIM_REVIEW_CONTRACT_LINES = (
    "- A subject key must concisely name the subject expressed by its bound observation; this judgment concerns semantic naming, while cross-entry uniqueness/chain consistency is generator-validated.",
    "- `global` requires a null key and explicit universal wording; every non-global scope key must be established by the bound observation.",
    "- `effectiveAt` must equal the bound observation's `authoredAt`.",
    "- `evidenceIds` must contain exactly the bound observation's neutral ID.",
    "- Future-dated and retroactive changes are prohibited.",
    "- Supersession may reference only an earlier claim with the same kind, subject key, and exact scope.",
    "- Cross-scope guidance coexists and must not be linked as supersession.",
)
KIND_CUE_LIMITATION = (
    "Fixture kind cues are intentionally explicit to make kind fidelity independently "
    "auditable; this development instrument does not measure difficult latent kind "
    "classification."
)
ORACLE_COPY_LIMITATION = (
    "Oracle claims add only structure and copy their bound observation wording exactly; "
    "oracle gains cannot come from evaluator paraphrase or summarization."
)
KIND_CUE_PATTERNS = {
    "decision": re.compile(
        r"\b(?:approved (?:this|the|calling)|selected (?:this|the)|"
        r"adopted (?:this|the)|decided (?:on|that)|selection made)\b",
        re.IGNORECASE,
    ),
    "procedure": re.compile(
        r"\b(?:requires? (?:this|the|an|no)|required (?:step|method|order)|"
        r"must (?:begin|use|not|call)|prerequisite|sequence)\b",
        re.IGNORECASE,
    ),
    "preference": re.compile(
        r"\b(?:prefers? (?:this|to|not|no)|wants? (?:this|the|to|no)|"
        r"would like|does not want|avoids? (?:this|using|calling))\b",
        re.IGNORECASE,
    ),
}
CROSS_SCOPE_REPLACEMENT_RE = re.compile(
    r"\bnow\b|\binstead of\b|\brather than\b|\bno longer\b|\breplac(?:e|es|ed|ing)\b",
    re.IGNORECASE,
)


class FixtureError(ValueError):
    """Raised when source data or a derived artifact violates the fixture contract."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise FixtureError(message)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
        separators=(",", ": "),
    ) + "\n"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def decode_utf8(value: bytes, context: str) -> str:
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FixtureError(f"{context} is not valid UTF-8: {exc}") from exc


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def fixture_content_value(source: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: copy.deepcopy(value)
        for key, value in source.items()
        if key != "reviewStatus"
    }


def fixture_content_sha256(source: Mapping[str, Any]) -> str:
    return sha256_json(fixture_content_value(source))


def observation_digest(authored_at: str, text: str) -> str:
    return sha256_text(f"{authored_at}\n{text}")


def load_source(path: Path = SOURCE_PATH) -> tuple[dict[str, Any], str]:
    try:
        source_bytes = path.read_bytes()
    except FileNotFoundError as exc:
        raise FixtureError(f"source file is missing: {path}") from exc
    text = decode_utf8(source_bytes, "source file")
    try:
        source = json.loads(text)
    except json.JSONDecodeError as exc:
        raise FixtureError(
            f"source JSON is invalid at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    _require(isinstance(source, dict), "source root must be a JSON object")
    _require(text == canonical_json(source), "source file is not canonical JSON")
    return source, text


def _parse_timestamp(value: Any, context: str) -> datetime:
    _require(
        isinstance(value, str) and TIMESTAMP_RE.fullmatch(value) is not None,
        f"{context}: expected canonical UTC timestamp YYYY-MM-DDTHH:MM:SSZ",
    )
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as exc:
        raise FixtureError(f"{context}: invalid calendar timestamp {value!r}") from exc


def _validate_kebab(value: Any, context: str, *, allow_null: bool = False) -> None:
    if allow_null and value is None:
        return
    _require(
        isinstance(value, str) and KEBAB_RE.fullmatch(value) is not None,
        f"{context}: expected non-empty canonical kebab-case",
    )


def _validate_visible_text(value: Any, context: str) -> None:
    _require(isinstance(value, str) and value.strip(), f"{context}: text must be non-empty")
    for label, pattern in VISIBLE_BANNED_PATTERNS.items():
        _require(
            pattern.search(value) is None,
            f"{context}: visible text contains banned evaluator term {label!r}",
        )


def _scope_matches(scope: Mapping[str, Any], path: Mapping[str, str]) -> bool:
    return scope["level"] == "global" or path.get(scope["level"]) == scope["key"]


def _validate_scope(scope: Any, context: str) -> None:
    _require(
        isinstance(scope, dict) and set(scope) == {"level", "key"},
        f"{context}: scope must contain exactly level and key",
    )
    level = scope["level"]
    _require(level in SCOPE_LEVELS, f"{context}: unknown scope level {level!r}")
    if level == "global":
        _require(scope["key"] is None, f"{context}: global scope key must be null")
    else:
        _validate_kebab(scope["key"], f"{context}.key")
        if level == "team":
            _require(
                scope["key"].endswith("-team"),
                f"{context}: team scope key must identify a team",
            )
        if level == "project":
            _require(
                scope["key"].endswith("-project"),
                f"{context}: project scope key must identify a project",
            )


def _validate_scope_path(path: Any, context: str) -> None:
    expected = {"organization", "team", "project", "workflow"}
    _require(
        isinstance(path, dict) and set(path) == expected,
        f"{context}: scope path must contain organization, team, project, and workflow",
    )
    for level in ("organization", "team", "project", "workflow"):
        _validate_kebab(path[level], f"{context}.{level}")


def normalize_scope_reference(value: str) -> str:
    """Normalize human-readable scope text to comparable kebab-case tokens."""
    return "-".join(re.findall(r"[a-z0-9]+", value.casefold()))


def _validate_observation_scope(
    observation: Mapping[str, Any],
    claim: Mapping[str, Any],
) -> None:
    scope = claim["scope"]
    if scope["level"] == "global":
        _require(
            re.search(
                r"\b(?:Across all organizations|For every organization)\b",
                observation["text"],
                re.IGNORECASE,
            )
            is not None,
            f"{claim['id']}: global claim observation must state universal scope "
            'with "Across all organizations" or "For every organization"',
        )
        return
    normalized_text = normalize_scope_reference(observation["text"])
    key = scope["key"]
    _require(
        f"-{key}-" in f"-{normalized_text}-",
        f"{claim['id']}: bound observation does not establish scope key {key!r}",
    )


def _validate_kind_support(
    kind: str,
    observation_text: str,
    claim_statement: str,
    claim_id: str,
) -> None:
    pattern = KIND_CUE_PATTERNS[kind]
    _require(
        pattern.search(observation_text) is not None,
        f"{claim_id}: bound observation does not establish {kind} kind with frozen wording",
    )
    _require(
        pattern.search(claim_statement) is not None,
        f"{claim_id}: claim statement does not establish {kind} kind with frozen wording",
    )
    for other_kind, other_pattern in KIND_CUE_PATTERNS.items():
        if other_kind == kind:
            continue
        _require(
            other_pattern.search(observation_text) is None,
            f"{claim_id}: bound observation also matches conflicting {other_kind} wording",
        )
        _require(
            other_pattern.search(claim_statement) is None,
            f"{claim_id}: claim statement also matches conflicting {other_kind} wording",
        )


def _simple_token_forms(token: str) -> set[str]:
    forms = {token}
    if len(token) > 3 and token.endswith("ies"):
        forms.add(f"{token[:-3]}y")
    if len(token) > 3 and token.endswith("es"):
        forms.add(token[:-2])
    if len(token) > 2 and token.endswith("s"):
        forms.add(token[:-1])
    return forms


def _validate_subject_key_support(
    subject_key: str,
    observation_text: str,
    claim_id: str,
) -> None:
    observation_forms = {
        form
        for token in re.findall(r"[a-z0-9]+", observation_text.casefold())
        for form in _simple_token_forms(token)
    }
    meaningful_tokens = [
        token
        for token in subject_key.split("-")
        if token not in SUBJECT_KEY_STOPWORDS
    ]
    _require(
        bool(meaningful_tokens),
        f"{claim_id}: subjectKey must contain a meaningful semantic token",
    )
    for token in meaningful_tokens:
        _require(
            bool(_simple_token_forms(token).intersection(observation_forms)),
            f"{claim_id}: subjectKey token {token!r} is not supported by the bound observation",
        )


def _claim_by_observation(
    claims: Sequence[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {claim["evidenceIds"][0]: claim for claim in claims}


def _resolved_claim_ids(
    claims: Sequence[dict[str, Any]],
    subject_key: str,
    scope_path: Mapping[str, str],
    query_at: str,
) -> list[str]:
    query_time = _parse_timestamp(query_at, "queryAt")
    eligible = [
        claim
        for claim in claims
        if claim["subjectKey"] == subject_key
        and _parse_timestamp(claim["effectiveAt"], f"{claim['id']}.effectiveAt") <= query_time
        and _scope_matches(claim["scope"], scope_path)
    ]
    superseded = {
        prior_id
        for claim in eligible
        for prior_id in claim["supersedesClaimIds"]
    }
    live = [claim for claim in eligible if claim["id"] not in superseded]
    _require(live, f"{subject_key}: no claim resolves for query time and scope")
    highest = max(SCOPE_PRECEDENCE[claim["scope"]["level"]] for claim in live)
    governing = [
        claim
        for claim in live
        if SCOPE_PRECEDENCE[claim["scope"]["level"]] == highest
    ]
    _require(
        len(governing) == 1,
        f"{subject_key}: resolution produced {len(governing)} equally specific live claims",
    )
    return [governing[0]["id"]]


def _validate_supersession(claims: Sequence[dict[str, Any]], stream_id: str) -> None:
    by_id = {claim["id"]: claim for claim in claims}
    order = {claim["id"]: index for index, claim in enumerate(claims)}
    graph: dict[str, list[str]] = {claim["id"]: [] for claim in claims}
    for claim in claims:
        supersedes = claim["supersedesClaimIds"]
        _require(
            len(supersedes) == len(set(supersedes)),
            f"{claim['id']}: duplicate superseded claim ID",
        )
        _require(
            len(supersedes) <= 4,
            f"{claim['id']}: may supersede at most four claims",
        )
        for prior_id in supersedes:
            _require(prior_id in by_id, f"{claim['id']}: unknown superseded claim {prior_id}")
            prior = by_id[prior_id]
            _require(
                order[prior_id] < order[claim["id"]],
                f"{claim['id']}: supersession must reference an earlier claim",
            )
            _require(
                claim["kind"] == prior["kind"],
                f"{claim['id']}: supersession kind differs from {prior_id}",
            )
            _require(
                claim["subjectKey"] == prior["subjectKey"],
                f"{claim['id']}: supersession subject differs from {prior_id}",
            )
            _require(
                claim["scope"] == prior["scope"],
                f"{claim['id']}: supersession scope differs from {prior_id}",
            )
            graph[claim["id"]].append(prior_id)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(claim_id: str) -> None:
        _require(claim_id not in visiting, f"{stream_id}: supersession graph contains a cycle")
        if claim_id in visited:
            return
        visiting.add(claim_id)
        for prior_id in graph[claim_id]:
            visit(prior_id)
        visiting.remove(claim_id)
        visited.add(claim_id)

    for claim_id in graph:
        visit(claim_id)


def _validate_future_task_leakage(stream: dict[str, Any]) -> None:
    earlier_text = "\n".join(
        [
            *(action["description"] for action in stream["actions"]),
            *(observation["text"] for observation in stream["observations"]),
            *(claim["statement"] for claim in stream["claims"]),
        ]
    ).casefold()
    for task in stream["tasks"]:
        private_fragments = [
            task["targetQuery"],
            *(turn["content"] for turn in task["conversation"]),
        ]
        for fragment in private_fragments:
            normalized = fragment.strip().casefold()
            _require(
                not normalized or normalized not in earlier_text,
                f"{stream['id']}/{task['id']}: future task text leaked into formation-visible content",
            )


def validate_source(source: dict[str, Any]) -> None:
    _require(set(source) == SOURCE_KEYS, "source root fields do not match schema v1")
    _require(source["schemaVersion"] == SCHEMA_VERSION, "source schemaVersion must be 1")
    _require(source["split"] == "development", "source split must be development")
    _require(source["provenance"] == "synthetic", "source provenance must be synthetic")
    _require(
        source["reviewStatus"] in {"draft", "approved"},
        "source reviewStatus must be draft or approved",
    )
    _require(
        isinstance(source["shuffleSeed"], int)
        and 0 <= source["shuffleSeed"] <= 0xFFFFFFFF,
        "shuffleSeed must be a 32-bit unsigned integer",
    )
    declared_patterns = source["positionPatterns"]
    _require(
        isinstance(declared_patterns, dict)
        and {
            key: tuple(value)
            for key, value in declared_patterns.items()
        }
        == POSITION_PATTERNS,
        "positionPatterns must equal the four frozen patterns",
    )
    streams = source["streams"]
    _require(isinstance(streams, list) and len(streams) == 12, "expected exactly 12 streams")
    _require(
        [stream.get("id") for stream in streams]
        == [f"stream-{index:02d}" for index in range(1, 13)],
        "stream IDs and order must be stream-01 through stream-12",
    )

    all_observation_ids: set[str] = set()
    all_claim_ids: set[str] = set()
    all_task_ids: set[str] = set()
    memory_counts: Counter[str] = Counter()
    mechanism_counts: Counter[str] = Counter()
    mechanism_by_memory: defaultdict[str, Counter[str]] = defaultdict(Counter)
    patterns_by_memory: defaultdict[str, Counter[str]] = defaultdict(Counter)
    action_positions_by_mechanism: defaultdict[str, list[tuple[int, ...]]] = (
        defaultdict(list)
    )

    for stream in streams:
        stream_id = stream["id"]
        required_stream_fields = {
            "id",
            "memoryType",
            "mechanism",
            "positionPatternId",
            "targetSubjectKey",
            "targetObservationIds",
            "narrowScope",
            "actions",
            "observations",
            "claims",
            "claimActionRules",
            "tasks",
        }
        _require(
            set(stream) == required_stream_fields,
            f"{stream_id}: stream fields do not match schema v1",
        )
        memory_type = stream["memoryType"]
        mechanism = stream["mechanism"]
        pattern_id = stream["positionPatternId"]
        _require(memory_type in MEMORY_TYPES, f"{stream_id}: invalid memoryType")
        _require(mechanism in MECHANISMS, f"{stream_id}: invalid mechanism")
        _require(pattern_id in POSITION_PATTERNS, f"{stream_id}: invalid positionPatternId")
        _validate_kebab(stream["targetSubjectKey"], f"{stream_id}.targetSubjectKey")
        _validate_scope(stream["narrowScope"], f"{stream_id}.narrowScope")
        _require(
            stream["narrowScope"]["level"] != "global",
            f"{stream_id}: narrowScope cannot be global",
        )
        memory_counts[memory_type] += 1
        mechanism_counts[mechanism] += 1
        mechanism_by_memory[memory_type][mechanism] += 1
        patterns_by_memory[memory_type][pattern_id] += 1

        actions = stream["actions"]
        _require(
            isinstance(actions, list) and len(actions) == 5,
            f"{stream_id}: expected exactly five actions",
        )
        action_ids: list[str] = []
        for index, action in enumerate(actions, start=1):
            _require(
                isinstance(action, dict) and set(action) == {"actionId", "description"},
                f"{stream_id}/action-{index}: action fields must be actionId and description",
            )
            _validate_kebab(action["actionId"], f"{stream_id}/action-{index}.actionId")
            _validate_visible_text(
                action["actionId"], f"{stream_id}/action-{index}.actionId"
            )
            _validate_visible_text(
                action["description"], f"{stream_id}/action-{index}.description"
            )
            action_ids.append(action["actionId"])
        _require(
            len(action_ids) == len(set(action_ids)),
            f"{stream_id}: action IDs must be unique",
        )
        action_set = set(action_ids)

        observations = stream["observations"]
        _require(
            isinstance(observations, list) and len(observations) == 12,
            f"{stream_id}: expected exactly 12 observations",
        )
        observation_times: list[datetime] = []
        observation_ids: list[str] = []
        for index, observation in enumerate(observations, start=1):
            expected_id = f"{stream_id}-observation-{index:02d}"
            _require(
                isinstance(observation, dict)
                and set(observation) == {"id", "authoredAt", "text", "sha256"},
                f"{stream_id}/observation-{index:02d}: observation fields do not match schema",
            )
            _require(
                observation["id"] == expected_id,
                f"{stream_id}: expected observation ID {expected_id}",
            )
            _require(
                observation["id"] not in all_observation_ids,
                f"duplicate observation ID {observation['id']}",
            )
            all_observation_ids.add(observation["id"])
            observation_ids.append(observation["id"])
            observation_times.append(
                _parse_timestamp(observation["authoredAt"], f"{expected_id}.authoredAt")
            )
            _validate_visible_text(observation["text"], f"{expected_id}.text")
            expected_digest = observation_digest(
                observation["authoredAt"], observation["text"]
            )
            _require(
                observation["sha256"] == expected_digest,
                f"{expected_id}: observation digest mismatch",
            )
        _require(
            all(
                earlier < later
                for earlier, later in zip(observation_times, observation_times[1:])
            ),
            f"{stream_id}: observations must be strictly chronological",
        )

        target_observation_ids = stream["targetObservationIds"]
        expected_target_ids = [
            observation_ids[position - 1] for position in POSITION_PATTERNS[pattern_id]
        ]
        _require(
            target_observation_ids == expected_target_ids,
            f"{stream_id}: evolution-chain positions do not match {pattern_id}",
        )
        _require(
            len(target_observation_ids) == 3,
            f"{stream_id}: evolution chain must contain exactly three observations",
        )

        claims = stream["claims"]
        _require(
            isinstance(claims, list) and len(claims) == 12,
            f"{stream_id}: expected exactly 12 claims",
        )
        claim_ids: list[str] = []
        for index, claim in enumerate(claims, start=1):
            expected_id = f"{stream_id}-claim-{index:02d}"
            _require(
                isinstance(claim, dict) and set(claim) == CLAIM_KEYS,
                f"{expected_id}: claim fields do not match schema v1",
            )
            _require(claim["id"] == expected_id, f"{stream_id}: expected claim ID {expected_id}")
            _require(
                claim["id"] not in all_claim_ids,
                f"duplicate claim ID {claim['id']}",
            )
            all_claim_ids.add(claim["id"])
            claim_ids.append(claim["id"])
            _require(claim["kind"] in MEMORY_TYPES, f"{expected_id}: invalid kind")
            _require(
                claim["kind"] == memory_type,
                f"{expected_id}: kind differs from stream memoryType",
            )
            _validate_kebab(claim["subjectKey"], f"{expected_id}.subjectKey")
            _validate_visible_text(claim["statement"], f"{expected_id}.statement")
            _require(
                claim["statement"] == observations[index - 1]["text"],
                f"{expected_id}: claim statement must exactly equal its bound observation text",
            )
            _validate_scope(claim["scope"], f"{expected_id}.scope")
            _require(
                claim["scope"]["key"] is None
                or claim["subjectKey"] != claim["scope"]["key"],
                f"{expected_id}: subjectKey must not equal its scope key",
            )
            _parse_timestamp(claim["effectiveAt"], f"{expected_id}.effectiveAt")
            expected_evidence = [observation_ids[index - 1]]
            _require(
                claim["evidenceIds"] == expected_evidence,
                f"{expected_id}: evidenceIds must contain only {expected_evidence[0]}",
            )
            _require(
                claim["effectiveAt"] == observations[index - 1]["authoredAt"],
                f"{expected_id}: effectiveAt must equal its evidence authoredAt",
            )
            _validate_observation_scope(observations[index - 1], claim)
            _validate_kind_support(
                claim["kind"],
                observations[index - 1]["text"],
                claim["statement"],
                claim["id"],
            )
            _validate_subject_key_support(
                claim["subjectKey"],
                observations[index - 1]["text"],
                claim["id"],
            )
            _require(
                isinstance(claim["supersedesClaimIds"], list),
                f"{expected_id}: supersedesClaimIds must be a list",
            )
        _require(
            set(_claim_by_observation(claims)) == set(observation_ids),
            f"{stream_id}: every observation must have exactly one bound claim",
        )
        _validate_supersession(claims, stream_id)

        target_claims = [
            _claim_by_observation(claims)[observation_id]
            for observation_id in target_observation_ids
        ]
        target_observations = [
            observations[observation_ids.index(observation_id)]
            for observation_id in target_observation_ids
        ]
        _require(
            all(
                claim["subjectKey"] == stream["targetSubjectKey"]
                for claim in target_claims
            ),
            f"{stream_id}: all evolution-chain claims must share targetSubjectKey",
        )
        independent_claims = [
            claim for claim in claims if claim not in target_claims
        ]
        independent_subjects = [claim["subjectKey"] for claim in independent_claims]
        _require(
            stream["targetSubjectKey"] not in independent_subjects,
            f"{stream_id}: an independent claim reuses targetSubjectKey",
        )
        _require(
            len(independent_subjects) == len(set(independent_subjects)) == 9,
            f"{stream_id}: nine independent claims must use distinct subject keys",
        )
        broad, exception, update = target_claims
        _require(
            broad["supersedesClaimIds"] == [],
            f"{broad['id']}: broad claim cannot supersede another claim",
        )
        _require(
            exception["supersedesClaimIds"] == [],
            f"{exception['id']}: cross-scope exception must coexist with the broad claim",
        )
        _require(
            update["scope"] == exception["scope"] == stream["narrowScope"],
            f"{stream_id}: later chain claims must use narrowScope",
        )
        _require(
            update["supersedesClaimIds"] == [exception["id"]],
            f"{update['id']}: update must supersede only the earlier narrow claim",
        )
        _require(
            SCOPE_PRECEDENCE[broad["scope"]["level"]]
            < SCOPE_PRECEDENCE[exception["scope"]["level"]],
            f"{stream_id}: exception scope must be narrower than the broad scope",
        )
        _require(
            CROSS_SCOPE_REPLACEMENT_RE.search(target_observations[1]["text"]) is None
            and CROSS_SCOPE_REPLACEMENT_RE.search(exception["statement"]) is None,
            f"{stream_id}: cross-scope exception must be stated positively without replacement wording",
        )

        rules = stream["claimActionRules"]
        _require(
            isinstance(rules, list) and len(rules) == 12,
            f"{stream_id}: expected one action rule per claim",
        )
        rules_by_claim: dict[str, list[str]] = {}
        for rule in rules:
            _require(
                isinstance(rule, dict)
                and set(rule) == {"claimId", "requiredActionIds"},
                f"{stream_id}: claim action rule fields are invalid",
            )
            claim_id = rule["claimId"]
            _require(claim_id in claim_ids, f"{stream_id}: action rule references unknown claim")
            required_actions = rule["requiredActionIds"]
            _require(
                isinstance(required_actions, list)
                and len(required_actions) <= 1
                and len(required_actions) == len(set(required_actions)),
                f"{claim_id}: requiredActionIds must contain zero or one unique action",
            )
            _require(
                set(required_actions).issubset(action_set),
                f"{claim_id}: action rule references unavailable action",
            )
            _require(claim_id not in rules_by_claim, f"{claim_id}: duplicate action rule")
            rules_by_claim[claim_id] = required_actions
        _require(
            set(rules_by_claim) == set(claim_ids),
            f"{stream_id}: action rules do not cover every claim",
        )
        _require(
            {
                action_id
                for required_actions in rules_by_claim.values()
                for action_id in required_actions
            }
            == action_set,
            f"{stream_id}: every catalog action must have a coherent use in the stream",
        )
        chain_rules = [rules_by_claim[claim["id"]] for claim in target_claims]
        if mechanism == "action-substitution":
            _require(
                all(len(rule) == 1 for rule in chain_rules),
                f"{stream_id}: substitution chain must require one action at each state",
            )
            _require(
                len({rule[0] for rule in chain_rules}) == 3,
                f"{stream_id}: substitution chain must use three distinct actions",
            )
            action_positions_by_mechanism[mechanism].append(
                tuple(action_ids.index(rule[0]) + 1 for rule in chain_rules)
            )
        else:
            _require(
                len(chain_rules[0]) == 1
                and chain_rules[1] == []
                and len(chain_rules[2]) == 1,
                f"{stream_id}: reversal chain must be require, prohibit, then require",
            )
            _require(
                chain_rules[0][0] != chain_rules[2][0],
                f"{stream_id}: reversal update must require a distinct replacement action",
            )
            action_positions_by_mechanism[mechanism].append(
                (
                    action_ids.index(chain_rules[0][0]) + 1,
                    action_ids.index(chain_rules[2][0]) + 1,
                )
            )

        tasks = stream["tasks"]
        _require(
            isinstance(tasks, list) and len(tasks) == 3,
            f"{stream_id}: expected exactly three tasks",
        )
        _require(
            [task.get("queryType") for task in tasks] == list(QUERY_TYPES),
            f"{stream_id}: task order must be current, adjacent, historical",
        )
        narrow_scope = stream["narrowScope"]
        broad_scope = broad["scope"]
        target_times = [
            _parse_timestamp(claim["effectiveAt"], f"{claim['id']}.effectiveAt")
            for claim in target_claims
        ]
        last_observation_time = observation_times[-1]
        for index, task in enumerate(tasks, start=1):
            expected_task_id = f"{stream_id}-task-{index:02d}"
            _require(
                isinstance(task, dict) and set(task) == TASK_KEYS,
                f"{expected_task_id}: task fields do not match schema v1",
            )
            _require(task["id"] == expected_task_id, f"{stream_id}: expected task ID {expected_task_id}")
            _require(task["id"] not in all_task_ids, f"duplicate task ID {task['id']}")
            all_task_ids.add(task["id"])
            query_time = _parse_timestamp(task["queryAt"], f"{expected_task_id}.queryAt")
            _validate_scope_path(task["scopePath"], f"{expected_task_id}.scopePath")
            _require(
                isinstance(task["conversation"], list) and task["conversation"],
                f"{expected_task_id}: conversation must be non-empty",
            )
            for turn_index, turn in enumerate(task["conversation"], start=1):
                _require(
                    isinstance(turn, dict)
                    and set(turn) == {"turnId", "role", "content"},
                    f"{expected_task_id}/turn-{turn_index}: invalid conversation fields",
                )
                _require(
                    turn["turnId"] == f"turn-{turn_index}",
                    f"{expected_task_id}: conversation turn IDs must be sequential",
                )
                _require(
                    turn["role"] in {"user", "assistant"},
                    f"{expected_task_id}/turn-{turn_index}: invalid role",
                )
                _validate_visible_text(
                    turn["content"], f"{expected_task_id}/turn-{turn_index}.content"
                )
            _validate_visible_text(task["targetQuery"], f"{expected_task_id}.targetQuery")
            _require(
                isinstance(task["governingClaimIds"], list)
                and task["governingClaimIds"],
                f"{expected_task_id}: governingClaimIds must be non-empty",
            )
            resolved = _resolved_claim_ids(
                claims,
                stream["targetSubjectKey"],
                task["scopePath"],
                task["queryAt"],
            )
            _require(
                task["governingClaimIds"] == resolved,
                f"{expected_task_id}: governingClaimIds do not match scope/time resolution",
            )
            _require(
                all(claim_id in {claim["id"] for claim in target_claims} for claim_id in resolved),
                f"{expected_task_id}: an independent claim governs the task",
            )
            required_actions = task["requiredActionIds"]
            prohibited_actions = task["prohibitedActionIds"]
            _require(
                isinstance(required_actions, list)
                and isinstance(prohibited_actions, list),
                f"{expected_task_id}: action partitions must be lists",
            )
            _require(
                len(required_actions) == len(set(required_actions))
                and len(prohibited_actions) == len(set(prohibited_actions)),
                f"{expected_task_id}: action partitions contain duplicates",
            )
            required_set = set(required_actions)
            prohibited_set = set(prohibited_actions)
            _require(
                not required_set.intersection(prohibited_set),
                f"{expected_task_id}: an action is both required and prohibited",
            )
            _require(
                required_set.union(prohibited_set) == action_set,
                f"{expected_task_id}: required/prohibited actions must partition all five actions",
            )
            expected_required = set(rules_by_claim[resolved[0]])
            _require(
                required_set == expected_required,
                f"{expected_task_id}: requiredActionIds disagree with the governing claim",
            )
            _require(
                prohibited_set == action_set - expected_required,
                f"{expected_task_id}: prohibitedActionIds disagree with the governing claim",
            )
            if task["queryType"] in {"current_in_scope", "adjacent_scope"}:
                _require(
                    query_time > last_observation_time,
                    f"{expected_task_id}: current query must follow all observations",
                )
            else:
                _require(
                    target_times[1] <= query_time < target_times[2],
                    f"{expected_task_id}: historical query must fall between narrow states",
                )

            narrow_matches = _scope_matches(narrow_scope, task["scopePath"])
            broad_matches = _scope_matches(broad_scope, task["scopePath"])
            _require(broad_matches, f"{expected_task_id}: broad scope must occur in task path")
            if task["queryType"] == "adjacent_scope":
                _require(
                    not narrow_matches,
                    f"{expected_task_id}: adjacent task must exclude narrowScope",
                )
                adjacent_scope = {
                    "level": narrow_scope["level"],
                    "key": task["scopePath"][narrow_scope["level"]],
                }
                _require(
                    all(claim["scope"] != adjacent_scope for claim in claims),
                    f"{expected_task_id}: adjacent scope must not be used by an independent claim",
                )
                if narrow_scope["level"] == "workflow":
                    conversation_text = " ".join(
                        turn["content"] for turn in task["conversation"]
                    )
                    normalized_conversation = normalize_scope_reference(
                        conversation_text
                    )
                    _require(
                        f"-{adjacent_scope['key']}-"
                        in f"-{normalized_conversation}-",
                        f"{expected_task_id}: adjacent workflow must be stated in conversation",
                    )
            else:
                _require(
                    narrow_matches,
                    f"{expected_task_id}: in-scope tasks must include narrowScope",
                )

        task_actions = [tuple(task["requiredActionIds"]) for task in tasks]
        _require(
            len(set(task_actions)) == 3,
            f"{stream_id}: current, adjacent, and historical behavior must all differ",
        )
        _require(
            task_actions
            == [tuple(chain_rules[2]), tuple(chain_rules[0]), tuple(chain_rules[1])],
            f"{stream_id}: task behavior must resolve to current, adjacent, then historical state",
        )
        if mechanism == "action-substitution":
            _require(
                all(task_actions),
                f"{stream_id}: substitution tasks must each require one action",
            )
        else:
            _require(
                task_actions[2] == (),
                f"{stream_id}: reversal historical task must require no action",
            )
            historical_task = tasks[2]
            governing_claim = target_claims[1]
            _require(
                f"`{chain_rules[0][0]}`" in historical_task["targetQuery"],
                f"{historical_task['id']}: historical reversal must explicitly request the prohibited action",
            )
            _require(
                "no catalog action" in governing_claim["statement"].casefold()
                and f"`{chain_rules[0][0]}`" in governing_claim["statement"],
                f"{historical_task['id']}: historical reversal must be governed by an explicit prohibition",
            )
        _validate_future_task_leakage(stream)

    _require(
        memory_counts == Counter({memory_type: 4 for memory_type in MEMORY_TYPES}),
        "expected four streams for each memory type",
    )
    _require(
        mechanism_counts == Counter({mechanism: 6 for mechanism in MECHANISMS}),
        "expected six substitution and six reversal streams",
    )
    for memory_type in MEMORY_TYPES:
        _require(
            mechanism_by_memory[memory_type]
            == Counter({mechanism: 2 for mechanism in MECHANISMS}),
            f"{memory_type}: expected two streams per mechanism",
        )
        _require(
            patterns_by_memory[memory_type]
            == Counter({pattern_id: 1 for pattern_id in POSITION_PATTERNS}),
            f"{memory_type}: each position pattern must appear exactly once",
        )
    for mechanism in MECHANISMS:
        patterns = action_positions_by_mechanism[mechanism]
        _require(
            len(patterns) == len(set(patterns)) == 6,
            f"{mechanism}: chain action-position patterns must not repeat",
        )
        _require(
            {position for pattern in patterns for position in pattern} == {1, 2, 3, 4, 5},
            f"{mechanism}: chain actions must cover every catalog position",
        )


def _neutralized_observations(stream: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"N{index:02d}",
            "authoredAt": observation["authoredAt"],
            "text": observation["text"],
            "sha256": observation["sha256"],
        }
        for index, observation in enumerate(stream["observations"], start=1)
    ]


def _neutralized_claims(stream: dict[str, Any]) -> list[dict[str, Any]]:
    observation_map = {
        observation["id"]: f"N{index:02d}"
        for index, observation in enumerate(stream["observations"], start=1)
    }
    claim_map = {
        claim["id"]: f"C{index:02d}"
        for index, claim in enumerate(stream["claims"], start=1)
    }
    neutralized = []
    for claim in stream["claims"]:
        neutralized.append(
            {
                **claim,
                "id": claim_map[claim["id"]],
                "evidenceIds": [
                    observation_map[observation_id]
                    for observation_id in claim["evidenceIds"]
                ],
                "supersedesClaimIds": [
                    claim_map[claim_id]
                    for claim_id in claim["supersedesClaimIds"]
                ],
            }
        )
    return neutralized


def behavior_pair_shuffle_seed(source: Mapping[str, Any]) -> int:
    digest = hashlib.sha256(
        f"behavior-pair-v1:{source['shuffleSeed']}".encode("utf-8")
    ).digest()
    seed = int.from_bytes(digest[:4], "big")
    _require(seed != source["shuffleSeed"], "behavior pair seed must be distinct")
    return seed


def review_entries(
    source: dict[str, Any],
) -> tuple[
    list[dict[str, Any]],
    dict[str, dict[str, Any]],
    list[dict[str, Any]],
    dict[str, dict[str, Any]],
]:
    validate_source(source)
    shuffled_views = [
        {
            "stream": stream,
            "task": task,
            "view": view,
        }
        for stream in source["streams"]
        for task in stream["tasks"]
        for view in ("observations-only", "claims-added")
    ]
    entry_rng = random.Random(source["shuffleSeed"])
    for _ in range(100):
        entry_rng.shuffle(shuffled_views)
        if all(
            (
                left["stream"]["id"],
                left["task"]["id"],
            )
            != (
                right["stream"]["id"],
                right["task"]["id"],
            )
            for left, right in zip(shuffled_views, shuffled_views[1:])
        ):
            break
    else:
        raise FixtureError("could not produce a non-adjacent behavior-entry shuffle")

    entries: list[dict[str, Any]] = []
    entry_mapping: dict[str, dict[str, Any]] = {}
    review_ids_by_task: defaultdict[tuple[str, str], list[str]] = defaultdict(list)
    for index, item in enumerate(shuffled_views, start=1):
        stream = item["stream"]
        task = item["task"]
        view = item["view"]
        review_id = f"RV-{index:03d}"
        entries.append(
            {
                "reviewId": review_id,
                "actions": stream["actions"],
                "observations": _neutralized_observations(stream),
                "derivedClaims": (
                    [] if view == "observations-only" else _neutralized_claims(stream)
                ),
                "scopePath": task["scopePath"],
                "queryAt": task["queryAt"],
                "conversation": task["conversation"],
                "targetQuery": task["targetQuery"],
            }
        )
        task_key = (stream["id"], task["id"])
        review_ids_by_task[task_key].append(review_id)
        entry_mapping[review_id] = {
            "streamId": stream["id"],
            "taskId": task["id"],
            "queryType": task["queryType"],
            "view": view,
        }

    pair_sources = [
        (stream, task)
        for stream in source["streams"]
        for task in stream["tasks"]
    ]
    pair_rng = random.Random(behavior_pair_shuffle_seed(source))
    pair_rng.shuffle(pair_sources)
    pairs: list[dict[str, Any]] = []
    pair_mapping: dict[str, dict[str, Any]] = {}
    for index, (stream, task) in enumerate(pair_sources, start=1):
        pair_id = f"RP-{index:03d}"
        review_ids = list(review_ids_by_task[(stream["id"], task["id"])])
        _require(len(review_ids) == 2, f"{task['id']}: expected two review entries")
        pair_rng.shuffle(review_ids)
        pairs.append({"pairId": pair_id, "reviewIds": review_ids})
        pair_mapping[pair_id] = {
            "streamId": stream["id"],
            "taskId": task["id"],
            "queryType": task["queryType"],
            "reviewIds": review_ids,
        }
        for review_id in review_ids:
            entry_mapping[review_id]["pairId"] = pair_id

    _require(len(entries) == 72, "review generation must produce exactly 72 entries")
    _require(len(pairs) == 36, "review generation must produce exactly 36 pairs")
    return entries, entry_mapping, pairs, pair_mapping


def _json_block(value: Any) -> list[str]:
    return ["```json", canonical_json(value).rstrip(), "```"]


def build_review_packet(
    source: dict[str, Any],
) -> tuple[
    str,
    dict[str, dict[str, Any]],
    dict[str, dict[str, Any]],
]:
    entries, entry_mapping, pairs, pair_mapping = review_entries(source)
    lines = [
        "# Independent fixture review packet",
        "",
        "> Complete Phase 1 before consulting the pair map in Phase 2.",
        "> Assess every entry independently. All actions are fictional and have no side effects.",
        "",
        "## Reader protocol",
        "",
        *READER_PROTOCOL_LINES,
        "",
        "## Phase 1: Independent entries",
        "",
    ]
    for entry in entries:
        lines.extend(
            [
                f"### Entry {entry['reviewId']}",
                "",
                "#### Actions",
                "",
                *_json_block(entry["actions"]),
                "",
                "#### Observations",
                "",
                *_json_block(entry["observations"]),
                "",
                "#### Derived claims",
                "",
                *_json_block(entry["derivedClaims"]),
                "",
                "#### Scope path",
                "",
                *_json_block(entry["scopePath"]),
                "",
                "#### Query time",
                "",
                f"`{entry['queryAt']}`",
                "",
                "#### Conversation",
                "",
                *_json_block(entry["conversation"]),
                "",
                "#### Target query",
                "",
                *_json_block({"targetQuery": entry["targetQuery"]}),
                "",
                "#### Reviewer fields",
                "",
                "- Required actions:",
                "- Prohibited actions:",
                "- Ambiguity:",
                "",
            ]
        )
    lines.extend(
        [
            "## Phase 2: Pair comparison",
            "",
            "> Use this map only after every Phase 1 entry has been labeled.",
            "",
        ]
    )
    for pair in pairs:
        first, second = pair["reviewIds"]
        lines.extend(
            [
                f"### Pair {pair['pairId']}",
                "",
                f"- Entry IDs: `{first}`, `{second}`",
                "- Behavior equivalent:",
                "- Equivalence notes:",
                "",
            ]
        )
    packet = "\n".join(lines).rstrip() + "\n"
    validate_review_packet(packet, source)
    return packet, entry_mapping, pair_mapping


def validate_review_packet(packet: str, source: dict[str, Any]) -> None:
    entries = REVIEW_ENTRY_RE.findall(packet)
    pair_ids = REVIEW_PAIR_RE.findall(packet)
    pair_entries = [
        (match.group("first"), match.group("second"))
        for match in REVIEW_PAIR_ENTRIES_RE.finditer(packet)
    ]
    _require(len(entries) == 72, "review packet must contain exactly 72 entries")
    _require(
        entries == [f"RV-{index:03d}" for index in range(1, 73)],
        "review packet entry IDs must be neutral and sequential",
    )
    _require("Review group" not in packet, "review packet must not expose review groups")
    _require(
        pair_ids == [f"RP-{index:03d}" for index in range(1, 37)],
        "review packet must contain 36 sequential neutral pairs",
    )
    _require(len(pair_entries) == 36, "review packet pair map must contain 36 links")
    phase_one_index = packet.find("## Phase 1: Independent entries")
    phase_two_index = packet.find("## Phase 2: Pair comparison")
    first_entry_index = packet.find("### Entry RV-001")
    last_entry_index = packet.find("### Entry RV-072")
    _require(
        -1 < phase_one_index < first_entry_index < last_entry_index < phase_two_index,
        "review packet pair map must appear only after all entry content",
    )
    phase_one = packet[phase_one_index:phase_two_index]
    phase_two = packet[phase_two_index:]
    _require(
        len(REVIEW_ENTRY_RE.findall(phase_one)) == 72
        and not REVIEW_ENTRY_RE.findall(phase_two)
        and not REVIEW_PAIR_RE.findall(phase_one)
        and len(REVIEW_PAIR_RE.findall(phase_two)) == 36
        and phase_one.count("#### Reviewer fields") == 72,
        "review packet phases do not cleanly separate entries from pairs",
    )
    _require(
        packet.count("#### Derived claims") == 72,
        "review packet must show derived claims for every entry",
    )
    for line in READER_PROTOCOL_LINES:
        _require(
            packet.count(line) == 1,
            f"review packet reader protocol is missing or duplicated: {line}",
        )
    _require(
        packet.count("\n".join(READER_PROTOCOL_LINES)) == 1,
        "review packet reader protocol order or wording changed",
    )
    _require(
        packet.count("#### Target query") == 72
        and packet.count('"targetQuery":') == 72,
        "review packet must preserve targetQuery for every entry",
    )
    _require('"request":' not in packet, "review packet must not use a request alias")
    _require(
        packet.count("- Required actions:") == 72
        and packet.count("- Prohibited actions:") == 72
        and packet.count("- Ambiguity:") == 72
        and packet.count("- Behavior equivalent:") == 36
        and packet.count("- Equivalence notes:") == 36,
        "review packet reviewer fields are incomplete",
    )
    linked_ids = [review_id for pair in pair_entries for review_id in pair]
    _require(
        len(linked_ids) == len(set(linked_ids)) == 72
        and set(linked_ids) == set(entries),
        "review packet pair map must link every entry exactly once",
    )
    _, expected_entry_mapping, _, expected_pair_mapping = review_entries(source)
    _require(
        all(
            expected_entry_mapping[left]["pairId"]
            != expected_entry_mapping[right]["pairId"]
            for left, right in zip(entries, entries[1:])
        ),
        "review packet places paired views next to each other",
    )
    parsed_pairs = {
        pair_id: list(review_ids)
        for pair_id, review_ids in zip(pair_ids, pair_entries)
    }
    _require(
        parsed_pairs
        == {
            pair_id: mapping["reviewIds"]
            for pair_id, mapping in expected_pair_mapping.items()
        },
        "review packet pair map differs from deterministic generation",
    )
    for pair_id, review_ids in parsed_pairs.items():
        mapped = [expected_entry_mapping[review_id] for review_id in review_ids]
        _require(
            len({(item["streamId"], item["taskId"]) for item in mapped}) == 1,
            f"{pair_id}: pair entries do not belong to one task",
        )
        _require(
            {item["view"] for item in mapped}
            == {"observations-only", "claims-added"},
            f"{pair_id}: pair does not contain exactly two views",
        )
    hidden_patterns = {
        "gold": re.compile(r"\bgold\b", re.IGNORECASE),
        "distractor": re.compile(r"\bdistractor\b", re.IGNORECASE),
        "applicable": re.compile(r"\bapplicable\b", re.IGNORECASE),
        "oracle": re.compile(r"\boracle\b", re.IGNORECASE),
        "raw_direct": re.compile(r"\braw[_ -]direct\b", re.IGNORECASE),
        "oracle_enriched_direct": re.compile(
            r"\boracle[_ -]enriched[_ -]direct\b", re.IGNORECASE
        ),
        "model_enriched_direct": re.compile(
            r"\bmodel[_ -]enriched[_ -]direct\b", re.IGNORECASE
        ),
        "memoryType": re.compile(r"\bmemoryType\b", re.IGNORECASE),
        "queryType": re.compile(r"\bqueryType\b", re.IGNORECASE),
        "positionPatternId": re.compile(r"\bpositionPatternId\b", re.IGNORECASE),
        "governingClaimIds": re.compile(r"\bgoverningClaimIds\b", re.IGNORECASE),
        "requiredActionIds": re.compile(r"\brequiredActionIds\b", re.IGNORECASE),
        "prohibitedActionIds": re.compile(r"\bprohibitedActionIds\b", re.IGNORECASE),
        "observations-only": re.compile(r"\bobservations-only\b", re.IGNORECASE),
        "claims-added": re.compile(r"\bclaims-added\b", re.IGNORECASE),
    }
    for hidden_term, pattern in hidden_patterns.items():
        _require(
            pattern.search(packet) is None,
            f"review packet leaks hidden term {hidden_term!r}",
        )
    for stream in source["streams"]:
        hidden_ids: Iterable[str] = (
            [stream["id"]]
            + [observation["id"] for observation in stream["observations"]]
            + [claim["id"] for claim in stream["claims"]]
            + [task["id"] for task in stream["tasks"]]
        )
        for hidden_id in hidden_ids:
            _require(hidden_id not in packet, f"review packet leaks source ID {hidden_id}")


def claim_review_shuffle_seed(source: Mapping[str, Any]) -> int:
    digest = hashlib.sha256(
        f"claim-review-v1:{source['shuffleSeed']}".encode("utf-8")
    ).digest()
    seed = int.from_bytes(digest[:4], "big")
    _require(seed != source["shuffleSeed"], "claim-review shuffle seed must be distinct")
    return seed


def _neutralized_claim_review_entry(
    stream: dict[str, Any],
    claim: dict[str, Any],
    observation: dict[str, Any],
) -> dict[str, Any]:
    claims_by_id = {item["id"]: item for item in stream["claims"]}
    observations_by_id = {
        item["id"]: item for item in stream["observations"]
    }
    prior_map = {
        prior_id: f"P{index:02d}"
        for index, prior_id in enumerate(claim["supersedesClaimIds"], start=1)
    }
    prior_observation_map = {
        prior_id: f"PO{index:02d}"
        for index, prior_id in enumerate(claim["supersedesClaimIds"], start=1)
    }
    neutral_claim = {
        **claim,
        "id": "C01",
        "evidenceIds": ["O01"],
        "supersedesClaimIds": [
            prior_map[prior_id] for prior_id in claim["supersedesClaimIds"]
        ],
    }
    earlier_context = []
    for prior_id in claim["supersedesClaimIds"]:
        prior = claims_by_id[prior_id]
        prior_observation = observations_by_id[prior["evidenceIds"][0]]
        earlier_context.append(
            {
                "observation": {
                    **prior_observation,
                    "id": prior_observation_map[prior_id],
                },
                "claim": {
                    **prior,
                    "id": prior_map[prior_id],
                    "evidenceIds": [prior_observation_map[prior_id]],
                    "supersedesClaimIds": [],
                },
            }
        )
    return {
        "observation": {
            **observation,
            "id": "O01",
        },
        "claim": neutral_claim,
        "earlierClaimContext": earlier_context,
    }


def claim_review_entries(
    source: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    validate_source(source)
    source_entries = []
    for stream in source["streams"]:
        observations_by_id = {
            observation["id"]: observation for observation in stream["observations"]
        }
        for ordinal, claim in enumerate(stream["claims"], start=1):
            observation_id = claim["evidenceIds"][0]
            source_entries.append(
                (
                    stream,
                    claim,
                    observations_by_id[observation_id],
                    ordinal,
                )
            )
    rng = random.Random(claim_review_shuffle_seed(source))
    rng.shuffle(source_entries)
    entries = []
    mapping: dict[str, dict[str, Any]] = {}
    for index, (stream, claim, observation, ordinal) in enumerate(
        source_entries, start=1
    ):
        review_id = f"CR-{index:03d}"
        entries.append(
            {
                "reviewId": review_id,
                **_neutralized_claim_review_entry(stream, claim, observation),
            }
        )
        mapping[review_id] = {
            "streamId": stream["id"],
            "claimId": claim["id"],
            "observationId": observation["id"],
            "sourceOrdinal": ordinal,
        }
    _require(len(entries) == 144, "claim review generation must produce 144 entries")
    validate_claim_review_entries(entries)
    return entries, mapping


def validate_claim_review_entries(entries: Sequence[dict[str, Any]]) -> None:
    _require(len(entries) == 144, "claim review entries must contain 144 items")
    for entry in entries:
        review_id = entry["reviewId"]
        observation = entry["observation"]
        claim = entry["claim"]
        context = entry["earlierClaimContext"]
        _require(
            observation["id"] == "O01" and claim["evidenceIds"] == ["O01"],
            f"{review_id}: current claim evidence must point to displayed O01",
        )
        _require(
            isinstance(context, list),
            f"{review_id}: earlierClaimContext must be a list",
        )
        prior_claim_ids = []
        for index, item in enumerate(context, start=1):
            _require(
                isinstance(item, dict)
                and set(item) == {"observation", "claim"},
                f"{review_id}: earlier context item must contain observation and claim",
            )
            prior_observation = item["observation"]
            prior_claim = item["claim"]
            expected_observation_id = f"PO{index:02d}"
            expected_claim_id = f"P{index:02d}"
            _require(
                prior_observation["id"] == expected_observation_id,
                f"{review_id}: earlier observation ID must be {expected_observation_id}",
            )
            _require(
                prior_claim["id"] == expected_claim_id
                and prior_claim["evidenceIds"] == [expected_observation_id],
                f"{review_id}: earlier claim evidence must point to its displayed observation",
            )
            prior_claim_ids.append(expected_claim_id)
        _require(
            claim["supersedesClaimIds"] == prior_claim_ids,
            f"{review_id}: supersession IDs must match displayed earlier context",
        )


def build_claim_review_packet(
    source: dict[str, Any],
) -> tuple[str, dict[str, dict[str, Any]]]:
    entries, mapping = claim_review_entries(source)
    lines = [
        "# Independent claim review packet",
        "",
        "> Assess each fictional entry without using any other fixture material.",
        "> Check the claim against its bound observation and, when present, the",
        "> earlier claim context listed for its supersession link.",
        "",
        "## Kind rubric",
        "",
        *CLAIM_KIND_RUBRIC_LINES,
        "",
        "## Claim review contract",
        "",
        *CLAIM_REVIEW_CONTRACT_LINES,
        "",
    ]
    for entry in entries:
        lines.extend(
            [
                f"## Entry {entry['reviewId']}",
                "",
                "### Bound observation",
                "",
                *_json_block(entry["observation"]),
                "",
                "### Claim",
                "",
                *_json_block(entry["claim"]),
                "",
                "### Earlier claim context",
                "",
                *_json_block(entry["earlierClaimContext"]),
                "",
                "### Reviewer fields",
                "",
                "- Statement support:",
                "- Kind:",
                "- Subject key:",
                "- Exact scope:",
                "- Effective time and evidence binding:",
                "- Supersession:",
                "- Ambiguity:",
                "",
            ]
        )
    packet = "\n".join(lines).rstrip() + "\n"
    validate_claim_review_packet(packet, source)
    return packet, mapping


def validate_claim_review_packet(packet: str, source: dict[str, Any]) -> None:
    entries = CLAIM_REVIEW_ENTRY_RE.findall(packet)
    _require(len(entries) == 144, "claim review packet must contain 144 entries")
    _require(
        entries == [f"CR-{index:03d}" for index in range(1, 145)],
        "claim review entry IDs must be neutral and sequential",
    )
    for line in CLAIM_KIND_RUBRIC_LINES:
        _require(
            packet.count(line) == 1,
            f"claim review kind rubric is missing or duplicated: {line}",
        )
    _require(
        packet.count("\n".join(CLAIM_KIND_RUBRIC_LINES)) == 1,
        "claim review kind rubric order or wording changed",
    )
    for line in CLAIM_REVIEW_CONTRACT_LINES:
        _require(
            packet.count(line) == 1,
            f"claim review contract is missing or duplicated: {line}",
        )
    _require(
        packet.count("\n".join(CLAIM_REVIEW_CONTRACT_LINES)) == 1,
        "claim review contract order or wording changed",
    )
    _require(
        packet.count("### Earlier claim context") == 144,
        "claim review packet must show earlier claim context for every entry",
    )
    _require(
        "earlierClaimDetails" not in packet and '"PE01"' not in packet,
        "claim review packet contains the obsolete dangling-evidence structure",
    )
    for field in (
        "- Statement support:",
        "- Kind:",
        "- Subject key:",
        "- Exact scope:",
        "- Effective time and evidence binding:",
        "- Supersession:",
        "- Ambiguity:",
    ):
        _require(
            packet.count(field) == 144,
            f"claim review packet is missing reviewer field {field!r}",
        )
    for hidden_pattern, label in (
        (re.compile(r"\bgold\b", re.IGNORECASE), "gold"),
        (re.compile(r"\btarget\b", re.IGNORECASE), "target"),
        (re.compile(r"\bdistractor\b", re.IGNORECASE), "distractor"),
        (re.compile(r"\bapplicable\b", re.IGNORECASE), "applicable"),
        (re.compile(r"\boracle\b", re.IGNORECASE), "oracle"),
        (re.compile(r"\bstreamId\b", re.IGNORECASE), "streamId"),
        (re.compile(r"\btaskId\b", re.IGNORECASE), "taskId"),
        (re.compile(r"\bqueryType\b", re.IGNORECASE), "queryType"),
        (re.compile(r"\bconditionId\b", re.IGNORECASE), "conditionId"),
        (re.compile(r"\boutcomeId\b", re.IGNORECASE), "outcomeId"),
    ):
        _require(
            hidden_pattern.search(packet) is None,
            f"claim review packet leaks hidden term {label!r}",
        )
    for stream in source["streams"]:
        hidden_ids: Iterable[str] = (
            [stream["id"]]
            + [observation["id"] for observation in stream["observations"]]
            + [claim["id"] for claim in stream["claims"]]
            + [task["id"] for task in stream["tasks"]]
        )
        for hidden_id in hidden_ids:
            _require(
                hidden_id not in packet,
                f"claim review packet leaks source ID {hidden_id}",
            )


def parse_json_object(text: str, context: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise FixtureError(
            f"{context}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    _require(isinstance(value, dict), f"{context}: root must be an object")
    return value


def parse_behavior_labels(
    text: str,
    source: dict[str, Any],
    packet_text: str,
) -> dict[str, Any]:
    labels = parse_json_object(text, "behavior labels")
    _require(
        set(labels)
        == {
            "reviewType",
            "sourcePacket",
            "sourcePacketSha256",
            "limitations",
            "entries",
            "pairs",
        },
        "behavior labels: root fields do not match schema",
    )
    _require(
        labels["reviewType"] == "independent-blind",
        "behavior labels: unexpected reviewType",
    )
    _require(
        labels["sourcePacket"]
        == "workspace/agent-memory-research/cortex-lossless-memory-formation/"
        "artifacts/fixture-review-packet.md",
        "behavior labels: unexpected sourcePacket",
    )
    _require(
        labels["sourcePacketSha256"] == sha256_text(packet_text),
        "behavior labels: sourcePacketSha256 does not match reviewed packet",
    )
    _require(
        isinstance(labels["limitations"], str) and labels["limitations"].strip(),
        "behavior labels: limitations must be non-empty",
    )
    generated_entries, entry_mapping, _, pair_mapping = review_entries(source)
    visible_by_id = {entry["reviewId"]: entry for entry in generated_entries}
    entries = labels["entries"]
    _require(
        isinstance(entries, list) and len(entries) == 72,
        "behavior labels: expected exactly 72 entries",
    )
    expected_review_ids = [f"RV-{index:03d}" for index in range(1, 73)]
    review_ids = [entry.get("reviewId") for entry in entries if isinstance(entry, dict)]
    _require(
        review_ids == expected_review_ids,
        "behavior labels: entry IDs must be complete, unique, and ordered",
    )
    for entry in entries:
        review_id = entry["reviewId"]
        _require(
            set(entry)
            == {
                "reviewId",
                "requiredActionIds",
                "prohibitedActionIds",
                "ambiguous",
                "ambiguityNotes",
            },
            f"behavior labels/{review_id}: entry fields do not match schema",
        )
        required = entry["requiredActionIds"]
        prohibited = entry["prohibitedActionIds"]
        _require(
            isinstance(required, list)
            and isinstance(prohibited, list)
            and all(isinstance(action_id, str) for action_id in required + prohibited),
            f"behavior labels/{review_id}: action IDs must be string lists",
        )
        _require(
            len(required) == len(set(required))
            and len(prohibited) == len(set(prohibited))
            and not set(required).intersection(prohibited),
            f"behavior labels/{review_id}: action IDs are duplicated or overlap",
        )
        available = {
            action["actionId"] for action in visible_by_id[review_id]["actions"]
        }
        _require(
            set(required).union(prohibited) == available,
            f"behavior labels/{review_id}: actions must partition the entry catalog",
        )
        _require(
            type(entry["ambiguous"]) is bool,
            f"behavior labels/{review_id}: ambiguous must be boolean",
        )
        _require(
            isinstance(entry["ambiguityNotes"], str),
            f"behavior labels/{review_id}: ambiguityNotes must be a string",
        )
        _require(
            review_id in entry_mapping,
            f"behavior labels/{review_id}: unknown neutral entry ID",
        )

    pairs = labels["pairs"]
    _require(
        isinstance(pairs, list) and len(pairs) == 36,
        "behavior labels: expected exactly 36 pairs",
    )
    expected_pair_ids = [f"RP-{index:03d}" for index in range(1, 37)]
    pair_ids = [pair.get("pairId") for pair in pairs if isinstance(pair, dict)]
    _require(
        pair_ids == expected_pair_ids,
        "behavior labels: pair IDs must be complete, unique, and ordered",
    )
    covered_review_ids: list[str] = []
    for pair in pairs:
        pair_id = pair["pairId"]
        _require(
            set(pair)
            == {"pairId", "entryIds", "behaviorEquivalent", "equivalenceNotes"},
            f"behavior labels/{pair_id}: pair fields do not match schema",
        )
        entry_ids = pair["entryIds"]
        _require(
            isinstance(entry_ids, list)
            and len(entry_ids) == 2
            and len(set(entry_ids)) == 2
            and all(isinstance(review_id, str) for review_id in entry_ids),
            f"behavior labels/{pair_id}: entryIds must contain two unique IDs",
        )
        _require(
            entry_ids == pair_mapping[pair_id]["reviewIds"],
            f"behavior labels/{pair_id}: entryIds differ from generated pair mapping",
        )
        covered_review_ids.extend(entry_ids)
        _require(
            type(pair["behaviorEquivalent"]) is bool,
            f"behavior labels/{pair_id}: behaviorEquivalent must be boolean",
        )
        _require(
            isinstance(pair["equivalenceNotes"], str),
            f"behavior labels/{pair_id}: equivalenceNotes must be a string",
        )
    _require(
        len(covered_review_ids) == len(set(covered_review_ids)) == 72
        and set(covered_review_ids) == set(expected_review_ids),
        "behavior labels: pairs must cover every entry exactly once",
    )
    return labels


def parse_claim_labels(text: str, packet_text: str) -> dict[str, Any]:
    labels = parse_json_object(text, "claim labels")
    _require(
        set(labels)
        == {
            "reviewType",
            "sourcePacket",
            "sourcePacketSha256",
            "limitations",
            "entries",
        },
        "claim labels: root fields do not match schema",
    )
    _require(
        labels["reviewType"] == "independent-blind-claim-review",
        "claim labels: unexpected reviewType",
    )
    _require(
        labels["sourcePacket"] == "fixture-claim-review-packet.md",
        "claim labels: unexpected sourcePacket",
    )
    _require(
        labels["sourcePacketSha256"] == sha256_text(packet_text),
        "claim labels: sourcePacketSha256 does not match reviewed packet",
    )
    _require(
        isinstance(labels["limitations"], str) and labels["limitations"].strip(),
        "claim labels: limitations must be non-empty",
    )
    entries = labels["entries"]
    _require(
        isinstance(entries, list) and len(entries) == 144,
        "claim labels: expected exactly 144 entries",
    )
    expected_ids = [f"CR-{index:03d}" for index in range(1, 145)]
    review_ids = [entry.get("reviewId") for entry in entries if isinstance(entry, dict)]
    _require(
        review_ids == expected_ids,
        "claim labels: entry IDs must be complete, unique, and ordered",
    )
    judgment_fields = (
        "statementSupport",
        "kind",
        "subjectKey",
        "exactScope",
        "effectiveTimeAndEvidenceBinding",
        "supersession",
    )
    for entry in entries:
        review_id = entry["reviewId"]
        _require(
            set(entry)
            == {
                "reviewId",
                *judgment_fields,
                "ambiguous",
                "notes",
            },
            f"claim labels/{review_id}: entry fields do not match schema",
        )
        for field in judgment_fields:
            _require(
                entry[field] in {"pass", "fail"},
                f"claim labels/{review_id}: {field} must be pass or fail",
            )
        _require(
            type(entry["ambiguous"]) is bool,
            f"claim labels/{review_id}: ambiguous must be boolean",
        )
        _require(
            isinstance(entry["notes"], str),
            f"claim labels/{review_id}: notes must be a string",
        )
    return labels


def adjudicate_behavior_labels(
    source: dict[str, Any],
    packet_text: str,
    label_text: str,
) -> dict[str, Any]:
    labels = parse_behavior_labels(label_text, source, packet_text)
    _, entry_mapping, _, pair_mapping = review_entries(source)
    tasks_by_id = {
        (stream["id"], task["id"]): task
        for stream in source["streams"]
        for task in stream["tasks"]
    }
    required_matches = 0
    prohibited_matches = 0
    for entry in labels["entries"]:
        mapping = entry_mapping[entry["reviewId"]]
        task = tasks_by_id[(mapping["streamId"], mapping["taskId"])]
        _require(
            set(entry["requiredActionIds"]) == set(task["requiredActionIds"]),
            f"behavior adjudication/{entry['reviewId']}: required actions disagree with gold",
        )
        required_matches += 1
        _require(
            set(entry["prohibitedActionIds"]) == set(task["prohibitedActionIds"]),
            f"behavior adjudication/{entry['reviewId']}: prohibited actions disagree with gold",
        )
        prohibited_matches += 1
        _require(
            entry["ambiguous"] is False,
            f"behavior adjudication/{entry['reviewId']}: entry is ambiguous",
        )
        _require(
            entry["ambiguityNotes"] == "",
            f"behavior adjudication/{entry['reviewId']}: notes must be empty when unambiguous",
        )
    equivalent_pairs = 0
    for pair in labels["pairs"]:
        pair_id = pair["pairId"]
        _require(
            pair["entryIds"] == pair_mapping[pair_id]["reviewIds"],
            f"behavior adjudication/{pair_id}: pair mapping mismatch",
        )
        _require(
            pair["behaviorEquivalent"] is True,
            f"behavior adjudication/{pair_id}: behaviorEquivalent must be true",
        )
        _require(
            pair["equivalenceNotes"] == "",
            f"behavior adjudication/{pair_id}: equivalenceNotes must be empty on pass",
        )
        equivalent_pairs += 1
    return {
        "schemaVersion": SCHEMA_VERSION,
        "adjudicationType": "behavior-review",
        "status": "passed",
        "reviewDate": REVIEW_DATE,
        "fixtureContentSha256": fixture_content_sha256(source),
        "packet": {
            "path": "artifacts/fixture-review-packet.md",
            "sha256": sha256_text(packet_text),
        },
        "labels": {
            "path": "artifacts/fixture-review-labels.blind.json",
            "sha256": sha256_text(label_text),
        },
        "reviewerLimitation": labels["limitations"],
        "agreementCounts": {
            "entries": 72,
            "requiredActionSets": required_matches,
            "prohibitedActionSets": prohibited_matches,
            "fullActionPartitions": 72,
            "pairs": 36,
            "behaviorEquivalent": equivalent_pairs,
        },
        "ambiguityCounts": {"entries": 0},
    }


def adjudicate_claim_labels(
    source: dict[str, Any],
    packet_text: str,
    label_text: str,
) -> dict[str, Any]:
    labels = parse_claim_labels(label_text, packet_text)
    judgment_fields = (
        "statementSupport",
        "kind",
        "subjectKey",
        "exactScope",
        "effectiveTimeAndEvidenceBinding",
        "supersession",
    )
    counts = {field: 0 for field in judgment_fields}
    full_passes = 0
    for entry in labels["entries"]:
        review_id = entry["reviewId"]
        for field in judgment_fields:
            _require(
                entry[field] == "pass",
                f"claim adjudication/{review_id}: {field} did not pass",
            )
            counts[field] += 1
        _require(
            entry["ambiguous"] is False,
            f"claim adjudication/{review_id}: entry is ambiguous",
        )
        _require(
            entry["notes"] == "",
            f"claim adjudication/{review_id}: notes must be empty on full pass",
        )
        full_passes += 1
    return {
        "schemaVersion": SCHEMA_VERSION,
        "adjudicationType": "claim-review",
        "status": "passed",
        "reviewDate": REVIEW_DATE,
        "fixtureContentSha256": fixture_content_sha256(source),
        "packet": {
            "path": "artifacts/fixture-claim-review-packet.md",
            "sha256": sha256_text(packet_text),
        },
        "labels": {
            "path": "artifacts/fixture-claim-review-labels.blind.json",
            "sha256": sha256_text(label_text),
        },
        "reviewerLimitation": labels["limitations"],
        "agreementCounts": {
            "entries": 144,
            "fullPasses": full_passes,
            **counts,
        },
        "ambiguityCounts": {"entries": 0},
    }


def validate_review_state(
    source: dict[str, Any],
    behavior_adjudication: dict[str, Any] | None,
    claim_adjudication: dict[str, Any] | None,
) -> None:
    if source["reviewStatus"] == "draft":
        _require(
            behavior_adjudication is None and claim_adjudication is None,
            "draft source must not have adjudications",
        )
        return
    _require(
        behavior_adjudication is not None and claim_adjudication is not None,
        "approved source requires both adjudications",
    )
    content_hash = fixture_content_sha256(source)
    for name, adjudication in (
        ("behavior", behavior_adjudication),
        ("claim", claim_adjudication),
    ):
        _require(
            adjudication.get("status") == "passed",
            f"approved source requires passing {name} adjudication",
        )
        _require(
            adjudication.get("fixtureContentSha256") == content_hash,
            f"{name} adjudication fixtureContentSha256 mismatch",
        )


def _balance_tables(source: dict[str, Any]) -> dict[str, Any]:
    streams = source["streams"]
    action_position_patterns = {}
    for mechanism in MECHANISMS:
        patterns = []
        for stream in streams:
            if stream["mechanism"] != mechanism:
                continue
            action_ids = [action["actionId"] for action in stream["actions"]]
            claims_by_observation = _claim_by_observation(stream["claims"])
            rules_by_claim = {
                rule["claimId"]: rule["requiredActionIds"]
                for rule in stream["claimActionRules"]
            }
            chain_rules = [
                rules_by_claim[
                    claims_by_observation[observation_id]["id"]
                ]
                for observation_id in stream["targetObservationIds"]
            ]
            non_empty = [rule[0] for rule in chain_rules if rule]
            patterns.append(
                {
                    "streamId": stream["id"],
                    "positions": [
                        action_ids.index(action_id) + 1
                        for action_id in non_empty
                    ],
                }
            )
        action_position_patterns[mechanism] = patterns
    return {
        "memoryTypes": {
            memory_type: sum(stream["memoryType"] == memory_type for stream in streams)
            for memory_type in MEMORY_TYPES
        },
        "mechanisms": {
            mechanism: sum(stream["mechanism"] == mechanism for stream in streams)
            for mechanism in MECHANISMS
        },
        "mechanismsByMemoryType": {
            memory_type: {
                mechanism: sum(
                    stream["memoryType"] == memory_type
                    and stream["mechanism"] == mechanism
                    for stream in streams
                )
                for mechanism in MECHANISMS
            }
            for memory_type in MEMORY_TYPES
        },
        "positionPatternsByMemoryType": {
            memory_type: {
                pattern_id: sum(
                    stream["memoryType"] == memory_type
                    and stream["positionPatternId"] == pattern_id
                    for stream in streams
                )
                for pattern_id in POSITION_PATTERNS
            }
            for memory_type in MEMORY_TYPES
        },
        "queryTypes": {
            query_type: sum(
                task["queryType"] == query_type
                for stream in streams
                for task in stream["tasks"]
            )
            for query_type in QUERY_TYPES
        },
        "targetScopeLevels": dict(
            sorted(
                Counter(
                    claim["scope"]["level"]
                    for stream in streams
                    for claim in (
                        _claim_by_observation(stream["claims"])[observation_id]
                        for observation_id in stream["targetObservationIds"]
                    )
                ).items()
            )
        ),
        "chainActionPositionPatterns": action_position_patterns,
    }


def build_manifest(
    source: dict[str, Any],
    source_text: str,
    review_packet: str,
    review_mapping: dict[str, dict[str, Any]],
    review_pair_mapping: dict[str, dict[str, Any]],
    claim_review_packet: str,
    claim_review_mapping: dict[str, dict[str, Any]],
    behavior_label_text: str,
    claim_label_text: str,
    behavior_adjudication: dict[str, Any],
    behavior_adjudication_text: str,
    claim_adjudication: dict[str, Any],
    claim_adjudication_text: str,
) -> dict[str, Any]:
    validate_source(source)
    validate_review_packet(review_packet, source)
    validate_claim_review_packet(claim_review_packet, source)
    validate_review_state(source, behavior_adjudication, claim_adjudication)
    for limitation in (KIND_CUE_LIMITATION, ORACLE_COPY_LIMITATION):
        _require(
            limitation not in review_packet
            and limitation not in claim_review_packet,
            "manifest-only limitation leaked into a review packet",
        )
    stream_entries = []
    for stream in source["streams"]:
        stream_entries.append(
            {
                "streamId": stream["id"],
                "sourceSha256": sha256_json(stream),
                "observationSetSha256": sha256_json(stream["observations"]),
                "claimSetSha256": sha256_json(stream["claims"]),
                "taskSetSha256": sha256_json(stream["tasks"]),
            }
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "frozen",
        "reviewStatus": source["reviewStatus"],
        "fixtureContentSha256": fixture_content_sha256(source),
        "generatedFrom": "artifacts/fixture-source.json",
        "generator": "code/build_fixture_artifacts.py",
        "generationCommand": "python3 code/build_fixture_artifacts.py",
        "checkCommand": "python3 code/build_fixture_artifacts.py --check",
        "shuffleSeed": source["shuffleSeed"],
        "behaviorPairShuffleSeed": behavior_pair_shuffle_seed(source),
        "claimReviewShuffleSeed": claim_review_shuffle_seed(source),
        "limitations": [KIND_CUE_LIMITATION, ORACLE_COPY_LIMITATION],
        "hashes": {
            "sourceSha256": sha256_text(source_text),
            "fixtureContentSha256": fixture_content_sha256(source),
            "reviewPacketSha256": sha256_text(review_packet),
            "claimReviewPacketSha256": sha256_text(claim_review_packet),
            "behaviorLabelSha256": sha256_text(behavior_label_text),
            "claimLabelSha256": sha256_text(claim_label_text),
            "behaviorAdjudicationSha256": sha256_text(behavior_adjudication_text),
            "claimAdjudicationSha256": sha256_text(claim_adjudication_text),
        },
        "counts": {
            "streams": len(source["streams"]),
            "observations": sum(len(stream["observations"]) for stream in source["streams"]),
            "claims": sum(len(stream["claims"]) for stream in source["streams"]),
            "tasks": sum(len(stream["tasks"]) for stream in source["streams"]),
            "reviewEntries": len(review_mapping),
            "reviewPairs": len(review_pair_mapping),
            "claimReviewEntries": len(claim_review_mapping),
        },
        "reviewArtifacts": {
            "behavior": {
                "path": "artifacts/fixture-review-packet.md",
                "sha256": sha256_text(review_packet),
                "entryCount": len(review_mapping),
                "pairCount": len(review_pair_mapping),
                "readerVisibleFields": [
                    "actions",
                    "observations",
                    "derivedClaims",
                    "scopePath",
                    "queryAt",
                    "conversation",
                    "targetQuery",
                ],
                "labels": {
                    "path": "artifacts/fixture-review-labels.blind.json",
                    "sha256": sha256_text(behavior_label_text),
                },
                "adjudication": {
                    "path": "artifacts/fixture-review-adjudication.json",
                    "sha256": sha256_text(behavior_adjudication_text),
                    "status": behavior_adjudication["status"],
                    "agreementCounts": behavior_adjudication["agreementCounts"],
                    "ambiguityCounts": behavior_adjudication["ambiguityCounts"],
                },
            },
            "claims": {
                "path": "artifacts/fixture-claim-review-packet.md",
                "sha256": sha256_text(claim_review_packet),
                "entryCount": len(claim_review_mapping),
                "readerVisibleFields": [
                    "observation",
                    "claim",
                    "earlierClaimContext",
                ],
                "labels": {
                    "path": "artifacts/fixture-claim-review-labels.blind.json",
                    "sha256": sha256_text(claim_label_text),
                },
                "adjudication": {
                    "path": "artifacts/fixture-claim-review-adjudication.json",
                    "sha256": sha256_text(claim_adjudication_text),
                    "status": claim_adjudication["status"],
                    "agreementCounts": claim_adjudication["agreementCounts"],
                    "ambiguityCounts": claim_adjudication["ambiguityCounts"],
                },
            },
        },
        "balance": _balance_tables(source),
        "streams": stream_entries,
        "neutralBehaviorReviewMapping": review_mapping,
        "neutralBehaviorPairMapping": review_pair_mapping,
        "neutralClaimReviewMapping": claim_review_mapping,
    }


def read_required_text(path: Path, context: str) -> str:
    try:
        value = path.read_bytes()
    except FileNotFoundError as exc:
        raise FixtureError(f"{context} is missing: {path}") from exc
    return decode_utf8(value, context)


def build_adjudications(
    source: dict[str, Any],
    review_packet: str,
    claim_review_packet: str,
    behavior_label_text: str,
    claim_label_text: str,
) -> tuple[dict[str, Any], str, dict[str, Any], str]:
    behavior = adjudicate_behavior_labels(
        source,
        review_packet,
        behavior_label_text,
    )
    claims = adjudicate_claim_labels(
        source,
        claim_review_packet,
        claim_label_text,
    )
    return behavior, canonical_json(behavior), claims, canonical_json(claims)


def verify_adjudication_contents(
    expected_behavior: str,
    expected_claims: str,
    actual_behavior: str,
    actual_claims: str,
) -> None:
    _require(
        actual_behavior == expected_behavior,
        "derived drift: fixture-review-adjudication.json differs from adjudication",
    )
    _require(
        actual_claims == expected_claims,
        "derived drift: fixture-claim-review-adjudication.json differs from adjudication",
    )


def adjudicate_and_freeze(
    source: dict[str, Any],
    source_text: str,
    actual_review_packet: str,
    actual_claim_review_packet: str,
    behavior_label_text: str,
    claim_label_text: str,
) -> tuple[str, str, str, str]:
    validate_source(source)
    validate_review_state(source, None, None)
    _require(
        source["reviewStatus"] == "draft",
        "--adjudicate requires a draft source",
    )
    review_packet, review_mapping, review_pair_mapping = build_review_packet(source)
    claim_review_packet, claim_review_mapping = build_claim_review_packet(source)
    _require(
        actual_review_packet == review_packet,
        "reviewed behavior packet bytes differ from canonical generation",
    )
    _require(
        actual_claim_review_packet == claim_review_packet,
        "reviewed claim packet bytes differ from canonical generation",
    )
    content_hash = fixture_content_sha256(source)
    behavior, behavior_text, claims, claims_text = build_adjudications(
        source,
        review_packet,
        claim_review_packet,
        behavior_label_text,
        claim_label_text,
    )
    approved_source = copy.deepcopy(source)
    approved_source["reviewStatus"] = "approved"
    _require(
        fixture_content_sha256(approved_source) == content_hash,
        "fixtureContentSha256 changed during reviewStatus transition",
    )
    approved_source_text = canonical_json(approved_source)
    validate_source(approved_source)
    validate_review_state(approved_source, behavior, claims)
    manifest = build_manifest(
        approved_source,
        approved_source_text,
        review_packet,
        review_mapping,
        review_pair_mapping,
        claim_review_packet,
        claim_review_mapping,
        behavior_label_text,
        claim_label_text,
        behavior,
        behavior_text,
        claims,
        claims_text,
    )
    return approved_source_text, behavior_text, claims_text, canonical_json(manifest)


def build_artifacts(
    source: dict[str, Any], source_text: str
) -> tuple[str, str, str]:
    validate_source(source)
    _require(
        source["reviewStatus"] == "approved",
        "final build requires approved reviewStatus",
    )
    review_packet, review_mapping, review_pair_mapping = build_review_packet(source)
    claim_review_packet, claim_review_mapping = build_claim_review_packet(source)
    behavior_label_text = read_required_text(
        BEHAVIOR_LABELS_PATH, "behavior label file"
    )
    claim_label_text = read_required_text(CLAIM_LABELS_PATH, "claim label file")
    behavior, behavior_text, claims, claims_text = build_adjudications(
        source,
        review_packet,
        claim_review_packet,
        behavior_label_text,
        claim_label_text,
    )
    actual_behavior = read_required_text(
        BEHAVIOR_ADJUDICATION_PATH, "behavior adjudication"
    )
    actual_claims = read_required_text(
        CLAIM_ADJUDICATION_PATH, "claim adjudication"
    )
    verify_adjudication_contents(
        behavior_text,
        claims_text,
        actual_behavior,
        actual_claims,
    )
    validate_review_state(source, behavior, claims)
    manifest = build_manifest(
        source,
        source_text,
        review_packet,
        review_mapping,
        review_pair_mapping,
        claim_review_packet,
        claim_review_mapping,
        behavior_label_text,
        claim_label_text,
        behavior,
        behavior_text,
        claims,
        claims_text,
    )
    return review_packet, claim_review_packet, canonical_json(manifest)


def verify_artifact_contents(
    expected_review: str,
    expected_claim_review: str,
    expected_manifest: str,
    actual_review: str,
    actual_claim_review: str,
    actual_manifest: str,
) -> None:
    _require(
        actual_review == expected_review,
        "derived drift: fixture-review-packet.md differs from canonical generation",
    )
    _require(
        actual_claim_review == expected_claim_review,
        "derived drift: fixture-claim-review-packet.md differs from canonical generation",
    )
    _require(
        actual_manifest == expected_manifest,
        "derived drift: fixture-manifest.json differs from canonical generation",
    )


def write_artifacts(
    review_packet: str,
    claim_review_packet: str,
    manifest_text: str,
    review_path: Path = REVIEW_PATH,
    claim_review_path: Path = CLAIM_REVIEW_PATH,
    manifest_path: Path = MANIFEST_PATH,
) -> None:
    review_path.parent.mkdir(parents=True, exist_ok=True)
    review_path.write_bytes(review_packet.encode("utf-8"))
    claim_review_path.write_bytes(claim_review_packet.encode("utf-8"))
    manifest_path.write_bytes(manifest_text.encode("utf-8"))


def check_artifacts(
    expected_review: str,
    expected_claim_review: str,
    expected_manifest: str,
    review_path: Path = REVIEW_PATH,
    claim_review_path: Path = CLAIM_REVIEW_PATH,
    manifest_path: Path = MANIFEST_PATH,
) -> None:
    actual_review = read_required_text(review_path, "derived behavior packet")
    actual_claim_review = read_required_text(
        claim_review_path, "derived claim packet"
    )
    actual_manifest = read_required_text(manifest_path, "derived manifest")
    verify_artifact_contents(
        expected_review,
        expected_claim_review,
        expected_manifest,
        actual_review,
        actual_claim_review,
        actual_manifest,
    )
    try:
        parsed_manifest = json.loads(actual_manifest)
    except json.JSONDecodeError as exc:
        raise FixtureError(f"manifest JSON is invalid: {exc.msg}") from exc
    _require(
        actual_manifest == canonical_json(parsed_manifest),
        "fixture-manifest.json is not canonical JSON",
    )


def _summary(
    source_text: str,
    review_packet: str,
    claim_review_packet: str,
    verb: str,
) -> str:
    return (
        f"{verb}: 12 streams, 144 observations, 144 claims, 36 tasks, "
        f"72 behavior entries, 144 claim entries; "
        f"source sha256={sha256_text(source_text)[:12]}, "
        f"behavior sha256={sha256_text(review_packet)[:12]}, "
        f"claims sha256={sha256_text(claim_review_packet)[:12]}"
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate or check the lossless-memory fixture review packet and manifest."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate the source and fail if generated artifacts have drifted",
    )
    parser.add_argument(
        "--adjudicate",
        action="store_true",
        help="adjudicate blind labels, approve the source, and write freeze artifacts",
    )
    args = parser.parse_args(argv)
    try:
        source, source_text = load_source()
        _require(
            not (args.check and args.adjudicate),
            "--check and --adjudicate are mutually exclusive",
        )
        if args.adjudicate:
            _require(
                not BEHAVIOR_ADJUDICATION_PATH.exists()
                and not CLAIM_ADJUDICATION_PATH.exists(),
                "draft source must not have adjudication files",
            )
            actual_review = read_required_text(REVIEW_PATH, "reviewed behavior packet")
            actual_claim_review = read_required_text(
                CLAIM_REVIEW_PATH, "reviewed claim packet"
            )
            behavior_labels = read_required_text(
                BEHAVIOR_LABELS_PATH, "behavior label file"
            )
            claim_labels = read_required_text(CLAIM_LABELS_PATH, "claim label file")
            (
                approved_source_text,
                behavior_adjudication_text,
                claim_adjudication_text,
                manifest_text,
            ) = adjudicate_and_freeze(
                source,
                source_text,
                actual_review,
                actual_claim_review,
                behavior_labels,
                claim_labels,
            )
            SOURCE_PATH.write_bytes(approved_source_text.encode("utf-8"))
            BEHAVIOR_ADJUDICATION_PATH.write_bytes(
                behavior_adjudication_text.encode("utf-8")
            )
            CLAIM_ADJUDICATION_PATH.write_bytes(
                claim_adjudication_text.encode("utf-8")
            )
            MANIFEST_PATH.write_bytes(manifest_text.encode("utf-8"))
            print(
                "adjudication passed: 72 behavior entries, 36 behavior pairs, "
                "144 claim entries; fixture frozen"
            )
            return 0
        review_packet, claim_review_packet, manifest_text = build_artifacts(
            source, source_text
        )
        if args.check:
            check_artifacts(review_packet, claim_review_packet, manifest_text)
            print(
                _summary(
                    source_text,
                    review_packet,
                    claim_review_packet,
                    "check passed",
                )
            )
        else:
            write_artifacts(review_packet, claim_review_packet, manifest_text)
            print(
                _summary(
                    source_text,
                    review_packet,
                    claim_review_packet,
                    "generated",
                )
            )
        return 0
    except FixtureError as exc:
        print(f"fixture error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
