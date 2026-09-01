"""Recoverable phase lifecycle state over the append-only cognition event log."""
from __future__ import annotations

import datetime
import json
import os
import re
import stat
import uuid
from contextlib import contextmanager
from pathlib import Path

from cognition_event import (
    EFFECTS,
    ENFORCEMENTS,
    ORIGINS,
    PHASES,
    REQUIREMENTS,
    SKILLS,
    TRIGGERS,
    UUID_LIKE_RE,
    emit_event,
    events_path,
    repo_root,
    sha256_text,
)

try:
    import fcntl
except ImportError:
    fcntl = None
try:
    import msvcrt
except ImportError:
    msvcrt = None

STATE_SCHEMA = "cortex.cognition-phase-state/v1"
RESULT_SCHEMA = "cortex.cognition-phase-result/v1"
SUMMARY_SCHEMA = "cortex.cognition-phase-summary/v1"
STATE_PATH = ".cortex/cognition-phase/state.json"
LOCK_PATH = ".cortex/cognition-phase/state.lock"
OWNER_DIR = ".cortex/cognition-phase/owners"
DEFAULT_LEASE_SECONDS = 1800
MAX_LEASE_SECONDS = 1800
TOKEN_RE = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
REASON_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
TERMINAL_PHASE = {"completed_ok", "completed_failed", "abandoned"}


class PhaseInputError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class PhaseAdvisoryError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _input(condition: bool, code: str) -> None:
    if not condition:
        raise PhaseInputError(code)


def _advisory(code: str) -> None:
    raise PhaseAdvisoryError(code)


def _now() -> datetime.datetime:
    configured = os.environ.get("CORTEX_PHASE_TIME")
    if configured:
        try:
            value = datetime.datetime.fromisoformat(
                configured.replace("Z", "+00:00")
            )
        except ValueError as exc:
            raise PhaseInputError("invalid_phase_time") from exc
        _input(value.tzinfo is not None, "invalid_phase_time")
        return value.astimezone(datetime.timezone.utc)
    return datetime.datetime.now(datetime.timezone.utc)


