"""Validated consolidation plans and per-file atomic application."""
from __future__ import annotations

import copy
import datetime
import difflib
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path

from cognition_event import emit_event

try:
    import fcntl
except ImportError:
    fcntl = None
try:
    import msvcrt
except ImportError:
    msvcrt = None

PLAN_SCHEMA = "cortex.consolidation-plan/v1"
RECEIPT_SCHEMA = "cortex.consolidation-receipt/v1"
MEMORY_PATHS = {"memory/learnings.md", "memory/decisions.md"}
INTAKE_PATH_RE = re.compile(r"^workspace/[A-Za-z0-9._-]+/intake\.md$")
MEMORY_REF_RE = re.compile(
    r"^memory/(?:learnings|decisions)\.md::[^\n]+$"
)
INTAKE_REF_RE = re.compile(
    r"^(workspace/[A-Za-z0-9._-]+/intake\.md)::line-sha256:([0-9a-f]{64})$"
)
INTAKE_RECORD_RE = re.compile(
    r"^- captured:\s*(\d{4}-\d{2}-\d{2})\s+"
    r"status:\s*(open|proposed|accepted|rejected|drained)\b"
)
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,160}$")
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
HEADING_RE = re.compile(r"^### (.+?)\s*$", re.MULTILINE)
FIELD_RE = re.compile(r"^([a-z-]+):\s*(.*)$", re.MULTILINE)
ALLOWED_TYPES = {
    "pattern", "pitfall", "preference", "tool",
    "operational", "architecture", "investigation", "decision",
}
RUN_KINDS = {"done", "pre_compaction", "recurrence", "on_demand"}
PROPOSERS = {"model", "agent", "operator"}
APPROVERS = {"operator", "self_authorized_agent"}


class TransactionError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def fail(code: str):
    raise TransactionError(code)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def canonical_json(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def plan_hash(plan: dict) -> str:
    return sha256_text(canonical_json(plan))


def repo_root() -> Path:
    configured = os.environ.get("CORTEX_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            capture_output=True,
            check=True,
        )
        return Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.SubprocessError):
        return Path.cwd().resolve()


def now() -> str:
    return datetime.datetime.now(
        datetime.timezone.utc
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_time(value: str) -> None:
    try:
        datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        fail("invalid_created_at")


def _approved_path(path: str) -> bool:
    return path in MEMORY_PATHS or INTAKE_PATH_RE.fullmatch(path) is not None


def _relative_parts(relative: str) -> tuple[str, ...]:
    path = Path(relative)
    if (
        path.is_absolute()
        or "\\" in relative
        or not path.parts
        or ".." in path.parts
        or "." in path.parts
    ):
        fail("path_outside_repo")
    return path.parts


def _open_parent(
    root: Path,
    relative: str,
    *,
    create: bool = False,
) -> tuple[int, str]:
    parts = _relative_parts(relative)
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory = getattr(os, "O_DIRECTORY", 0)
    if not nofollow or not directory:
        fail("secure_io_unavailable")
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
        fail("path_parent_invalid")


def _secure_read(root: Path, relative: str) -> str:
    parent, name = _open_parent(root, relative)
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
            fail("target_not_regular")
        with os.fdopen(fd, encoding="utf-8", closefd=True) as handle:
            fd = None
            return handle.read()
    except (OSError, UnicodeError):
        fail("target_unreadable")
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


@contextmanager
def _apply_lock(root: Path):
    parent, name = _open_parent(
        root, ".cortex/transactions/apply.lock", create=True
    )
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    nonblock = getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(
            name,
            os.O_CREAT | os.O_RDWR | nofollow | nonblock,
            0o600,
            dir_fd=parent,
        )
    except OSError:
        os.close(parent)
        fail("apply_lock_unavailable")
    os.close(parent)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            fail("apply_lock_unavailable")
        if fcntl is not None:
            fcntl.flock(fd, fcntl.LOCK_EX)
        elif msvcrt is not None:
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            fail("apply_lock_unavailable")
    except OSError:
        os.close(fd)
        fail("apply_lock_unavailable")
    except TransactionError:
        os.close(fd)
        raise
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


def _secure_exists(root: Path, relative: str) -> bool:
    try:
        _secure_read(root, relative)
        return True
    except TransactionError:
        return False


def _secure_atomic_write(
    root: Path,
    relative: str,
    data: bytes,
    *,
    mode: int | None,
    create_parents: bool = False,
) -> None:
    parent, name = _open_parent(root, relative, create=create_parents)
    temporary = f".{name}.{uuid.uuid4().hex}.tmp"
    fd = None
    try:
        if mode is None:
            target_stat = os.stat(
                name, dir_fd=parent, follow_symlinks=False
            )
            if not stat.S_ISREG(target_stat.st_mode):
                fail("target_not_regular")
            mode = target_stat.st_mode & 0o777
        fd = os.open(
            temporary,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0),
            mode,
            dir_fd=parent,
        )
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=True) as handle:
            fd = None
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(
            temporary,
            name,
            src_dir_fd=parent,
            dst_dir_fd=parent,
        )
        os.fsync(parent)
    except OSError:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(temporary, dir_fd=parent)
        except OSError:
            pass
        raise
    finally:
        os.close(parent)


