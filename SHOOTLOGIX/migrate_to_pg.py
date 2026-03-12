#!/usr/bin/env python3
"""
migrate_to_pg.py — Migrate ShootLogix data from SQLite to PostgreSQL.

Usage:
    DATABASE_URL=postgresql://user:pass@host:5432/dbname python migrate_to_pg.py [--sqlite-path ./shootlogix.db]

This script:
1. Reads all data from the SQLite database
2. Creates the schema on PostgreSQL (via init_db)
3. Copies all rows, preserving IDs and relationships
4. Resets PostgreSQL sequences to match max IDs

Safe to run multiple times: it will skip tables that already have data
unless --force is passed.
"""
import argparse
import os
import sqlite3
import sys
import re

def main():
    parser = argparse.ArgumentParser(description="Migrate ShootLogix SQLite -> PostgreSQL")
    parser.add_argument("--sqlite-path", default=None,
                        help="Path to SQLite database (default: ./shootlogix.db)")
    parser.add_argument("--force", action="store_true",
                        help="Truncate existing PostgreSQL tables before migrating")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without writing to PostgreSQL")
    args = parser.parse_args()

    # Validate DATABASE_URL
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is required.")
        print("Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname python migrate_to_pg.py")
        sys.exit(1)

    # Fix Railway-style postgres:// URLs
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    # Determine SQLite path
    sqlite_path = args.sqlite_path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "shootlogix.db"
    )
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite database not found at {sqlite_path}")
        sys.exit(1)

    print(f"Source:  SQLite  @ {sqlite_path}")
    print(f"Target:  PostgreSQL @ {database_url[:50]}...")
    print(f"Mode:    {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"Force:   {args.force}")
    print()

    # Connect to SQLite
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row

    # Get list of tables from SQLite
    tables = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()]

    print(f"Found {len(tables)} tables in SQLite: {', '.join(tables)}")
    print()

    if args.dry_run:
        for table in tables:
            count = src.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            cols = [r[1] for r in src.execute(f"PRAGMA table_info([{table}])").fetchall()]
            print(f"  {table}: {count} rows, {len(cols)} columns ({', '.join(cols[:5])}{'...' if len(cols) > 5 else ''})")
        print("\nDry run complete. No data was written.")
        src.close()
        return

    # Connect to PostgreSQL
    import psycopg2
    import psycopg2.extras

    pg = psycopg2.connect(database_url)
    pg.autocommit = False

    try:
        # Step 1: Initialize schema on PostgreSQL
        print("Step 1: Initializing PostgreSQL schema via init_db()...")
        # We need to temporarily set DATABASE_URL so init_db uses PostgreSQL
        os.environ["DATABASE_URL"] = database_url
        # Clear any cached module state
        if 'db_compat' in sys.modules:
            del sys.modules['db_compat']
        if 'database' in sys.modules:
            del sys.modules['database']

        from database import init_db
        init_db()
        print("  Schema created successfully.")
        print()

        # Step 2: Get PostgreSQL table list
        pg_cur = pg.cursor()
        pg_cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        )
        pg_tables = [r[0] for r in pg_cur.fetchall()]
        print(f"PostgreSQL has {len(pg_tables)} tables: {', '.join(pg_tables)}")
        print()

        # Step 3: Determine migration order (respect FK dependencies)
        # Tables with no FK deps first, then dependent tables
        migration_order = _topological_sort(src, tables)
        print(f"Migration order: {', '.join(migration_order)}")
        print()

        # Step 4: Migrate data table by table
        total_rows = 0
        for table in migration_order:
            if table not in pg_tables:
                print(f"  SKIP {table} (not in PostgreSQL schema)")
                continue

            # Check if target already has data
            pg_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            existing = pg_cur.fetchone()[0]

            if existing > 0 and not args.force:
                print(f"  SKIP {table} ({existing} rows already in PostgreSQL, use --force to overwrite)")
                continue

            if existing > 0 and args.force:
                pg_cur.execute(f'DELETE FROM "{table}"')
                print(f"  TRUNCATED {table} ({existing} rows removed)")

            # Read all data from SQLite
            rows = src.execute(f"SELECT * FROM [{table}]").fetchall()
            if not rows:
                print(f"  SKIP {table} (empty in SQLite)")
                continue

            cols = rows[0].keys()
            col_names = ', '.join(f'"{c}"' for c in cols)
            placeholders = ', '.join(['%s'] * len(cols))

            # Insert in batches
            batch_size = 500
            inserted = 0
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                values = [tuple(row[c] for c in cols) for row in batch]
                psycopg2.extras.execute_batch(
                    pg_cur,
                    f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders})',
                    values,
                    page_size=batch_size
                )
                inserted += len(batch)

            total_rows += inserted
            print(f"  OK {table}: {inserted} rows migrated")

        pg.commit()
        print(f"\nStep 4 complete: {total_rows} total rows migrated.")
        print()

        # Step 5: Reset sequences for SERIAL columns
        print("Step 5: Resetting PostgreSQL sequences...")
        for table in pg_tables:
            _reset_sequence(pg_cur, table)
        pg.commit()
        print("  Sequences reset.")
        print()

        # Step 6: Verify
        print("Step 6: Verification...")
        mismatches = []
        for table in migration_order:
            if table not in pg_tables:
                continue
            sqlite_count = src.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            pg_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            pg_count = pg_cur.fetchone()[0]
            status = "OK" if sqlite_count == pg_count else "MISMATCH"
            if status == "MISMATCH":
                mismatches.append(table)
            print(f"  {table}: SQLite={sqlite_count}, PostgreSQL={pg_count} [{status}]")

        if mismatches:
            print(f"\nWARNING: {len(mismatches)} table(s) have row count mismatches: {', '.join(mismatches)}")
        else:
            print("\nAll tables match. Migration successful!")

    except Exception as e:
        pg.rollback()
        print(f"\nERROR: Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        pg.close()
        src.close()


def _topological_sort(src, tables):
    """Sort tables in dependency order using SQLite FK info."""
    deps = {}
    for table in tables:
        fks = src.execute(f"PRAGMA foreign_key_list([{table}])").fetchall()
        parent_tables = set()
        for fk in fks:
            parent = fk[2]  # 'table' column in PRAGMA result
            if parent != table and parent in tables:
                parent_tables.add(parent)
        deps[table] = parent_tables

    # Kahn's algorithm
    result = []
    no_deps = [t for t in tables if not deps.get(t)]
    remaining = {t: set(d) for t, d in deps.items() if d}

    while no_deps:
        t = no_deps.pop(0)
        result.append(t)
        for other, other_deps in list(remaining.items()):
            other_deps.discard(t)
            if not other_deps:
                no_deps.append(other)
                del remaining[other]

    # Add any remaining tables (circular deps, shouldn't happen)
    for t in tables:
        if t not in result:
            result.append(t)

    return result


def _reset_sequence(pg_cur, table):
    """Reset the sequence for a table's SERIAL id column to max(id) + 1."""
    try:
        # Check if table has an 'id' column that uses a sequence
        pg_cur.execute(f"""
            SELECT column_default FROM information_schema.columns
            WHERE table_name = %s AND column_name = 'id'
        """, (table,))
        row = pg_cur.fetchone()
        if not row or not row[0] or 'nextval' not in str(row[0]):
            return

        # Extract sequence name from default value like "nextval('table_id_seq'::regclass)"
        seq_match = re.search(r"nextval\('([^']+)'", str(row[0]))
        if not seq_match:
            return

        seq_name = seq_match.group(1)

        # Get max id
        pg_cur.execute(f'SELECT COALESCE(MAX(id), 0) FROM "{table}"')
        max_id = pg_cur.fetchone()[0]

        if max_id > 0:
            pg_cur.execute(f"SELECT setval('{seq_name}', {max_id})")
            print(f"    {table}: sequence {seq_name} -> {max_id}")

    except Exception as e:
        print(f"    {table}: sequence reset skipped ({e})")


if __name__ == "__main__":
    main()