def _format_time(value: datetime.datetime) -> str:
    return value.astimezone(datetime.timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")


def _parse_time(value: str) -> datetime.datetime:
    try:
        parsed = datetime.datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except (AttributeError, ValueError) as exc:
        raise PhaseAdvisoryError("phase_event_log_invalid") from exc
    if parsed.tzinfo is None:
        _advisory("phase_event_log_invalid")
    return parsed.astimezone(datetime.timezone.utc)


def lease_seconds() -> int:
    value = os.environ.get(
        "CORTEX_PHASE_LEASE_SECONDS", str(DEFAULT_LEASE_SECONDS)
    )
    try:
        seconds = int(value)
    except ValueError as exc:
        raise PhaseInputError("invalid_lease_seconds") from exc
    _input(1 <= seconds <= MAX_LEASE_SECONDS, "invalid_lease_seconds")
    return seconds


def _uuid() -> str:
    return uuid.uuid4().hex


def session_identity(session_id: str) -> tuple[str, str]:
    if not isinstance(session_id, str) or not session_id:
        raise ValueError("session_id_required")
    lane_id = f"session:{sha256_text(session_id)}"
    owner_id = uuid.uuid5(
        uuid.NAMESPACE_URL, f"cortex-phase-owner:{session_id}"
    ).hex
    return lane_id, owner_id


def _validate_uuid(value: str, code: str) -> str:
    _input(
        isinstance(value, str) and UUID_LIKE_RE.fullmatch(value) is not None,
        code,
    )
    return value.lower()


def _validate_token(value: str, allowed: set[str], code: str) -> str:
    _input(value in allowed, code)
    return value


def _validate_reason(value: str) -> str:
    _input(
        isinstance(value, str) and REASON_RE.fullmatch(value) is not None,
        "invalid_reason_code",
    )
    return value


def _lane_id(value: str | None) -> str:
    lane = value or os.environ.get("CORTEX_PHASE_LANE_ID")
    _input(
        isinstance(lane, str) and TOKEN_RE.fullmatch(lane) is not None,
        "lane_id_required",
    )
    return lane


def _owner_id(value: str | None) -> str:
    owner = value or os.environ.get("CORTEX_PHASE_OWNER_ID")
    _input(isinstance(owner, str), "owner_id_required")
    return _validate_uuid(owner, "invalid_owner_id")


def _relative_parts(relative: str) -> tuple[str, ...]:
    path = Path(relative)
    if (
        path.is_absolute()
        or "\\" in relative
        or not path.parts
        or ".." in path.parts
        or "." in path.parts
    ):
        _advisory("phase_path_outside_repo")
    return path.parts


def _open_parent(
    root: Path,
    relative: str,
    *,
    create: bool,
) -> tuple[int, str]:
    parts = _relative_parts(relative)
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory = getattr(os, "O_DIRECTORY", 0)
    if not nofollow or not directory:
        _advisory("phase_secure_io_unavailable")
    absolute_root = root.resolve()
    current = os.open(absolute_root.anchor, os.O_RDONLY | directory)
    try:
        for part in absolute_root.parts[1:]:
            next_fd = os.open(
                part,
                os.O_RDONLY | directory | nofollow,
                dir_fd=current,
            )
            os.close(current)
            current = next_fd
        for part in parts[:-1]:
            if create:
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
        return current, parts[-1]
    except OSError:
        os.close(current)
        _advisory("phase_path_parent_invalid")


def _secure_read_optional(root: Path, relative: str) -> str | None:
    try:
        parent, name = _open_parent(root, relative, create=False)
    except PhaseAdvisoryError as exc:
        if exc.code == "phase_path_parent_invalid":
            return None
        raise
    fd = None
    try:
        fd = os.open(
            name,
            os.O_RDONLY
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_NONBLOCK", 0),
            dir_fd=parent,
        )
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            _advisory("phase_file_not_regular")
        with os.fdopen(fd, encoding="utf-8", closefd=True) as handle:
            fd = None
            return handle.read()
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError):
        _advisory("phase_file_unreadable")
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def _atomic_json(root: Path, relative: str, value: dict) -> None:
    parent, name = _open_parent(root, relative, create=True)
    temporary = f".{name}.{uuid.uuid4().hex}.tmp"
    fd = None
    try:
        fd = os.open(
            temporary,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0),
            0o600,
            dir_fd=parent,
        )
        os.fchmod(fd, 0o600)
        data = (
            json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode("utf-8")
        with os.fdopen(fd, "wb", closefd=True) as handle:
            fd = None
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(
            temporary, name, src_dir_fd=parent, dst_dir_fd=parent
        )
        os.fsync(parent)
    except OSError:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(temporary, dir_fd=parent)
        except OSError:
            pass
        _advisory("phase_state_write_failed")
    finally:
        os.close(parent)


@contextmanager
def _state_lock(root: Path):
    parent, name = _open_parent(root, LOCK_PATH, create=True)
    try:
        fd = os.open(
            name,
            os.O_CREAT
            | os.O_RDWR
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_NONBLOCK", 0),
            0o600,
            dir_fd=parent,
        )
    except OSError:
        os.close(parent)
        _advisory("phase_lock_unavailable")
    os.close(parent)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            _advisory("phase_lock_unavailable")
        os.fchmod(fd, 0o600)
        if fcntl is not None:
            fcntl.flock(fd, fcntl.LOCK_EX)
        elif msvcrt is not None:
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            _advisory("phase_lock_unavailable")
    except OSError:
        os.close(fd)
        _advisory("phase_lock_unavailable")
    try:
        yield
    finally:
        try:
            if fcntl is not None:
                fcntl.flock(fd, fcntl.LOCK_UN)
            elif msvcrt is not None:
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
        os.close(fd)


def _empty_state() -> dict:
    return {"schema": STATE_SCHEMA, "lanes": {}}


def _read_json(root: Path, relative: str) -> dict | None:
    content = _secure_read_optional(root, relative)
    if content is None:
        return None
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        _advisory("phase_state_invalid")
    if not isinstance(value, dict):
        _advisory("phase_state_invalid")
    return value


def _read_cache(root: Path) -> tuple[dict | None, list[str]]:
    content = _secure_read_optional(root, STATE_PATH)
    if content is None:
        return None, []
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        return None, ["state:invalid"]
    if not isinstance(value, dict) or value.get("schema") != STATE_SCHEMA:
        return None, ["state:invalid"]
    return value, []


def _event_relative_path() -> str:
    path = events_path()
    if (
        path.is_absolute()
        or "\\" in str(path)
        or ".." in path.parts
        or not path.parts
    ):
        _advisory("phase_event_path_invalid")
    return "/".join(path.parts)


def _events(root: Path) -> list[dict]:
    try:
        content = _secure_read_optional(root, _event_relative_path())
    except PhaseAdvisoryError as exc:
        if exc.code == "phase_file_not_regular":
            _advisory("event_write_failed")
        raise
    if content is None:
        return []
    output = []
    for line in content.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            _advisory("phase_event_log_invalid")
        if not isinstance(event, dict):
            _advisory("phase_event_log_invalid")
        output.append(event)
    return output


def _receipt_id(value: str) -> str:
    return _validate_uuid(value, "invalid_receipt_id")


def _owner_relative(receipt_id: str) -> str:
    return f"{OWNER_DIR}/{_receipt_id(receipt_id)}.json"


def _read_owner(root: Path, receipt_id: str) -> dict | None:
    receipt_id = _receipt_id(receipt_id)
    receipt = _read_json(root, _owner_relative(receipt_id))
    if receipt is None:
        return None
    required = {
        "schema", "receipt_id", "lane_id", "lane_id_hash", "owner_id",
        "owner_id_hash", "lease_expires_at",
    }
    if (
        receipt.get("schema") != "cortex.cognition-phase-owner/v1"
        or not required.issubset(receipt)
        or receipt["receipt_id"] != receipt_id
        or not isinstance(receipt["lane_id"], str)
        or TOKEN_RE.fullmatch(receipt["lane_id"]) is None
        or receipt["lane_id_hash"] != sha256_text(receipt["lane_id"])
        or UUID_LIKE_RE.fullmatch(str(receipt["owner_id"])) is None
        or receipt["owner_id_hash"] != sha256_text(receipt["owner_id"])
    ):
        _advisory("phase_owner_receipt_invalid")
    _parse_time(receipt["lease_expires_at"])
    return receipt


def _list_receipt_ids(root: Path) -> list[str]:
    try:
        parent, _ = _open_parent(
            root, f"{OWNER_DIR}/placeholder", create=False
        )
    except PhaseAdvisoryError as exc:
        if exc.code == "phase_path_parent_invalid":
            return []
        raise
    try:
        output = []
        for name in os.listdir(parent):
            if not name.endswith(".json"):
                continue
            token = name[:-5]
            if UUID_LIKE_RE.fullmatch(token):
                output.append(token.lower())
        return sorted(output)
    except OSError:
        _advisory("phase_owner_receipt_unreadable")
    finally:
        os.close(parent)


def _find_owner(
    root: Path,
    lane_id: str,
    owner_id: str,
) -> tuple[str | None, dict | None]:
    matches = []
    for receipt_id in _list_receipt_ids(root):
        receipt = _read_owner(root, receipt_id)
        if (
            receipt is not None
            and receipt["lane_id"] == lane_id
            and receipt["owner_id"] == owner_id
        ):
            matches.append((receipt_id, receipt))
    if len(matches) > 1:
        _advisory("phase_owner_receipt_ambiguous")
    return matches[0] if matches else (None, None)


def _write_owner(
    root: Path,
    receipt_id: str,
    lane_id: str,
    owner_id: str,
    expires_at: str,
) -> None:
    receipt_id = _receipt_id(receipt_id)
    _atomic_json(root, _owner_relative(receipt_id), {
        "schema": "cortex.cognition-phase-owner/v1",
        "receipt_id": receipt_id,
        "lane_id": lane_id,
        "lane_id_hash": sha256_text(lane_id),
        "owner_id": owner_id,
        "owner_id_hash": sha256_text(owner_id),
        "lease_expires_at": expires_at,
    })


def _new_lane(lane_hash: str) -> dict:
    return {
        "lane_id_hash": lane_hash,
        "receipt_id": None,
        "owner_id_hash": None,
        "lease_expires_at": None,
        "expectations": {},
        "phases": {},
        "effects": [],
        "loaded": [],
        "errors": [],
    }


def _lane(state: dict, lane_hash: str) -> dict:
    return state["lanes"].setdefault(lane_hash, _new_lane(lane_hash))


def _event_attributes(event: dict) -> dict | None:
    attributes = event.get("attributes")
    if not isinstance(attributes, dict):
        return None
    lane_hash = attributes.get("lane_id_hash")
    if (
        not isinstance(lane_hash, str)
        or re.fullmatch(r"[0-9a-f]{64}", lane_hash) is None
    ):
        return None
    return attributes


def _valid_lifecycle_shape(event: dict, attributes: dict) -> bool:
    event_type = event.get("event_type")
    statuses = {
        "phase.expected": {"due"},
        "skill.loaded": {"observed"},
        "phase.invoked": {"started"},
        "phase.completed": {"ok", "failed"},
        "phase.skipped": {"skipped"},
        "phase.missed": {"missed"},
        "phase.effect_committed": {"ok"},
        "phase.abandoned": {"abandoned"},
    }
    if event_type not in statuses:
        return True
    if event.get("status") not in statuses[event_type]:
        return False
    required = {"skill", "correlation", "lane_id_hash"}
    if event_type != "skill.loaded":
        required.add("phase")
    if event_type in {
        "phase.expected", "phase.invoked", "phase.skipped", "phase.missed",
    }:
        required.update({
            "trigger", "origin", "requirement", "enforcement", "effect",
        })
    if event_type in {
        "phase.expected", "phase.skipped", "phase.missed",
    }:
        required.add("expectation_id")
    if event_type in {
        "phase.invoked", "phase.completed", "phase.effect_committed",
        "phase.abandoned",
    }:
        required.update({"phase_instance_id", "phase_start_run_id"})
    if not required.issubset(attributes):
        return False
    if (
        ("phase" in required and attributes["phase"] not in PHASES)
        or attributes["skill"] not in SKILLS
        or attributes["correlation"] not in {"exact", "temporal", "unavailable"}
    ):
        return False
    if "trigger" in required and attributes["trigger"] not in TRIGGERS:
        return False
    if "origin" in required and attributes["origin"] not in ORIGINS:
        return False
    if (
        "requirement" in required
        and attributes["requirement"] not in REQUIREMENTS
    ):
        return False
    if (
        "enforcement" in required
        and attributes["enforcement"] not in ENFORCEMENTS
    ):
        return False
    if "effect" in required and attributes["effect"] not in EFFECTS:
        return False
    for key in ("expectation_id", "phase_instance_id"):
        if key in required and UUID_LIKE_RE.fullmatch(
            str(attributes[key])
        ) is None:
            return False
    if (
        event_type == "phase.invoked"
        and attributes["phase_start_run_id"] != event.get("run_id")
    ):
        return False
    if (
        event_type in {
            "phase.completed", "phase.effect_committed", "phase.abandoned",
        }
        and attributes["correlation"] == "exact"
        and event.get("parent_run_id") != attributes["phase_start_run_id"]
    ):
        return False
    if (
        event_type == "phase.effect_committed"
        and attributes.get("effect") == "none"
    ):
        return False
    if (
        event_type == "skill.loaded"
        and "expectation_id" in attributes
        and attributes["correlation"] != "exact"
    ):
        return False
    return True


def _advance_lease(lane: dict, event: dict, attributes: dict) -> None:
    seconds = attributes.get("lease_seconds", DEFAULT_LEASE_SECONDS)
    if not isinstance(seconds, int) or not 1 <= seconds <= MAX_LEASE_SECONDS:
        lane["errors"].append("invalid_lease_seconds")
        seconds = DEFAULT_LEASE_SECONDS
    timestamp = _parse_time(event.get("timestamp"))
    expires = _format_time(timestamp + datetime.timedelta(seconds=seconds))
    if (
        lane["lease_expires_at"] is None
        or _parse_time(lane["lease_expires_at"]) < _parse_time(expires)
    ):
        lane["lease_expires_at"] = expires
    owner_hash = attributes.get("owner_id_hash")
    if isinstance(owner_hash, str) and len(owner_hash) == 64:
        if lane["owner_id_hash"] not in {None, owner_hash}:
            lane["errors"].append("conflicting_lane_owner")
        else:
            lane["owner_id_hash"] = owner_hash


def _rebuild(root: Path) -> dict:
    state = _empty_state()
    for event in _events(root):
        attributes = _event_attributes(event)
        if attributes is None:
            continue
        lane = _lane(state, attributes["lane_id_hash"])
        event_type = event.get("event_type")
        if not _valid_lifecycle_shape(event, attributes):
            lane["errors"].append("invalid_lifecycle_event")
            continue
        if (
            event_type not in {
                "phase.expected", "skill.loaded", "phase.invoked",
                "phase.completed", "phase.skipped", "phase.missed",
                "phase.effect_committed", "phase.abandoned",
            }
            and attributes.get("correlation") == "exact"
        ):
            correlated = lane["phases"].get(
                attributes.get("phase_instance_id")
            )
            if (
                correlated is None
                or correlated["status"] != "active"
                or correlated["phase_start_run_id"]
                != attributes.get("phase_start_run_id")
                or correlated["phase"] != attributes.get("phase")
                or correlated["skill"] != attributes.get("skill")
                or event.get("parent_run_id")
                != correlated["phase_start_run_id"]
            ):
                lane["errors"].append("invalid_phase_correlation")
                continue
        if attributes.get("correlation") == "exact":
            try:
                _advance_lease(lane, event, attributes)
            except PhaseAdvisoryError:
                lane["errors"].append("invalid_lifecycle_event")
                continue
        if event_type == "phase.expected":
            expectation_id = attributes.get("expectation_id")
            if expectation_id in lane["expectations"]:
                lane["errors"].append("duplicate_expectation")
                continue
            lane["expectations"][expectation_id] = {
                "expectation_id": expectation_id,
                "phase": attributes["phase"],
                "skill": attributes["skill"],
                "trigger": attributes["trigger"],
                "origin": attributes["origin"],
                "requirement": attributes["requirement"],
                "enforcement": attributes["enforcement"],
                "effect": attributes["effect"],
                "status": "pending",
                "created_at": event["timestamp"],
                "terminal_run_id": None,
                "phase_instance_id": None,
            }
        elif event_type == "skill.loaded":
            lane["loaded"].append({
                "skill": attributes.get("skill"),
                "expectation_id": attributes.get("expectation_id"),
                "run_id": event.get("run_id"),
            })
        elif event_type == "phase.invoked":
            phase_id = attributes.get("phase_instance_id")
            if phase_id in lane["phases"]:
                lane["errors"].append("duplicate_invocation")
                continue
            expectation_id = attributes.get("expectation_id")
            expectation = lane["expectations"].get(expectation_id)
            if expectation is not None:
                compatible = all((
                    expectation["phase"] == attributes["phase"],
                    expectation["skill"] == attributes["skill"],
                    expectation["trigger"] == attributes["trigger"],
                    expectation["requirement"] == attributes["requirement"],
                    expectation["effect"] == attributes["effect"],
                ))
                if not compatible:
                    lane["errors"].append("expectation_link_mismatch")
                elif expectation["status"] != "pending":
                    lane["errors"].append("expectation_already_terminal")
                else:
                    expectation["status"] = "invoked"
                    expectation["phase_instance_id"] = phase_id
                    expectation["terminal_run_id"] = event.get("run_id")
            lane["phases"][phase_id] = {
                "phase_instance_id": phase_id,
                "phase": attributes["phase"],
                "skill": attributes["skill"],
                "trigger": attributes["trigger"],
                "origin": attributes["origin"],
                "requirement": attributes["requirement"],
                "enforcement": attributes["enforcement"],
                "effect": attributes["effect"],
                "expectation_id": expectation_id,
                "parent_phase_instance_id": attributes.get(
                    "parent_phase_instance_id"
                ),
                "phase_start_run_id": attributes["phase_start_run_id"],
                "status": "active",
                "started_at": event["timestamp"],
                "terminal_run_id": None,
            }
        elif event_type in {"phase.skipped", "phase.missed"}:
            expectation = lane["expectations"].get(
                attributes.get("expectation_id")
            )
            target = (
                "skipped" if event_type == "phase.skipped" else "missed"
            )
            if expectation is None:
                lane["errors"].append("terminal_without_expectation")
            elif any((
                expectation["phase"] != attributes["phase"],
                expectation["skill"] != attributes["skill"],
                expectation["trigger"] != attributes["trigger"],
                expectation["requirement"] != attributes["requirement"],
                expectation["effect"] != attributes["effect"],
            )):
                lane["errors"].append("expectation_terminal_mismatch")
            elif expectation["status"] != "pending":
                lane["errors"].append("conflicting_expectation_terminal")
            else:
                expectation["status"] = target
                expectation["terminal_run_id"] = event.get("run_id")
        elif event_type in {"phase.completed", "phase.abandoned"}:
            phase_record = lane["phases"].get(
                attributes.get("phase_instance_id")
            )
            if phase_record is None:
                lane["errors"].append("terminal_without_invocation")
                continue
            if any((
                phase_record["phase"] != attributes["phase"],
                phase_record["skill"] != attributes["skill"],
                phase_record["phase_start_run_id"]
                != attributes["phase_start_run_id"],
            )):
                lane["errors"].append("invalid_phase_correlation")
                continue
            if phase_record["status"] in TERMINAL_PHASE:
                lane["errors"].append(
                    "duplicate_phase_terminal"
                    if (
                        event_type == "phase.abandoned"
                        and phase_record["status"] == "abandoned"
                    ) or (
                        event_type == "phase.completed"
                        and phase_record["status"]
                        == f"completed_{event.get('status')}"
                    )
                    else "conflicting_phase_terminal"
                )
                continue
            phase_record["status"] = (
                "abandoned"
                if event_type == "phase.abandoned"
                else f"completed_{event.get('status')}"
            )
            phase_record["terminal_run_id"] = event.get("run_id")
        elif event_type == "phase.effect_committed":
            phase_record = lane["phases"].get(
                attributes.get("phase_instance_id")
            )
            if phase_record is None:
                lane["errors"].append("effect_without_invocation")
            elif any((
                phase_record["phase"] != attributes["phase"],
                phase_record["skill"] != attributes["skill"],
                phase_record["phase_start_run_id"]
                != attributes["phase_start_run_id"],
            )):
                lane["errors"].append("invalid_phase_correlation")
                continue
            lane["effects"].append({
                "phase_instance_id": attributes.get("phase_instance_id"),
                "effect": attributes.get("effect"),
                "run_id": event.get("run_id"),
            })
    for lane in state["lanes"].values():
        lane["errors"] = sorted(set(lane["errors"]))
    return state


def _cache_orphans(cache: dict | None, rebuilt: dict) -> list[str]:
    if not cache or cache.get("schema") != STATE_SCHEMA:
        return []
    output = []
    for lane_hash, lane in cache.get("lanes", {}).items():
        current = rebuilt["lanes"].get(lane_hash, {})
        for kind in ("expectations", "phases"):
            for identifier in lane.get(kind, {}):
                if identifier not in current.get(kind, {}):
                    output.append(f"{kind}:{identifier}")
    return sorted(output)


def _save_state(root: Path, state: dict) -> None:
    _atomic_json(root, STATE_PATH, state)


def _active(lane: dict) -> list[dict]:
    return sorted(
        (
            phase for phase in lane["phases"].values()
            if phase["status"] == "active"
        ),
        key=lambda value: value["phase_instance_id"],
    )


def _active_leaf(lane: dict) -> dict:
    active = _active(lane)
    active_parents = {
        phase["parent_phase_instance_id"]
        for phase in active
        if phase["parent_phase_instance_id"] is not None
    }
    leaves = [
        phase for phase in active
        if phase["phase_instance_id"] not in active_parents
    ]
    if not leaves:
        _advisory("active_phase_not_found")
    if len(leaves) > 1:
        _advisory("active_phase_ambiguous")
    return leaves[0]


def _pending(lane: dict) -> list[dict]:
    return sorted(
        (
            expectation for expectation in lane["expectations"].values()
            if expectation["status"] == "pending"
        ),
        key=lambda value: value["expectation_id"],
    )


def _owner_matches(
    root: Path,
    lane: dict,
    lane_id: str,
    lane_hash: str,
    owner_id: str,
    receipt_id: str | None,
    now: datetime.datetime,
    *,
    allow_stale: bool = False,
) -> str | None:
    owner_hash = sha256_text(owner_id)
    if receipt_id is not None:
        receipt = _read_owner(root, receipt_id)
        if receipt is None:
            _advisory("phase_owner_receipt_not_found")
        if (
            receipt["lane_id"] != lane_id
            or receipt["owner_id"] != owner_id
        ):
            _advisory("phase_owner_receipt_mismatch")
    else:
        receipt_id, receipt = _find_owner(root, lane_id, owner_id)
    recorded_hash = lane.get("owner_id_hash")
    if receipt is not None:
        if recorded_hash not in {None, receipt["owner_id_hash"]}:
            _advisory("phase_owner_receipt_conflict")
        recorded_hash = receipt["owner_id_hash"]
        lane["owner_id_hash"] = recorded_hash
        if (
            lane.get("lease_expires_at") is None
            or _parse_time(lane["lease_expires_at"])
            < _parse_time(receipt["lease_expires_at"])
        ):
            lane["lease_expires_at"] = receipt["lease_expires_at"]
    expiry = lane.get("lease_expires_at")
    if receipt is not None:
        expiry = receipt["lease_expires_at"]
    expired = expiry is not None and _parse_time(expiry) < now
    if recorded_hash is None:
        lane["receipt_id"] = receipt_id
        return receipt_id
    if recorded_hash == owner_hash:
        if expired and (_pending(lane) or _active(lane)) and not allow_stale:
            _advisory("stale_lane")
        lane["receipt_id"] = receipt_id
        return receipt_id
    _advisory("concurrent_lane")


def _renew(
    root: Path,
    state: dict,
    lane: dict,
    lane_id: str,
    lane_hash: str,
    owner_id: str,
    receipt_id: str | None,
    now: datetime.datetime,
    seconds: int,
) -> tuple[str, str]:
    receipt_id = receipt_id or _uuid()
    expires = _format_time(now + datetime.timedelta(seconds=seconds))
    lane["owner_id_hash"] = sha256_text(owner_id)
    lane["lease_expires_at"] = expires
    lane["receipt_id"] = receipt_id
    _save_state(root, state)
    _write_owner(root, receipt_id, lane_id, owner_id, expires)
    return expires, receipt_id


def _common_attributes(
    *,
    lane_hash: str,
    owner_id: str,
    phase: str,
    skill: str,
    correlation: str,
    seconds: int,
    effect: str,
) -> dict:
    return {
        "phase": phase,
        "skill": skill,
        "correlation": correlation,
        "lane_id_hash": lane_hash,
        "owner_id_hash": sha256_text(owner_id),
        "lease_seconds": seconds,
        "effect": effect,
    }


def _emit(
    event: str,
    status: str,
    *,
    root: Path,
    attributes: dict,
    parent_run_id: str | None = None,
    reason_code: str | None = None,
) -> dict:
    run_id = _uuid()
    payload, reason = emit_event(
        event,
        status,
        root=root,
        run_id=run_id,
        parent_run_id=parent_run_id,
        reason_code=reason_code,
        attributes=attributes,
        inherit_phase_context=False,
    )
    if reason == "disabled":
        _advisory("phase_events_disabled")
    if reason is not None or payload is None:
        _advisory(reason or "event_write_failed")
    return payload


def _base_result(command: str, lane_hash: str) -> dict:
    return {
        "schema": RESULT_SCHEMA,
        "command": command,
        "ok": True,
        "advisory": True,
        "reason_code": None,
        "lane_id_hash": lane_hash,
    }


def _environment(
    receipt_id: str,
    phase_record: dict,
) -> dict:
    return {
        "CORTEX_PHASE_RECEIPT_ID": receipt_id,
        "CORTEX_PHASE_INSTANCE_ID": phase_record["phase_instance_id"],
        "CORTEX_PHASE_START_RUN_ID": phase_record["phase_start_run_id"],
        "CORTEX_PHASE_NAME": phase_record["phase"],
        "CORTEX_PHASE_SKILL": phase_record["skill"],
    }


def expect(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    phase: str,
    skill: str,
    trigger: str,
    origin: str,
    requirement: str,
    enforcement: str,
    effect: str,
    if_absent: bool,
) -> dict:
    phase = _validate_token(phase, PHASES, "invalid_phase")
    skill = _validate_token(skill, SKILLS, "invalid_skill")
    trigger = _validate_token(trigger, TRIGGERS, "invalid_trigger")
    origin = _validate_token(origin, ORIGINS, "invalid_origin")
    requirement = _validate_token(
        requirement, REQUIREMENTS, "invalid_requirement"
    )
    enforcement = _validate_token(
        enforcement, ENFORCEMENTS, "invalid_enforcement"
    )
    effect = _validate_token(effect, EFFECTS, "invalid_effect")
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root, lane, lane_id, lane_hash, owner_id, receipt_id, now
        )
        compatible = [
            item for item in _pending(lane)
            if item["phase"] == phase
            and item["skill"] == skill
            and item["trigger"] == trigger
            and item["requirement"] == requirement
            and item["effect"] == effect
        ]
        if if_absent and origin == "runtime":
            harness = [
                item for item in compatible if item["origin"] == "harness"
            ]
            if len(harness) > 1:
                _advisory("ambiguous_expectation")
            if len(harness) == 1:
                expires, receipt_id = _renew(
                    root, state, lane, lane_id, lane_hash, owner_id,
                    receipt_id, now, seconds
                )
                result = _base_result("expect", lane_hash)
                result.update({
                    "adopted": True,
                    "reused": False,
                    "expectation_id": harness[0]["expectation_id"],
                    "run_id": None,
                    "lease_expires_at": expires,
                    "receipt_id": receipt_id,
                    "environment": {
                        "CORTEX_PHASE_RECEIPT_ID": receipt_id,
                    },
                })
                return result
            runtime = [
                item for item in compatible if item["origin"] == "runtime"
            ]
            if len(runtime) > 1:
                _advisory("ambiguous_expectation")
            if len(runtime) == 1:
                expires, receipt_id = _renew(
                    root, state, lane, lane_id, lane_hash, owner_id,
                    receipt_id, now, seconds
                )
                result = _base_result("expect", lane_hash)
                result.update({
                    "adopted": False,
                    "reused": True,
                    "expectation_id": runtime[0]["expectation_id"],
                    "run_id": None,
                    "lease_expires_at": expires,
                    "receipt_id": receipt_id,
                    "environment": {
                        "CORTEX_PHASE_RECEIPT_ID": receipt_id,
                    },
                })
                return result
        expectation_id = _uuid()
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=phase,
            skill=skill,
            correlation="exact",
            seconds=seconds,
            effect=effect,
        )
        attributes.update({
            "trigger": trigger,
            "origin": origin,
            "requirement": requirement,
            "enforcement": enforcement,
            "expectation_id": expectation_id,
        })
        payload = _emit(
            "phase.expected", "due", root=root, attributes=attributes
        )
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        expires, receipt_id = _renew(
            root, state, lane, lane_id, lane_hash, owner_id,
            receipt_id, now, seconds
        )
        result = _base_result("expect", lane_hash)
        result.update({
            "adopted": False,
            "reused": False,
            "expectation_id": expectation_id,
            "run_id": payload["run_id"],
            "lease_expires_at": expires,
            "receipt_id": receipt_id,
            "environment": {
                "CORTEX_PHASE_RECEIPT_ID": receipt_id,
            },
        })
        return result


