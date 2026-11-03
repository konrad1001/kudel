import { useEffect, type KeyboardEvent } from "react";
import { revealPath, useExplorer } from "../files/explorerStore";
import { baseName, samePath } from "../files/paths";
import {
  bytesText,
  clipLength,
  clipText,
  clockText,
  dirLabel,
  percentText,
  progressBar,
  readClip,
  versionText,
  type Progress,
} from "../importer/importer";
import {
  cancelJob,
  checkTools,
  clearFinished,
  pickImportDir,
  setClip,
  setUrl,
  startImport,
  toggleLog,
  updateTools,
  useImport,
  type ImportJob,
} from "../importer/importStore";
import { togglePreview, usePreview } from "../samples/preview";

// The panel's importer: paste a link, get a .wav in the open folder. yt-dlp does the
// downloading; the list shows each import's progress, then the file to play or find.
export function Import() {
  const root = useExplorer((s) => s.root);

  // Once, when the view first shows; [check] looks again after installing.
  useEffect(() => {
    if (useImport.getState().tools === null) void checkTools();
  }, []);

  return (
    <div className="import">
      {root ? <Form /> : <p className="import-note">Open a folder first: imports go into it.</p>}
      <Jobs />
      <Tools />
    </div>
  );
}

// Enter in any of the fields imports.
function importOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") void startImport();
}

function Form() {
  const url = useImport((s) => s.url);
  const dir = useImport((s) => s.dir);
  const from = useImport((s) => s.from);
  const to = useImport((s) => s.to);
  const read = readClip(from, to);
  return (
    <div className="import-form">
      <label className="import-field">
        <span className="import-label">url</span>
        <input
          className="keys-input import-url"
          data-autofocus
          spellCheck={false}
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={importOnEnter}
        />
        <button
          type="button"
          className="ascii-button"
          disabled={!url.trim() || "error" in read}
          onClick={() => void startImport()}
        >
          [import]
        </button>
      </label>
      <div className="import-field">
        <span className="import-label">clip</span>
        <input
          className="keys-input import-time"
          aria-label="From"
          spellCheck={false}
          placeholder="start"
          value={from}
          onChange={(event) => setClip({ from: event.target.value })}
          onKeyDown={importOnEnter}
        />
        <span className="import-dim">–</span>
        <input
          className="keys-input import-time"
          aria-label="To"
          spellCheck={false}
          placeholder="end"
          value={to}
          onChange={(event) => setClip({ to: event.target.value })}
          onKeyDown={importOnEnter}
        />
        {"error" in read ? (
          <span className="import-error">{read.error}</span>
        ) : read.clip ? (
          <span>{clipLength(read.clip) ?? clipText(read.clip)}</span>
        ) : (
          <span className="import-dim">blank = whole video</span>
        )}
      </div>
      <div className="import-field">
        <span className="import-label">into</span>
        <span className="import-dir" title="Relative to the open folder">
          {dirLabel(dir)}
        </span>
        <button type="button" className="ascii-button" onClick={() => void pickImportDir()}>
          [change]
        </button>
      </div>
    </div>
  );
}

function Jobs() {
  const jobs = useImport((s) => s.jobs);
  if (!jobs.length) return null;
  return (
    <ul className="import-jobs">
      {jobs.map((job) => (
        <Job key={job.id} job={job} />
      ))}
    </ul>
  );
}

const MARK: Record<ImportJob["status"], string> = {
  running: "↓",
  done: "✓",
  failed: "✗",
  cancelled: "–",
};

function Job({ job }: { job: ImportJob }) {
  const name = job.path ? baseName(job.path) : (job.progress.title ?? job.url);
  return (
    <li className={`import-job ${job.status}`}>
      <div className="import-line">
        <span className="import-mark">{MARK[job.status]}</span>
        <span className="import-name" title={job.url}>
          {name}
        </span>
        <span className="import-dim">{clipText(job.clip)}</span>
        <JobDetail job={job} />
      </div>
      {job.showLog && <pre className="import-log">{job.log.join("\n") || "(nothing printed)"}</pre>}
    </li>
  );
}

