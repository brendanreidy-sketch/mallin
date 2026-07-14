/**
 * Client-side fetch helpers for /api/notes.
 *
 * Used by app/prep/notes/* components. Server-side persistence lives in
 * lib/notes/repository.ts; this file is the browser-facing API surface.
 *
 * No auth tokens are managed here — Clerk's middleware handles session
 * cookies on every fetch. If the user is logged out, the API returns
 * 401 and we surface that to the caller.
 */

import type {
  CreateRepNoteInput,
  RepNote,
  UpdateRepNoteInput,
} from "./types";

interface ApiOk<T> {
  ok: true;
  data: T;
}
interface ApiErr {
  ok: false;
  status: number;
  error: string;
  detail?: string;
}
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function jsonRequest<T>(
  url: string,
  init: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      detail: err instanceof Error ? err.message : "request failed",
    };
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: "invalid_response" };
  }
  if (!res.ok || body.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === "string" ? body.error : `http_${res.status}`,
      detail: typeof body.detail === "string" ? body.detail : undefined,
    };
  }
  return { ok: true, data: body as unknown as T };
}

export async function createNote(
  input: CreateRepNoteInput,
): Promise<ApiResult<{ note: RepNote }>> {
  return jsonRequest<{ note: RepNote }>("/api/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listNotesByDeal(
  opportunityId: string,
): Promise<ApiResult<{ notes: RepNote[] }>> {
  return jsonRequest<{ notes: RepNote[] }>(
    `/api/notes?opportunityId=${encodeURIComponent(opportunityId)}`,
    { method: "GET" },
  );
}

export async function updateNote(
  noteId: string,
  patch: UpdateRepNoteInput,
): Promise<ApiResult<{ note: RepNote }>> {
  return jsonRequest<{ note: RepNote }>(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteNote(
  noteId: string,
): Promise<ApiResult<{ crm_record_kept: boolean; external_activity_id: string | null }>> {
  return jsonRequest(`/api/notes/${noteId}`, { method: "DELETE" });
}
