import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { getLearnMedia } from "@/lib/learn/media";

export function CardMedia({
  audioKey,
  imageKey,
}: {
  audioKey?: string;
  imageKey?: string;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let audioObject: string | null = null;
    let imageObject: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (audioKey) {
        try {
          const blob = await getLearnMedia(audioKey);
          if (!cancelled && blob) {
            audioObject = URL.createObjectURL(blob);
            setAudioUrl(audioObject);
          }
        } catch {
          // missing local media
        }
      }
      if (imageKey) {
        try {
          const blob = await getLearnMedia(imageKey);
          if (!cancelled && blob) {
            imageObject = URL.createObjectURL(blob);
            setImageUrl(imageObject);
          }
        } catch {
          // missing local media
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
      if (audioObject) URL.revokeObjectURL(audioObject);
      if (imageObject) URL.revokeObjectURL(imageObject);
    };
  }, [audioKey, imageKey]);

  if (!audioKey && !imageKey) return null;

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="mx-auto max-h-36 w-full object-contain"
        />
      )}
      {audioUrl && (
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="shrink-0 text-ink-faint" />
          <audio src={audioUrl} controls className="w-full" />
        </div>
      )}
    </div>
  );
}