def start(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    phase: str,
    skill: str,
    trigger: str,
    origin: str,
    requirement: str,
    enforcement: str,
    effect: str,
    expectation_id: str | None,
    parent_phase_instance_id: str | None,
) -> dict:
    phase = _validate_token(phase, PHASES, "invalid_phase")
    skill = _validate_token(skill, SKILLS, "invalid_skill")
    trigger = _validate_token(trigger, TRIGGERS, "invalid_trigger")
    origin = _validate_token(origin, ORIGINS, "invalid_origin")
    requirement = _validate_token(
        requirement, REQUIREMENTS, "invalid_requirement"
    )
    enforcement = _validate_token(
        enforcement, ENFORCEMENTS, "invalid_enforcement"
    )
    effect = _validate_token(effect, EFFECTS, "invalid_effect")
    if expectation_id is not None:
        expectation_id = _validate_uuid(
            expectation_id, "invalid_expectation_id"
        )
    if parent_phase_instance_id is not None:
        parent_phase_instance_id = _validate_uuid(
            parent_phase_instance_id, "invalid_parent_phase_instance_id"
        )
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root, lane, lane_id, lane_hash, owner_id, receipt_id, now
        )
        active = _active(lane)
        if active and parent_phase_instance_id is None:
            _advisory("active_phase_conflict")
        if parent_phase_instance_id is not None:
            parent = lane["phases"].get(parent_phase_instance_id)
            if parent is None or parent["status"] != "active":
                _advisory("parent_phase_not_active")
        pending = [
            item for item in _pending(lane)
            if item["phase"] == phase
            and item["skill"] == skill
            and item["trigger"] == trigger
            and item["requirement"] == requirement
            and item["effect"] == effect
        ]
        if expectation_id is not None:
            pending = [
                item for item in pending
                if item["expectation_id"] == expectation_id
            ]
            if not pending:
                _advisory("expectation_not_pending")
        elif len(pending) > 1:
            _advisory("ambiguous_expectation")
        expectation = pending[0] if len(pending) == 1 else None
        phase_id = _uuid()
        run_id = _uuid()
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=phase,
            skill=skill,
            correlation="exact",
            seconds=seconds,
            effect=effect,
        )
        attributes.update({
            "trigger": trigger,
            "origin": origin,
            "requirement": requirement,
            "enforcement": enforcement,
            "phase_instance_id": phase_id,
            "phase_start_run_id": run_id,
        })
        if expectation is not None:
            attributes["expectation_id"] = expectation["expectation_id"]
        if parent_phase_instance_id is not None:
            attributes[
                "parent_phase_instance_id"
            ] = parent_phase_instance_id
        payload, reason = emit_event(
            "phase.invoked",
            "started",
            root=root,
            run_id=run_id,
            attributes=attributes,
            inherit_phase_context=False,
        )
        if reason == "disabled":
            _advisory("phase_events_disabled")
        if reason is not None or payload is None:
            _advisory(reason or "event_write_failed")
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        expires, receipt_id = _renew(
            root, state, lane, lane_id, lane_hash, owner_id,
            receipt_id, now, seconds
        )
        record = lane["phases"][phase_id]
        result = _base_result("start", lane_hash)
        result.update({
            "expectation_id": record["expectation_id"],
            "phase_instance_id": phase_id,
            "phase_start_run_id": run_id,
            "run_id": run_id,
            "lease_expires_at": expires,
            "receipt_id": receipt_id,
            "environment": _environment(receipt_id, record),
        })
        return result


