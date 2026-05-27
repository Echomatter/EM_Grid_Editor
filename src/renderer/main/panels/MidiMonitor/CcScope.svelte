<script lang="ts">
  const placeholderStats = [
    { label: "Channel", value: "Learn" },
    { label: "CC", value: "---" },
    { label: "Latest", value: "---" },
    { label: "Range", value: "---" },
  ];
</script>

<div class="border-gray-700 border rounded flex flex-col mb-4 overflow-hidden">
  <div class="flex flex-row items-center justify-between bg-secondary px-2 py-1">
    <span class="text-white truncate">CC Scope</span>
    <span class="text-gray-300 text-xs truncate">placeholder</span>
  </div>

  <div class="flex flex-col gap-3 p-3 text-white">
    <div class="grid grid-cols-4 gap-2 text-center">
      {#each placeholderStats as stat}
        <div class="border-gray-700 border rounded flex flex-col overflow-hidden">
          <span class="bg-secondary px-1 truncate text-xs">{stat.label}</span>
          <span class="px-2 truncate">{stat.value}</span>
        </div>
      {/each}
    </div>

    <svg
      class="w-full h-24 bg-secondary rounded border border-gray-700"
      viewBox="0 0 320 96"
      role="img"
      aria-label="MIDI CC scope placeholder waveform"
    >
      <line x1="0" y1="48" x2="320" y2="48" stroke="currentColor" opacity="0.25" />
      <polyline
        points="0,70 32,64 64,48 96,30 128,26 160,42 192,66 224,72 256,54 288,34 320,28"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>

    <div class="flex flex-row gap-2">
      <button class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white" type="button">
        Learn
      </button>
      <button class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white" type="button">
        Freeze
      </button>
      <button class="bg-secondary border border-gray-700 rounded px-3 py-1 text-white" type="button">
        Clear Scope
      </button>
    </div>
  </div>
</div>
