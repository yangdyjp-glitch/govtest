export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data.error || "请求未完成");
  }
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data: any = await response.json();
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}
