#!/bin/bash

# Check if the arguments are empty
if [[ $# -lt 3 ]]; then
  echo "Please provide the command to execute and the parent directory of Nginx and port number"
  exit 1
fi

command="$1"
prefix="$2"
port="$3"

# Determine the installation path and pid file path of Nginx based on prefix
nginx_install_path="$prefix/nginx"
nginx_pid_file="$nginx_install_path/logs/nginx.pid"

cmd_nginx_start="$nginx_install_path/sbin/nginx"
cmd_nginx_stop="$nginx_install_path/sbin/nginx -s stop"
cmd_nginx_reload="$nginx_install_path/sbin/nginx -s reload"

if [[ "$prefix" =~ "uap-edge"$ ]]; then
    nginx_pid_file="$prefix/logs/nginx.pid"
    cmd_nginx_start="$prefix/bin/edge start"
    cmd_nginx_stop="$prefix/bin/edge stop"
    cmd_nginx_reload="$prefix/bin/edge reload"
fi

# Get the pid of Nginx process
get_nginx_pid() {
  if [[ -f $nginx_pid_file ]]; then
    cat "$nginx_pid_file"
  else
    echo ""
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

# Start Nginx
nginx_start() {
  local nginx_pid=$(get_nginx_pid)
  if [[ -n $nginx_pid ]]; then
      if is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
        echo "Nginx process is already running (PID: $nginx_pid)."
        return
      else
        echo "An existing process with PID $nginx_pid exists, but it is not a valid Nginx process."
      fi
  fi

  $cmd_nginx_start
  local start_result=$?

  if [[ $start_result -eq 0 ]]; then
    nginx_pid=$(get_nginx_pid)
    if [[ -n $nginx_pid ]]; then
      if is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
        echo "Nginx started successfully (PID: $nginx_pid)."
      else
        echo "Nginx started successfully, but the validity of the new Nginx process PID could not be verified."
      fi
    else
      echo "Failed to get the new Nginx process PID."
    fi
  else
    echo "Failed to start Nginx. Error message: $start_result"
  fi
}


# Stop Nginx
nginx_stop() {
  local nginx_pid=$(get_nginx_pid)
  if [[ -z $nginx_pid ]]; then
    echo "Nginx process does not exist."
  elif is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
    $cmd_nginx_stop
    echo "Nginx process has been stopped."
  else
    echo "The Nginx process with PID $nginx_pid does not exist or is not an Nginx process."
  fi

  # Clean up leftover socket files that block restart
  local sock_dir="$prefix/logs/"
  if ls "$sock_dir"edge_*.sock 2>/dev/null; then
    rm -f "$sock_dir"edge_*.sock
    echo "Cleaned up stale socket files in $sock_dir"
  fi
}


# Reload Nginx configuration
nginx_reload() {
  local nginx_pid=$(get_nginx_pid)
  if [[ -z $nginx_pid ]]; then
    echo "Nginx process does not exist."
  elif is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
    $cmd_nginx_reload
    echo "Nginx configuration has been reloaded."
  else
    echo "The Nginx process with PID $nginx_pid does not exist or is not an Nginx process."
  fi
}


# Check if Nginx process exists
nginx_check() {
  local nginx_pid=$(get_nginx_pid)
  if [[ -z $nginx_pid ]]; then
    echo "Nginx process does not exist."
  elif is_pid_running "$nginx_pid" && is_nginx_process "$nginx_pid"; then
    echo "Nginx process (PID: $nginx_pid) is running."
  else
    echo "The Nginx process with PID $nginx_pid does not exist or is not an Nginx process."
  fi
}


# Execute command
case $command in
  "nginx_start")
    nginx_start
    ;;
  "nginx_stop")
    nginx_stop
    ;;
  "nginx_reload")
    nginx_reload
    ;;
  "nginx_check")
    nginx_check
    ;;
  *)
    echo "Invalid command: $command"
    ;;
esac

echo "prefix: $prefix"
echo "port: $port"