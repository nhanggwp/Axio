# Private access to Axio

A standalone, loopback-only Node service serves the password page and validates signed cookies. Nginx checks that cookie for every application, API, static asset and tutorial request. It does not replace Axio's document/account login. The main application container and its database are unchanged.

The password stays out of Git. Store `/etc/axio-access/config.json` as root:axio-access, mode 640, in a directory with mode 750:

```json
{"origin":"https://axio.percytony.com","port":3018,"passwordHash":"scrypt:SALT_HEX:KEY_HEX","sessionSecret":"RANDOM_32_BYTE_HEX"}
```

Generate `passwordHash` using the exported `hashPassword` function and a password read through stdin. Never pass real passwords as command arguments or commit this configuration. A password-hash change invalidates existing cookies. Cookies expire after seven days and are HttpOnly, Secure, host-only and SameSite=Lax. `/access` also offers a button to lock the current browser again.

Upload this directory to the host and run `install.sh RELEASE_ID` as root. The host needs Node 18+ and Nginx's auth_request module. The installer preserves the existing access policy until the new service passes its health check, validates Nginx before reload, and rolls back to the old policy on failure. Backups live under `/opt/axio/access-backups/`.

The HTTPS server block must retain `include /etc/nginx/snippets/axio-private-access.conf;` during future deployments. Keep the main application port bound to loopback. Do not add an `auth_request off` exception for videos, assets or APIs. ACME challenges stay on the existing HTTP server block.

Run `npm run test:access` for session, redirect, origin, rate-limit and form-fallback checks. Browser checks should cover narrow screens, the eye button, wrong passwords, successful return to a deep link, native geometry loading and protected MP4 range requests.
