# Workspace preflight, recovery and capture metadata

## Existing information and the new summary

| Existing command | Existing evidence | Added integration |
| --- | --- | --- |
| workspace show/status | recorded generation, target/layout/Pine, operation, interrupted state, conservative owner_alive, next commands | preflight combines these with HTTP reachability, tri-state process identity and recorded affected context |
| workspace locks | holders and queue | preflight filters holders/queue to this workspace and omits holder tokens |
| workspace wait | admitted work and guarded chart calculation | unchanged; preflight neither adopts results nor waits for native completion |
| workspace recover | recovered, incomplete, adopted_changes | recovery_summary adds generation before/after, adopted_context and an explicit resumption action |

```sh
tv workspace preflight research
```

This is a read-only HTTP inventory plus filesystem observation. It takes no
mutation lock, writes no journal/state, does not execute page JavaScript, rebind,
replay or clear ownership. It works while Desktop is unavailable, with connection
state unknown. HTTP target absence is target_lost only after a successful list.
Recorded generation/context are not live page verification (`generation_verified`
is false). A matching PID and recorded start identity establish live; missing or
unreadable identity stays unknown. Existing conservative ownership gates remain
unchanged. Dead means the recorded process identity is no longer live, not that
the native operation completed. Follow exact-ID recovery only after inspection.

Successful recovery still returns both `recovered:true` and `incomplete:true`.
The summary means ownership/context were reconciled and remaining original work
needs resumption. It does not resend or complete the interrupted collection.

## Capture contract

CDP capture retains the existing PNG file_path and selector order. The returned
backend/source, requested_region/actual_region, selector_used, fallback and clip
explain what was captured. Clip coordinates use page CSS pixels, including scroll
offset; viewport and device_pixel_ratio are separate. image_pixels comes from the
actual PNG header. The selected element's pane_id is null when not identifiable;
chart_context describes the active chart and is not proof that the first DOM
candidate belongs to that active pane. Axis inclusion/region verification remain
unknown when not visually verified. No image-content claims follow from success.
`matched_element_count`, `visible_match_count` and `selected_match_index` expose
the selected DOM candidate. More than one match reports
`region_coverage:first_match_only`, explicitly distinguishing a partial multi-pane
capture from a full chart. These counts describe selector elements, not a verified
count of logical chart panes.

If chart/tester selectors fail, the existing viewport capture is explicitly
reported as fallback full_page. Alternate selectors are also marked. The generic
canvas fallback can be unrelated to the intended chart; inspect the metadata and
image. The first pane-canvas can omit axes and additional panes. No selection or
fallback behavior is silently expanded.

API capture means the owned collection's screenshot UI was triggered. It returns
backend api, file_path null and unknown actual_region/image/axes; it does not
promise a local file. API failure never falls back to a hidden tab or CDP target.
CDP foreground/viewport protection and API ownership policy remain unchanged.

Before implementation, the preserved chart-region argv and a matching historical
image were compared. That image includes the Pine panel and omits axis context.
It cannot establish the selector used because the old response did not record it.
Raw research source/images and personal IDs remain private and are not included
in this repository.
