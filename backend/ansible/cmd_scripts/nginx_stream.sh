#!/bin/bash

# Check if the arguments are empty
if [[ $# -lt 3 ]]; then
  echo "Please provide the stream conf string and the parent directory of Nginx and port number"
  #exit 1
fi

#echo $1
#echo "$1" | sed 's/#/=/g'
#echo "$1" | sed 's/#/=/g' | base64 --decode

#stream_string=$(echo "$1" | sed 's/#/=/g' | base64 --decode)
#stream_string=$(echo -n "$3" | xxd -r -p)

prefix="$2"
port="$3"

# Determine the installation path and pid file path of Nginx based on prefix
nginx_stream_file="$prefix/nginx/conf/nginx_server_stream.conf"

#echo $stream_string > $nginx_stream_file

echo "$1" | sed 's/#/=/g' | base64 --decode > $nginx_stream_file


$prefix/nginx/sbin/nginx  -t

echo "prefix: $prefix"
echo "port: $port"
