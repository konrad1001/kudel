import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import * as engine from "../engine";
import { getCommand } from "../commands/commands";
import { useKeyFor, withKey } from "../commands/keybindings";
import { useSounds } from "../sounds/soundsStore";
import {
  formatValue,
  fromDial,
  getParam,
  hasParam,
  isActive,
  oscKind,
  SYNTH_SOUNDS,
  toDial,
  type ChoiceParam,
  type NumberParam,
} from "../synth/controls";
import { identifierFor, isReserved, patchCode, type Patch } from "../synth/patch";
import {
  open,
  play,
  remove,
  reset,
  resetSetting,
  setLength,
  setName,
  setSetting,
  shiftNoteOctave,
  setNote,
  showEnvelope,
  showOscView,
  toggleEffect,
  useSynth,
} from "../synth/synthStore";
import { EnvelopeDisplay, FilterDisplay, HarmonicsDisplay, PositionSlider, WaveDisplay } from "./SynthDisplays";
import type { EnvelopeKind } from "../synth/shapes";

// The Synth view, laid out like a hardware synth: saved sounds, then oscillator, filter,
// envelopes, effects and output side by side, each with a display that can be dragged
// and dials under it. Every dial is a Strudel control. The patch is heard with play and
// reaches the code as text: copied, or dragged into the editor.
export function Synth() {
  return (
    <div className="synth" tabIndex={0} data-autofocus onFocus={engine.warmUpAudio}>
      <Toolbar />
      <div className="synth-columns">
        <Saved />
        <OscColumn />
        <FilterColumn />
        <EnvelopeColumn />
        <EffectsColumn />
        <OutputColumn />
      </div>
    </div>
  );
}

// Dragging a patch carries its code as plain text, which CodeMirror inserts where it's
// dropped, as one undoable change.
function dragCode(event: DragEvent, patch: Patch) {
  event.dataTransfer.setData("text/plain", patchCode(patch));
  event.dataTransfer.effectAllowed = "copy";
}

// ---------------------------------------------------------------- toolbar

function Toolbar() {
  const name = useSynth((s) => s.name);
  const error = useSynth((s) => s.error);
  const copied = useSynth((s) => s.copied);
  const justSaved = useSynth((s) => s.justSaved);
  const id = identifierFor(name);
  const warning = isReserved(id)
    ? `"${id}" is a JavaScript keyword; rename it`
    : shadows(id)
      ? `"${id}" hides Strudel's ${id} in code that declares it`
      : null;
  return (
    <div className="synth-toolbar">
      <span className="synth-mark" />
      <input
        className="synth-input synth-name"
        spellCheck={false}
        aria-label="Sound name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={backToPanelOnEnter}
      />
      <CommandButton command="synth.save">{justSaved ? "saved" : "save"}</CommandButton>
      <CommandButton command="synth.copy">{copied ? "copied" : "copy"}</CommandButton>
      <CodeChip />
      <button type="button" className="ascii-button" title="Start again from the defaults" onClick={reset}>
        [reset]
      </button>
      {(error ?? warning) && (
        <span className={error ? "synth-error" : "synth-warning"} title={error ?? warning ?? ""}>
          {error ?? warning}
        </span>
      )}
    </div>
  );
}

// The patch as code: hover to read it, drag it into the editor.
function CodeChip() {
  const name = useSynth((s) => s.name);
  const settings = useSynth((s) => s.settings);
  const patch = { name, settings };
  return (
    <span className="synth-chip" draggable onDragStart={(event) => dragCode(event, patch)} title={patchCode(patch)}>
      ⠿ .set({identifierFor(name)})
    </span>
  );
}

// Whether a const of this name would hide something Strudel's code can use (a
// function or pattern on the global scope, like saw or note).
function shadows(id: string): boolean {
  const value = (globalThis as Record<string, unknown>)[id];
  return value !== undefined && (typeof value === "function" || typeof value === "object");
}

