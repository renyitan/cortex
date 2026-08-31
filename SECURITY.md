# Security policy

## Support status

Cortex is a completed, archived research project. No version receives security fixes or
compatibility updates, and response times are not guaranteed.

| Version | Supported |
|---|---|
| `0.33.0` | No |

Do not adopt the project for a security-sensitive deployment without reviewing and maintaining your
own fork.

## Reporting a vulnerability

Private vulnerability reports are not accepted. Cortex does not operate a private response channel
or patch process.

Do not publish credentials, private memory, prompts, workspace content, or an undisclosed
third-party vulnerability in an issue, discussion, or fork. Maintainers of active derivatives
should provide their own security policy and reporting channel.

## Security boundary

Cortex:

- runs with the current user's filesystem permissions and does not provide a sandbox;
- assumes the operator controls the installed plugin and consumer repository;
- stores canonical memory and work in the consumer repository;
- stores retrieval indexes, tool links, events, phase state, and transaction receipts locally in
  gitignored paths;
- does not require network access for ordinary retrieval, status, event, or transaction operations;
- does not protect data from the host CLI, model provider, operating system, or other processes
  running as the same user.

Review `try-cortex.sh`, `install.sh`, and the plugin source before running them. Never place secrets
in agent memory, workspace files, persona files, or issue reports.

Memory, workspace files, logs, and linked artifacts may contain untrusted text. Cortex instructs the
model to treat that content as data rather than higher-priority instructions, but this is not an
executable prompt-injection boundary. Inspect a third-party repository before mounting Cortex and do
not rely on the plugin to neutralize malicious instructions in repository content.

Optional dense retrieval imports third-party Python packages and may download model artifacts.
Cortex does not pin or maintain those dependencies, so leave that feature disabled unless you
review and constrain its supply chain yourself.
