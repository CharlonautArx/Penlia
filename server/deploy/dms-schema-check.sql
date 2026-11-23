WITH expected(table_name, required_columns) AS (
  VALUES
    ('schema_migrations', ARRAY['name:text']),
    ('users', ARRAY['id:uuid', 'username:text', 'password_hash:text', 'name:text', 'bio:text', 'created_at:timestamp with time zone']),
    ('sessions', ARRAY['token_hash:text', 'user_id:uuid', 'expires_at:timestamp with time zone']),
    ('friendships', ARRAY['id:uuid', 'first_user:uuid', 'second_user:uuid', 'requested_by:uuid', 'status:text', 'im_synced:boolean', 'updated_at:timestamp with time zone']),
    ('rate_limits', ARRAY['key:text', 'window_start:timestamp with time zone', 'attempts:integer'])
), incompatible AS (
  SELECT expected.table_name
  FROM expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = expected.table_name
      AND relation.relkind = 'r'
      AND ARRAY(
        SELECT attribute.attname || ':' || pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attnotnull AND NOT attribute.attisdropped
      ) @> expected.required_columns
  )
)
SELECT coalesce('Unexpected Penlia table structure: ' || string_agg(table_name, ', '), '1')::integer AS table_structure_check
FROM incompatible;
