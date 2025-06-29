export default async function handler(req, res) {
  const { afspraakTypeId } = req.query;

  if (!afspraakTypeId) {
    return res.status(400).json({ error: 'afspraakTypeId is verplicht' });
  }

  try {
    const response = await fetch(`https://api.onlineafspraken.nl/v3/public/appointment-types/${afspraakTypeId}/bookable-days`, {
      headers: {
       'apikey': koah57olct71-klaz51,
       'apisecret': a048b2854f2d3be24fb695d6a8d199568fc96685
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Fout bij ophalen van beschikbaarheid' });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Serverfout', details: error.message });
  }
}
