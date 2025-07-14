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

module.exports = async (req, res) => { // DEZE REGEL IS CRUCIAAL
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed', message: 'Deze proxy accepteert alleen POST-aanvragen.' });
        return;
    }

    if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET || !ONLINE_AFSPRAKEN_AGENDA_ID) {
        res.status(500).json({ error: 'Server Configuration Error', message: 'API keys zijn niet geconfigureerd in Netlify omgevingsvariabelen.' });
        return;
    }

    try {
        const requestBody = req.body;
        const apiSalt = Math.floor(Date.now() / 1000);

        const paramsForSigning = { ...requestBody };
        delete paramsForSigning.api_key;
        delete paramsForSigning.api_salt;
        delete paramsForSigning.api_signature;

        if (!paramsForSigning.method) {
            res.status(400).json({ error: 'Bad Request', message: 'De "method" parameter is verplicht.' });
            return;
        }

        const sortedKeys = Object.keys(paramsForSigning).sort();
        let stringToSign = "";
        for (const key of sortedKeys) {
            stringToSign += key + paramsForSigning[key];
        }
        stringToSign += ONLINE_AFSPRAKEN_API_SECRET;
        stringToSign += apiSalt.toString();

        const apiSignature = crypto.createHash('sha256').update(stringToSign).digest('hex');

        const finalApiRequestBody = new URLSearchParams();
        for (const key in paramsForSigning) {
            if (paramsForSigning.hasOwnProperty(key)) {
                finalApiRequestBody.append(key, paramsForSigning[key]);
            }
        }
        finalApiRequestBody.append('api_key', ONLINE_AFSPRAKEN_API_KEY);
        finalApiRequestBody.append('api_salt', apiSalt);
        finalApiRequestBody.append('api_signature', apiSignature);

        const apiResponse = await fetch('https://agenda.onlineafspraken.nl/APIREST', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/xml'
            },
            body: finalApiRequestBody.toString(),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('Error from OnlineAfspraken.nl API:', apiResponse.status, errorText);
            res.status(apiResponse.status).json({
                error: 'API Request Failed',
                message: `OnlineAfspraken.nl API gaf een fout: ${apiResponse.statusText}`,
                details: errorText,
                statusCode: apiResponse.status
            });
            return;
        }

        const xmlText = await apiResponse.text();
        let jsonData;
        try {
            jsonData = parser.parse(xmlText);
        } catch (xmlError) {
            console.error('Fout bij parsen XML respons:', xmlError);
            res.status(500).json({ error: 'XML Parsing Error', message: 'Kon XML respons niet parsen.', details: xmlText });
            return;
        }

        res.status(200).json(jsonData);

    } catch (error) {
        console.error('Fout in onlineafspraken-proxy:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};