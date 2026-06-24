#!/bin/bash
# Read edge.env file from the edge directory
# Usage: read_env.sh <edge_path>
# This script is copied to the remote host by ansible's script module
# and executed there, so it uses the remote system's native commands.

if [ $# -lt 1 ]; then
  echo "Usage: $0 <edge_path>"
  exit 1
fi

edge_path="$1"
env_file="${edge_path}/edge.env"

if [ -f "$env_file" ]; then
  cat "$env_file"
  exit 0
else
  echo "File not found: $env_file" >&2
  exit 1
fi
