import requests
import json

BASE_URL = "http://127.0.0.1:9000"

# Login
login_data = {"username": "admin", "password": "panshi123"}
resp = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data)
print("Login:", resp.status_code, resp.json())

if resp.status_code != 200:
    exit(1)

token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Test upstream with multiple targets
upstream_data = {
    "name": "test-upstream-multi",
    "load_balance": "roundrobin",
    "targets": [
        {"target": "192.168.1.10:8080", "weight": 100},
        {"target": "192.168.1.11:8080", "weight": 100},
        {"target": "192.168.1.12:9090", "weight": 200}
    ]
}

resp = requests.post(f"{BASE_URL}/api/v1/clusters/1/upstreams", json=upstream_data, headers=headers)
print("\nCreate upstream with targets:", resp.status_code)
if resp.status_code != 201:
    print("Error:", resp.text)
else:
    print("Success:", json.dumps(resp.json(), indent=2, ensure_ascii=False))

    upstream_id = resp.json()["id"]

    # Get upstream
    resp = requests.get(f"{BASE_URL}/api/v1/clusters/1/upstreams/{upstream_id}", headers=headers)
    print("\nGet upstream:", resp.status_code)
    print("Response:", json.dumps(resp.json(), indent=2, ensure_ascii=False))

    # Update upstream
    update_data = {
        "name": "updated-upstream",
        "targets": [
            {"target": "10.0.0.1:80", "weight": 50}
        ]
    }
    resp = requests.put(f"{BASE_URL}/api/v1/clusters/1/upstreams/{upstream_id}", json=update_data, headers=headers)
    print("\nUpdate upstream:", resp.status_code)
    if resp.status_code != 200:
        print("Error:", resp.text)
    else:
        print("Success:", json.dumps(resp.json(), indent=2, ensure_ascii=False))

    # List upstreams
    resp = requests.get(f"{BASE_URL}/api/v1/clusters/1/upstreams", headers=headers)
    print("\nList upstreams:", resp.status_code)
    data = resp.json()
    print(f"Total: {data['total']}")
    for u in data['items']:
        print(f"  - {u['name']}: {len(u.get('targets', []))} targets")