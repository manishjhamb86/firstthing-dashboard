#!/usr/bin/env node
// Keeps the dev database reachable.
//
// Dev runs against `firsthing_dev` on the zenovaa server rather than a local
// Docker container. The server's Postgres refuses remote connections at the
// pg_hba level — which is right, and not worth weakening for a dev box whose
// IP changes — so the connection goes through SSH instead. Nothing is
// exposed, and no credential leaves the two machines that already have it.
//
// 5433, not 5432: another project's Postgres already holds 5432 here, and
// pointing at that one is how you spend twenty minutes wondering why a table
// does not exist.
import { spawnSync } from "node:child_process";
import net from "node:net";

const LOCAL_PORT = 5433;
const REMOTE = "zenovaa";

function isUp(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(1500, () => {
      s.destroy();
      resolve(false);
    });
  });
}

export async function ensureTunnel({ quiet = false } = {}) {
  if (await isUp(LOCAL_PORT)) {
    if (!quiet) console.log(`db tunnel: already up on ${LOCAL_PORT}`);
    return true;
  }
  // -f backgrounds it, -N runs no command, so it is a pure port forward.
  // Keepalives matter: a forward that dies quietly comes back as
  // "Connection refused" on the next query, which reads like the database is
  // gone rather than the tunnel.
  const r = spawnSync(
    "ssh",
    [
      "-f",
      "-N",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-L", `${LOCAL_PORT}:localhost:5432`,
      REMOTE,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    console.error(`db tunnel: could not open ${LOCAL_PORT} -> ${REMOTE}:5432`);
    return false;
  }
  for (let i = 0; i < 20; i++) {
    if (await isUp(LOCAL_PORT)) {
      if (!quiet) console.log(`db tunnel: up on ${LOCAL_PORT}`);
      return true;
    }
    await new Promise((r2) => setTimeout(r2, 250));
  }
  console.error("db tunnel: opened but never accepted a connection");
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await ensureTunnel();
  process.exit(ok ? 0 : 1);
}
