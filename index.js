const xml2js = require('xml2js');

// WMTS GetCapabilities URL
const wmtsUrl = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?service=WMTS&request=GetCapabilities';

module.exports = async (req, res) => {
    try {
        // Fejlécek beállítása a kéréshez
        const headers = {
            "Host": "mepar.mvh.allamkincstar.gov.hu",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
            "Origin": "https://mepar.mvh.allamkincstar.gov.hu",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Upgrade-Insecure-Requests": "1",
        };

        const xmlResponse = await fetch(wmtsUrl, { headers });
        
        if (!xmlResponse.ok) {
            throw new Error(`WMTS API hiba: ${xmlResponse.status} a forrásból.`);
        }
        
        const xmlText = await xmlResponse.text();

        // BOM eltávolítása, ha szükséges
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

        const WGS84_TMS_LINK = { 'TileMatrixSet': 'EPSG:3857' };
        const EOV_TMS_LINK = { 'TileMatrixSet': 'default028mm' }; 

        const layers = layerArray.map(layer => {
            let links = layer.tilematrixsetlink;
            if (!Array.isArray(links)) {
                links = [links];
            }
            
            if (!links.some(l => l.TileMatrixSet === 'EPSG:3857')) {
                links.push(WGS84_TMS_LINK);
            }
            if (!links.some(l => l.TileMatrixSet === 'default028mm')) {
                links.push(EOV_TMS_LINK);
            }

            const rawIdentifier = layer.identifier || '';
            const cleanIdentifier = rawIdentifier.includes(':') 
                ? rawIdentifier.split(':').pop() 
                : rawIdentifier;

            return {
                title: layer.title || 'Nincs Cím',
                identifier: cleanIdentifier,
                tilematrixsetlinks: links.map(link => link.tilematrixset)
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

        res.status(200).json({
            status: 'success',
            message: 'A WMTS GetCapabilities sikeresen átalakítva, EOV és WGS84/3857 támogatás hozzáadva.',
            layers: layers,
            tilematrixsets: tileMatrixSets.map(tms => tms.identifier)
        });

    } catch (error) {
        console.error('API hiba:', error);
        res.status(500).json({
            status: 'error',
            message: `Hiba történt az adatok feldolgozása során: ${error.message}`
        });
    }
};
