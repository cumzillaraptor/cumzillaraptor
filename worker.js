
// Subdomain routing for static assets:
//   mint.cumzillaraptor.com/*  -> /mint/...
//   claim.cumzillaraptor.com/* -> /claim/...
// apex + /mint/ + /claim/ paths keep working unchanged.
//
// RPC proxy: rpc.cumzillaraptor.com forwards JSON-RPC to Helius. The Helius
// key lives ONLY in the Worker secret (HELIUS_API_KEY) — never in static JS.
const HELIUS_HOSTS = {
  devnet: "https://devnet.helius-rpc.com",
  mainnet: "https://mainnet.helius-rpc.com",
};
const RPC_HOST = "rpc.cumzillaraptor.com";
// basic abuse guard: only POST JSON-RPC bodies of sane size
const MAX_RPC_BODY = 1_000_000; // 1 MB — getAccountInfo responses fit easily

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === RPC_HOST) return handleRpc(request, env);

    const host = url.hostname;

    // with html_handling "none", resolve "/" and directory paths ourselves on every host
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/index.html";
    } else if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
    }

    if (host === "mint.cumzillaraptor.com" || host === "claim.cumzillaraptor.com") {
      const sub = host.split(".")[0]; // "mint" | "claim"
      // map root and unknown paths into the page's directory
      if (url.pathname === "/" || url.pathname === "") {
        url.pathname = "/" + sub + "/index.html";
      } else if (!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/config/") &&
                 !url.pathname.startsWith("/cumzillaraptors/") && !url.pathname.startsWith("/" + sub + "/")) {
        url.pathname = "/" + sub + url.pathname;
      }
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};

async function handleRpc(request, env) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // @solana/web3.js sends this client-identification header on every RPC call.
    // It must be accepted by the browser preflight or Connection requests fail.
    "Access-Control-Allow-Headers": "Content-Type, Solana-Client",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") {
    return json({ error: "POST only (JSON-RPC)" }, 405, cors);
  }
  const apiKey = env.HELIUS_API_KEY;
  if (!apiKey) {
    return json({ error: "rpc proxy not configured (missing HELIUS_API_KEY)" }, 503, cors);
  }
  let body;
  try {
    body = await request.text();
  } catch {
    return json({ error: "unreadable body" }, 400, cors);
  }
  if (!body.length || body.length > MAX_RPC_BODY) {
    return json({ error: "invalid body size" }, 413, cors);
  }
  // cluster chosen by the key's own network; devnet key -> devnet host
  const target = HELIUS_HOSTS.devnet + "/?api-key=" + encodeURIComponent(apiKey);
  const upstream = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const resp = new Response(upstream.body, upstream);
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
