# Deployment

GoodForm runs at **https://goodform.visharka.us** on a 1 vCPU / 512MB DigitalOcean
droplet, behind Caddy, as a systemd service, against PostgreSQL 16 on the same box.

## How a deploy happens

Push to `main` → `.github/workflows/deploy.yml`:

1. Install, typecheck, lint, test, build — all in CI. **Nothing is built on the
   VPS.** With 457MB of RAM it cannot run a package manager and a TypeScript
   compiler without swapping itself to a standstill.
2. `server/scripts/bundle.mjs` bundles the API, the migrator and the seeder into
   three standalone ESM files. The release is those files plus `drizzle/` and
   `web/dist` — a few megabytes, no `node_modules`.
3. The tarball is copied over SSH and unpacked into
   `/opt/goodform/releases/<sha>/` — beside the running release, not over it.
4. Migrations and the food seed run against the new code.
5. `/opt/goodform/current` is swapped to the new release and the service
   restarts.
6. The release is **health-gated**: if `/api/health` does not come back within
   60 seconds, the symlink goes back to the previous release, the service
   restarts, and the job fails. The site stays up.
7. The last five releases are kept, so there is always a rollback target.

## Layout on the box

```
/opt/goodform/
  .env                    secrets, 0600, owned by the service user
  current -> releases/<sha>
  releases/<sha>/
    index.js  migrate.js  seed.js   bundled server
    drizzle/                        migration SQL
    web/dist/                       built SPA
    REVISION                        the commit this came from
```

## Secrets

Application secrets live **only** in `/opt/goodform/.env` on the box, never in
GitHub. GitHub holds just what CI needs to reach the machine:

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | droplet IP |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_SSH_KEY` | private half of a deploy-only ed25519 key |
| `DEPLOY_KNOWN_HOSTS` | pinned host key, so a hijacked DNS answer cannot collect the private key |

## Operating it

```bash
systemctl status goodform
journalctl -u goodform -f
systemctl restart goodform

# Roll back by hand
ln -sfn /opt/goodform/releases/<older-sha> /opt/goodform/current.new
mv -Tf /opt/goodform/current.new /opt/goodform/current
systemctl restart goodform
```

The unit caps the app at `MemoryMax=320M` and Node's heap at 192MB. Steady state
is around 35MB, so that is a fence rather than a limit.

## Google OAuth

The production redirect URI must be registered in the Google Cloud console:

```
https://goodform.visharka.us/api/auth/callback/google
```

Until it is, the Google button returns `redirect_uri_mismatch`.
