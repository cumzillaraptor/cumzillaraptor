
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
// WebSocket hosts for the same clusters. @solana/web3.js derives its wsEndpoint
// from the http endpoint (https -> wss, same host), so rpc.cumzillaraptor.com
// MUST accept an Upgrade: websocket request. Without it every
// confirmTransaction() falls back to blockheight polling and only resolves when
// the blockhash expires (~60-90s), or never at all for durable-nonce txs.
const HELIUS_WS_HOSTS = {
  devnet: "wss://devnet.helius-rpc.com",
  mainnet: "wss://mainnet.helius-rpc.com",
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
  // WebSocket upgrade must be handled BEFORE the POST-only guard: the
  // subscription socket arrives as a GET with Upgrade: websocket, which the
  // guard used to answer with 405 (breaking all signature subscriptions).
  if ((request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
    return handleRpcWebSocket(request, env);
  }
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

// Proxy the JSON-RPC subscription WebSocket to Helius, keeping the API key
// server-side exactly like the POST path. Cloudflare Workers support this by
// forwarding the upgrade request and piping the returned socket.
//
// Browsers cannot set custom headers on a WebSocket handshake, so the client
// connects to wss://rpc.cumzillaraptor.com with no credentials and the key is
// attached here.
async function handleRpcWebSocket(request, env) {
  const apiKey = env.HELIUS_API_KEY;
  if (!apiKey) {
    return new Response("rpc proxy not configured (missing HELIUS_API_KEY)", { status: 503 });
  }
  const target = HELIUS_WS_HOSTS.devnet + "/?api-key=" + encodeURIComponent(apiKey);

  // Forward the handshake. Only the headers the upgrade needs are passed on;
  // notably we do NOT forward Origin/Cookie, so the key cannot be leaked back.
  const upgradeHeaders = new Headers();
  upgradeHeaders.set("Upgrade", "websocket");
  upgradeHeaders.set("Connection", "Upgrade");
  for (const h of ["Sec-WebSocket-Key", "Sec-WebSocket-Version",
    "Sec-WebSocket-Protocol", "Sec-WebSocket-Extensions"]) {
    const v = request.headers.get(h);
    if (v) upgradeHeaders.set(h, v);
  }

  let upstream;
  try {
    upstream = await fetch(target, { headers: upgradeHeaders });
  } catch (e) {
    return new Response("rpc websocket upstream unreachable", { status: 502 });
  }
  // 101 with a socket is the success case; anything else is an upstream refusal.
  if (upstream.status !== 101 || !upstream.webSocket) {
    return new Response("rpc websocket upstream refused (" + upstream.status + ")", { status: 502 });
  }
  return new Response(null, {
    status: 101,
    webSocket: upstream.webSocket,
    headers: upstream.headers,
  });
}
