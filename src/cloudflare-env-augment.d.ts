/** Secrets and vars configured on the Worker are on `env`; merge for typings. */
declare namespace Cloudflare {
  interface Env {
    PAYLOAD_SECRET?: string
    PAYLOAD_PUBLIC_SERVER_URL?: string
  }
}