def complete(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    phase_instance_id: str | None,
    status: str,
    effect: str | None,
) -> dict:
    if phase_instance_id is not None:
        phase_instance_id = _validate_uuid(
            phase_instance_id, "invalid_phase_instance_id"
        )
    _input(status in {"ok", "failed"}, "invalid_completion_status")
    if effect is not None:
        effect = _validate_token(effect, EFFECTS, "invalid_effect")
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root, lane, lane_id, lane_hash, owner_id, receipt_id, now
        )
        if phase_instance_id is None:
            phase_instance_id = _active_leaf(lane)["phase_instance_id"]
        phase_record = lane["phases"].get(phase_instance_id)
        if phase_record is None:
            _advisory("phase_not_found")
        if phase_record["status"] in TERMINAL_PHASE:
            _advisory(
                "duplicate_terminal"
                if phase_record["status"] == f"completed_{status}"
                else "conflicting_terminal"
            )
        children = [
            item for item in _active(lane)
            if item["parent_phase_instance_id"] == phase_instance_id
        ]
        if children:
            _advisory("active_child_phase")
        committed_effect = effect or phase_record["effect"]
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=phase_record["phase"],
            skill=phase_record["skill"],
            correlation="exact",
            seconds=seconds,
            effect=committed_effect,
        )
        attributes.update({
            "phase_instance_id": phase_instance_id,
            "phase_start_run_id": phase_record["phase_start_run_id"],
        })
        payload = _emit(
            "phase.completed",
            status,
            root=root,
            parent_run_id=phase_record["phase_start_run_id"],
            attributes=attributes,
        )
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        expires, receipt_id = _renew(
            root, state, lane, lane_id, lane_hash, owner_id,
            receipt_id, now, seconds
        )
        result = _base_result("complete", lane_hash)
        result.update({
            "phase_instance_id": phase_instance_id,
            "phase_start_run_id": phase_record["phase_start_run_id"],
            "run_id": payload["run_id"],
            "status": status,
            "lease_expires_at": expires,
            "receipt_id": receipt_id,
        })
        return result


