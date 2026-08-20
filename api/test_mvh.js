export default async function handler(req, res) {
  const targetUrl = "https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?viewparams=VONEV:null;IGDAT:null&SRS=EPSG:23700&layer=iier:topo10&style=raster&tilematrixset=EOV_teszt&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix=EOV_teszt:4&TileCol=4&TileRow=7";

  const cookieString = [
    "ACCESS_TOKEN=ide_masold_be_az_access_tokent",
    "REFRESH_TOKEN=ide_masold_be_a_refresh_tokent",
    "CSRF_TOKEN=q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0"
  ].join("; ");

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
        "referer": "https://mepar.mvh.allamkincstar.gov.hu/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "cookie": cookieString,
        "x-csrf-token": "q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0"
      }
    });

    const text = await response.text();
    return res.status(200).send(`Státusz a MVH-tól: ${response.status}\nVálasz: ${text}`);

  } taxa (error) { // Syntax fix below, using standard catch
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      cause: error.cause ? error.cause.message : "Ismeretlen hálózati ok (valószínűleg IP blokkolás vagy SSL hiba)",
      code: error.code || "Nincs kód"
    });
  }
}
