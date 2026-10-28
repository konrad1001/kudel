import { describe, expect, it } from "vitest";
import { buildSampleMap, soundName, soundsInFolder, type SampleFolder } from "./sampleMap";

describe("soundName", () => {
  it("keeps names that already work in mini-notation, lower-cased", () => {
    expect(soundName("after_laughter_beat")).toBe("after_laughter_beat");
    expect(soundName("female-vocal-soul-chop")).toBe("female-vocal-soul-chop");
    expect(soundName("sonny_terry-_lost_john")).toBe("sonny_terry-_lost_john");
    expect(soundName("Kick")).toBe("kick");
  });

  it("turns spaces, dots and other punctuation into underscores", () => {
    expect(soundName("Deep Kick 02")).toBe("deep_kick_02");
    expect(soundName("808-BD (hard)")).toBe("808-bd_hard");
    expect(soundName("808.bd")).toBe("808_bd");
  });

  it("drops accents and trims - and _ from the ends", () => {
    expect(soundName("Crème Brûlée")).toBe("creme_brulee");
    expect(soundName("__snare!!")).toBe("snare");
    expect(soundName("-kick-")).toBe("kick");
  });

  it("never returns an empty name or one that reads as a number", () => {
    expect(soundName("!!!")).toBe("sample");
    expect(soundName("909")).toBe("s909");
    expect(soundName("1e5")).toBe("s1e5");
  });
});

const folder: SampleFolder = {
  path: "C:\\set\\samples",
  folders: [
    { name: "Kick", path: "C:\\set\\samples\\Kick", files: ["C:\\set\\samples\\Kick\\a.wav", "C:\\set\\samples\\Kick\\b.wav"] },
    { name: "hats", path: "C:\\set\\samples\\hats", files: ["C:\\set\\samples\\hats\\closed.wav"] },
  ],
  files: ["C:\\set\\samples\\kick.wav", "C:\\set\\samples\\Snare Hit.mp3"],
};

describe("soundsInFolder", () => {
  it("names folders, then loose files, numbering clashes", () => {
    expect(soundsInFolder(folder)).toEqual([
      { name: "kick", source: "C:\\set\\samples\\Kick" },
      { name: "hats", source: "C:\\set\\samples\\hats" },
      { name: "kick_2", source: "C:\\set\\samples\\kick.wav" },
      { name: "snare_hit", source: "C:\\set\\samples\\Snare Hit.mp3" },
    ]);
  });
});

describe("buildSampleMap", () => {
  it("maps each sound to the URLs of its files, in order", () => {
    const map = buildSampleMap(folder, (path) => `url:${path}`);
    expect(map).toEqual({
      kick: ["url:C:\\set\\samples\\Kick\\a.wav", "url:C:\\set\\samples\\Kick\\b.wav"],
      hats: ["url:C:\\set\\samples\\hats\\closed.wav"],
      kick_2: ["url:C:\\set\\samples\\kick.wav"],
      snare_hit: ["url:C:\\set\\samples\\Snare Hit.mp3"],
    });
  });

  it("is empty for a folder without audio", () => {
    expect(buildSampleMap({ path: "C:\\x", folders: [], files: [] }, (p) => p)).toEqual({});
  });
});