def skip(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    expectation_id: str,
    reason_code: str,
) -> dict:
    expectation_id = _validate_uuid(
        expectation_id, "invalid_expectation_id"
    )
    reason_code = _validate_reason(reason_code)
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root, lane, lane_id, lane_hash, owner_id, receipt_id, now
        )
        expectation = lane["expectations"].get(expectation_id)
        if expectation is None:
            _advisory("expectation_not_found")
        if expectation["status"] != "pending":
            _advisory("expectation_not_pending")
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=expectation["phase"],
            skill=expectation["skill"],
            correlation="exact",
            seconds=seconds,
            effect=expectation["effect"],
        )
        attributes.update({
            "trigger": expectation["trigger"],
            "origin": expectation["origin"],
            "requirement": expectation["requirement"],
            "enforcement": expectation["enforcement"],
            "expectation_id": expectation_id,
        })
        payload = _emit(
            "phase.skipped",
            "skipped",
            root=root,
            reason_code=reason_code,
            attributes=attributes,
        )
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        expires, receipt_id = _renew(
            root, state, lane, lane_id, lane_hash, owner_id,
            receipt_id, now, seconds
        )
        result = _base_result("skip", lane_hash)
        result.update({
            "expectation_id": expectation_id,
            "run_id": payload["run_id"],
            "lease_expires_at": expires,
            "receipt_id": receipt_id,
        })
        return result


