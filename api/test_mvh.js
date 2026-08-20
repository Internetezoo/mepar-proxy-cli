export default async function handler(req, res) {
  const targetUrl = "https://mepar.mvh.allamkincstar.gov.hu/";

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(10000) // 10 másodperc timeout
    });

    const html = await response.text();

    // Ha visszajön valami, kiírjuk HTML-ként a böngészőbe
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      cause: error.cause ? error.cause.message : "Ismeretlen hiba",
      code: error.code || "Nincs kód"
    });
  }
}
