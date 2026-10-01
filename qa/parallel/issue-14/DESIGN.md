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

## Implemented contract

See `docs/workspaces.md` and the complete `docs/workspace-commands.md` adapter
matrix. `workspace inventory` uses HTTP inventory only; status uses filesystem
only. Every adapter must be classified or execution and policy coverage fail.
Legacy calls take an exclusive endpoint lease, and cannot coexist with persistent
workspace reservations. Resource duplicates fail immediately; Windows metadata
gate/open/rename contention has bounded retries (two seconds admission, three
seconds finalization), with no Desktop work inside the gate. Gate metadata has a
random token, PID and recorded start/creation times. PID reuse is conservative:
an existing PID is never automatically considered dead. `gate-clear` requires
the exact token and a nonexistent PID; corrupt/unverifiable state stays blocked.

Page generation is a nonce plus chart/controller references and browser GUID.
The native saved layout UID is checked alongside the Pine document ID. Same-turn
guards compare source, normalized symbol/interval, chart type, session and every
study input. Only the current command's explicit source/context/input change is
permitted; compile changes only the owned document's study. Results retain native
calculation freshness checks and record operation-local status/report timestamps.

Recovery acquisition requires the exact interrupted operation. Failed recovery
preserves it. Only successful identity/quiescence checks, binding persistence and
explicit acknowledgement can clear it. A compile error with a verified final
state is a clean failure, not an interruption. Journals/results use workspace UUID
and operation UUID directories/files so one handle cannot collide with another's
artifacts. Results are staged as `committed:false`, metadata finalized in the
gate, then committed outside it; status exposes an unfinished result commit.

Live preparation on 2026-10-01 created layouts `2QKIbTsO` and `1yvV37Yp` with
distinct saved documents. The original `KHbeIfLo` target was preserved. Fixed
1280x800 metrics/focus emulation were applied only to test targets. The inactive
A editor did not initially mount, so preparation selected A once and then
restored the original tab. After preparation both A/B remained inactive during
independent CLI smoke tests. Initial identical compilation correctly reported
unchanged; the input-change smoke recorded real native calculation events on
both targets. These are preliminary observations, not benchmark completion.
