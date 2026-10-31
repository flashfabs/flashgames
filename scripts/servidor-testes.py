# Static file server for the end-to-end tests: python -m http.server with a larger listen backlog and kept-alive connections.
# On Windows the default backlog of 5 refuses connections when seven test browsers open the same page at once (the 8-player test), so they got ERR_CONNECTION_REFUSED.
# HTTP/1.1 lets a browser load a page's hundreds of files over a few connections: with HTTP/1.0 every file took a new connection, each one held a port for two minutes in TIME_WAIT on Windows, and busy runs on the PC ran out of ports (net::ERR_NO_BUFFER_SPACE on a module, and the page never started).
#   python3 scripts/servidor-testes.py <port> <folder>
import functools
import http.server
import sys


class Tratador(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # an idle kept-alive connection closes after this many seconds, so its thread does not linger
    timeout = 30


porta, pasta = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer.request_queue_size = 128
tratador = functools.partial(Tratador, directory=pasta)
with http.server.ThreadingHTTPServer(("127.0.0.1", porta), tratador) as servidor:
    servidor.serve_forever()
