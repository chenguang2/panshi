import pytest
from app.models.cluster import Cluster

async def test_create_cluster(test_db):
    cluster = Cluster(
        name="test-cluster",
        display_name="Test Cluster",
        admin_url="http://localhost:9180",
        admin_key="test-key",
        description="A test cluster",
        status=1
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)
    
    assert cluster.id is not None
    assert cluster.name == "test-cluster"
    assert cluster.status == 1

async def test_cluster_default_status(test_db):
    cluster = Cluster(
        name="default-status-cluster",
        admin_url="http://localhost:9180",
        admin_key="key"
    )
    test_db.add(cluster)
    await test_db.commit()
    
    assert cluster.status == 1