def _read_target(root: Path, relative: str) -> str:
    if not _approved_path(relative):
        fail("target_not_allowed")
    if not _secure_exists(root, relative):
        fail("target_missing")
    return _secure_read(root, relative)


def _validate_metadata(plan: dict) -> None:
    required = {
        "schema", "transaction_id", "created_at", "proposer", "origin",
        "run_kind", "candidate_refs", "evidence_refs", "approval", "operations",
    }
    if not isinstance(plan, dict) or not required.issubset(plan):
        fail("plan_fields_missing")
    if plan["schema"] != PLAN_SCHEMA:
        fail("unsupported_plan_schema")
    if not isinstance(plan["transaction_id"], str) or not ID_RE.fullmatch(
        plan["transaction_id"]
    ):
        fail("invalid_transaction_id")
    _parse_time(plan["created_at"])
    if plan["proposer"] not in PROPOSERS:
        fail("invalid_proposer")
    if not isinstance(plan["origin"], str) or not TOKEN_RE.fullmatch(
        plan["origin"]
    ):
        fail("invalid_origin")
    if plan["run_kind"] not in RUN_KINDS:
        fail("invalid_run_kind")

    candidates = plan["candidate_refs"]
    if not isinstance(candidates, list) or not candidates:
        fail("candidate_refs_missing")
    if len(candidates) != len(set(candidates)):
        fail("duplicate_candidate_ref")
    for ref in candidates:
        if not isinstance(ref, str) or not (
            MEMORY_REF_RE.fullmatch(ref) or INTAKE_REF_RE.fullmatch(ref)
        ):
            fail("invalid_candidate_ref")

    evidence = plan["evidence_refs"]
    if not isinstance(evidence, list) or not evidence:
        fail("evidence_refs_missing")
    if len(evidence) != len(set(evidence)):
        fail("duplicate_evidence_ref")
    for ref in evidence:
        if (
            not isinstance(ref, str)
            or not TOKEN_RE.fullmatch(ref)
            or ref.startswith("/")
            or ".." in Path(ref).parts
        ):
            fail("invalid_evidence_ref")

    approval = plan["approval"]
    if not isinstance(approval, dict):
        fail("invalid_approval")
    if approval.get("status") not in {"pending", "approved", "rejected"}:
        fail("invalid_approval_status")
    approver = approval.get("approver_class")
    if approval["status"] == "approved" and approver not in APPROVERS:
        fail("invalid_approver_class")
    if approval["status"] != "approved" and approver not in (None, ""):
        fail("unexpected_approver")

    operations = plan["operations"]
    if not isinstance(operations, list) or not operations:
        fail("operations_missing")
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict) or operation.get("index") != index:
            fail("ambiguous_operation_order")
        if operation.get("op") not in {
            "append_record", "replace_record", "intake_status"
        }:
            fail("operation_not_allowed")
        if not isinstance(operation.get("target"), str):
            fail("operation_target_missing")
        if not _approved_path(operation["target"]):
            fail("target_not_allowed")
        if operation["op"] in {"append_record", "replace_record"}:
            if operation["target"] not in MEMORY_PATHS:
                fail("record_target_not_memory")
            if not isinstance(operation.get("record"), str):
                fail("record_missing")
        if operation["op"] == "replace_record":
            ref = operation.get("ref")
            if not isinstance(ref, str) or not MEMORY_REF_RE.fullmatch(ref):
                fail("replace_ref_invalid")
            if ref.split("::", 1)[0] != operation["target"]:
                fail("replace_ref_target_mismatch")
        if operation["op"] == "intake_status":
            if not INTAKE_PATH_RE.fullmatch(operation["target"]):
                fail("intake_target_invalid")
            candidate = operation.get("candidate_ref")
            match = INTAKE_REF_RE.fullmatch(candidate or "")
            if not match or match.group(1) != operation["target"]:
                fail("intake_candidate_invalid")
            if candidate not in candidates:
                fail("intake_candidate_unlisted")
            if operation.get("from") not in {"open", "proposed"}:
                fail("intake_source_status_invalid")
            if operation.get("to") not in {"drained", "rejected"}:
                fail("intake_target_status_invalid")
            if operation["to"] == "drained":
                if not KEY_RE.fullmatch(operation.get("derives_to", "")):
                    fail("intake_derivation_missing")
            elif not isinstance(operation.get("reason"), str) or not (
                1 <= len(operation["reason"]) <= 160
            ) or "\n" in operation["reason"]:
                fail("rejection_reason_invalid")


