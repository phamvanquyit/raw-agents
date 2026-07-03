-- Backfill: set created_by to the earliest user for agents that have no creator
UPDATE agents
SET created_by = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE created_by IS NULL;
