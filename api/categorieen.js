export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.onlineafspraken.nl/v3/public/categories', {
  headers: {
    'apikey': process.env.API_KEY,
    'apisecret': process.env.API_SECRET
  }
});

    if (!response.ok) {
      return res.status(500).json({ error: 'Fout bij ophalen van categorieën' });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Serverfout', details: error.message });
  }
}
