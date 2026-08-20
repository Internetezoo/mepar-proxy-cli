const proj4 = require('proj4');

// EOV (EPSG:23700) és WGS84 Mercator (EPSG:3857) aliasok
proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0.0,0.0,0.0,0.0 +units=m +no_defs");
proj4.defs("urn:ogc:def:crs:EPSG::3857", proj4.defs("EPSG:3857"));

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';
const TARGET_CRS = 'EPSG:23700';
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244;

// Fejlécek és sütik tisztítása (újsorok és felesleges szóközök eltávolítása)
function cleanHeader(val) {
    if (!val) return '';
    return String(val).replace(/[\r\n]+/g, '').trim();
}

function calculateBboxFromTile(matrixId, tileRow, tileCol) {
    try {
        // Zoom szint kinyerése stringből vagy számból
        const zoomMatches = String(matrixId).match(/\d+/g);
        if (!zoomMatches) return null;
        
        const zoom = parseInt(zoomMatches[zoomMatches.length - 1], 10);
        const row = parseInt(tileRow, 10);
        const col = parseInt(tileCol, 10);

        if (isNaN(zoom) || isNaN(row) || isNaN(col)) return null;

        const resolution = (2 * MAX_EXTENT) / (TILE_SIZE * Math.pow(2, zoom));
        const minX = -MAX_EXTENT + (col * TILE_SIZE * resolution);
        const maxY = MAX_EXTENT - (row * TILE_SIZE * resolution);
        const maxX = minX + (TILE_SIZE * resolution);
        const minY = maxY - (TILE_SIZE * resolution);

        return { minX, minY, maxX, maxY };
    } catch (e) {
        console.error("[BBOX ERROR]", e);
        return null;
    }
}

module.exports = async (req, res) => {
    try {
        let { LAYER, LAYERS, FORMAT, BBOX, TileMatrix, TileRow, TileCol } = req.query;
        let sourceCRS = req.query.CRS || 'EPSG:3857';

        // Normalizáljuk a CRS azonosítót a proj4 számára
        if (sourceCRS.includes('3857')) {
            sourceCRS = 'EPSG:3857';
        }

        const targetLayer = LAYERS || LAYER || 'iier:topo10';
        let minX, minY, maxX, maxY;

        // 1. Koordináták meghatározása (WMTS csempe vagy WMS BBOX alapján)
        if (TileMatrix !== undefined && TileRow !== undefined && TileCol !== undefined) {
            const coords = calculateBboxFromTile(TileMatrix, TileRow, TileCol);
            if (!coords) {
                return res.status(400).send('Érvénytelen TileMatrix/Row/Col paraméterek.');
            }
            ({ minX, minY, maxX, maxY } = coords);
        } else if (BBOX) {
            const parts = String(BBOX).split(',').map(Number);
            if (parts.length !== 4 || parts.some(isNaN)) {
                return res.status(400).send('Érvénytelen BBOX formátum.');
            }
            [minX, minY, maxX, maxY] = parts;
        } else {
            return res.status(400).send('Hiányzó BBOX vagy Tile paraméterek.');
        }

        // 2. Transzformáció EOV-ra (EPSG:23700)
        let p1, p2;
        try {
            p1 = proj4(sourceCRS, TARGET_CRS, [minX, minY]);
            p2 = proj4(sourceCRS, TARGET_CRS, [maxX, maxY]);
        } catch (projErr) {
            console.error("[PROJ4 ERROR]", projErr);
            return res.status(400).send(`Koordináta-konverziós hiba: ${projErr.message}`);
        }

        if (!p1 || !p2 || isNaN(p1[0]) || isNaN(p1[1]) || isNaN(p2[0]) || isNaN(p2[1])) {
            return res.status(400).send('A számított EOV koordináták érvénytelenek (NaN).');
        }

        const eovBBOX = `${p1[0].toFixed(4)},${p1[1].toFixed(4)},${p2[0].toFixed(4)},${p2[1].toFixed(4)}`;

        // 3. Tisztított munkamenet adatok
        const rawCookie = process.env.MEPAR_COOKIE || '';
        const rawCsrf = process.env.MEPAR_CSRF || '';

        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu"
        };

        if (rawCookie) headers["Cookie"] = cleanHeader(rawCookie);
        if (rawCsrf) headers["x-csrf-token"] = cleanHeader(rawCsrf);

        // 4. WMS kérés előkészítése
        const wmsQueryParams = new URLSearchParams({
            LAYERS: targetLayer,
            STYLES: 'raster',
            FORMAT: FORMAT || 'image/png',
            TRANSPARENT: 'TRUE',
            SERVICE: 'WMS',
            VERSION: '1.1.1',
            REQUEST: 'GetMap',
            SRS: TARGET_CRS,
            BBOX: eovBBOX,
            WIDTH: '256',
            HEIGHT: '256',
        });

        const targetUrl = `${MEPAR_WMS_URL}?${wmsQueryParams.toString()}`;
        const proxyResponse = await fetch(targetUrl, { headers });

        if (!proxyResponse.ok) {
            const errorText = await proxyResponse.text();
            console.error(`[MEPAR API HIBA] Status: ${proxyResponse.status}`, errorText);
            return res.status(proxyResponse.status).send(`MEPAR válaszhálózati hiba: ${proxyResponse.status}`);
        }

        const buffer = await proxyResponse.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).send(Buffer.from(buffer));

    } catch (fatalError) {
        // Minden egyéb kezeletlen hibát elkapunk és kiírunk a Vercel Logba
        console.error('[VERCEL FATAL ERROR]:', fatalError);
        return res.status(500).send(`Vercel Proxy Hiba: ${fatalError.message}`);
    }
};
