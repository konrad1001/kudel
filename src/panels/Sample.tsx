import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import * as engine from "../engine";
import { getCommand } from "../commands/commands";
import { useKeyFor, withKey } from "../commands/keybindings";
import { baseName, dirName } from "../files/paths";
import { drawOverlay, drawWave } from "../waveform/draw";
import {
  infoText,
  playheadAt,
  scrollView,
  spanBetween,
  timeAt,
  timeText,
  wheelAction,
  type Span,
} from "../waveform/waveform";
import {
  dragSelection,
  playFrom,
  sampleData,
  select,
  selectClipCode,
  setView,
  toggleLoop,
  togglePlay,
  useWaveform,
  zoomBy,
} from "../waveform/waveformStore";

// The panel's Sample view: one audio file's waveform. Drag to select, click to play
// from a point, Shift+click to stretch the selection. The wheel or a trackpad pinch
// zooms; a sideways swipe or Shift+wheel scrolls. Focusing it starts audio, so the
// first play is heard.
export function Sample() {
  const status = useWaveform((s) => s.status);
  return (
    <div className="sample" tabIndex={0} data-autofocus onFocus={engine.warmUpAudio}>
      <Toolbar />
      {status === "ready" ? (
        <>
          <Wave />
          <ScrollBar />
          <CodeLine />
        </>
      ) : (
        <Message />
      )}
    </div>
  );
}

// The tab's title: "Sample · amen_break.wav".
export function SampleTitle() {
  const path = useWaveform((s) => s.path);
  return (
    <>
      Sample
      {path && <span className="panel-tab-file"> · {baseName(path)}</span>}
    </>
  );
}

function Message() {
  const status = useWaveform((s) => s.status);
  const path = useWaveform((s) => s.path);
  const error = useWaveform((s) => s.error);
  if (status === "error") return <p className="sample-message import-error">{error}</p>;
  if (status === "loading" && path) return <p className="sample-message">loading {baseName(path)}…</p>;
  return <p className="sample-message">Click an audio file in the explorer to open it here.</p>;
}

function Toolbar() {
  const info = useWaveform((s) => s.info);
  const playing = useWaveform((s) => s.playing !== null);
  const loop = useWaveform((s) => s.loop);
  const selection = useWaveform((s) => s.selection);
  const cursor = useWaveform((s) => s.cursor);
  const playKey = useKeyFor("sample.playStop");
  const loopKey = useKeyFor("sample.toggleLoop");
  if (!info) return null;
  return (
    <div className="sample-toolbar">
      <span className="import-dim">{infoText(info.duration, info.channels, info.wav)}</span>
      <span className="sample-buttons">
        <button type="button" className="ascii-button" title={withKey(playing ? "Stop" : "Play", playKey)} onClick={togglePlay}>
          {playing ? "[stop]" : "[play]"}
        </button>
        <button
          type="button"
          className={loop ? "ascii-button on" : "ascii-button"}
          title={withKey("Loop", loopKey)}
          aria-pressed={loop}
          onClick={toggleLoop}
        >
          [loop]
        </button>
      </span>
      <span className="sample-position">
        {selection ? (
          <>
            sel {timeText(selection.start)} – {timeText(selection.end)}{" "}
            <span className="import-dim">({(selection.end - selection.start).toFixed(3)}s)</span>
          </>
        ) : (
          <>at {timeText(cursor)}</>
        )}
      </span>
      <span className="sample-zoom">
        zoom
        <CommandButton command="sample.zoomOut">-</CommandButton>
        <CommandButton command="sample.zoomIn">+</CommandButton>
        <CommandButton command="sample.zoomFit">fit</CommandButton>
      </span>
    </div>
  );
}

// A [text] button that runs a command, with the command's label and key as its tooltip.
function CommandButton({ command, children }: { command: string; children: string }) {
  const key = useKeyFor(command);
  const label = getCommand(command)?.label ?? command;
  return (
    <button type="button" className="ascii-button" title={withKey(label, key)} onClick={() => getCommand(command)?.run()}>
      [{children}]
    </button>
  );
}

// Under this many pixels a press and release is a click, not a selection.
const DRAG_THRESHOLD = 3;

