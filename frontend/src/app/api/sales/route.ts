export async function GET(request: Request) {
  try {
    const url = new URL("/sales", process.env.SALES_API_URL || "http://127.0.0.1:8000");
    const query = new URL(request.url).searchParams;
    for (const key of ["category", "region", "sales_channel", "start", "end"]) {
      const value = query.get(key);
      if (value) url.searchParams.set(key, value);
    }
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Unavailable");
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Sales data is temporarily unavailable." }, { status: 503 });
  }
}