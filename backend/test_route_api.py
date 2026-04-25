import requests
import json

BASE_URL = "http://127.0.0.1:9000"

login_data = {"username": "admin", "password": "panshi123"}
resp = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data)
print("Login:", resp.status_code)
if resp.status_code != 200:
    print("Login failed:", resp.text)
    exit(1)

token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

print("\n=== Test Route with methods as array ===")
route_data = {
    "name": "test-route-array",
    "uri": "/api/*",
    "methods": ["GET", "POST"],
    "upstream_id": 1,
    "priority": 0,
    "status": 1
}
resp = requests.post(f"{BASE_URL}/api/v1/clusters/1/routes", json=route_data, headers=headers)
print(f"Create route (array methods): {resp.status_code}")
print("Response:", resp.text)

print("\n=== Test Route with methods as string ===")
route_data2 = {
    "name": "test-route-string",
    "uri": "/api2/*",
    "methods": "GET,POST",
    "upstream_id": 1,
    "priority": 0,
    "status": 1
}
resp = requests.post(f"{BASE_URL}/api/v1/clusters/1/routes", json=route_data2, headers=headers)
print(f"Create route (string methods): {resp.status_code}")
print("Response:", resp.text)

print("\n=== Test Route without methods ===")
route_data3 = {
    "name": "test-route-no-methods",
    "uri": "/api3/*",
    "priority": 0,
    "status": 1
}
resp = requests.post(f"{BASE_URL}/api/v1/clusters/1/routes", json=route_data3, headers=headers)
print(f"Create route (no methods): {resp.status_code}")
print("Response:", resp.text)

print("\n=== Test Route update ===")
route_data4 = {
    "name": "test-route-update",
    "uri": "/api4/*",
    "priority": 0,
    "status": 1
}
resp = requests.post(f"{BASE_URL}/api/v1/clusters/1/routes", json=route_data4, headers=headers)
if resp.status_code == 201:
    route_id = resp.json()["id"]
    update_data = {
        "name": "updated-route",
        "methods": "GET,PUT"
    }
    resp = requests.put(f"{BASE_URL}/api/v1/clusters/1/routes/{route_id}", json=update_data, headers=headers)
    print(f"Update route: {resp.status_code}")
    print("Response:", resp.text)

print("\n=== List routes ===")
resp = requests.get(f"{BASE_URL}/api/v1/clusters/1/routes", headers=headers)
print(f"List routes: {resp.status_code}")
data = resp.json()
print(f"Total: {data['total']}")
for r in data['items'][-3:]:
    print(f"  - {r['name']}: methods={r.get('methods')}")