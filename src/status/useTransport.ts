import { useEffect, useState } from "react";
import * as engine from "../engine";
import { cycleText } from "./format";

// How often the status bar reads the engine: often enough for the cycle count.
const POLL_MS = 100;

const same = (a: engine.Transport, b: engine.Transport) =>
  a.started === b.started &&
  a.evaluating === b.evaluating &&
  a.cps === b.cps &&
  cycleText(a.cycle) === cycleText(b.cycle) &&
  a.audio === b.audio &&
  a.loading === b.loading;

// The engine's transport, re-read every POLL_MS; renders only when something shown changes.
export function useTransport(): engine.Transport {
  const [transport, setTransport] = useState(engine.getTransport);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = engine.getTransport();
      setTransport((prev) => (same(prev, next) ? prev : next));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);
  return transport;
}
