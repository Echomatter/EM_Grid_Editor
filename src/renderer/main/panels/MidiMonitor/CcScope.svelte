<script lang="ts">
  import {
    type MidiData,
    type MidiStreamItem,
  } from "./MidiMonitor.store";

  export let incoming:
    | (MidiStreamItem & { data: MidiData })
    | undefined = undefined;

  type CcScopePoint = {
    id: MidiStreamItem["id"];
    time: number;
    channel: number;
    cc: number;
    value: number;
  };

  const channels = Array.from({ length: 16 }, (_, i) => i + 1);
  const ccNumbers = Array.from({ length: 128 }, (_, i) => i);
  const maxHistoryLength = 128;
  const svgWidth = 320;
  const svgHeight = 96;
  const centerLineY = svgHeight / 2;

  let selectedChannel = "";
  let selectedCc = "";
  let learning = true;
  let frozen = false;
  let history: CcScopePoint[] = [];
  let lastSeenCc: { channel: number; cc: number; value: number } | undefined =
    undefined;
  let ignoredCount = 0;
  let lastIncomingId: MidiStreamItem["id"] | undefined = undefined;

  $: if (incoming && incoming.id !== lastIncomingId) {
    lastIncomingId = incoming.id;
    handleIncoming(incoming);
  }

  $: latestValue = history.length > 0 ? history[history.length - 1].value : undefined;

  $: minValue =
    history.length > 0
      ? Math.min(...history.map((point) => point.value))
      : undefined;

  $: maxValue =
    history.length > 0
      ? Math.max(...history.map((point) => point.value))
      : undefined;

  $: rangeValue =
    minValue === undefined || maxValue === undefined ? "---" : maxValue - minValue;

  $: selectedLabel = selectedChannel && selectedCc
    ? `Ch ${selectedChannel} / CC ${selectedCc}`
    : learning
      ? "Learning next CC"
      : "No CC selected";

  $: scopeStatus = frozen
    ? "Frozen"
    : learning
      ? "Learning"
      : selectedChannel && selectedCc
        ? "Recording"
        : "Waiting";

  $: polylinePoints = buildPolyline(history);

  $: latestLineY =
    latestValue === undefined ? undefined : valueToY(latestValue);

  $: stats = [
    { label: "Channel", value: selectedChannel || "---" },
    { label: "CC", value: selectedCc || "---" },
    { label: "Latest", value: latestValue ?? "---" },
    { label: "Range", value: rangeValue },
  ];

  function handleIncoming(item: MidiStreamItem & { data: MidiData }) {
    if (!isControlChange(item)) {
      return;
    }

    const channel = item.data.channel + 1;
    const cc = item.data.params.p1.value;
    const value = clampMidiValue(item.data.params.p2.value);
    lastSeenCc = { channel, cc, value };

    if (learning || !selectedChannel || !selectedCc) {
      selectedChannel = String(channel);
      selectedCc = String(cc);
      learning = false;
      resetTrace();
    }

    if (!matchesSelection(channel, cc)) {
      ignoredCount += 1;
      return;
    }

    if (frozen) {
      return;
    }

    pushHistory({
      id: item.id,
      time: item.date,
      channel,
      cc,
      value,
    });
  }

  function isControlChange(item: MidiStreamItem & { data: MidiData }) {
    return (
      item.data.command.short === "CC" ||
      item.data.command.name === "Control Change"
    );
  }

  function matchesSelection(channel: number, cc: number) {
    return String(channel) === selectedChannel && String(cc) === selectedCc;
  }

  function pushHistory(point: CcScopePoint) {
    history = [...history, point].slice(-maxHistoryLength);
  }

  function armLearn() {
    selectedChannel = "";
    selectedCc = "";
    learning = true;
    frozen = false;
    resetTrace();
  }

  function toggleFreeze() {
    frozen = !frozen;
  }

  function clearScope() {
    resetTrace();
    ignoredCount = 0;
  }

  function resetTrace() {
    history = [];
  }

  function handleManualSelection() {
    learning = !(selectedChannel && selectedCc);
    frozen = false;
    resetTrace();
  }

  function buildPolyline(points: CcScopePoint[]) {
    if (points.length === 0) {
      return "";
    }

    if (points.length === 1) {
      const y = valueToY(points[0].value);
      return `0,${y} ${svgWidth},${y}`;
    }

    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * svgWidth;
        const y = valueToY(point.value);
        return `${roundForSvg(x)},${y}`;
      })
      .join(" ");
  }

  function valueToY(value: number) {
    const normalizedValue = clampMidiValue(value) / 127;
    return roundForSvg(svgHeight - normalizedValue * svgHeight);
  }

  function clampMidiValue(value: number) {
    return Math.max(0, Math.min(127, value));
  }

  function roundForSvg(value: number) {
    return Number(value.toFixed(2));
  }
