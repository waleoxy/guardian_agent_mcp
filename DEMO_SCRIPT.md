# Demo Script

Two demos, ~2 minutes each, per the original design doc. Every tool
call below has been run against the actual server (see README for the
raw curl output) — this isn't aspirational, it's what the code does
today. Swap the curl calls for the live Alexa+ voice flow once
registered; keep the curl versions as your backup if voice or hardware
misbehaves on demo day.

## Demo A — Happy path (wellness check)

| Time | Beat | What happens | Tool call |
|---|---|---|---|
| 0:00 | Problem statement | "Your smart home can detect problems. But who decides what to do?" | — |
| 0:10 | Activate | "Alexa, I'm leaving. Guardian, watch the house and help my mother if she needs anything." | `set_monitoring { active: true }` |
| 0:25 | Ambient event | Ring: person at front door, mid-morning, owner away | `report_event { source: ring, type: person_detected, location: front_door }` → tier `inform` (matches "notify owner while away" policy) |
| 0:50 | Owner checks in | "Guardian, Mom hasn't responded to me. Check whether everything is okay." | `get_person_status { memberId: m-mary }` → shows `lastSeenAt` stale |
| 1:00 | Guardian proposes | Guardian: "I haven't received a response from Mom and her normal morning activity hasn't occurred. Want me to start a wellness check?" | (reasoning surfaced from `get_household_context` + the `p-wellness-check` policy) |
| 1:10 | Confirm | "Yes." | `start_wellness_check { memberId: m-mary, reason: "..." }` → incident created, tier `ask` |
| 1:20 | Dashboard | Cut to the dashboard: yellow "Wellness Check — Waiting for response" | `GET /api/status` (this is what `public/index.html` polls) |
| 1:35 | Resolution | Mary responds | `POST /api/incidents/:id/resolve` (or `resolve_incident` tool) |
| 1:50 | All clear | Dashboard flips to green, Alexa confirms | `GET /api/status` → `activeIncidents: []` |

## Demo B — AI refuses an unsafe action (the differentiator)

This is the moment that separates Guardian from an event→alert pipe.
Confirmed live: a `person_detected` event at `front_door` returns
`tier: "escalate"` with reasoning citing the never-auto-unlock hard
constraint, at 95% confidence, without ever proposing the unlock.

| Time | Beat | Tool call |
|---|---|---|
| 0:00 | Unknown visitor, owner away | `report_event { source: ring, type: person_detected, location: front_door }` |
| 0:10 | Guardian's response (read directly from the decision) | *"An unfamiliar person is at the front door. I won't unlock the door — no policy authorizes that. I'll notify you and continue monitoring."* |
| 0:25 | Judge question: "What if it's clearly the owner's kid locked out?" | Show `add_policy` live: *"Guardian, if it's James at the front door after school, let him in."* → compiles to a new scoped policy, still can't override the hard constraint on unlocking — good follow-up if asked, since it shows the boundary is real, not just a canned line |

## Optional: Scenario D (pattern escalation) as a bonus beat

Not in the original 2-minute cut, but worth having ready if there's Q&A
time: fire three distinct low-signal events (`motion`, `door_activity`,
`window_activity`) across different locations within a few minutes.
None individually escalate. The third does — Guardian explicitly
reasons across the event history, not just the triggering event. This
is the single best "it's actually agentic, not a wrapper" moment in
the whole system; use it if a judge asks "what makes this different
from a rules engine?"

## Backup plan

Record a clean take of every hardware-dependent beat (the Ring
trigger, the Alexa+ voice round-trip) the first time it works, per the
build plan. If live hardware flakes during judging, play the backup
and narrate live — judges have seen this before and care more about
the reasoning than the hardware.
