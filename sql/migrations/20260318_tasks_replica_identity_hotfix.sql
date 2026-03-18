-- Hotfix: unblock logical replication updates/deletes on tasks immediately
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

-- Permanent fix: introduce a stable primary key for tasks
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS task_id BIGSERIAL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tasks_pkey'
          AND conrelid = 'public.tasks'::regclass
    ) THEN
        ALTER TABLE public.tasks
            ADD CONSTRAINT tasks_pkey PRIMARY KEY (task_id);
    END IF;
END $$;

-- Once primary key exists, fall back to default replica identity (the PK)
ALTER TABLE public.tasks REPLICA IDENTITY DEFAULT;
