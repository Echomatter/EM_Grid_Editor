import { writable } from "svelte/store";
import type { MidiData, MidiStreamItem } from "./MidiMonitor.store";

export type MidiCcScopePoint = {
  id: MidiStreamItem["id"];
  time: number;
  channel: number;
  cc: number;
  value: number;
};

export type LastSeenCc = {
  channel: number;
  cc: number;
  value: number;
  sourceLabel: string;
  deviceName: string;
};

export type MidiCcScopeState = {
  selectedChannel: string;
  selectedCc: string;
  learning: boolean;
  frozen: boolean;
  history: MidiCcScopePoint[];
  lastSeenCc: LastSeenCc | undefined;
  ignoredCount: number;
  latestValue: number | undefined;
  minValue: number | undefined;
  maxValue: number | undefined;
  rangeValue: number | "---";
  points: string;
  latestLineY: number | undefined;
  selectedLabel: string;
  scopeStatus: string;
  statusHint: string;
  hasProcessedInput: boolean;
  inputDroppedCount: number;
  historyDroppedCount: number;
  overloadCount: number;
};

type MidiCcScopeOptions = {
  maxHistoryLength?: number;
  svgWidth?: number;
  svgHeight?: number;
};

const defaultOptions = {
  maxHistoryLength: 128,
  svgWidth: 320,
  svgHeight: 96,
};

