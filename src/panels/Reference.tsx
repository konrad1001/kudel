import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import * as engine from "../engine";
import { useKeyFor } from "../commands/keybindings";
import { newFileWithCode } from "../files/actions";
import {
  findEntry,
  groupsOf,
  parseDescription,
  signatureOf,
  type Inline,
  type ReferenceEntry,
} from "../reference/reference";
import {
  back,
  loadReference,
  moveSelection,
  selectEntry,
  setGroup,
  setQuery,
  useReference,
  useResults,
} from "../reference/referenceStore";

// The Strudel API reference: a search box, the matching names, and the chosen entry.
// Side by side when there's room (maximised, say), stacked when narrow.
export function Reference() {
  const data = useReference((s) => s.data);
  const error = useReference((s) => s.error);

  useEffect(() => {
    void loadReference();
  }, []);

  return (
    <div className="reference">
      <Search />
      {error && <div className="reference-error">{error}</div>}
      {data ? (
        <div className="reference-body">
          <Results entries={data.entries} />
          <Entry entries={data.entries} />
        </div>
      ) : (
        !error && <div className="reference-empty">loading…</div>
      )}
    </div>
  );
}

function Search() {
  const query = useReference((s) => s.query);
  const group = useReference((s) => s.group);
  const data = useReference((s) => s.data);
  const groups = useMemo(() => (data ? groupsOf(data.entries) : []), [data]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape") {
      // Clears the search, or with nothing to clear goes back to the code.
      if (query) setQuery("");
      else engine.focusEditor();
    }
  };

  return (
    <div className="reference-search">
      <input
        className="reference-query"
        data-autofocus
        spellCheck={false}
        placeholder="search functions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <select
        className="reference-group"
        value={group ?? ""}
        title="Package and file"
        onChange={(event) => setGroup(event.target.value || null)}
      >
        <option value="">all</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g.replace("@strudel/", "")}
          </option>
        ))}
      </select>
    </div>
  );
}

function Results({ entries }: { entries: ReferenceEntry[] }) {
  const results = useResults();
  const selected = useReference((s) => s.selected);
  const list = useRef<HTMLUListElement>(null);

  // Keeps the chosen name in view as the arrow keys move through the list.
  useEffect(() => {
    list.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <ul className="reference-list" role="listbox" ref={list}>
      {results.map((index) => {
        const entry = entries[index];
        return (
          <li
            key={index}
            role="option"
            aria-selected={index === selected}
            className="reference-item"
            onMouseDown={(event) => {
              if (event.button === 0) selectEntry(index);
            }}
          >
            {entry.name}
            {entry.synonyms.length > 0 && <span className="reference-aliases"> {entry.synonyms.join(" ")}</span>}
          </li>
        );
      })}
      {!results.length && <li className="reference-none">no match</li>}
    </ul>
  );
}

function Entry({ entries }: { entries: ReferenceEntry[] }) {
  const selected = useReference((s) => s.selected);
  const canGoBack = useReference((s) => s.history.length > 0);
  const lookUpKey = useKeyFor("reference.lookUp");
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    article.current?.scrollTo({ top: 0 });
  }, [selected]);

  const entry = selected === null ? undefined : entries[selected];
  if (!entry) {
    return (
      <article className="reference-entry reference-hint">
        Pick a function{lookUpKey && `, or press ${lookUpKey} on a word in the code`}.
      </article>
    );
  }
  const fileAndLine = entry.source.split("/").pop();
  return (
    <article className="reference-entry" ref={article}>
      <header className="reference-heading">
        {canGoBack && (
          <button type="button" className="ascii-button" title="Back" onClick={back}>
            [←]
          </button>
        )}
        <h2 className="reference-signature">{signatureOf(entry)}</h2>
      </header>
      <div className="reference-meta" title={entry.source}>
        {entry.memberof && `${entry.memberof} · `}
        {entry.package} · {fileAndLine}
      </div>
      {entry.synonyms.length > 0 && (
        <div className="reference-meta">
          also: <code>{entry.synonyms.join(", ")}</code>
        </div>
      )}
      {entry.deprecated && (
        <p className="reference-deprecated">
          Deprecated{typeof entry.deprecated === "string" && `: ${entry.deprecated}`}
        </p>
      )}
      <Description text={entry.description} entries={entries} />
      {entry.params.length > 0 && (
        <section>
          <h3>Parameters</h3>
          <dl className="reference-params">
            {entry.params.map((param, i) => (
              <div key={i}>
                <dt>
                  <code>{param.name}</code>
                  {param.type && <span className="reference-type"> {param.type}</span>}
                </dt>
                {param.description && (
                  <dd>
                    <Inlines parts={inlineOf(param.description)} entries={entries} />
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      )}
      {entry.returns.some((r) => r.description || r.type) && (
        <section>
          <h3>Returns</h3>
          {entry.returns.map((r, i) => (
            <p key={i}>{[r.type, r.description].filter(Boolean).join(" — ")}</p>
          ))}
        </section>
      )}
      {entry.examples.length > 0 && (
        <section>
          <h3>{entry.examples.length > 1 ? "Examples" : "Example"}</h3>
          {entry.examples.map((code, i) => (
            <Example key={`${selected}-${i}`} code={code} />
          ))}
        </section>
      )}
    </article>
  );
}

function Description({ text, entries }: { text: string; entries: ReferenceEntry[] }) {
  return parseDescription(text).map((block, i) =>
    "paragraph" in block ? (
      <p key={i}>
        <Inlines parts={block.paragraph} entries={entries} />
      </p>
    ) : (
      <ul key={i} className="reference-bullets">
        {block.list.map((item, j) => (
          <li key={j}>
            <Inlines parts={item} entries={entries} />
          </li>
        ))}
      </ul>
    ),
  );
}

// A parameter's description is one line of the same markup.
function inlineOf(text: string): Inline[] {
  return parseDescription(text).flatMap((block) => ("paragraph" in block ? block.paragraph : block.list.flat()));
}

// Code naming another entry links to it. Web links copy their address, since the app
// has no browser to open them in.
function Inlines({ parts, entries }: { parts: Inline[]; entries: ReferenceEntry[] }) {
  return parts.map((part, i) => {
    if ("code" in part) {
      const target = findEntry(entries, part.code);
      return target === null ? (
        <code key={i}>{part.code}</code>
      ) : (
        <button key={i} type="button" className="reference-ref" onClick={() => selectEntry(target, { follow: true })}>
          <code>{part.code}</code>
        </button>
      );
    }
    if ("link" in part) {
      return (
        <button
          key={i}
          type="button"
          className="reference-link"
          title={`${part.url} (click to copy)`}
          onClick={() => void navigator.clipboard.writeText(part.url)}
        >
          {part.link}
        </button>
      );
    }
    return part.text;
  });
}

// Coloured like the editor. Opening it in a tab is the way to hear it: the reference
// itself never plays anything.
function Example({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => (host.current ? engine.mountCodeView(host.current, code) : undefined), [code]);
  return (
    <figure className="reference-example">
      <div ref={host} />
      <figcaption className="reference-example-actions">
        <button type="button" className="ascii-button" onClick={() => void navigator.clipboard.writeText(code)}>
          [copy]
        </button>
        <button type="button" className="ascii-button" onClick={() => void newFileWithCode(code)}>
          [open in new tab]
        </button>
      </figcaption>
    </figure>
  );
}
