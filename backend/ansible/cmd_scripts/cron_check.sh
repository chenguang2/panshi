#!/bin/bash

# Check if the port argument is provided
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <prefix> <port>"
  exit 1
fi

prefix="$1"
port="$2"

cores=$(nproc)

# Determine the installation path and pid file path of Nginx based on prefix
nginx_install_path="$prefix/nginx"
nginx_pid_file="$nginx_install_path/logs/nginx.pid"

if [[ "$prefix" =~ "uap-edge"$ ]]; then
    nginx_pid_file="$prefix/logs/nginx.pid"
fi

# Get the pid of Nginx master process
get_nginx_master_pid() {
  if [[ -f $nginx_pid_file ]]; then
    cat "$nginx_pid_file"
  else
    echo ""
  fi
}

# Get the pids of Nginx worker processes
get_nginx_worker_pids() {
  local master_pid="$1"
  if [[ -n $master_pid ]]; then
    local worker_pids=$(pgrep -P "$master_pid" nginx)
    echo "$worker_pids"
  fi
}

# Check if the process with the given pid exists and is an Nginx process
is_nginx_process() {
  local pid="$1"
  ps -p "$pid" -o cmd= | grep -q "nginx"
}

# Check if the process with the given pid is running
is_pid_running() {
  local pid="$1"
  ps -p "$pid" >/dev/null 2>&1
}

nginx_master_pid=$(get_nginx_master_pid)
#echo "nginx_master_pid: $nginx_master_pid"

# Check if Nginx process exists
nginx_check() {
  local nginx_pid="$1"
  if [[ -z $nginx_pid ]]; then
    echo "Nginx process does not exist."
  elif is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
    echo "Nginx process (PID: $nginx_pid) is running."
    # Assemble the URL string with the given port
    local url="http://127.0.0.1:$port/edge/server_info"
    #echo "GET Edge Version URL: $url"
    # Call the URL using curl
    curl_result=$(curl -s -L "$url")
    echo "Edge version: $curl_result"
  else
    echo "The Nginx process with PID $nginx_pid does not exist or is not an Nginx process."
  fi
}

# Call nginx_check function to check Nginx process
nginx_check "$nginx_master_pid"

# Get CPU and memory usage for Nginx process and system
# Get CPU and memory usage for Nginx master process and its children
get_usage() {
  local master_pid="$1"
  local cores="$2" 
  local nginx_cpu_total=0
  local nginx_mem_total=0
  local system_cpu_total=0
  local system_mem_total=0


  while read -r pid ppid pcpu pmem; do
    if [[ $pid =~ ^[0-9]+$ ]]; then
      if [[ -n $master_pid ]]; then
        if [[ $pid -eq $master_pid || $ppid -eq $master_pid ]]; then
          # Accumulate CPU and memory usage for Nginx master process and its children
          nginx_cpu_total=$(echo "$nginx_cpu_total + $pcpu/$cores" | bc)
          nginx_mem_total=$(echo "$nginx_mem_total + $pmem" | bc)
        fi
      fi
      # Accumulate CPU and memory usage for all processes
      system_cpu_total=$(echo "$system_cpu_total + $pcpu/$cores" | bc)
      system_mem_total=$(echo "$system_mem_total + $pmem" | bc)
    fi
  done <<< "$(ps h -e -o pid,ppid,pcpu,pmem)"

  echo "$nginx_cpu_total $nginx_mem_total $system_cpu_total $system_mem_total"
}

# Get CPU and memory usage for Nginx master process and its children
usage_stats=$(get_usage "$nginx_master_pid" "$cores")
nginx_cpu_total=$(echo "$usage_stats" | awk '{print $1}')
nginx_mem_total=$(echo "$usage_stats" | awk '{print $2}')
system_cpu_total=$(echo "$usage_stats" | awk '{print $3}')
system_mem_total=$(echo "$usage_stats" | awk '{print $4}')

# Output total CPU and memory usage for Nginx process
echo "Total CPU usage for Nginx: $nginx_cpu_total%"
echo "Total memory usage for Nginx: $nginx_mem_total%"

# Output total CPU and memory usage for all processes
echo "Total CPU usage for all processes: $system_cpu_total%"
echo "Total memory usage for all processes: $system_mem_total%"
#
echo "prefix: $prefix"
echo "port: $port"

