# Static file server for the end-to-end tests: python -m http.server with a larger listen backlog.
# On Windows the default backlog of 5 refuses connections when seven test browsers open the same page at once (the 8-player test), so they got ERR_CONNECTION_REFUSED.
#   python3 scripts/servidor-testes.py <port> <folder>
import functools
import http.server
import sys

porta, pasta = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer.request_queue_size = 128
tratador = functools.partial(http.server.SimpleHTTPRequestHandler, directory=pasta)
with http.server.ThreadingHTTPServer(("127.0.0.1", porta), tratador) as servidor:
    servidor.serve_forever()
