import { useEffect, useRef } from "react";
import * as engine from "../engine";

const INITIAL_CODE = 's("bd sd [~ bd] sd")';

export function StrudelEditor() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    engine.init({ initialCode: INITIAL_CODE });
    return engine.attach(host);
  }, []);

  return <div ref={hostRef} className="editor-host" />;
}
