#!/usr/bin/env python3
"""Local editing backend for the lab site. Started by ./edit.sh, never deployed.

The page served by `jekyll serve` (port 4000) tags each piece of text with the
field it comes from, e.g. data-edit="strands:0/projects/1/body". edit.js asks
this server for the raw value of that field, shows it in place, and posts the
new value back. Files are written with ruamel.yaml so comments, order and block
style survive; Jekyll notices the change and the page reloads itself.

Every save first copies the old file to .edits/ (gitignored), so nothing is lost.
"""
import io
import json
import os
import shutil
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

try:
    from ruamel.yaml import YAML
    from ruamel.yaml.scalarstring import FoldedScalarString, LiteralScalarString
except ImportError:
    sys.exit("The editor needs ruamel.yaml:  python3 -m pip install ruamel.yaml")
import yaml as plain_yaml  # only to check that what we wrote still parses

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {
    "home": "_data/home.yml",
    "strands": "_data/strands.yml",
    "people": "_data/people.yml",
}
ORIGINS = {"http://localhost:4000", "http://127.0.0.1:4000"}
PORT = 4001
BACKUPS = os.path.join(ROOT, ".edits")


def yaml_rt():
    y = YAML()
    y.preserve_quotes = True
    y.width = 4096
    y.indent(mapping=2, sequence=4, offset=2)
    return y


def parse_ref(ref):
    """'strands:0/projects/1/body' -> ('strands', ['0', 'projects', '1', 'body'])"""
    name, _, path = ref.partition(":")
    if name not in FILES:
        raise ValueError(f"unknown file {name!r}")
    return name, [s for s in path.split("/") if s != ""]


def step(node, seg):
    return node[int(seg)] if isinstance(node, list) else node[seg]


def label_for(name, doc, segs):
    """A readable breadcrumb: 'strands.yml · Musical structure › MaqamNet › body'."""
    parts, node = [], doc
    for i, seg in enumerate(segs):
        node = step(node, seg)
        if isinstance(node, dict) and (node.get("title") or node.get("name")):
            parts.append(str(node.get("title") or node.get("name")))
        elif i == len(segs) - 1 and not seg.isdigit():
            parts.append(seg)
    return f"{os.path.basename(FILES[name])} · " + " › ".join(parts)


def coerce(old, new):
    """Keep the field's YAML style: block text stays block text."""
    new = new.replace("\r\n", "\n")
    trailing = isinstance(old, str) and old.endswith("\n")
    if isinstance(old, FoldedScalarString):
        text = new.strip("\n")
        return FoldedScalarString(text + ("\n" if trailing else ""))
    if isinstance(old, LiteralScalarString) or "\n" in new.strip("\n"):
        text = new.strip("\n")
        return LiteralScalarString(text + ("\n" if trailing or not isinstance(old, str) else ""))
    return new.strip()


def load(name):
    y = yaml_rt()
    with open(os.path.join(ROOT, FILES[name]), encoding="utf-8") as f:
        return y, y.load(f)


def save(name, y, doc):
    path = os.path.join(ROOT, FILES[name])
    buf = io.StringIO()
    y.dump(doc, buf)
    text = buf.getvalue()
    plain_yaml.safe_load(text)  # refuse to write anything that does not parse
    os.makedirs(BACKUPS, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, os.path.join(BACKUPS, f"{os.path.basename(path)}.{stamp}"))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("edit: " + fmt % args + "\n")

    def cors(self):
        origin = self.headers.get("Origin")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def reply(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        origin = self.headers.get("Origin")
        return origin is None or origin in ORIGINS

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/edit.js":
            with open(os.path.join(ROOT, "scripts", "edit.js"), "rb") as f:
                return self.reply(200, f.read(), "text/javascript; charset=utf-8")
        if url.path != "/api/get":
            return self.reply(404, {"error": "not found"})
        if not self.allowed():
            return self.reply(403, {"error": "origin not allowed"})
        q = parse_qs(url.query)
        try:
            name, segs = parse_ref(q["ref"][0])
            _, doc = load(name)
            node = doc
            for s in segs:
                node = step(node, s)
            fields = [f for f in q.get("fields", [""])[0].split(",") if f]
            if fields:
                value = {f: str(node.get(f, "") or "") for f in fields}
            else:
                value = "" if node is None else str(node)
            return self.reply(200, {"value": value, "label": label_for(name, doc, segs)})
        except Exception as e:  # noqa: BLE001  (report anything back to the page)
            return self.reply(400, {"error": f"{type(e).__name__}: {e}"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/set":
            return self.reply(404, {"error": "not found"})
        if not self.allowed():
            return self.reply(403, {"error": "origin not allowed"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            name, segs = parse_ref(body["ref"])
            y, doc = load(name)
            if isinstance(body.get("value"), dict):
                node = doc
                for s in segs:
                    node = step(node, s)
                for key, val in body["value"].items():
                    val = val.strip() if "\n" not in val.strip("\n") else val
                    if val == "" and key in node and key not in ("name", "title", "label"):
                        del node[key]  # an empty optional field means "remove it"
                    elif val != "" or key in node:
                        node[key] = coerce(node.get(key), val)
            else:
                parent = doc
                for s in segs[:-1]:
                    parent = step(parent, s)
                key = int(segs[-1]) if isinstance(parent, list) else segs[-1]
                parent[key] = coerce(parent[key] if (isinstance(parent, list) or key in parent) else None, body["value"])
            save(name, y, doc)
            return self.reply(200, {"ok": True})
        except Exception as e:  # noqa: BLE001
            return self.reply(400, {"error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    print(f"edit server on http://127.0.0.1:{PORT} (writes {', '.join(FILES.values())})")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
