# MIDI CC Scope Plan

Target fork: `Echomatter/EM_Grid_Editor`  
Base project: `intechstudio/grid-editor`  
Base branch: `stable`  
Feature branch: `docs/midi-cc-scope-plan`  
Goal: add an oscilloscope-style MIDI CC visualizer to Grid Editor.

## Purpose

This fork is for prototyping a practical MIDI CC oscilloscope inside Grid Editor. The immediate use case is validating Grid profiles that generate MIDI CC modulation, especially the 4LFO+FM ASCII wavetable profile.

The scope should make it obvious whether a generated CC stream is centered correctly, scaled correctly, clipped, stalled, jittering, or following the intended waveform. It should help answer questions like:

| Question | Visual answer |
|---|---|
| Is the LFO centered correctly? | The waveform rides around the expected centerline. |
| Is depth working? | The trace grows/shrinks without unexpected clipping. |
| Is FM working? | The timing/shape bends without stalling. |
| Is the right CC being sent? | Learn/manual selection shows the intended channel and CC. |
| Did a profile change break timing? | The waveform cadence visibly changes. |

This is an Editor diagnostic tool, not a firmware change and not a Grid profile.

## Repository findings

Grid Editor already has a built-in MIDI Monitor. It is registered as `midi-monitor` in `configuration.json` and rendered directly by the left panel. The current MIDI Monitor imports and uses the internal `midi_stream` store and processed MIDI data path.

The current parsed MIDI message model already exposes the core fields needed for a CC scope:

| Concept | Existing data shape |
|---|---|
| MIDI command | `data.command` |
| Channel | `data.channel + 1` |
| CC number | `data.params.p1.value` |
| CC value | `data.params.p2.value` |
| Direction | `data.direction` |

Control Change messages are command `B`, surfaced as `CC`. Parameter 1 is the controller number. Parameter 2 is the value.

Because the MIDI stream is internal editor state, the first implementation should extend the built-in MIDI Monitor rather than trying to build an external package.

## Plugin/package conclusion

Grid Editor has an external package system. External packages can provide metadata, icons, custom components, and package behavior. However, based on the current repo shape, external packages do not appear to have a clean public API for subscribing to the built-in MIDI Monitor stream.

Therefore:

| Option | Assessment |
|---|---|
| External package first | Not recommended. MIDI stream access is unclear. |
| Built-in MIDI Monitor child component | Recommended first pass. Fastest and lowest architectural uncertainty. |
| Later package API for MIDI events | Good upstream-friendly follow-up if maintainers prefer plugins. |

## Target implementation shape

Add a contained child component:

```text
src/renderer/main/panels/MidiMonitor/CcScope.svelte
```

Mount it from:

```text
src/renderer/main/panels/MidiMonitor/MidiMonitor.svelte
```

Do not touch firmware. Do not change profile behavior. Do not change existing MIDI Monitor list behavior.

## Data flow

Existing flow:

```text
runtime descriptor
  -> midi_stream store
  -> MidiMonitor.svelte
  -> midiWorker.ts
  -> processed MIDI message
  -> MIDI/SysEx list UI
```

Proposed scope flow:

```text
processed MIDI message
  -> if command is CC
  -> match selected channel/CC or learn mode
  -> push value into fixed-size ring buffer
  -> draw waveform
```

Use the existing processed MIDI message after the worker returns it. This keeps the scope aligned with what the existing MIDI Monitor shows.

## CC detection

Use the parsed MIDI data, not raw bytes.

```ts
item.type === MidiType.MIDI && item.data.command.short === "CC"
```

Then extract:

```ts
const channel = item.data.channel + 1;
const cc = item.data.params.p1.value;
const value = item.data.params.p2.value;
const direction = item.data.direction;
```

Guard against SysEx and non-MIDI items.

## Scope state model

Suggested state shape:

```ts
type CcScopeMode = "learn" | "manual";

type CcScopePoint = {
  time: number;
  channel: number;
  cc: number;
  value: number;
  direction: string;
};

type CcScopeState = {
  mode: CcScopeMode;
  selectedChannel: number | null;
  selectedCc: number | null;
  frozen: boolean;
  maxPoints: number;
  points: CcScopePoint[];
};
```

Recommended starting buffer size:

```text
128 points
```

This is enough to see an LFO shape without creating heavy DOM churn.

## UI requirements

Minimum useful controls:

