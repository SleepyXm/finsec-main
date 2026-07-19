import { request } from "./auth";

export type SavedIndicator = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SavedIndicatorSource = SavedIndicator & {
  source: string;
};

export function saveIndicator(name: string, source: string) {
  return request<SavedIndicator>("/api/indicators", {
    method: "POST",
    body: JSON.stringify({ name, source }),
  });
}

export function listIndicators() {
  return request<SavedIndicator[]>("/api/indicators", { method: "GET" });
}

export function getIndicatorSource(id: string) {
  return request<SavedIndicatorSource>(`/api/indicators/${id}`, {
    method: "GET",
  });
}

export function deleteIndicator(id: string) {
  return request<void>(`/api/indicators/${id}`, {
    method: "DELETE",
  });
}