// Enter in a field hands the keys back to the panel (Space plays).
function backToPanelOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.currentTarget.closest<HTMLElement>(".synth")?.focus();
}

// ---------------------------------------------------------------- columns

function Column({ className, head, children }: { className: string; head: ReactNode; children: ReactNode }) {
  return (
    <section className={`synth-column ${className}`}>
      <div className="synth-head">{head}</div>
      {children}
    </section>
  );
}

function Saved() {
  const saved = useSynth((s) => s.saved);
  const name = useSynth((s) => s.name);
  return (
    <Column className="synth-saved" head={<span className="synth-title">saved</span>}>
      <ul className="synth-saved-list">
        {saved.map((patch) => (
          <li
            key={patch.name}
            className={patch.name === name ? "synth-saved-item current" : "synth-saved-item"}
            draggable
            onDragStart={(event) => dragCode(event, patch)}
            onClick={() => open(patch.name)}
            title={`Click to edit, drag into the code\n\n${patchCode(patch)}`}
          >
            <span className="synth-saved-name">{patch.name}</span>
            <button
              type="button"
              className="ascii-button synth-remove"
              aria-label={`Remove ${patch.name}`}
              title="Remove from saved"
              onClick={(event) => {
                event.stopPropagation();
                remove(patch.name);
              }}
            >
              x
            </button>
          </li>
        ))}
      </ul>
      {saved.length === 0 && <div className="synth-dim">[save] keeps a sound here</div>}
    </Column>
  );
}

// The position (wt) is the slider beside the wave.
const OSC_DIALS = ["n", "warp", "warpmode", "pw", "unison", "detune", "spread", "noise", "fmi", "fmh"];

function OscColumn() {
  const settings = useSynth((s) => s.settings);
  const view = useSynth((s) => s.oscView);
  const partials = getParam("partials")!;
  const hasHarmonics = hasParam(partials, settings) && settings.s !== "sine";
  const showHarmonics = hasHarmonics && (view === "harmonics" || oscKind(String(settings.s)) === "additive");
  return (
    <Column
      className="synth-osc"
      head={
        <>
          <span className="synth-title">osc</span>
          <Choice id="s" />
          <span className="synth-tabs">
            <Tab selected={!showHarmonics} onClick={() => showOscView("wave")}>
              wave
            </Tab>
            <Tab selected={showHarmonics} disabled={!hasHarmonics} onClick={() => showOscView("harmonics")}>
              harmonics
            </Tab>
          </span>
        </>
      }
    >
      {showHarmonics ? (
        <HarmonicsDisplay />
      ) : (
        <div className="synth-wave">
          <WaveDisplay />
          {oscKind(String(settings.s)) === "wavetable" && <PositionSlider />}
        </div>
      )}
      <Dials ids={OSC_DIALS} />
    </Column>
  );
}

function FilterColumn() {
  return (
    <Column
      className="synth-filter"
      head={
        <>
          <span className="synth-title">filter</span>
          <Switch id="lp" label="1 lp" />
          <Switch id="hp" label="2 hp" />
          <Choice id="ftype" />
        </>
      }
    >
      <FilterDisplay />
      <Dials ids={["cutoff", "resonance", "hcutoff", "hresonance", "drive", "lpenv"]} />
    </Column>
  );
}

const ENVELOPE_DIALS: Record<EnvelopeKind, string[]> = {
  amp: ["attack", "decay", "sustain", "release"],
  filter: ["lpattack", "lpdecay", "lpsustain", "lprelease", "lpenv"],
  pitch: ["pattack", "pdecay", "prelease", "penv", "vib", "vibmod"],
};

function EnvelopeColumn() {
  const envelope = useSynth((s) => s.envelope);
  return (
    <Column
      className="synth-envelope"
      head={
        <span className="synth-tabs">
          {(["amp", "filter", "pitch"] as const).map((kind) => (
            <Tab key={kind} selected={envelope === kind} onClick={() => showEnvelope(kind)}>
              {kind}
            </Tab>
          ))}
        </span>
      }
    >
      <EnvelopeDisplay kind={envelope} />
      <Dials ids={ENVELOPE_DIALS[envelope]} />
    </Column>
  );
}

