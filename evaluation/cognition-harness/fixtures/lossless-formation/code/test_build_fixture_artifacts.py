"""Tests for deterministic fixture generation and validation."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("build_fixture_artifacts.py")
SPEC = importlib.util.spec_from_file_location("build_fixture_artifacts", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load fixture generator from {SCRIPT_PATH}")
fixtures = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixtures)


class FixtureArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source, cls.source_text = fixtures.load_source()
        cls.review_packet = fixtures.REVIEW_PATH.read_text(encoding="utf-8")
        cls.claim_review_packet = fixtures.CLAIM_REVIEW_PATH.read_text(
            encoding="utf-8"
        )
        cls.behavior_label_text = fixtures.BEHAVIOR_LABELS_PATH.read_text(
            encoding="utf-8"
        )
        cls.claim_label_text = fixtures.CLAIM_LABELS_PATH.read_text(
            encoding="utf-8"
        )
        cls.behavior_adjudication_text = (
            fixtures.BEHAVIOR_ADJUDICATION_PATH.read_text(encoding="utf-8")
        )
        cls.claim_adjudication_text = (
            fixtures.CLAIM_ADJUDICATION_PATH.read_text(encoding="utf-8")
        )

    def assert_source_error(self, source: dict, message: str) -> None:
        with self.assertRaisesRegex(fixtures.FixtureError, message):
            fixtures.validate_source(source)

    def test_successful_build_and_check(self) -> None:
        script = Path(fixtures.__file__).resolve()
        for arguments in ([], ["--check"]):
            completed = subprocess.run(
                [sys.executable, str(script), *arguments],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("12 streams", completed.stdout)
            self.assertIn("72 behavior entries", completed.stdout)
            self.assertIn("144 claim entries", completed.stdout)
            self.assertNotIn("stream-01", completed.stdout)
            self.assertNotIn("Handle the routine release notice", completed.stdout)

    def test_successful_adjudication_and_freeze(self) -> None:
        draft = copy.deepcopy(self.source)
        draft["reviewStatus"] = "draft"
        (
            approved_source_text,
            behavior_adjudication_text,
            claim_adjudication_text,
            manifest_text,
        ) = fixtures.adjudicate_and_freeze(
            draft,
            fixtures.canonical_json(draft),
            self.review_packet,
            self.claim_review_packet,
            self.behavior_label_text,
            self.claim_label_text,
        )
        approved = json.loads(approved_source_text)
        behavior = json.loads(behavior_adjudication_text)
        claims = json.loads(claim_adjudication_text)
        manifest = json.loads(manifest_text)
        self.assertEqual(approved["reviewStatus"], "approved")
        self.assertEqual(behavior["status"], "passed")
        self.assertEqual(claims["status"], "passed")
        self.assertEqual(manifest["status"], "frozen")
        self.assertEqual(manifest["reviewStatus"], "approved")
        self.assertEqual(behavior["agreementCounts"]["entries"], 72)
        self.assertEqual(behavior["agreementCounts"]["behaviorEquivalent"], 36)
        self.assertEqual(claims["agreementCounts"]["fullPasses"], 144)

    def test_rejects_behavior_label_mismatch(self) -> None:
        labels = json.loads(self.behavior_label_text)
        entry = next(item for item in labels["entries"] if item["requiredActionIds"])
        action_id = entry["requiredActionIds"].pop()
        entry["prohibitedActionIds"].append(action_id)
        with self.assertRaisesRegex(fixtures.FixtureError, "required actions disagree"):
            fixtures.adjudicate_behavior_labels(
                self.source,
                self.review_packet,
                fixtures.canonical_json(labels),
            )

    def test_rejects_behavior_label_ambiguity(self) -> None:
        labels = json.loads(self.behavior_label_text)
        labels["entries"][0]["ambiguous"] = True
        labels["entries"][0]["ambiguityNotes"] = "Unclear."
        with self.assertRaisesRegex(fixtures.FixtureError, "entry is ambiguous"):
            fixtures.adjudicate_behavior_labels(
                self.source,
                self.review_packet,
                fixtures.canonical_json(labels),
            )

    def test_rejects_behavior_pair_mismatch(self) -> None:
        labels = json.loads(self.behavior_label_text)
        labels["pairs"][0]["entryIds"].reverse()
        with self.assertRaisesRegex(fixtures.FixtureError, "pair mapping"):
            fixtures.parse_behavior_labels(
                fixtures.canonical_json(labels),
                self.source,
                self.review_packet,
            )

    def test_rejects_behavior_pair_notes_on_pass(self) -> None:
        labels = json.loads(self.behavior_label_text)
        labels["pairs"][0]["equivalenceNotes"] = "Equivalent."
        with self.assertRaisesRegex(fixtures.FixtureError, "must be empty on pass"):
            fixtures.adjudicate_behavior_labels(
                self.source,
                self.review_packet,
                fixtures.canonical_json(labels),
            )

    def test_rejects_claim_review_failure(self) -> None:
        labels = json.loads(self.claim_label_text)
        labels["entries"][0]["subjectKey"] = "fail"
        with self.assertRaisesRegex(fixtures.FixtureError, "subjectKey did not pass"):
            fixtures.adjudicate_claim_labels(
                self.source,
                self.claim_review_packet,
                fixtures.canonical_json(labels),
            )

    def test_rejects_malformed_label_schemas(self) -> None:
        behavior = json.loads(self.behavior_label_text)
        del behavior["entries"][0]["ambiguityNotes"]
        with self.assertRaisesRegex(fixtures.FixtureError, "fields do not match schema"):
            fixtures.parse_behavior_labels(
                fixtures.canonical_json(behavior),
                self.source,
                self.review_packet,
            )
        claims = json.loads(self.claim_label_text)
        claims["entries"][0]["kind"] = "maybe"
        with self.assertRaisesRegex(fixtures.FixtureError, "must be pass or fail"):
            fixtures.parse_claim_labels(
                fixtures.canonical_json(claims),
                self.claim_review_packet,
            )

    def test_rejects_unknown_behavior_action(self) -> None:
        labels = json.loads(self.behavior_label_text)
        labels["entries"][0]["prohibitedActionIds"][0] = "unknown-action"
        with self.assertRaisesRegex(fixtures.FixtureError, "partition the entry catalog"):
            fixtures.parse_behavior_labels(
                fixtures.canonical_json(labels),
                self.source,
                self.review_packet,
            )

    def test_blind_labels_are_bound_to_reviewed_packet_bytes(self) -> None:
        behavior_labels = json.loads(self.behavior_label_text)
        claim_labels = json.loads(self.claim_label_text)
        self.assertEqual(
            behavior_labels["sourcePacketSha256"],
            fixtures.sha256_text(self.review_packet),
        )
        self.assertEqual(
            claim_labels["sourcePacketSha256"],
            fixtures.sha256_text(self.claim_review_packet),
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "sourcePacketSha256"):
            fixtures.adjudicate_behavior_labels(
                self.source,
                self.review_packet.replace("\n", "\r\n"),
                self.behavior_label_text,
            )
        with self.assertRaisesRegex(fixtures.FixtureError, "sourcePacketSha256"):
            fixtures.adjudicate_claim_labels(
                self.source,
                self.claim_review_packet.replace("\n", "\r\n"),
                self.claim_label_text,
            )

    def test_check_rejects_crlf_packet_bytes(self) -> None:
        _, _, manifest_text = fixtures.build_artifacts(
            self.source,
            self.source_text,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            review_path = root / "fixture-review-packet.md"
            claim_review_path = root / "fixture-claim-review-packet.md"
            manifest_path = root / "fixture-manifest.json"
            review_path.write_bytes(self.review_packet.replace("\n", "\r\n").encode())
            claim_review_path.write_bytes(self.claim_review_packet.encode())
            manifest_path.write_bytes(manifest_text.encode())
            with self.assertRaisesRegex(fixtures.FixtureError, "review-packet"):
                fixtures.check_artifacts(
                    self.review_packet,
                    self.claim_review_packet,
                    manifest_text,
                    review_path,
                    claim_review_path,
                    manifest_path,
                )

    def test_review_status_transition_contract(self) -> None:
        behavior, _, claims, _ = fixtures.build_adjudications(
            self.source,
            self.review_packet,
            self.claim_review_packet,
            self.behavior_label_text,
            self.claim_label_text,
        )
        draft = copy.deepcopy(self.source)
        draft["reviewStatus"] = "draft"
        fixtures.validate_review_state(draft, None, None)
        with self.assertRaisesRegex(fixtures.FixtureError, "must not have adjudications"):
            fixtures.validate_review_state(draft, behavior, claims)
        with self.assertRaisesRegex(fixtures.FixtureError, "requires both adjudications"):
            fixtures.validate_review_state(self.source, None, None)
        fixtures.validate_review_state(self.source, behavior, claims)

    def test_fixture_content_hash_ignores_review_status_only(self) -> None:
        draft = copy.deepcopy(self.source)
        draft["reviewStatus"] = "draft"
        self.assertEqual(
            fixtures.fixture_content_sha256(draft),
            fixtures.fixture_content_sha256(self.source),
        )
        changed = copy.deepcopy(self.source)
        changed["streams"][0]["actions"][0]["description"] += " Changed."
        self.assertNotEqual(
            fixtures.fixture_content_sha256(changed),
            fixtures.fixture_content_sha256(self.source),
        )

    def test_reviewed_packet_bytes_survive_freeze(self) -> None:
        draft = copy.deepcopy(self.source)
        draft["reviewStatus"] = "draft"
        before = (
            fixtures.sha256_text(self.review_packet),
            fixtures.sha256_text(self.claim_review_packet),
        )
        approved_source_text, _, _, _ = fixtures.adjudicate_and_freeze(
            draft,
            fixtures.canonical_json(draft),
            self.review_packet,
            self.claim_review_packet,
            self.behavior_label_text,
            self.claim_label_text,
        )
        approved = json.loads(approved_source_text)
        rebuilt_review, _, _ = fixtures.build_review_packet(approved)
        rebuilt_claims, _ = fixtures.build_claim_review_packet(approved)
        self.assertEqual(
            before,
            (
                fixtures.sha256_text(rebuilt_review),
                fixtures.sha256_text(rebuilt_claims),
            ),
        )

    def test_action_order_is_not_semantic(self) -> None:
        source = copy.deepcopy(self.source)
        task = source["streams"][0]["tasks"][0]
        task["requiredActionIds"].reverse()
        task["prohibitedActionIds"].reverse()
        fixtures.validate_source(source)

    def test_rejects_non_chronological_observations(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        first = stream["observations"][0]
        second = stream["observations"][1]
        second["authoredAt"] = first["authoredAt"]
        second["sha256"] = fixtures.observation_digest(
            second["authoredAt"], second["text"]
        )
        self.assert_source_error(source, "strictly chronological")

    def test_rejects_incomplete_action_partition(self) -> None:
        source = copy.deepcopy(self.source)
        source["streams"][0]["tasks"][0]["prohibitedActionIds"].pop()
        self.assert_source_error(source, "must partition all five actions")

    def test_rejects_wrong_evidence_binding(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        stream["claims"][0]["evidenceIds"] = [stream["observations"][1]["id"]]
        self.assert_source_error(source, "evidenceIds must contain only")

    def test_rejects_unsupported_claim_scope(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        claim = stream["claims"][1]
        observation = stream["observations"][1]
        self.assertNotEqual(claim["scope"]["level"], "global")
        observation["text"] = observation["text"].replace(
            "Acorn Cooperative", "Another Cooperative"
        )
        observation["sha256"] = fixtures.observation_digest(
            observation["authoredAt"], observation["text"]
        )
        claim["statement"] = observation["text"]
        self.assert_source_error(source, "does not establish scope key")

    def test_rejects_unsupported_global_claim(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        broad_observation_id = stream["targetObservationIds"][0]
        broad_claim = next(
            claim
            for claim in stream["claims"]
            if claim["evidenceIds"] == [broad_observation_id]
        )
        broad_claim["scope"] = {"level": "global", "key": None}
        self.assert_source_error(
            source,
            "global claim observation must state universal scope",
        )

    def test_rejects_unsupported_subject_namespace_prefix(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        old_key = stream["targetSubjectKey"]
        new_key = f"hidden-{old_key}"
        stream["targetSubjectKey"] = new_key
        for claim in stream["claims"]:
            if claim["subjectKey"] == old_key:
                claim["subjectKey"] = new_key
        self.assert_source_error(
            source,
            "subjectKey token 'hidden' is not supported by the bound observation",
        )

    def test_rejects_mismatched_subject_discriminator(self) -> None:
        source = copy.deepcopy(self.source)
        source["streams"][0]["claims"][1]["subjectKey"] += "-quarterly"
        self.assert_source_error(
            source,
            "subjectKey token 'quarterly' is not supported by the bound observation",
        )

    def test_rejects_cross_scope_supersession(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        chain_claims = [
            next(
                claim
                for claim in stream["claims"]
                if observation_id in claim["evidenceIds"]
            )
            for observation_id in stream["targetObservationIds"]
        ]
        chain_claims[2]["supersedesClaimIds"] = [chain_claims[0]["id"]]
        self.assert_source_error(source, "supersession scope differs")

    def test_rejects_future_task_leakage(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][0]
        observation = stream["observations"][1]
        observation["text"] += " " + stream["tasks"][0]["targetQuery"]
        observation["sha256"] = fixtures.observation_digest(
            observation["authoredAt"], observation["text"]
        )
        stream["claims"][1]["statement"] = observation["text"]
        self.assert_source_error(source, "future task text leaked")

    def test_rejects_visible_banned_term(self) -> None:
        source = copy.deepcopy(self.source)
        source["streams"][0]["actions"][0]["description"] += " Oracle"
        self.assert_source_error(source, "banned evaluator term")

    def test_rejects_wrong_kind_wording_in_observation(self) -> None:
        cases = (
            (
                0,
                "Acorn Cooperative requires this step: publish routine release notices "
                "with `lantern-bulletin`.",
                "decision",
            ),
            (
                4,
                "Ember Guild prefers this handling: start a newly reported incident "
                "with `comet-page`.",
                "procedure",
            ),
            (
                8,
                "Islet Network approved this choice: render weekly briefings "
                "with `juniper-cards`.",
                "preference",
            ),
        )
        for stream_index, text, kind in cases:
            with self.subTest(kind=kind):
                source = copy.deepcopy(self.source)
                observation = source["streams"][stream_index]["observations"][0]
                observation["text"] = text
                observation["sha256"] = fixtures.observation_digest(
                    observation["authoredAt"], observation["text"]
                )
                source["streams"][stream_index]["claims"][0]["statement"] = text
                self.assert_source_error(
                    source,
                    f"bound observation does not establish {kind} kind",
                )

    def test_rejects_claim_statement_paraphrase(self) -> None:
        source = copy.deepcopy(self.source)
        source["streams"][0]["claims"][0]["statement"] += " Paraphrased."
        self.assert_source_error(
            source,
            "claim statement must exactly equal its bound observation text",
        )

    def test_rejects_observation_with_conflicting_kind_cues(self) -> None:
        source = copy.deepcopy(self.source)
        observation = source["streams"][0]["observations"][0]
        observation["text"] += " Acorn Cooperative requires this step."
        observation["sha256"] = fixtures.observation_digest(
            observation["authoredAt"], observation["text"]
        )
        source["streams"][0]["claims"][0]["statement"] = observation["text"]
        self.assert_source_error(
            source,
            "bound observation also matches conflicting procedure wording",
        )

    def test_preference_text_avoids_selection_bias(self) -> None:
        preference_text = [
            text
            for stream in self.source["streams"]
            if stream["memoryType"] == "preference"
            for text in (
                [observation["text"] for observation in stream["observations"]]
                + [claim["statement"] for claim in stream["claims"]]
            )
        ]
        self.assertFalse(any("choos" in text.casefold() for text in preference_text))

    def test_adjacent_workflows_are_semantically_aligned(self) -> None:
        expected = {
            "stream-03": "executive-updates",
            "stream-07": "field-transfers",
            "stream-11": "presentation-charts",
        }
        for stream in self.source["streams"]:
            if stream["id"] not in expected:
                continue
            with self.subTest(stream=stream["id"]):
                key = expected[stream["id"]]
                task = stream["tasks"][1]
                self.assertEqual(task["scopePath"]["workflow"], key)
                self.assertIn(key, fixtures.normalize_scope_reference(
                    " ".join(turn["content"] for turn in task["conversation"])
                ))
                self.assertFalse(
                    any(
                        claim["scope"] == {"level": "workflow", "key": key}
                        for claim in stream["claims"]
                    )
                )

    def test_named_claim_fidelity_corrections(self) -> None:
        stream_01 = self.source["streams"][0]
        for claim_index in (5, 9):
            self.assertIn(
                "routine release notices",
                stream_01["claims"][claim_index]["statement"],
            )
            self.assertIn(
                "Lantern Project",
                stream_01["claims"][claim_index]["statement"],
            )
        self.assertIn(
            "short policy summaries",
            self.source["streams"][8]["claims"][6]["statement"],
        )
        stream_02 = self.source["streams"][1]
        self.assertIn(
            "completed feedback bundle is ready for triage",
            stream_02["claims"][1]["statement"],
        )
        self.assertIn(
            "facilitator follow-up items that need a written answer",
            stream_02["claims"][11]["statement"],
        )

    def test_clear_restrictive_conditions_are_preserved(self) -> None:
        expected_fragments = {
            (0, 1): "before assigning them",
            (0, 3): "while counsel is still reviewing them",
            (0, 5): "until they are cleared for publication",
            (1, 2): "bundles needing an anonymity check",
            (2, 9): "before circulation",
            (3, 3): "before access begins",
            (6, 10): "recipient needs special opening instructions",
        }
        for (stream_index, claim_index), fragment in expected_fragments.items():
            with self.subTest(stream=stream_index + 1, claim=claim_index + 1):
                self.assertIn(
                    fragment,
                    self.source["streams"][stream_index]["claims"][claim_index][
                        "statement"
                    ],
                )

    def test_cross_scope_exceptions_use_positive_wording(self) -> None:
        for stream in self.source["streams"]:
            middle_observation_id = stream["targetObservationIds"][1]
            observation = next(
                item
                for item in stream["observations"]
                if item["id"] == middle_observation_id
            )
            claim = next(
                item
                for item in stream["claims"]
                if item["evidenceIds"] == [middle_observation_id]
            )
            with self.subTest(stream=stream["id"]):
                self.assertIsNone(
                    fixtures.CROSS_SCOPE_REPLACEMENT_RE.search(observation["text"])
                )
                self.assertIsNone(
                    fixtures.CROSS_SCOPE_REPLACEMENT_RE.search(claim["statement"])
                )

    def test_rejects_cross_scope_replacement_wording(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][2]
        observation_id = stream["targetObservationIds"][1]
        observation = next(
            item for item in stream["observations"] if item["id"] == observation_id
        )
        observation["text"] += " This now replaces the team handling."
        observation["sha256"] = fixtures.observation_digest(
            observation["authoredAt"], observation["text"]
        )
        claim = next(
            item
            for item in stream["claims"]
            if item["evidenceIds"] == [observation_id]
        )
        claim["statement"] = observation["text"]
        self.assert_source_error(
            source,
            "cross-scope exception must be stated positively",
        )

    def test_named_ambiguity_corrections(self) -> None:
        self.assertIn(
            "rather than being republished",
            self.source["streams"][0]["claims"][10]["statement"],
        )
        self.assertIn(
            "rather than the planning board",
            self.source["streams"][2]["claims"][10]["statement"],
        )
        stream_07 = self.source["streams"][6]
        self.assertEqual(
            stream_07["targetSubjectKey"],
            "asset-handoff-opening-step",
        )
        for observation_id in stream_07["targetObservationIds"]:
            observation = next(
                item
                for item in stream_07["observations"]
                if item["id"] == observation_id
            )
            claim = next(
                item
                for item in stream_07["claims"]
                if item["evidenceIds"] == [observation_id]
            )
            self.assertIn("opening step", observation["text"])
            self.assertIn("opening step", claim["statement"])
            self.assertEqual(
                claim["subjectKey"],
                "asset-handoff-opening-step",
            )
        stream_01_text = json.dumps(self.source["streams"][0])
        self.assertNotIn("Lantern Crew", stream_01_text)
        self.assertNotIn("lantern-crew", stream_01_text)
        self.assertIn("Lantern Team", stream_01_text)
        self.assertIn("lantern-team", stream_01_text)

    def test_named_modifier_fidelity_corrections(self) -> None:
        self.assertIn(
            "new dependency-watch items",
            self.source["streams"][2]["claims"][7]["statement"],
        )
        stream_07_statement = self.source["streams"][6]["claims"][2]["statement"]
        self.assertIn("opening step", stream_07_statement)
        self.assertIn("standard Seabird Team asset handoff", stream_07_statement)

    def test_all_claim_statements_copy_bound_observations(self) -> None:
        for stream in self.source["streams"]:
            for observation, claim in zip(
                stream["observations"], stream["claims"]
            ):
                self.assertEqual(claim["statement"], observation["text"])

    def test_rejects_subject_key_equal_to_scope_key(self) -> None:
        source = copy.deepcopy(self.source)
        stream = source["streams"][6]
        old_key = stream["targetSubjectKey"]
        stream["targetSubjectKey"] = "asset-handoff"
        for claim in stream["claims"]:
            if claim["subjectKey"] == old_key:
                claim["subjectKey"] = "asset-handoff"
        self.assert_source_error(source, "subjectKey must not equal its scope key")

    def test_definitive_blind_label_files_are_present_and_valid(self) -> None:
        self.assertTrue(fixtures.BEHAVIOR_LABELS_PATH.exists())
        self.assertTrue(fixtures.CLAIM_LABELS_PATH.exists())
        fixtures.parse_behavior_labels(
            self.behavior_label_text,
            self.source,
            self.review_packet,
        )
        fixtures.parse_claim_labels(
            self.claim_label_text,
            self.claim_review_packet,
        )

    def test_stream_04_uses_explicit_project_entities(self) -> None:
        stream = self.source["streams"][3]
        serialized = json.dumps(stream)
        self.assertNotIn("Cedar Archive", serialized)
        self.assertNotIn("cedar-archive", serialized)
        self.assertNotIn("Elm Library", serialized)
        self.assertNotIn("elm-library", serialized)
        self.assertEqual(stream["narrowScope"]["key"], "cedar-project")
        self.assertEqual(stream["tasks"][0]["scopePath"]["project"], "cedar-project")
        self.assertEqual(stream["tasks"][1]["scopePath"]["project"], "elm-project")
        self.assertIn("cedar project", stream["tasks"][0]["conversation"][0]["content"])
        self.assertIn("elm project", stream["tasks"][1]["conversation"][0]["content"])

    def test_reversal_tasks_have_distinct_behavior(self) -> None:
        for stream in self.source["streams"]:
            if stream["mechanism"] != "require-prohibit-reversal":
                continue
            behaviors = [
                tuple(task["requiredActionIds"])
                for task in stream["tasks"]
            ]
            self.assertEqual(len(set(behaviors)), 3)
            self.assertEqual(behaviors[2], ())
            self.assertNotEqual(behaviors[0], behaviors[1])

    def test_claim_review_packet_count_and_hiding(self) -> None:
        packet, mapping = fixtures.build_claim_review_packet(self.source)
        entries, _ = fixtures.claim_review_entries(self.source)
        self.assertEqual(len(mapping), 144)
        self.assertEqual(packet.count("## Entry CR-"), 144)
        self.assertEqual(
            sum(bool(entry["earlierClaimContext"]) for entry in entries),
            12,
        )
        for entry in entries:
            for context in entry["earlierClaimContext"]:
                self.assertEqual(
                    context["claim"]["evidenceIds"],
                    [context["observation"]["id"]],
                )
                self.assertTrue(context["observation"]["id"].startswith("PO"))
                self.assertTrue(context["claim"]["id"].startswith("P"))
        self.assertNotIn('"PE01"', packet)
        self.assertNotIn("stream-01", packet)
        self.assertNotIn("queryType", packet)
        self.assertIn("over alternatives.", fixtures.CLAIM_KIND_RUBRIC_LINES[0])
        self.assertIn(
            "An explicit want, dislike, or style preference remains preference",
            fixtures.CLAIM_KIND_RUBRIC_LINES[3],
        )
        fixtures.validate_claim_review_packet(packet, self.source)

    def test_rejects_behavior_packet_without_exact_reader_protocol(self) -> None:
        packet, _, _ = fixtures.build_review_packet(self.source)
        comparability = (
            "- Guidance is comparable only when it concerns the same subject. "
            "Guidance about a different subject coexists and never overrides it."
        )
        self.assertEqual(fixtures.READER_PROTOCOL_LINES[1], comparability)
        self.assertLess(packet.index(fixtures.READER_PROTOCOL_LINES[0]),
                        packet.index(comparability))
        self.assertLess(packet.index(comparability),
                        packet.index(fixtures.READER_PROTOCOL_LINES[2]))
        self.assertEqual(
            fixtures.READER_PROTOCOL_LINES[5],
            "- Call an action only if targetQuery explicitly requests it or governing standing guidance requires or prefers it.",
        )
        self.assertEqual(
            fixtures.READER_PROTOCOL_LINES[6],
            "- Governing guidance overrides a conflicting request; an explicit prohibition or explicit desire not to use an action means it must not be called.",
        )
        altered = packet.replace(
            fixtures.READER_PROTOCOL_LINES[0],
            "- Use any available time range.",
            1,
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "reader protocol"):
            fixtures.validate_review_packet(altered, self.source)

    def test_rejects_claim_packet_without_exact_kind_rubric(self) -> None:
        packet, _ = fixtures.build_claim_review_packet(self.source)
        altered = packet.replace(
            fixtures.CLAIM_KIND_RUBRIC_LINES[0],
            "- `decision`: any stored statement.",
            1,
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "kind rubric"):
            fixtures.validate_claim_review_packet(altered, self.source)

    def test_rejects_claim_packet_without_exact_review_contract(self) -> None:
        packet, _ = fixtures.build_claim_review_packet(self.source)
        altered = packet.replace(
            fixtures.CLAIM_REVIEW_CONTRACT_LINES[0],
            "- A subject key may use any convenient label.",
            1,
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "claim review contract"):
            fixtures.validate_claim_review_packet(altered, self.source)

    def test_rejects_dangling_prior_claim_evidence(self) -> None:
        entries, _ = fixtures.claim_review_entries(self.source)
        entry = next(item for item in entries if item["earlierClaimContext"])
        entry["earlierClaimContext"][0]["claim"]["evidenceIds"] = ["PE01"]
        with self.assertRaisesRegex(
            fixtures.FixtureError,
            "earlier claim evidence must point to its displayed observation",
        ):
            fixtures.validate_claim_review_entries(entries)

    def test_behavior_packet_two_phase_layout_and_mappings(self) -> None:
        packet, entry_mapping, pair_mapping = fixtures.build_review_packet(
            self.source
        )
        self.assertEqual(len(entry_mapping), 72)
        self.assertEqual(len(pair_mapping), 36)
        self.assertNotIn("Review group", packet)
        self.assertNotIn("observations-only", packet)
        self.assertNotIn("claims-added", packet)
        self.assertLess(
            packet.rindex("### Entry RV-072"),
            packet.index("## Phase 2: Pair comparison"),
        )
        linked_ids = [
            review_id
            for mapping in pair_mapping.values()
            for review_id in mapping["reviewIds"]
        ]
        self.assertEqual(len(linked_ids), len(set(linked_ids)))
        self.assertEqual(set(linked_ids), set(entry_mapping))
        for pair_id, mapping in pair_mapping.items():
            with self.subTest(pair=pair_id):
                members = [
                    entry_mapping[review_id]
                    for review_id in mapping["reviewIds"]
                ]
                self.assertEqual(
                    len({(item["streamId"], item["taskId"]) for item in members}),
                    1,
                )
                self.assertEqual(
                    {item["view"] for item in members},
                    {"observations-only", "claims-added"},
                )
        for index in range(1, 72):
            self.assertNotEqual(
                entry_mapping[f"RV-{index:03d}"]["pairId"],
                entry_mapping[f"RV-{index + 1:03d}"]["pairId"],
            )
        fixtures.validate_review_packet(packet, self.source)

    def test_manifest_names_exact_reader_surface(self) -> None:
        review, claim_review, manifest_text = fixtures.build_artifacts(
            self.source, self.source_text
        )
        manifest = json.loads(manifest_text)
        self.assertEqual(
            manifest["reviewArtifacts"]["behavior"]["readerVisibleFields"],
            [
                "actions",
                "observations",
                "derivedClaims",
                "scopePath",
                "queryAt",
                "conversation",
                "targetQuery",
            ],
        )
        self.assertEqual(
            manifest["reviewArtifacts"]["claims"]["entryCount"],
            144,
        )
        self.assertEqual(
            manifest["reviewArtifacts"]["claims"]["readerVisibleFields"],
            ["observation", "claim", "earlierClaimContext"],
        )
        self.assertEqual(manifest["reviewArtifacts"]["behavior"]["pairCount"], 36)
        self.assertEqual(len(manifest["neutralBehaviorReviewMapping"]), 72)
        self.assertEqual(len(manifest["neutralBehaviorPairMapping"]), 36)
        self.assertEqual(
            manifest["limitations"],
            [fixtures.KIND_CUE_LIMITATION, fixtures.ORACLE_COPY_LIMITATION],
        )
        for limitation in manifest["limitations"]:
            self.assertNotIn(limitation, review)
            self.assertNotIn(limitation, claim_review)

    def test_rejects_behavior_artifact_drift(self) -> None:
        review, claim_review, manifest = fixtures.build_artifacts(
            self.source, self.source_text
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "derived drift"):
            fixtures.verify_artifact_contents(
                review,
                claim_review,
                manifest,
                review + "\n",
                claim_review,
                manifest,
            )

    def test_rejects_claim_review_artifact_drift(self) -> None:
        review, claim_review, manifest = fixtures.build_artifacts(
            self.source, self.source_text
        )
        with self.assertRaisesRegex(fixtures.FixtureError, "claim-review-packet"):
            fixtures.verify_artifact_contents(
                review,
                claim_review,
                manifest,
                review,
                claim_review + "\n",
                manifest,
            )

    def test_rejects_adjudication_drift(self) -> None:
        with self.assertRaisesRegex(fixtures.FixtureError, "review-adjudication"):
            fixtures.verify_adjudication_contents(
                self.behavior_adjudication_text,
                self.claim_adjudication_text,
                self.behavior_adjudication_text + "\n",
                self.claim_adjudication_text,
            )

    def test_final_manifest_hashes_and_pass_counts(self) -> None:
        review, claim_review, manifest_text = fixtures.build_artifacts(
            self.source,
            self.source_text,
        )
        manifest = json.loads(manifest_text)
        hashes = manifest["hashes"]
        self.assertEqual(manifest["status"], "frozen")
        self.assertEqual(manifest["reviewStatus"], "approved")
        self.assertEqual(
            manifest["fixtureContentSha256"],
            fixtures.fixture_content_sha256(self.source),
        )
        self.assertEqual(hashes["sourceSha256"], fixtures.sha256_text(self.source_text))
        self.assertEqual(hashes["reviewPacketSha256"], fixtures.sha256_text(review))
        self.assertEqual(
            hashes["claimReviewPacketSha256"],
            fixtures.sha256_text(claim_review),
        )
        self.assertEqual(
            hashes["behaviorLabelSha256"],
            fixtures.sha256_text(self.behavior_label_text),
        )
        self.assertEqual(
            hashes["claimLabelSha256"],
            fixtures.sha256_text(self.claim_label_text),
        )
        self.assertEqual(
            hashes["behaviorAdjudicationSha256"],
            fixtures.sha256_text(self.behavior_adjudication_text),
        )
        self.assertEqual(
            hashes["claimAdjudicationSha256"],
            fixtures.sha256_text(self.claim_adjudication_text),
        )
        behavior_counts = manifest["reviewArtifacts"]["behavior"]["adjudication"][
            "agreementCounts"
        ]
        claim_counts = manifest["reviewArtifacts"]["claims"]["adjudication"][
            "agreementCounts"
        ]
        self.assertEqual(behavior_counts["entries"], 72)
        self.assertEqual(behavior_counts["behaviorEquivalent"], 36)
        self.assertEqual(claim_counts["fullPasses"], 144)


if __name__ == "__main__":
    unittest.main()
