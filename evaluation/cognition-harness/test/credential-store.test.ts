import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import {
  defaultCredentialPath,
  PrivateFileCredentialStore,
} from "../src/credential-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function credential(counter = 0): OAuthCredential {
  return {
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: 2_000_000_000_000,
    counter,
  };
}

async function createStore(): Promise<PrivateFileCredentialStore> {
  const directory = await mkdtemp(join(tmpdir(), "cortex-credentials-"));
  temporaryDirectories.push(directory);
  return new PrivateFileCredentialStore(join(directory, "private", "auth.json"));
}

test("uses an external XDG path by default", () => {
  assert.equal(
    defaultCredentialPath({ XDG_CONFIG_HOME: "/tmp/config" }, "/home/example"),
    "/tmp/config/cortex/cognition-harness/auth.json",
  );
  assert.equal(
    defaultCredentialPath({}, "/home/example"),
    "/home/example/.config/cortex/cognition-harness/auth.json",
  );
});

test("writes owner-only credentials and exposes only metadata when listing", async () => {
  const store = await createStore();
  await store.modify("github-copilot", async () => credential());

  assert.equal((await stat(store.path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(store.path, ".."))).mode & 0o777, 0o700);
  assert.deepEqual(await store.list(), [
    { providerId: "github-copilot", type: "oauth" },
  ]);
  assert.equal((await store.read("github-copilot"))?.type, "oauth");

  const raw = await readFile(store.path, "utf8");
  assert.match(raw, /"schemaVersion": 1/);
  assert.doesNotMatch(JSON.stringify(await store.list()), /access-token|refresh-token/);
});

test("serializes concurrent credential refreshes without losing updates", async () => {
  const store = await createStore();
  await store.modify("github-copilot", async () => credential());

  await Promise.all(
    Array.from({ length: 12 }, () =>
      store.modify("github-copilot", async (current) => {
        assert.equal(current?.type, "oauth");
        const counter = typeof current.counter === "number" ? current.counter : 0;
        return { ...current, counter: counter + 1 };
      }),
    ),
  );

  const current = await store.read("github-copilot");
  assert.equal(current?.type, "oauth");
  assert.equal(current.counter, 12);
});

test("refuses to read a credential file exposed to other users", async () => {
  const store = await createStore();
  await store.modify("github-copilot", async () => credential());
  await chmod(store.path, 0o644);

  await assert.rejects(store.read("github-copilot"), /permissions must be 0600/);
});

test("reclaims a credential lock whose owning process is gone", async () => {
  const store = await createStore();
  await store.modify("github-copilot", async () => credential());
  await writeFile(
    `${store.path}.lock`,
    `${JSON.stringify({ pid: 2_147_483_647, createdAt: "2026-08-20T00:00:00.000Z" })}\n`,
    { mode: 0o600 },
  );

  await store.modify("github-copilot", async (current) => current);
  assert.equal((await store.read("github-copilot"))?.type, "oauth");
});
