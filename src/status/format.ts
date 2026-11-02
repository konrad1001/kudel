// Text for the status bar's numbers.

// At most `decimals` places, without trailing zeros: 0.5, 120, 0.567.
export function trimmed(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)));
}

// Strudel counts tempo in cycles per second; bpm assumes four beats a cycle, as
// setcpm(bpm / 4) does.
export function tempoText(cps: number): string {
  return `${trimmed(cps, 3)} cps · ${trimmed(cps * 240, 1)} bpm`;
}

// The cycle to a tenth, always with the tenth so the width doesn't jump.
export function cycleText(cycle: number): string {
  return (Math.floor(cycle * 10) / 10).toFixed(1);
}

export function loadingText(count: number): string {
  return `loading ${count} sample${count === 1 ? "" : "s"}`;
}