function Wave() {
  const boxRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const path = useWaveform((s) => s.path);
  const view = useWaveform((s) => s.view);
  const selection = useWaveform((s) => s.selection);
  const cursor = useWaveform((s) => s.cursor);
  const playing = useWaveform((s) => s.playing);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const data = sampleData();
    if (!waveRef.current || !data || !size.width) return;
    const waveData = { channels: data.channels, blocks: data.blocks, sampleRate: data.buffer.sampleRate };
    drawWave(waveRef.current, size.width, size.height, view, waveData);
  }, [size, view, path]);

  // The overlay redraws on its own: for every step of a selection drag, and every frame
  // while playing, as the playhead moves. Otherwise once per change.
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !size.width) return;
    const draw = () => {
      const playhead = playing
        ? playheadAt(engine.audioTime() - playing.startedAt, playing.from, playing.to, playing.loop)
        : null;
      drawOverlay(canvas, size.width, size.height, view, selection, cursor, playhead);
    };
    draw();
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      draw();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [size, view, selection, cursor, playing]);

  // React's wheel listeners are passive, so zooming would also scroll the panel, and a
  // trackpad pinch (a wheel event with ctrlKey) would zoom the whole page.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view: current, info } = useWaveform.getState();
      const rect = box.getBoundingClientRect();
      const action = info && wheelAction(event, rect.height);
      if (!info || !action) return;
      if ("scroll" in action) {
        setView(scrollView(current, (action.scroll / rect.width) * (current.end - current.start), info.duration));
      } else {
        zoomBy(action.zoom, timeAt(current, event.clientX - rect.left, rect.width));
      }
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const { info, view: current, selection: before, cursor: at } = useWaveform.getState();
    if (event.button !== 0 || !box || !info) return;
    const rect = box.getBoundingClientRect();
    const timeOf = (clientX: number) => timeAt(current, clientX - rect.left, rect.width);
    const startX = event.clientX;
    const start = timeOf(startX);

    // Shift+click stretches the selection (or a new one from the cursor) to here.
    if (event.shiftKey) {
      const anchor = before
        ? Math.abs(start - before.start) > Math.abs(start - before.end)
          ? before.start
          : before.end
        : at;
      select(spanBetween(anchor, start, info.duration));
      return;
    }

    let dragged: Span | null = null;
    const onMove = (move: MouseEvent) => {
      if (!dragged && Math.abs(move.clientX - startX) < DRAG_THRESHOLD) return;
      dragged = spanBetween(start, timeOf(move.clientX), info.duration);
      dragSelection(dragged);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragged && dragged.end > dragged.start) select(dragged);
      else playFrom(Math.min(info.duration, Math.max(0, start)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="sample-wave" ref={boxRef} onMouseDown={onMouseDown}>
      <canvas ref={waveRef} />
      <canvas ref={overlayRef} />
    </div>
  );
}

// The line that plays the selection, to copy into the code by hand: the field can be
// selected from, and [copy] (Ctrl+C while the view has focus) takes all of it. The app
// never writes it into the code itself.
function CodeLine() {
  const path = useWaveform((s) => s.path);
  const code = useWaveform(selectClipCode);
  const copied = useWaveform((s) => s.copied);
  const copyError = useWaveform((s) => s.copyError);
  const folder = path ? baseName(dirName(path)) : "its folder";
  return (
    <div className="sample-code">
      <span className="import-label">code</span>
      <input
        className="keys-buffer-text sample-code-text"
        readOnly
        spellCheck={false}
        title={`Plays once the code loads ${folder} with samples('./…')`}
        value={code ?? "…"}
        style={{ width: `${Math.max((code ?? "…").length, 3) + 1}ch` }}
      />
      <CommandButton command="sample.copyCode">{copied ? "copied" : "copy"}</CommandButton>
      {copyError && (
        <span className="import-error" title={copyError}>
          {copyError}
        </span>
      )}
    </div>
  );
}

// Where the view sits in the file: drag the thumb to scroll, click the track to jump.
function ScrollBar() {
  const trackRef = useRef<HTMLDivElement>(null);
  const view = useWaveform((s) => s.view);
  const duration = useWaveform((s) => s.info?.duration ?? 1);
  const left = (view.start / duration) * 100;
  const width = ((view.end - view.start) / duration) * 100;

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (event.button !== 0 || !track) return;
    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const span = view.end - view.start;
    const onThumb = (event.target as HTMLElement).classList.contains("sample-thumb");
    // A click on the track centres the view there first; either way the drag scrolls.
    const from = onThumb ? view : scrollView(view, ((event.clientX - rect.left) / rect.width) * duration - span / 2 - view.start, duration);
    if (!onThumb) setView(from);
    const startX = event.clientX;
    const onMove = (move: MouseEvent) => {
      setView(scrollView(from, ((move.clientX - startX) / rect.width) * duration, duration));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="sample-scroll" ref={trackRef} onMouseDown={onMouseDown}>
      <div className="sample-thumb" style={{ left: `${left}%`, width: `${width}%` }} />
    </div>
  );
}