function EffectsColumn() {
  return (
    <Column className="synth-effects" head={<span className="synth-title">effects</span>}>
      <Effect id="delay" title="delay" choice="delaysync" dials={["delayfeedback", "delay"]} />
      <Effect id="room" title="reverb" dials={["roomsize", "roomlp", "room"]} />
    </Column>
  );
}

// An effect switched on by its checkbox; its mix dial is the same switch, at 0 it's off.
function Effect({ id, title, choice, dials }: { id: string; title: string; choice?: string; dials: string[] }) {
  const on = useSynth((s) => Number(s.settings[id]) > 0);
  return (
    <div className={on ? "synth-effect" : "synth-effect off"}>
      <div className="synth-effect-head">
        <label className="synth-check">
          <input type="checkbox" checked={on} onChange={() => toggleEffect(id)} />
          {title}
        </label>
        {choice && <Choice id={choice} />}
      </div>
      <Dials ids={dials} />
    </div>
  );
}

function OutputColumn() {
  const note = useSynth((s) => s.note);
  return (
    <Column className="synth-output" head={<span className="synth-title">output</span>}>
      <Dials ids={["gain", "pan"]} />
      <button type="button" className="synth-pad" title={withKey("Play Synth", useKeyFor("synth.play"))} onClick={play}>
        {note || "c3"}
      </button>
      <div className="synth-note-row">
        <button type="button" className="ascii-button" aria-label="Octave down" onClick={() => shiftNoteOctave(-1)}>
          -
        </button>
        <input
          className="synth-input synth-note"
          spellCheck={false}
          aria-label="Note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={backToPanelOnEnter}
        />
        <button type="button" className="ascii-button" aria-label="Octave up" onClick={() => shiftNoteOctave(1)}>
          +
        </button>
      </div>
      <LengthField />
    </Column>
  );
}

// Seconds the note is held. Typed text stays as typed until it's a usable number.
function LengthField() {
  const value = useSynth((s) => s.length);
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="synth-note-row synth-dim-label">
      len
      <input
        className="synth-input synth-length"
        inputMode="decimal"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setLength(Number(event.target.value));
        }}
        onBlur={() => setText(String(value))}
        onKeyDown={backToPanelOnEnter}
      />
      s
    </label>
  );
}

// A checkbox for an on/off setting (the filters).
function Switch({ id, label }: { id: string; label: string }) {
  const on = useSynth((s) => s.settings[id] === "on");
  const disabled = useSynth((s) => id === "hp" && s.settings.ftype === "ladder");
  return (
    <label className="synth-check" title={disabled ? "The ladder is a lowpass only" : undefined}>
      <input type="checkbox" checked={on && !disabled} disabled={disabled} onChange={() => setSetting(id, on ? "off" : "on")} />
      {label}
    </label>
  );
}

