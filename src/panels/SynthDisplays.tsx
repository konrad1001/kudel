import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import * as engine from "../engine";
import { fromDial, getParam, highpassOn, isActive, lowpassOn, oscKind, toDial, type NumberParam, type Param, type Value } from "../synth/controls";
import { drawEnvelope, drawFilter, drawHarmonics, drawLfo, drawWaves, filterNodeX, FOOT } from "../synth/draw";
import { enableEnvelope, enableLfo, envelopeOn, lfoOn, type ModTabSpec } from "../synth/mod";
import {
  envelopeShape,
  envelopeZoom,
  handleDial,
  nearestHandle,
  oscCycle,
  paintHarmonics,
  type EnvelopeHandle,
} from "../synth/shapes";
import { setSetting, setSettings, useSynth } from "../synth/synthStore";

// The Synth view's displays. Each draws from the patch's settings and drags them: a drag
// changes the same settings as the dials under it, so it's still the code's controls.

// A canvas filling its box, redrawn when its size or `deps` change.
function useCanvas(draw: (canvas: HTMLCanvasElement, width: number, height: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (ref.current && size.width > 0 && size.height > 0) draw(ref.current, size.width, size.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);
  return ref;
}

// Where a pointer is on the element, as fractions: x across, y up from the bottom.
function pointerAt(event: PointerEvent<HTMLElement>, footPx = 0): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height - footPx);
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

// Pointer handlers for a drag: `move` runs on press and on every move while pressed.
function dragHandlers(start: (event: PointerEvent<HTMLCanvasElement>) => void, move: (event: PointerEvent<HTMLCanvasElement>) => void) {
  return {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      start(event);
      move(event);
    },
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event);
    },
  };
}

const numberParam = (id: string) => getParam(id) as NumberParam;

// ---------------------------------------------------------------- oscillator

// The frames of the wavetable the patch plays, loaded on demand; null meanwhile.
function useFrames(s: string, n: number): Float32Array[] | null {
  const [frames, setFrames] = useState<{ key: string; frames: Float32Array[] } | null>(null);
  const key = `${s}:${n}`;
  useEffect(() => {
    const loading = engine.wavetableFrames(s, n);
    if (!loading) return;
    let live = true;
    loading.then(
      (loaded) => live && setFrames({ key, frames: loaded }),
      () => live && setFrames(null),
    );
    return () => {
      live = false;
    };
  }, [s, n, key]);
  return frames?.key === key ? frames.frames : null;
}

// The wave. A wavetable shows its frames stacked in perspective with the one its
// position plays highlighted: drag up and down to move through them (or use the slider
// beside it). A pulse's width drags across. Other synths are drawn, not dragged.
export function WaveDisplay() {
  const settings = useSynth((s) => s.settings);
  const kind = oscKind(String(settings.s));
  const frames = useFrames(String(settings.s), kind === "wavetable" ? Number(settings.n) : 0);
  const ref = useCanvas(
    (canvas, width, height) => {
      const current = oscCycle(settings, 1024, frames);
      drawWaves(canvas, width, height, {
        current,
        stack: kind === "wavetable" ? (frames ?? []) : [],
        position: Number(settings.wt),
        note: kind === "wavetable" && !frames ? "loading…" : undefined,
      });
    },
    [settings, frames],
  );
  const start = useRef<{ y: number; wt: number } | null>(null);
  const handlers =
    kind === "wavetable"
      ? dragHandlers(
          (event) => {
            start.current = { y: event.clientY, wt: Number(useSynth.getState().settings.wt) };
          },
          (event) => {
            const from = start.current;
            if (!from) return;
            const height = event.currentTarget.getBoundingClientRect().height;
            setSetting("wt", from.wt + (from.y - event.clientY) / Math.max(40, height * 0.6));
          },
        )
      : kind === "pulse"
        ? dragHandlers(
            () => {},
            (event) => setSetting("pw", pointerAt(event).x),
          )
        : {};
  const title =
    kind === "wavetable" ? "Drag up and down to move through the table (wt)" : kind === "pulse" ? "Drag across to set the pulse width (pw)" : undefined;
  return (
    <canvas
      ref={ref}
      className={kind === "wavetable" || kind === "pulse" ? "synth-display editable" : "synth-display"}
      title={title}
      {...handlers}
    />
  );
}

// A wavetable's position as a vertical slider: lift it from the first frame to the last.
export function PositionSlider() {
  const wt = Number(useSynth((s) => s.settings.wt));
  const ref = useRef<HTMLDivElement>(null);
  const set = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSetting("wt", 1 - (event.clientY - rect.top) / rect.height);
  };
  return (
    <div className="synth-position" title="Position (wt): drag up and down, double-click to reset">
      <div
        ref={ref}
        className="synth-position-track"
        role="slider"
        aria-label="Position"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={wt}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          set(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) set(event);
        }}
        onDoubleClick={() => setSetting("wt", 0)}
      >
        <div className="synth-position-fill" style={{ height: `${wt * 100}%` }} />
        <div className="synth-position-thumb" style={{ bottom: `${wt * 100}%` }} />
      </div>
      <div className="synth-value">{Math.round(wt * 100)} %</div>
    </div>
  );
}

