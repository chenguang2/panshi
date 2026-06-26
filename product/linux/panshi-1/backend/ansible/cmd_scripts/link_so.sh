#!/bin/bash
#调用命令请使用绝对路径
cd /work/jboss/uapm/soft/uap/uap-edge/edge/lib
rm libmpaasencrypt.so
ln -s ../plugins/pre_process/mpaas/libmpaasencrypt.so .



#free -m
