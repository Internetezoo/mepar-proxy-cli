const proj4 = require('proj4');

proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0.0,0.0,0.0,0.0 +units=m +no_defs");

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';
const TARGET_CRS = 'EPSG:23700'; 
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; 

// A böngészőből kimásolt érvényes azonosítók (Environment variable-ként érdemes tárolni)
const AUTH_COOKIE = process.env.MEPAR_COOKIE || 'ACCESS_TOKEN=eyJhbGci...; REFRESH_TOKEN=eyJhbGci...; CSRF_TOKEN=q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0';
const CSRF_TOKEN = process.env.MEPAR_CSRF || 'q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0';

function calculateBboxFromTile(matrixId, tileRow, tileCol) {
    try {
        const parts = String(matrixId).split(':');
        const zoom = parseInt(parts[parts.length - 1]); 
        const row = parseInt(tileRow);
        const col = parseInt(tileCol);

        if (isNaN(zoom) || isNaN(row) || isNaN(col)) return null;

        const resolution = (2 * MAX_EXTENT) / (TILE_SIZE * Math.pow(2, zoom));
        const minX = -MAX_EXTENT + (col * TILE_SIZE * resolution);
        const maxY = MAX_EXTENT - (row * TILE_SIZE * resolution);
        const maxX = minX + (TILE_SIZE * resolution);
        const minY = maxY - (TILE_SIZE * resolution);

        return { minX, minY, maxX, maxY };
    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    try {
        let { LAYER, LAYERS, FORMAT, BBOX, TileMatrix, TileRow, TileCol } = req.query;
        let sourceCRS = req.query.CRS || 'EPSG:3857';

        const targetLayer = LAYERS || LAYER || 'iier:topo10';
        let minX, minY, maxX, maxY;

        if (TileMatrix !== undefined && TileRow !== undefined && TileCol !== undefined) {
            const coords = calculateBboxFromTile(TileMatrix, TileRow, TileCol);
            if (!coords) return res.status(400).send('Érvénytelen TileMatrix/Row/Col');
            ({ minX, minY, maxX, maxY } = coords);
        } else if (BBOX) {
            const parts = BBOX.split(',').map(Number);
            if (parts.length !== 4) return res.status(400).send('Hibás BBOX formátum');
            [minX, minY, maxX, maxY] = parts;
        } else {
            return res.status(400).send('Hiányzó BBOX vagy Tile paraméterek');
        }

        const [eovMinX, eovMinY] = proj4(sourceCRS, TARGET_CRS, [minX, minY]);
        const [eovMaxX, eovMaxY] = proj4(sourceCRS, TARGET_CRS, [maxX, maxY]);
        const eovBBOX = `${eovMinX.toFixed(4)},${eovMinY.toFixed(4)},${eovMaxX.toFixed(4)},${eovMaxY.toFixed(4)}`;

        // KÖTELEZŐ AUTH FEJLÉCEK MÁSOLÁSA
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
            "Cookie": AUTH_COOKIE,
            "x-csrf-token": CSRF_TOKEN,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin"
        };

        const wmsQueryParams = new URLSearchParams({
            LAYERS: targetLayer,
            STYLES: 'raster', 
            FORMAT: 'image/png',
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
            return res.status(proxyResponse.status).send(`MEPAR Elutasítva: ${errorText}`);
        }

        const buffer = await proxyResponse.arrayBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); 
        return res.status(200).send(Buffer.from(buffer));
        
    } catch (error) {
        return res.status(500).send(`Szerver hiba: ${error.message}`);
    }
};
