#!/bin/bash

#调用命令请使用绝对路径

mkdir /work

# 添加组
groupadd jboss

# 添加用户
useradd -d /work/jboss -g jboss -p '$6$iN.SGDwZ$kscEB5ff6yYkHLQSMabxa6qHLQ1NUHa51/a9Wz1jR6enlUcgK19HjLcNhke86jqOjSXCrGLwCRJpjFeooqLU3.' jboss

# 注：此加密密码为：jboss@12306

chown jboss:jboss /work