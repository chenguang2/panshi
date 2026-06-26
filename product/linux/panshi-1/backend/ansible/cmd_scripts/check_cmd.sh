#!/bin/bash

# 检查是否提供了命令参数
if [ $# -eq 0 ]; then
    echo "No commands provided. Please provide a list of commands separated by commas."
    exit 1
fi

# 获取所有参数并将其合并为一个字符串
all_args="$*"

# 使用逗号作为分隔符将参数分割成数组
IFS=',' read -r -a cmd_array <<< "$all_args"


# 循环遍历数组中的每个命令
for cmd in "${cmd_array[@]}"; do
    # 去除命令两端可能存在的空格
    cmd=$(echo $cmd | xargs)

    # 检查命令是否存在
    if command -v $(echo $cmd | awk '{print $1}') > /dev/null 2>&1; then
        # 执行命令并输出结果
        output=$($cmd 2>&1)
        echo "$output"
    else
        # 如果命令不存在，给出提示信息
        echo "Command not found: $cmd"
    fi
done
