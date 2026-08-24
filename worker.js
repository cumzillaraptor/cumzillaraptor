
// Subdomain routing for static assets:
//   mint.cumzillaraptor.com/*  -> /mint/...
//   claim.cumzillaraptor.com/* -> /claim/...
// apex + /mint/ + /claim/ paths keep working unchanged.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
