-- Add draft_code column to agent_tools for AI-generated code drafts
ALTER TABLE agent_tools ADD COLUMN draft_code TEXT;