def _terminalize(
    *,
    root: Path,
    state: dict,
    lane: dict,
    lane_hash: str,
    owner_id: str,
    pending: list[dict],
    active: list[dict],
    reason_code: str,
) -> list[dict]:
    seconds = lease_seconds()
    emitted = []
    for expectation in pending:
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=expectation["phase"],
            skill=expectation["skill"],
            correlation="exact",
            seconds=seconds,
            effect=expectation["effect"],
        )
        attributes.update({
            "trigger": expectation["trigger"],
            "origin": expectation["origin"],
            "requirement": expectation["requirement"],
            "enforcement": expectation["enforcement"],
            "expectation_id": expectation["expectation_id"],
        })
        payload = _emit(
            "phase.missed",
            "missed",
            root=root,
            reason_code=reason_code,
            attributes=attributes,
        )
        emitted.append({
            "event_type": payload["event_type"],
            "expectation_id": expectation["expectation_id"],
            "requirement": expectation["requirement"],
            "run_id": payload["run_id"],
        })
    active_by_id = {
        item["phase_instance_id"]: item for item in active
    }

    def depth(item: dict) -> int:
        value = 0
        parent = item["parent_phase_instance_id"]
        while parent in active_by_id:
            value += 1
            parent = active_by_id[parent]["parent_phase_instance_id"]
        return value

    child_first = sorted(
        active,
        key=lambda item: (-depth(item), item["phase_instance_id"]),
    )
    for phase_record in child_first:
        attributes = _common_attributes(
            lane_hash=lane_hash,
            owner_id=owner_id,
            phase=phase_record["phase"],
            skill=phase_record["skill"],
            correlation="exact",
            seconds=seconds,
            effect=phase_record["effect"],
        )
        attributes.update({
            "phase_instance_id": phase_record["phase_instance_id"],
            "phase_start_run_id": phase_record["phase_start_run_id"],
        })
        payload = _emit(
            "phase.abandoned",
            "abandoned",
            root=root,
            parent_run_id=phase_record["phase_start_run_id"],
            reason_code=reason_code,
            attributes=attributes,
        )
        emitted.append({
            "event_type": payload["event_type"],
            "phase_instance_id": phase_record["phase_instance_id"],
            "run_id": payload["run_id"],
        })
    return emitted


