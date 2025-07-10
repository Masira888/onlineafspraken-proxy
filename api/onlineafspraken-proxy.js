// api/onlineafspraken-proxy.js

import axios from 'axios';
import CryptoJS from 'crypto-js';

export default async function handler(req, res) {
    // NIEUWE DEBUGGING LOGS: Controleren of environment variables worden gelezen
    console.log("--- Starting Proxy Handler ---");
    console.log("Environment Variables (from process.env):");
    console.log(`ONLINE_AFSPRAKEN_API_KEY: ${process.env.ONLINE_AFSPRAKEN_API_KEY ? 'Loaded' : 'Not Loaded'}`);
    console.log(`ONLINE_AFSPRAKEN_API_SECRET: ${process.env.ONLINE_AFSPRAKEN_API_SECRET ? 'Loaded' : 'Not Loaded'}`);
    console.log(`ONLINE_AFSPRAKEN_AGENDA_ID: ${process.env.ONLINE_AFSPRAKEN_AGENDA_ID || 'Not Provided'}`);
    console.log("-----------------------------");

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are accepted.' });
    }

    try {
        const ONLINE_AFSPRAKEN_API_KEY = process.env.ONLINE_AFSPRAKEN_API_KEY;
        const ONLINE_AFSPRAKEN_API_SECRET = process.env.ONLINE_AFSPRAKEN_API_SECRET;
        const ONLINE_AFSPRAKEN_AGENDA_ID = process.env.ONLINE_AFSPRAKEN_AGENDA_ID;

        // Eerste controle voor ontbrekende sleutels (deze genereert de fout die je eerder zag)
        if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET) {
            console.error("[Proxy Error] Missing API Key or Secret in environment variables. Check .env.local or Vercel UI.");
            return res.status(500).json({ error: 'Server Configuration Error', message: 'API Key or Secret is missing. Please check Vercel Environment Variables.' });
        }

        const API_URL = "https://agenda.onlineafspraken.nl/APIREST";
        const apiSalt = Math.floor(Date.now() / 1000);

        const requestedMethodFromFrontend = req.body.method;
        let paramsForSigning = {};
        let oaApiMethod = requestedMethodFromFrontend; // Standaard is de OA API methode gelijk aan de frontend methode

        console.log(`[Proxy] Received request for method from frontend: ${requestedMethodFromFrontend}`);

        switch (requestedMethodFromFrontend) {
            case 'getAppointmentType':
                oaApiMethod = "getAppointmentTypes";
                paramsForSigning = {
                    method: oaApiMethod,
                };
                break;

            case 'getAgendas': // NIEUWE CASE VOOR HET OPHALEN VAN ALLE AGENDA'S/KALENDERS
                oaApiMethod = "getAgendas";
                paramsForSigning = {
                    method: oaApiMethod,
                };
                break;

            case 'getBookableDays':
                const { appointmentTypeId: abd_appointmentTypeId, resourceId: abd_resourceId, startDate: abd_startDate, endDate: abd_endDate, agendaId: abd_agendaId } = req.body;

                if (!abd_appointmentTypeId) {
                    return res.status(400).json({ error: 'Bad Request', message: 'appointmentTypeId is required for getBookableDays.' });
                }
                // Controleer of AgendaId aanwezig is (uit body of env var)
                if (!abd_agendaId && !ONLINE_AFSPRAKEN_AGENDA_ID) {
                    return res.status(400).json({ error: 'Bad Request', message: 'Valid AgendaId is required for getBookableDays (either in request body or environment variables).' });
                }

                oaApiMethod = "getBookableDays";
                paramsForSigning = {
                    method: oaApiMethod,
                    AgendaId: abd_agendaId || ONLINE_AFSPRAKEN_AGENDA_ID, // Gebruik AgendaId uit body of uit env var.
                    AppointmentTypeId: abd_appointmentTypeId,
                };

                if (abd_resourceId) {
                    paramsForSigning.ResourceId = abd_resourceId;
                }
                if (abd_startDate) {
                    paramsForSigning.StartDate = abd_startDate;
                }
                if (abd_endDate) {
                    paramsForSigning.EndDate = abd_endDate;
                }
                break;

            case 'getBookableTimes':
                const { agendaId: abt_agendaId, date: abt_date, appointmentTypeId: abt_appointmentTypeId, resourceId: abt_resourceId, endDate: abt_endDate } = req.body;

                if (!abt_date || !abt_appointmentTypeId) {
                    return res.status(400).json({ error: 'Bad Request', message: 'Date and AppointmentTypeId are required for getBookableTimes.' });
                }
                // Controleer of AgendaId aanwezig is (uit body of env var)
                if (!abt_agendaId && !ONLINE_AFSPRAKEN_AGENDA_ID) {
                    return res.status(400).json({ error: 'Bad Request', message: 'Valid AgendaId is required for getBookableTimes (either in request body or environment variables).' });
                }

                oaApiMethod = "getBookableTimes";
                paramsForSigning = {
                    method: oaApiMethod,
                    AgendaId: abt_agendaId || ONLINE_AFSPRAKEN_AGENDA_ID, // Gebruik AgendaId uit body of uit env var.
                    Date: abt_date,
                    AppointmentTypeId: abt_appointmentTypeId,
                };

                if (abt_resourceId) {
                    paramsForSigning.ResourceId = abt_resourceId;
                }
                if (abt_endDate) {
                    paramsForSigning.EndDate = abt_endDate;
                }
                break;

            default:
                return res.status(400).json({ error: 'Bad Request', message: `Unknown or unsupported API method: ${requestedMethodFromFrontend}` });
        }

        // --- Signature berekening ---
        const sortedKeys = Object.keys(paramsForSigning).sort();
        let stringToSign = "";
        for (const key of sortedKeys) {
            stringToSign += key + paramsForSigning[key];
        }
        stringToSign += ONLINE_AFSPRAKEN_API_SECRET;
        stringToSign += apiSalt.toString();
        const apiSignature = CryptoJS.SHA256(stringToSign).toString();

        console.log(`[Proxy] String to sign: ${stringToSign}`);
        console.log(`[Proxy] Calculated Signature: ${apiSignature}`);

        // --- Request body constructie voor de OnlineAfspraken.nl API ---
        const requestBody = new URLSearchParams();
        requestBody.append('method', oaApiMethod);
        for (const key in paramsForSigning) {
            if (Object.prototype.hasOwnProperty.call(paramsForSigning, key) && key !== 'method') {
                requestBody.append(key, paramsForSigning[key]);
            }
        }
        requestBody.append('api_salt', apiSalt.toString());
        requestBody.append('api_signature', apiSignature);
        requestBody.append('api_key', ONLINE_AFSPRAKEN_API_KEY);

        console.log(`[Proxy] Sending request to OA API with body: ${requestBody.toString()}`);

        const response = await axios.post(API_URL, requestBody.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': '*/*', // Accept every type of response.
            },
        });

        // Send the received data (expected XML) directly back to the client.
        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(response.data);
        console.log(`[Proxy] Successfully sent response back to client for method: ${requestedMethodFromFrontend}`);

    } catch (error) {
        console.error("[Proxy] Error in OnlineAfspraken proxy:", error.message);

        // Detailed error handling.
        if (error.response) {
            console.error("[Proxy] API Response Data:", error.response.data);
            console.error("[Proxy] API Response Status:", error.response.status);
            // Try to return the status code and data from the external API.
            res.status(error.response.status).send(error.response.data);
        } else if (error.request) {
            console.error("[Proxy] No response received from API:", error.request);
            res.status(500).json({ error: 'No response from API', message: 'The request was made but no response was received from the OnlineAfspraken API. Check network or API availability.' });
        } else {
            console.error("[Proxy] Request setup error:", error.message);
            res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred during request setup: ' + error.message });
        }
    }
}