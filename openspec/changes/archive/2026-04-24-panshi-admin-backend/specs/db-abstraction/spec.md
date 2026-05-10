## ADDED Requirements

### Requirement: System uses DATABASE_URL environment variable
The system SHALL determine database connection from DATABASE_URL environment variable.

#### Scenario: SQLite in development
- **WHEN** DATABASE_URL is "sqlite:///./data/panshi.db"
- **THEN** system connects to SQLite database at ./data/panshi.db

#### Scenario: PostgreSQL in production
- **WHEN** DATABASE_URL is "postgresql://user:pass@localhost:5432/panshi"
- **THEN** system connects to PostgreSQL database

#### Scenario: DATABASE_URL not set (default)
- **WHEN** DATABASE_URL environment variable is not set
- **THEN** system uses default "sqlite:///./data/panshi.db"

### Requirement: SQLite uses StaticPool for development
The system SHALL use SQLAlchemy StaticPool for SQLite to enable shared connections.

#### Scenario: SQLite connection pooling
- **WHEN** SQLite database is used
- **THEN** system configures StaticPool for connection sharing
- **AND** check_same_thread is set to False

### Requirement: PostgreSQL uses connection pool
The system SHALL use SQLAlchemy default connection pool for PostgreSQL.

#### Scenario: PostgreSQL production config
- **WHEN** PostgreSQL database is used
- **THEN** system uses default QueuePool with configured pool size

### Requirement: Models are database-agnostic
The system SHALL use only SQLAlchemy core types that work with both SQLite and PostgreSQL.

#### Scenario: Integer primary keys
- **WHEN** model defines id as Integer primary key
- **THEN** SQLite creates INTEGER PRIMARY KEY
- **AND** PostgreSQL creates SERIAL PRIMARY KEY

#### Scenario: DateTime columns
- **WHEN** model defines DateTime column
- **THEN** SQLite stores as TEXT ISO format
- **AND** PostgreSQL stores as TIMESTAMP

#### Scenario: JSON columns
- **WHEN** model stores JSON data
- **THEN** SQLite stores as TEXT with JSON serialization
- **AND** PostgreSQL stores as JSONB

### Requirement: All database operations work identically
The system SHALL provide identical API behavior regardless of underlying database.

#### Scenario: CRUD operations
- **WHEN** any CRUD operation is performed
- **THEN** result is identical whether using SQLite or PostgreSQL
- **AND** only connection speed differs

### Requirement: Foreign key constraints work across databases
The system SHALL enforce referential integrity using foreign keys.

#### Scenario: Foreign key on cluster_id
- **WHEN** upstream references cluster_id
- **THEN** PostgreSQL enforces with ON DELETE restriction
- **AND** SQLite enforces with foreign key constraints enabled

### Requirement: Index creation is database-agnostic
The system SHALL create indexes that work on both SQLite and PostgreSQL.

#### Scenario: Index on username
- **WHEN** User model defines index=True on username
- **THEN** SQLite creates index
- **AND** PostgreSQL creates index
