import { Pattern, noteToMidi, valueToMidi } from "@strudel/core";

// strudel.cc defines .piano() in its website code (website/src/repl/prebake.mjs at
// tag @strudel/webaudio@1.3.0), not in any package, so it is reproduced here.

const maxPan = noteToMidi("C8");
const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2;

Pattern.prototype.piano = function (this: Pattern): Pattern {
  return this.fmap((v) => ({ ...v, clip: v.clip ?? 1 })) // set clip if not already set
    .s("piano")
    .release(0.1)
    .fmap((value) => {
      const midi = valueToMidi(value);
      // pan by pitch
      const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
      return { ...value, pan: (value.pan || 1) * pan };
    });
};
