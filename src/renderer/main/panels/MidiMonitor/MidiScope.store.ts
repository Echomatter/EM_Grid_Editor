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
  hasProcessedInput: boolean;
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
  let history: MidiCcScopePoint[] = [];
  let lastSeenCc: LastSeenCc | undefined = undefined;
  let ignoredCount = 0;
  let lastProcessedBatchId: MidiStreamItem["id"] | undefined = undefined;
  let hasProcessedInput = false;

  const store = writable<MidiCcScopeState>(buildState());

  function addBatch(items: (MidiStreamItem & { data: MidiData })[]) {
    if (items.length === 0) {
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
    history = [];
    lastSeenCc = undefined;
    ignoredCount = 0;
    lastProcessedBatchId = undefined;
    hasProcessedInput = false;
    publish();
  }

  function resetTrace(shouldPublish = true) {
    history = [];
    if (shouldPublish) {
      publish();
    }
  }

  function pushHistory(point: MidiCcScopePoint) {
    history = [...history, point].slice(-maxHistoryLength);
  }

  function publish() {
    store.set(buildState());
  }

  function buildState(): MidiCcScopeState {
    const historyValues = history.map((point) => point.value);
    const latestValue = history.length > 0 ? history[history.length - 1].value : undefined;
    const minValue = historyValues.length > 0 ? Math.min(...historyValues) : undefined;
    const maxValue = historyValues.length > 0 ? Math.max(...historyValues) : undefined;
    const rangeValue =
      minValue === undefined || maxValue === undefined ? "---" : maxValue - minValue;

    return {
      selectedChannel,
      selectedCc,
      learning,
      frozen,
      history: [...history],
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
      hasProcessedInput,
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
      return "Frozen";
    }

    if (learning) {
      return "Learning";
    }

    return selectedChannel && selectedCc ? "Recording" : "Waiting";
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
