import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

interface CredentialDocument {
  schemaVersion: 1;
  credentials: Record<string, Credential>;
}

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 120_000;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function abortSignal(options?: AuthOperationOptions): AbortSignal | undefined {
  return options?.signal;
}

function validateProviderId(providerId: string): void {
  if (!PROVIDER_ID.test(providerId)) {
    throw new Error(`invalid credential provider id: ${providerId}`);
  }
}

function validateCredential(value: unknown, providerId: string): Credential {
  if (!value || typeof value !== "object") {
    throw new Error(`invalid credential for ${providerId}`);
  }

  const candidate = value as Partial<Credential>;
  if (candidate.type === "api_key") {
    if (candidate.key !== undefined && typeof candidate.key !== "string") {
      throw new Error(`invalid API key credential for ${providerId}`);
    }
    if (candidate.env !== undefined) {
      if (!candidate.env || typeof candidate.env !== "object" || Array.isArray(candidate.env)) {
        throw new Error(`invalid credential environment for ${providerId}`);
      }
      for (const environmentValue of Object.values(candidate.env)) {
        if (typeof environmentValue !== "string") {
          throw new Error(`invalid credential environment for ${providerId}`);
        }
      }
    }
    return structuredClone(candidate as Credential);
  }

  if (
    candidate.type === "oauth" &&
    typeof candidate.refresh === "string" &&
    typeof candidate.access === "string" &&
    typeof candidate.expires === "number" &&
    Number.isFinite(candidate.expires)
  ) {
    return structuredClone(candidate as Credential);
  }

  throw new Error(`invalid OAuth credential for ${providerId}`);
}

function parseDocument(raw: string): CredentialDocument {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("credential store must contain an object");
  }

  const candidate = parsed as Partial<CredentialDocument>;
  if (
    candidate.schemaVersion !== 1 ||
    !candidate.credentials ||
    typeof candidate.credentials !== "object" ||
    Array.isArray(candidate.credentials)
  ) {
    throw new Error("unsupported credential store schema");
  }

  const credentials: Record<string, Credential> = Object.create(null) as Record<
    string,
    Credential
  >;
  for (const [providerId, credential] of Object.entries(candidate.credentials)) {
    validateProviderId(providerId);
    credentials[providerId] = validateCredential(credential, providerId);
  }
  return { schemaVersion: 1, credentials };
}

function emptyDocument(): CredentialDocument {
  return {
    schemaVersion: 1,
    credentials: Object.create(null) as Record<string, Credential>,
  };
}

export function defaultCredentialPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
): string {
  const override = environment.CORTEX_HARNESS_AUTH_FILE?.trim();
  if (override) return resolve(override);

  const configHome = environment.XDG_CONFIG_HOME?.trim();
  const root = configHome ? resolve(configHome) : join(homeDirectory, ".config");
  return join(root, "cortex", "cognition-harness", "auth.json");
}

export class PrivateFileCredentialStore implements CredentialStore {
  readonly path: string;

  constructor(path = defaultCredentialPath()) {
    this.path = resolve(path);
  }

  async read(
    providerId: string,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    validateProviderId(providerId);
    abortSignal(options)?.throwIfAborted();
    const credential = (await this.readDocument()).credentials[providerId];
    return credential ? structuredClone(credential) : undefined;
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    abortSignal(options)?.throwIfAborted();
    const document = await this.readDocument();
    return Object.entries(document.credentials)
      .map(([providerId, credential]) => ({ providerId, type: credential.type }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId));
  }

  async modify(
    providerId: string,
    modifyCredential: (
      current: Credential | undefined,
    ) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    validateProviderId(providerId);
    return this.withLock(async () => {
      abortSignal(options)?.throwIfAborted();
      const document = await this.readDocument();
      const current = document.credentials[providerId];
      const proposed = await modifyCredential(
        current ? structuredClone(current) : undefined,
      );
      abortSignal(options)?.throwIfAborted();
      if (proposed === undefined) {
        return current ? structuredClone(current) : undefined;
      }

      const credential = validateCredential(proposed, providerId);
      document.credentials[providerId] = credential;
      await this.writeDocument(document);
      return structuredClone(credential);
    }, abortSignal(options));
  }

  async delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    validateProviderId(providerId);
    await this.withLock(async () => {
      abortSignal(options)?.throwIfAborted();
      const document = await this.readDocument();
      if (!(providerId in document.credentials)) return;
      delete document.credentials[providerId];
      await this.writeDocument(document);
    }, abortSignal(options));
  }

  private async ensurePrivateDirectory(): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    const details = await lstat(directory);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error(`credential directory is not a private directory: ${directory}`);
    }
    await chmod(directory, PRIVATE_DIRECTORY_MODE);
  }

  private async readDocument(): Promise<CredentialDocument> {
    try {
      const details = await lstat(this.path);
      if (details.isSymbolicLink() || !details.isFile()) {
        throw new Error(`credential path is not a regular file: ${this.path}`);
      }
      if ((details.mode & 0o077) !== 0) {
        throw new Error(`credential file permissions must be 0600: ${this.path}`);
      }
      return parseDocument(await readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDocument();
      throw error;
    }
  }

  private async writeDocument(document: CredentialDocument): Promise<void> {
    await this.ensurePrivateDirectory();
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, this.path);
      await chmod(this.path, PRIVATE_FILE_MODE);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async withLock<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensurePrivateDirectory();
    const lockPath = `${this.path}.lock`;
    const startedAt = Date.now();
    let handle;

    while (!handle) {
      signal?.throwIfAborted();
      try {
        handle = await open(lockPath, "wx", PRIVATE_FILE_MODE);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (await this.reclaimDeadOwnerLock(lockPath)) continue;
        if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
          throw new Error(`timed out waiting for credential store lock: ${lockPath}`);
        }
        await delay(LOCK_RETRY_MS, undefined, signal ? { signal } : undefined);
      }
    }

    try {
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
      throw error;
    }

    try {
      return await operation();
    } finally {
      try {
        await handle.close();
      } finally {
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  }

  private async reclaimDeadOwnerLock(lockPath: string): Promise<boolean> {
    let before;
    let raw: string;
    try {
      [before, raw] = await Promise.all([lstat(lockPath), readFile(lockPath, "utf8")]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
      throw error;
    }
    if (before.isSymbolicLink() || !before.isFile()) return false;

    let pid: number;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("pid" in parsed) ||
        typeof parsed.pid !== "number" ||
        !Number.isSafeInteger(parsed.pid) ||
        parsed.pid <= 0
      ) {
        return false;
      }
      pid = parsed.pid;
    } catch {
      return false;
    }

    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
    }

    const after = await lstat(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!after) return true;
    if (
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      return false;
    }
    await unlink(lockPath);
    return true;
  }
}
