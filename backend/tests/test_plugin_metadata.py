import pytest
from sqlalchemy import select
from app.models.cluster import Cluster, ClusterPluginMetadata, PluginMetadataVersion


class TestClusterPluginMetadataModel:

    async def test_create_plugin_metadata(self, test_db):
        cluster = Cluster(name="test-cluster", display_name="Test")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="ip-restriction",
            config_data='{"whitelist": ["127.0.0.1"]}',
            version=1,
            is_published=0
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        assert plugin.id is not None
        assert plugin.cluster_id == cluster.id
        assert plugin.plugin_name == "ip-restriction"
        assert plugin.version == 1
        assert plugin.is_published == 0
        assert plugin.config_data == '{"whitelist": ["127.0.0.1"]}'

    async def test_plugin_metadata_default_values(self, test_db):
        cluster = Cluster(name="test-cluster-2", display_name="Test 2")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="cors"
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        assert plugin.config_data == "{}"
        assert plugin.version == 1
        assert plugin.is_published == 0

    async def test_plugin_metadata_version_history(self, test_db):
        cluster = Cluster(name="test-cluster-3", display_name="Test 3")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="proxy-rewrite",
            config_data='{"uri": "/v1"}',
            version=1
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        version1 = PluginMetadataVersion(
            cluster_plugin_metadata_id=plugin.id,
            config_data='{"uri": "/v1"}',
            version=1,
            action="create"
        )
        test_db.add(version1)

        version2 = PluginMetadataVersion(
            cluster_plugin_metadata_id=plugin.id,
            config_data='{"uri": "/v2"}',
            version=2,
            action="update"
        )
        test_db.add(version2)
        await test_db.commit()

        from sqlalchemy import select
        result = await test_db.execute(
            select(PluginMetadataVersion).where(
                PluginMetadataVersion.cluster_plugin_metadata_id == plugin.id
            ).order_by(PluginMetadataVersion.version)
        )
        versions = result.scalars().all()

        assert len(versions) == 2
        assert versions[0].action == "create"
        assert versions[1].action == "update"
        assert versions[1].config_data == '{"uri": "/v2"}'

    async def test_plugin_metadata_is_published_flag(self, test_db):
        cluster = Cluster(name="test-cluster-4", display_name="Test 4")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="jwt-auth",
            is_published=1
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        assert plugin.is_published == 1
        assert bool(plugin.is_published) is True

    async def test_plugin_metadata_multiple_plugins_same_cluster(self, test_db):
        cluster = Cluster(name="test-cluster-5", display_name="Test 5")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin1 = ClusterPluginMetadata(cluster_id=cluster.id, plugin_name="ip-restriction")
        plugin2 = ClusterPluginMetadata(cluster_id=cluster.id, plugin_name="cors")
        plugin3 = ClusterPluginMetadata(cluster_id=cluster.id, plugin_name="jwt-auth")

        test_db.add_all([plugin1, plugin2, plugin3])
        await test_db.commit()

        from sqlalchemy import select
        result = await test_db.execute(
            select(ClusterPluginMetadata).where(ClusterPluginMetadata.cluster_id == cluster.id)
        )
        plugins = result.scalars().all()

        assert len(plugins) == 3
        plugin_names = {p.plugin_name for p in plugins}
        assert plugin_names == {"ip-restriction", "cors", "jwt-auth"}

    async def test_plugin_metadata_reset_to_default(self, test_db):
        cluster = Cluster(name="test-cluster-6", display_name="Test 6")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="basic-auth",
            config_data='{"users": [{"user": "admin", "pass": "secret"}]}',
            version=2
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        plugin.config_data = "{}"
        plugin.version = 3
        plugin.is_published = 0
        await test_db.commit()
        await test_db.refresh(plugin)

        assert plugin.config_data == "{}"
        assert plugin.version == 3
        assert plugin.is_published == 0

    async def test_plugin_metadata_version_rollback(self, test_db):
        cluster = Cluster(name="test-cluster-7", display_name="Test 7")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="response-rewrite",
            config_data='{"body": "v3"}',
            version=3,
            is_published=1
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        v1 = PluginMetadataVersion(cluster_plugin_metadata_id=plugin.id, config_data='{"body": "v1"}', version=1, action="create")
        v2 = PluginMetadataVersion(cluster_plugin_metadata_id=plugin.id, config_data='{"body": "v2"}', version=2, action="update")
        v3 = PluginMetadataVersion(cluster_plugin_metadata_id=plugin.id, config_data='{"body": "v3"}', version=3, action="update")
        test_db.add_all([v1, v2, v3])
        await test_db.commit()

        plugin.config_data = v1.config_data
        plugin.version = v1.version
        plugin.is_published = 0
        await test_db.commit()
        await test_db.refresh(plugin)

        assert plugin.config_data == '{"body": "v1"}'
        assert plugin.version == 1
        assert plugin.is_published == 0


