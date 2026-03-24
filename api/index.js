const xml2js = require('xml2js');

// WMTS GetCapabilities URL
const wmtsUrl = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts?service=WMTS&request=GetCapabilities';

module.exports = async (req, res) => {
    try {
        const xmlResponse = await fetch(wmtsUrl);
        if (!xmlResponse.ok) {
            throw new Error(`WMTS API hiba: ${xmlResponse.status} a forrásból.`);
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
        if (!Array.isArray(tileMatrixSets)) { // <<< JAVÍTOTT SOR: Array.isArray
            tileMatrixSets = [tileMatrixSets];
        }

        const WGS84_TMS_DEFINITION = {
            'identifier': 'EPSG:3857',
            'supportedcrs': 'urn:ogc:def:crs:EPSG::3857',
        };
        
        if (!tileMatrixSets.some(tms => tms.identifier === 'EPSG:3857')) {
            tileMatrixSets.push(WGS84_TMS_DEFINITION);
        }

        // Válasz JSON-ként küldése
        res.status(200).json({
            status: 'success',
            message: 'A WMTS GetCapabilities sikeresen átalakítva, EOV és WGS84/3857 támogatás hozzáadva (JSON kimenet).',
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