def _heading_key(heading: str) -> str:
    return heading.split("·", 1)[0].strip()


def _record_spans(content: str) -> list[tuple[str, int, int, str]]:
    matches = list(HEADING_RE.finditer(content))
    records = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        records.append((
            _heading_key(match.group(1)),
            match.start(),
            end,
            content[match.start():end],
        ))
    return records


def _record_fields(record: str) -> dict[str, str]:
    fields = {}
    for match in FIELD_RE.finditer(record):
        fields[match.group(1)] = match.group(2).strip()
    source = fields.get("source", "")
    scope = re.search(r"\bscope:\s*(\S+)", source)
    fields["scope"] = scope.group(1) if scope else fields.get("scope", "")
    return fields


def _normalize_record(record: str) -> str:
    return record.strip("\n") + "\n"


def _validate_record(
    record: str,
    target: str,
    require_current_quality: bool = True,
) -> tuple[str, dict[str, str]]:
    normalized = _normalize_record(record)
    spans = _record_spans(normalized)
    if len(spans) != 1 or spans[0][1] != 0:
        fail("record_count_invalid")
    key = spans[0][0]
    if not KEY_RE.fullmatch(key):
        fail("record_key_invalid")
    fields = _record_fields(normalized)
    required = {"insight", "trigger", "tags", "evidence", "source", "updated"}
    if not required.issubset(fields) or not fields["scope"]:
        fail("record_fields_missing")
    source_value = fields["source"].split()[0] if fields["source"] else ""
    if source_value not in {"observed", "operator", "imported"}:
        fail("record_source_invalid")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", fields["scope"]):
        fail("record_scope_invalid")
    if require_current_quality:
        if len(fields["insight"].split()) > 25:
            fail("insight_not_atomic")
        if ";" in fields["insight"] or len(
            re.findall(r"[.!?](?:\s|$)", fields["insight"])
        ) > 1:
            fail("insight_not_atomic")
    tags = [tag.strip() for tag in fields["tags"].split(",") if tag.strip()]
    if require_current_quality and (
        not 3 <= len(tags) <= 8 or any(tag != tag.lower() for tag in tags)
    ):
        fail("tags_invalid")
    try:
        datetime.date.fromisoformat(fields["updated"])
    except ValueError:
        fail("updated_invalid")
    heading = spans[0][3].splitlines()[0]
    type_match = re.search(r"\btype:([a-z-]+)", heading)
    if not type_match or type_match.group(1) not in ALLOWED_TYPES:
        fail("record_type_invalid")
    if target == "memory/decisions.md":
        if type_match.group(1) != "decision" or "supersedes:" not in heading:
            fail("decision_shape_invalid")
    elif type_match.group(1) == "decision":
        fail("decision_target_invalid")
    elif not re.search(r"\bconf:(?:[0-9]|10)/10\b", heading):
        fail("confidence_invalid")
    return key, fields


def _append_record(content: str, record: str) -> str:
    normalized = _normalize_record(record)
    if not content:
        return normalized
    return content.rstrip("\n") + "\n\n" + normalized


def _replace_record(content: str, ref: str, record: str) -> str:
    key = ref.split("::", 1)[1]
    matches = [span for span in _record_spans(content) if span[0] == key]
    if len(matches) != 1:
        fail("replace_ref_not_unique")
    _, start, end, _ = matches[0]
    replacement = _normalize_record(record)
    if end < len(content) or content[end:].strip():
        replacement += "\n"
    elif end == len(content) and content[end - 1:end] == "\n":
        replacement += "\n"
    return content[:start] + replacement + content[end:]


def intake_ref(path: str, line: str) -> str:
    return f"{path}::line-sha256:{sha256_text(line)}"


