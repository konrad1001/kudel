import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as engine from "../engine";
import {
  addRow,
  clearRow,
  hear,
  open,
  remove,
  removeRow,
  setBank,
  setName,
  setRowSound,
  setStep,
  stopPreview,
  useDrums,
} from "../drums/drumsStore";
import { drumBanks, isSoundName, loopCode, soundExists, STEPS } from "../drums/loop";
import { identifierFor } from "../synth/patch";
import { useSounds } from "../sounds/soundsStore";
import { CommandButton, nameWarning } from "./CommandButton";
import { dragCode, SavedList } from "./SavedList";

// The Drums view: a 16-step grid, a row per sound. The loop is heard with play (a
// preview outside the pattern) and reaches the code as text: copied, or dragged into
// the editor, as one s("…") per row.
export function Drums() {
  // The preview is part of the view: leaving it stops the loop.
  useEffect(() => stopPreview, []);
  return (
    <div className="drums" tabIndex={0} data-autofocus onFocus={engine.warmUpAudio}>
      <Toolbar />
      <div className="drums-body">
        <section className="drums-saved">
          <div className="synth-title">saved</div>
          <SavedLoops />
        </section>
        <Grid />
      </div>
    </div>
  );
}

function SavedLoops() {
  const saved = useDrums((s) => s.saved);
  const name = useDrums((s) => s.name);
  return <SavedList items={saved} current={name} codeFor={loopCode} onOpen={open} onRemove={remove} empty="[save] keeps a loop here" />;
}

function Toolbar() {
  const name = useDrums((s) => s.name);
  const bank = useDrums((s) => s.bank);
  const rows = useDrums((s) => s.rows);
  const playing = useDrums((s) => s.playing);
  const error = useDrums((s) => s.error);
  const copied = useDrums((s) => s.copied);
  const justSaved = useDrums((s) => s.justSaved);
  const sounds = useSounds((s) => s.sounds);
  const banks = useMemo(() => drumBanks(sounds), [sounds]);
  const code = loopCode({ name, bank, rows });
  const warning = nameWarning(name);
  return (
    <div className="drums-toolbar">
      <span className="drums-mark" />
      <input
        className="synth-input synth-name"
        spellCheck={false}
        aria-label="Loop name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={backToPanelOnEnter}
      />
      <CommandButton command="drums.save">{justSaved ? "saved" : "save"}</CommandButton>
      <CommandButton command="drums.copy">{copied ? "copied" : "copy"}</CommandButton>
      <span className="synth-chip" draggable onDragStart={(event) => dragCode(event, code)} title={code}>
        ⠿ $: {identifierFor(name)}
      </span>
      <CommandButton command="drums.clear">clear</CommandButton>
      <label className="drums-field">
        kit
        <select className="synth-select drums-bank" value={bank} onChange={(event) => setBank(event.target.value)} title="bank: the drum machine the rows play">
          <option value="">default</option>
          {banks.map((b) => (
            <option key={b}>{b}</option>
          ))}
          {/* A saved loop's bank that isn't loaded (yet) stays selectable. */}
          {bank && !banks.includes(bank) && <option>{bank}</option>}
        </select>
      </label>
      <CommandButton command="drums.playStop">{playing ? "stop" : "play"}</CommandButton>
      {(error ?? warning) && (
        <span className={error ? "synth-error" : "synth-warning"} title={error ?? warning ?? ""}>
          {error ?? warning}
        </span>
      )}
    </div>
  );
}

// Enter in a field hands the keys back to the panel (Space plays).
function backToPanelOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.currentTarget.closest<HTMLElement>(".drums")?.focus();
}

const STEP_NUMBERS = Array.from({ length: STEPS }, (_, i) => i);

// The steps from one to another, both included, in either direction.
const stepsBetween = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => a + Math.sign(b - a) * i);

