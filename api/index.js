const xml2js = require('xml2js');

// WMTS GetCapabilities URL
const wmtsUrl = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?service=WMTS&request=GetCapabilities';

// A tiles.js-ben is használt munkamenet azonosítók
const AUTH_COOKIE = process.env.MEPAR_COOKIE || 'ACCESS_TOKEN=eyJhbGci...; REFRESH_TOKEN=eyJhbGci...; CSRF_TOKEN=q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0';
const CSRF_TOKEN = process.env.MEPAR_CSRF || 'q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0';

module.exports = async (req, res) => {
    try {
        // Helyes, hitelesített fejlécek (Host nélkül!)
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
            "Cookie": AUTH_COOKIE,
            "x-csrf-token": CSRF_TOKEN,
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin"
        };

        const xmlResponse = await fetch(wmtsUrl, { headers });
        
        if (!xmlResponse.ok) {
            const errText = await xmlResponse.text();
            return res.status(xmlResponse.status).json({
                status: 'error',
                message: `MEPAR WMTS API hiba (${xmlResponse.status}): ${errText.substring(0, 300)}`
            });
        }
        
        const xmlText = await xmlResponse.text();
        const xmlClean = xmlText.startsWith('\ufeff') ? xmlText.substring(1) : xmlText;

        const parser = new xml2js.Parser({
            explicitArray: false,
            normalizeTags: true, 
            tagNameProcessors: [xml2js.processors.stripPrefix] 
        });

        const result = await parser.parseStringPromise(xmlClean);

        const contents = result.capabilities.contents;
        let layerArray = contents.layer;
        if (!Array.isArray(layerArray)) {
            layerArray = [layerArray];
        }

        const WGS84_TMS_LINK = { 'tilematrixset': 'EPSG:3857' };
        const EOV_TMS_LINK = { 'tilematrixset': 'default028mm' }; 

        const layers = layerArray.map(layer => {
            let links = layer.tilematrixsetlink;
            if (!links) {
                links = [];
            } else if (!Array.isArray(links)) {
                links = [links];
            }
            
            // normalizeTags miatt kisbetűs mezőnevek kezelése
            if (!links.some(l => (l.tilematrixset || l.TileMatrixSet) === 'EPSG:3857')) {
                links.push(WGS84_TMS_LINK);
            }
            if (!links.some(l => (l.tilematrixset || l.TileMatrixSet) === 'default028mm')) {
                links.push(EOV_TMS_LINK);
            }

            const rawIdentifier = layer.identifier || '';
            const cleanIdentifier = rawIdentifier.includes(':') 
                ? rawIdentifier.split(':').pop() 
                : rawIdentifier;

            return {
                title: layer.title || 'Nincs Cím',
                identifier: cleanIdentifier,
                tilematrixsetlinks: links.map(link => link.tilematrixset || link.TileMatrixSet)
            };
        });
        
        let tileMatrixSets = contents.tilematrixset;
        if (!Array.isArray(tileMatrixSets)) {
            tileMatrixSets = [tileMatrixSets];
        }

        const WGS84_TMS_DEFINITION = {
            'identifier': 'EPSG:3857',
            'supportedcrs': 'urn:ogc:def:crs:EPSG::3857',
        };
        
        if (!tileMatrixSets.some(tms => tms.identifier === 'EPSG:3857')) {
            tileMatrixSets.push(WGS84_TMS_DEFINITION);
        }

        return res.status(200).json({
            status: 'success',
            message: 'A WMTS GetCapabilities sikeresen átalakítva, EOV és WGS84/3857 támogatás hozzáadva.',
            layers: layers,
            tilematrixsets: tileMatrixSets.map(tms => tms.identifier)
        });

    } catch (error) {
        console.error('API hiba:', error);
        return res.status(500).json({
            status: 'error',
            message: `Hiba történt az adatok feldolgozása során: ${error.message}`
        });
    }
};
