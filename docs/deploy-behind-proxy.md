# Deploying behind Caddy or nginx

OpenHabits serves a web application and optional API endpoints. Put a reverse
proxy in front of the application and forward the original host and protocol
headers so secure cookies and absolute links retain the public URL.

For Caddy, proxy the public hostname to the application port and let Caddy
manage TLS. For nginx, configure the equivalent `proxy_pass` and forward
`Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`. Keep the application port
private and verify the health route through the public hostname after reload.

Do not expose development servers directly to the internet. Keep secrets in
the deployment environment rather than in this repository.
