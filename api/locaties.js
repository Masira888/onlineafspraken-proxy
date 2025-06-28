export default async function handler(req, res) {
  const response = await fetch('https://api.onlineafspraken.nl/v3/public/locations', {
    headers: {
      'X-Api-Key': process.env.API_KEY,
      'X-Api-Secret': process.env.API_SECRET
    }
  });

  if (!response.ok) {
    return res.status(500).json({ error: 'Failed to fetch locations' });
  }

  const data = await response.json();
  res.status(200).json(data);
}
