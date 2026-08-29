import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Heart, UserPlus } from "lucide-react";
import { StatusBar } from "@/components/StatusBar";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/store/useStore";
import { useRegisterControls } from "@/store/useControls";
import { ScrollArea } from "@/components/ScrollArea";
import {
  acceptFriendRequest,
  ensureSocialProfile,
  listIncomingRequests,
  loadFriendStats,
  loadSocialProfile,
  requestFriendByCode,
  sendKudos,
  syncAcceptedOutgoing,
  type FriendRequest,
  type PublicStats,
  type SocialProfile,
} from "@/lib/social";
import { cloudConfigured } from "@/lib/firebase";

export function FriendsScreen() {
  const nav = useNavigate();
  const user = useStore((s) => s.user);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [friends, setFriends] = useState<PublicStats[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isGoogle = user?.provider === "google";

  useRegisterControls({ back: () => nav("/games") }, [nav]);

  const refresh = async () => {
    if (!user || !isGoogle || !cloudConfigured()) return;
    await syncAcceptedOutgoing(user.id);
    const p =
      (await loadSocialProfile(user.id)) ??
      (await ensureSocialProfile(user.id, user.name));
    setProfile(p);
    if (p) {
      setFriends(await loadFriendStats(p.friendUids));
      setIncoming(await listIncomingRequests(user.id));
    }
  };

  useEffect(() => {
    if (!user || !isGoogle || !cloudConfigured()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isGoogle]);

  const copyCode = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setMessage("Friend code copied");
    } catch {
      setMessage(profile.friendCode);
    }
  };

  const addFriend = async () => {
    if (!user) return;
    const result = await requestFriendByCode(user.id, codeInput, user.name);
    if (result.ok) {
      setMessage("Friend request sent");
      setCodeInput("");
      await refresh();
    } else {
      const map: Record<string, string> = {
        invalid_code: "Enter a 12-digit friend code",
        not_found: "No player with that code",
        self: "That is your own code",
        already_friends: "Already friends or requested",
        guest: "Sign in with Google first",
        cloud_unavailable: "Cloud is not configured",
        missing_profile: "Could not load your profile",
      };
      setMessage(map[result.reason ?? ""] ?? "Could not add friend");
    }
  };

  return (
    <>
      <StatusBar />
      <ScrollArea className="px-4 pb-4">
        <button
          type="button"
          onClick={() => nav("/games")}
          className="capsule mb-2 flex h-10 w-10 items-center justify-center text-ink-soft active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <PageHeader
          title="Friends"
          subtitle="StreetPass-style accountability. Streaks only, never details."
        />

        {!isGoogle || !cloudConfigured() ? (
          <div className="card p-4 text-sm font-700 text-ink-soft">
            Sign in with Google (and configure Firebase) to use friend codes,
            shared streaks, and kudos.
          </div>
        ) : loading ? (
          <p className="text-sm font-700 text-ink-faint">Loading…</p>
        ) : (
          <>
            <div className="card mb-4 p-4">
              <p className="text-xs font-800 uppercase tracking-wide text-ink-faint">
                Your friend code
              </p>
              <p className="mt-1 font-display text-2xl font-800 tracking-wider text-ink">
                {profile?.friendCode ?? "----"}
              </p>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="btn-ghost mt-2 inline-flex items-center gap-1.5 text-sm"
              >
                <Copy size={14} /> Copy
              </button>
            </div>

            <div className="card mb-4 p-4">
              <p className="mb-2 font-800 text-ink">Add a friend</p>
              <div className="flex gap-2">
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="1234-5678-9012"
                  className="capsule min-w-0 flex-1 px-3 py-2 text-sm font-700 text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() => void addFriend()}
                  className="btn px-3"
                >
                  <UserPlus size={16} />
                </button>
              </div>
              {message && (
                <p className="mt-2 text-xs font-700 text-ink-faint">{message}</p>
              )}
            </div>

            {incoming.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="font-800 text-ink">Incoming requests</p>
                {incoming.map((req) => (
                  <div key={req.id} className="card flex items-center justify-between p-3">
                    <span className="text-sm font-700 text-ink-soft">
                      {req.fromName}
                    </span>
                    <button
                      type="button"
                      className="btn px-3 py-1 text-sm"
                      onClick={() =>
                        void acceptFriendRequest(user!.id, req.id).then(() =>
                          refresh(),
                        )
                      }
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="mb-2 font-display text-lg font-800 text-ink">Friends</p>
            {friends.length === 0 ? (
              <div className="card p-4 text-sm font-700 text-ink-soft">
                No friends yet. Share your code like a 3DS friend code.
              </div>
            ) : (
              <div className="space-y-3">
                {friends.map((f) => (
                  <div key={f.uid} className="card flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-800 text-ink">{f.displayName}</p>
                      <p className="text-xs font-700 text-ink-faint">
                        Best streak {f.bestStreak} · {f.daysActiveThisWeek} active
                        days this week
                        {f.completedToday ? " · Done today" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="capsule flex h-10 w-10 items-center justify-center text-cat-exercise active:scale-95"
                      aria-label="Send kudos"
                      onClick={() =>
                        void sendKudos(user!.id, user!.name, f.uid).then((r) =>
                          setMessage(
                            r.ok
                              ? `Kudos sent to ${f.displayName}`
                              : r.reason === "exists"
                                ? "Already sent kudos today"
                                : "Could not send kudos",
                          ),
                        )
                      }
                    >
                      <Heart size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </>
  );
}
