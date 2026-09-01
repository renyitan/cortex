"""Content-minimal append-only cognition events for cortex runtime tools."""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import stat
import subprocess
import uuid
from contextlib import nullcontext
from pathlib import Path

try:
    import fcntl
except ImportError:
    fcntl = None
try:
    import msvcrt
except ImportError:
    msvcrt = None

SCHEMA_VERSION = "1"
TOKEN_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
REASON_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
UUID_LIKE_RE = re.compile(
    r"^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-"
    r"[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
    re.IGNORECASE,
)
MEMORY_REF_RE = re.compile(r"^memory/(?:learnings|decisions)\.md::[^\n]+$")
PATH_REF_RE = re.compile(r"^(?:memory|workspace|\.cortex)/[A-Za-z0-9._/-]+$")
PHASES = {"wake", "work", "sleep", "curate"}
SKILLS = {"recall", "consolidate", "curate", "encode", "ambient"}
TRIGGERS = {
    "session_start", "work_boundary", "episode_done", "iteration_done",
    "recurrence", "operator_request", "curate_debt", "structural_change",
    "audit_failure",
}
ORIGINS = {"runtime", "harness"}
REQUIREMENTS = {"required", "offered"}
ENFORCEMENTS = {
    "enforced", "nudged", "model_owned", "operator_invoked", "unknown",
}
CORRELATIONS = {"exact", "temporal", "unavailable"}
EFFECTS = {
    "none", "memory_write", "intake_transition", "skill_change",
    "episode_archive", "index_refresh", "report_write",
}
EVENT_STATUSES = {
    "retrieval.ensure": {"ok", "degraded", "failed"},
    "retrieval.rebuild": {"ok", "failed"},
    "retrieval.search": {"ok", "degraded", "failed"},
    "retrieval.fetch": {"ok", "not_found", "failed"},
    "retrieval.expand": {"ok", "partial", "not_found", "failed"},
    "intake.capture_nudge": {"nudged"},
    "intake.drain_nudge": {"nudged"},
    "intake.drain_outcome": {"effective", "ineffective", "unknown"},
    "consolidation.plan_validated": {"ok"},
    "consolidation.plan_rejected": {"rejected"},
    "consolidation.apply_started": {"ok"},
    "consolidation.apply_completed": {"ok"},
    "consolidation.apply_partial": {"partial"},
    "consolidation.apply_failed": {"failed"},
    "phase.expected": {"due"},
    "skill.loaded": {"observed"},
    "phase.invoked": {"started"},
    "phase.completed": {"ok", "failed"},
    "phase.skipped": {"skipped"},
    "phase.missed": {"missed"},
    "phase.effect_committed": {"ok"},
    "phase.abandoned": {"abandoned"},
}
LIFECYCLE_EVENTS = {
    "phase.expected", "skill.loaded", "phase.invoked", "phase.completed",
    "phase.skipped", "phase.missed", "phase.effect_committed",
    "phase.abandoned",
}
FORBIDDEN_ATTRIBUTE_KEYS = {
    "prompt", "response", "query", "note", "record", "evidence", "content",
    "arguments", "args", "result", "credential", "credentials", "secret",
    "token", "environment", "env", "url", "absolute_path",
    "receipt_id", "phase_receipt_id",
}