def inspect_intake(root: Path, relative: str) -> list[dict]:
    if not INTAKE_PATH_RE.fullmatch(relative):
        fail("intake_target_invalid")
    output = []
    for number, line in enumerate(_read_target(root, relative).splitlines(), 1):
        match = INTAKE_RECORD_RE.match(line)
        if not match or match.group(2) not in {"open", "proposed"}:
            continue
        output.append({
            "ref": intake_ref(relative, line),
            "line": number,
            "status": match.group(2),
            "captured": match.group(1),
        })
    return output


def _update_intake(content: str, operation: dict) -> str:
    lines = content.splitlines(keepends=True)
    expected = operation["candidate_ref"]
    found = []
    for index, original in enumerate(lines):
        line = original.rstrip("\r\n")
        if (
            INTAKE_RECORD_RE.match(line)
            and intake_ref(operation["target"], line) == expected
        ):
            found.append((index, original, line))
    if not found:
        fail("candidate_ref_missing")
    if len(found) > 1:
        fail("intake_candidate_not_unique")
    index, original, line = found[0]
    status_match = re.search(r"\bstatus:\s*([a-z]+)\b", line)
    if not status_match or status_match.group(1) != operation["from"]:
        fail("intake_status_stale")
    updated = (
        line[:status_match.start(1)]
        + operation["to"]
        + line[status_match.end(1):]
    )
    if operation["to"] == "drained":
        if "derives-to:" in updated:
            fail("intake_derivation_already_present")
        updated += f"  derives-to: {operation['derives_to']}"
    else:
        if "reason:" in updated:
            fail("intake_reason_already_present")
        updated += f"  reason: {operation['reason']}"
    newline = original[len(line):]
    lines[index] = updated + newline
    return "".join(lines)


def _target_order(plan: dict) -> list[str]:
    order = []
    for operation in plan["operations"]:
        target = operation["target"]
        if target not in order:
            order.append(target)
    return (
        [target for target in order if target in MEMORY_PATHS]
        + [target for target in order if target not in MEMORY_PATHS]
    )


def _apply_operations(
    plan: dict,
    contents: dict[str, str],
    skipped: set[str] | None = None,
) -> dict[str, str]:
    output = dict(contents)
    skipped = skipped or set()
    for operation in plan["operations"]:
        target = operation["target"]
        if target in skipped:
            continue
        if operation["op"] == "append_record":
            _validate_record(operation["record"], target)
            output[target] = _append_record(output[target], operation["record"])
        elif operation["op"] == "replace_record":
            replacement_key, _ = _validate_record(operation["record"], target)
            if replacement_key != operation["ref"].split("::", 1)[1]:
                fail("replace_key_changed")
            output[target] = _replace_record(
                output[target], operation["ref"], operation["record"]
            )
        else:
            output[target] = _update_intake(output[target], operation)
    return output


def _changed_memory_refs(plan: dict) -> set[tuple[str, str]]:
    refs = set()
    for operation in plan["operations"]:
        if operation["op"] == "append_record":
            spans = _record_spans(_normalize_record(operation["record"]))
            if len(spans) == 1:
                refs.add((operation["target"], spans[0][0]))
        elif operation["op"] == "replace_record":
            refs.add((
                operation["target"],
                operation["ref"].split("::", 1)[1],
            ))
    return refs


def _validate_memory_outputs(
    outputs: dict[str, str],
    strict_quality_refs: set[tuple[str, str]] | None = None,
) -> set[str]:
    all_records = []
    for path in MEMORY_PATHS:
        content = outputs.get(path)
        if content is None:
            continue
        for key, _, _, record in _record_spans(content):
            validated_key, fields = _validate_record(
                record,
                path,
                require_current_quality=(
                    strict_quality_refs is None
                    or (path, key) in strict_quality_refs
                ),
            )
            if validated_key != key:
                fail("record_key_invalid")
            all_records.append((path, key, fields))
    keys = [record[1] for record in all_records]
    if len(keys) != len(set(keys)):
        fail("duplicate_record_key")
    key_set = set(keys)
    for _, _, fields in all_records:
        derives = [
            value.strip()
            for value in fields.get("derives-from", "").split(",")
            if value.strip()
        ]
        if any(parent not in key_set for parent in derives):
            fail("hard_derivation_unresolved")
    return key_set


def _validate_intake_derivations(plan: dict, memory_keys: set[str]) -> None:
    for operation in plan["operations"]:
        if (
            operation["op"] == "intake_status"
            and operation["to"] == "drained"
            and operation["derives_to"] not in memory_keys
        ):
            fail("intake_derivation_unresolved")