def _summary(
    command: str,
    lane_hash: str,
    lane: dict,
    *,
    receipt_id: str | None,
    orphans: list[str],
    emitted: list[dict],
) -> dict:
    expectations = sorted(
        lane["expectations"].values(),
        key=lambda value: value["expectation_id"],
    )
    phases = sorted(
        lane["phases"].values(),
        key=lambda value: value["phase_instance_id"],
    )
    gaps = []
    for expectation in expectations:
        if expectation["status"] == "pending":
            gaps.append(
                f"expectation:{expectation['expectation_id']}:not_invoked"
            )
    for phase_record in phases:
        if phase_record["status"] == "active":
            gaps.append(
                f"phase:{phase_record['phase_instance_id']}:not_completed"
            )
    return {
        "schema": SUMMARY_SCHEMA,
        "command": command,
        "ok": not lane["errors"],
        "advisory": True,
        "reason_code": (
            "invalid_event_order" if lane["errors"] else None
        ),
        "lane_id_hash": lane_hash,
        "receipt_id": receipt_id,
        "lease_expires_at": lane["lease_expires_at"],
        "expectations": expectations,
        "phases": phases,
        "effects": sorted(
            lane["effects"],
            key=lambda value: (
                value["phase_instance_id"] or "", value["run_id"] or ""
            ),
        ),
        "loaded": sorted(
            lane["loaded"],
            key=lambda value: (
                value["skill"] or "", value["run_id"] or ""
            ),
        ),
        "gaps": sorted(gaps),
        "errors": sorted(lane["errors"]),
        "discarded_cache_entries": orphans,
        "emitted": emitted,
        "counts": {
            "required_pending": sum(
                item["status"] == "pending"
                and item["requirement"] == "required"
                for item in expectations
            ),
            "offered_pending": sum(
                item["status"] == "pending"
                and item["requirement"] == "offered"
                for item in expectations
            ),
            "active": sum(
                item["status"] == "active" for item in phases
            ),
        },
    }


def status(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
) -> dict:
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        cache, cache_errors = _read_cache(root)
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root,
            lane,
            lane_id,
            lane_hash,
            owner_id,
            receipt_id,
            now,
            allow_stale=True,
        )
        orphans = sorted(cache_errors + _cache_orphans(cache, state))
        expired = (
            lane["lease_expires_at"] is not None
            and _parse_time(lane["lease_expires_at"]) < now
        )
        if not expired:
            _, receipt_id = _renew(
                root, state, lane, lane_id, lane_hash, owner_id,
                receipt_id, now, seconds
            )
        return _summary(
            "status",
            lane_hash,
            lane,
            receipt_id=receipt_id,
            orphans=orphans,
            emitted=[],
        )


def reconcile(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    session_ended: bool,
) -> dict:
    lane_hash = sha256_text(lane_id)
    now = _now()
    seconds = lease_seconds()
    with _state_lock(root):
        cache, cache_errors = _read_cache(root)
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root,
            lane,
            lane_id,
            lane_hash,
            owner_id,
            receipt_id,
            now,
            allow_stale=True,
        )
        orphans = sorted(cache_errors + _cache_orphans(cache, state))
        expired = (
            lane["lease_expires_at"] is not None
            and _parse_time(lane["lease_expires_at"]) < now
        )
        emitted = []
        if session_ended or expired:
            emitted = _terminalize(
                root=root,
                state=state,
                lane=lane,
                lane_hash=lane_hash,
                owner_id=owner_id,
                pending=_pending(lane),
                active=_active(lane),
                reason_code=(
                    "session_ended" if session_ended else "lease_expired"
                ),
            )
            state = _rebuild(root)
            lane = _lane(state, lane_hash)
        _, receipt_id = _renew(
            root, state, lane, lane_id, lane_hash, owner_id,
            receipt_id, now, seconds
        )
        return _summary(
            "reconcile",
            lane_hash,
            lane,
            receipt_id=receipt_id,
            orphans=orphans,
            emitted=emitted,
        )


