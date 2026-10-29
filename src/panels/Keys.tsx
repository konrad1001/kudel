import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import * as engine from "../engine";
import { getCommand } from "../commands/commands";
import {
  keyFor,
  useKeybindings,
  useKeyFor,
  withKey,
} from "../commands/keybindings";
import { keyboardArt } from "../keys/keyboardArt";
import { playKey, setSound, shiftOctaveBy, useKeys } from "../keys/keysStore";
import {
  formatBuffer,
  KEY_LETTERS,
  MAX_OCTAVE,
  MIN_OCTAVE,
  noteMidi,
} from "../keys/notes";

// Sideways scroll distance per octave; raise it to make scrolling less sensitive.
const WHEEL_STEP = 150;

// Two octaves and the C above, lettered where the computer keyboard plays.
const KEY_COUNT = 25;
const ART = keyboardArt(
  KEY_COUNT,
  Object.fromEntries(KEY_LETTERS.map((letter, semitone) => [semitone, letter])),
);

// The panel's keyboard. Letters play it only while it has focus (see "keysFocus").
// Focusing it starts audio, so the first key press is heard.
export function Keys() {
  return (
    <div
      className="keys"
      tabIndex={0}
      data-autofocus
      onFocus={engine.warmUpAudio}
    >
      <Toolbar />
      <Keyboard />
      <NoteBuffer />
    </div>
  );
}

function Toolbar() {
  const octave = useKeys((s) => s.octave);
  const sound = useKeys((s) => s.sound);
  const error = useKeys((s) => s.error);
  return (
    <div className="keys-toolbar">
      <span className="keys-field">
        oct
        <CommandButton
          command="keys.octaveDown"
          disabled={octave <= MIN_OCTAVE}
        >
          -
        </CommandButton>
        <span className="keys-octave">{octave}</span>
        <CommandButton command="keys.octaveUp" disabled={octave >= MAX_OCTAVE}>
          +
        </CommandButton>
      </span>
      <label className="keys-field">
        s
        <input
          className="keys-input keys-sound"
          spellCheck={false}
          placeholder="piano"
          value={sound}
          onChange={(event) => setSound(event.target.value)}
          onKeyDown={backToKeysOnEnter}
        />
      </label>
      {error ? (
        <span className="keys-error" title={error}>
          {error}
        </span>
      ) : (
        <KeyHints />
      )}
    </div>
  );
}

// Seconds per note. Typed text stays as typed until it's a usable number.
// function LengthField() {
//   const length = useKeys((s) => s.length);
//   const [text, setText] = useState(String(length));
//   useEffect(() => setText(String(length)), [length]);
//   return (
//     <label className="keys-field">
//       len
//       <input
//         className="keys-input keys-length"
//         inputMode="decimal"
//         spellCheck={false}
//         value={text}
//         onChange={(event) => {
//           setText(event.target.value);
//           const seconds = Number(event.target.value);
//           if (event.target.value.trim() && seconds > 0) setLength(seconds);
//         }}
//         onBlur={() => setText(String(length))}
//         onKeyDown={backToKeysOnEnter}
//       />
//       s
//     </label>
//   );
// }

// Enter in a field hands the letters back to the keyboard.
function backToKeysOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.currentTarget.closest<HTMLElement>(".keys")?.focus();
}

function Keyboard() {
  const octave = useKeys((s) => s.octave);
  const lit = useKeys((s) => s.lit);
  const low = noteMidi(octave, 0);

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.key;
    if (event.button === 0 && key !== undefined) playKey(Number(key));
  };

  // Scrolling sideways over the keys (or Shift+wheel) moves an octave per
  // WHEEL_STEP pixels: right goes up. Turning back starts the count again.
  const wheelTotal = useRef(0);
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!delta) return;
    if (Math.sign(delta) !== Math.sign(wheelTotal.current)) wheelTotal.current = 0;
    wheelTotal.current += delta;
    if (Math.abs(wheelTotal.current) < WHEEL_STEP) return;
    shiftOctaveBy(Math.sign(wheelTotal.current));
    wheelTotal.current = 0;
  };

  return (
    <div
      className="keys-board"
      aria-label="Keyboard"
      onMouseDown={onMouseDown}
      onWheel={onWheel}
    >
      {ART.map((row, r) => (
        <div key={r}>
          {row.map((run, i) =>
            run.key === null ? (
              <span key={i}>{run.text}</span>
            ) : (
              <span
                key={i}
                data-key={run.key}
                className={[
                  run.label && "keys-letter",
                  lit[low + run.key] && "lit",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {run.text}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

// A read-only field, so part of the line can be selected with the mouse and copied with
// Ctrl+C (in a text field that's the browser's copy, not keys.copy).
function NoteBuffer() {
  const buffer = useKeys((s) => s.buffer);
  const copied = useKeys((s) => s.copied);
  const fieldRef = useRef<HTMLInputElement>(null);
  const text = formatBuffer(buffer);

  // Keep the newest notes in view.
  useEffect(() => {
    const field = fieldRef.current;
    if (field) field.scrollLeft = field.scrollWidth;
  }, [buffer]);

  return (
    <div className="keys-buffer">
      <div className="keys-buffer-line">
        <span className="keys-quote">"</span>
        <input
          ref={fieldRef}
          className="keys-buffer-text"
          readOnly
          spellCheck={false}
          placeholder="..."
          value={text}
          // Sized to the text, so the closing quote follows it; long lines scroll.
          style={{ width: `${Math.max(text.length, 3)}ch` }}
        />
        <span className="keys-quote">"</span>
      </div>
      <CommandButton command="keys.copy" disabled={!buffer.length}>
        {copied ? "copied" : "copy"}
      </CommandButton>
      <CommandButton command="keys.clear" disabled={!buffer.length}>
        clear
      </CommandButton>
    </div>
  );
}

// The keys besides the letters, read from the keybindings: "n/m octave · x rest · …".
const HINTS: [commands: string[], label: string][] = [
  [["keys.octaveDown", "keys.octaveUp"], "octave"],
  [["keys.rest"], "rest"],
  [["keys.clear"], "clear"],
  [["keys.copy"], "copy"],
  [["view.focusEditor"], "editor"],
];

function KeyHints() {
  const bindings = useKeybindings((s) => s.bindings);
  const hints = HINTS.flatMap(([commands, label]) => {
    const keys = commands.map((id) => keyFor(bindings, id));
    return keys.every(Boolean)
      ? [`${keys.join("/").toLowerCase()} ${label}`]
      : [];
  });
  return <span className="keys-hint">{hints.join(" · ")}</span>;
}

// A [text] button that runs a command, with the command's label and key as its tooltip.
function CommandButton({
  command,
  disabled,
  children,
}: {
  command: string;
  disabled?: boolean;
  children: string;
}) {
  const key = useKeyFor(command);
  const label = getCommand(command)?.label ?? command;
  return (
    <button
      type="button"
      className="ascii-button"
      title={withKey(label, key)}
      aria-label={label}
      disabled={disabled}
      onClick={() => getCommand(command)?.run()}
    >
      [{children}]
    </button>
  );
}
