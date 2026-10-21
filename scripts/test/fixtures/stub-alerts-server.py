#!/usr/bin/env python3
"""Minimal stub of the CAP alerts backend, used by publish-demo-alerts tests.

Serves the two endpoints the script talks to:
  POST /alerts                     -> {"identifier": ..., "accepted": true, ...}
  GET  /alerts/<id>/distribution    -> {"severity": ..., "urgency": ..., "channels": [...]}

Usage: stub-alerts-server.py [port]
The port defaults to an OS-assigned free port; the chosen port is printed on
stdout as "PORT <n>" so the caller can read it back.
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

SEVERITY = {
    "ALERT-001": ("Extreme", "Immediate"),
    "ALERT-002": ("Severe", "Expected"),
    "ALERT-003": ("Moderate", "Expected"),
    "ALERT-004": ("Minor", "Future"),
    "ALERT-005": ("Unknown", "Past"),
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # keep the test output clean
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/alerts":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8", "replace")
        record = os.environ.get("STUB_RECORD_FILE")
        if record:
            with open(record, "a", encoding="utf-8") as fh:
                fh.write(raw + "\n")
        match = re.search(r"<identifier>([^<]*)</identifier>", raw)
        ident = match.group(1) if match else "UNKNOWN"
        self._json(
            200,
            {
                "identifier": ident,
                "accepted": True,
                "stored": True,
                "routed": False,
                "problems": [],
            },
        )

    def do_GET(self):
        match = re.match(r"^/alerts/([^/]+)/distribution$", self.path)
        if not match:
            self._json(404, {"error": "not found"})
            return
        ident = match.group(1)
        severity, urgency = SEVERITY.get(ident, ("unknown", "unknown"))
        self._json(
            200,
            {
                "severity": severity,
                "urgency": urgency,
                "channels": [
                    {"label": "email", "reached": 3, "rule": "R-EMAIL"},
                    {"label": "sms", "reached": 2, "rule": "R-SMS"},
                ],
            },
        )


def main():
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = 0
    server = HTTPServer(("127.0.0.1", port), Handler)
    sys.stdout.write("PORT %d\n" % server.server_address[1])
    sys.stdout.flush()
    server.serve_forever()


if __name__ == "__main__":
    main()