def _validate_candidate_refs(
    plan: dict,
    before: dict[str, str],
) -> None:
    memory_refs = {
        f"{path}::{key}"
        for path in MEMORY_PATHS
        for key, _, _, _ in _record_spans(before.get(path, ""))
    }
    intake_refs = {
        intake_ref(path, line)
        for path, content in before.items()
        if INTAKE_PATH_RE.fullmatch(path)
        for line in content.splitlines()
        if INTAKE_RECORD_RE.match(line)
    }
    for ref in plan["candidate_refs"]:
        if MEMORY_REF_RE.fullmatch(ref) and ref not in memory_refs:
            fail("candidate_ref_missing")
        if INTAKE_REF_RE.fullmatch(ref) and ref not in intake_refs:
            fail("candidate_ref_missing")


def prepare_plan(plan: dict, root: Path) -> tuple[dict, dict[str, str]]:
    _validate_metadata(plan)
    order = _target_order(plan)
    before = {}
    for path in order:
        before[path] = _read_target(root, path)
    after = _apply_operations(plan, before)

    combined = dict(before)
    combined.update(after)
    for memory_path in MEMORY_PATHS:
        if memory_path not in combined and _secure_exists(root, memory_path):
            combined[memory_path] = _secure_read(root, memory_path)
    memory_keys = _validate_memory_outputs(
        combined,
        strict_quality_refs=_changed_memory_refs(plan),
    )
    _validate_intake_derivations(plan, memory_keys)
    candidate_before = dict(before)
    for memory_path in MEMORY_PATHS:
        if memory_path not in candidate_before and _secure_exists(root, memory_path):
            candidate_before[memory_path] = _secure_read(root, memory_path)
    _validate_candidate_refs(plan, candidate_before)
    for evidence in plan["evidence_refs"]:
        if not _secure_exists(root, evidence):
            fail("evidence_ref_missing")

    prepared = copy.deepcopy(plan)
    prepared["targets"] = [
        {
            "path": path,
            "preimage_sha256": sha256_text(before[path]),
            "result_sha256": sha256_text(after[path]),
        }
        for path in order
    ]
    return prepared, after


def _target_contracts(plan: dict) -> dict[str, dict]:
    targets = plan.get("targets")
    if not isinstance(targets, list) or not targets:
        fail("target_contracts_missing")
    order = _target_order(plan)
    if [target.get("path") for target in targets] != order:
        fail("target_contract_order_invalid")
    output = {}
    for target in targets:
        if set(target) != {"path", "preimage_sha256", "result_sha256"}:
            fail("target_contract_invalid")
        if not all(
            isinstance(target.get(field), str)
            and re.fullmatch(r"[0-9a-f]{64}", target[field])
            for field in ("preimage_sha256", "result_sha256")
        ):
            fail("target_hash_invalid")
        output[target["path"]] = target
    return output


