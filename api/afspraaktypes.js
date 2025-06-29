export default async function handler(req, res) {
  const { categorieId } = req.query;

  if (!categorieId) {
    return res.status(400).json({ error: 'categorieId is verplicht' });
  }

  try {
    const response = await fetch(`https://api.onlineafspraken.nl/v3/public/categories/${categorieId}/appointment-types`, {
      headers: {
        'apikey': process.env.API_KEY,
    'apisecret': process.env.API_SECRET
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Fout bij ophalen van afspraaktypes' });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Serverfout', details: error.message });
  }
}