class TestPluginMetadataPublishVersion:

    async def test_first_publish_uses_current_version(self, test_db):
        cluster = Cluster(name="test-cluster-pub-1", display_name="Test Publish 1")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="ip-restriction",
            config_data='{"whitelist": ["127.0.0.1"]}',
            version=1,
            is_published=0
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        result = await test_db.execute(
            select(PluginMetadataVersion).where(
                PluginMetadataVersion.cluster_plugin_metadata_id == plugin.id
            )
        )
        existing_versions = result.scalars().all()
        assert len(existing_versions) == 0

        max_version = existing_versions[0].version if existing_versions else 0
        if not existing_versions:
            new_version = 1
        else:
            new_version = max_version + 1

        assert new_version == 1

    async def test_second_publish_increments_version(self, test_db):
        cluster = Cluster(name="test-cluster-pub-2", display_name="Test Publish 2")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="cors",
            config_data='{}',
            version=1,
            is_published=0
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        version1 = PluginMetadataVersion(
            cluster_plugin_metadata_id=plugin.id,
            config_data='{}',
            version=1,
            action="publish"
        )
        test_db.add(version1)
        await test_db.commit()

        result = await test_db.execute(
            select(PluginMetadataVersion).where(
                PluginMetadataVersion.cluster_plugin_metadata_id == plugin.id
            ).order_by(PluginMetadataVersion.version.desc())
        )
        existing_versions = result.scalars().all()
        assert len(existing_versions) == 1

        max_version = existing_versions[0].version if existing_versions else 0
        if not existing_versions:
            new_version = 1
        else:
            new_version = max_version + 1

        assert new_version == 2

    async def test_publish_after_edit_uses_increment(self, test_db):
        cluster = Cluster(name="test-cluster-pub-3", display_name="Test Publish 3")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="jwt-auth",
            config_data='{}',
            version=1,
            is_published=0
        )
        test_db.add(plugin)
        await test_db.commit()
        await test_db.refresh(plugin)

        version1 = PluginMetadataVersion(
            cluster_plugin_metadata_id=plugin.id,
            config_data='{}',
            version=1,
            action="publish"
        )
        test_db.add(version1)
        await test_db.commit()

        plugin.config_data = '{"secret": "new-secret"}'
        plugin.is_published = 0
        await test_db.commit()

        result = await test_db.execute(
            select(PluginMetadataVersion).where(
                PluginMetadataVersion.cluster_plugin_metadata_id == plugin.id
            ).order_by(PluginMetadataVersion.version.desc())
        )
        existing_versions = result.scalars().all()

        max_version = existing_versions[0].version if existing_versions else 0
        if not existing_versions:
            new_version = 1
        else:
            new_version = max_version + 1

        assert new_version == 2

    async def test_multiple_publishes_increment_correctly(self, test_db):
        cluster = Cluster(name="test-cluster-pub-4", display_name="Test Publish 4")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        plugin = ClusterPluginMetadata(
            cluster_id=cluster.id,
            plugin_name="basic-auth",
            config_data='{}',
            version=1,
            is_published=0
        )
        test_db.add(plugin)
        await test_db.commit()

        for expected_version in [1, 2, 3]:
            result = await test_db.execute(
                select(PluginMetadataVersion).where(
                    PluginMetadataVersion.cluster_plugin_metadata_id == plugin.id
                ).order_by(PluginMetadataVersion.version.desc())
            )
            existing_versions = result.scalars().all()

            max_version = existing_versions[0].version if existing_versions else 0
            if not existing_versions:
                new_version = 1
            else:
                new_version = max_version + 1

            assert new_version == expected_version

            version_record = PluginMetadataVersion(
                cluster_plugin_metadata_id=plugin.id,
                config_data='{}',
                version=new_version,
                action="publish"
            )
            test_db.add(version_record)
            await test_db.commit()

            plugin.version = new_version
            plugin.is_published = 1
            await test_db.commit()
