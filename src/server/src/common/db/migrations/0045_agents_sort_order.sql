-- Persist agent order within a team (or ungrouped)
ALTER TABLE agents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Preserve current newest-first order within each team / ungrouped
UPDATE agents SET sort_order = (
  SELECT COUNT(*) FROM agents AS a2
  WHERE IFNULL(a2.team_id, '') = IFNULL(agents.team_id, '')
    AND a2.created_at > agents.created_at
);
