import pytest
from app.models.cluster import Upstream, UpstreamTarget

async def test_create_upstream(test_db):
    cluster_id = 1
    upstream = Upstream(
        cluster_id=cluster_id,
        name="test-upstream",
        load_balance="roundrobin",
        description="Test upstream"
    )
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)
    
    assert upstream.id is not None
    assert upstream.cluster_id == cluster_id
    assert upstream.load_balance == "roundrobin"

async def test_create_upstream_target(test_db):
    upstream = Upstream(cluster_id=1, name="target-test", load_balance="roundrobin")
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)
    
    target = UpstreamTarget(
        upstream_id=upstream.id,
        target="127.0.0.1:8080",
        weight=100
    )
    test_db.add(target)
    await test_db.commit()
    await test_db.refresh(target)
    
    assert target.id is not None
    assert target.target == "127.0.0.1:8080"
    assert target.weight == 100