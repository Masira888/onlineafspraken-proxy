// api/onlineafspraken-proxy.js
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

// Haal de API keys uit omgevingsvariabelen van Netlify.
const ONLINE_AFSPRAKEN_API_KEY = process.env.ONLINE_AFSPRAKEN_API_KEY;
const ONLINE_AFSPRAKEN_API_SECRET = process.env.ONLINE_AFSPRAKEN_API_SECRET;
const ONLINE_AFSPRAKEN_AGENDA_ID = process.env.ONLINE_AFSPRAKEN_AGENDA_ID;

const xmlParserOptions = {
    ignoreAttributes: false,
    attributeNameProcessors: [(name) => name.startsWith('@_') ? name.substring(2) : name],
    isArray: (tagName, jPath, is=false) => {
        if (['AppointmentType', 'BookableDay', 'BookableTime'].indexOf(tagName) !== -1) return true;
        return is;
    }
};
const parser = new XMLParser(xmlParserOptions);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed', message: 'Deze proxy accepteert alleen POST-aanvragen.' });
        return;
    }

    if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET || !ONLINE_AFSPRAKEN_AGENDA_ID) {
        res.status(500).json({ error: 'Server Configuration Error', message: 'API keys zijn niet geconfigureerd in Netlify omgevingsvariabelen.' });
        return;
    }

    try {
        // Lees de body van de aanvraag (die van je frontend komt)
        const requestBody = req.body;
        
        // Genereer api_salt (timestamp in seconden)
        const apiSalt = Math.floor(Date.now() / 1000);

        // Bereid parameters voor de signatuurberekening voor
        // Kopieer alle parameters behalve api_key, api_salt, api_signature
        const paramsForSigning = { ...requestBody };
        delete paramsForSigning.api_key;
        delete paramsForSigning.api_salt;
        delete paramsForSigning.api_signature;

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

        // Bouw de uiteindelijke request body voor OnlineAfspraken.nl API
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
        console.error('Fout in onlineafspraken-proxy:', error); // AANGEPAST NAAR KLEINE LETTERS
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};