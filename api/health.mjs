// api-src/health.ts
async function handler(_req, res) {
  try {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        service: "trip-os-server",
        version: "0.1.0",
        node: process.version,
        env: process.env.NODE_ENV ?? "unknown",
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasAiApiKey: !!process.env.AI_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        kvBound: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: `health handler error: ${msg}` }));
  }
}
export {
  handler as default
};
