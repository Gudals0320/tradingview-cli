# Independent CLI design

Each `tv workspace init --file FILE --target ID --layout ID --pine ID` registers
pre-provisioned resources on the configured endpoint. A durable random owner
token, rather than a PID, keeps the reservation between CLI invocations. Target,
saved layout and saved Pine document IDs must all be distinct. Registration
checks identity without activating tabs, loading layouts or opening documents.

The endpoint admission gate protects only small filesystem metadata transactions.
It is never held while connecting, changing charts, compiling, calculating or
collecting results. Each workspace has its own operation owner and journal.
Different workspaces execute concurrently; duplicate resource or operation
ownership fails immediately. Dead processes leave interrupted operations for
explicit recovery, without releasing their resources or adopting a new baseline.

Legacy commands acquire the existing endpoint lease for their entire invocation.
An endpoint lease and workspace reservations cannot coexist. Thus legacy target,
tab, layout, UI, eval, launch and batch paths cannot bypass reservations. Offline
analysis/help/status of filesystem ownership remain available. Inside a workspace
only the documented target-local command allowlist is accepted.

Connections pin the exact target and page generation. Page evaluations check the
saved layout, native chart object and Pine controller identity in the same page
turn before executing. Reconnect never falls back to an active target. Source,
chart context and inputs are tracked between commands; mutations are accepted
only for the fields and values explicitly requested by the current command.
Native pending actions keep recovery/release from treating a timeout as idle.

Recovery is explicit reconciliation of the isolated workspace, not restoration
of a shared Desktop. Inspect an interrupted journal, verify current resources and
quiescence, then acknowledge the recorded operation with `workspace recover`.
Reload needs explicit rebinding to the same resource IDs. Results and history
belong to the workspace and carry owner/resource/operation provenance.

Validation separates filesystem/fixture evidence from Windows Desktop evidence.
Live success requires two dedicated resources, result equivalence, lifecycle
overlap and repeated throughput increase on one endpoint. No mock result can
satisfy those requirements.
