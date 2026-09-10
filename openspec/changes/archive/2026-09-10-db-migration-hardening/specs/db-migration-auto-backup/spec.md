## ADDED Requirements

### Requirement: Automatic backup before migration with confirmed_clear
The system SHALL automatically export a ZIP archive of the source database before performing a migration with `confirmed_clear=True`, saving it to `backend/data/backups/`.

#### Scenario: Backup created before clear migration
- **WHEN** user initiates a migration with `confirmed_clear=True`
- **THEN** the system SHALL create a ZIP archive of the source database at `backend/data/backups/migration_{source_id}_to_{target_id}_{timestamp}.zip` before clearing the target

#### Scenario: Backup directory auto-creation
- **WHEN** the backup directory `backend/data/backups/` does not exist
- **THEN** the system SHALL create the directory automatically

#### Scenario: Backup path returned in migration result
- **WHEN** migration completes successfully with auto-backup
- **THEN** the API response SHALL include the `backup_path` field with the full path to the backup file

### Requirement: Backup retention policy
The system SHALL retain the most recent 10 backup files in the backups directory, deleting older ones automatically.

#### Scenario: Exceeding backup limit
- **WHEN** the backups directory contains more than 10 backup files after a new backup is created
- **THEN** the system SHALL delete the oldest backup files, keeping only the 10 most recent