def evaluate_prepared(
    plan: dict,
    root: Path,
    allow_post: set[str] | None = None,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    _validate_metadata(plan)
    contracts = _target_contracts(plan)
    allow_post = allow_post or set()
    before = {}
    states = {}
    skipped = set()
    for path in _target_order(plan):
        content = _read_target(root, path)
        digest = sha256_text(content)
        contract = contracts[path]
        if digest == contract["preimage_sha256"]:
            states[path] = "pending"
        elif digest == contract["result_sha256"] and path in allow_post:
            states[path] = "applied"
            skipped.add(path)
        else:
            fail("preimage_mismatch")
        before[path] = content
    after = _apply_operations(plan, before, skipped=skipped)

    for path, content in after.items():
        if sha256_text(content) != contracts[path]["result_sha256"]:
            fail("result_hash_mismatch")
    combined = dict(after)
    for memory_path in MEMORY_PATHS:
        if memory_path not in combined and _secure_exists(root, memory_path):
            combined[memory_path] = _secure_read(root, memory_path)
    memory_keys = _validate_memory_outputs(
        combined,
        strict_quality_refs=_changed_memory_refs(plan),
    )
    _validate_intake_derivations(plan, memory_keys)
    if not allow_post:
        candidate_before = dict(before)
        for memory_path in MEMORY_PATHS:
            if memory_path not in candidate_before and _secure_exists(root, memory_path):
                candidate_before[memory_path] = _secure_read(root, memory_path)
        _validate_candidate_refs(plan, candidate_before)
    return before, after, states


def preview_plan(plan: dict, root: Path) -> str:
    before, after, _ = evaluate_prepared(plan, root)
    chunks = []
    for path in _target_order(plan):
        chunks.extend(difflib.unified_diff(
            before[path].splitlines(keepends=True),
            after[path].splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        ))
    return "".join(chunks)


def _replace_target(root: Path, relative: str, content: str) -> None:
    try:
        _secure_atomic_write(
            root,
            relative,
            content.encode("utf-8"),
            mode=None,
        )
    except OSError:
        raise


def receipt_path(root: Path, transaction_id: str) -> Path:
    if not ID_RE.fullmatch(transaction_id):
        fail("invalid_transaction_id")
    root = root.resolve()
    cortex_dir = root / ".cortex"
    transactions = cortex_dir / "transactions"
    if cortex_dir.is_symlink() or transactions.is_symlink():
        fail("receipt_path_symlink")
    if cortex_dir.exists():
        try:
            cortex_dir.resolve().relative_to(root)
        except ValueError:
            fail("receipt_path_outside_repo")
    return transactions / f"{transaction_id}.json"


def _receipt_relative(transaction_id: str) -> str:
    if not ID_RE.fullmatch(transaction_id):
        fail("invalid_transaction_id")
    return f".cortex/transactions/{transaction_id}.json"


def failure_receipt(plan: dict, root: Path, code: str) -> dict | None:
    transaction_id = plan.get("transaction_id") if isinstance(plan, dict) else None
    if not isinstance(transaction_id, str) or not ID_RE.fullmatch(transaction_id):
        return None
    targets = []
    for target in plan.get("targets", []):
        if not isinstance(target, dict) or not _approved_path(target.get("path", "")):
            continue
        targets.append({
            "path": target["path"],
            "preimage_sha256": target.get("preimage_sha256"),
            "result_sha256": target.get("result_sha256"),
            "status": "pending",
            "applied_at": None,
        })
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "transaction_id": transaction_id,
        "plan_sha256": plan_hash(plan),
        "created_at": now(),
        "status": "stale" if code == "preimage_mismatch" else "rejected",
        "reason_code": code,
        "targets": targets,
    }
    existing = _load_receipt(root, transaction_id)
    if existing:
        return existing
    _write_receipt(root, transaction_id, receipt)
    return receipt


