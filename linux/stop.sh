#!/bin/bash

echo "Stopping Panshi Admin..."

if [ -f /tmp/panshi_backend.pid ]; then
    kill $(cat /tmp/panshi_backend.pid) 2>/dev/null || true
    rm /tmp/panshi_backend.pid
fi

if [ -f /tmp/panshi_frontend.pid ]; then
    kill $(cat /tmp/panshi_frontend.pid) 2>/dev/null || true
    rm /tmp/panshi_frontend.pid
fi

lsof -ti:9000 | xargs kill -9 2>/dev/null || true
lsof -ti:9100 | xargs kill -9 2>/dev/null || true

echo "Panshi Admin stopped."
