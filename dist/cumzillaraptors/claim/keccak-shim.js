// keccak256 over vendored js-sha3.
// Browser: include /assets/vendor/js-sha3-0.9.3.min.js first — it sets window.keccak256 directly.
// Node tests: scripts/verify-site-client.mjs polyfills window with the npm package before import.
function getK() {
  const w = typeof window !== "undefined" ? window : globalThis;
  const k = w.keccak256;
  if (!k) throw new Error("js-sha3 not loaded — include the vendor script or polyfill window.keccak256 in node");
  return k;
}
export function keccak256(data) {
  let bytes;
  if (typeof data === "string") {
    const h = data.startsWith("0x") ? data.slice(2) : data;
    bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
  } else {
    bytes = new Uint8Array(data);
  }
  return "0x" + getK()(bytes);
}
export default keccak256;
