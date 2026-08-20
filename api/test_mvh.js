export default async function handler(req, res) {
  const targetUrl = "https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?viewparams=VONEV:null;IGDAT:null&SRS=EPSG:23700&layer=iier:topo10&style=raster&tilematrixset=EOV_teszt&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix=EOV_teszt:4&TileCol=4&TileRow=7";

  const cookieString = [
    "ACCESS_TOKEN=ide_masold_be_az_access_tokent",
    "REFRESH_TOKEN=ide_masold_be_a_refresh_tokent",
    "CSRF_TOKEN=q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0"
  ].join("; ");

  const startTime = Date.now();

  try {
    console.log(`[DEBUG] Kérés indítása ide: ${targetUrl} időpont: ${new Date().toISOString()}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
        "referer": "https://mepar.mvh.allamkincstar.gov.hu/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "cookie": cookieString,
        "x-csrf-token": "q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0"
      },
      // Ha szeretnéd, növelhetjük a timeout-ot is (pl. 15 másodpercre)
      signal: AbortSignal.timeout(15000) 
    });

    const duration = Date.now() - startTime;
    console.log(`[DEBUG] Válasz érkezett ${duration}ms alatt. Státusz: ${response.status}`);

    const text = await response.text();
    return res.status(200).json({
      success: true,
      status: response.status,
      durationMs: duration,
      responsePreview: text.substring(0, 200)
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[DEBUG Hiba] ${duration}ms után elszállt:`, error);

    return res.status(500).json({
      success: false,
      durationMs: duration,
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorErrno: error.errno || null,
      errorSyscall: error.syscall || null,
      errorCause: error.cause ? {
        message: error.cause.message,
        code: error.cause.code,
        errno: error.cause.errno,
        address: error.cause.address,
        port: error.cause.port
      } : null
    });
  }
}