| Control | Behavior |
|---|---|
| Learn | Next incoming CC locks the scope to that channel and CC. |
| Channel selector | Manual selected channel, 1-16. |
| CC selector | Manual CC number, 0-127. |
| Freeze | Pauses visual updates without stopping MIDI Monitor. |
| Clear | Clears only the CC Scope buffer. |
| Stats | Latest value, min, max, range, selected channel, selected CC. |

The component should be compact. It should feel like a one-line oscilloscope, not a full DAW analyzer.

Example layout:

```text
CC Scope
Ch 1 / CC 67 / Latest 82 / Min 23 / Max 104 / Range 81
[ waveform line ]
[ Learn ] [ Freeze ] [ Clear ]
```

## Rendering strategy

Prefer a single SVG polyline for the first implementation.

| Approach | Recommendation |
|---|---|
| SVG polyline | Best first pass. Simple, inspectable, fine for ~128 points. |
| Canvas | Good later if performance demands it. |
| One DOM element per point | Avoid. Too much churn under MIDI traffic. |

Y-axis mapping:

```ts
const y = height - (value / 127) * height;
```

X-axis mapping:

```ts
const x = (index / (maxPoints - 1)) * width;
```

The SVG point string can be derived from the current ring buffer.

## Integration notes

In `MidiMonitor.svelte`, keep the existing message list update logic. Add a local value for the most recent processed MIDI message that can be passed to `CcScope`.

Conceptual shape:

```ts
let lastScopeItem: (MidiStreamItem & { data: MidiData }) | undefined;

case MidiType.MIDI: {
  const midiItem = item as MidiStreamItem & { data: MidiData };
  lastScopeItem = midiItem;

  midi_messages.update((s) => {
    let result = [...s, midiItem];
    if (result.length > maxMessageCount) result.shift();
    return result;
  });
  break;
}
```

Then mount:

```svelte
<CcScope incoming={lastScopeItem} />
```

Do not subscribe to `midi_stream` twice unless necessary. The existing worker path already normalizes the messages.

## Feature phases

### Phase 1: build sanity

- Clone fork locally.
- Install dependencies.
- Launch unmodified Grid Editor.
- Confirm existing MIDI Monitor still works.

Acceptance:

- `npm i` completes.
- `npm run electron-dev` launches.
- Existing MIDI Monitor behavior is unchanged.

### Phase 2: inert UI

- Add `CcScope.svelte`.
- Mount it in non-debug MIDI Monitor view.
- Render static placeholder UI.

Acceptance:

- Editor launches.
- Scope placeholder appears.
- Existing MIDI Messages, SysEx Messages, Debug View, and Clear All still work.

### Phase 3: live CC readout

- Feed processed MIDI messages into `CcScope`.
- Detect CC messages.
- Show latest channel, CC, and value.
- Add Learn mode.

Acceptance:

- Moving a CC updates the readout.
- Learn mode locks to the next incoming CC.
- Non-CC messages are ignored safely.

### Phase 4: waveform drawing

- Add fixed-size ring buffer.
- Render selected CC values as SVG polyline.
- Add min/max/range stats.
- Add Freeze and Clear.

Acceptance:

- Static CC produces a flat line.
- LFO CC produces a recognizable waveform.
- Freeze pauses scope drawing only.
- Clear resets only the scope.

### Phase 5: polish

- Keep the diff small.
- Avoid new dependencies.
- Preserve all existing monitor behavior.
- Add comments only where they clarify data flow.
- Consider tests only if the existing test harness makes it simple.

Acceptance:

- Existing MIDI Monitor still works.
- The feature is visually useful.
- No runaway memory growth.
- No noticeable lag under normal MIDI CC traffic.

## Local dev setup notes

Grid Editor is an Electron + Svelte project.

`package.json` requires:

```text
node >= 24.0.0
npm >= 11.0.0
```

Official Linux/Ubuntu-oriented startup pattern:

```bash
npm i
sudo chown root ./node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 ./node_modules/electron/dist/chrome-sandbox
npm run electron-dev
```

Official Linux serial permission guidance:

```bash
sudo usermod -aG dialout $USER
```

Then restart the session/machine.

### WSL recommendation

The user’s normal development model is WSL on Windows. Use WSL for Git, Codex, repo edits, and documentation.

Hardware testing may be easier in Windows native because Grid hardware access through WSL can require USB passthrough and WSLg/Electron quirks.

Recommended split:

| Work | Preferred environment |
|---|---|
| Git/Codex/docs | WSL |
| Source editing | VS Code Remote WSL or Windows VS Code |
| Web/static checks | WSL |
| Electron with real Grid hardware | Windows native first, unless WSL USB is confirmed |

