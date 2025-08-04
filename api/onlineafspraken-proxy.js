const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

// Get API keys from environment variables (as set in Netlify dashboard)
const ONLINE_AFSPRAKEN_API_KEY = process.env.ONLINE_AFSPRAKEN_API_KEY;
const ONLINE_AFSPRAKEN_API_SECRET = process.env.ONLINE_AFSPRAKEN_API_SECRET;
const ONLINE_AFSPRAKEN_AGENDA_ID = process.env.ONLINE_AFSPRAKEN_AGENDA_ID;


// XML parser configuration
const xmlParserOptions = {
    ignoreAttributes: false,
    attributeNameProcessors: [(name) => name.startsWith('@_') ? name.substring(2) : name],
    isArray: (tagName, jPath, is=false) => ['AppointmentType', 'BookableDay', 'BookableTime'].includes(tagName) || is
};
const parser = new XMLParser(xmlParserOptions);

// NETLIFY FUNCTION EXPORT!
exports.handler = async function(event, context) {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed', message: 'This proxy only accepts POST requests.' })
        };
    }

    // Check if API keys are set
    if (!ONLINE_AFSPRAKEN_API_KEY || !ONLINE_AFSPRAKEN_API_SECRET || !ONLINE_AFSPRAKEN_AGENDA_ID) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server Configuration Error', message: 'API keys are not set in environment variables.' })
        };
    }

    try {
        let requestBody;
        try {
            requestBody = JSON.parse(event.body || '{}');
            
        } catch (e) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON', message: 'The body could not be parsed as valid JSON.' })
            };
        }
        const apiSalt = Math.floor(Date.now() / 1000);

        const paramsForSigning = { ...requestBody };
        delete paramsForSigning.api_key;
        delete paramsForSigning.api_salt;
        delete paramsForSigning.api_signature;

        if (!paramsForSigning.method) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Bad Request', message: 'The "method" parameter is required.' })
            };
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
            return {
                statusCode: apiResponse.status,
                body: JSON.stringify({
                    error: 'API Request Failed',
                    message: `OnlineAfspraken.nl API error: ${apiResponse.statusText}`,
                    details: errorText,
                    statusCode: apiResponse.status
                })
            };
        }

        const xmlText = await apiResponse.text();
        let jsonData;
        try {
            jsonData = parser.parse(xmlText);
        } catch (xmlError) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'XML Parsing Error', message: 'Could not parse XML response.', details: xmlText })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(jsonData)
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
        };
    }
};