<script lang="ts">
  import {
    type MidiData,
    type MidiStreamItem,
  } from "./MidiMonitor.store";
  import { createMidiCcScopeStore } from "./MidiScope.store";

  export let incomingItems: (MidiStreamItem & { data: MidiData })[] = [];
  export let resetSignal = 0;
  export let droppedInputCount = 0;

  const channels = Array.from({ length: 16 }, (_, i) => i + 1);
  const ccNumbers = Array.from({ length: 128 }, (_, i) => i);
  const maxHistoryLength = 128;
  const svgWidth = 320;
  const svgHeight = 96;
  const centerLineY = svgHeight / 2;
  const viewBox = `0 0 ${svgWidth} ${svgHeight}`;
  const scope = createMidiCcScopeStore({
    maxHistoryLength,
    svgWidth,
    svgHeight,
  });

  let selectedChannel = "";
  let selectedCc = "";
  let lastProcessedBatchId: MidiStreamItem["id"] | undefined = undefined;
  let lastResetSignal = resetSignal;

  $: if (resetSignal !== lastResetSignal) {
    resetScopeFromParent();
  }

  $: if (incomingItems.length > 0) {
    const batchTailId = incomingItems[incomingItems.length - 1].id;
    if (batchTailId !== lastProcessedBatchId) {
      scope.addBatch(incomingItems, droppedInputCount);
      lastProcessedBatchId = batchTailId;
    }
  }

  function resetScopeFromParent() {
    scope.reset();
    selectedChannel = "";
    selectedCc = "";
    lastProcessedBatchId = undefined;
    lastResetSignal = resetSignal;
  }

  function armLearn() {
    selectedChannel = "";
    selectedCc = "";
    lastProcessedBatchId = undefined;
    scope.learnNextCc();
  }

  function toggleFreeze() {
    scope.toggleFreeze();
  }

  function clearScope() {
    scope.clearScope();
  }

  function handleManualSelection() {
    lastProcessedBatchId = undefined;
    scope.setSelection(selectedChannel, selectedCc);
  }

  $: if ($scope.selectedChannel !== selectedChannel) {
    selectedChannel = $scope.selectedChannel;
  }

  $: if ($scope.selectedCc !== selectedCc) {
    selectedCc = $scope.selectedCc;
  }

  $: stats = [
    { label: "Channel", value: $scope.selectedChannel || "---" },
    { label: "CC", value: $scope.selectedCc || "---" },
    { label: "Latest", value: $scope.latestValue ?? "---" },
    { label: "Range", value: $scope.rangeValue },
  ];
</script>

<div class="border-gray-700 border rounded flex flex-col mb-4 overflow-hidden">
  <div class="flex flex-row items-center justify-between bg-secondary px-2 py-1 gap-2">
    <span class="text-white truncate">CC Scope</span>
    <span class="text-gray-300 text-xs truncate">{$scope.selectedLabel}</span>
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
          {$scope.lastSeenCc
            ? `${$scope.lastSeenCc.sourceLabel} ${$scope.lastSeenCc.deviceName}: Ch ${$scope.lastSeenCc.channel} / CC ${$scope.lastSeenCc.cc} = ${$scope.lastSeenCc.value}`
            : "---"}
        </span>
      </div>
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
        <span class="bg-secondary px-1 truncate text-xs">Min</span>
        <span class="px-2 truncate">{$scope.minValue ?? "---"}</span>
      </div>
      <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
        <span class="bg-secondary px-1 truncate text-xs">Max</span>
        <span class="px-2 truncate">{$scope.maxValue ?? "---"}</span>
      </div>
    </div>

    <svg
      class="w-full h-24 bg-secondary rounded border border-gray-700"
      viewBox={viewBox}
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

      {#if $scope.points}
        <polyline
          points={$scope.points}
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

      {#if $scope.latestLineY !== undefined}
        <line
          x1="0"
          y1={$scope.latestLineY}
          x2={svgWidth}
          y2={$scope.latestLineY}
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
        Learn Next Live CC
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 {$scope.frozen
          ? 'text-yellow-400'
          : 'text-white'}"
        type="button"
        on:click={toggleFreeze}
      >
        {$scope.frozen ? "Resume Display" : "Freeze Display"}
      </button>
      <button
        class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white"
        type="button"
        on:click={clearScope}
      >
        Clear Scope
      </button>
      <span class="text-gray-300 text-xs truncate">
        {$scope.scopeStatus} · Samples {$scope.history.length}/{maxHistoryLength} · Ignored {$scope.ignoredCount} · Dropped {$scope.overloadCount}
      </span>
    </div>

    <div class="text-gray-300 text-xs truncate">{$scope.statusHint}</div>
  </div>
</div>
