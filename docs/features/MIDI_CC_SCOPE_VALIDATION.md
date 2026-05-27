# MIDI CC Scope Validation Checklist

This checklist defines the approval bar for the MIDI CC oscilloscope feature.

The reviewer stance is strict: approve only if the feature is passive, bounded, visually adjacent, architecturally separate, and uses the existing decoded message stream. Anything deeper is scope creep.

## Top 10 safety checks

| # | Check | Approval rule |
|---:|---|---|
| 1 | Exact data tap point | The oscilloscope must hook into the same decoded MIDI/message stream that feeds the existing MIDI Monitor. It must not use a second parser, firmware changes, or raw serial unless explicitly labeled as raw/debug. |
| 2 | No transmit side effects | The oscilloscope must be read-only. Any path that can send MIDI, SysEx, package messages, config writes, firmware calls, or device mutations is a red flag. |
| 3 | Bounded memory | Fixed-size buffers only. No infinite history, unbounded arrays, or clear-later assumptions. |
| 4 | Render throttling | MIDI can be bursty. Scope UI updates should be batched on animation frames or another controlled cadence instead of causing a Svelte render on every message. |
| 5 | Svelte lifecycle correctness | Be paranoid about subscriptions, stale state, requestAnimationFrame cleanup, timeout cleanup, worker cleanup, and component teardown because Grid Editor has had Svelte migration work around reactive variables and MIDI monitor behavior. |
| 6 | Clear source labeling | Grid-originated messages, external MIDI input, package messages, SysEx, debug traffic, and protocol frames must not be visually conflated. |
| 7 | MIDI Monitor isolation | Adjacent to MIDI Monitor means shared source, not entangled behavior. Existing monitor behavior should not slow down, change ordering, or inherit oscilloscope filters. |
| 8 | Performance under abuse | Review for 10k+ message bursts, MIDI clock spam, encoder floods, SysEx-sized payloads, disconnected/reconnected devices, and hidden-tab behavior. |
| 9 | Electron/security boundaries | Do not weaken preload, IPC, contextIsolation, renderer permissions, or Electron security settings for visualization convenience. |
| 10 | Upstream survivability | Keep the diff small and boring: one contained component, one monitor seam, no broad package architecture changes, no firmware changes, and minimal shared-code edits. |

## Sprint 6 static review notes

### 1. Exact data tap point

The scope is fed from `handleWorkerMessage` in `MidiMonitor.svelte`, after the existing MIDI worker has produced the same processed MIDI item used by the normal MIDI message list.

Required code shape:

```ts
case MidiType.MIDI: {
  const midiItem = item as MidiStreamItem & { data: MidiData };
  queueScopeItem(midiItem);
  midi_messages.update(...);
}
```

This must remain a decoded MIDI Monitor data path. Do not add a second parser.

### 2. No transmit side effects

`CcScope.svelte` should have no imports from runtime managers, package managers, firmware paths, IPC/preload code, or device mutation services. It should receive data and render state only.

### 3. Bounded memory

Expected bounds:

```ts
const maxHistoryLength = 128;
const maxScopeBatchLength = 1024;
```

The history buffer and pending frame batch must remain capped.

### 4. Render throttling

The parent monitor should batch scope updates through `requestAnimationFrame`, then pass the batch into `CcScope` once per frame. Do not bind every MIDI message directly into the scope prop.

### 5. Lifecycle correctness

Expected cleanup:

- unsubscribe from `midi_stream`
- terminate the worker
- cancel pending animation frame
- clear activity timer
- mark monitor unmounted

### 6. Source labeling

The current UI labels the selected CC, last seen CC, MIDI Monitor direction, and device name through the existing monitor fields. Later polish may add explicit RX/TX badges in the scope itself, but the scope must not show SysEx or raw protocol frames as CC waveform data.

### 7. MIDI Monitor isolation

The normal MIDI list must continue updating through `midi_messages.update`. The scope must not filter or mutate the message list.

### 8. Performance under abuse

The current design is bounded, but local testing should still flood the monitor with CC traffic and MIDI clock-like non-CC messages. The expected behavior is that non-CC messages do not add waveform points and CC history remains capped.

### 9. Electron/security boundaries

No Electron/preload/IPC/security files should be touched by this feature.

### 10. Upstream survivability

The desired file footprint is:

```text
src/renderer/main/panels/MidiMonitor/CcScope.svelte
src/renderer/main/panels/MidiMonitor/MidiMonitor.svelte
docs/features/MIDI_CC_SCOPE_VALIDATION.md
```

A broader diff should be treated as suspicious unless deliberately approved.

## Local validation script

After checkout:

```bash
git checkout feature/midi-cc-scope-sprint-6
npm i
npm run electron-dev
```

Manual validation:

| Test | Expected result |
|---|---|
| Open MIDI Monitor | Existing monitor opens normally. |
| Debug View off | CC Scope appears adjacent to the monitor summary/list. |
| Debug View on | Existing raw/debug monitor behavior remains available. |
| Move any CC while learning | Scope locks to that channel/CC. |
| Send steady CC | Flat waveform line. |
| Send LFO CC | Recognizable scrolling waveform. |
| Send non-CC MIDI | Normal monitor sees it; scope does not add waveform points. |
| Send SysEx | SysEx list works; scope does not plot it. |
| Freeze | Waveform stops appending while monitor continues. |
| Resume | Waveform appends again. |
| Clear Scope | Scope trace clears only. |
| Clear All | Existing monitor and scope both reset. |
| Abuse traffic | History remains capped and UI remains usable. |
