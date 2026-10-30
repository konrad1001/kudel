import { useMemo, type MouseEvent } from "react";
import * as engine from "../engine";
import { CATEGORIES, filterSounds } from "../sounds/catalog";
import { copySoundName, playSound, setCategory, setSearch, useSounds } from "../sounds/soundsStore";

// The sidebar's list of loaded sounds, by category, with a search. Clicking a name plays
// it and copies it. Focusing the view starts audio, so the first click is heard.
export function Sounds() {
  return (
    <div className="sounds" tabIndex={-1} onFocus={engine.warmUpAudio}>
      <input
        className="sounds-search"
        data-autofocus
        spellCheck={false}
        placeholder="search"
        value={useSounds((s) => s.search)}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSearch("");
        }}
      />
      <Categories />
      <SoundList />
    </div>
  );
}

function Categories() {
  const category = useSounds((s) => s.category);
  return (
    <div className="sounds-categories" role="tablist">
      {CATEGORIES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === category}
          className="sounds-category"
          onClick={() => setCategory(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SoundList() {
  const sounds = useSounds((s) => s.sounds);
  const category = useSounds((s) => s.category);
  const search = useSounds((s) => s.search);
  const playing = useSounds((s) => s.playing);
  const error = useSounds((s) => s.error);
  const shown = useMemo(() => filterSounds(sounds, category, search), [sounds, category, search]);

  // On press, not release, so the sound starts with the click. Its name is copied too.
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const name = (event.target as HTMLElement).closest<HTMLElement>("[data-sound]")?.dataset.sound;
    const sound = shown.find((s) => s.name === name);
    if (event.button !== 0 || !sound) return;
    playSound(sound);
    void copySoundName(sound);
  };

  return (
    <>
      {error && (
        <div className="sounds-error" title={error}>
          {error}
        </div>
      )}
      <div className="sounds-list" onMouseDown={onMouseDown}>
        {shown.map((sound) => (
          <span
            key={sound.name}
            className={sound.name === playing ? "sound playing" : "sound"}
            data-sound={sound.name}
          >
            {sound.name}
            {sound.count > 0 && <span className="sound-count">({sound.count})</span>}
          </span>
        ))}
        {!shown.length && <span className="sounds-empty">{search.trim() ? "no match" : "loading…"}</span>}
      </div>
    </>
  );
}
