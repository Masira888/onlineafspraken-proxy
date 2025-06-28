# Onlineafspraken Proxy

Een eenvoudige Vercel-serverless functie om data op te halen van de OnlineAfspraken.nl API zonder API-key in de frontend te tonen.

## Inhoud

- `api/locaties.js`: de serverless functie
- `package.json`: basisprojectinstellingen

## Installatie

1. Upload dit project naar GitHub
2. Verbind het met Vercel
3. Voeg de environment variables toe:

- `API_KEY=koah57olct71-klaz51`
- `API_SECRET=a048b2854f2d3be24fb695d6a8d199568fc96685`

Na deployen is je proxy live op:

```
https://<jouw-vercel-url>/api/locaties
```
