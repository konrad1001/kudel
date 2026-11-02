import { useKeyFor, withKey } from "../commands/keybindings";
import { revealError, useStatus } from "../status/statusStore";

// The current error, in full. When it points at a place in the code (a syntax error),
// clicking it goes there.
export function ErrorBar() {
  const error = useStatus((s) => s.error);
  const revealKey = useKeyFor("run.revealError");

  if (!error) return null;
  const at = error.at;
  return (
    <div
      className={at ? "error-bar located" : "error-bar"}
      role="alert"
      title={at ? withKey(`Go to line ${at.line}`, revealKey) : undefined}
      onClick={at ? revealError : undefined}
    >
      {error.message}
    </div>
  );
}
