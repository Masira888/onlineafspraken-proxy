// api/get-appointment-types.js

import axios from 'axios';
import CryptoJS from 'crypto-js';

export default async function handler(req, res) {
    // Zorg ervoor dat alleen POST-verzoeken worden verwerkt, zoals in Postman
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are accepted.' });
    }

    try {
        // Haal API Key en Secret op uit omgevingsvariabelen
        const ONLINE_AFSPRAKEN_API_KEY = process.env.ONLINE_AFSPRAKEN_API_KEY;
        const ONLINE_AFSPRAKEN_API_SECRET = process.env.ONLINE_AFSPRAKEN_API_SECRET;

        // Valideer of de omgevingsvariabelen zijn ingesteld
        if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET) {
            console.error("Missing API Key or Secret in environment variables.");
            // Stuur een 500 error als de variabelen ontbreken
            return res.status(500).json({ error: 'Server Configuration Error', message: 'API Key or Secret is missing. Please check Vercel Environment Variables.' });
        }

        const API_URL = "https://agenda.onlineafspraken.nl/APIREST";
        const HTTP_METHOD = "POST"; // De methode voor de HTTP-aanroep

        // Genereer de unieke salt (timestamp in seconden)
        const apiSalt = Math.floor(Date.now() / 1000);

        // Definieer de parameters die meetellen voor de signature
        // BELANGRIJK: 'method' zonder 's' zoals in jouw werkende Postman test
        const paramsForSigning = {
            method: "getAppointmentType", // Correcte methode naam ZONDER 's'
        };

        // Bouw de stringToSign op zoals beschreven in de API documentatie en Postman
        // 1. Alfabetisch sorteren van parameter keys
        const sortedKeys = Object.keys(paramsForSigning).sort();
        let stringToSign = "";
        for (const key of sortedKeys) {
            stringToSign += key + paramsForSigning[key];
        }

        // 2. Voeg API SECRET en API SALT toe
        stringToSign += ONLINE_AFSPRAKEN_API_SECRET;
        stringToSign += apiSalt.toString(); // Salt moet als string toegevoegd worden

        // Bereken de SHA256 signature
        const apiSignature = CryptoJS.SHA256(stringToSign).toString();

        // Constructeer de request body voor de POST-aanroep (application/x-www-form-urlencoded)
        const requestBody = new URLSearchParams();
        // Voeg de parameters voor signing toe aan de body
        for (const key in paramsForSigning) {
            if (Object.prototype.hasOwnProperty.call(paramsForSigning, key)) {
                requestBody.append(key, paramsForSigning[key]);
            }
        }
        // Voeg api_salt en api_signature toe aan de body (zoals in Postman)
        requestBody.append('api_salt', apiSalt.toString());
        requestBody.append('api_signature', apiSignature);

        // Voer de POST-aanroep uit naar de OnlineAfspraken API
        const response = await axios.post(API_URL, requestBody.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': '*/*', // Aanpassen naar */* zoals in jouw Postman headers
                // 'User-Agent': 'OnlineAfsprakenVercelFunction', // Optioneel: een custom User-Agent toevoegen
            },
        });

        // Stuur de ontvangen data (waarschijnlijk XML) direct terug naar de client
        res.setHeader('Content-Type', 'application/xml'); // Zorg ervoor dat de content-type header correct is voor XML
        res.status(200).send(response.data);

    } catch (error) {
        // Foutafhandeling
        console.error("Error calling OnlineAfspraken API:", error.message);

        if (error.response) {
            // Foutrespons ontvangen van de OnlineAfspraken API zelf
            console.error("API Response Data:", error.response.data);
            console.error("API Response Status:", error.response.status);
            console.error("API Response Headers:", error.response.headers);
            // Stuur de status en data van de API-fout door naar de client
            res.status(error.response.status).send(error.response.data);
        } else if (error.request) {
            // Het verzoek is verzonden, maar er is geen antwoord ontvangen
            console.error("No response received from API:", error.request);
            res.status(500).json({ error: 'No response from API', message: 'The request was made but no response was received from the OnlineAfspraken API.' });
        } else {
            // Iets anders ging mis bij het instellen van het verzoek
            console.error("Request setup error:", error.message);
            res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred: ' + error.message });
        }
    }
}