import pytest
from app.models.cluster import Upstream, UpstreamTarget
from app.schemas.cluster import UpstreamCreate, UpstreamUpdate, UpstreamTargetSchema


class TestUpstreamTargetSchema:
    def test_valid_target_format(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080", weight=100)
        assert t.target == "192.168.1.10:8080"
        assert t.weight == 100

    def test_default_weight(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080")
        assert t.weight == 100

    def test_weight_range_valid(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080", weight=500)
        assert t.weight == 500


class TestUpstreamCreateWithTargets:
    def test_upstream_create_with_targets(self):
        upstream = UpstreamCreate(
            cluster_id=1,
            name="test-upstream",
            load_balance="roundrobin",
            targets=[
                UpstreamTargetSchema(target="192.168.1.10:8080", weight=100),
                UpstreamTargetSchema(target="192.168.1.11:8080", weight=100)
            ]
        )
        assert upstream.name == "test-upstream"
        assert len(upstream.targets) == 2
        assert upstream.targets[0].target == "192.168.1.10:8080"
        assert upstream.targets[1].target == "192.168.1.11:8080"

    def test_upstream_create_without_targets(self):
        upstream = UpstreamCreate(
            cluster_id=1,
            name="test-upstream",
            load_balance="roundrobin"
        )
        assert upstream.targets is None


class TestUpstreamUpdateWithTargets:
    def test_upstream_update_with_targets(self):
        update = UpstreamUpdate(
            name="updated-upstream",
            targets=[
                UpstreamTargetSchema(target="192.168.1.20:9090", weight=200)
            ]
        )
        assert update.name == "updated-upstream"
        assert len(update.targets) == 1
        assert update.targets[0].target == "192.168.1.20:9090"

    def test_upstream_update_targets_none(self):
        update = UpstreamUpdate(targets=None)
        assert update.targets is None


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


async def test_create_upstream_with_multiple_targets(test_db):
    upstream = Upstream(
        cluster_id=1,
        name="multi-target-upstream",
        load_balance="roundrobin"
    )
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)

    targets = [
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.10:8080", weight=100),
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.11:8080", weight=100),
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.12:9090", weight=200)
    ]
    for t in targets:
        test_db.add(t)
    await test_db.commit()

    from sqlalchemy import select
    result = await test_db.execute(
        select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream.id)
    )
    saved_targets = result.scalars().all()

    assert len(saved_targets) == 3
    assert saved_targets[0].target == "192.168.1.10:8080"
    assert saved_targets[2].weight == 200


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