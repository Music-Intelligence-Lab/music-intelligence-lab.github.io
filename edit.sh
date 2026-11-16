#!/bin/bash
# Edit the site in place.
#   ./edit.sh        then open http://localhost:4000
# Outlined text is editable: click it, change it, Cmd+Enter. The YAML file is
# updated and the page reloads. Publish with ./deploy.sh when it looks right.
# Every save is backed up in .edits/ first.

cd "$(dirname "$0")" || exit 1

python3 scripts/edit_server.py &
EDIT_PID=$!
trap 'kill $EDIT_PID 2>/dev/null' EXIT INT TERM

( for i in $(seq 1 40); do
    curl -s -o /dev/null http://127.0.0.1:4000/ && { open http://localhost:4000/; break; }
    sleep 1
  done ) &

bundle exec jekyll serve --livereload --config _config.yml,_config.edit.yml
