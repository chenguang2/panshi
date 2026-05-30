#!/bin/bash

# Check if the arguments are empty
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <srcpath> <destpath>"
  exit 1
fi

srcpath="$1"
destpath="$2"

echo "$srcpath"
echo "$destpath"

unzip -o $srcpath -d $destpath