def finalize(
    *,
    root: Path,
    lane_id: str,
    owner_id: str,
    receipt_id: str | None,
    session_ended: bool,
) -> dict:
    _input(session_ended, "session_ended_required")
    summary = reconcile(
        root=root,
        lane_id=lane_id,
        owner_id=owner_id,
        receipt_id=receipt_id,
        session_ended=True,
    )
    summary["command"] = "finalize"
    return summary


@contextmanager
def phase_event_guard(
    *,
    root: Path,
    phase_instance_id: str,
    phase_start_run_id: str,
    phase: str,
    skill: str,
    lane_id: str | None,
    owner_id: str | None,
    receipt_id: str | None,
):
    guard = {
        "exact": False,
        "reason_code": None,
        "appended": False,
    }
    try:
        phase_instance_id = _validate_uuid(
            phase_instance_id, "invalid_phase_instance_id"
        )
        _input(
            TOKEN_RE.fullmatch(phase_start_run_id) is not None,
            "invalid_phase_start_run_id",
        )
        phase = _validate_token(phase, PHASES, "invalid_phase")
        skill = _validate_token(skill, SKILLS, "invalid_skill")
        lane_id, owner_id, receipt_id = resolve_context(
            root,
            lane_id,
            owner_id,
            receipt_id,
            allow_stale=False,
        )
        lane_hash = sha256_text(lane_id)
        seconds = lease_seconds()
        now = _now()
    except PhaseInputError:
        guard["reason_code"] = "phase_context_invalid"
        yield guard
        return
    except PhaseAdvisoryError as exc:
        guard["reason_code"] = exc.code
        yield guard
        return
    lock = _state_lock(root)
    locked = False
    try:
        lock.__enter__()
        locked = True
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root,
            lane,
            lane_id,
            lane_hash,
            owner_id,
            receipt_id,
            now,
        )
        record = lane["phases"].get(phase_instance_id)
        if (
            record is None
            or record["status"] != "active"
            or record["phase_start_run_id"] != phase_start_run_id
            or record["phase"] != phase
            or record["skill"] != skill
        ):
            guard["reason_code"] = "phase_context_mismatch"
        else:
            guard.update({
                "exact": True,
                "phase": phase,
                "skill": skill,
                "phase_instance_id": phase_instance_id,
                "phase_start_run_id": phase_start_run_id,
                "lane_id_hash": lane_hash,
                "owner_id_hash": sha256_text(owner_id),
                "lease_seconds": seconds,
            })
    except PhaseAdvisoryError as exc:
        if locked:
            lock.__exit__(None, None, None)
        guard["exact"] = False
        guard["reason_code"] = exc.code
        yield guard
        return
    try:
        yield guard
        if guard["exact"] and guard["appended"]:
            try:
                _renew(
                    root,
                    state,
                    lane,
                    lane_id,
                    lane_hash,
                    owner_id,
                    receipt_id,
                    now,
                    seconds,
                )
            except PhaseAdvisoryError:
                pass
    finally:
        lock.__exit__(None, None, None)


def markdown(summary: dict) -> str:
    lines = [
        "# cognition phase status",
        "",
        f"- lane: `{summary['lane_id_hash']}`",
        f"- ok: `{str(summary['ok']).lower()}`",
        f"- required pending: {summary['counts']['required_pending']}",
        f"- offered pending: {summary['counts']['offered_pending']}",
        f"- active: {summary['counts']['active']}",
    ]
    if summary["gaps"]:
        lines.extend(["", "## Gaps"])
        lines.extend(f"- `{gap}`" for gap in summary["gaps"])
    if summary["errors"]:
        lines.extend(["", "## Errors"])
        lines.extend(f"- `{error}`" for error in summary["errors"])
    return "\n".join(lines) + "\n"


def advisory_result(command: str, reason_code: str) -> dict:
    return {
        "schema": RESULT_SCHEMA,
        "command": command,
        "ok": False,
        "advisory": True,
        "reason_code": reason_code,
    }


def resolve_context(
    root: Path,
    lane_id: str | None,
    owner_id: str | None,
    receipt_id: str | None,
    *,
    allow_stale: bool,
) -> tuple[str, str, str | None]:
    raw_lane = lane_id or os.environ.get("CORTEX_PHASE_LANE_ID")
    raw_owner = owner_id or os.environ.get("CORTEX_PHASE_OWNER_ID")
    receipt_id = (
        receipt_id or os.environ.get("CORTEX_PHASE_RECEIPT_ID")
    )
    if receipt_id is not None:
        receipt_id = _receipt_id(receipt_id)
        receipt = _read_owner(root, receipt_id)
        if receipt is None:
            _advisory("phase_owner_receipt_not_found")
        if (
            raw_lane is not None
            and raw_lane != receipt["lane_id"]
        ) or (
            raw_owner is not None
            and raw_owner.lower() != receipt["owner_id"]
        ):
            _advisory("phase_owner_receipt_mismatch")
        if (
            _parse_time(receipt["lease_expires_at"]) < _now()
            and not allow_stale
        ):
            _advisory("phase_owner_receipt_stale")
        return receipt["lane_id"], receipt["owner_id"], receipt_id
    lane = _lane_id(raw_lane)
    owner = _owner_id(raw_owner)
    existing_id, _ = _find_owner(root, lane, owner)
    return lane, owner, existing_id


def resolve_active_phase_context(
    root: Path,
    receipt_id: str,
    lane_id: str | None = None,
    owner_id: str | None = None,
) -> dict:
    lane_id, owner_id, receipt_id = resolve_context(
        root,
        lane_id,
        owner_id,
        receipt_id,
        allow_stale=False,
    )
    lane_hash = sha256_text(lane_id)
    now = _now()
    with _state_lock(root):
        state = _rebuild(root)
        lane = _lane(state, lane_hash)
        receipt_id = _owner_matches(
            root,
            lane,
            lane_id,
            lane_hash,
            owner_id,
            receipt_id,
            now,
        )
        phase_record = _active_leaf(lane)
        return {
            "phase_instance_id": phase_record["phase_instance_id"],
            "phase_start_run_id": phase_record["phase_start_run_id"],
            "phase": phase_record["phase"],
            "skill": phase_record["skill"],
            "phase_receipt_id": receipt_id,
        }


def default_root() -> Path:
    return repo_root().resolve()
