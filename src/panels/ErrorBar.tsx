import { useEffect, useState } from "react";
import * as engine from "../engine";

export function ErrorBar() {
  const [error, setError] = useState<string>();

  useEffect(() => engine.onError(setError), []);

  if (!error) return null;
  return (
    <div className="error-bar" role="alert">
      {error}
    </div>
  );
}
