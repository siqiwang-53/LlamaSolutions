import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { resolveAttachment } from "@/lib/attachments";

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const filename = uploaded instanceof File ? uploaded.name : "upload";
    const resolved = resolveAttachment({
      name: filename,
      size: uploaded.size,
      type: uploaded.type,
    });

    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const safeName =
      filename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 120) || "file";
    const fileBuffer = await uploaded.arrayBuffer();

    try {
      const data = await put(`${nanoid()}-${safeName}`, fileBuffer, {
        access: "public",
        contentType: resolved.attachment.mediaType,
      });

      return NextResponse.json({
        ...data,
        contentType: resolved.attachment.mediaType,
        name: resolved.attachment.name,
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "Upload failed. Cloud file storage is not available. Use Local incognito in the header, or set BLOB_READ_WRITE_TOKEN.",
        },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
