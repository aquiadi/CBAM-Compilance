import { env } from "@/config/env";
import {
  DOCUMENT_MEDIA_TYPES,
  documentMediaType,
  MAX_IMAGE_BYTES,
  type DocumentMediaType,
} from "./ai/extract";

/**
 * The checks every document upload goes through (bills, receipts, supplier
 * communications): present, not empty, within the size limits, and a type the
 * model can read. Returns the bytes, or a status and message for the response.
 */
export async function takeDocument(
  form: FormData,
): Promise<
  | { ok: true; bytes: Uint8Array; mediaType: DocumentMediaType; fileName: string }
  | { ok: false; status: number; message: string }
> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, status: 400, message: "No file was attached." };
  if (file.size === 0) return { ok: false, status: 400, message: "The file is empty." };
  if (file.size > env.CARBONPASS_MAX_UPLOAD_MB * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      message: `The file is larger than ${env.CARBONPASS_MAX_UPLOAD_MB} MB.`,
    };
  }
  const mediaType = documentMediaType(file.name, file.type);
  if (!mediaType) {
    const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    return {
      ok: false,
      status: 415,
      message: heic
        ? "iPhone HEIC photos are not supported. Set the camera to “Most Compatible” (JPEG), or share the photo as JPEG."
        : "Upload a PDF, a photo (JPEG, PNG, WebP) or a text file.",
    };
  }
  if (DOCUMENT_MEDIA_TYPES[mediaType] === "image" && file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Photos can be at most 5 MB. Take it at a lower resolution or crop it.",
    };
  }
  return {
    ok: true,
    bytes: new Uint8Array(await file.arrayBuffer()),
    mediaType,
    fileName: file.name.slice(0, 200),
  };
}
