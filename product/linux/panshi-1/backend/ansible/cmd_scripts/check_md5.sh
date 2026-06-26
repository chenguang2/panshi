#!/bin/bash

# Check if the port argument is provided
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <prefix> <port> <plugins>"
  exit 1
fi

prefix="$1"
port="$2"

if [[ -z "$3" || "$3" = "all" ]]; then
    plugins="*"
else
    plugins="$3*"
fi

cd "$prefix/nginx/edge/plugins"
find . -name "$plugins"  -exec md5deep -rl {} \;

echo "prefix: $prefix"
echo "port: $port"

