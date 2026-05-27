<script lang="ts">
  import {
    MidiData,
    type MidiStreamItem,
  } from "./MidiMonitor.store";

  export let incoming:
    | (MidiStreamItem & { data: MidiData })
    | undefined = undefined;

  const channels = Array.from({ length: 16 }, (_, i) => i + 1);
  const ccNumbers = Array.from({ length: 128 }, (_, i) => i);

  let selectedChannel = "";
  let selectedCc = "";
  let learning = true;
  let latestValue: number | undefined = undefined;
  let minValue: number | undefined = undefined;
  let maxValue: number | undefined = undefined;
  let lastSeenCc: { channel: number; cc: number; value: number } | undefined =
    undefined;
  let ignoredCount = 0;
  let lastIncomingId: string | undefined = undefined;

  $: if (incoming && incoming.id !== lastIncomingId) {
    lastIncomingId = incoming.id;
    handleIncoming(incoming);
  }

  $: selectedLabel = selectedChannel && selectedCc
    ? `Ch ${selectedChannel} / CC ${selectedCc}`
    : learning
      ? "Learning next CC"
      : "No CC selected";

  $: rangeValue =
    minValue === undefined || maxValue === undefined ? "---" : maxValue - minValue;

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
    const value = item.data.params.p2.value;
    lastSeenCc = { channel, cc, value };

    if (learning || !selectedChannel || !selectedCc) {
      selectedChannel = String(channel);
      selectedCc = String(cc);
      learning = false;
      resetStats();
    }

    if (!matchesSelection(channel, cc)) {
      ignoredCount += 1;
      return;
    }

    latestValue = value;
    minValue = minValue === undefined ? value : Math.min(minValue, value);
    maxValue = maxValue === undefined ? value : Math.max(maxValue, value);
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

  function armLearn() {
    learning = true;
  }

  function clearScope() {
    latestValue = undefined;
    resetStats();
    ignoredCount = 0;
  }

  function resetStats() {
    minValue = undefined;
    maxValue = undefined;
  }

  function handleManualSelection() {
    learning = false;
    latestValue = undefined;
    resetStats();
  }
</script>

<div class="border-gray-700 border rounded flex flex-col mb-4 overflow-hidden">
  <div class="flex flex-row items-center justify-between bg-secondary px-2 py-1">
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

    <div class="grid grid-cols-3 gap-2 text-center text-sm">
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
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
      viewBox="0 0 320 96"
      role="img"
      aria-label="MIDI CC scope waveform placeholder"
    >
      <line x1="0" y1="48" x2="320" y2="48" stroke="currentColor" opacity="0.25" />
      <polyline
        points="0,70 32,64 64,48 96,30 128,26 160,42 192,66 224,72 256,54 288,34 320,28"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.45"
      />
      {#if latestValue !== undefined}
        {@const y = 96 - (latestValue / 127) * 96}
        <line x1="0" y1={y} x2="320" y2={y} stroke="currentColor" opacity="0.8" />
      {/if}
    </svg>

    <div class="flex flex-row gap-2 items-center">
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white"
        type="button"
        on:click={armLearn}
      >
        Learn Next CC
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-gray-400"
        type="button"
        disabled
        title="Freeze arrives in Sprint 4 with waveform history."
      >
        Freeze
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white"
        type="button"
        on:click={clearScope}
      >
        Clear Scope
      </button>
      <span class="text-gray-300 text-xs truncate">
        Ignored non-selected CCs: {ignoredCount}
      </span>
    </div>
  </div>
</div>
