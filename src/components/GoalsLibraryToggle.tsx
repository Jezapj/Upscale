import { useNavigate } from "react-router-dom";
import { SegBar } from "./SegBar";

type Tab = "goals" | "library";

export function GoalsLibraryToggle({ value }: { value: Tab }) {
  const nav = useNavigate();
  return (
    <SegBar
      value={value}
      onChange={(v) => nav(v === "goals" ? "/goals" : "/library")}
      options={[
        { key: "goals", label: "Goals" },
        { key: "library", label: "Library" },
      ]}
    />
  );
}
