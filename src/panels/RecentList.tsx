import { openRecentFile, openRecentFolder } from "../files/actions";
import { baseName, dirName } from "../files/paths";
import { useRecent } from "../files/recentStore";

// Recently opened folders or files: the name, with where it is beside it. Nothing
// is shown when the list is empty.
export function RecentList({ kind, max = 5 }: { kind: "folders" | "files"; max?: number }) {
  const paths = useRecent((s) => s[kind]).slice(0, max);
  const open = kind === "folders" ? openRecentFolder : openRecentFile;
  if (paths.length === 0) return null;
  return (
    <ul className="recent-list">
      {paths.map((path) => (
        <li key={path} className="recent-item" title={path} onClick={() => void open(path)}>
          <span className="recent-name">{baseName(path)}</span>
          <span className="recent-where">{dirName(path)}</span>
        </li>
      ))}
    </ul>
  );
}