def repo_root() -> Path:
    configured = (
        os.environ.get("CORTEX_EVENT_REPO_ROOT")
        or os.environ.get("CORTEX_REPO_ROOT")
    )
    if configured:
        return Path(configured).resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            capture_output=True,
            check=True,
        )
        return Path(result.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        return Path.cwd()


def events_enabled() -> bool:
    value = os.environ.get("CORTEX_EVENTS", "on").strip().lower()
    return value not in {"0", "false", "no", "off"}


def events_path(root: Path | None = None) -> Path:
    configured = os.environ.get("CORTEX_EVENTS_FILE")
    if configured:
        return Path(configured)
    return Path(".cortex/cognition-events.jsonl")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def capability_manifest_hash() -> str | None:
    path = Path(__file__).resolve().parent.parent / "identity/capabilities.md"
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def _valid_artifact_ref(value: str) -> bool:
    if MEMORY_REF_RE.fullmatch(value):
        return True
    return (
        PATH_REF_RE.fullmatch(value) is not None
        and ".." not in Path(value).parts
    )


def _validate_mapping(
    name: str,
    values: dict | None,
    value_check,
) -> dict:
    output = {}
    for key, value in (values or {}).items():
        if not KEY_RE.fullmatch(key) or not value_check(value):
            raise ValueError(f"invalid {name} entry")
        output[key] = value
    return output


def _validate_reserved_attributes(attributes: dict) -> None:
    if any(
        key in FORBIDDEN_ATTRIBUTE_KEYS
        or key.endswith((
            "_text", "_content", "_body", "_prose", "_prompt",
            "_response", "_note",
        ))
        for key in attributes
    ):
        raise ValueError("content-bearing attribute forbidden")
    enums = {
        "phase": PHASES,
        "skill": SKILLS,
        "trigger": TRIGGERS,
        "origin": ORIGINS,
        "requirement": REQUIREMENTS,
        "enforcement": ENFORCEMENTS,
        "correlation": CORRELATIONS,
        "effect": EFFECTS,
    }
    for key, values in enums.items():
        if key in attributes and attributes[key] not in values:
            raise ValueError(f"invalid {key}")
    for key in ("expectation_id", "phase_instance_id"):
        if key in attributes and not UUID_LIKE_RE.fullmatch(
            str(attributes[key])
        ):
            raise ValueError(f"invalid {key}")
    if "phase_start_run_id" in attributes and not TOKEN_RE.fullmatch(
        str(attributes["phase_start_run_id"])
    ):
        raise ValueError("invalid phase_start_run_id")
    if "lane_id_hash" in attributes and not HASH_RE.fullmatch(
        str(attributes["lane_id_hash"])
    ):
        raise ValueError("invalid lane_id_hash")
    if "owner_id_hash" in attributes and not HASH_RE.fullmatch(
        str(attributes["owner_id_hash"])
    ):
        raise ValueError("invalid owner_id_hash")
    if "lease_seconds" in attributes and (
        not isinstance(attributes["lease_seconds"], int)
        or not 1 <= attributes["lease_seconds"] <= 1800
    ):
        raise ValueError("invalid lease_seconds")
    if "parent_phase_instance_id" in attributes and not UUID_LIKE_RE.fullmatch(
        str(attributes["parent_phase_instance_id"])
    ):
        raise ValueError("invalid parent_phase_instance_id")


def _validate_lifecycle_event(
    event: str,
    run_id: str,
    parent_run_id: str | None,
    attributes: dict,
) -> None:
    if event not in LIFECYCLE_EVENTS:
        return
    required = {"skill", "correlation", "lane_id_hash"}
    if event != "skill.loaded":
        required.add("phase")
    if event in {
        "phase.expected", "phase.invoked", "phase.skipped", "phase.missed",
    }:
        required.update({
            "trigger", "origin", "requirement", "enforcement", "effect",
        })
    if event in {
        "phase.invoked", "phase.completed", "phase.effect_committed",
        "phase.abandoned",
    }:
        required.add("phase_start_run_id")
    if event in {
        "phase.completed", "phase.effect_committed", "phase.abandoned",
    }:
        required.add("effect")
    if event in {"phase.expected", "phase.skipped", "phase.missed"}:
        required.add("expectation_id")
    if event in {
        "phase.invoked", "phase.completed", "phase.effect_committed",
        "phase.abandoned",
    }:
        required.add("phase_instance_id")
    if not required.issubset(attributes):
        raise ValueError("missing lifecycle attributes")
    if event == "phase.invoked" and attributes["phase_start_run_id"] != run_id:
        raise ValueError("phase_start_run_id must match invocation run_id")
    if event in {
        "phase.completed", "phase.effect_committed", "phase.abandoned",
    } and attributes["correlation"] == "exact":
        if parent_run_id != attributes["phase_start_run_id"]:
            raise ValueError("exact terminal parent mismatch")
    if (
        event == "phase.effect_committed"
        and attributes["effect"] == "none"
    ):
        raise ValueError("committed effect cannot be none")
    if (
        event == "skill.loaded"
        and "expectation_id" in attributes
        and attributes["correlation"] != "exact"
    ):
        raise ValueError("uncorrelated skill load cannot name expectation")


def build_event(
    event: str,
    status: str,
    *,
    event_id: str | None = None,
    repo_id: str | None = None,
    episode_id: str | None = None,
    run_id: str | None = None,
    turn_id: str | None = None,
    parent_run_id: str | None = None,
    component: str | None = None,
    capability_hash: str | None = None,
    duration_ms: int | None = None,
    reason_code: str | None = None,
    refs: list[str] | None = None,
    counts: dict[str, int] | None = None,
    hashes: dict[str, str] | None = None,
    attributes: dict[str, str | int | bool] | None = None,
) -> dict:
    if event not in EVENT_STATUSES:
        raise ValueError("invalid event name")
    if status not in EVENT_STATUSES[event]:
        raise ValueError("invalid event status")
    event_id = (
        event_id or os.environ.get("CORTEX_EVENT_ID") or uuid.uuid4().hex
    )
    run_id = (
        run_id or os.environ.get("CORTEX_EVENT_RUN_ID") or uuid.uuid4().hex
    )
    repo_id = (
        repo_id
        or os.environ.get("CORTEX_REPO_ID")
        or sha256_text(str(repo_root().resolve()))
    )
    episode_id = episode_id or os.environ.get("CORTEX_EPISODE_ID")
    turn_id = turn_id or os.environ.get("CORTEX_TURN_ID")
    parent_run_id = parent_run_id or os.environ.get("CORTEX_PARENT_RUN_ID")
    component = component or event.split(".", 1)[0]
    capability_hash = (
        capability_hash
        or os.environ.get("CORTEX_CAPABILITY_MANIFEST_HASH")
        or capability_manifest_hash()
    )
    for name, value in (
        ("run_id", run_id),
        ("episode_id", episode_id),
        ("turn_id", turn_id),
        ("parent_run_id", parent_run_id),
        ("component", component),
    ):
        if value is not None and not TOKEN_RE.fullmatch(value):
            raise ValueError(f"invalid {name}")
    if not UUID_LIKE_RE.fullmatch(event_id):
        raise ValueError("invalid event_id")
    if not HASH_RE.fullmatch(repo_id):
        raise ValueError("invalid repo_id")
    if capability_hash is not None and not HASH_RE.fullmatch(capability_hash):
        raise ValueError("invalid capability manifest hash")
    if duration_ms is not None and (
        not isinstance(duration_ms, int) or duration_ms < 0
    ):
        raise ValueError("duration_ms must be a non-negative integer")
    if reason_code is not None and not REASON_RE.fullmatch(reason_code):
        raise ValueError("invalid reason_code")
    if (
        event in {"phase.skipped", "phase.missed", "phase.abandoned"}
        and reason_code is None
    ):
        raise ValueError("phase terminal reason required")

    clean_refs = list(dict.fromkeys(refs or []))
    if any(not isinstance(ref, str) or not _valid_artifact_ref(ref)
           for ref in clean_refs):
        raise ValueError("invalid stable record ref")
    clean_counts = _validate_mapping(
        "count", counts, lambda value: isinstance(value, int) and value >= 0
    )
    clean_hashes = _validate_mapping(
        "hash", hashes, lambda value: isinstance(value, str)
        and HASH_RE.fullmatch(value) is not None
    )
    clean_attributes = _validate_mapping(
        "attribute",
        attributes,
        lambda value: (
            isinstance(value, bool)
            or isinstance(value, int)
            or (
                isinstance(value, str)
                and TOKEN_RE.fullmatch(value) is not None
            )
        ),
    )
    _validate_reserved_attributes(clean_attributes)
    _validate_lifecycle_event(
        event, run_id, parent_run_id, clean_attributes
    )

    timestamp = os.environ.get("CORTEX_EVENT_TIME")
    if timestamp is not None:
        try:
            parsed = datetime.datetime.fromisoformat(
                timestamp.replace("Z", "+00:00")
            )
            if parsed.tzinfo is None:
                raise ValueError
        except ValueError:
            raise ValueError("invalid event time")
    else:
        timestamp = datetime.datetime.now(
            datetime.timezone.utc
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    event_attributes = dict(clean_attributes)
    if reason_code is not None:
        event_attributes["reason_code"] = reason_code
    if clean_counts:
        event_attributes["counts"] = clean_counts
    if clean_hashes:
        event_attributes["hashes"] = clean_hashes
    payload = {
        "schema_version": SCHEMA_VERSION,
        "event_id": event_id,
        "timestamp": timestamp,
        "event_type": event,
        "repo_id": repo_id,
        "episode_id": episode_id,
        "run_id": run_id,
        "turn_id": turn_id,
        "parent_run_id": parent_run_id,
        "component": component,
        "status": status,
        "duration_ms": duration_ms or 0,
        "attributes": event_attributes,
        "artifact_refs": clean_refs,
        "capability_manifest_hash": capability_hash,
    }
    return payload


def _phase_context(
    *,
    root: Path,
    phase_instance_id: str | None,
    phase_start_run_id: str | None,
    phase: str | None,
    skill: str | None,
    phase_lane_id: str | None,
    phase_owner_id: str | None,
    phase_receipt_id: str | None,
    inherit: bool,
):
    if inherit:
        phase_instance_id = (
            phase_instance_id or os.environ.get("CORTEX_PHASE_INSTANCE_ID")
        )
        phase_start_run_id = (
            phase_start_run_id
            or os.environ.get("CORTEX_PHASE_START_RUN_ID")
        )
        phase = phase or os.environ.get("CORTEX_PHASE_NAME")
        skill = skill or os.environ.get("CORTEX_PHASE_SKILL")
        phase_lane_id = (
            phase_lane_id or os.environ.get("CORTEX_PHASE_LANE_ID")
        )
        phase_owner_id = (
            phase_owner_id or os.environ.get("CORTEX_PHASE_OWNER_ID")
        )
        phase_receipt_id = (
            phase_receipt_id
            or os.environ.get("CORTEX_PHASE_RECEIPT_ID")
        )
    values = {
        "phase_instance_id": phase_instance_id,
        "phase_start_run_id": phase_start_run_id,
        "phase": phase,
        "skill": skill,
        "lane_id": phase_lane_id,
        "owner_id": phase_owner_id,
        "receipt_id": phase_receipt_id,
    }
    supplied = any(value is not None for value in values.values())
    if not supplied:
        return nullcontext({
            "exact": False,
            "reason_code": None,
            "appended": False,
        })
    lifecycle_complete = all(
        values[key] is not None
        for key in (
            "phase_instance_id", "phase_start_run_id", "phase", "skill",
        )
    )
    identity_complete = (
        values["receipt_id"] is not None
        or (
            values["lane_id"] is not None
            and values["owner_id"] is not None
        )
    )
    if not lifecycle_complete or not identity_complete:
        return nullcontext({
            "exact": False,
            "reason_code": "phase_context_incomplete",
            "appended": False,
        })
    try:
        from cognition_phase import phase_event_guard
    except ImportError:
        return nullcontext({
            "exact": False,
            "reason_code": "phase_context_unavailable",
            "appended": False,
        })
    return phase_event_guard(root=root, **values)


def _append_payload(payload: dict, event_root: Path, path: Path) -> str | None:
    try:
        if (
            path.is_absolute()
            or "\\" in str(path)
            or ".." in path.parts
            or path.name in {"", ".", ".."}
        ):
            raise OSError("event path escapes repository")
        root_fd = _open_directory(event_root)
        try:
            parent_fd = _open_directory_at(root_fd, path.parent.parts)
        finally:
            os.close(root_fd)
        line = (
            json.dumps(payload, sort_keys=True, separators=(",", ":"))
            + "\n"
        ).encode("utf-8")
        lock_name = path.name + ".lock"
        try:
            lock_fd = _open_regular_at(
                parent_fd, lock_name, os.O_CREAT | os.O_RDWR, 0o600
            )
            try:
                locked = False
                if fcntl is not None:
                    fcntl.flock(lock_fd, fcntl.LOCK_EX)
                    locked = True
                elif msvcrt is not None:
                    if os.fstat(lock_fd).st_size == 0:
                        os.write(lock_fd, b"\0")
                    os.lseek(lock_fd, 0, os.SEEK_SET)
                    msvcrt.locking(lock_fd, msvcrt.LK_LOCK, 1)
                    locked = True
                else:
                    raise OSError("no file-lock backend")
                fd = _open_regular_at(
                    parent_fd,
                    path.name,
                    os.O_APPEND | os.O_CREAT | os.O_WRONLY,
                    0o600,
                )
                try:
                    os.write(fd, line)
                finally:
                    os.close(fd)
            finally:
                try:
                    if locked and fcntl is not None:
                        fcntl.flock(lock_fd, fcntl.LOCK_UN)
                    elif locked and msvcrt is not None:
                        os.lseek(lock_fd, 0, os.SEEK_SET)
                        msvcrt.locking(lock_fd, msvcrt.LK_UNLCK, 1)
                finally:
                    os.close(lock_fd)
        finally:
            os.close(parent_fd)
    except OSError:
        return "event_write_failed"
    return None


def _open_directory(path: Path) -> int:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory = getattr(os, "O_DIRECTORY", 0)
    if not nofollow or not directory or not path.is_absolute():
        raise OSError("secure directory open unavailable")
    current = os.open(path.anchor, os.O_RDONLY | directory)
    try:
        for part in path.parts[1:]:
            try:
                os.mkdir(part, 0o700, dir_fd=current)
            except FileExistsError:
                pass
            next_fd = os.open(
                part,
                os.O_RDONLY | directory | nofollow,
                dir_fd=current,
            )
            os.close(current)
            current = next_fd
        return current
    except OSError:
        os.close(current)
        raise


def _open_directory_at(root: int, parts: tuple[str, ...]) -> int:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory = getattr(os, "O_DIRECTORY", 0)
    if not nofollow or not directory:
        raise OSError("secure directory open unavailable")
    current = os.dup(root)
    try:
        for part in parts:
            try:
                os.mkdir(part, 0o700, dir_fd=current)
            except FileExistsError:
                pass
            next_fd = os.open(
                part,
                os.O_RDONLY | directory | nofollow,
                dir_fd=current,
            )
            os.close(current)
            current = next_fd
        return current
    except OSError:
        os.close(current)
        raise


def _open_regular_at(
    parent: int,
    name: str,
    flags: int,
    mode: int,
) -> int:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    nonblock = getattr(os, "O_NONBLOCK", 0)
    fd = os.open(
        name,
        flags | nofollow | nonblock,
        mode,
        dir_fd=parent,
    )
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise OSError("event sink is not a regular file")
    try:
        os.fchmod(fd, mode)
    except OSError:
        os.close(fd)
        raise
    return fd


def emit_event(
    event: str,
    status: str,
    *,
    root: Path | None = None,
    phase_instance_id: str | None = None,
    phase_start_run_id: str | None = None,
    phase: str | None = None,
    skill: str | None = None,
    phase_lane_id: str | None = None,
    phase_owner_id: str | None = None,
    phase_receipt_id: str | None = None,
    inherit_phase_context: bool = True,
    **fields,
) -> tuple[dict | None, str | None]:
    if not events_enabled():
        return None, "disabled"
    event_root = (root or repo_root()).resolve()
    if "repo_id" not in fields and not os.environ.get("CORTEX_REPO_ID"):
        fields["repo_id"] = sha256_text(str(event_root))
    context = _phase_context(
        root=event_root,
        phase_instance_id=phase_instance_id,
        phase_start_run_id=phase_start_run_id,
        phase=phase,
        skill=skill,
        phase_lane_id=phase_lane_id,
        phase_owner_id=phase_owner_id,
        phase_receipt_id=phase_receipt_id,
        inherit=inherit_phase_context,
    )
    with context as phase_guard:
        attributes = dict(fields.get("attributes") or {})
        if phase_guard["exact"]:
            attributes.update({
                "phase": phase_guard["phase"],
                "skill": phase_guard["skill"],
                "correlation": "exact",
                "phase_instance_id": phase_guard["phase_instance_id"],
                "phase_start_run_id": phase_guard["phase_start_run_id"],
                "lane_id_hash": phase_guard["lane_id_hash"],
                "owner_id_hash": phase_guard["owner_id_hash"],
                "lease_seconds": phase_guard["lease_seconds"],
            })
            if fields.get("parent_run_id") is None:
                fields["parent_run_id"] = phase_guard[
                    "phase_start_run_id"
                ]
        elif phase_guard["reason_code"] is not None:
            if event in LIFECYCLE_EVENTS and event != "skill.loaded":
                return None, phase_guard["reason_code"]
            if event != "skill.loaded":
                attributes.update({
                    "correlation": "unavailable",
                    "phase_correlation_reason": phase_guard["reason_code"],
                })
        fields["attributes"] = attributes
        try:
            payload = build_event(event, status, **fields)
        except ValueError:
            return None, "invalid_event"
        reason = _append_payload(payload, event_root, events_path(root))
        if reason is not None:
            return None, reason
        phase_guard["appended"] = True
        return payload, None