Do not share one `node_modules` folder between Windows and WSL. If both environments are needed, use separate clones or reinstall dependencies per environment.

## Local clone commands

```bash
mkdir -p /home/echomatter/dev
cd /home/echomatter/dev
git clone git@github.com:Echomatter/EM_Grid_Editor.git
cd EM_Grid_Editor
git remote add upstream https://github.com/intechstudio/grid-editor.git
git fetch upstream
git checkout stable
git checkout -b feature/midi-cc-scope
npm i
npm run electron-dev
```

If working from this planning branch:

```bash
git fetch origin
git checkout docs/midi-cc-scope-plan
```

For implementation work, create a separate feature branch:

```bash
git checkout stable
git pull
git checkout -b feature/midi-cc-scope
```

## Research notes

Other MIDI visualizer repositories show a useful general pattern: keep a compact data model, own the rendering surface, and redraw a canvas/SVG from the current data. Do not copy their architecture directly if they open Web MIDI themselves. Grid Editor already has its own MIDI event path.

The transferable pattern is:

```text
incoming event -> normalized point model -> fixed buffer -> efficient redraw
```

Not:

```text
open a second MIDI device stream inside Grid Editor
```

## Codex implementation prompt

```text
You are working in my fork of intechstudio/grid-editor, named EM_Grid_Editor.

Goal:
Add a contained MIDI CC oscilloscope view to the existing built-in MIDI Monitor.

Read first:
- src/renderer/main/panels/MidiMonitor/MidiMonitor.svelte
- src/renderer/main/panels/MidiMonitor/MidiMonitor.store.ts
- src/renderer/main/panels/MidiMonitor/midi-types.ts
- src/renderer/main/panels/MidiMonitor/midiWorker.ts
- src/renderer/main/LeftPanelContainer.svelte

Constraints:
- Do not touch firmware.
- Do not change profile behavior.
- Do not create a separate package yet.
- Do not disturb the existing MIDI message list, SysEx list, Debug View, or Clear All behavior.
- Do not add heavy dependencies.
- Prefer a small Svelte component and a lightweight SVG polyline.
- Use the existing parsed MIDI Monitor data path.

Implementation:
- Add src/renderer/main/panels/MidiMonitor/CcScope.svelte.
- Mount it in MidiMonitor.svelte in the non-debug MIDI Monitor view.
- Feed processed MIDI messages into CcScope after the MIDI worker returns them.
- Detect Control Change messages only.
- Extract:
  channel = data.channel + 1
  cc = data.params.p1.value
  value = data.params.p2.value
- Add Learn mode so the next incoming CC locks the scope to that channel and CC.
- Add manual channel and CC selection if straightforward.
- Maintain a fixed-size ring buffer of recent values.
- Render selected CC values as a one-line oscilloscope waveform.
- Show latest value, min, max, range, selected channel, and selected CC.
- Add Freeze and Clear buttons for the scope only.

Acceptance:
- Existing MIDI Monitor behavior is preserved.
- Incoming CC messages still appear in the normal message list.
- A selected CC displays as a live scrolling waveform.
- Learn mode locks to the moved CC.
- A generated LFO CC appears as a recognizable moving shape.
- No runaway memory growth.
- No noticeable lag under normal MIDI CC traffic.
```

## Risk ledger

| Risk | Impact | Mitigation |
|---|---|---|
| WSL cannot access Grid hardware cleanly | Hardware testing blocked | Test Electron on Windows native first. |
| External package API cannot access MIDI stream | Plugin-only approach blocked | Start inside built-in MIDI Monitor. |
| High MIDI traffic causes UI lag | Bad monitor performance | Fixed buffer, SVG polyline/canvas, no per-point DOM. |
| Upstream dislikes core monitor addition | PR may not merge | Keep fork useful; later propose package MIDI event API. |
| Existing worker cadence affects visual timing | Scope reflects monitor cadence, not raw serial timing | Accept for first pass; it matches what MIDI Monitor sees. |
| GPLv3 obligations | Distribution constraints | Preserve license and source availability. |

## Upstream strategy

Do not lead with a large plugin architecture request. First prove a small CC Scope inside MIDI Monitor:

```text
Optional CC Scope view.
No firmware changes.
No behavior changes to existing monitor.
No heavy dependencies.
Useful for debugging Grid MIDI profiles.
```

If maintainers prefer packages, then propose a second change:

```text
Expose MIDI Monitor events to editor packages so diagnostic tools like CC Scope can live outside core.
```
