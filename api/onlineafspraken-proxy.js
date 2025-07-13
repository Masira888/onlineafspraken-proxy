// api/Onlineafspraken-proxy.js

const crypto = require('crypto'); // Node.js ingebouwde module voor cryptografie
const { XMLParser } = require('fast-xml-parser'); // Vereist: `npm install fast-xml-parser`

// Haal de API keys uit omgevingsvariabelen van Vercel.
// DEZE VARIABELEN MOET JE LATER IN VERCEL INSTELLEn!
const ONLINE_AFSPRAKEN_API_KEY = process.env.ONLINE_AFSPRAKEN_API_KEY;
const ONLINE_AFSPRAKEN_API_SECRET = process.env.ONLINE_AFSPRAKEN_API_SECRET;
const ONLINE_AFSPRAKEN_AGENDA_ID = process.env.ONLINE_AFSPRAKEN_AGENDA_ID;

// Configureer de XML parser
const xmlParserOptions = {
    ignoreAttributes: false, // We willen attributen zoals <Id> meenemen
    attributeNameProcessors: [(name) => name.startsWith('@_') ? name.substring(2) : name], // Verwijder de `@_` prefix van attributen
    // Dit zorgt ervoor dat elementen die meerdere keren kunnen voorkomen, altijd als arrays worden geparsed
    // zelfs als er maar één element is, wat consistentie biedt.
    isArray: (tagName, jPath, is=false) => {
        // Pas dit aan als je merkt dat specifieke elementen niet goed geparsed worden als array
        // Voor nu, aanname dat 'AppointmentType', 'BookableDay', 'BookableTime' vaak meerdere kunnen zijn
        if (['AppointmentType', 'BookableDay', 'BookableTime'].indexOf(tagName) !== -1) return true;
        return is;
    }
};
const parser = new XMLParser(xmlParserOptions);

module.exports = async (req, res) => {
    // Zorg ervoor dat het een POST-aanvraag is
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed', message: 'Deze proxy accepteert alleen POST-aanvragen.' });
        return;
    }

    // Controleer of de API Keys zijn ingesteld
    if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET || !ONLINE_AFSPRAKEN_AGENDA_ID) {
        res.status(500).json({ error: 'Server Configuration Error', message: 'API keys zijn niet geconfigureerd in Vercel omgevingsvariabelen.' });
        return;
    }

    try {
        // De POST-body bevat de parameters voor de API-aanroep
        const requestBody = req.body;

        // Genereer api_salt (timestamp in seconden)
        const apiSalt = Math.floor(Date.now() / 1000);

        // Bereid parameters voor de signatuurberekening voor
        // Kopieer alle parameters behalve api_key, api_salt, api_signature
        const paramsForSigning = { ...requestBody };
        delete paramsForSigning.api_key;
        delete paramsForSigning.api_salt;
        delete paramsForSigning.api_signature;

        // Zorg ervoor dat de method parameter erin zit
        if (!paramsForSigning.method) {
            res.status(400).json({ error: 'Bad Request', message: 'De "method" parameter is verplicht.' });
            return;
        }

        // Sorteer de keys alfabetisch en bouw de string om te signeren
        const sortedKeys = Object.keys(paramsForSigning).sort();
        let stringToSign = "";
        for (const key of sortedKeys) {
            stringToSign += key + paramsForSigning[key];
        }

        stringToSign += ONLINE_AFSPRAKEN_API_SECRET;
        stringToSign += apiSalt.toString();

        // Bereken de api_signature met SHA256
        const apiSignature = crypto.createHash('sha256').update(stringToSign).digest('hex');

        // Bouw de uiteindelijke request body voor OnlineAfspraken.nl
        const finalApiRequestBody = new URLSearchParams();
        for (const key in paramsForSigning) {
            if (paramsForSigning.hasOwnProperty(key)) {
                finalApiRequestBody.append(key, paramsForSigning[key]);
            }
        }
        finalApiRequestBody.append('api_key', ONLINE_AFSPRAKEN_API_KEY);
        finalApiRequestBody.append('api_salt', apiSalt);
        finalApiRequestBody.append('api_signature', apiSignature);

        // Roept de externe OnlineAfspraken.nl API aan
        const apiResponse = await fetch('https://agenda.onlineafspraken.nl/APIREST', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/xml' // We vragen expliciet XML aan, gezien de API die levert
            },
            body: finalApiRequestBody.toString(),
        });

        // Controleer op HTTP fouten van de API zelf
        if (!apiResponse.ok) {
            const errorText = await apiResponse.text(); // Lees de rauwe respons voor debugging
            console.error('Error from OnlineAfspraken.nl API:', apiResponse.status, errorText);
            res.status(apiResponse.status).json({
                error: 'API Request Failed',
                message: `OnlineAfspraken.nl API gaf een fout: ${apiResponse.statusText}`,
                details: errorText,
                statusCode: apiResponse.status
            });
            return;
        }

        // Lees de XML respons
        const xmlText = await apiResponse.text();

        // Converteer XML naar JSON
        let jsonData;
        try {
            jsonData = parser.parse(xmlText);
        } catch (xmlError) {
            console.error('Fout bij parsen XML respons:', xmlError);
            res.status(500).json({ error: 'XML Parsing Error', message: 'Kon XML respons niet parsen.', details: xmlText });
            return;
        }

        // Stuur de geconverteerde JSON-respons door naar de front-end
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Fout in Onlineafspraken-proxy:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};