function JobDetail({ job }: { job: ImportJob }) {
  const previewing = usePreview((s) => samePath(s.path, job.path));
  const logButton = (
    <button type="button" className="ascii-button" onClick={() => toggleLog(job.id)}>
      {job.showLog ? "[hide log]" : "[log]"}
    </button>
  );
  switch (job.status) {
    case "running":
      return (
        <>
          <ProgressText progress={job.progress} />
          <button type="button" className="ascii-button" onClick={() => cancelJob(job.id)}>
            [cancel]
          </button>
        </>
      );
    case "done": {
      const path = job.path ?? "";
      return (
        <>
          {job.bytes !== null && <span className="import-dim">{bytesText(job.bytes)}</span>}
          <button type="button" className="ascii-button" onClick={() => togglePreview(path)}>
            {previewing ? "[stop]" : "[play]"}
          </button>
          <button type="button" className="ascii-button" onClick={() => void revealPath(path)}>
            [reveal]
          </button>
        </>
      );
    }
    case "failed":
      return (
        <>
          <span className="import-error" title={job.message ?? undefined}>
            {job.message}
          </span>
          {logButton}
        </>
      );
    case "cancelled":
      return (
        <>
          <span className="import-dim">cancelled</span>
          {logButton}
        </>
      );
  }
}

function ProgressText({ progress }: { progress: Progress }) {
  if (progress.phase === "fetching") return <span className="import-dim">fetching…</span>;
  if (progress.phase === "converting") return <span className="import-dim">converting to wav…</span>;
  const { fraction, speed, eta } = progress;
  return (
    <span className="import-progress">
      {fraction !== null && `${progressBar(fraction)} ${percentText(fraction).padStart(4)}`}
      {speed !== null && <span className="import-dim">{bytesText(speed)}/s</span>}
      {eta !== null && <span className="import-dim">eta {clockText(eta)}</span>}
    </span>
  );
}

// winget package ids, for the hint when a program is missing. yt-dlp's package brings
// its own ffmpeg build (and deno, for YouTube) with it.
const INSTALL = { ytDlp: "winget install yt-dlp.yt-dlp", ffmpeg: "winget install yt-dlp.FFmpeg" };

function Tools() {
  const tools = useImport((s) => s.tools);
  const checking = useImport((s) => s.checking);
  const updating = useImport((s) => s.updating);
  const note = useImport((s) => s.toolNote);
  const finished = useImport((s) => s.jobs.some((job) => job.status !== "running"));

  const tool = (name: string, version: string | null | undefined, install: string) =>
    version ? (
      <span className="import-dim">
        {name} {versionText(version)}
      </span>
    ) : (
      <span className="import-error" title="Restart the app after installing, so it sees the new PATH">
        {name} not found: {install}
      </span>
    );

  return (
    <div className="import-tools">
      {tools === null ? (
        <span className="import-dim">looking for yt-dlp and ffmpeg…</span>
      ) : (
        <>
          {tool("yt-dlp", tools.ytDlp, INSTALL.ytDlp)}
          {tool("ffmpeg", tools.ffmpeg, INSTALL.ffmpeg)}
        </>
      )}
      {note && (
        <span className="import-dim import-note-text" title={note}>
          {note}
        </span>
      )}
      <span className="import-tool-buttons">
        {finished && (
          <button type="button" className="ascii-button" onClick={clearFinished}>
            [clear]
          </button>
        )}
        <button type="button" className="ascii-button" disabled={checking} onClick={() => void checkTools()}>
          [check]
        </button>
        <button
          type="button"
          className="ascii-button"
          title="yt-dlp -U"
          disabled={updating || !tools?.ytDlp}
          onClick={() => void updateTools()}
        >
          {updating ? "[updating…]" : "[update]"}
        </button>
      </span>
    </div>
  );
}