// The harmonics' levels as bars; paint over them to draw a wave. Double-click resets.
export function HarmonicsDisplay() {
  const settings = useSynth((s) => s.settings);
  const levels = settings.partials as number[];
  const param = getParam("partials")!;
  const ref = useCanvas((canvas, width, height) => drawHarmonics(canvas, width, height, levels, isActive(param, settings)), [levels, settings]);
  const last = useRef<[number, number] | null>(null);
  const at = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const { x, y } = pointerAt(event, FOOT + 4);
    return [Math.min(levels.length - 1, Math.floor(x * levels.length)), y];
  };
  const handlers = dragHandlers(
    (event) => {
      last.current = at(event);
    },
    (event) => {
      const point = at(event);
      const current = useSynth.getState().settings.partials as number[];
      setSetting("partials", paintHarmonics(current, last.current ?? point, point));
      last.current = point;
    },
  );
  return (
    <canvas
      ref={ref}
      className="synth-display editable"
      title="Paint the harmonics' levels (partials); double-click to reset"
      {...handlers}
      onDoubleClick={() => setSetting("partials", param.default)}
    />
  );
}

// ---------------------------------------------------------------- filter

// Both filters' response, with a node for each: 1 the lowpass, 2 the highpass. Drag
// the node nearest the pointer: across for its frequency, up and down for its
// resonance. Dragging a node switches its filter on; double-clicking one switches it off.
const NODES = [
  { on: "lp", freq: "cutoff", res: "resonance", label: "1" },
  { on: "hp", freq: "hcutoff", res: "hresonance", label: "2" },
] as const;

type FilterNode = (typeof NODES)[number];

function nearestNode(event: { currentTarget: HTMLCanvasElement; clientX: number }): FilterNode {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const settings = useSynth.getState().settings;
  const distance = (node: FilterNode) => Math.abs(filterNodeX(Number(settings[node.freq]), rect.width) - x);
  // The highpass can't be used with the ladder, so its node isn't picked then.
  if (settings.ftype === "ladder") return NODES[0];
  return distance(NODES[0]) <= distance(NODES[1]) ? NODES[0] : NODES[1];
}

export function FilterDisplay() {
  const settings = useSynth((s) => s.settings);
  const ladder = settings.ftype === "ladder";
  const ref = useCanvas(
    (canvas, width, height) =>
      drawFilter(canvas, width, height, settings, [
        { label: "1", freq: Number(settings.cutoff), on: lowpassOn(settings) },
        { label: "2", freq: Number(settings.hcutoff), on: highpassOn(settings), disabled: ladder },
      ]),
    [settings],
  );
  const drag = useRef<{ node: FilterNode; y: number; res: number } | null>(null);
  const handlers = dragHandlers(
    (event) => {
      const node = nearestNode(event);
      const now = useSynth.getState().settings;
      if (now[node.on] !== "on") setSetting(node.on, "on");
      drag.current = { node, y: event.clientY, res: toDial(numberParam(node.res), Number(now[node.res])) };
    },
    (event) => {
      const from = drag.current;
      if (!from) return;
      setSetting(from.node.freq, fromDial(numberParam(from.node.freq), pointerAt(event).x));
      const height = event.currentTarget.getBoundingClientRect().height;
      // Resonance moves with the drag from where it was, so a click doesn't change it.
      setSetting(from.node.res, fromDial(numberParam(from.node.res), from.res + (from.y - event.clientY) / Math.max(40, height - FOOT)));
    },
  );
  return (
    <canvas
      ref={ref}
      className="synth-display editable"
      title={`Drag node 1 (lowpass) or 2 (highpass): across for frequency, up and down for resonance. Double-click a node to switch it off.${ladder ? " The ladder is a lowpass only, so the highpass is off with it." : ""}`}
      {...handlers}
      onDoubleClick={(event) => setSetting(nearestNode(event).on, "off")}
    />
  );
}

// ---------------------------------------------------------------- envelopes

