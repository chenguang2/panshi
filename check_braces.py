import re
with open('frontend/src/views/ClusterList.vue', encoding='utf-8') as f:
    content = f.read()
m = re.search(r'<script setup[^>]*>(.*?)</script>', content, re.DOTALL)
script = m.group(1)
lines = script.split('\n')
net = 0
for i, line in enumerate(lines):
    s = re.sub(r'`[^`]*`', '', line)
    s = re.sub(r"'[^']*'", '', s)
    s = re.sub(r'"[^"]*"', '', s)
    s = re.sub(r'//.*', '', s)
    old = net
    net += s.count('{') - s.count('}')
    if net == 0 and old != 0:
        pass  # returned to 0
print(f'Total: {net}')