def _write_receipt(root: Path, transaction_id: str, receipt: dict) -> None:
    try:
        _secure_atomic_write(
            root,
            _receipt_relative(transaction_id),
            (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8"),
            mode=0o600,
            create_parents=True,
        )
    except OSError:
        fail("receipt_write_failed")


def _load_receipt(root: Path, transaction_id: str) -> dict | None:
    relative = _receipt_relative(transaction_id)
    if not _secure_exists(root, relative):
        return None
    try:
        receipt = json.loads(_secure_read(root, relative))
    except (TransactionError, json.JSONDecodeError):
        fail("receipt_invalid")
    if receipt.get("schema") != RECEIPT_SCHEMA:
        fail("receipt_invalid")
    return receipt


def apply_plan(
    plan: dict,
    root: Path,
    *,
    fail_after: int | None = None,
    phase_context: dict | None = None,
) -> dict:
    with _apply_lock(root):
        return _apply_plan_locked(
            plan,
            root,
            fail_after=fail_after,
            phase_context=phase_context,
        )


def _resolved_phase_context(
    explicit: dict | None,
    root: Path,
) -> tuple[dict | None, str | None]:
    explicit = explicit or {}
    names = {
        "phase_instance_id": "CORTEX_PHASE_INSTANCE_ID",
        "phase_start_run_id": "CORTEX_PHASE_START_RUN_ID",
        "phase": "CORTEX_PHASE_NAME",
        "skill": "CORTEX_PHASE_SKILL",
        "phase_lane_id": "CORTEX_PHASE_LANE_ID",
        "phase_owner_id": "CORTEX_PHASE_OWNER_ID",
        "phase_receipt_id": "CORTEX_PHASE_RECEIPT_ID",
    }
    values = {
        name: (
            explicit.get(name)
            or (
                explicit.get("receipt_id")
                if name == "phase_receipt_id"
                else None
            )
            or os.environ.get(environment)
        )
        for name, environment in names.items()
    }
    if not any(values.values()):
        return None, "phase_context_absent"
    if values["phase_receipt_id"]:
        try:
            import cognition_phase

            resolved = cognition_phase.resolve_active_phase_context(
                root,
                values["phase_receipt_id"],
                lane_id=values["phase_lane_id"],
                owner_id=values["phase_owner_id"],
            )
        except (
            cognition_phase.PhaseInputError,
            cognition_phase.PhaseAdvisoryError,
        ) as exc:
            return None, exc.code
        for name in (
            "phase_instance_id", "phase_start_run_id", "phase", "skill",
        ):
            if values[name] is not None and values[name] != resolved[name]:
                return None, "phase_context_mismatch"
        return resolved, None
    lifecycle_complete = all(
        values[name]
        for name in (
            "phase_instance_id", "phase_start_run_id", "phase", "skill",
        )
    )
    identity_complete = values["phase_lane_id"] and values["phase_owner_id"]
    if not lifecycle_complete or not identity_complete:
        return None, "phase_context_incomplete"
    return values, None


def _transaction_effects(plan: dict) -> list[str]:
    effects = []
    if any(
        operation["op"] in {"append_record", "replace_record"}
        for operation in plan["operations"]
    ):
        effects.append("memory_write")
    if any(
        operation["op"] == "intake_status"
        for operation in plan["operations"]
    ):
        effects.append("intake_transition")
    return effects


def _mechanism_attributes(
    transaction_id: str,
    phase_context_reason: str | None,
) -> dict:
    attributes = {"transaction_id": transaction_id}
    if phase_context_reason is not None:
        attributes.update({
            "correlation": "unavailable",
            "phase_correlation_reason": phase_context_reason,
        })
    return attributes


def _emit_committed_effects(
    plan: dict,
    root: Path,
    receipt: dict,
    resolved_phase_context: dict | None,
) -> None:
    if resolved_phase_context is None:
        return
    for effect in _transaction_effects(plan):
        _, reason = emit_event(
            "phase.effect_committed",
            "ok",
            root=root,
            refs=[f".cortex/transactions/{plan['transaction_id']}.json"],
            hashes={"plan_sha256": receipt["plan_sha256"]},
            attributes={
                "transaction_id": plan["transaction_id"],
                "effect": effect,
            },
            **resolved_phase_context,
        )
        if reason is not None:
            print(
                "consolidate-transaction: event warning "
                f"(reason: {reason})",
                file=sys.stderr,
            )


def _apply_plan_locked(
    plan: dict,
    root: Path,
    *,
    fail_after: int | None = None,
    phase_context: dict | None = None,
) -> dict:
    _validate_metadata(plan)
    if plan["approval"].get("status") != "approved":
        failure_receipt(plan, root, "approval_required")
        fail("approval_required")
    tx_hash = plan_hash(plan)
    transaction_id = plan["transaction_id"]
    runtime_context, phase_context_reason = _resolved_phase_context(
        phase_context, root
    )
    if (
        phase_context_reason is not None
        and phase_context_reason != "phase_context_absent"
    ):
        print(
            "consolidate-transaction: event warning "
            f"(reason: {phase_context_reason})",
            file=sys.stderr,
        )
    existing = _load_receipt(root, transaction_id)
    if existing and existing.get("plan_sha256") != tx_hash:
        fail("receipt_plan_mismatch")
    if existing and existing.get("status") == "complete":
        return existing
    allow_post = {
        target["path"]
        for target in (existing or {}).get("targets", [])
        if target.get("status") == "applied"
    }
    try:
        _, after, states = evaluate_prepared(plan, root, allow_post=allow_post)
    except TransactionError as exc:
        failure_receipt(plan, root, exc.code)
        raise
    contracts = _target_contracts(plan)
    receipt = existing or {
        "schema": RECEIPT_SCHEMA,
        "transaction_id": plan["transaction_id"],
        "plan_sha256": tx_hash,
        "created_at": now(),
        "status": "applying",
        "targets": [
            {
                **contracts[target],
                "status": "pending",
                "applied_at": None,
            }
            for target in _target_order(plan)
        ],
    }
    emit_event(
        "consolidation.apply_started",
        "ok",
        refs=[f".cortex/transactions/{plan['transaction_id']}.json"],
        hashes={"plan_sha256": tx_hash},
        counts={"targets": len(receipt["targets"])},
        attributes=_mechanism_attributes(
            plan["transaction_id"], phase_context_reason
        ),
        **(runtime_context or {}),
    )
    _write_receipt(root, transaction_id, receipt)

    applied_this_run = 0
    try:
        for target in receipt["targets"]:
            relative = target["path"]
            if states[relative] == "applied":
                target["status"] = "applied"
                continue
            if fail_after is not None and applied_this_run >= fail_after:
                raise OSError("injected")
            _replace_target(root, relative, after[relative])
            target["status"] = "applied"
            target["applied_at"] = now()
            applied_this_run += 1
            _write_receipt(root, transaction_id, receipt)
    except (OSError, TransactionError) as exc:
        reason_code = (
            exc.code if isinstance(exc, TransactionError) else "replace_failed"
        )
        receipt["status"] = (
            "partial"
            if any(target["status"] == "applied" for target in receipt["targets"])
            else "failed"
        )
        receipt["reason_code"] = reason_code
        receipt["updated_at"] = now()
        try:
            _write_receipt(root, transaction_id, receipt)
        except TransactionError:
            if reason_code == "receipt_write_failed":
                raise
            fail("receipt_write_failed")
        emit_event(
            (
                "consolidation.apply_partial"
                if receipt["status"] == "partial"
                else "consolidation.apply_failed"
            ),
            receipt["status"],
            reason_code=reason_code,
            refs=[f".cortex/transactions/{plan['transaction_id']}.json"],
            hashes={"plan_sha256": tx_hash},
            counts={
                "applied": sum(
                    target["status"] == "applied"
                    for target in receipt["targets"]
                ),
                "targets": len(receipt["targets"]),
            },
            attributes=_mechanism_attributes(
                plan["transaction_id"], phase_context_reason
            ),
            **(runtime_context or {}),
        )
        return receipt

    receipt["status"] = "complete"
    receipt["reason_code"] = None
    receipt["completed_at"] = now()
    _write_receipt(root, transaction_id, receipt)
    emit_event(
        "consolidation.apply_completed",
        "ok",
        refs=[f".cortex/transactions/{plan['transaction_id']}.json"],
        hashes={"plan_sha256": tx_hash},
        counts={"applied": len(receipt["targets"]), "targets": len(receipt["targets"])},
        attributes=_mechanism_attributes(
            plan["transaction_id"], phase_context_reason
        ),
        **(runtime_context or {}),
    )
    _emit_committed_effects(plan, root, receipt, runtime_context)
    return receipt


def reconcile_receipt(path: Path, root: Path) -> dict:
    with _apply_lock(root):
        return _reconcile_receipt_locked(path, root)


def _reconcile_receipt_locked(path: Path, root: Path) -> dict:
    if path.suffix != ".json" or not ID_RE.fullmatch(path.stem):
        fail("receipt_invalid")
    receipt = _load_receipt(root, path.stem)
    if receipt is None:
        fail("receipt_missing")
    states = []
    conflict = False
    for target in receipt.get("targets", []):
        digest = sha256_text(_read_target(root, target["path"]))
        if digest == target["result_sha256"]:
            state = "applied"
        elif digest == target["preimage_sha256"]:
            state = "pending"
        else:
            state = "conflict"
            conflict = True
        states.append({"path": target["path"], "state": state})
    if conflict:
        status = "conflict"
    elif all(state["state"] == "applied" for state in states):
        status = "complete"
    elif any(state["state"] == "applied" for state in states):
        status = "partial_ready"
    else:
        status = "not_applied"
    checked_at = now()
    for target, observed in zip(receipt["targets"], states):
        target["status"] = observed["state"]
        if observed["state"] == "applied" and not target.get("applied_at"):
            target["applied_at"] = checked_at
        elif observed["state"] == "pending":
            target["applied_at"] = None
    receipt["status"] = {
        "complete": "complete",
        "partial_ready": "partial",
        "not_applied": "failed",
        "conflict": "stale",
    }[status]
    receipt["reason_code"] = {
        "complete": None,
        "partial_ready": "reconciled_partial",
        "not_applied": "reconciled_not_applied",
        "conflict": "reconciliation_conflict",
    }[status]
    receipt["reconciliation"] = {
        "checked_at": checked_at,
        "status": status,
        "targets": states,
    }
    _write_receipt(root, receipt["transaction_id"], receipt)
    return receipt


def load_plan(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except OSError:
        fail("plan_unreadable")
    except json.JSONDecodeError:
        fail("plan_json_invalid")


def load_plan_relative(root: Path, relative: str) -> dict:
    try:
        return json.loads(_secure_read(root, relative))
    except TransactionError:
        raise
    except json.JSONDecodeError:
        fail("plan_json_invalid")


def write_operational_json(root: Path, relative: str, value: dict) -> None:
    try:
        _secure_atomic_write(
            root,
            relative,
            (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8"),
            mode=0o600,
            create_parents=True,
        )
    except OSError:
        fail("operational_write_failed")