function Tab({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={selected ? "synth-tab selected" : "synth-tab"} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- dials

// The dials of these settings that the oscillator has, in a grid; settings that aren't
// written right now are greyed out.
function Dials({ ids }: { ids: string[] }) {
  const settings = useSynth((s) => s.settings);
  const params = ids.map((id) => getParam(id)!).filter((p) => hasParam(p, settings));
  return (
    <div className="synth-dials">
      {params.map((param) => (
        <div key={param.id} className={isActive(param, settings) ? "synth-control" : "synth-control inactive"}>
          <div className="synth-label" title={param.id}>
            {param.label}
          </div>
          {param.kind === "number" ? <Dial param={param} /> : <Choice id={param.id} />}
        </div>
      ))}
    </div>
  );
}

// Pixels of drag for the whole range; Shift for fine steps.
const DRAG_RANGE = 300;
const FINE = 0.2;
const WHEEL_STEP = 0.02;

// A horizontal bar: drag it (up or right raises), scroll over it, double-click to reset.
function Dial({ param: base }: { param: NumberParam }) {
  // The table dial goes up to the wavetable's last table.
  const tables = useSounds((s) => (base.id === "n" ? s.sounds.find((sound) => sound.name === useSynth.getState().settings.s)?.count ?? 1 : 1));
  const param = base.id === "n" ? { ...base, max: Math.max(1, tables - 1) } : base;
  const value = Number(useSynth((s) => s.settings[param.id]));
  const dial = toDial(param, value);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dial: number } | null>(null);
  const paramRef = useRef(param);
  paramRef.current = param;

  // Not React's onWheel: it's passive, and the panel would scroll as well.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const p = paramRef.current;
      const step = (event.shiftKey ? WHEEL_STEP * FINE : WHEEL_STEP) * -Math.sign(event.deltaY || -event.deltaX);
      const current = Number(useSynth.getState().settings[p.id]);
      setSetting(p.id, fromDial(p, toDial(p, current) + step));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, dial };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const moved = (event.clientX - start.x - (event.clientY - start.y)) / DRAG_RANGE;
    setSetting(param.id, fromDial(param, start.dial + moved * (event.shiftKey ? FINE : 1)));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Bipolar dials (envelope amounts) fill from their middle.
  const zero = param.min < 0 ? toDial(param, 0) : 0;
  const left = Math.min(zero, dial);
  const width = Math.abs(dial - zero);

  return (
    <>
      <div
        ref={ref}
        className="synth-bar"
        role="slider"
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        title={`${param.id}: drag or scroll (Shift for fine), double-click to reset`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => resetSetting(param.id)}
      >
        <div className="synth-fill" style={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 2)}%` }} />
      </div>
      <div className="synth-value">{formatValue(param, value)}</div>
    </>
  );
}

function Choice({ id }: { id: string }) {
  const param = getParam(id) as ChoiceParam;
  const value = useSynth((s) => s.settings[id]);
  const active = useSynth((s) => isActive(param, s.settings));
  return (
    <select
      className={active ? "synth-select" : "synth-select inactive"}
      title={id}
      aria-label={param.label}
      value={String(value)}
      onChange={(event) => {
        // Option values are strings; give numeric choices (delay time) their number back.
        const picked = param.options.find((o) => String(o.value) === event.target.value);
        setSetting(id, picked ? picked.value : event.target.value);
      }}
    >
      {id === "s" ? (
        <SoundOptions current={String(value)} />
      ) : (
        param.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))
      )}
    </select>
  );
}

// The synth waveforms, then the loaded wavetables.
function SoundOptions({ current }: { current: string }) {
  const sounds = useSounds((s) => s.sounds);
  const tables = sounds
    .filter((sound) => sound.type === "wavetable")
    .map((sound) => sound.name)
    .sort();
  const known = SYNTH_SOUNDS.includes(current) || tables.includes(current);
  return (
    <>
      <optgroup label="synths">
        {SYNTH_SOUNDS.map((name) => (
          <option key={name} value={name}>
            {name === "user" ? "user (additive)" : name}
          </option>
        ))}
      </optgroup>
      <optgroup label="wavetables">
        {tables.map((name) => (
          <option key={name}>{name}</option>
        ))}
        {/* A saved patch's wavetable that isn't loaded (yet) stays selectable. */}
        {!known && <option>{current}</option>}
      </optgroup>
    </>
  );
}

// A [text] button that runs a command, with the command's label and key as its tooltip.
function CommandButton({ command, children }: { command: string; children: ReactNode }) {
  const key = useKeyFor(command);
  const label = getCommand(command)?.label ?? command;
  return (
    <button
      type="button"
      className="ascii-button"
      title={withKey(label, key)}
      aria-label={label}
      onClick={() => getCommand(command)?.run()}
    >
      [{children}]
    </button>
  );
}
