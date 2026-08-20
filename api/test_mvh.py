from http.server import BaseHTTPRequestHandler
import requests


class handler(BaseHTTPRequestHandler):

  def do_GET(self):
    url = "https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/gwc/service/wmts"

    params = {
        "viewparams": "VONEV:null;IGDAT:null",
        "SRS": "EPSG:23700",
        "layer": "iier:topo10",
        "style": "raster",
        "tilematrixset": "EOV_teszt",
        "Service": "WMTS",
        "Request": "GetTile",
        "Version": "1.0.0",
        "Format": "image/png",
        "TileMatrix": "EOV_teszt:4",
        "TileCol": "4",
        "TileRow": "7",
    }

    headers = {
        "accept": "application/json, text/plain, */*",
        "referer": "https://mepar.mvh.allamkincstar.gov.hu/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    cookies = {
        "ACCESS_TOKEN": "ide_masold_be_az_access_tokent",
        "REFRESH_TOKEN": "ide_masold_be_a_refresh_tokent",
        "CSRF_TOKEN": "q0Xe3BsWW9PkT8qMRqJxmpBor35L8gv0",
    }

    try:
      # Küldjük a kérést a Vercel szerveréről
      response = requests.get(
          url, params=params, headers=headers, cookies=cookies, timeout=10
      )

      # Visszaadjuk a választ a böngésződnek/hívónak
      self.send_response(response.status_code)
      self.send_header(
          "Content-Type", response.headers.get("content-type", "image/png")
      )
      self.end_headers()
      self.wfile.write(response.content)

    except Exception as e:
      self.send_response(500)
      self.end_headers()
      self.wfile.write(f"Hiba: {str(e)}".encode("utf-8"))