// The steps, a row per sound. Press a step to turn it on or off and drag across others
// to do the same to them.
function Grid() {
  const rows = useDrums((s) => s.rows);
  const bank = useDrums((s) => s.bank);
  const playhead = useDrums((s) => s.playhead);
  const sounds = useSounds((s) => s.sounds);
  const names = useMemo(() => new Set(sounds.map((sound) => sound.name)), [sounds]);
  // What a drag sets each step it crosses to while the button is down, and the last
  // step it set (a fast drag can skip steps; those between are set too).
  const paint = useRef<{ on: boolean; row: number; step: number } | null>(null);
  useEffect(() => {
    const end = () => {
      paint.current = null;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  const onDown = (event: PointerEvent, row: number, step: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const on = !useDrums.getState().rows[row].steps[step];
    paint.current = { on, row, step };
    setStep(row, step, on);
  };
  const onEnter = (event: PointerEvent, row: number, step: number) => {
    const last = paint.current;
    if (!last || !(event.buttons & 1)) return;
    const from = last.row === row ? last.step : step;
    for (const s of stepsBetween(from, step)) setStep(row, s, last.on);
    paint.current = { ...last, row, step };
  };

  return (
    <div className="drums-grid" role="grid" aria-label="Drum steps">
      <div className="drums-row drums-numbers" role="row">
        <span className="drums-sound" />
        {STEP_NUMBERS.map((step) => (
          <span key={step} className={step % 4 === 0 ? "drums-number beat" : "drums-number"}>
            {step % 4 === 0 ? step / 4 + 1 : "·"}
          </span>
        ))}
        <span className="drums-row-end" />
      </div>
      {rows.map((row, r) => (
        <div key={r} className="drums-row" role="row">
          <SoundField index={r} sound={row.sound} missing={isSoundName(row.sound) && sounds.length > 0 && !soundExists(names, row.sound, bank)} />
          {row.steps.map((on, step) => (
            <span
              key={step}
              role="gridcell"
              aria-selected={on}
              className={["drums-step", on && "on", step % 4 === 0 && "beat", step === playhead && "playhead"].filter(Boolean).join(" ")}
              onPointerDown={(event) => onDown(event, r, step)}
              onPointerEnter={(event) => onEnter(event, r, step)}
            />
          ))}
          <span className="drums-row-end">
            <button type="button" className="ascii-button" title="Clear this row" aria-label={`Clear ${row.sound}`} onClick={() => clearRow(r)}>
              -
            </button>
            <button type="button" className="ascii-button" title="Remove this row" aria-label={`Remove ${row.sound}`} onClick={() => removeRow(r)}>
              x
            </button>
          </span>
        </div>
      ))}
      <AddRow />
    </div>
  );
}

// A row's sound, editable: a name, or name:n for one of its samples. ▸ plays it.
function SoundField({ index, sound, missing }: { index: number; sound: string; missing: boolean }) {
  const valid = isSoundName(sound);
  return (
    <span className="drums-sound">
      <button type="button" className="ascii-button drums-hear" title={`Play ${sound}`} aria-label={`Play ${sound}`} onClick={() => hear(sound)}>
        ▸
      </button>
      <input
        className={["synth-input", "drums-sound-input", !valid && "invalid", missing && "missing"].filter(Boolean).join(" ")}
        spellCheck={false}
        aria-label="Sound"
        value={sound}
        title={!valid ? "Not a sound name: letters, digits, _, and :n for a sample number" : missing ? "No sound of this name in this kit" : "s: the sound this row plays"}
        onChange={(event) => setRowSound(index, event.target.value)}
        onKeyDown={backToPanelOnEnter}
      />
    </span>
  );
}

// A field for another row's sound, added with Enter or +.
function AddRow() {
  const [text, setText] = useState("");
  const add = () => {
    if (text.trim() && addRow(text)) setText("");
  };
  return (
    <div className="drums-row drums-add">
      <span className="drums-sound">
        <span className="drums-hear" />
        <input
          className="synth-input drums-sound-input"
          spellCheck={false}
          placeholder="+ sound"
          aria-label="Add a row for a sound"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
        />
      </span>
      <button type="button" className="ascii-button" onClick={add} disabled={!text.trim()}>
        [add]
      </button>
    </div>
  );
}
