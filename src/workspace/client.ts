export type CloudDocument = {
  id: string;
  title: string;
  version: number;
  createdAt?: string;
  updatedAt: string;
  data?: string;
};
export async function documentRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/documents" + url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Không thể truy cập tài liệu.");
  return body as T;
}