</script>

<div class="border-gray-700 border rounded flex flex-col mb-4 overflow-hidden">
  <div class="flex flex-row items-center justify-between bg-secondary px-2 py-1 gap-2">
    <span class="text-white truncate">CC Scope</span>
    <span class="text-gray-300 text-xs truncate">{selectedLabel}</span>
  </div>

  <div class="flex flex-col gap-3 p-3 text-white">
    <div class="grid grid-cols-4 gap-2 text-center">
      {#each stats as stat}
        <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
          <span class="bg-secondary px-1 truncate text-xs">{stat.label}</span>
          <span class="px-2 truncate">{stat.value}</span>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-gray-300">Channel</span>
        <select
          class="bg-secondary border border-gray-700 rounded px-2 py-1 text-white"
          bind:value={selectedChannel}
          on:change={handleManualSelection}
        >
          <option value="">Learn</option>
          {#each channels as channel}
            <option value={String(channel)}>Ch {channel}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-gray-300">CC Number</span>
        <select
          class="bg-secondary border border-gray-700 rounded px-2 py-1 text-white"
          bind:value={selectedCc}
          on:change={handleManualSelection}
        >
          <option value="">Learn</option>
          {#each ccNumbers as cc}
            <option value={String(cc)}>CC {cc}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="grid grid-cols-4 gap-2 text-center text-sm">
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden col-span-2">
        <span class="bg-secondary px-1 truncate text-xs">Last Seen CC</span>
        <span class="px-2 truncate">
          {lastSeenCc
            ? `Ch ${lastSeenCc.channel} / CC ${lastSeenCc.cc} = ${lastSeenCc.value}`
            : "---"}
        </span>
      </div>
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
        <span class="bg-secondary px-1 truncate text-xs">Min</span>
        <span class="px-2 truncate">{minValue ?? "---"}</span>
      </div>
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
        <span class="bg-secondary px-1 truncate text-xs">Max</span>
        <span class="px-2 truncate">{maxValue ?? "---"}</span>
      </div>
    </div>

    <svg
      class="w-full h-24 bg-secondary rounded border border-gray-700"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      role="img"
      aria-label="MIDI CC scope waveform"
    >
      <line x1="0" y1="0" x2={svgWidth} y2="0" stroke="currentColor" opacity="0.15" />
      <line
        x1="0"
        y1={centerLineY}
        x2={svgWidth}
        y2={centerLineY}
        stroke="currentColor"
        opacity="0.25"
      />
      <line
        x1="0"
        y1={svgHeight}
        x2={svgWidth}
        y2={svgHeight}
        stroke="currentColor"
        opacity="0.15"
      />

      {#if polylinePoints}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else}
        <text
          x={svgWidth / 2}
          y={svgHeight / 2}
          text-anchor="middle"
          dominant-baseline="middle"
          fill="currentColor"
          opacity="0.45"
        >
          Waiting for selected CC data
        </text>
      {/if}

      {#if latestLineY !== undefined}
        <line
          x1="0"
          y1={latestLineY}
          x2={svgWidth}
          y2={latestLineY}
          stroke="currentColor"
          opacity="0.35"
          stroke-dasharray="4 4"
        />
      {/if}
    </svg>

    <div class="flex flex-row gap-2 items-center flex-wrap">
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white"
        type="button"
        on:click={armLearn}
      >
        Learn Next CC
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 {frozen
          ? 'text-yellow-400'
          : 'text-white'}"
        type="button"
        on:click={toggleFreeze}
      >
        {frozen ? "Resume" : "Freeze"}
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white"
        type="button"
        on:click={clearScope}
      >
        Clear Scope
      </button>
      <span class="text-gray-300 text-xs truncate">
        {scopeStatus} · Samples {history.length}/{maxHistoryLength} · Ignored {ignoredCount}
      </span>
    </div>
  </div>
</div>
