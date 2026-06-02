# Panshi Admin User Guide

## Overview

Panshi Admin is a multi-cluster gateway management platform that provides unified configuration management for multiple PANSHI gateway clusters.

## Getting Started

### Login

1. Open http://localhost:3000
2. Enter your credentials:
   - Username: admin
   - Password: panshi123
3. Click "Login"

### Dashboard

After login, you'll see the Dashboard with:
- System statistics (clusters, upstreams, routes, users)
- Recent routes table
- Cluster status list

## User Management

### View Users

Navigate to **Users** in the sidebar to see all users.

### Add User

1. Click **Add User** button
2. Fill in the form:
   - Username (required)
   - Password (required)
   - Role: Admin or User
   - Status: Active or Inactive
3. Click **OK**

### Edit User

1. Click **Edit** button next to the user
2. Modify the fields
3. Click **OK**

### Reset Password

1. Click **Reset Password** button next to the user
2. Enter new password in the dialog
3. Click **OK**

### Delete User

1. Click **Delete** button next to the user
2. Confirm the deletion

## Cluster Management

### View Clusters

Navigate to **Clusters** in the sidebar.

### Add Cluster

1. Click **Add Cluster** button
2. Fill in the form:
   - Name: Unique identifier
   - Display Name: Human-readable name
   - Admin URL: PANSHI Admin API URL (e.g., http://PANSHI:9180)
   - Admin Key: PANSHI admin key
   - Description: Optional description
   - Status: Active/Inactive
3. Click **OK**

### Test Connection

Click **Test** button to verify connectivity with the cluster.

### View Cluster Detail

Click **Detail** button to see cluster details with:
- **Upstreams** tab: Manage upstream configurations
- **Routes** tab: Manage route configurations

### Delete Cluster

1. Click **Delete** button
2. Confirm the deletion

## Upstream Management

Upstreams define target servers for load balancing.

### View Upstreams

1. Navigate to a cluster's detail page
2. Click **Upstreams** tab

### Add Upstream

1. Click **Add Upstream** button
2. Fill in the form:
   - Name: Unique identifier
   - Load Balance: roundrobin, weightedroundrobin, iphash, or leastconn
   - Description: Optional
3. Click **OK**

### Edit Upstream

Click **Edit** button to modify upstream settings.

### Delete Upstream

Click **Delete** button to remove an upstream.

## Route Management

### View Routes

1. Navigate to a cluster's detail page
2. Click **Routes** tab

### Add Route

1. Click **Add Route** button
2. Fill in the form:
   - Name: Route identifier
   - URI: URL pattern (e.g., /api/*)
   - Methods: HTTP methods (GET, POST, etc.)
   - Upstream: Optional upstream association
   - Priority: Route priority (higher = preferred)
   - Status: Active/Inactive
   - Description: Optional
3. Click **OK**

### Publish Route

Click **Publish** button to sync route configuration to the cluster.

### View History

Click **History** button to see route change history.

### Delete Route

Click **Delete** button to remove a route.

## Dictionary Management

Dictionaries store system-level enum values.

### View Dictionary Types

Navigate to **Dictionaries** in the sidebar.

### Add Dictionary Type

1. Click **Add Type** button
2. Fill in the form:
   - Code: Unique identifier (e.g., http_method)
   - Name: Display name
   - Description: Optional
   - Status: Active/Inactive
3. Click **OK**

### View Dictionary Data

Click **Data** button next to a type to view its data entries.

## Plugin Configuration

Plugins extend route functionality.

### Built-in Plugins

Access available plugins via API:
```
GET /api/v1/plugins/builtin
```

### Configure Plugins

1. Navigate to a route's detail page
2. Access plugin settings
3. Enable desired plugins and configure their settings

## Logout

Click your username in the header and select **Logout**.