export function isAnonymousAuthEnabled() {
  return process.env.FLAG_ENABLE_ANONYMOUS_AUTH === "true";
}
