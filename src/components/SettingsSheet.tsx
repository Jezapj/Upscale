import { useRef } from "react";
import { LogOut, Download, Upload, Info } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Sheet } from "./Sheet";
import { storage } from "@/lib/storage";
import { emptyAppData } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: Props) {
  const { user, data, signOut } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upscale-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = { ...emptyAppData(), ...JSON.parse(String(reader.result)) };
        if (user) {
          void storage.saveData(user.id, parsed);
          window.location.reload();
        }
      } catch {
        alert("That file couldn't be read as an Upscale backup.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div className="card flex items-center gap-3 p-4">
          {user?.picture ? (
            <img
              src={user.picture}
              alt=""
              className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-soft"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-800 text-white shadow-soft"
              style={{ background: "linear-gradient(160deg,#74c0ff,#3a8ef0)" }}
            >
              {(user?.name ?? "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-800 text-ink">{user?.name}</p>
            <p className="truncate text-xs font-600 text-ink-faint">
              {user?.email ?? (user?.provider === "guest" ? "Guest account · saved on this device" : "")}
            </p>
          </div>
        </div>

        <div className="card flex items-start gap-3 p-4 text-sm font-600 text-ink-soft">
          <Info size={18} className="mt-0.5 shrink-0 text-cat-project" />
          <p>
            Install Upscale on your phone: open the browser menu and choose
            <span className="font-800 text-ink"> “Add to Home Screen”</span>. It
            runs full-screen and works offline.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={exportData} className="btn-ghost">
            <Download size={18} /> Export
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost">
            <Upload size={18} /> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
            }}
          />
        </div>

        <button
          onClick={() => {
            signOut();
            onClose();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-cat-exercise/10 py-3 font-800 text-cat-exercise active:scale-95"
        >
          <LogOut size={18} /> Sign out
        </button>

        <p className="text-center text-xs font-600 text-ink-faint">Upscale</p>
      </div>
    </Sheet>
  );
}
