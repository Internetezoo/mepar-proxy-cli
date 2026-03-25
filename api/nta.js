const proj4 = require('proj4');

// EOV (EPSG:23700) DEFINÍCIÓ (+towgs84 nélkül a stabil illeszkedésért)
proj4.defs("EPSG:23700", "+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67 +units=m +no_defs");

// KRITIKUS: A FÖMI NTA WMS CÉL-URL-JE (az OÉNY proxy mögött felfedezve)
const NTA_WMS_URL = 'http://tkp.fomi.hu/mapservice/nta/lf/teir/wms';

const TARGET_CRS = 'EPSG:23700'; 
const NTA_LAYER = 'ntalf'; // A réteg neve a GetMap kérésben
const TILE_SIZE = 256;
const MAX_EXTENT = 20037508.342789244; 
const FETCH_TIMEOUT_MS = 20000; 

// Függvény a BBOX számításához Web Mercator (EPSG:3857) csempeparaméterekből
function calculateBboxFromTile(matrixId, tileCol, tileRow) {
    const resolution = MAX_EXTENT * 2 / (TILE_SIZE * Math.pow(2, matrixId));
    
    const minX = -MAX_EXTENT + tileCol * TILE_SIZE * resolution;
    const maxY = MAX_EXTENT - tileRow * TILE_SIZE * resolution;
    
    const maxX = minX + TILE_SIZE * resolution;
    const minY = maxY - TILE_SIZE * resolution;
    
    return [minX, minY, maxX, maxY];
}

module.exports = async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
        const { z, y, x, FORMAT = 'image/png' } = req.query; // Alapértelmezett formátum beállítva

        // 1. FÁZIS: Validálás
        const zInt = parseInt(z);
        const yInt = parseInt(y);
        const xInt = parseInt(x);

        if (isNaN(zInt) || isNaN(yInt) || isNaN(xInt) || zInt < 0 || yInt < 0 || xInt < 0) {
            return res.status(400).send('Érvénytelen vagy hiányzó csempeparaméterek (z, x, y).');
        }

        // 2. FÁZIS: BBOX számítása (Web Mercatorban)
        const bbox3857 = calculateBboxFromTile(zInt, xInt, yInt);

        // 3. FÁZIS: Transzformálás EOV-ra (EPSG:23700)
        const [bbox3857_minX, bbox3857_minY, bbox3857_maxX, bbox3857_maxY] = bbox3857;
        
        const [eov_minX, eov_minY] = proj4('EPSG:3857', TARGET_CRS, [bbox3857_minX, bbox3857_minY]);
        const [eov_maxX, eov_maxY] = proj4('EPSG:3857', TARGET_CRS, [bbox3857_maxX, bbox3857_maxY]);

        // WMS BBOX formátum EOV-ban (CRS axis order)
        const final_bbox = `${eov_minX},${eov_minY},${eov_maxX},${eov_maxY}`;
        
        // 4. FÁZIS: WMS URL felépítése
        const targetUrl = `${NTA_WMS_URL}?service=WMS&request=GetMap&version=1.3.0&layers=${NTA_LAYER}&styles=&crs=${TARGET_CRS}&bbox=${final_bbox}&width=${TILE_SIZE}&height=${TILE_SIZE}&format=${FORMAT}&transparent=true`;
        
        // 5. FÁZIS: Kérés továbbítása a FÖMI szerver felé
        const proxyResponse = await fetch(targetUrl, { 
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                // A FÖMI saját térképi portáljára vagy aldomainjére hivatkozunk
                'Referer': 'http://tkp.fomi.hu/mapservice/nta/', 
                'Origin': 'http://tkp.fomi.hu',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Connection': 'keep-alive'
            }
        });

        // 6. FÁZIS: Csempe visszaküldése
        res.setHeader('Content-Type', proxyResponse.headers.get('Content-Type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800'); 
        
        const buffer = await proxyResponse.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);
        
        res.status(200).send(imageBuffer);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return res.status(504).send(`KRITIKUS HIBA (504 Timeout): A szerver nem válaszolt a megadott ${FETCH_TIMEOUT_MS}ms időn belül.`);
        }
        console.error('API hiba a csempe feldolgozás során:', error);
        res.status(500).send(`KRITIKUS HIBA: Hiba történt a proxyzás során: ${error.message}`);
    } finally {
        clearTimeout(timeoutId); 
    }
};