// A mod tab's envelope. Drag a corner: the attack's peak sets the attack, the decay's
// corner the decay and sustain, the end the release. Dragging one that's off switches
// it on (enableEnvelope), so the drag is heard.
export function EnvelopeDisplay({ tab }: { tab: ModTabSpec }) {
  const settings = useSynth((s) => s.settings);
  const ids = tab.env!;
  const params = { attack: numberParam(ids.attack), decay: numberParam(ids.decay), release: numberParam(ids.release) };
  const dials = {
    attack: toDial(params.attack, Number(settings[ids.attack])),
    decay: toDial(params.decay, Number(settings[ids.decay])),
    release: toDial(params.release, Number(settings[ids.release])),
  };
  const sustain = ids.sustain ? Number(settings[ids.sustain]) : 0;
  // Fixed from the start of a drag to its end.
  const dragZoom = useRef<number | null>(null);
  const shape = envelopeShape(dials, sustain, dragZoom.current ?? envelopeZoom(dials));
  const active = envelopeOn(tab, settings);
  const amount = ids.amount ? `${ids.amount} ${settings[ids.amount]}` : undefined;
  const ref = useCanvas(
    (canvas, width, height) => drawEnvelope(canvas, width, height, shape, { active, hasSustain: !!ids.sustain, amount }),
    [settings, tab, active, shape.zoom],
  );
  const handle = useRef<EnvelopeHandle | null>(null);
  const [, setRefit] = useState(0);
  // The display's x runs over the canvas less 4px each side, as drawn.
  const xAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left - 4) / (rect.width - 8)));
  };
  const handlers = dragHandlers(
    (event) => {
      const { y } = pointerAt(event, FOOT + 4);
      dragZoom.current = shape.zoom;
      handle.current = nearestHandle(shape, xAt(event), y, !!ids.sustain);
      setSettings(enableEnvelope(tab, useSynth.getState().settings));
    },
    (event) => {
      const which = handle.current;
      if (!which) return;
      const now = useSynth.getState().settings;
      const live = envelopeShape(
        {
          attack: toDial(params.attack, Number(now[ids.attack])),
          decay: toDial(params.decay, Number(now[ids.decay])),
          release: toDial(params.release, Number(now[ids.release])),
        },
        sustain,
        dragZoom.current ?? 1,
      );
      const id = ids[which];
      setSetting(id, fromDial(params[which], handleDial(live, which, xAt(event))));
      if (which === "decay" && ids.sustain) setSetting(ids.sustain, pointerAt(event, FOOT + 4).y);
    },
  );
  const endDrag = () => {
    if (dragZoom.current === null) return;
    dragZoom.current = null;
    // Redraw at the zoom that fits the new times.
    setRefit((n) => n + 1);
  };
  return (
    <canvas
      ref={ref}
      className="synth-display editable"
      title="Drag the corners"
      {...handlers}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

// ---------------------------------------------------------------- LFOs

// A mod tab's LFO over a cycle (synced) or a second (in Hz). Drag up and down for its
// depth, and across for its rate (or, synced, through the per-cycle choices). Dragging
// one that's off switches it on.
export function LfoDisplay({ tab }: { tab: ModTabSpec }) {
  const settings = useSynth((s) => s.settings);
  const lfo = tab.lfo!;
  const synced = !!lfo.sync && !!lfo.switch && settings[lfo.switch] === "sync";
  const rateId = synced ? lfo.sync! : lfo.rate;
  const depthParam = numberParam(lfo.depth);
  const active = lfoOn(tab, settings);
  const ref = useCanvas(
    (canvas, width, height) =>
      drawLfo(canvas, width, height, {
        shape: lfo.shape ? String(settings[lfo.shape]) : (lfo.fixedShape ?? "sine"),
        skew: lfo.skew ? Number(settings[lfo.skew]) : 0.5,
        periods: Math.max(0.25, Number(settings[rateId])),
        depth: Number(settings[lfo.depth]) / depthParam.max,
        active,
        window: synced ? "1 cycle" : "1 s",
      }),
    [settings, tab, active],
  );
  const start = useRef<{ x: number; y: number; rate: number; depth: number } | null>(null);
  const handlers = dragHandlers(
    (event) => {
      setSettings(enableLfo(tab, useSynth.getState().settings));
      const now = useSynth.getState().settings;
      const rate = getParam(rateId)!;
      start.current = {
        x: event.clientX,
        y: event.clientY,
        rate: rate.kind === "number" ? toDial(rate, Number(now[rateId])) : choiceIndex(rate, now[rateId]),
        depth: toDial(depthParam, Number(now[lfo.depth])),
      };
    },
    (event) => {
      const from = start.current;
      if (!from) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const rate = getParam(rateId)!;
      const across = (event.clientX - from.x) / Math.max(40, rect.width);
      if (rate.kind === "number") setSetting(rateId, fromDial(rate, from.rate + across));
      else if (rate.kind === "choice") {
        const i = Math.round(from.rate + across * rate.options.length);
        setSetting(rateId, rate.options[Math.min(rate.options.length - 1, Math.max(0, i))].value);
      }
      setSetting(lfo.depth, fromDial(depthParam, from.depth + (from.y - event.clientY) / Math.max(40, rect.height - FOOT)));
    },
  );
  return <canvas ref={ref} className="synth-display editable" title="Drag: up and down for depth, across for rate" {...handlers} />;
}

// Where a value sits among a choice's options (the synced rates), or 0.
function choiceIndex(param: Param, value: Value): number {
  if (param.kind !== "choice") return 0;
  return Math.max(0, param.options.findIndex((o) => o.value === value));
}