export function createMidiCcScopeStore(options: MidiCcScopeOptions = {}) {
  const { maxHistoryLength, svgWidth, svgHeight } = {
    ...defaultOptions,
    ...options,
  };

  let selectedChannel = "";
  let selectedCc = "";
  let learning = true;
  let frozen = false;
  let lastSeenCc: LastSeenCc | undefined = undefined;
  let ignoredCount = 0;
  let lastProcessedBatchId: MidiStreamItem["id"] | undefined = undefined;
  let hasProcessedInput = false;
  let inputDroppedCount = 0;
  let historyDroppedCount = 0;

  const historyBuffer = createRingBuffer<MidiCcScopePoint>(maxHistoryLength);
  const store = writable<MidiCcScopeState>(buildState());

  function addBatch(
    items: (MidiStreamItem & { data: MidiData })[],
    droppedBeforeBatch = inputDroppedCount,
  ) {
    inputDroppedCount = Math.max(inputDroppedCount, droppedBeforeBatch);

    if (items.length === 0) {
      publish();
      return;
    }

    const batchTailId = items[items.length - 1].id;
    if (batchTailId === lastProcessedBatchId) {
      return;
    }

    for (const item of items) {
      handleIncoming(item);
    }

    lastProcessedBatchId = batchTailId;
    hasProcessedInput = true;
    publish();
  }

  function handleIncoming(item: MidiStreamItem & { data: MidiData }) {
    if (!isControlChange(item)) {
      return;
    }

    const channel = normalizeChannel(item.data.channel);
    const cc = clampCcNumber(item.data.params.p1.value);
    const value = clampMidiValue(item.data.params.p2.value);
    const sourceLabel = getDirectionLabel(item.data.direction);
    const deviceName = item.device?.name ?? "Unknown device";
    lastSeenCc = { channel, cc, value, sourceLabel, deviceName };

    if (learning || !selectedChannel || !selectedCc) {
      selectedChannel = String(channel);
      selectedCc = String(cc);
      learning = false;
      resetTrace(false);
    }

    if (!matchesSelection(channel, cc)) {
      ignoredCount += 1;
      return;
    }

    // Freeze is intentionally a display/trace freeze. The scope still records
    // lastSeenCc above so the user can see live traffic continues, but it does
    // not append points or move the visible waveform until resumed.
    if (frozen) {
      return;
    }

    if (
      historyBuffer.push({
        id: item.id,
        time: item.date,
        channel,
        cc,
        value,
      })
    ) {
      historyDroppedCount += 1;
    }
  }

  function setSelection(channel: string, cc: string) {
    selectedChannel = channel;
    selectedCc = cc;
    learning = !(selectedChannel && selectedCc);
    frozen = false;
    resetTrace(false);
    publish();
  }

  function learnNextCc() {
    selectedChannel = "";
    selectedCc = "";
    learning = true;
    frozen = false;
    resetTrace(false);
    publish();
  }

  function toggleFreeze() {
    frozen = !frozen;
    publish();
  }

  function clearScope() {
    resetTrace(false);
    ignoredCount = 0;
    publish();
  }

  function reset() {
    selectedChannel = "";
    selectedCc = "";
    learning = true;
    frozen = false;
    historyBuffer.clear();
    lastSeenCc = undefined;
    ignoredCount = 0;
    lastProcessedBatchId = undefined;
    hasProcessedInput = false;
    inputDroppedCount = 0;
    historyDroppedCount = 0;
    publish();
  }

  function resetTrace(shouldPublish = true) {
    historyBuffer.clear();
    historyDroppedCount = 0;
    if (shouldPublish) {
      publish();
    }
  }

  function publish() {
    store.set(buildState());
  }

  function buildState(): MidiCcScopeState {
    const history = historyBuffer.values();
    const historyValues = history.map((point) => point.value);
    const latestValue = history.length > 0 ? history[history.length - 1].value : undefined;
    const minValue = historyValues.length > 0 ? Math.min(...historyValues) : undefined;
    const maxValue = historyValues.length > 0 ? Math.max(...historyValues) : undefined;
    const rangeValue =
      minValue === undefined || maxValue === undefined ? "---" : maxValue - minValue;
    const overloadCount = inputDroppedCount + historyDroppedCount;

    return {
      selectedChannel,
      selectedCc,
      learning,
      frozen,
      history,
      lastSeenCc,
      ignoredCount,
      latestValue,
      minValue,
      maxValue,
      rangeValue,
      points: buildPolyline(history),
      latestLineY: latestValue === undefined ? undefined : valueToY(latestValue),
      selectedLabel: buildSelectedLabel(),
      scopeStatus: buildScopeStatus(),
      statusHint: buildStatusHint(overloadCount),
      hasProcessedInput,
      inputDroppedCount,
      historyDroppedCount,
      overloadCount,
    };
  }

  function buildSelectedLabel() {
    if (selectedChannel && selectedCc) {
      return `Ch ${selectedChannel} / CC ${selectedCc}`;
    }

    return learning ? "Learning next CC" : "No CC selected";
  }

  function buildScopeStatus() {
    if (frozen) {
      return "Frozen display";
    }

    if (learning) {
      return "Learning";
    }

    return selectedChannel && selectedCc ? "Recording" : "Waiting";
  }

  function buildStatusHint(overloadCount: number) {
    if (overloadCount > 0) {
      return `Newest samples win; ${overloadCount} older sample(s) dropped.`;
    }

    if (frozen) {
      return "Display frozen; live last-seen CC still updates.";
    }

    if (learning) {
      return "Learning from next live CC.";
    }

    if (selectedChannel && selectedCc) {
      return "Locked to selected CC.";
    }

    return "Waiting for CC selection.";
  }

  function buildPolyline(points: MidiCcScopePoint[]) {
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

  function isControlChange(item: MidiStreamItem & { data: MidiData }) {
    const commandValue = item.data.command.value;

    if (Number.isInteger(commandValue)) {
      return (commandValue & 0xf0) === 0xb0;
    }

    return (
      item.data.command.short === "CC" ||
      item.data.command.name === "Control Change"
    );
  }

  function matchesSelection(channel: number, cc: number) {
    return String(channel) === selectedChannel && String(cc) === selectedCc;
  }

  function normalizeChannel(rawChannel: number) {
    return Math.max(1, Math.min(16, rawChannel + 1));
  }

  function clampCcNumber(value: number) {
    return Math.max(0, Math.min(127, value));
  }

  function valueToY(value: number) {
    const normalizedValue = clampMidiValue(value) / 127;
    return roundForSvg(svgHeight - normalizedValue * svgHeight);
  }

  function clampMidiValue(value: number) {
    return Math.max(0, Math.min(127, value));
  }

  function getDirectionLabel(direction: string) {
    return direction === "REPORT" ? "RX" : "TX";
  }

  function roundForSvg(value: number) {
    return Number(value.toFixed(2));
  }

  return {
    subscribe: store.subscribe,
    addBatch,
    setSelection,
    learnNextCc,
    toggleFreeze,
    clearScope,
    reset,
  };
}

function createRingBuffer<T>(capacity: number) {
  const buffer = new Array<T>(capacity);
  let start = 0;
  let length = 0;

  return {
    push(value: T) {
      const dropped = length === capacity;
      const writeIndex = (start + length) % capacity;

      if (dropped) {
        buffer[start] = value;
        start = (start + 1) % capacity;
      } else {
        buffer[writeIndex] = value;
        length += 1;
      }

      return dropped;
    },
    values() {
      return Array.from({ length }, (_, index) => {
        return buffer[(start + index) % capacity];
      });
    },
    clear() {
      start = 0;
      length = 0;
    },
  };
}
