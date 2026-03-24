const VERCEL_BASE_URL = 'https://mepar-proxy-cli.vercel.app/api/tiles';
const VERCEL_CAPABILITIES_URL = 'https://mepar-proxy-cli.vercel.app/api/topo'; 

const MEPAR_HEADERS = {
    "Host": "mepar.mvh.allamkincstar.gov.hu",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://mepar.mvh.allamkincstar.gov.hu/",
};

const STATIC_WMTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0.0" xsi:schemaLocation="http://www.opengis.net/wmts/1.0 http://schemas.opengis.net/wmts/1.0/wmtsGetCapabilities_response.xsd">
    <ows:ServiceIdentification>
        <ows:Title>MEPAR Topo10 Proxy Service</ows:Title>
        <ows:Abstract>Optimized WMTS proxy for the iier:topo10 layer.</ows:Abstract>
        <ows:ServiceType>OGC WMTS</ows:ServiceType>
        <ows:ServiceTypeVersion>1.0.0</ows:ServiceTypeVersion>
    </ows:ServiceIdentification>
    <ows:OperationsMetadata>
        <ows:Operation name="GetCapabilities"><ows:DCP><ows:HTTP><ows:Get xlink:href="${VERCEL_CAPABILITIES_URL}" /></ows:HTTP></ows:DCP></ows:Operation>
        <ows:Operation name="GetTile"><ows:DCP><ows:HTTP><ows:Get xlink:href="${VERCEL_BASE_URL}" /></ows:HTTP></ows:DCP></ows:Operation>
    </ows:OperationsMetadata>
    <Contents>
        <Layer>
            <ows:Title>Topo 10</ows:Title>
            <ows:Identifier>iier:topo10</ows:Identifier>
            <Style isDefault="true"><ows:Identifier>raster</ows:Identifier></Style>
            <Format>image/png</Format>
            <TileMatrixSetLink><TileMatrixSet>EPSG:3857</TileMatrixSet></TileMatrixSetLink>
            <ResourceURL format="image/png" resourceType="tile" template="${VERCEL_BASE_URL}?LAYER=iier:topo10&amp;FORMAT={Format}&amp;TileMatrixSet={TileMatrixSet}&amp;TileMatrix={TileMatrix}&amp;TileRow={TileRow}&amp;TileCol={TileCol}"/>
        </Layer>
        <TileMatrixSet>
            <ows:Identifier>EPSG:3857</ows:Identifier>
            <ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
            ${Array.from({ length: 19 }, (_, i) => {
                const matrixSize = Math.pow(2, i);
                const scaleDenominator = 5.590822640280455E8 / matrixSize;
                return `<TileMatrix><ows:Identifier>EPSG:3857:${i}</ows:Identifier><ScaleDenominator>${scaleDenominator}</ScaleDenominator><TopLeftCorner>-20037508.342789244 20037508.342789244</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>${matrixSize}</MatrixWidth><MatrixHeight>${matrixSize}</MatrixHeight></TileMatrix>`;
            }).join('\n')}
        </TileMatrixSet>
    </Contents>
</Capabilities>`;

module.exports = async (req, res) => {
    try {
        let finalXml = STATIC_WMTS_XML.replace(/<script[^>]*\/>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();
        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(finalXml);
    } catch (error) {
        res.status(500).send(`Hiba: ${error.message}`);
    }
};
