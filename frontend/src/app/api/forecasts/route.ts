export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return Response.json({ error: "Invalid forecast request." }, { status: 400 });
  }
  try {
    const payload: Record<string, unknown> = {};
    for (const key of ["category", "region", "sales_channel", "end", "horizon"]) {
      if (body[key] !== undefined && body[key] !== "") payload[key] = body[key];
    }
    const url = new URL("/forecasts", process.env.SALES_API_URL || "http://127.0.0.1:8000");
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) return Response.json({ error: "Forecast request could not be completed." },
      { status: [409, 422].includes(response.status) ? response.status : 503 });
    return Response.json(await response.json());
  } catch {
    return Response.json({ error: "Forecast service is temporarily unavailable." }, { status: 503 });
  }
}