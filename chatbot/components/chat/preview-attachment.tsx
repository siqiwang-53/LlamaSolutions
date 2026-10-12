import Image from "next/image";
import { fileKindLabel } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = Boolean(contentType?.startsWith("image/") && url);

  return (
    <div
      className={cn(
        "group relative h-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted",
        isImage ? "w-24" : "w-32"
      )}
      data-testid="input-attachment-preview"
      title={name}
    >
      {isImage ? (
        <Image
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-1.5 text-center">
          <span className="font-medium text-[11px] tracking-wide">
            {fileKindLabel(contentType, name)}
          </span>
          <span className="line-clamp-3 break-all text-[10px] text-muted-foreground leading-tight">
            {name || "File"}
          </span>
          {!isUploading && !onRemove ? (
            <span className="font-medium text-[10px] text-foreground">
              Loaded
            </span>
          ) : null}
        </div>
      )}

      {isUploading ? (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      ) : null}

      {onRemove && !isUploading && (
        <button
          aria-label={`Remove ${name || "file"}`}
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
