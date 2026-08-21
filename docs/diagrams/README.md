# Architecture figures

These figures are part of the public Cortex documentation.

| Figure | Purpose |
|---|---|
| `cognition-cycle` | `WAKE`, `WORK`, `SLEEP`, `CURATE`, and their enforcement boundaries |
| `runtime-flow` | Copilot session-start flow and runtime outputs |
| `evidence-boundary` | The line between checked mechanisms and unproven model behavior |

Each `.html` file is a self-contained Gravure source: its styles and connector code are embedded, so
it opens without a build step or machine-local assets. The matching `.png` is a 2x browser capture
of the `.diagram` element.

To refresh a figure, edit the standalone HTML, open it in Chromium, and capture the `.diagram`
element at a device scale of 2. Browser developer tools expose this as **Capture node screenshot**.
The committed PNG is a reviewable derivative; the HTML, surrounding prose, and image alt text are
the durable and accessible sources.
