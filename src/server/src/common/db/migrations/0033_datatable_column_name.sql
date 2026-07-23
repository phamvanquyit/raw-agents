-- Marker migration: collapse datatable_columns key+label → name.
-- Actual rebuild runs in db/client ensureDatatableColumnName() because SQLite
-- cannot cleanly branch on "column exists" inside plain SQL migrations.
-- Fresh installs already get the name-only schema from 0032.
SELECT 1;
