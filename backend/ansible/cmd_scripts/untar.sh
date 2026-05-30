#!/bin/bash
#调用命令请使用绝对路径
rm -rf /work/jboss/uapm/soft/uap

cd /work/jboss/uapm/soft/
tar -zxvf uap.tar.gz

rm -rf /work/jboss/uapm/soft/test-edge
cd /work/jboss/uapm/soft/
tar -zxvf test-edge.tar.gz




#free -m
