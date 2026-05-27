# MIDI CC Scope Validation Checklist

This checklist defines the approval bar for the MIDI CC oscilloscope feature.

Approve only if the feature is passive, bounded, visually adjacent, architecturally separate, and uses the existing decoded message stream.

## Safety checks

| # | Check | Approval rule |
|---:|---|---|
| 1 | Exact data tap point | Use the same decoded MIDI message stream that feeds the existing MIDI Monitor. Do not add another parser, firmware path, or raw-device path. |
| 2 | Read-only behavior | The oscilloscope only reads and displays decoded MIDI data. It must not send MIDI, write config, call firmware paths, or mutate devices. |
| 3 | Bounded memory | Use fixed-size buffers only. |
| 4 | Render cadence | Batch scope updates on animation frames or another controlled cadence. Do not render the scope once per incoming message. |
| 5 | Svelte lifecycle | Clean up subscriptions, animation frames, timers, and workers. |
| 6 | Source labeling | Show selected CC, RX/TX direction, and device name. Do not visually mix CC waveform data with SysEx or debug/protocol rows. |
| 7 | MIDI Monitor isolation | The normal MIDI Monitor list must keep its ordering and behavior. Scope filters must not affect it. |
| 8 | Stress behavior | Fast CC traffic and non-CC traffic should remain bounded and usable. |
| 9 | App boundaries | Do not change Electron, preload, IPC, or renderer permission settings for this feature. |
| 10 | Upstream survivability | Keep the diff small: one scope store, one component, one monitor seam, no firmware changes. |

## Grid-native refinement notes

This implementation follows Grid Editor's existing graph style before considering Canvas:

- `DebugMonitor.svelte` renders SVG `<polyline>` graphs for RX/TX data-rate display.
- `DebugMonitor.store.ts` keeps bounded histories and converts histories into point strings.
- `PolyLineGraph.svelte` and `PolyLineGraph.js` use a Svelte store, bounded values, SVG point strings, and simple stats.

The CC scope mirrors that style:

```text
decoded MIDI Monitor stream
  -> live-only animation-frame batched MIDI items
  -> CC-only MidiScope.store.ts
  -> bounded selected-CC ring buffer
  -> SVG polyline point string
  -> CcScope.svelte display
```

Canvas should only be considered if local profiling shows SVG cannot handle real CC traffic.

## Hardened behavior

### Explicit reset path

`MidiMonitor.svelte` owns monitor-level reset intent. Clear All calls `resetScopeQueue()`, clears the pending scope batch, cancels any pending animation frame, resets dropped input counters, and increments `scopeResetSignal`. `CcScope.svelte` resets only when this explicit signal changes.

### Live-only learning

The MIDI Monitor still replays its existing buffer into the worker on mount so the normal MIDI Monitor list behaves as before. Replayed message IDs are tracked in `replayedMessageIds` and are excluded from the CC scope queue. This prevents Learn mode from accidentally selecting an old buffered CC.

### Control Change detection

`MidiScope.store.ts` prefers the decoded numeric command value: `(command.value & 0xf0) === 0xb0`. String checks remain only as a fallback.

### Bounded history and overload policy

The scope uses a fixed-size ring buffer for selected-CC history. When the history is full, newest samples win and the oldest sample is overwritten. The parent pending batch is also bounded. When the pending batch overflows, newest samples win and the oldest pending input samples are dropped. Dropped counts are surfaced in the scope UI so overload is not silent.

### Freeze semantics

Freeze is a display/trace freeze. While frozen, the waveform does not append new points, but the last-seen CC label can still update so the user can tell live traffic continues. The UI labels this as `Freeze Display` / `Resume Display`.

### SVG sizing

The scope uses a fixed internal SVG viewBox as a normalized coordinate system and allows the SVG element itself to scale with `w-full h-24`. This keeps the graph math deterministic while still letting the panel width resize.

## Static review notes

### Data path

The scope is fed from `handleWorkerMessage` in `MidiMonitor.svelte`, after the existing MIDI worker has produced the same processed MIDI item used by the normal MIDI message list.

Required code shape:

```ts
case MidiType.MIDI: {
  const midiItem = item as MidiStreamItem & { data: MidiData };
  if (!replayedMessageIds.delete(midiItem.id)) {
    queueScopeItem(midiItem);
  }
  midi_messages.update(...);
}
```

### Store responsibility

`MidiScope.store.ts` filters already-decoded CC messages, maintains selected CC state, maintains a bounded ring buffer, tracks overload counts, and exposes an SVG point string plus stats.

`CcScope.svelte` stays mostly presentational. It accepts incoming batches, a reset signal, and a dropped-input count from the parent seam.

### Expected file footprint

```text
src/renderer/main/panels/MidiMonitor/MidiScope.store.ts
src/renderer/main/panels/MidiMonitor/CcScope.svelte
src/renderer/main/panels/MidiMonitor/MidiMonitor.svelte
docs/features/MIDI_CC_SCOPE_VALIDATION.md
```

## Local validation script

After checkout:

```bash
git checkout feature/midi-cc-scope-hardening-pass
npm i
npm run electron-dev
```

Manual validation:

| Test | Expected result |
|---|---|
| Open MIDI Monitor | Existing monitor opens normally. |
| Debug View off | CC Scope appears adjacent to the monitor summary/list. |
| Debug View on | Existing raw/debug monitor behavior remains available. |
| Open with prior monitor history | Scope stays in learn/wait state until a new live CC arrives. |
| Move any live CC while learning | Scope locks to that channel/CC. |
| Send steady CC | Flat waveform line. |
| Send LFO CC | Recognizable scrolling waveform. |
| Send non-CC MIDI | Normal monitor sees it; scope does not add waveform points. |
| Send SysEx | SysEx list works; scope does not plot it. |
| Freeze Display | Waveform stops appending while last-seen CC can continue updating. |
| Resume Display | Waveform appends again. |
| Clear Scope | Scope trace clears only. |
| Clear All | Existing monitor and scope both reset. |
| Fast traffic | History remains capped, dropped count is visible if overflow occurs, and UI remains usable. |
