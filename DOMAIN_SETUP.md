# Domain and search setup

The site currently uses `https://quran-frontend-sknr.onrender.com`. The frontend build reads `VITE_SITE_URL` and uses it for its canonical URL, structured organization data, and generated sitemap.

## Domain ideas

These are naming ideas only; their registration availability has not been checked:

- `madrasatabdullahomar.com`
- `abdullahomarquran.org`
- `ibnomarquran.com`

## Connect a domain

1. Register a domain you control.
2. Add it under the frontend service's **Custom Domains** in Render and add the DNS records Render provides at your domain registrar.
3. Set `VITE_SITE_URL` in the frontend service to the final HTTPS address, for example `https://your-domain.org`, then redeploy.
4. Add the domain to Google Search Console, verify ownership with the TXT record Google gives you, and submit `/sitemap.xml`.

The app keeps its existing Android application ID and iOS bundle ID so future updates continue to install over the existing app.
