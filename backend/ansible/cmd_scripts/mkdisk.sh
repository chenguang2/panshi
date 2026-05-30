#!/bin/bash


# 注意：在运行脚本之前，请确保您已备份好/dev/sdb中的重要数据。

# 创建分区表
#echo  "o\n" | fdisk /dev/sdb

# 创建新分区
#echo "n\np\n1\n\n\nw\n" | fdisk /dev/sdb

#printf 'n\np\n1\n\n\nw\n' | fdisk /dev/sdb

# 格式化分区为 ext4 文件系统
#mkfs.ext4 /dev/sdb1

#mkdir  /work

# 挂载分区到指定目录
#mount /dev/sdb1 /work

# 可选：将分区挂载配置添加到 /etc/fstab，实现开机自动挂载
#echo "/dev/sdb1   /work   ext4   defaults   0   2" >> /etc/fstab

#UUID=$(blkid /dev/vdb1 | awk -F"\"" '{print $2}')
#echo "UUID=$UUID /work ext4 defaults 1 1" >> /etc/fstab




