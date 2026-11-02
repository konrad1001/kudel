import { useKeyFor, withKey } from "../commands/keybindings";
import { activateTab } from "../files/actions";
import { tabTitle } from "../files/tabs";
import { useTabs } from "../files/tabsStore";
import { cycleText, loadingText, tempoText } from "../status/format";
import { revealError, useStatus } from "../status/statusStore";
import { useTransport } from "../status/useTransport";

// The strip along the bottom of the window: whether sound is running and from which
// tab, whether that tab has changed since it was evaluated, errors, and on the right
// sample loading, the cycle, the tempo and the audio output.
export function StatusBar() {
  const transport = useTransport();
  return (
    <footer className="status-bar">
      <PlayState started={transport.started} evaluating={transport.evaluating} />
      <ErrorState />
      <div className="status-right">
        {transport.loading > 0 && <span className="status-item">{loadingText(transport.loading)}</span>}
        {transport.started && (
          <span className="status-item" title="Current cycle">
            cycle {cycleText(transport.cycle)}
          </span>
        )}
        <span className="status-item" title="Tempo (bpm at four beats a cycle)">
          {tempoText(transport.cps)}
        </span>
        <AudioState state={transport.audio} />
      </div>
    </footer>
  );
}

// Playing or stopped, the playing tab, and whether it was edited since. Flashes on each
// successful evaluation.
function PlayState({ started, evaluating }: { started: boolean; evaluating: boolean }) {
  const playing = useTabs((s) => s.tabs.find((tab) => tab.id === s.playingId));
  const evaluations = useStatus((s) => s.evaluations);
  const edited = useStatus((s) => s.edited && s.evaluatedDoc === playing?.id);
  const playKey = useKeyFor("run.play");

  return (
    <>
      <span
        // A new key restarts the flash animation.
        key={evaluations}
        className={[
          "status-item",
          "status-play",
          started && "playing",
          evaluations > 0 && "status-flash",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {evaluating ? "… evaluating" : started ? "▶ playing" : "■ stopped"}
      </span>
      {started && playing && (
        <button type="button" className="status-item status-button" title="Show the playing tab" onClick={() => activateTab(playing.id)}>
          {tabTitle(playing)}
        </button>
      )}
      {started && edited && (
        <span className="status-item status-edited" title={withKey("Edited since it was evaluated; evaluate", playKey)}>
          ● not evaluated
        </span>
      )}
    </>
  );
}

// The current error, short; the error bar above has it in full.
function ErrorState() {
  const error = useStatus((s) => s.error);
  const revealKey = useKeyFor("run.revealError");
  if (!error) return null;
  const at = error.at;
  const text = at ? `✗ error on line ${at.line}` : "✗ error";
  return at ? (
    <button type="button" className="status-item status-button status-error" title={withKey(error.message, revealKey)} onClick={revealError}>
      {text}
    </button>
  ) : (
    <span className="status-item status-error" title={error.message}>
      {text}
    </span>
  );
}

const AUDIO_TEXT: Record<AudioContextState, string> = {
  running: "audio on",
  suspended: "audio off",
  closed: "audio closed",
  // The system took the output away (another app, a device change).
  interrupted: "audio interrupted",
};

// The AudioContext starts suspended and runs from the first play or audition.
function AudioState({ state }: { state: AudioContextState | null }) {
  const title = state === "running" ? "Audio output is running" : "Audio starts with the first play or audition";
  return (
    <span className={state === "running" ? "status-item" : "status-item status-dim"} title={title}>
      {state ? AUDIO_TEXT[state] : "audio off"}
    </span>
  );
}
