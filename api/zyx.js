const proj4 = require('proj4');

// KRITIKUS FIX: EOV Definíció (pozíció fixálva)
proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +units=m +no_defs");

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';
const TARGET_CRS = 'EPSG:23700'; 
const SOURCE_CRS = 'EPSG:3857'; 
const INTERMEDIATE_CRS = 'EPSG:4326'; // Köztes rendszer a stabil transzformációhoz
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; 
const FETCH_TIMEOUT_MS = 20000; // ✅ IDŐTÚLLÉPÉS: 20 másodpercre állítva

// --- ÚJ: BEÁLLÍTOTT FEJLÉCEK ---
const MEPAR_HEADERS = {
    "Host": "mepar.mvh.allamkincstar.gov.hu",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "hu-HU,hu;q=0.9",
    "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
    "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
};

// Függvény a BBOX számításához Z/Y/X paraméterekből (EPSG:3857-re)
function calculateBboxFromTile(zoom, row, col) {
    const z = parseInt(zoom); 
    const r = parseInt(row);
    const c = parseInt(col);
    if (isNaN(z) || isNaN(r) || isNaN(c)) return null;

    const resolution = (2 * MAX_EXTENT) / (TILE_SIZE * Math.pow(2, z));
    
    const minX = -MAX_EXTENT + (c * TILE_SIZE * resolution);
    const maxY = MAX_EXTENT - (r * TILE_SIZE * resolution);
    
    const maxX = minX + (TILE_SIZE * resolution);
    const minY = maxY - (TILE_SIZE * resolution); 

    return {
        BBOX: `${minX},${minY},${maxX},${maxY}`,
        CRS: SOURCE_CRS,
        WIDTH: TILE_SIZE,
        HEIGHT: TILE_SIZE
    };
}

module.exports = async (req, res) => {
    // ✅ IDŐTÚLLÉPÉS: AbortController inicializálása
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
        let { LAYER, FORMAT, z, y, x, REQUEST, SERVICE, VERSION } = req.query;
        
        let BBOX, WIDTH, HEIGHT;
        const tileParams = calculateBboxFromTile(z, y, x);
        if (!tileParams) {
            return res.status(400).send('Érvénytelen z, y, vagy x paraméterek.');
        }
        BBOX = tileParams.BBOX;
        WIDTH = tileParams.WIDTH;
        HEIGHT = tileParams.HEIGHT;
        
        if (FORMAT && FORMAT.includes('{') && FORMAT.includes('}')) {
            FORMAT = 'image/png'; 
        }

        const bboxParts = BBOX.split(',').map(Number);
        const [minX_3857, minY_3857, maxX_3857, maxY_3857] = bboxParts;
        
        console.log(`[DEBUG] Input 3857 BBOX: ${BBOX}`);

        // Láncolt Transzformáció: 3857 -> 4326 -> 23700
        const [lonMin, latMin] = proj4(SOURCE_CRS, INTERMEDIATE_CRS, [minX_3857, minY_3857]);
        const [lonMax, latMax] = proj4(SOURCE_CRS, INTERMEDIATE_CRS, [maxX_3857, maxY_3857]);
        const [xMin, yMin] = proj4(INTERMEDIATE_CRS, TARGET_CRS, [lonMin, latMin]);
        const [xMax, yMax] = proj4(INTERMEDIATE_CRS, TARGET_CRS, [lonMax, latMax]);
        
        const eovBBOX = `${xMin.toFixed(8)},${yMin.toFixed(8)},${xMax.toFixed(8)},${yMax.toFixed(8)}`;
        
        console.log(`[DEBUG] Output EOV BBOX: ${eovBBOX}`);

        const wmsQueryParams = new URLSearchParams({
            LAYERS: LAYER,
            STYLES: 'raster', 
            FORMAT: FORMAT || 'image/png', 
            TRANSPARENT: true,
            SERVICE: SERVICE || 'WMS',
            VERSION: '1.1.1', 
            REQUEST: REQUEST || 'GetMap',
            SRS: TARGET_CRS, 
            BBOX: eovBBOX, 
            WIDTH: WIDTH || 256,
            HEIGHT: HEIGHT || 256,
        });

        const targetUrl = `${MEPAR_WMS_URL}?${wmsQueryParams.toString()}`;
        console.log(`[DEBUG] GeoServer URL: ${targetUrl}`);

        // --- FETCH HÍVÁS A FEJLÉCEKKEL ---
        const proxyResponse = await fetch(targetUrl, { 
            signal: controller.signal,
            headers: MEPAR_HEADERS
        });

        if (!proxyResponse.ok) {
            const errorBody = await proxyResponse.text();
            console.error(`GeoServer WMS Hiba: ${proxyResponse.status}`);
            return res.status(proxyResponse.status).send(`GeoServer Hiba: ${errorBody.substring(0, 500)}`);
        }

        res.setHeader('Content-Type', proxyResponse.headers.get('Content-Type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        
        const buffer = await proxyResponse.arrayBuffer();
        res.status(200).send(Buffer.from(buffer));
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return res.status(504).send(`KRITIKUS HIBA (504 Timeout): ${FETCH_TIMEOUT_MS}ms`);
        }
        res.status(500).send(`KRITIKUS HIBA: ${error.message}`);
    } finally {
        clearTimeout(timeoutId); 
    }
};